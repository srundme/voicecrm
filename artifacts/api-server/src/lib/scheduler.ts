import { and, eq, lte, gte, inArray, isNotNull } from "drizzle-orm";
import {
  db,
  followUpsTable,
  policiesTable,
  leadsTable,
  callLogsTable,
} from "@workspace/db";
import { triggerCall } from "./call-engine";
import { sendEmail } from "./brevo";
import { ensureApiConfig, DEFAULT_ORG_ID } from "./org";
import { logger } from "./logger";

const TICK_INTERVAL_MS = 60_000;

/**
 * Build Bolna user_data variables for a CALLBACK_REQUESTED call.
 * Passed as {{is_callback}}, {{callback_time}}, {{callback_opening}} template
 * variables so the agent's system prompt can open the call contextually.
 */
function buildCallbackVars(notes: string | null): Record<string, string> {
  // Extract time phrase from stored notes, e.g. "Customer requested callback in 2 minute(s)"
  let callbackTime = "";
  if (notes) {
    const minMatch = notes.match(/in (\d+) minute/i);
    const hrMatch = notes.match(/in (\d+) hour/i);
    const tomorrowMatch = notes.match(/tomorrow/i);
    const laterMatch = notes.match(/2 hours/i);
    if (minMatch) callbackTime = `${minMatch[1]} minute`;
    else if (hrMatch) callbackTime = `${hrMatch[1]} hour`;
    else if (tomorrowMatch) callbackTime = "tomorrow";
    else if (laterMatch) callbackTime = "2 hours";
    else callbackTime = "the requested time";
  }

  // Pre-built Hindi opening line the agent can use directly
  const callbackOpening = callbackTime
    ? `Aapne humhe ${callbackTime} baad call karne ko kaha tha. Kya ab baat kar sakte hain?`
    : `Aapne humhe wapas call karne ko kaha tha. Kya ab baat kar sakte hain?`;

  return {
    is_callback: "true",
    call_type: "callback",           // matches {%- elif call_type == "callback" %} in prompt
    callback_time: callbackTime,
    callback_opening: callbackOpening,
  };
}

const RENEWAL_WINDOW_DAYS = 30;
const TERMINAL_CALL_STATUSES = [
  "COMPLETED",
  "FAILED",
  "NO_ANSWER",
  "BUSY",
  "CANCELLED",
] as const;

let running = false;
let timer: NodeJS.Timeout | null = null;

/**
 * Trigger the call for a single due follow-up. Claims the row by flipping it to
 * IN_PROGRESS before dialing so overlapping ticks cannot double-dial. Reverts to
 * PENDING if the dial fails. Isolated: an error here never affects other rows.
 */
async function processFollowUp(
  followUp: typeof followUpsTable.$inferSelect,
  monthlyAgentId: string | null,
): Promise<void> {
  const agentId =
    followUp.type === "MONTHLY_CHECKIN"
      ? monthlyAgentId
      : followUp.bolna_agent_id;
  if (!agentId) return; // No agent configured yet; leave PENDING for a later tick.

  // Claim the row atomically: only one tick can move PENDING -> IN_PROGRESS.
  const claimed = await db
    .update(followUpsTable)
    .set({ status: "IN_PROGRESS" })
    .where(
      and(
        eq(followUpsTable.id, followUp.id),
        eq(followUpsTable.status, "PENDING"),
      ),
    )
    .returning();
  if (claimed.length === 0) return;

  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, followUp.lead_id));
  if (!lead) {
    await db
      .update(followUpsTable)
      .set({ status: "SKIPPED" })
      .where(eq(followUpsTable.id, followUp.id));
    return;
  }

  // Build extra variables for callback calls so the agent can open with
  // "Ji, aapne mujhe X baad call karne ko kaha tha. Kya ab baat kar sakte hain?"
  const callbackVars =
    followUp.type === "CALLBACK_REQUESTED"
      ? buildCallbackVars(followUp.notes)
      : {};

  const outcome = await triggerCall({
    agentId,
    phone: lead.phone,
    leadId: lead.id,
    callType: followUp.type.toLowerCase(),
    variables: { name: lead.full_name, ...callbackVars },
  });

  if (outcome.success && outcome.call_log_id) {
    await db
      .update(followUpsTable)
      .set({ call_log_id: outcome.call_log_id })
      .where(eq(followUpsTable.id, followUp.id));
  } else {
    // Dial failed — release the claim so a later tick can retry.
    await db
      .update(followUpsTable)
      .set({ status: "PENDING" })
      .where(eq(followUpsTable.id, followUp.id));
    logger.warn(
      { followUpId: followUp.id, error: outcome.error },
      "scheduled follow-up dial failed",
    );
  }
}

async function processDueFollowUps(): Promise<void> {
  const cfg = await ensureApiConfig();
  const due = await db
    .select()
    .from(followUpsTable)
    .where(
      and(
        eq(followUpsTable.org_id, DEFAULT_ORG_ID),
        eq(followUpsTable.status, "PENDING"),
        lte(followUpsTable.scheduled_at, new Date()),
      ),
    );
  for (const followUp of due) {
    try {
      await processFollowUp(followUp, cfg.monthly_checkin_agent_id);
    } catch (err) {
      logger.error(
        { err, followUpId: followUp.id },
        "scheduled follow-up processing failed",
      );
    }
  }
}

/**
 * Mark IN_PROGRESS follow-ups COMPLETED once their linked call reaches a
 * terminal state, closing the loop opened in processFollowUp.
 */
async function completeFinishedFollowUps(): Promise<void> {
  const inFlight = await db
    .select()
    .from(followUpsTable)
    .where(
      and(
        eq(followUpsTable.org_id, DEFAULT_ORG_ID),
        eq(followUpsTable.status, "IN_PROGRESS"),
        isNotNull(followUpsTable.call_log_id),
      ),
    );
  for (const followUp of inFlight) {
    try {
      const [call] = await db
        .select({ status: callLogsTable.status })
        .from(callLogsTable)
        .where(eq(callLogsTable.id, followUp.call_log_id!));
      if (
        call &&
        (TERMINAL_CALL_STATUSES as readonly string[]).includes(call.status)
      ) {
        await db
          .update(followUpsTable)
          .set({ status: "COMPLETED", completed_at: new Date() })
          .where(eq(followUpsTable.id, followUp.id));
      }
    } catch (err) {
      logger.error(
        { err, followUpId: followUp.id },
        "follow-up completion sweep failed",
      );
    }
  }
}

/**
 * Email renewal reminders for active policies whose renewal date falls within
 * the next 30 days. Deduped by creating a RENEWAL_REMINDER follow-up per policy
 * — if one already exists, the policy was already reminded.
 */
async function processRenewalReminders(): Promise<void> {
  const cfg = await ensureApiConfig();
  if (!cfg.email_renewal_reminders) return;

  const now = new Date();
  const horizon = new Date(
    now.getTime() + RENEWAL_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const policies = await db
    .select()
    .from(policiesTable)
    .where(
      and(
        eq(policiesTable.org_id, DEFAULT_ORG_ID),
        eq(policiesTable.status, "ACTIVE"),
        isNotNull(policiesTable.renewal_date),
        gte(policiesTable.renewal_date, now),
        lte(policiesTable.renewal_date, horizon),
      ),
    );

  for (const policy of policies) {
    try {
      const existing = await db
        .select({ id: followUpsTable.id })
        .from(followUpsTable)
        .where(
          and(
            eq(followUpsTable.policy_id, policy.id),
            eq(followUpsTable.type, "RENEWAL_REMINDER"),
          ),
        );
      if (existing.length > 0) continue; // Already reminded.

      const [lead] = await db
        .select()
        .from(leadsTable)
        .where(eq(leadsTable.id, policy.lead_id));
      if (!lead) continue;

      // Record the reminder first so a crash mid-loop cannot double-email.
      await db.insert(followUpsTable).values({
        org_id: DEFAULT_ORG_ID,
        lead_id: lead.id,
        policy_id: policy.id,
        type: "RENEWAL_REMINDER",
        scheduled_at: policy.renewal_date!,
        status: "PENDING",
        notes: "Auto-generated renewal reminder",
      });

      if (lead.email) {
        const renewalLabel = policy.renewal_date!.toLocaleDateString("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
        const premium =
          policy.annual_premium != null
            ? `Rs ${policy.annual_premium.toLocaleString("en-IN")}`
            : "your premium";
        const html = `<p>Namaste ${lead.full_name},</p>
<p>Your policy ${policy.policy_number ?? ""} (${policy.policy_type}) with ${policy.insurer_name ?? "your insurer"} is due for renewal on <strong>${renewalLabel}</strong>.</p>
<p>Renewal amount: ${premium}. Our team will reach out to assist you.</p>
<p>- ${cfg.brevo_sender_name || "VoiceCRM"}</p>`;
        void sendEmail(
          lead.email,
          `Policy renewal due on ${renewalLabel}`,
          html,
        );
      }
    } catch (err) {
      logger.error(
        { err, policyId: policy.id },
        "renewal reminder processing failed",
      );
    }
  }
}

async function tick(): Promise<void> {
  if (running) return; // Prevent overlapping ticks.
  running = true;
  try {
    await processDueFollowUps();
    await completeFinishedFollowUps();
    await processRenewalReminders();
  } catch (err) {
    logger.error({ err }, "scheduler tick failed");
  } finally {
    running = false;
  }
}

/**
 * Start the background scheduler. State lives entirely in the DB (due rows are
 * re-queried each tick), so it is naturally restart-safe — no in-memory queue to
 * lose. Safe to call once on boot.
 */
export function startScheduler(): void {
  if (timer) return;
  timer = setInterval(() => void tick(), TICK_INTERVAL_MS);
  void tick();
  logger.info({ intervalMs: TICK_INTERVAL_MS }, "Background scheduler started");
}
