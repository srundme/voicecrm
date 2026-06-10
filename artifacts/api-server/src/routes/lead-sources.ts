import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  leadsTable,
  importHistoryTable,
  webhookLogsTable,
} from "@workspace/db";
import {
  GetRecentMetaLeadsResponse,
  GetImportHistoryResponse,
  GetWebhookLogsResponse,
} from "@workspace/api-zod";
import { DEFAULT_ORG_ID } from "../lib/org";

const router: IRouter = Router();

router.get(
  "/lead-sources/recent-meta-leads",
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.source, "META_ADS"))
      .orderBy(desc(leadsTable.created_at))
      .limit(20);
    res.json(GetRecentMetaLeadsResponse.parse(rows));
  },
);

router.get(
  "/lead-sources/import-history",
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(importHistoryTable)
      .where(eq(importHistoryTable.org_id, DEFAULT_ORG_ID))
      .orderBy(desc(importHistoryTable.created_at))
      .limit(20);
    res.json(GetImportHistoryResponse.parse(rows));
  },
);

router.get("/webhooks/logs", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(webhookLogsTable)
    .where(eq(webhookLogsTable.org_id, DEFAULT_ORG_ID))
    .orderBy(desc(webhookLogsTable.created_at))
    .limit(50);
  res.json(GetWebhookLogsResponse.parse(rows));
});

export default router;
