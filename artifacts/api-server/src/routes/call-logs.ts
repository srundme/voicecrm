import { Router, type IRouter } from "express";
import {
  and,
  desc,
  eq,
  gte,
  lte,
  or,
  ilike,
  count,
  isNotNull,
} from "drizzle-orm";
import { db, callLogsTable } from "@workspace/db";
import {
  ListCallLogsQueryParams,
  ListCallLogsResponse,
  GetCallLogParams,
  GetCallLogResponse,
  UpdateCallLogDispositionParams,
  UpdateCallLogDispositionBody,
  RetryCallParams,
} from "@workspace/api-zod";
import { DEFAULT_ORG_ID } from "../lib/org";
import {
  serializeCallLog,
  serializeCallLogs,
} from "../lib/serialize";
import { triggerCall } from "../lib/call-engine";

const router: IRouter = Router();

router.get("/call-logs", async (req, res): Promise<void> => {
  const q = ListCallLogsQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  const {
    search,
    agentId,
    status,
    dispositionId,
    direction,
    hasRecording,
    dateFrom,
    dateTo,
    page,
    pageSize,
  } = q.data;

  const conditions = [eq(callLogsTable.org_id, DEFAULT_ORG_ID)];
  if (search) {
    const term = `%${search}%`;
    conditions.push(
      or(
        ilike(callLogsTable.phone_number, term),
        ilike(callLogsTable.summary, term),
        ilike(callLogsTable.agent_name, term),
      )!,
    );
  }
  if (agentId) conditions.push(eq(callLogsTable.bolna_agent_id, agentId));
  if (status) conditions.push(eq(callLogsTable.status, status));
  if (dispositionId)
    conditions.push(eq(callLogsTable.disposition_id, dispositionId));
  if (direction) conditions.push(eq(callLogsTable.direction, direction));
  if (hasRecording) conditions.push(isNotNull(callLogsTable.recording_url));
  if (dateFrom) conditions.push(gte(callLogsTable.started_at, dateFrom));
  if (dateTo) conditions.push(lte(callLogsTable.started_at, dateTo));

  const where = and(...conditions);
  const currentPage = page && page > 0 ? page : 1;
  const limit = pageSize && pageSize > 0 ? pageSize : 20;
  const offset = (currentPage - 1) * limit;

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(callLogsTable)
      .where(where)
      .orderBy(desc(callLogsTable.started_at))
      .limit(limit)
      .offset(offset),
    db.select({ c: count() }).from(callLogsTable).where(where),
  ]);

  res.json(
    ListCallLogsResponse.parse({
      data: await serializeCallLogs(rows),
      total: totalRow[0]?.c ?? 0,
      page: currentPage,
      pageSize: limit,
    }),
  );
});

router.get("/call-logs/:id", async (req, res): Promise<void> => {
  const params = GetCallLogParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(callLogsTable)
    .where(eq(callLogsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Call log not found" });
    return;
  }
  res.json(GetCallLogResponse.parse(await serializeCallLog(row)));
});

router.patch(
  "/call-logs/:id/disposition",
  async (req, res): Promise<void> => {
    const params = UpdateCallLogDispositionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateCallLogDispositionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [row] = await db
      .update(callLogsTable)
      .set({ disposition_id: parsed.data.disposition_id })
      .where(eq(callLogsTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Call log not found" });
      return;
    }
    res.json(await serializeCallLog(row));
  },
);

router.post("/call-logs/:id/retry", async (req, res): Promise<void> => {
  const params = RetryCallParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [original] = await db
    .select()
    .from(callLogsTable)
    .where(eq(callLogsTable.id, params.data.id));
  if (!original) {
    res.status(404).json({ error: "Call log not found" });
    return;
  }
  const outcome = await triggerCall({
    agentId: original.bolna_agent_id,
    phone: original.phone_number,
    leadId: original.lead_id,
    agentName: original.agent_name,
    callType: "retry",
    retryOfCallId: original.id,
  });
  if (outcome.success && outcome.call_log_id) {
    await db
      .update(callLogsTable)
      .set({ retry_call_id: outcome.call_log_id })
      .where(eq(callLogsTable.id, original.id));
  }
  res.json(outcome);
});

export default router;
