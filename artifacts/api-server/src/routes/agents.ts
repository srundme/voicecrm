import { Router, type IRouter } from "express";
import { and, eq, gte } from "drizzle-orm";
import { db, callLogsTable } from "@workspace/db";
import {
  TestCallBody,
  SetInboundAgentParams,
  SetInboundAgentBody,
  RemoveInboundAgentParams,
} from "@workspace/api-zod";
import { bolna } from "../lib/bolna";
import { DEFAULT_ORG_ID } from "../lib/org";
import { triggerCall } from "../lib/call-engine";

const router: IRouter = Router();

const ALLOWED_AGENT_IDS = new Set([
  "41cb39b0-92e0-49b4-af8b-4ec238fb798a",
  "f713c97f-daf6-42cc-ba96-87c4d0374c37",
]);

router.get("/agents", async (_req, res): Promise<void> => {
  const result = await bolna.listAgents();
  if (!result.success) {
    res.json({ success: false, error: result.error, data: [] });
    return;
  }
  result.data = result.data.filter((a) => ALLOWED_AGENT_IDS.has(a.id));
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todays = await db
    .select({ agent: callLogsTable.bolna_agent_id })
    .from(callLogsTable)
    .where(
      and(
        eq(callLogsTable.org_id, DEFAULT_ORG_ID),
        gte(callLogsTable.started_at, startOfDay),
      ),
    );
  const counts = new Map<string, number>();
  for (const t of todays) counts.set(t.agent, (counts.get(t.agent) ?? 0) + 1);

  res.json({
    success: true,
    error: null,
    data: result.data.map((a) => ({
      ...a,
      calls_today: counts.get(a.id) ?? 0,
    })),
  });
});

router.post("/agents/test-call", async (req, res): Promise<void> => {
  const parsed = TestCallBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const outcome = await triggerCall({
    agentId: parsed.data.agent_id,
    phone: parsed.data.phone,
    callType: "test",
    variables: { name: parsed.data.name ?? "" },
  });
  res.json(outcome);
});

router.get("/phone-numbers", async (_req, res): Promise<void> => {
  const result = await bolna.listPhoneNumbers();
  if (!result.success) {
    res.json({ success: false, error: result.error, data: [] });
    return;
  }
  res.json({ success: true, error: null, data: result.data });
});

router.post("/phone-numbers/:id/agent", async (req, res): Promise<void> => {
  const params = SetInboundAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = SetInboundAgentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = await bolna.setInboundAgent(
    params.data.id,
    parsed.data.agent_id,
  );
  res.json({
    success: result.success,
    error: result.success ? null : result.error,
  });
});

router.delete("/phone-numbers/:id/agent", async (req, res): Promise<void> => {
  const params = RemoveInboundAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await bolna.removeInboundAgent(params.data.id);
  res.json({
    success: result.success,
    error: result.success ? null : result.error,
  });
});

export default router;
