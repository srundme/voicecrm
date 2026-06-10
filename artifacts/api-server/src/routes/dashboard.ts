import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lte, inArray, count, sql } from "drizzle-orm";
import { db, leadsTable, callLogsTable, followUpsTable } from "@workspace/db";
import {
  GetDashboardSummaryResponse,
  GetLeadFunnelResponse,
  GetRecentCallsResponse,
  GetTodayFollowUpsResponse,
} from "@workspace/api-zod";
import { DEFAULT_ORG_ID } from "../lib/org";
import { serializeCallLogs, attachLeadNames } from "../lib/serialize";

const router: IRouter = Router();

const STAGES = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "DOCS_PENDING",
  "POLICY_ISSUED",
  "RENEWAL_DUE",
  "LOST",
  "DO_NOT_CALL",
] as const;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const orgFilter = eq(leadsTable.org_id, DEFAULT_ORG_ID);
  const [totalLeads, callsToday, activeCalls, issued] = await Promise.all([
    db.select({ c: count() }).from(leadsTable).where(orgFilter),
    db
      .select({ c: count() })
      .from(callLogsTable)
      .where(
        and(
          eq(callLogsTable.org_id, DEFAULT_ORG_ID),
          gte(callLogsTable.started_at, startOfToday()),
        ),
      ),
    db
      .select({ c: count() })
      .from(callLogsTable)
      .where(
        and(
          eq(callLogsTable.org_id, DEFAULT_ORG_ID),
          inArray(callLogsTable.status, [
            "INITIATED",
            "RINGING",
            "IN_PROGRESS",
          ]),
        ),
      ),
    db
      .select({ c: count() })
      .from(leadsTable)
      .where(and(orgFilter, eq(leadsTable.stage, "POLICY_ISSUED"))),
  ]);

  const total = totalLeads[0]?.c ?? 0;
  const issuedCount = issued[0]?.c ?? 0;
  const conversionRate =
    total > 0 ? Math.round((issuedCount / total) * 1000) / 10 : 0;

  res.json(
    GetDashboardSummaryResponse.parse({
      total_leads: total,
      calls_today: callsToday[0]?.c ?? 0,
      active_calls: activeCalls[0]?.c ?? 0,
      conversion_rate: conversionRate,
    }),
  );
});

router.get("/dashboard/funnel", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ stage: leadsTable.stage, c: count() })
    .from(leadsTable)
    .where(eq(leadsTable.org_id, DEFAULT_ORG_ID))
    .groupBy(leadsTable.stage);
  const map = new Map(rows.map((r) => [r.stage, r.c]));
  res.json(
    GetLeadFunnelResponse.parse(
      STAGES.map((stage) => ({ stage, count: map.get(stage) ?? 0 })),
    ),
  );
});

router.get("/dashboard/recent-calls", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(callLogsTable)
    .where(eq(callLogsTable.org_id, DEFAULT_ORG_ID))
    .orderBy(desc(callLogsTable.started_at))
    .limit(10);
  res.json(GetRecentCallsResponse.parse(await serializeCallLogs(rows)));
});

router.get("/dashboard/today-followups", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(followUpsTable)
    .where(
      and(
        eq(followUpsTable.org_id, DEFAULT_ORG_ID),
        gte(followUpsTable.scheduled_at, startOfToday()),
        lte(followUpsTable.scheduled_at, endOfToday()),
      ),
    )
    .orderBy(followUpsTable.scheduled_at);
  res.json(GetTodayFollowUpsResponse.parse(await attachLeadNames(rows)));
});

router.get("/dashboard/trends", async (_req, res): Promise<void> => {
  const since = new Date();
  since.setDate(since.getDate() - 13);
  since.setHours(0, 0, 0, 0);

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });

  const [callRows, leadRows] = await Promise.all([
    db
      .select({
        day: sql<string>`to_char(${callLogsTable.started_at}, 'YYYY-MM-DD')`,
        c: count(),
      })
      .from(callLogsTable)
      .where(and(eq(callLogsTable.org_id, DEFAULT_ORG_ID), gte(callLogsTable.started_at, since)))
      .groupBy(sql`to_char(${callLogsTable.started_at}, 'YYYY-MM-DD')`),
    db
      .select({
        day: sql<string>`to_char(${leadsTable.created_at}, 'YYYY-MM-DD')`,
        c: count(),
      })
      .from(leadsTable)
      .where(and(eq(leadsTable.org_id, DEFAULT_ORG_ID), gte(leadsTable.created_at, since)))
      .groupBy(sql`to_char(${leadsTable.created_at}, 'YYYY-MM-DD')`),
  ]);

  const callMap = new Map(callRows.map((r) => [r.day, r.c]));
  const leadMap = new Map(leadRows.map((r) => [r.day, r.c]));

  res.json(days.map((day) => ({ date: day, calls: Number(callMap.get(day) ?? 0), leads: Number(leadMap.get(day) ?? 0) })));
});

export default router;
