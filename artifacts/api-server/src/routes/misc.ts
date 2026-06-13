import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, gte, desc } from "drizzle-orm";
import {
  db,
  leadsTable,
  callLogsTable,
  webhookLogsTable,
  campaignsTable,
} from "@workspace/db";
import { DEFAULT_ORG_ID, ensureApiConfig } from "../lib/org";
import { normalizePhone, isValidIndianMobile } from "../lib/phone";
import { buildCallContext } from "../lib/context";
import { liveFeed, type LiveFeedEvent } from "../lib/events";
import { triggerCall, startPolling, maybeScheduleCallback, isProperCallEnding, scheduleDropRetry } from "../lib/call-engine";
import { autoUpdateLeadStage } from "../lib/stage-classifier";
import { runComplianceCheck } from "../lib/compliance";
import {
  bolna,
  mapBolnaStatusToCallStatus,
} from "../lib/bolna";
import { serializeCallLog } from "../lib/serialize";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/live-feed", async (req, res): Promise<void> => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`event: ping\ndata: {}\n\n`);

  const onEvent = (payload: LiveFeedEvent): void => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  liveFeed.on("event", onEvent);

  const heartbeat = setInterval(() => {
    res.write(`event: ping\ndata: {}\n\n`);
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    liveFeed.off("event", onEvent);
    res.end();
  });
});

async function authorizeContext(req: Request): Promise<boolean> {
  const cfg = await ensureApiConfig();
  const header = req.header("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 && token === cfg.context_api_bearer_token;
}

function resolvePhone(req: Request): string | null {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const candidate =
    body["phone"] ??
    body["recipient_phone_number"] ??
    body["caller"] ??
    req.query["contact_number"] ??   // Bolna inbound agent sends this
    req.query["phone"];
  if (!candidate) return null;
  return normalizePhone(String(candidate));
}

async function handleContext(req: Request, res: Response): Promise<void> {
  const rawPhone = String(
    (req.query as Record<string, unknown>)["contact_number"] ??
    (req.query as Record<string, unknown>)["phone"] ??
    ((req.body ?? {}) as Record<string, unknown>)["phone"] ??
    ((req.body ?? {}) as Record<string, unknown>)["recipient_phone_number"] ??
    ((req.body ?? {}) as Record<string, unknown>)["caller"] ?? ""
  );

  logger.info(
    { rawPhone, query: req.query, method: req.method },
    "context: incoming request"
  );

  const phone = resolvePhone(req);
  if (!phone) {
    logger.warn({ rawPhone, query: req.query }, "context: could not resolve phone — returning 400");
    res.status(400).json({ error: "Missing phone" });
    return;
  }

  // Look up the agent name from the request so the opening line uses the right
  // agent name (not a hardcoded fallback) when multiple agents are configured.
  const ctxAgentId = String(
    (req.query as Record<string, unknown>)["agent_id"] ??
    ((req.body ?? {}) as Record<string, unknown>)["agent_id"] ?? ""
  ).trim();
  let ctxAgentName = "Dhivya";
  if (ctxAgentId) {
    const [campaign] = await db
      .select({ agent_name: campaignsTable.agent_name })
      .from(campaignsTable)
      .where(eq(campaignsTable.agent_id, ctxAgentId))
      .limit(1);
    ctxAgentName = campaign?.agent_name ?? "Dhivya";
  }

  // The /context endpoint is only called by Bolna for inbound calls.
  // Always mark isInbound=true so the callback opening is never served to a caller.
  const ctx = await buildCallContext(phone, true, ctxAgentName);

  logger.info(
    {
      phone,
      call_type: ctx.call_type,
      user_name: ctx.user_name,
      hasContext: ctx.context.length > 0,
      contextLen: ctx.context.length,
      opening_line_preview: ctx.opening_line.slice(0, 80),
    },
    "context: serving response to Bolna"
  );

  // ── Create inbound call log at call-start time ────────────────────────────
  // Bolna calls /context at the very start of every inbound call.
  // We use this moment to pre-create a call log so the call appears immediately
  // in the UI — even if the Bolna webhook is not configured / fires late.
  void (async () => {
    try {
      const q = req.query as Record<string, unknown>;
      const b = (req.body ?? {}) as Record<string, unknown>;
      const executionId = String(
        q["run_id"] ?? q["execution_id"] ?? q["call_id"] ??
        b["run_id"] ?? b["execution_id"] ?? b["call_id"] ?? "",
      ).trim();
      const agentId = String(q["agent_id"] ?? b["agent_id"] ?? "").trim();

      if (!executionId || !agentId) {
        logger.info({ executionId, agentId, phone }, "context: no execution_id or agent_id — skipping pre-create");
        return;
      }

      // Check if already exists (idempotent)
      const [existing] = await db
        .select({ id: callLogsTable.id })
        .from(callLogsTable)
        .where(eq(callLogsTable.bolna_execution_id, executionId))
        .limit(1);
      if (existing) return;

      const normalizedPhone = normalizePhone(phone);
      const [lead] = normalizedPhone.length === 10
        ? await db.select({ id: leadsTable.id }).from(leadsTable)
            .where(and(eq(leadsTable.org_id, DEFAULT_ORG_ID), eq(leadsTable.phone, normalizedPhone)))
            .limit(1)
        : [];

      await db.insert(callLogsTable).values({
        org_id: DEFAULT_ORG_ID,
        lead_id: lead?.id ?? null,
        bolna_execution_id: executionId,
        bolna_agent_id: agentId,
        direction: "INBOUND",
        phone_number: normalizedPhone || phone,
        status: "INITIATED",
        call_type: ctx.call_type,
        memory_injected: ctx as unknown as Record<string, unknown>,
      });

      logger.info({ executionId, agentId, phone, leadId: lead?.id ?? null }, "context: pre-created inbound call log");
    } catch (err) {
      logger.error({ err }, "context: failed to pre-create inbound call log");
    }
  })();

  res.json(ctx);
}

router.get("/context", handleContext);
router.post("/context", handleContext);

// ── Debug endpoint ────────────────────────────────────────────────────────────
// GET /api/debug/context?phone=9876543210
// Requires admin session (same cookie as the dashboard).
// Returns the exact JSON payload Bolna would receive for this phone number.
// Use this to test context/memory without making a real call.
router.get("/debug/context", async (req: Request, res: Response): Promise<void> => {
  const { isAuthenticated } = await import("../lib/auth");
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Login to the VoiceCRM dashboard first" });
    return;
  }
  const raw = String(req.query["phone"] ?? "").trim();
  if (!raw) {
    res.status(400).json({ error: "Pass ?phone=9876543210" });
    return;
  }
  const { normalizePhone } = await import("../lib/phone");
  const phone = normalizePhone(raw);
  const { buildCallContext } = await import("../lib/context");
  const direction = String(req.query["direction"] ?? "inbound").toLowerCase();
  const isInbound = direction !== "outbound";
  const ctx = await buildCallContext(phone, isInbound);
  res.json({ _debug: { raw_phone: raw, normalized_phone: phone, direction }, ...ctx });
});

function checkSecret(req: Request, secret: string): boolean {
  const provided = String(req.query["secret"] ?? "");
  return provided.length > 0 && provided === secret;
}

async function logWebhook(
  source: string,
  status: string,
  message: string,
): Promise<void> {
  await db
    .insert(webhookLogsTable)
    .values({ org_id: DEFAULT_ORG_ID, source, status, message });
}

function pickField(
  data: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = data[k];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return null;
}

async function ingestLead(opts: {
  source: "META_ADS" | "WEBSITE_FORM";
  sourceLabel: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  insuranceType: string | null;
  campaignId?: string | null;
  formId?: string | null;
}): Promise<{ ok: boolean; message: string }> {
  if (!opts.fullName || !opts.phone) {
    return { ok: false, message: "Missing name or phone" };
  }
  const phone = normalizePhone(opts.phone);
  if (!isValidIndianMobile(phone)) {
    return { ok: false, message: "Invalid Indian mobile number" };
  }
  const existing = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(and(eq(leadsTable.org_id, DEFAULT_ORG_ID), eq(leadsTable.phone, phone)));
  if (existing[0]) {
    return { ok: false, message: "Duplicate lead" };
  }
  const insType = (opts.insuranceType ?? "").toUpperCase();
  const validInsType = (
    [
      "LIFE",
      "HEALTH",
      "MOTOR",
      "TERM",
      "ULIP",
      "ENDOWMENT",
      "ACCIDENT",
      "TRAVEL",
    ] as const
  ).find((t) => t === insType);
  const [lead] = await db
    .insert(leadsTable)
    .values({
      org_id: DEFAULT_ORG_ID,
      full_name: opts.fullName,
      phone,
      email: opts.email,
      city: opts.city,
      insurance_type: validInsType ?? null,
      source: opts.source,
      source_campaign_id: opts.campaignId ?? null,
      source_form_id: opts.formId ?? null,
    })
    .returning();

  void (async () => {
    try {
      const { automationsTable } = await import("@workspace/db");
      const autos = await db
        .select()
        .from(automationsTable)
        .where(
          and(
            eq(automationsTable.org_id, DEFAULT_ORG_ID),
            eq(automationsTable.type, "AUTO_CALL_ON_LEAD"),
            eq(automationsTable.is_active, true),
          ),
        );
      if (autos[0] && lead) {
        const outcome = await triggerCall({
          agentId: autos[0].bolna_agent_id,
          phone: lead.phone,
          leadId: lead.id,
          callType: "new_lead",
        });
        if (outcome.success) {
          logger.info({ leadId: lead.id, callLogId: outcome.call_log_id }, "auto-call triggered");
        } else {
          logger.error({ leadId: lead.id, error: outcome.error }, "auto-call failed");
        }
      }
    } catch (err) {
      logger.error({ err }, "auto-call after webhook lead failed");
    }
  })();

  return { ok: true, message: `Lead created: ${lead!.id}` };
}

router.get("/webhooks/meta", async (req, res): Promise<void> => {
  const cfg = await ensureApiConfig();
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === cfg.webhook_secret) {
    res.status(200).send(String(challenge ?? ""));
    return;
  }
  res.status(403).json({ error: "Verification failed" });
});

router.post("/webhooks/meta", (req, res): void => {
  res.status(200).send("EVENT_RECEIVED");

  void (async () => {
    try {
      const cfg = await ensureApiConfig();
      if (!checkSecret(req, cfg.webhook_secret)) {
        logger.warn("Meta webhook: invalid secret");
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const fieldData: Record<string, unknown> = {};
      const rawFields = body["field_data"];
      if (Array.isArray(rawFields)) {
        for (const f of rawFields as Record<string, unknown>[]) {
          const name = String(f["name"] ?? "");
          const values = f["values"];
          fieldData[name] = Array.isArray(values) ? values[0] : f["value"];
        }
      }
      const merged = { ...body, ...fieldData };

      const result = await ingestLead({
        source: "META_ADS",
        sourceLabel: "Meta Ads",
        fullName: pickField(merged, ["full_name", "name", "fullName"]),
        phone: pickField(merged, ["phone", "phone_number", "phoneNumber"]),
        email: pickField(merged, ["email"]),
        city: pickField(merged, ["city"]),
        insuranceType: pickField(merged, ["insurance_type", "insuranceType"]),
        campaignId: pickField(merged, ["campaign_id", "campaignId"]),
        formId: pickField(merged, ["form_id", "formId"]),
      });

      await logWebhook("META_ADS", result.ok ? "SUCCESS" : "SKIPPED", result.message);
    } catch (err) {
      logger.error({ err }, "Meta webhook background processing failed");
    }
  })();
});

router.post("/webhooks/website-form", async (req, res): Promise<void> => {
  const cfg = await ensureApiConfig();
  if (!checkSecret(req, cfg.webhook_secret)) {
    res.status(401).json({ error: "Invalid secret" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const result = await ingestLead({
    source: "WEBSITE_FORM",
    sourceLabel: "Website Form",
    fullName: pickField(body, ["full_name", "name", "fullName"]),
    phone: pickField(body, ["phone", "phone_number", "mobile"]),
    email: pickField(body, ["email"]),
    city: pickField(body, ["city"]),
    insuranceType: pickField(body, ["insurance_type", "insuranceType"]),
  });

  await logWebhook(
    "WEBSITE_FORM",
    result.ok ? "SUCCESS" : "SKIPPED",
    result.message,
  );
  res.json({ received: true, ...result });
});

router.post("/webhooks/bolna", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const executionId = String(
    body["execution_id"] ?? body["call_id"] ?? body["id"] ?? "",
  );
  if (!executionId) {
    res.json({ received: true });
    return;
  }

  let [row] = await db
    .select()
    .from(callLogsTable)
    .where(eq(callLogsTable.bolna_execution_id, executionId));

  // Call was made directly from Bolna (not via VoiceCRM) — find or create the log now.
  if (!row) {
    const telephonyData = (body["telephony_data"] ?? {}) as Record<string, unknown>;
    const rawDir = String(body["direction"] ?? telephonyData["direction"] ?? "outbound").toUpperCase();
    const direction = rawDir === "INBOUND" ? "INBOUND" : "OUTBOUND";

    // For inbound: caller's number is in telephony_data.from_number or from_number.
    // For outbound: callee's number is in user_number / telephony_data.to_number.
    const rawPhone = direction === "INBOUND"
      ? String(
          telephonyData["from_number"] ??
          body["from_number"] ??
          body["user_number"] ??
          telephonyData["to_number"] ??
          body["phone_number"] ?? body["phone"] ?? "",
        )
      : String(
          body["user_number"] ??
          telephonyData["to_number"] ??
          body["to"] ?? body["recipient_phone_number"] ?? body["phone_number"] ?? body["phone"] ??
          (body["context_details"] as Record<string, unknown> | null)?.["recipient_phone_number"] ?? "",
        );
    logger.info({ rawPhone, direction, executionId }, "Bolna webhook: phone extraction");
    const phone = normalizePhone(rawPhone);
    const agentId = String(body["agent_id"] ?? body["bolna_agent_id"] ?? "");
    const rawStatus = String(body["status"] ?? "completed");

    if (!agentId) {
      logger.warn({ executionId }, "Bolna webhook: unknown call, no agent_id — skipping");
      res.json({ received: true });
      return;
    }

    // ── For inbound: claim the pre-created INITIATED row (created at context time) ──
    // The context endpoint pre-creates the row without an execution_id because Bolna
    // doesn't send it to the context API. We match by phone + direction + INITIATED
    // within the last 2 hours and stamp the real execution_id onto it.
    if (direction === "INBOUND" && phone.length === 10) {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const [preCreated] = await db
        .select()
        .from(callLogsTable)
        .where(
          and(
            eq(callLogsTable.org_id, DEFAULT_ORG_ID),
            eq(callLogsTable.phone_number, phone),
            eq(callLogsTable.direction, "INBOUND"),
            eq(callLogsTable.status, "INITIATED"),
            gte(callLogsTable.created_at, twoHoursAgo),
          ),
        )
        .orderBy(desc(callLogsTable.created_at))
        .limit(1);

      if (preCreated) {
        // Stamp the real execution_id so subsequent polling/webhooks can find it
        const [claimed] = await db
          .update(callLogsTable)
          .set({ bolna_execution_id: executionId, bolna_agent_id: agentId })
          .where(eq(callLogsTable.id, preCreated.id))
          .returning();
        if (claimed) {
          row = claimed;
          logger.info({ executionId, rowId: claimed.id }, "Bolna webhook: claimed pre-created inbound row");
        }
      }
    }

    // If we still don't have a row, create one now (fallback for non-pre-created calls)
    if (!row) {
      const [lead] = phone.length === 10
        ? await db.select({ id: leadsTable.id }).from(leadsTable)
            .where(and(eq(leadsTable.org_id, DEFAULT_ORG_ID), eq(leadsTable.phone, phone)))
            .limit(1)
        : [];

      const [created] = await db.insert(callLogsTable).values({
        org_id: DEFAULT_ORG_ID,
        lead_id: lead?.id ?? null,
        bolna_execution_id: executionId,
        bolna_agent_id: agentId,
        direction,
        phone_number: phone || rawPhone,
        status: mapBolnaStatusToCallStatus(rawStatus),
        call_type: direction === "INBOUND" ? "inbound_new" : "manual_bolna",
      }).returning();

      if (created) {
        logger.info({ executionId, leadId: lead?.id ?? null }, "Bolna webhook: created call log for external call");
        row = created;
      } else {
        res.json({ received: true });
        return;
      }
    }
  }

  // Bolna sends transcript/summary/recording in the webhook body itself.
  // Extract them here as the primary source — getExecution may not have them
  // ready yet if Bolna processes transcripts asynchronously after the webhook.
  function strField(...keys: string[]): string | null {
    for (const k of keys) {
      const v = body[k];
      if (v != null && String(v).trim() !== "") return String(v);
    }
    return null;
  }
  const bodyTranscript = strField("transcript", "conversation_transcript");
  const bodySummary = strField("summary", "call_summary");

  // telephony_data contains the actual call duration and recording URL
  const td = (body["telephony_data"] ?? {}) as Record<string, unknown>;
  const bodyRecording: string | null =
    (td["recording_url"] != null && String(td["recording_url"]).trim() !== "" ? String(td["recording_url"]) : null) ??
    strField("recording_url", "audio_url");

  // Use telephony_data.duration (actual phone call duration) — NOT conversation_duration
  // which only counts the AI-side speech and is 0 when caller says nothing.
  const bodyDuration: number | null =
    typeof td["duration"] === "number" && (td["duration"] as number) > 0
      ? (td["duration"] as number)
      : typeof body["duration_seconds"] === "number"
      ? (body["duration_seconds"] as number)
      : typeof body["duration"] === "number"
      ? (body["duration"] as number)
      : null;
  const bodyStatus = strField("status") ?? "";
  const bodyEnded = ["completed","stopped","error","failed","busy","no-answer","no_answer","cancelled","canceled"]
    .includes(bodyStatus.toLowerCase());

  const exec = await bolna.getExecution(executionId);
  if (exec.success) {
    const status = mapBolnaStatusToCallStatus(exec.data.status || bodyStatus);

    // Prefer webhook body fields over getExecution when the body has content
    const transcript = bodyTranscript ?? exec.data.transcript ?? null;
    const summary = bodySummary ?? exec.data.summary ?? null;
    const recording_url = bodyRecording ?? exec.data.recording_url ?? null;
    const duration_seconds = bodyDuration ?? exec.data.duration_seconds ?? null;
    const isEnded = exec.data.ended || bodyEnded;

    // Drop = hard failure OR completed but no proper goodbye/refusal in transcript
    const dropDetected =
      !isEnded ? false :
      ["FAILED", "NO_ANSWER", "BUSY", "CANCELLED"].includes(status) ||
      (status === "COMPLETED" && !isProperCallEnding(bodyTranscript, bodySummary));

    const [updated] = await db
      .update(callLogsTable)
      .set({
        status,
        transcript,
        summary,
        recording_url,
        duration_seconds,
        ended_at: isEnded ? new Date() : row.ended_at,
        drop_detected: dropDetected,
      })
      .where(eq(callLogsTable.id, row.id))
      .returning();
    if (updated && !isEnded) {
      startPolling(updated.id, executionId);
    }
    if (updated && isEnded && !dropDetected && status === "COMPLETED") {
      void maybeScheduleCallback(updated);
      void runComplianceCheck(updated);
      void autoUpdateLeadStage(updated);
    }
    if (updated && isEnded && dropDetected) {
      void scheduleDropRetry(updated);
    }
    if (updated) {
      const { emitCallUpdate } = await import("../lib/events");
      emitCallUpdate(await serializeCallLog(updated));
    }
  } else if (bodyEnded) {
    // getExecution failed but the webhook body says call ended — update from body only
    const status = mapBolnaStatusToCallStatus(bodyStatus);
    // Drop = hard failure OR completed but no proper goodbye/refusal in transcript
    const dropDetected =
      ["FAILED", "NO_ANSWER", "BUSY", "CANCELLED"].includes(status) ||
      (status === "COMPLETED" && !isProperCallEnding(bodyTranscript, bodySummary));
    const [updated] = await db
      .update(callLogsTable)
      .set({
        status,
        transcript: bodyTranscript,
        summary: bodySummary,
        recording_url: bodyRecording,
        duration_seconds: bodyDuration,
        ended_at: new Date(),
        drop_detected: dropDetected,
      })
      .where(eq(callLogsTable.id, row.id))
      .returning();
    if (updated && !dropDetected && status === "COMPLETED") {
      void maybeScheduleCallback(updated);
      void runComplianceCheck(updated);
      void autoUpdateLeadStage(updated);
    }
    if (updated && dropDetected) {
      void scheduleDropRetry(updated);
    }
    if (updated) {
      const { emitCallUpdate } = await import("../lib/events");
      emitCallUpdate(await serializeCallLog(updated));
    }
  }
  res.json({ received: true });
});

export default router;
