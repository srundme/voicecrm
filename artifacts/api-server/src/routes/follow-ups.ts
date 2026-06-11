import { Router, type IRouter } from "express";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db, followUpsTable, leadsTable } from "@workspace/db";
import {
  ListFollowUpsQueryParams,
  ListFollowUpsResponse,
  CreateFollowUpBody,
  UpdateFollowUpParams,
  UpdateFollowUpBody,
  DeleteFollowUpParams,
  TriggerFollowUpCallParams,
} from "@workspace/api-zod";
import { DEFAULT_ORG_ID } from "../lib/org";
import { attachLeadNames } from "../lib/serialize";
import { triggerCall } from "../lib/call-engine";
import { notifyCallScheduled } from "../lib/brevo";
import { buildCallbackVars } from "../lib/scheduler";

function formatIst(date: Date): string {
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const router: IRouter = Router();

router.get("/follow-ups", async (req, res): Promise<void> => {
  const q = ListFollowUpsQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  const { status, type, dateFrom, dateTo } = q.data;
  const conditions = [eq(followUpsTable.org_id, DEFAULT_ORG_ID)];
  if (status) conditions.push(eq(followUpsTable.status, status));
  if (type) conditions.push(eq(followUpsTable.type, type));
  if (dateFrom) conditions.push(gte(followUpsTable.scheduled_at, dateFrom));
  if (dateTo) conditions.push(lte(followUpsTable.scheduled_at, dateTo));
  const rows = await db
    .select()
    .from(followUpsTable)
    .where(and(...conditions))
    .orderBy(asc(followUpsTable.scheduled_at));
  res.json(ListFollowUpsResponse.parse(await attachLeadNames(rows)));
});

router.post("/follow-ups", async (req, res): Promise<void> => {
  const parsed = CreateFollowUpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(followUpsTable)
    .values({ ...parsed.data, org_id: DEFAULT_ORG_ID })
    .returning();
  const [lead] = await db
    .select({ phone: leadsTable.phone })
    .from(leadsTable)
    .where(eq(leadsTable.id, row!.lead_id));
  if (lead) {
    void notifyCallScheduled(lead.phone, formatIst(row!.scheduled_at));
  }
  const [withName] = await attachLeadNames([row!]);
  res.status(201).json(withName);
});

router.patch("/follow-ups/:id", async (req, res): Promise<void> => {
  const params = UpdateFollowUpParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateFollowUpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = { ...parsed.data } as Record<string, unknown>;
  if (data["status"] === "COMPLETED" && !("completed_at" in data)) {
    data["completed_at"] = new Date();
  }
  const [row] = await db
    .update(followUpsTable)
    .set(data)
    .where(
      and(
        eq(followUpsTable.id, params.data.id),
        eq(followUpsTable.org_id, DEFAULT_ORG_ID),
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Follow-up not found" });
    return;
  }
  const [withName] = await attachLeadNames([row]);
  res.json(withName);
});

router.delete("/follow-ups/:id", async (req, res): Promise<void> => {
  const params = DeleteFollowUpParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(followUpsTable)
    .where(eq(followUpsTable.id, params.data.id));
  res.sendStatus(204);
});

router.post("/follow-ups/:id/call", async (req, res): Promise<void> => {
  const params = TriggerFollowUpCallParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [followUp] = await db
    .select()
    .from(followUpsTable)
    .where(eq(followUpsTable.id, params.data.id));
  if (!followUp) {
    res.status(404).json({ error: "Follow-up not found" });
    return;
  }
  if (!followUp.bolna_agent_id) {
    res.json({
      success: false,
      call_log_id: null,
      execution_id: null,
      error: "No agent assigned to this follow-up",
    });
    return;
  }
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, followUp.lead_id));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  // Always build callback vars explicitly — the follow-up may already be
  // IN_PROGRESS (claimed by the scheduler) by the time the user hits "Call Now",
  // so buildCallContext will return inbound_known (no PENDING follow-up found).
  // Passing variables directly guarantees the correct callback opening fires.
  const callbackVars =
    followUp.type === "CALLBACK_REQUESTED"
      ? buildCallbackVars(followUp.notes, lead.full_name)
      : {};
  const outcome = await triggerCall({
    agentId: followUp.bolna_agent_id,
    phone: lead.phone,
    leadId: lead.id,
    variables: callbackVars,
  });
  if (outcome.success && outcome.call_log_id) {
    await db
      .update(followUpsTable)
      .set({ status: "IN_PROGRESS", call_log_id: outcome.call_log_id })
      .where(eq(followUpsTable.id, followUp.id));
  }
  res.json(outcome);
});

export default router;
