import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lte, or, ilike } from "drizzle-orm";
import { db, policiesTable } from "@workspace/db";
import {
  ListPoliciesQueryParams,
  ListPoliciesResponse,
  CreatePolicyBody,
  GetPolicyParams,
  GetPolicyResponse,
  UpdatePolicyParams,
  UpdatePolicyBody,
  DeletePolicyParams,
} from "@workspace/api-zod";
import { DEFAULT_ORG_ID } from "../lib/org";
import { attachLeadNames, leadName } from "../lib/serialize";

const router: IRouter = Router();

router.get("/policies", async (req, res): Promise<void> => {
  const q = ListPoliciesQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  const { search, policyType, status, insurer, renewalFrom, renewalTo } =
    q.data;
  const conditions = [eq(policiesTable.org_id, DEFAULT_ORG_ID)];
  if (search) {
    const term = `%${search}%`;
    conditions.push(
      or(
        ilike(policiesTable.policy_number, term),
        ilike(policiesTable.insurer_name, term),
      )!,
    );
  }
  if (policyType) conditions.push(eq(policiesTable.policy_type, policyType));
  if (status) conditions.push(eq(policiesTable.status, status));
  if (insurer) conditions.push(ilike(policiesTable.insurer_name, `%${insurer}%`));
  if (renewalFrom) conditions.push(gte(policiesTable.renewal_date, renewalFrom));
  if (renewalTo) conditions.push(lte(policiesTable.renewal_date, renewalTo));

  const rows = await db
    .select()
    .from(policiesTable)
    .where(and(...conditions))
    .orderBy(desc(policiesTable.created_at));
  res.json(ListPoliciesResponse.parse(await attachLeadNames(rows)));
});

router.post("/policies", async (req, res): Promise<void> => {
  const parsed = CreatePolicyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(policiesTable)
    .values({ ...parsed.data, org_id: DEFAULT_ORG_ID })
    .returning();
  const [withName] = await attachLeadNames([row!]);
  res.status(201).json(withName);
});

router.get("/policies/:id", async (req, res): Promise<void> => {
  const params = GetPolicyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(policiesTable)
    .where(eq(policiesTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Policy not found" });
    return;
  }
  res.json(
    GetPolicyResponse.parse({ ...row, lead_name: await leadName(row.lead_id) }),
  );
});

router.patch("/policies/:id", async (req, res): Promise<void> => {
  const params = UpdatePolicyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePolicyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(policiesTable)
    .set({ ...parsed.data })
    .where(eq(policiesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Policy not found" });
    return;
  }
  res.json({ ...row, lead_name: await leadName(row.lead_id) });
});

router.delete("/policies/:id", async (req, res): Promise<void> => {
  const params = DeletePolicyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(policiesTable).where(eq(policiesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
