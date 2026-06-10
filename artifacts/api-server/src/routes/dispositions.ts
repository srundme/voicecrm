import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, dispositionsTable } from "@workspace/db";
import {
  ListDispositionsQueryParams,
  ListDispositionsResponse,
  CreateDispositionBody,
  UpdateDispositionParams,
  UpdateDispositionBody,
  DeleteDispositionParams,
} from "@workspace/api-zod";
import { DEFAULT_ORG_ID } from "../lib/org";

const router: IRouter = Router();

router.get("/dispositions", async (req, res): Promise<void> => {
  const q = ListDispositionsQueryParams.safeParse(req.query);
  const agentId = q.success ? q.data.agentId : undefined;
  const conditions = [eq(dispositionsTable.org_id, DEFAULT_ORG_ID)];
  if (agentId) conditions.push(eq(dispositionsTable.bolna_agent_id, agentId));
  const rows = await db
    .select()
    .from(dispositionsTable)
    .where(and(...conditions))
    .orderBy(asc(dispositionsTable.sort_order), asc(dispositionsTable.label));
  res.json(ListDispositionsResponse.parse(rows));
});

router.post("/dispositions", async (req, res): Promise<void> => {
  const parsed = CreateDispositionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(dispositionsTable)
    .values({ ...parsed.data, org_id: DEFAULT_ORG_ID })
    .returning();
  res.status(201).json(row);
});

router.patch("/dispositions/:id", async (req, res): Promise<void> => {
  const params = UpdateDispositionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateDispositionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(dispositionsTable)
    .set({ ...parsed.data })
    .where(eq(dispositionsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Disposition not found" });
    return;
  }
  res.json(row);
});

router.delete("/dispositions/:id", async (req, res): Promise<void> => {
  const params = DeleteDispositionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(dispositionsTable)
    .where(eq(dispositionsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
