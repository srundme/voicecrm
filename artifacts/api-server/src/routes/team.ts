import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, teamMembersTable } from "@workspace/db";
import {
  ListTeamMembersResponse,
  InviteTeamMemberBody,
  RemoveTeamMemberParams,
} from "@workspace/api-zod";
import { DEFAULT_ORG_ID } from "../lib/org";

const router: IRouter = Router();

router.get("/team", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(teamMembersTable)
    .where(eq(teamMembersTable.org_id, DEFAULT_ORG_ID))
    .orderBy(desc(teamMembersTable.created_at));
  res.json(ListTeamMembersResponse.parse(rows));
});

router.post("/team", async (req, res): Promise<void> => {
  const parsed = InviteTeamMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(teamMembersTable)
    .values({
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role ?? "AGENT",
      org_id: DEFAULT_ORG_ID,
    })
    .returning();
  res.status(201).json(row);
});

router.delete("/team/:id", async (req, res): Promise<void> => {
  const params = RemoveTeamMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(teamMembersTable)
    .where(eq(teamMembersTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
