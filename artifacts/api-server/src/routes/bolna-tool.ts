import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, leadsTable, callLogsTable, followUpsTable } from "@workspace/db";
import { DEFAULT_ORG_ID, ensureApiConfig } from "../lib/org";
import { normalizePhone } from "../lib/phone";
import { sendSMS } from "../lib/brevo";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── In-memory phone digit accumulator (per call session) ─────────────────────
// Keyed by execution_id. Cleared when number is complete or call ends.
const phoneSessionMap = new Map<string, string>();

// ── In-memory referral registry ───────────────────────────────────────────────
// Husband registers wife's name during his call. Wife calls in later and
// Dhivya recognises her by name. Entries expire after 24 hours.
interface PendingReferral {
  wife_name: string;
  husband_name: string;
  insurance_type: string;
  registered_at: number;
}
const referralRegistry = new Map<string, PendingReferral>(); // key = normalised wife name

function cleanExpiredReferrals(): void {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [k, v] of referralRegistry) {
    if (v.registered_at < cutoff) referralRegistry.delete(k);
  }
}

/**
 * Parse a spoken digit chunk into a digit string.
 * Handles: "double 8" → "88", "triple 0" → "000", digit words, plain digits.
 */
function parseSpokenDigits(raw: string): string {
  const r = raw.toLowerCase().trim();

  // Expand "double X" → XX and "triple X" → XXX
  const expanded = r
    .replace(/double\s+(\w+)/g, (_m, d) => `${d}${d}`)
    .replace(/triple\s+(\w+)/g, (_m, d) => `${d}${d}${d}`);

  const wordMap: Record<string, string> = {
    zero: "0", one: "1", two: "2", three: "3", four: "4",
    five: "5", six: "6", seven: "7", eight: "8", nine: "9",
    oh: "0", o: "0",
    // Hindi transliterations
    shunya: "0", ek: "1", do: "2", teen: "3", char: "4",
    paanch: "5", chhe: "6", saat: "7", aath: "8", nau: "9",
  };

  // Replace each token with its digit equivalent
  return expanded
    .split(/[\s,]+/)
    .map((tok) => wordMap[tok] ?? tok.replace(/\D/g, ""))
    .join("")
    .replace(/\D/g, ""); // strip any remaining non-digits
}

/**
 * POST /bolna-tool/collect-phone
 * Dhivya calls this every time the caller speaks digits.
 * Server accumulates, returns progress, and signals when 10 digits are ready.
 *
 * Response shapes:
 *   { status: "collecting", collected: 6, remaining: 4, say: "..." }
 *   { status: "complete",   number: "8904887300", say: "...", spaced: "8 9 0 4 8 8 7 3 0 0" }
 *   { status: "reset",      say: "..." }   ← caller said "start over"
 */
router.post("/bolna-tool/collect-phone", async (req: Request, res: Response): Promise<void> => {
  if (!(await authorizeToolRequest(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { execution_id, digits, reset } = req.body as {
    execution_id?: string;
    digits?: string;
    reset?: boolean;
  };

  const sessionKey = execution_id ?? "default";

  if (reset) {
    phoneSessionMap.delete(sessionKey);
    res.json({ status: "reset", say: "Theek hai, phir se batayein." });
    return;
  }

  if (!digits) {
    res.status(400).json({ error: "digits is required" });
    return;
  }

  const parsed = parseSpokenDigits(digits);
  if (!parsed) {
    res.json({
      status: "collecting",
      collected: (phoneSessionMap.get(sessionKey) ?? "").length,
      remaining: 10 - (phoneSessionMap.get(sessionKey) ?? "").length,
      say: "Kuch samajh nahi aaya — phir se batayein?",
    });
    return;
  }

  const prev = phoneSessionMap.get(sessionKey) ?? "";
  const accumulated = prev + parsed;

  if (accumulated.length > 10) {
    // Too many digits — caller likely restarted. Keep only the latest chunk
    // and restart from there.
    const fresh = parsed.slice(0, 10);
    phoneSessionMap.set(sessionKey, fresh);
    if (fresh.length === 10) {
      const spaced = fresh.split("").join(" ");
      res.json({
        status: "complete",
        number: fresh,
        spaced,
        say: `Main confirm karti hoon: ${spaced}. Kya yeh sahi hai?`,
      });
    } else {
      const remaining = 10 - fresh.length;
      res.json({
        status: "collecting",
        collected: fresh.length,
        remaining,
        say: `Theek hai, phir se note kar rahi hoon. Abhi tak ${fresh.length} digits: ${fresh.split("").join(" ")}. ${remaining} aur chahiye.`,
      });
    }
    return;
  }

  phoneSessionMap.set(sessionKey, accumulated);

  if (accumulated.length === 10) {
    const spaced = accumulated.split("").join(" ");
    res.json({
      status: "complete",
      number: accumulated,
      spaced,
      say: `Main confirm karti hoon: ${spaced}. Kya yeh sahi hai?`,
    });
    return;
  }

  const remaining = 10 - accumulated.length;
  res.json({
    status: "collecting",
    collected: accumulated.length,
    remaining,
    say: `Ji, abhi tak ${accumulated.length} digits mili hain. ${remaining} aur chahiye — aage batayein.`,
  });
});

/**
 * POST /bolna-tool/register-referral
 * Called during the husband's call when he says "I'll give your number to my wife".
 * Dhivya collects the wife's name and stores it so Dhivya can recognise her when
 * she calls in.
 */
router.post("/bolna-tool/register-referral", async (req: Request, res: Response): Promise<void> => {
  if (!(await authorizeToolRequest(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { wife_name, husband_name, insurance_type } = req.body as {
    wife_name?: string;
    husband_name?: string;
    insurance_type?: string;
  };

  if (!wife_name) {
    res.status(400).json({ error: "wife_name is required" });
    return;
  }

  cleanExpiredReferrals();

  const key = wife_name.trim().toLowerCase();
  referralRegistry.set(key, {
    wife_name: wife_name.trim(),
    husband_name: husband_name?.trim() ?? "",
    insurance_type: insurance_type?.trim() ?? "",
    registered_at: Date.now(),
  });

  logger.info({ wife_name, husband_name }, "bolna-tool: referral registered, expecting inbound call");

  res.json({
    success: true,
    say: `Bilkul! ${wife_name.trim()} ji ko mera number de dijiye — jab chahe call kar sakti hain. Main unka wait karungi!`,
  });
});

/**
 * POST /bolna-tool/check-referral
 * Called at the START of an inbound_new call after the caller gives their name.
 * Dhivya checks if this caller was registered as a referral by their husband.
 */
router.post("/bolna-tool/check-referral", async (req: Request, res: Response): Promise<void> => {
  if (!(await authorizeToolRequest(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { caller_name } = req.body as { caller_name?: string };

  if (!caller_name) {
    res.status(400).json({ error: "caller_name is required" });
    return;
  }

  cleanExpiredReferrals();

  const key = caller_name.trim().toLowerCase();

  // Try exact match first, then partial (handles "Anusha" matching "Anusha Devi")
  let match = referralRegistry.get(key);
  if (!match) {
    for (const [k, v] of referralRegistry) {
      if (k.includes(key) || key.includes(k)) {
        match = v;
        referralRegistry.delete(k);
        break;
      }
    }
  } else {
    referralRegistry.delete(key);
  }

  if (!match) {
    res.json({
      match: false,
      say: "",
    });
    return;
  }

  const insPart = match.insurance_type ? `${match.insurance_type} insurance` : "insurance";
  const husbandPart = match.husband_name ? `${match.husband_name} ji` : "aapke ghar se";
  const callerFirst = match.wife_name.split(/\s+/)[0];

  res.json({
    match: true,
    husband_name: match.husband_name,
    insurance_type: match.insurance_type,
    say: `Ahh, ${callerFirst} ji! ${husbandPart} ne bataya tha ki aap call karengi. ${insPart} ke baare mein baat karni thi na — bilkul sahi time par call kiya. Kya ab discuss kar sakte hain?`,
  });
});

async function authorizeToolRequest(req: Request): Promise<boolean> {
  const cfg = await ensureApiConfig();
  const auth = req.headers["authorization"] ?? "";
  return auth === `Bearer ${cfg.context_api_bearer_token}`;
}

/**
 * POST /bolna-tool/update-lead
 * Called by Bolna custom task tool when Dhivya detects clear intent.
 * Updates the lead stage and optionally logs notes.
 */
router.post("/bolna-tool/update-lead", async (req: Request, res: Response): Promise<void> => {
  if (!(await authorizeToolRequest(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { stage, notes, phone, execution_id } = req.body as {
    stage?: string;
    notes?: string;
    phone?: string;
    execution_id?: string;
  };

  if (!stage) {
    res.status(400).json({ error: "stage is required" });
    return;
  }

  const STAGE_MAP: Record<string, string> = {
    interested: "INTERESTED",
    not_interested: "LOST",
    callback_requested: "CONTACTED",
    docs_requested: "DOCS_PENDING",
  };

  const dbStage = STAGE_MAP[stage.toLowerCase()];
  if (!dbStage) {
    res.status(400).json({ error: `Unknown stage: ${stage}` });
    return;
  }

  try {
    let leadId: string | null = null;

    if (phone) {
      const normalized = normalizePhone(phone);
      const [lead] = await db
        .select({ id: leadsTable.id })
        .from(leadsTable)
        .where(and(eq(leadsTable.org_id, DEFAULT_ORG_ID), eq(leadsTable.phone, normalized)))
        .limit(1);
      leadId = lead?.id ?? null;
    }

    if (!leadId && execution_id) {
      const [call] = await db
        .select({ lead_id: callLogsTable.lead_id })
        .from(callLogsTable)
        .where(eq(callLogsTable.bolna_execution_id, execution_id))
        .limit(1);
      leadId = call?.lead_id ?? null;
    }

    if (!leadId) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    await db
      .update(leadsTable)
      .set({
        stage: dbStage as typeof leadsTable.$inferSelect.stage,
        notes: notes ?? undefined,
      })
      .where(eq(leadsTable.id, leadId));

    logger.info({ leadId, stage: dbStage }, "bolna-tool: lead stage updated");
    res.json({ success: true, lead_id: leadId, stage: dbStage });
  } catch (err) {
    logger.error({ err }, "bolna-tool update-lead failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * POST /bolna-tool/transfer-call
 * Called by Bolna when the caller asks to speak with a human agent.
 * Sends an SMS to the configured human agent phone with a summary of the call
 * so they are ready when the transferred call comes in.
 */
router.post("/bolna-tool/transfer-call", async (req: Request, res: Response): Promise<void> => {
  if (!(await authorizeToolRequest(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { phone, execution_id, caller_name, insurance_type, summary } = req.body as {
    phone?: string;
    execution_id?: string;
    caller_name?: string;
    insurance_type?: string;
    summary?: string;
  };

  try {
    const cfg = await ensureApiConfig();

    if (!cfg.human_agent_phone) {
      logger.warn("bolna-tool transfer-call: human_agent_phone not configured");
      res.json({ success: false, reason: "human_agent_phone not configured" });
      return;
    }

    let resolvedName = caller_name ?? "";
    let resolvedInsurance = insurance_type ?? "";
    let resolvedSummary = summary ?? "";

    if (execution_id && (!resolvedName || !resolvedSummary)) {
      const [call] = await db
        .select({
          summary: callLogsTable.summary,
          memory_injected: callLogsTable.memory_injected,
          lead_id: callLogsTable.lead_id,
        })
        .from(callLogsTable)
        .where(eq(callLogsTable.bolna_execution_id, execution_id))
        .limit(1);

      if (call) {
        resolvedSummary = resolvedSummary || call.summary || "";
        const mem = call.memory_injected as Record<string, string> | null;
        resolvedName = resolvedName || mem?.["user_name"] || "";
        resolvedInsurance = resolvedInsurance || mem?.["insurance_type"] || "";

        if (call.lead_id && !resolvedSummary) {
          const [lastCall] = await db
            .select({ summary: callLogsTable.summary })
            .from(callLogsTable)
            .where(eq(callLogsTable.lead_id, call.lead_id))
            .orderBy(desc(callLogsTable.created_at))
            .limit(1);
          resolvedSummary = lastCall?.summary ?? "";
        }
      }
    }

    const namePart = resolvedName ? `Caller: ${resolvedName}` : "Caller: Unknown";
    const insPart = resolvedInsurance ? ` | Insurance: ${resolvedInsurance.toUpperCase()}` : "";
    const summaryPart = resolvedSummary
      ? `\nSummary: ${resolvedSummary.slice(0, 200)}`
      : "";

    const smsText = `[VoiceCRM Transfer]\n${namePart}${insPart}${summaryPart}\n\nCall transferring to you now.`;

    const smsResult = await sendSMS(cfg.human_agent_phone, smsText);

    logger.info(
      { agentPhone: cfg.human_agent_phone, smsResult },
      "bolna-tool: transfer-call SMS sent",
    );

    res.json({ success: true, sms_sent: smsResult.success });
  } catch (err) {
    logger.error({ err }, "bolna-tool transfer-call failed");
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * POST /bolna-tool/refer-call
 * Called by Bolna when the caller says "talk to my wife/husband/family".
 * Collects the referred person's number, creates a lead for them, and
 * schedules an immediate follow-up call with full referral context.
 */
router.post("/bolna-tool/refer-call", async (req: Request, res: Response): Promise<void> => {
  if (!(await authorizeToolRequest(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const {
    referred_phone,
    referred_name,
    relationship,
    caller_name,
    insurance_type,
    execution_id,
  } = req.body as {
    referred_phone?: string;
    referred_name?: string;
    relationship?: string;
    caller_name?: string;
    insurance_type?: string;
    execution_id?: string;
  };

  if (!referred_phone) {
    res.status(400).json({ error: "referred_phone is required" });
    return;
  }

  try {
    const normalized = normalizePhone(referred_phone);
    if (normalized.length !== 10) {
      res.status(400).json({ error: "Invalid phone number" });
      return;
    }

    // Resolve agent from the original call
    let agentId: string | null = null;
    let resolvedCallerName = caller_name ?? "";
    let resolvedInsurance = insurance_type ?? "";

    if (execution_id) {
      const [origCall] = await db
        .select({
          bolna_agent_id: callLogsTable.bolna_agent_id,
          memory_injected: callLogsTable.memory_injected,
        })
        .from(callLogsTable)
        .where(eq(callLogsTable.bolna_execution_id, execution_id))
        .limit(1);

      if (origCall) {
        agentId = origCall.bolna_agent_id;
        const mem = origCall.memory_injected as Record<string, string> | null;
        resolvedCallerName = resolvedCallerName || mem?.["user_name"] || mem?.["name"] || "";
        resolvedInsurance = resolvedInsurance || mem?.["insurance_type"] || "";
      }
    }

    // Find or create a lead for the referred person
    const [existing] = await db
      .select({ id: leadsTable.id, bolna_agent_id_unused: leadsTable.id })
      .from(leadsTable)
      .where(and(eq(leadsTable.org_id, DEFAULT_ORG_ID), eq(leadsTable.phone, normalized)))
      .limit(1);

    let leadId: string;
    if (existing) {
      leadId = existing.id;
    } else {
      const [created] = await db
        .insert(leadsTable)
        .values({
          org_id: DEFAULT_ORG_ID,
          full_name: referred_name || `${resolvedCallerName ? `${relationship || "Family"} of ${resolvedCallerName}` : "Referred Contact"}`,
          phone: normalized,
          insurance_type: (resolvedInsurance || null) as "LIFE" | "HEALTH" | "MOTOR" | "TERM" | "ULIP" | "ENDOWMENT" | "ACCIDENT" | "TRAVEL" | null,
          stage: "NEW",
          source: "REFERRAL",
          notes: `Referred by ${resolvedCallerName || "a caller"} (${relationship || "family member"})`,
        })
        .returning();
      leadId = created!.id;
    }

    // Build referral notes for the opening line
    const relLabel = relationship || "pati/patni";
    const notes = `Referral | referred_by: ${resolvedCallerName} | relationship: ${relLabel} | insurance_type: ${resolvedInsurance}`;

    // Schedule the referral call 3 minutes from now (gives current call time to end)
    const scheduledAt = new Date(Date.now() + 3 * 60 * 1000);

    await db.insert(followUpsTable).values({
      org_id: DEFAULT_ORG_ID,
      lead_id: leadId,
      type: "REFERRAL",
      scheduled_at: scheduledAt,
      bolna_agent_id: agentId ?? "",
      notes,
      status: "PENDING",
    });

    logger.info(
      { leadId, normalized, scheduledAt },
      "bolna-tool: referral call scheduled",
    );

    res.json({
      success: true,
      lead_id: leadId,
      scheduled_at: scheduledAt.toISOString(),
      message: `I will call ${referred_name || "them"} in 3 minutes.`,
    });
  } catch (err) {
    logger.error({ err }, "bolna-tool refer-call failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
