import OpenAI from "openai";
import { eq } from "drizzle-orm";
import { db, leadsTable, type CallLogRow } from "@workspace/db";
import { logger } from "./logger";

const openai = new OpenAI({
  baseURL: process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"],
  apiKey: process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] ?? "dummy",
});

type StageClassification = {
  stage:
    | "CONTACTED"
    | "INTERESTED"
    | "DOCS_PENDING"
    | "POLICY_ISSUED"
    | "COLD"
    | "LOST"
    | "DO_NOT_CALL";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
};

const SYSTEM_PROMPT = `You are an AI assistant analyzing insurance sales call summaries for an Indian insurance agency.

Based on the call summary, classify the lead's stage using ONLY one of these values:
- INTERESTED: Customer showed genuine interest, asked about premiums, benefits, cover, or wants a callback to discuss more
- DOCS_PENDING: Customer agreed to proceed and documents are to be submitted
- POLICY_ISSUED: Customer bought / confirmed the policy
- COLD: Customer is busy, not responsive, or said maybe later — not permanently refusing
- LOST: Customer clearly said not interested, already has insurance and doesn't want more
- DO_NOT_CALL: Customer explicitly said do not call, removed from list, or was rude/abusive
- CONTACTED: Call completed but intent unclear — neutral conversation, no strong signal either way

Rules:
- Prefer INTERESTED over CONTACTED if there are any positive signals
- Prefer COLD over LOST if there's any ambiguity
- Only use LOST or DO_NOT_CALL on very clear refusals
- For very short or dropped calls, use CONTACTED

Return ONLY a JSON object with no other text:
{ "stage": "STAGE_VALUE", "confidence": "HIGH|MEDIUM|LOW", "reason": "one line in English" }`;

export async function classifyLeadStage(
  summary: string | null,
  transcript: string | null,
): Promise<StageClassification | null> {
  const content = summary || transcript;
  if (!content || content.trim().length < 30) return null;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 200,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `CALL SUMMARY:\n${content.slice(0, 2000)}`,
        },
      ],
    });
    const raw = response.choices[0]?.message?.content ?? "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as StageClassification;
  } catch (err) {
    logger.warn({ err }, "Stage classifier: AI response parse failed");
    return null;
  }
}

export async function autoUpdateLeadStage(call: CallLogRow): Promise<void> {
  if (!call.lead_id) return;

  try {
    const [lead] = await db
      .select({ id: leadsTable.id, stage: leadsTable.stage })
      .from(leadsTable)
      .where(eq(leadsTable.id, call.lead_id));

    if (!lead) return;

    const LOCKED_STAGES = ["DOCS_PENDING", "POLICY_ISSUED", "DO_NOT_CALL"];
    if (LOCKED_STAGES.includes(lead.stage)) return;

    const result = await classifyLeadStage(call.summary, call.transcript);
    if (!result || result.confidence === "LOW") return;
    if (result.stage === lead.stage) return;

    await db
      .update(leadsTable)
      .set({ stage: result.stage })
      .where(eq(leadsTable.id, call.lead_id));

    logger.info(
      {
        callId: call.id,
        leadId: call.lead_id,
        from: lead.stage,
        to: result.stage,
        reason: result.reason,
        confidence: result.confidence,
      },
      "Auto-updated lead stage from call summary",
    );
  } catch (err) {
    logger.error({ err, callId: call.id }, "autoUpdateLeadStage failed");
  }
}
