import { and, desc, eq, gte, lte, or } from "drizzle-orm";
import {
  db,
  leadsTable,
  policiesTable,
  callLogsTable,
  followUpsTable,
} from "@workspace/db";
import { DEFAULT_ORG_ID } from "./org";
import { normalizePhone } from "./phone";

const DROP_RETRY_WINDOW_MS = 15 * 60 * 1000;
const PENDING_FOLLOWUP_WINDOW_MS = 5 * 60 * 1000;

export type CallContext = {
  call_type:
    | "new"
    | "drop_retry"
    | "callback"
    | "inbound_known"
    | "inbound_new";
  user_name: string;
  gender: string;
  city: string;
  insurance_type: string;
  context: string;
  opening_line: string;
  previous_execution_id: string;
  previous_summary?: string;
  callback_reason?: string;
  policy_number?: string;
  renewal_date?: string;
  account_status?: string;
  lead_id?: string;
};

function firstName(fullName: string): string {
  return (fullName ?? "").trim().split(/\s+/)[0] ?? "";
}

/**
 * Single source of truth for the Unified Context API (Module 5).
 * Used both by the GET/POST /context HTTP endpoint (called by Bolna) and by
 * the call orchestration engine before every outbound call.
 */
export async function buildCallContext(rawPhone: string): Promise<CallContext> {
  const phone = normalizePhone(rawPhone);

  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.org_id, DEFAULT_ORG_ID),
        or(eq(leadsTable.phone, phone), eq(leadsTable.phone_alt, phone)),
      ),
    )
    .limit(1);

  if (!lead) {
    return {
      call_type: "inbound_new",
      user_name: "",
      gender: "",
      city: "",
      insurance_type: "",
      context: "",
      opening_line: "",
      previous_execution_id: "",
    };
  }

  const now = Date.now();

  const [lastCall] = await db
    .select()
    .from(callLogsTable)
    .where(eq(callLogsTable.lead_id, lead.id))
    .orderBy(desc(callLogsTable.created_at))
    .limit(1);

  const [pendingCallback] = await db
    .select()
    .from(followUpsTable)
    .where(
      and(
        eq(followUpsTable.lead_id, lead.id),
        eq(followUpsTable.status, "PENDING"),
        eq(followUpsTable.type, "CALLBACK_REQUESTED"),
        lte(
          followUpsTable.scheduled_at,
          new Date(now + PENDING_FOLLOWUP_WINDOW_MS),
        ),
      ),
    )
    .orderBy(desc(followUpsTable.scheduled_at))
    .limit(1);

  const [policy] = await db
    .select()
    .from(policiesTable)
    .where(eq(policiesTable.lead_id, lead.id))
    .orderBy(desc(policiesTable.created_at))
    .limit(1);

  const name = lead.full_name;
  const gender = (lead.gender ?? "").toLowerCase();
  const city = lead.city ?? "";
  const insuranceType = (lead.insurance_type ?? "").toLowerCase();
  const lastSummary = lastCall?.summary ?? "";
  const lastExecId = lastCall?.bolna_execution_id ?? "";

  const base = {
    user_name: name,
    gender,
    city,
    insurance_type: insuranceType,
    lead_id: lead.id,
  };

  // No prior call → fresh outbound prospect.
  if (!lastCall) {
    return {
      ...base,
      call_type: "new",
      context: "",
      opening_line: "",
      previous_execution_id: "",
    };
  }

  // Last call was a detected drop within the retry window.
  if (
    lastCall.drop_detected &&
    lastCall.created_at &&
    now - lastCall.created_at.getTime() < DROP_RETRY_WINDOW_MS
  ) {
    return {
      ...base,
      call_type: "drop_retry",
      context: lastSummary,
      opening_line: `${firstName(name)} ji, maafi chahta hoon — lagta hai network ki wajah se call cut ho gayi thi. Main wahan se shuru karta hoon jahan hamne baat chodi thi.`,
      previous_execution_id: lastExecId,
      previous_summary: lastSummary,
    };
  }

  // A callback was explicitly requested and is now due.
  if (pendingCallback) {
    return {
      ...base,
      call_type: "callback",
      context: lastSummary,
      opening_line: `${firstName(name)} ji, aapne humse baad mein call karne ko kaha tha. Main wapas aa gaya hoon, kya abhi baat kar sakte hain?`,
      callback_reason: pendingCallback.notes ?? "",
      previous_execution_id: lastExecId,
    };
  }

  // Known contact with history (inbound or outbound-with-history).
  return {
    ...base,
    call_type: "inbound_known",
    context: lastSummary,
    opening_line: "",
    previous_execution_id: lastExecId,
    policy_number: policy?.policy_number ?? undefined,
    renewal_date: policy?.renewal_date
      ? policy.renewal_date.toISOString().slice(0, 10)
      : undefined,
    account_status: lead.stage,
  };
}
