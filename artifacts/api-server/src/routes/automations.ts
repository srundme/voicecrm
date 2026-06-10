import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, automationsTable } from "@workspace/db";
import {
  ListAutomationsResponse,
  CreateAutomationBody,
  UpdateAutomationParams,
  UpdateAutomationBody,
  DeleteAutomationParams,
} from "@workspace/api-zod";
import { DEFAULT_ORG_ID } from "../lib/org";

const router: IRouter = Router();

router.get("/automations", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(automationsTable)
    .where(eq(automationsTable.org_id, DEFAULT_ORG_ID))
    .orderBy(desc(automationsTable.created_at));
  res.json(ListAutomationsResponse.parse(rows));
});

router.post("/automations", async (req, res): Promise<void> => {
  const parsed = CreateAutomationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { trigger_config, ...rest } = parsed.data;
  const [row] = await db
    .insert(automationsTable)
    .values({
      ...rest,
      trigger_config: (trigger_config ?? {}) as Record<string, unknown>,
      org_id: DEFAULT_ORG_ID,
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/automations/:id", async (req, res): Promise<void> => {
  const params = UpdateAutomationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAutomationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { trigger_config, ...rest } = parsed.data;
  const [row] = await db
    .update(automationsTable)
    .set({
      ...rest,
      ...(trigger_config !== undefined
        ? { trigger_config: trigger_config as Record<string, unknown> }
        : {}),
    })
    .where(
      and(
        eq(automationsTable.id, params.data.id),
        eq(automationsTable.org_id, DEFAULT_ORG_ID),
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Automation not found" });
    return;
  }
  res.json(row);
});

router.delete("/automations/:id", async (req, res): Promise<void> => {
  const params = DeleteAutomationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(automationsTable)
    .where(eq(automationsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
