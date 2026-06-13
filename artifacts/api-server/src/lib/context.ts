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
    | "inbound_new"
    | "inbound_after_no_answer"
    | "inbound_after_callback_miss";
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
export async function buildCallContext(rawPhone: string, isInbound = false, agentName = "Dhivya"): Promise<CallContext> {
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
      opening_line: `Hello. <break time="1s"/> Namaskaar, main ${agentName} baat kar rahi hoon Care Health Insurance se. Aap kaise help kar sakti hoon aapki?`,
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

  // Build combined context from all recent calls.
  // Priority order per call:
  //   1. summary (>30 chars)  — best: concise, agent-written
  //   2. transcript excerpt   — fallback: real conversation text
  //   3. metadata stub        — last resort: call happened but content not ready yet
  //      (Bolna processes transcripts async; within ~5 min of a call the transcript
  //       may still be null even though status=COMPLETED. Without this stub the agent
  //       gets context="" and starts completely fresh, forgetting the conversation.)
  const SUMMARY_MIN_LEN = 30;
  const TRANSCRIPT_MIN_LEN = 60;

  const combinedContext = recentCalls
    .filter((c) =>
      c.status === "COMPLETED" ||
      (c.summary ?? "").trim().length >= SUMMARY_MIN_LEN ||
      (c.transcript ?? "").trim().length >= TRANSCRIPT_MIN_LEN,
    )
    .map((c) => {
      const summary = (c.summary ?? "").trim();
      if (summary.length >= SUMMARY_MIN_LEN) return summary;

      const excerpt = (c.transcript ?? "").trim().slice(0, 800);
      if (excerpt.length >= TRANSCRIPT_MIN_LEN) {
        return `[Previous conversation excerpt]\n${excerpt}`;
      }

      // Call completed but Bolna hasn't delivered transcript yet.
      // Build a metadata stub so the agent knows a real conversation happened.
      if (c.status === "COMPLETED") {
        const callDate = c.created_at
          ? c.created_at.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
          : "recently";
        const durStr = c.duration_seconds && c.duration_seconds > 0
          ? ` (${Math.round(c.duration_seconds / 60)} min call)`
          : "";
        const insLabel = (lead.insurance_type ?? "").toLowerCase() || "insurance";
        return `[Previous call on ${callDate}${durStr}: Had a real conversation about ${insLabel}. Full transcript still processing — greet them as a returning customer and ask how you can continue helping them.]`;
      }

      return null;
    })
    .filter((s): s is string => s !== null)
    .join("\n---\n");

  // True if there has been at least one call where the lead actually spoke to
  // the agent (COMPLETED). If all calls are NO_ANSWER/BUSY/FAILED the lead
  // has never had a real conversation with the agent.
  const hasActualConversation = recentCalls.some((c) => c.status === "COMPLETED");

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
    ? `${HELLO} Namaskaar ${firstName(name)} ji, main ${agentName} baat kar rahi hoon Care Health Insurance se. Aapne hamare saath apni details share ki thi ${insuranceLabel} insurance ke baare mein — main usi silsile mein call kar rahi hoon. Kya abhi thodi baat ho sakti hai?`
    : `${HELLO} Namaskaar ${firstName(name)} ji, main ${agentName} baat kar rahi hoon Care Health Insurance se. Aapne hamare website pe insurance ke liye apni details di thi — main usi baare mein baat karne ke liye call kar rahi hoon. Kya abhi thodi baat ho sakti hai?`;

  // No prior call log linked to this lead.
  if (!lastCall) {
    if (isInbound) {
      // Lead exists in DB (form filled) but we've never spoken AND they're calling us inbound.
      // Treat as a warm inbound lead — don't use the outbound "you filled our form" opening.
      const insLabel = insuranceType || "insurance";
      return {
        ...base,
        call_type: "inbound_new",
        context: "",
        opening_line: `Hello. <break time="1s"/> Namaskaar ${firstName(name)} ji, main ${agentName} baat kar rahi hoon Care Health Insurance se. Aap ${insLabel} ke baare mein baat karna chahte the — batayein, kya help chahiye aapko?`,
        previous_execution_id: "",
      };
    }
    // Fresh outbound prospect.
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

  // ── INBOUND: Lead had requested a callback, we tried calling but they missed
  // our call, and now they are calling us back. Acknowledge both the callback
  // request AND that we tried to reach them — "aap khud aa gaye, achha hua!"
  if (isInbound && pendingCallback) {
    const opening = buildCallbackMissedInboundOpening(
      HELLO,
      firstName(name),
      pendingCallback.notes,
      combinedContext,
      insuranceType,
      agentName,
    );
    const reasonParts: string[] = [];
    if (pendingCallback.notes) reasonParts.push(pendingCallback.notes);
    if (combinedContext) reasonParts.push(`What you already know from previous calls:\n${combinedContext}`);
    return {
      ...base,
      call_type: "inbound_after_callback_miss",
      context: combinedContext,
      opening_line: opening,
      callback_reason: reasonParts.join("\n\n"),
      previous_execution_id: lastExecId,
      previous_summary: combinedContext,
    };
  }

  // A callback was explicitly requested and is now due — outbound only.
  // When the customer calls us inbound, they get the inbound_after_callback_miss
  // branch above, not this outbound script.
  if (pendingCallback && !isInbound) {
    const callbackOpening = buildCallbackOpening(HELLO, firstName(name), pendingCallback.notes, combinedContext, insuranceType, agentName);
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

  // ── INBOUND: Lead is calling back after seeing a missed call but the two
  // have NEVER had an actual conversation (all previous attempts were
  // NO_ANSWER / BUSY / FAILED). Give a warm fresh intro that acknowledges
  // the missed call rather than pretending a conversation already happened.
  if (isInbound && !hasActualConversation) {
    const opening = `${HELLO} Namaskaar ${firstName(name)} ji, main ${agentName} baat kar rahi hoon Care Health Insurance se. Aapko hamare number se call aayi thi ${insuranceLabel} insurance ke baare mein — aap khud call kar rahe hain, bahut achha! Kya abhi thodi baat ho sakti hai?`;
    return {
      ...base,
      call_type: "inbound_after_no_answer",
      context: "",
      opening_line: opening,
      previous_execution_id: lastExecId,
    };
  }

  // Known contact calling inbound — greeting is dynamic based on previous call context.
  const first = firstName(name);
  const inboundOpening = buildInboundKnownOpening(HELLO, first, combinedContext, insuranceType, lead.stage, agentName);
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
 * Builds a dynamic callback opening based on the actual reason the callback
 * was scheduled and what was discussed in previous calls.
 * Never uses a fixed generic line — always references the real context.
 */
function buildCallbackOpening(
  hello: string,
  first: string,
  notes: string | null,
  combinedContext: string,
  insuranceType: string,
  agentName: string,
): string {
  const name = first ? `${first} ji` : "aap";
  const insLabel = insuranceType ? `${insuranceType} insurance` : "insurance";

  // Extract the core reason from notes (e.g. "Customer requested callback in 2 hours | activity: discussing term plans")
  const activityMatch = (notes ?? "").match(/activity:\s*(.+)/i);
  const activity = activityMatch?.[1]?.trim();

  // Extract time hint from notes (e.g. "in 2 hours", "in 30 minutes")
  const timeMatch = (notes ?? "").match(/in (\d+) (hour|minute|min)/i);
  const timeHint = timeMatch ? `${timeMatch[1]} ${timeMatch[2]}` : null;

  // Has rich previous call context — reference it specifically
  if (combinedContext.trim().length > 50) {
    if (activity) {
      return `${hello} ${name}, main ${agentName} baat kar rahi hoon Care Health Insurance se. Aapne ${timeHint ? `${timeHint} mein` : "baad mein"} baat karne ko kaha tha — ${activity} ke baare mein aage baat karni thi na? Kya abhi thodi der baat ho sakti hai?`;
    }
    return `${hello} ${name}, main ${agentName} baat kar rahi hoon Care Health Insurance se. Aapne ${timeHint ? `${timeHint} baad` : "baad mein"} call karne ko kaha tha — ${insLabel} ke baare mein humari baat adhoori reh gayi thi. Kya abhi thodi der baat ho sakti hai?`;
  }

  // No rich context — warm generic but still better than the fixed line
  return `${hello} ${name}, main ${agentName} baat kar rahi hoon Care Health Insurance se. Aapne ${timeHint ? `${timeHint} mein` : "thodi der baad"} baat karne ko kaha tha — ${insLabel} ke baare mein kuch important share karna tha. Kya abhi 2 minute hain aapke paas?`;
}

/**
 * Builds the opening for an inbound call where the lead had requested a
 * callback, we attempted the outbound call but they missed it, and now they
 * are calling us back. Acknowledges both the callback request and the missed
 * outbound attempt so the agent can pick up naturally.
 */
function buildCallbackMissedInboundOpening(
  hello: string,
  first: string,
  notes: string | null,
  combinedContext: string,
  insuranceType: string,
  agentName: string,
): string {
  const name = first ? `${first} ji` : "aap";
  const insLabel = insuranceType ? `${insuranceType} insurance` : "insurance";

  const activityMatch = (notes ?? "").match(/activity:\s*(.+)/i);
  const activity = activityMatch?.[1]?.trim();

  if (activity) {
    return `${hello} Namaskaar ${name}, main ${agentName} baat kar rahi hoon Care Health Insurance se. Aapne ${activity} ke baare mein baat karne ko kaha tha — main aapko call karne ki koshish kar rahi thi. Aap khud aa gaye, bahut achha! Batayein, kya discuss karna tha?`;
  }

  if (combinedContext.trim().length > 30) {
    return `${hello} Namaskaar ${name}, main ${agentName} baat kar rahi hoon Care Health Insurance se. Aapne callback request ki thi — main aapko call karne ki koshish kar rahi thi. Aap khud aa gaye! ${insLabel} ke baare mein humari baat adhoori thi — kya abhi baat kar sakte hain?`;
  }

  return `${hello} Namaskaar ${name}, main ${agentName} baat kar rahi hoon Care Health Insurance se. Aapne callback maangi thi — main aapko call kar rahi thi, aap khud aa gaye! Batayein, kya help chahiye?`;
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
  agentName: string,
): string {
  const name = first ? `${first} ji` : "aap";

  // Lead has an active policy — likely calling about it
  if (stage === "POLICY_ISSUED" || stage === "RENEWED") {
    return `${hello} Namaskaar ${name}, main ${agentName} baat kar rahi hoon Care Health Insurance se. Aapka call aaya — apni policy ke baare mein kuch poochna tha kya?`;
  }

  // Has previous call summary — reference it directly
  if (combinedContext.trim().length > 30) {
    const insLabel = insuranceType ? `${insuranceType} insurance` : "insurance";
    return `${hello} Namaskaar ${name}, main ${agentName} baat kar rahi hoon Care Health Insurance se. Humne pichli baar ${insLabel} ke baare mein baat ki thi — aaj main aapki kya help kar sakti hoon?`;
  }

  // Known lead but no rich summary — warm but open-ended
  const insLabel = insuranceType ? `${insuranceType} insurance` : "insurance";
  return `${hello} Namaskaar ${name}, main ${agentName} baat kar rahi hoon Care Health Insurance se. Aap ${insLabel} ke baare mein baat karna chahte the — batayein, kya help chahiye aapko?`;
}
