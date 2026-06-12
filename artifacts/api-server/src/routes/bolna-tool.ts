import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, leadsTable, callLogsTable, followUpsTable } from "@workspace/db";
import { DEFAULT_ORG_ID, ensureApiConfig } from "../lib/org";
import { normalizePhone } from "../lib/phone";
import { sendSMS } from "../lib/brevo";
import { logger } from "../lib/logger";

const router: IRouter = Router();

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

export default router;
