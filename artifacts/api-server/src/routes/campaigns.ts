import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, campaignsTable, campaignLeadsTable } from "@workspace/db";
import { z } from "zod";
import { DEFAULT_ORG_ID } from "../lib/org";
import { normalizePhone } from "../lib/phone";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const CreateCampaignBody = z.object({
  name: z.string().min(1).max(200),
  agent_id: z.string().min(1),
  agent_name: z.string().nullish(),
  window_start: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM"),
  window_end: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM"),
  interval_minutes: z.number().int().min(1).max(120).default(3),
  notes: z.string().nullish(),
});

const BulkLeadsBody = z.object({
  leads: z.array(
    z.object({
      phone: z.string(),
      full_name: z.string().optional(),
    }),
  ).min(1).max(2000),
});

async function getCampaignStats(campaignId: string) {
  const rows = await db
    .select({
      status: campaignLeadsTable.status,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(campaignLeadsTable)
    .where(eq(campaignLeadsTable.campaign_id, campaignId))
    .groupBy(campaignLeadsTable.status);

  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    byStatus[r.status] = r.count;
    total += r.count;
  }
  return {
    total,
    pending: byStatus["PENDING"] ?? 0,
    in_progress: byStatus["IN_PROGRESS"] ?? 0,
    called: byStatus["CALLED"] ?? 0,
    failed: byStatus["FAILED"] ?? 0,
    skipped: byStatus["SKIPPED"] ?? 0,
  };
}

router.get("/campaigns", async (_req, res): Promise<void> => {
  const campaigns = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.org_id, DEFAULT_ORG_ID))
    .orderBy(sql`${campaignsTable.created_at} desc`);

  const withStats = await Promise.all(
    campaigns.map(async (c) => ({ ...c, stats: await getCampaignStats(c.id) })),
  );
  res.json({ success: true, data: withStats });
});

router.post("/campaigns", async (req, res): Promise<void> => {
  const parsed = CreateCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  const b = parsed.data;
  if (b.window_start >= b.window_end) {
    res.status(400).json({ success: false, error: "window_start must be before window_end" });
    return;
  }
  const [campaign] = await db
    .insert(campaignsTable)
    .values({
      org_id: DEFAULT_ORG_ID,
      name: b.name,
      agent_id: b.agent_id,
      agent_name: b.agent_name ?? null,
      window_start: b.window_start,
      window_end: b.window_end,
      interval_minutes: b.interval_minutes,
      notes: b.notes ?? null,
      status: "DRAFT",
    })
    .returning();
  res.status(201).json({ success: true, data: campaign });
});

router.get("/campaigns/:id", async (req, res): Promise<void> => {
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, req.params.id), eq(campaignsTable.org_id, DEFAULT_ORG_ID)));

  if (!campaign) {
    res.status(404).json({ success: false, error: "Not found" });
    return;
  }

  const leads = await db
    .select()
    .from(campaignLeadsTable)
    .where(eq(campaignLeadsTable.campaign_id, campaign.id))
    .orderBy(campaignLeadsTable.created_at);

  const stats = await getCampaignStats(campaign.id);
  res.json({ success: true, data: { ...campaign, stats, leads } });
});

router.post("/campaigns/:id/leads", async (req, res): Promise<void> => {
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, req.params.id), eq(campaignsTable.org_id, DEFAULT_ORG_ID)));

  if (!campaign) {
    res.status(404).json({ success: false, error: "Not found" });
    return;
  }
  if (campaign.status !== "DRAFT") {
    res.status(400).json({ success: false, error: "Can only add leads to a DRAFT campaign" });
    return;
  }

  const parsed = BulkLeadsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const rows = parsed.data.leads
    .map((l) => {
      const phone = normalizePhone(l.phone ?? "");
      if (phone.length !== 10) return null;
      return {
        campaign_id: campaign.id,
        phone,
        full_name: (l.full_name ?? "").trim() || "Unknown",
        status: "PENDING" as const,
      };
    })
    .filter(Boolean) as Array<{ campaign_id: string; phone: string; full_name: string; status: "PENDING" }>;

  if (rows.length === 0) {
    res.status(400).json({ success: false, error: "No valid phone numbers found" });
    return;
  }

  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await db.insert(campaignLeadsTable).values(chunk);
    inserted += chunk.length;
  }

  logger.info({ campaignId: campaign.id, inserted }, "campaign leads uploaded");
  res.json({ success: true, data: { inserted, skipped: parsed.data.leads.length - inserted } });
});

router.patch("/campaigns/:id/start", async (req, res): Promise<void> => {
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, req.params.id), eq(campaignsTable.org_id, DEFAULT_ORG_ID)));

  if (!campaign) { res.status(404).json({ success: false, error: "Not found" }); return; }
  if (!["DRAFT", "PAUSED"].includes(campaign.status)) {
    res.status(400).json({ success: false, error: `Cannot start a ${campaign.status} campaign` });
    return;
  }

  const stats = await getCampaignStats(campaign.id);
  if (stats.pending + stats.in_progress === 0 && campaign.status === "DRAFT") {
    res.status(400).json({ success: false, error: "Upload at least one lead before starting" });
    return;
  }

  const [updated] = await db
    .update(campaignsTable)
    .set({ status: "ACTIVE", updated_at: new Date() })
    .where(eq(campaignsTable.id, campaign.id))
    .returning();

  res.json({ success: true, data: updated });
});

router.patch("/campaigns/:id/pause", async (req, res): Promise<void> => {
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, req.params.id), eq(campaignsTable.org_id, DEFAULT_ORG_ID)));

  if (!campaign) { res.status(404).json({ success: false, error: "Not found" }); return; }
  if (campaign.status !== "ACTIVE") {
    res.status(400).json({ success: false, error: "Only ACTIVE campaigns can be paused" });
    return;
  }
  const [updated] = await db
    .update(campaignsTable)
    .set({ status: "PAUSED", updated_at: new Date() })
    .where(eq(campaignsTable.id, campaign.id))
    .returning();

  res.json({ success: true, data: updated });
});

router.patch("/campaigns/:id/cancel", async (req, res): Promise<void> => {
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, req.params.id), eq(campaignsTable.org_id, DEFAULT_ORG_ID)));

  if (!campaign) { res.status(404).json({ success: false, error: "Not found" }); return; }
  if (["COMPLETED", "CANCELLED"].includes(campaign.status)) {
    res.status(400).json({ success: false, error: `Campaign is already ${campaign.status}` });
    return;
  }
  const [updated] = await db
    .update(campaignsTable)
    .set({ status: "CANCELLED", updated_at: new Date() })
    .where(eq(campaignsTable.id, campaign.id))
    .returning();

  res.json({ success: true, data: updated });
});

router.delete("/campaigns/:id", async (req, res): Promise<void> => {
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, req.params.id), eq(campaignsTable.org_id, DEFAULT_ORG_ID)));

  if (!campaign) { res.status(404).json({ success: false, error: "Not found" }); return; }
  if (!["DRAFT", "CANCELLED"].includes(campaign.status)) {
    res.status(400).json({ success: false, error: "Only DRAFT or CANCELLED campaigns can be deleted" });
    return;
  }
  await db.delete(campaignsTable).where(eq(campaignsTable.id, campaign.id));
  res.json({ success: true });
});

export default router;
