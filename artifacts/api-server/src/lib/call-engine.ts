import { and, eq, inArray } from "drizzle-orm";
import { db, callLogsTable, leadsTable, followUpsTable, type CallLogRow } from "@workspace/db";
import { bolna, mapBolnaStatusToCallStatus } from "./bolna";
import { normalizePhone } from "./phone";
import { buildCallContext } from "./context";
import { DEFAULT_ORG_ID } from "./org";
import { emitCallUpdate } from "./events";
import { serializeCallLog } from "./serialize";
import { logger } from "./logger";

// ── Callback intent parser ────────────────────────────────────────────────────

const HINDI_NUMS: Record<string, number> = {
  // Roman-script transliterations
  ek: 1, do: 2, teen: 3, char: 4, paanch: 5, chhe: 6, chhah: 6,
  saat: 7, aath: 8, nau: 9, das: 10, gyarah: 11, barah: 12,
  // English
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  // Devanagari script words
  "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5,
  "छह": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10, "ग्यारह": 11, "बारह": 12,
};

function toNum(s: string): number {
  return HINDI_NUMS[s.toLowerCase()] ?? Number(s);
}

const HINDI_NUM_PAT = Object.keys(HINDI_NUMS).join("|");
const NUM_PAT = `(\\d+|${HINDI_NUM_PAT})`;

/** Returns the IST wall-clock Date for a given hour/minute on a given UTC Date */
function istDateTime(base: Date, hour: number, minute = 0): Date {
  const d = new Date(base);
  d.setUTCHours(hour - 5, minute - 30, 0, 0); // IST = UTC+5:30
  return d;
}

/**
 * Parse a callback time hint out of call transcript + summary text.
 * Returns { scheduledAt, notes } if a callback was requested, or null otherwise.
 * All times are anchored to IST.
 */
export function parseCallbackIntent(
  text: string,
  callEndedAt: Date = new Date(),
): { scheduledAt: Date; notes: string } | null {
  if (!text || text.trim().length < 5) return null;

  const lower = text.toLowerCase();

  // Must contain a callback signal — Roman, English, or Devanagari script
  const callbackSignals = [
    // Roman-script Hindi
    "call back", "callback", "call kar", "call karo", "call karen", "call kijiye",
    "call karna", "wapas call", "phir call", "baad mein call", "baad call",
    "bad mein call", "call karti hoon", "call karta hoon", "call karenge",
    "call later", "call again", "call after", "i will call", "will call",
    "call you back", "call back later",
    // Devanagari script
    "कॉल करो", "कॉल कर", "कॉल करूंगा", "कॉल करूंगी", "कॉल करेंगे",
    "कॉल करना", "वापस कॉल", "बाद में कॉल", "कॉल करती", "कॉल करता",
  ];
  if (!callbackSignals.some((s) => text.toLowerCase().includes(s.toLowerCase()) || text.includes(s))) return null;

  // ── Relative: "X minute(s) baad" OR "after/in X minutes" (English summary) ──
  // Pattern 1: number-first  "10 minute baad", "10 minutes after"
  const minRx = new RegExp(
    `${NUM_PAT}\\s*(?:minute|minutes|min|mins|मिनट)\\s*(?:baad|bad|ke baad|after|later|के बाद|बाद)`,
    "i",
  );
  // Pattern 2: word-first "after 10 minutes", "after two minutes", "in 2 minutes"
  const minRxEn = new RegExp(`(?:after|in)\\s+${NUM_PAT}\\s+(?:minute|minutes|min)`, "i");

  const minMatch = lower.match(minRx) ?? text.match(minRxEn);
  if (minMatch) {
    const n = toNum(minMatch[1]!);
    if (!isNaN(n) && n > 0) {
      const scheduledAt = new Date(callEndedAt.getTime() + n * 60 * 1000);
      return { scheduledAt, notes: `Customer requested callback in ${n} minute(s)` };
    }
  }

  // ── Relative: "X ghante/hour(s) baad" OR "after/in X hours" ──────────────
  const hrRx = new RegExp(
    `${NUM_PAT}\\s*(?:ghante|ghanta|hour|hours|hr|hrs|घंटे|घंटा)\\s*(?:baad|bad|ke baad|after|later|के बाद|बाद)`,
    "i",
  );
  const hrRxEn = /(?:after|in)\s+(\d+)\s+(?:hour|hours|hr)/i;

  const hrMatch = lower.match(hrRx) ?? text.match(hrRxEn);
  if (hrMatch) {
    const n = toNum(hrMatch[1]!);
    if (!isNaN(n) && n > 0) {
      const scheduledAt = new Date(callEndedAt.getTime() + n * 60 * 60 * 1000);
      return { scheduledAt, notes: `Customer requested callback in ${n} hour(s)` };
    }
  }

  // ── Tomorrow / kal ────────────────────────────────────────────────────────
  const isTomorrow = /\b(kal|tomorrow|agle din|next day)\b/.test(lower);
  const isDayAfter = /\b(parso|परसों|day after tomorrow)\b/.test(lower);
  const baseDay = new Date(callEndedAt);
  if (isDayAfter) baseDay.setDate(baseDay.getDate() + 2);
  else if (isTomorrow) baseDay.setDate(baseDay.getDate() + 1);

  if (isTomorrow || isDayAfter) {
    // Specific digit time: "2 baje", "14:00", "2:30 pm"
    const digitTimeRx = /(\d{1,2})(?::(\d{2}))?\s*(?:baje|bajey|baj|am\b|pm\b)/i;
    const dtm = lower.match(digitTimeRx);
    if (dtm) {
      let h = Number(dtm[1]);
      const m = dtm[2] ? Number(dtm[2]) : 0;
      if (/pm/i.test(dtm[0]) && h < 12) h += 12;
      if (/am/i.test(dtm[0]) && h === 12) h = 0;
      // If hour looks like afternoon context (≤ 7 and no am/pm), treat as PM
      if (h <= 7 && !/am/i.test(dtm[0])) h += 12;
      return { scheduledAt: istDateTime(baseDay, h, m), notes: `Customer requested callback ${isTomorrow ? "tomorrow" : "day after tomorrow"} at ${h}:${String(m).padStart(2, "0")}` };
    }

    // Hindi time word: "do baje", "teen baje"
    const hindiTimeRx = new RegExp(
      `(${HINDI_NUM_PAT})\\s*(?:baje|bajey|baj|ke baad)`,
      "i",
    );
    const htm = lower.match(hindiTimeRx);
    if (htm) {
      let h = toNum(htm[1]!);
      if (h <= 7) h += 12; // Afternoon default for small numbers
      return { scheduledAt: istDateTime(baseDay, h), notes: `Customer requested callback ${isTomorrow ? "tomorrow" : "day after"} at ${h}:00` };
    }

    // Time-of-day hints
    if (/\b(subah|morning|sawere)\b/.test(lower))
      return { scheduledAt: istDateTime(baseDay, 9), notes: "Customer requested callback tomorrow morning" };
    if (/\b(shaam|evening|sham)\b/.test(lower))
      return { scheduledAt: istDateTime(baseDay, 17), notes: "Customer requested callback tomorrow evening" };
    if (/\b(dopahar|afternoon|duphar)\b/.test(lower))
      return { scheduledAt: istDateTime(baseDay, 14), notes: "Customer requested callback tomorrow afternoon" };
    if (/\b(raat|night)\b/.test(lower))
      return { scheduledAt: istDateTime(baseDay, 20), notes: "Customer requested callback tomorrow night" };

    // Just "kal" with no time → 10 AM IST tomorrow
    return { scheduledAt: istDateTime(baseDay, 10), notes: "Customer requested callback tomorrow (time unspecified, defaulted to 10 AM)" };
  }

  // ── Generic callback request with no time → 2 hours from now ─────────────
  return {
    scheduledAt: new Date(callEndedAt.getTime() + 2 * 60 * 60 * 1000),
    notes: "Customer requested a callback (time unspecified, defaulted to 2 hours)",
  };
}

/**
 * Extract the activity/situation the caller mentioned (e.g. "driving", "meeting")
 * from the user-only transcript so the callback opening can reference it.
 * Returns a short English phrase or null if nothing specific was mentioned.
 */
export function extractCallerActivity(userOnlyTranscript: string): string | null {
  const t = userOnlyTranscript.toLowerCase();

  // Map of patterns → normalised activity label
  const ACTIVITIES: Array<[RegExp, string]> = [
    [/\b(driv(ing|e)|drive kar)\b/, "driving"],
    [/\b(meeting|baithak|conference)\b/, "in a meeting"],
    [/\b(on a call|call pe|call mein)\b/, "on a call"],
    [/\b(eating|khana|lunch|dinner|breakfast|khaana)\b/, "eating"],
    [/\b(busy|vyast)\b/, "busy"],
    [/\b(sleeping|so raha|so rahi)\b/, "sleeping"],
    [/\b(office|kaam|work)\b/, "at work"],
    [/\b(gym|exercise|workout)\b/, "at the gym"],
    [/\b(school|college|class|padhai)\b/, "in class"],
    [/\b(travel(ling|ing)?|trip|safar)\b/, "travelling"],
    [/\b(outside|bahar|out)\b/, "outside"],
  ];

  for (const [rx, label] of ACTIVITIES) {
    if (rx.test(t)) return label;
  }
  return null;
}

export async function maybeScheduleCallback(call: CallLogRow): Promise<void> {
  try {
    // If lead_id is missing (e.g. call made directly from Bolna), try to find
    // the lead by phone number and link it before proceeding.
    let leadId = call.lead_id;
    if (!leadId && call.phone_number) {
      const { normalizePhone } = await import("./phone");
      const normalized = normalizePhone(call.phone_number);
      if (normalized.length === 10) {
        const [found] = await db
          .select({ id: leadsTable.id })
          .from(leadsTable)
          .where(and(eq(leadsTable.org_id, call.org_id), eq(leadsTable.phone, normalized)))
          .limit(1);
        if (found) {
          leadId = found.id;
          // Back-fill lead_id on the call log so future lookups work
          await db
            .update(callLogsTable)
            .set({ lead_id: leadId })
            .where(eq(callLogsTable.id, call.id));
        }
      }
    }

    if (!leadId) return; // Cannot schedule a follow-up without a lead

    // Strip assistant lines from the transcript before parsing so that
    // Dhivya's opening line (which echoes the *previous* callback time,
    // e.g. "aapne humhe 10 minute baad call karne ko kaha tha") cannot
    // shadow the customer's actual new request later in the conversation.
    const userOnlyTranscript = (call.transcript ?? "")
      .split("\n")
      .filter((l) => !/^\s*assistant\s*:/i.test(l))
      .join(" ");
    const text = [userOnlyTranscript, call.summary ?? ""].join(" ");
    const intent = parseCallbackIntent(text, call.ended_at ?? new Date());
    if (!intent) return;

    // Extract what the caller was doing so the callback opening can reference it
    const activity = extractCallerActivity(userOnlyTranscript);
    const notesWithActivity = activity
      ? `${intent.notes} | activity: ${activity}`
      : intent.notes;

    // Dedup: only skip if a PENDING follow-up already exists for this exact call
    // (guards against Bolna double-firing the same webhook within seconds).
    // Do NOT skip if status is IN_PROGRESS or COMPLETED — those mean the
    // previous callback already ran, and the customer is asking for another one.
    const [existing] = await db
      .select({ id: followUpsTable.id })
      .from(followUpsTable)
      .where(
        and(
          eq(followUpsTable.call_log_id, call.id),
          eq(followUpsTable.type, "CALLBACK_REQUESTED"),
          eq(followUpsTable.status, "PENDING"),
        ),
      )
      .limit(1);
    if (existing) return;

    await db.insert(followUpsTable).values({
      org_id: call.org_id,
      lead_id: leadId,
      type: "CALLBACK_REQUESTED",
      scheduled_at: intent.scheduledAt,
      bolna_agent_id: call.bolna_agent_id,
      call_log_id: call.id,
      notes: notesWithActivity,
      status: "PENDING",
    });

    await db
      .update(leadsTable)
      .set({ next_followup_at: intent.scheduledAt })
      .where(eq(leadsTable.id, leadId));

    logger.info(
      { callId: call.id, leadId, scheduledAt: intent.scheduledAt },
      "auto-scheduled callback follow-up from call transcript",
    );
  } catch (err) {
    logger.error({ err, callId: call.id }, "maybeScheduleCallback failed");
  }
}

const POLL_INTERVAL_MS = 6000;
const MAX_POLLS = 120;
const activePolls = new Set<string>();

async function emit(row: CallLogRow): Promise<void> {
  emitCallUpdate(await serializeCallLog(row));
}

export type TriggerOutcome = {
  success: boolean;
  call_log_id: string | null;
  execution_id: string | null;
  error: string | null;
};

export async function triggerCall(opts: {
  agentId: string;
  phone: string;
  leadId?: string | null;
  agentName?: string | null;
  callType?: string | null;
  retryOfCallId?: string | null;
  variables?: Record<string, unknown>;
}): Promise<TriggerOutcome> {
  const phone = normalizePhone(opts.phone);
  if (phone.length !== 10) {
    return {
      success: false,
      call_log_id: null,
      execution_id: null,
      error: "Invalid phone number. A 10-digit Indian mobile number is required.",
    };
  }

  // Fetch unified context (Module 5) and inject it as agent variables so the
  // Bolna agent opens with the right memory/opening line for this contact.
  const context = await buildCallContext(phone);
  const variables = { ...context, ...(opts.variables ?? {}) };
  // Use the merged call_type (callbackVars may override context.call_type to "callback")
  const resolvedCallType = (variables.call_type as string) ?? context.call_type;

  // Resolve agent name from Bolna if not provided by the caller
  let resolvedAgentName = opts.agentName ?? null;
  if (!resolvedAgentName) {
    const agentsResult = await bolna.listAgents();
    if (agentsResult.success) {
      resolvedAgentName =
        agentsResult.data.find((a) => a.id === opts.agentId)?.name ?? null;
    }
  }

  const started = await bolna.startCall({
    agentId: opts.agentId,
    phone,
    variables,
  });

  if (!started.success) {
    return {
      success: false,
      call_log_id: null,
      execution_id: null,
      error: started.error,
    };
  }

  const [row] = await db
    .insert(callLogsTable)
    .values({
      org_id: DEFAULT_ORG_ID,
      lead_id: opts.leadId ?? null,
      bolna_execution_id: started.data.execution_id,
      bolna_agent_id: opts.agentId,
      agent_name: resolvedAgentName,
      direction: "OUTBOUND",
      phone_number: phone,
      status: "INITIATED",
      call_type: opts.retryOfCallId ? "drop_retry" : resolvedCallType,
      memory_injected: variables,
      retry_of_call_id: opts.retryOfCallId ?? null,
    })
    .returning();

  if (opts.leadId) {
    await db
      .update(leadsTable)
      .set({ last_contacted_at: new Date() })
      .where(eq(leadsTable.id, opts.leadId));
  }

  await emit(row!);
  startPolling(row!.id, row!.bolna_execution_id);

  return {
    success: true,
    call_log_id: row!.id,
    execution_id: started.data.execution_id,
    error: null,
  };
}

/**
 * Detects whether a call ended naturally (customer said goodbye / refused / agreed)
 * vs dropped abruptly (network issue, line cut, Bolna silence-timeout).
 *
 * Returns TRUE  → proper ending → no retry needed
 * Returns FALSE → abrupt ending → flag as drop, trigger retry
 *
 * If transcript AND summary are both empty we cannot tell, so we return true
 * (safe default — avoids spamming a customer when Bolna failed to transcribe).
 */
export function isProperCallEnding(
  transcript: string | null | undefined,
  summary: string | null | undefined,
): boolean {
  const text = `${transcript ?? ""} ${summary ?? ""}`.toLowerCase();
  if (text.trim().length < 10) return true;

  const properEndingSignals = [
    // Hindi / Hinglish goodbyes
    "dhanyawad", "shukriya", "khuda hafiz", "ram ram", "alvida",
    "bye", "goodbye", "good bye", "theek hai bye", "acha bye", "ok bye",
    // Refusals — still a valid conversation end, should NOT be retried
    "not interested", "mujhe nahi chahiye", "nahi chahiye", "nahi lena",
    "mujhe nahi lena", "abhi nahi", "interest nahi",
    "galat number", "wrong number", "spam",
    "do not call", "mat karo call", "dobara mat call",
    // Customer acknowledges and will follow up themselves
    "sochta hoon", "sochungi", "sochenge",
    "baad mein batata", "baad mein bataunga", "baad mein bataungi",
    "main soochta", "main sochungi",
    // Callback requested (handled separately by maybeScheduleCallback, not a drop)
    "callback", "call back", "wapas call", "baad mein call",
    // Standard English endings
    "thank you", "thanks", "have a good", "have a nice", "take care",
    // AI-generated summary signals that indicate a complete conversation
    "call ended", "conversation ended", "no further interest",
    "customer requested", "will follow up", "scheduled callback",
    "policy details shared", "information provided", "lead qualified",
    "interested in", "agreed to", "not interested in",
  ];

  return properEndingSignals.some((signal) => text.includes(signal));
}

export function startPolling(callLogId: string, executionId: string): void {
  if (activePolls.has(callLogId)) return;
  activePolls.add(callLogId);
  let polls = 0;

  const tick = async (): Promise<void> => {
    polls += 1;
    const result = await bolna.getExecution(executionId);
    if (!result.success) {
      if (polls >= MAX_POLLS) {
        activePolls.delete(callLogId);
        return;
      }
      setTimeout(tick, POLL_INTERVAL_MS);
      return;
    }

    const exec = result.data;
    const status = mapBolnaStatusToCallStatus(exec.status);
    // Drop = hard failure OR completed but conversation ended abruptly (no goodbye/refusal)
    const dropDetected =
      exec.ended &&
      (status === "FAILED" ||
        status === "NO_ANSWER" ||
        status === "BUSY" ||
        (status === "COMPLETED" && !isProperCallEnding(exec.transcript, exec.summary)));

    const [updated] = await db
      .update(callLogsTable)
      .set({
        status,
        transcript: exec.transcript,
        summary: exec.summary,
        recording_url: exec.recording_url,
        duration_seconds: exec.duration_seconds,
        ended_at: exec.ended ? new Date() : null,
        drop_detected: dropDetected,
        drop_reason: dropDetected ? exec.status : null,
      })
      .where(eq(callLogsTable.id, callLogId))
      .returning();

    if (updated) await emit(updated);

    if (exec.ended || polls >= MAX_POLLS) {
      activePolls.delete(callLogId);
      if (updated && dropDetected) await maybeRetryOnDrop(updated);
      if (updated && !dropDetected && updated.status === "COMPLETED") {
        await maybeAdvanceLeadStage(updated);
        await maybeScheduleCallback(updated);
      }
      return;
    }
    setTimeout(tick, POLL_INTERVAL_MS);
  };

  setTimeout(tick, POLL_INTERVAL_MS);
}

async function maybeAdvanceLeadStage(call: CallLogRow): Promise<void> {
  if (!call.lead_id) return;
  try {
    await db
      .update(leadsTable)
      .set({ stage: "CONTACTED" })
      .where(and(eq(leadsTable.id, call.lead_id), eq(leadsTable.stage, "NEW")));
  } catch (err) {
    logger.error({ err }, "advance-lead-stage failed");
  }
}

async function maybeRetryOnDrop(call: CallLogRow): Promise<void> {
  try {
    const { automationsTable } = await import("@workspace/db");
    const autos = await db
      .select()
      .from(automationsTable)
      .where(
        and(
          eq(automationsTable.org_id, DEFAULT_ORG_ID),
          eq(automationsTable.type, "RETRY_ON_DROP"),
          eq(automationsTable.is_active, true),
        ),
      );
    if (autos.length === 0 || call.retry_of_call_id) return;
    const auto = autos[0]!;
    // Retry with the same agent that placed the original call — no per-rule agent selection.
    const outcome = await triggerCall({
      agentId: call.bolna_agent_id,
      phone: call.phone_number,
      leadId: call.lead_id,
      agentName: call.agent_name,
      callType: "retry",
      retryOfCallId: call.id,
    });
    if (outcome.success && outcome.call_log_id) {
      await db
        .update(callLogsTable)
        .set({ retry_call_id: outcome.call_log_id })
        .where(eq(callLogsTable.id, call.id));
      await db
        .update(automationsTable)
        .set({ last_triggered_at: new Date() })
        .where(eq(automationsTable.id, auto.id));
    }
  } catch (err) {
    logger.error({ err }, "retry-on-drop failed");
  }
}

export async function resumeActiveCalls(): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(callLogsTable)
      .where(
        inArray(callLogsTable.status, [
          "INITIATED",
          "RINGING",
          "IN_PROGRESS",
        ]),
      );
    for (const row of rows) {
      startPolling(row.id, row.bolna_execution_id);
    }
    if (rows.length > 0) {
      logger.info({ count: rows.length }, "Resumed polling for active calls");
    }
  } catch (err) {
    logger.error({ err }, "Failed to resume active calls");
  }
}
