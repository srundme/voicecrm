import { and, desc, eq, inArray, or } from "drizzle-orm";
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
  callback_opening?: string;
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
 *
 * Pass isInbound=true when this is an inbound call so the callback opening
 * line is never used — inbound callers should always get the inbound greeting,
 * not the outbound "you asked me to call back" script.
 */
export async function buildCallContext(rawPhone: string, isInbound = false): Promise<CallContext> {
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

  // Fetch last 5 calls so we can build a combined summary across multiple
  // short calls (e.g. a 10-min callback request) that individually may lack
  // the rich context from earlier substantive conversations.
  const recentCalls = await db
    .select()
    .from(callLogsTable)
    .where(eq(callLogsTable.lead_id, lead.id))
    .orderBy(desc(callLogsTable.created_at))
    .limit(5);

  const lastCall = recentCalls[0] ?? null;

  // Build combined context from all recent calls that have a meaningful summary
  // (>30 chars). Most-recent first so the agent sees the freshest info at the top.
  const SUMMARY_MIN_LEN = 30;
  const combinedContext = recentCalls
    .filter((c) => (c.summary ?? "").trim().length >= SUMMARY_MIN_LEN)
    .map((c) => c.summary!.trim())
    .join("\n---\n");

  // Include IN_PROGRESS so that callbacks claimed by the scheduler (PENDING→IN_PROGRESS
  // before triggerCall runs) are still detected here and get the right call_type + context.
  const [pendingCallback] = await db
    .select()
    .from(followUpsTable)
    .where(
      and(
        eq(followUpsTable.lead_id, lead.id),
        inArray(followUpsTable.status, ["PENDING", "IN_PROGRESS"]),
        eq(followUpsTable.type, "CALLBACK_REQUESTED"),
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
  const lastExecId = lastCall?.bolna_execution_id ?? "";

  const base = {
    user_name: name,
    gender,
    city,
    insurance_type: insuranceType,
    lead_id: lead.id,
  };

  const HELLO = `Hello. <break time="1s"/>`;

  const insuranceLabel = insuranceType || "insurance";
  const NEW_CALL_OPENING = insuranceType
    ? `${HELLO} Namaskaar ${firstName(name)} ji, main Dhivya baat kar rahi hoon पॉलिसीफाई dot com se. Aapne hamare saath apni details share ki thi ${insuranceLabel} insurance ke baare mein — main usi silsile mein call kar rahi hoon. Kya abhi thodi baat ho sakti hai?`
    : `${HELLO} Namaskaar ${firstName(name)} ji, main Dhivya baat kar rahi hoon पॉलिसीफाई dot com se. Aapne hamare website pe insurance ke liye apni details di thi — main usi baare mein baat karne ke liye call kar rahi hoon. Kya abhi thodi baat ho sakti hai?`;

  // No prior call → fresh outbound prospect.
  if (!lastCall) {
    return {
      ...base,
      call_type: "new",
      context: "",
      opening_line: NEW_CALL_OPENING,
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
      context: combinedContext,
      opening_line: `${HELLO} ${firstName(name)} ji, maafi chahti hoon — lagta hai network ki wajah se call cut ho gayi thi. Main wahan se shuru karti hoon jahan hamne baat chodi thi.`,
      previous_execution_id: lastExecId,
      previous_summary: combinedContext,
    };
  }

  // A callback was explicitly requested and is now due.
  // Skip this branch for inbound calls — when the customer calls us, they should
  // always get the inbound greeting, not the outbound "you asked me to call back" script.
  if (pendingCallback && !isInbound) {
    const callbackOpening = `${HELLO} ${firstName(name)} ji, aapne mujhe baad mein call karne ko kaha tha — maine aapke liye kuch important dhundha tha, bas 2 minute ka kaam hai.`;
    const reasonParts: string[] = [];
    if (pendingCallback.notes) reasonParts.push(pendingCallback.notes);
    if (combinedContext) reasonParts.push(`What you already know from previous calls:\n${combinedContext}`);
    return {
      ...base,
      call_type: "callback",
      context: combinedContext,
      opening_line: callbackOpening,
      callback_opening: callbackOpening,
      callback_reason: reasonParts.join("\n\n"),
      previous_execution_id: lastExecId,
      previous_summary: combinedContext,
    };
  }

  // Known contact calling inbound — greeting is dynamic based on previous call context.
  const first = firstName(name);
  const inboundOpening = buildInboundKnownOpening(HELLO, first, combinedContext, insuranceType, lead.stage);
  return {
    ...base,
    call_type: "inbound_known",
    context: combinedContext,
    opening_line: inboundOpening,
    previous_execution_id: lastExecId,
    policy_number: policy?.policy_number ?? undefined,
    renewal_date: policy?.renewal_date
      ? policy.renewal_date.toISOString().slice(0, 10)
      : undefined,
    account_status: lead.stage,
  };
}

/**
 * Builds a dynamic inbound opening for a known caller based on their last
 * call context. Instead of a generic "Kaise hain aap?" it references what
 * they were discussing so the agent picks up naturally where they left off.
 */
function buildInboundKnownOpening(
  hello: string,
  first: string,
  combinedContext: string,
  insuranceType: string,
  stage: string | null,
): string {
  const name = first ? `${first} ji` : "aap";

  // Lead has an active policy — likely calling about it
  if (stage === "POLICY_ISSUED" || stage === "RENEWED") {
    return `${hello} Namaskaar ${name}, main Dhivya baat kar rahi hoon पॉलिसीफाई se. Aapka call aaya — apni policy ke baare mein kuch poochna tha kya?`;
  }

  // Has previous call summary — reference it directly
  if (combinedContext.trim().length > 30) {
    const insLabel = insuranceType ? `${insuranceType} insurance` : "insurance";
    return `${hello} Namaskaar ${name}, main Dhivya baat kar rahi hoon पॉलिसीफाई se. Humne pichli baar ${insLabel} ke baare mein baat ki thi — aaj main aapki kya help kar sakti hoon?`;
  }

  // Known lead but no rich summary — warm but open-ended
  const insLabel = insuranceType ? `${insuranceType} insurance` : "insurance";
  return `${hello} Namaskaar ${name}, main Dhivya baat kar rahi hoon पॉलिसीफाई se. Aap ${insLabel} ke baare mein baat karna chahte the — batayein, kya help chahiye aapko?`;
}
