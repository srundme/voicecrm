import OpenAI from "openai";
import { eq } from "drizzle-orm";
import { db, callLogsTable, type CallLogRow, type ComplianceData, type ComplianceCheckResult } from "@workspace/db";
import { logger } from "./logger";

// Replit dev uses AI_INTEGRATIONS_* proxy; Railway production uses OPENAI_API_KEY directly.
const openai = new OpenAI({
  baseURL: process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] ?? undefined,
  apiKey:
    process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] ??
    process.env["OPENAI_API_KEY"] ??
    "dummy",
});

const PASS_THRESHOLD = 80;
const WARNING_THRESHOLD = 60;

const SYSTEM_PROMPT = `You are a compliance auditor for Indian insurance sales calls. Analyze the provided call transcript and evaluate it against IRDAI (Insurance Regulatory and Development Authority of India) and DPDP (Digital Personal Data Protection Act, 2023) regulations.

Return a JSON object with this exact structure:
{
  "irdai_checks": [
    { "id": "agent_id_disclosed", "label": "Agent Identification Disclosed", "passed": true/false, "score": 0-10, "note": "brief reason" },
    { "id": "product_details_shared", "label": "Product Details Shared", "passed": true/false, "score": 0-10, "note": "brief reason" },
    { "id": "exclusions_mentioned", "label": "Exclusions/Waiting Period Mentioned", "passed": true/false, "score": 0-10, "note": "brief reason" },
    { "id": "no_misleading_claims", "label": "No Misleading Claims", "passed": true/false, "score": 0-10, "note": "brief reason" },
    { "id": "no_pressure_tactics", "label": "No Pressure Tactics", "passed": true/false, "score": 0-10, "note": "brief reason" },
    { "id": "consent_to_record", "label": "Recording Consent Mentioned", "passed": true/false, "score": 0-10, "note": "brief reason" },
    { "id": "free_look_period", "label": "Free-Look Period Mentioned", "passed": true/false, "score": 0-10, "note": "brief reason" },
    { "id": "grievance_info", "label": "Grievance/Claim Process Shared", "passed": true/false, "score": 0-10, "note": "brief reason" }
  ],
  "dpdp_checks": [
    { "id": "data_consent", "label": "Consent for Data Collection", "passed": true/false, "score": 0-10, "note": "brief reason" },
    { "id": "purpose_stated", "label": "Purpose of Data Use Stated", "passed": true/false, "score": 0-10, "note": "brief reason" },
    { "id": "data_minimization", "label": "Data Minimization (No Excess Data)", "passed": true/false, "score": 0-10, "note": "brief reason" },
    { "id": "no_sensitive_data_leak", "label": "No Unnecessary Sensitive Data Shared", "passed": true/false, "score": 0-10, "note": "brief reason" }
  ],
  "flags": ["list of specific violations or concerns as short strings"]
}

Scoring guide for each check:
- 10: Clearly and explicitly addressed
- 7-9: Partially addressed or implied
- 4-6: Mentioned briefly or ambiguously
- 1-3: Attempted but inadequate
- 0: Not addressed at all

For short/incomplete transcripts (< 3 turns), mark most IRDAI checks as not applicable with score 5 and note "Short call - insufficient data".
Be lenient on free_look_period and grievance_info for exploratory/discovery calls.
Only return the JSON object, no other text.`;

export async function analyzeCompliance(
  transcript: string,
  summary: string | null,
): Promise<ComplianceData> {
  const content = transcript.length > 8000
    ? transcript.slice(0, 8000) + "\n[transcript truncated]"
    : transcript;

  const userMessage = `TRANSCRIPT:\n${content}\n\nSUMMARY:\n${summary || "Not available"}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 2048,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  let parsed: { irdai_checks?: any[]; dpdp_checks?: any[]; flags?: string[] };
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    logger.warn({ raw }, "Compliance: failed to parse AI response");
    parsed = { irdai_checks: [], dpdp_checks: [], flags: ["AI analysis failed to parse"] };
  }

  const irdaiChecks = (parsed.irdai_checks ?? []) as ComplianceCheckResult[];
  const dpdpChecks = (parsed.dpdp_checks ?? []) as ComplianceCheckResult[];
  const flags = (parsed.flags ?? []) as string[];

  const irdaiScore = irdaiChecks.length > 0
    ? Math.round((irdaiChecks.reduce((s, c) => s + c.score, 0) / (irdaiChecks.length * 10)) * 100)
    : 50;
  const dpdpScore = dpdpChecks.length > 0
    ? Math.round((dpdpChecks.reduce((s, c) => s + c.score, 0) / (dpdpChecks.length * 10)) * 100)
    : 50;

  const overallScore = Math.round((irdaiScore * 0.6) + (dpdpScore * 0.4));
  const status: "PASS" | "WARNING" | "FAIL" =
    overallScore >= PASS_THRESHOLD ? "PASS"
    : overallScore >= WARNING_THRESHOLD ? "WARNING"
    : "FAIL";

  return {
    overall_score: overallScore,
    status,
    irdai_score: irdaiScore,
    dpdp_score: dpdpScore,
    irdai_checks: irdaiChecks,
    dpdp_checks: dpdpChecks,
    flags,
    analyzed_at: new Date().toISOString(),
  };
}

export async function runComplianceCheck(call: CallLogRow, retryCount = 0): Promise<void> {
  // Bolna transcribes async — if the transcript isn't ready yet, retry after 45s.
  if (!call.transcript || call.transcript.trim().length < 50) {
    if (retryCount < 3) {
      const delayMs = (retryCount + 1) * 45_000; // 45s, 90s, 135s
      logger.info({ callId: call.id, retryCount, delayMs }, "Compliance: transcript not ready, will retry");
      setTimeout(async () => {
        const [fresh] = await db.select().from(callLogsTable).where(eq(callLogsTable.id, call.id)).limit(1);
        if (fresh) void runComplianceCheck(fresh, retryCount + 1);
      }, delayMs);
      return;
    }
    // After 3 retries still no transcript — mark as skipped (genuinely short call)
    await db.update(callLogsTable)
      .set({ compliance_status: "SKIPPED" })
      .where(eq(callLogsTable.id, call.id));
    logger.info({ callId: call.id }, "Compliance: skipped — transcript too short after retries");
    return;
  }

  try {
    await db.update(callLogsTable)
      .set({ compliance_status: "PENDING" })
      .where(eq(callLogsTable.id, call.id));

    const result = await analyzeCompliance(call.transcript, call.summary);

    await db.update(callLogsTable)
      .set({
        compliance_status: result.status,
        compliance_score: result.overall_score,
        compliance_data: result,
      })
      .where(eq(callLogsTable.id, call.id));

    logger.info(
      { callId: call.id, status: result.status, score: result.overall_score },
      "Compliance check completed",
    );
  } catch (err) {
    logger.error({ err, callId: call.id }, "Compliance check failed — check OPENAI_API_KEY in Railway env vars");
    await db.update(callLogsTable)
      .set({ compliance_status: "FAILED" })
      .where(eq(callLogsTable.id, call.id));
  }
}
