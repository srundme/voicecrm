import { and, eq, inArray } from "drizzle-orm";
import { db, callLogsTable, leadsTable, type CallLogRow } from "@workspace/db";
import { bolna, mapBolnaStatusToCallStatus } from "./bolna";
import { normalizePhone } from "./phone";
import { buildCallContext } from "./context";
import { DEFAULT_ORG_ID } from "./org";
import { emitCallUpdate } from "./events";
import { serializeCallLog } from "./serialize";
import { logger } from "./logger";

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
      agent_name: opts.agentName ?? null,
      direction: "OUTBOUND",
      phone_number: phone,
      status: "INITIATED",
      call_type: opts.retryOfCallId ? "drop_retry" : context.call_type,
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
    const dropDetected =
      exec.ended &&
      (status === "FAILED" ||
        status === "NO_ANSWER" ||
        status === "BUSY" ||
        (status === "COMPLETED" && (exec.duration_seconds ?? 0) < 10));

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
      if (updated && !dropDetected && updated.status === "COMPLETED") await maybeAdvanceLeadStage(updated);
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
