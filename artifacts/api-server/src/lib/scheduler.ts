import { and, eq, lte, gte, inArray, isNotNull } from "drizzle-orm";
import {
  db,
  followUpsTable,
  policiesTable,
  leadsTable,
  callLogsTable,
  campaignsTable,
  campaignLeadsTable,
} from "@workspace/db";
import type { CampaignRow } from "@workspace/db";
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
export function buildCallbackVars(
  notes: string | null,
  leadName: string = "",
): Record<string, string> {
  let callbackTime = "";
  const first = (leadName ?? "").trim().split(/\s+/)[0] ?? "";
  const nameGreet = first ? `Hello ${first} ji` : "Hello";

  // Extract optional activity the caller mentioned (stored as "| activity: driving")
  const activityMatch = notes?.match(/\|\s*activity:\s*(.+)$/i);
  const activity = activityMatch?.[1]?.trim() ?? null;

  // Helper: build the tail — always ends with "ya baad mein call karun?"
  const tail = "kya ab free hain, ya baad mein call karun?";

  // Helper: activity context clause
  const activityClause = activity
    ? `Aapne kaha tha ki aap ${activity} mein hain — `
    : "";

  let callbackOpening: string;

  if (notes) {
    const minMatch = notes.match(/in (\d+) minute/i);
    const hrMatch = notes.match(/in (\d+) hour/i);
    const tomorrowMatch = notes.match(/\btomorrow\b/i);
    const dayAfterMatch = notes.match(/day after tomorrow/i);
    const unspecifiedMatch = notes.match(/time unspecified/i);

    if (minMatch) {
      const n = minMatch[1];
      callbackTime = `${n} minute`;
      if (activity) {
        callbackOpening = `${nameGreet}, aapne kaha tha ki aap ${activity} mein hain aur ${n} minute baad call karne ko kaha tha — ${tail}`;
      } else {
        callbackOpening = `${nameGreet}, aapne mujhe ${n} minute baad call karne ko kaha tha — ${tail}`;
      }
    } else if (hrMatch) {
      const n = hrMatch[1];
      callbackTime = `${n} hour`;
      if (activity) {
        callbackOpening = `${nameGreet}, aapne kaha tha ki aap ${activity} mein hain aur ${n} ghante baad call karne ko kaha tha — ${tail}`;
      } else {
        callbackOpening = `${nameGreet}, aapne mujhe ${n} ghante baad call karne ko kaha tha — ${tail}`;
      }
    } else if (dayAfterMatch) {
      callbackTime = "day after tomorrow";
      callbackOpening = `${nameGreet}, ${activityClause}aapne mujhe parso call karne ko kaha tha — ${tail}`;
    } else if (tomorrowMatch) {
      callbackTime = "tomorrow";
      callbackOpening = `${nameGreet}, ${activityClause}aapne mujhe kal call karne ko kaha tha — ${tail}`;
    } else if (unspecifiedMatch) {
      callbackTime = "later";
      callbackOpening = `${nameGreet}, ${activityClause}aapne mujhe baad mein call karne ko kaha tha — ${tail}`;
    } else {
      callbackOpening = `${nameGreet}, ${activityClause}aapne mujhe call karne ko kaha tha — ${tail}`;
    }
  } else {
    callbackOpening = `${nameGreet}, aapne mujhe call karne ko kaha tha — ${tail}`;
  }

  return {
    is_callback: "true",
    call_type: "callback",
    callback_time: callbackTime,
    callback_opening: callbackOpening,
    // opening_line must be set here because buildCallContext will see the
    // follow-up as IN_PROGRESS (already claimed) and return inbound_known
    // with opening_line: "" — this override ensures the prompt's first
    // {%- if opening_line %} block fires with the correct callback greeting.
    opening_line: callbackOpening,
    // callback_reason carries the notes so the agent has context even when
    // buildCallContext returns inbound_known instead of callback.
    callback_reason: notes ?? "",
  };
}

/**
 * Build Bolna variables for a REFERRAL call — when the original caller's
 * family member / spouse is being called on their behalf.
 * Notes format: "Referral | referred_by: Prabhu | relationship: wife | insurance_type: health"
 */
export function buildReferralVars(
  notes: string | null,
  referredName: string = "",
): Record<string, string> {
  const referred_by = notes?.match(/referred_by:\s*([^|]+)/i)?.[1]?.trim() ?? "";
  const relationship = notes?.match(/relationship:\s*([^|]+)/i)?.[1]?.trim() ?? "pariwar ke member";
  const insurance_type = notes?.match(/insurance_type:\s*([^|]+)/i)?.[1]?.trim() ?? "";

  const nameGreet = referredName ? `Hello ${referredName.trim().split(/\s+/)[0]} ji` : "Hello";
  const insPart = insurance_type ? `${insurance_type} insurance` : "insurance";
  const referredByPart = referred_by ? `${referred_by} ji` : "unke";

  const opening = `${nameGreet}, main Dhivya hoon Policyfy se. Aapke ${relationship} ${referredByPart} se ${insPart} ke baare mein baat hui thi — unhone aapka number diya taaki main aapko bhi explain kar sakun. Kya abhi baat kar sakte hain?`;

  return {
    call_type: "referred",
    opening_line: opening,
    referral_opening: opening,
    referred_by,
    relationship,
    insurance_type,
  };
}

/**
 * Build Bolna variables for a RETRY_NO_ANSWER call — a scheduled retry after
 * a missed call. Opens warmly without re-introducing from scratch.
 */
export function buildRetryNoAnswerVars(
  leadName: string = "",
): Record<string, string> {
  const first = (leadName ?? "").trim().split(/\s+/)[0] ?? "";
  const nameGreet = first ? `Hello ${first} ji` : "Hello";
  const opening = `${nameGreet}, main Dhivya hoon Policyfy se — thodi der pehle call ki thi, aapka phone busy tha. Kya ab thoda time hai baat karne ka?`;
  return {
    call_type: "retry_no_answer",
    opening_line: opening,
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

  // Skip DND leads and DO_NOT_CALL stage — no outbound calls allowed
  if (lead.is_dnd || lead.stage === "DO_NOT_CALL") {
    await db
      .update(followUpsTable)
      .set({ status: "SKIPPED" })
      .where(eq(followUpsTable.id, followUp.id));
    logger.info({ leadId: lead.id, followUpId: followUp.id }, "Skipped follow-up: lead is DND");
    return;
  }

  // Build extra variables depending on follow-up type
  const extraVars =
    followUp.type === "CALLBACK_REQUESTED"
      ? buildCallbackVars(followUp.notes, lead.full_name)
      : followUp.type === "REFERRAL"
        ? buildReferralVars(followUp.notes, lead.full_name)
        : followUp.type === "RETRY_NO_ANSWER"
          ? buildRetryNoAnswerVars(lead.full_name)
          : {};

  const callTypeMap: Partial<Record<typeof followUp.type, string>> = {
    REFERRAL: "referred",
    RETRY_NO_ANSWER: "retry_no_answer",
  };

  const outcome = await triggerCall({
    agentId,
    phone: lead.phone,
    leadId: lead.id,
    callType: callTypeMap[followUp.type] ?? followUp.type.toLowerCase(),
    variables: { name: lead.full_name, ...extraVars },
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

/**
 * Drive all ACTIVE campaigns: check call window, enforce interval, and dial
 * the next PENDING lead. Claims atomically to prevent double-dials across
 * overlapping ticks. Marks the campaign COMPLETED when no PENDING leads remain.
 */
async function processSingleCampaign(
  campaign: CampaignRow,
  currentTime: string,
  now: Date,
): Promise<void> {
  if (currentTime < campaign.window_start || currentTime >= campaign.window_end) return;

  if (campaign.last_dialed_at) {
    const elapsedMin =
      (now.getTime() - campaign.last_dialed_at.getTime()) / 60_000;
    if (elapsedMin < campaign.interval_minutes) return;
  }

  const [lead] = await db
    .select()
    .from(campaignLeadsTable)
    .where(
      and(
        eq(campaignLeadsTable.campaign_id, campaign.id),
        eq(campaignLeadsTable.status, "PENDING"),
      ),
    )
    .limit(1);

  if (!lead) {
    await db
      .update(campaignsTable)
      .set({ status: "COMPLETED", updated_at: now })
      .where(
        and(
          eq(campaignsTable.id, campaign.id),
          eq(campaignsTable.status, "ACTIVE"),
        ),
      );
    logger.info({ campaignId: campaign.id }, "campaign completed — all leads dialed");
    return;
  }

  const [claimed] = await db
    .update(campaignLeadsTable)
    .set({ status: "IN_PROGRESS" })
    .where(
      and(
        eq(campaignLeadsTable.id, lead.id),
        eq(campaignLeadsTable.status, "PENDING"),
      ),
    )
    .returning();
  if (!claimed) return;

  await db
    .update(campaignsTable)
    .set({ last_dialed_at: now })
    .where(eq(campaignsTable.id, campaign.id));

  const outcome = await triggerCall({
    agentId: campaign.agent_id,
    phone: claimed.phone,
    agentName: campaign.agent_name,
    callType: "campaign",
    variables: {
      name: claimed.full_name,
      is_campaign: "true",
      campaign_name: campaign.name,
    },
  });

  if (outcome.success) {
    await db
      .update(campaignLeadsTable)
      .set({
        status: "CALLED",
        call_log_id: outcome.call_log_id,
        called_at: now,
      })
      .where(eq(campaignLeadsTable.id, claimed.id));
    logger.info(
      { campaignId: campaign.id, phone: claimed.phone },
      "campaign call triggered",
    );
  } else {
    await db
      .update(campaignLeadsTable)
      .set({ status: "FAILED" })
      .where(eq(campaignLeadsTable.id, claimed.id));
    logger.warn(
      { campaignId: campaign.id, phone: claimed.phone, error: outcome.error },
      "campaign call failed",
    );
  }
}

async function processCampaigns(): Promise<void> {
  const now = new Date();
  const istMs = now.getTime() + 5.5 * 60 * 60 * 1000;
  const istNow = new Date(istMs);
  const hh = istNow.getUTCHours().toString().padStart(2, "0");
  const mm = istNow.getUTCMinutes().toString().padStart(2, "0");
  const currentTime = `${hh}:${mm}`;

  const active = await db
    .select()
    .from(campaignsTable)
    .where(
      and(
        eq(campaignsTable.org_id, DEFAULT_ORG_ID),
        eq(campaignsTable.status, "ACTIVE"),
      ),
    );

  for (const campaign of active) {
    try {
      await processSingleCampaign(campaign, currentTime, now);
    } catch (err) {
      logger.error({ err, campaignId: campaign.id }, "campaign tick failed");
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
    await processCampaigns();
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
