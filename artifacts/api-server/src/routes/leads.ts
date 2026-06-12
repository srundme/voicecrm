// schema: COLD stage + REFERRAL/RETRY_NO_ANSWER follow-up types supported
import { Router, type IRouter } from "express";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  lte,
  or,
  ilike,
  count,
} from "drizzle-orm";
import {
  db,
  leadsTable,
  policiesTable,
  callLogsTable,
  followUpsTable,
  automationsTable,
} from "@workspace/db";
import {
  ListLeadsQueryParams,
  ListLeadsResponse,
  CreateLeadBody,
  GetLeadParams,
  GetLeadResponse,
  UpdateLeadParams,
  UpdateLeadBody,
  DeleteLeadParams,
  GetLeadTimelineParams,
  GetLeadTimelineResponse,
  AddLeadNoteParams,
  AddLeadNoteBody,
  TriggerLeadCallParams,
  TriggerLeadCallBody,
  BulkImportLeadsBody,
} from "@workspace/api-zod";
import { DEFAULT_ORG_ID } from "../lib/org";
import { normalizePhone, isValidIndianMobile } from "../lib/phone";
import { triggerCall } from "../lib/call-engine";
import { bolna } from "../lib/bolna";
import { serializeCallLogs } from "../lib/serialize";
import { notifyLeadCreated } from "../lib/brevo";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const sortColumns = {
  created_at: leadsTable.created_at,
  last_contacted_at: leadsTable.last_contacted_at,
  next_followup_at: leadsTable.next_followup_at,
} as const;

async function autoCallOnLead(leadId: string, phone: string): Promise<void> {
  try {
    const [lead] = await db.select({ stage: leadsTable.stage, is_dnd: leadsTable.is_dnd })
      .from(leadsTable).where(eq(leadsTable.id, leadId));
    if (lead?.is_dnd || lead?.stage === "DO_NOT_CALL") {
      logger.info({ leadId }, "Skipped auto-call: lead is DND");
      return;
    }
    const autos = await db
      .select()
      .from(automationsTable)
      .where(
        and(
          eq(automationsTable.org_id, DEFAULT_ORG_ID),
          eq(automationsTable.type, "AUTO_CALL_ON_LEAD"),
          eq(automationsTable.is_active, true),
        ),
      );
    if (autos.length === 0) return;
    const auto = autos[0]!;
    const agentId = auto.bolna_agent_id;
    if (!agentId) return; // No primary outbound agent configured yet.
    await triggerCall({
      agentId,
      phone,
      leadId,
      callType: "new_lead",
    });
    await db
      .update(automationsTable)
      .set({ last_triggered_at: new Date() })
      .where(eq(automationsTable.id, auto.id));
  } catch (err) {
    logger.error({ err }, "auto-call-on-lead failed");
  }
}

router.get("/leads", async (req, res): Promise<void> => {
  const q = ListLeadsQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  const {
    search,
    stage,
    source,
    insuranceType,
    city,
    assignedTo,
    dateFrom,
    dateTo,
    sortBy,
    sortDir,
    page,
    pageSize,
  } = q.data;

  const conditions = [eq(leadsTable.org_id, DEFAULT_ORG_ID)];
  if (search) {
    const term = `%${search}%`;
    conditions.push(
      or(
        ilike(leadsTable.full_name, term),
        ilike(leadsTable.phone, term),
        ilike(leadsTable.email, term),
      )!,
    );
  }
  if (stage) conditions.push(eq(leadsTable.stage, stage));
  if (source) conditions.push(eq(leadsTable.source, source));
  if (insuranceType)
    conditions.push(eq(leadsTable.insurance_type, insuranceType));
  if (city) conditions.push(ilike(leadsTable.city, `%${city}%`));
  if (assignedTo) conditions.push(eq(leadsTable.assigned_to, assignedTo));
  if (dateFrom) conditions.push(gte(leadsTable.created_at, dateFrom));
  if (dateTo) conditions.push(lte(leadsTable.created_at, dateTo));

  const where = and(...conditions);
  const orderCol = sortColumns[sortBy ?? "created_at"];
  const orderBy = (sortDir ?? "desc") === "asc" ? asc(orderCol) : desc(orderCol);

  const currentPage = page && page > 0 ? page : 1;
  const limit = pageSize && pageSize > 0 ? pageSize : 20;
  const offset = (currentPage - 1) * limit;

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(leadsTable)
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db.select({ c: count() }).from(leadsTable).where(where),
  ]);

  res.json(
    ListLeadsResponse.parse({
      data: rows,
      total: totalRow[0]?.c ?? 0,
      page: currentPage,
      pageSize: limit,
    }),
  );
});

router.post("/leads", async (req, res): Promise<void> => {
  const parsed = CreateLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const phone = normalizePhone(data.phone);
  if (!isValidIndianMobile(phone)) {
    res.status(400).json({ error: "Invalid Indian mobile number" });
    return;
  }
  if (data.phone_alt) {
    const phoneAlt = normalizePhone(data.phone_alt);
    if (!isValidIndianMobile(phoneAlt)) {
      res.status(400).json({ error: "Invalid alternate Indian mobile number" });
      return;
    }
  }
  const [row] = await db
    .insert(leadsTable)
    .values({
      ...data,
      phone,
      phone_alt: data.phone_alt ? normalizePhone(data.phone_alt) : undefined,
      source: data.source ?? "MANUAL",
      org_id: DEFAULT_ORG_ID,
    })
    .returning();

  void autoCallOnLead(row!.id, row!.phone);
  void notifyLeadCreated(row!.phone, row!.full_name);
  res.status(201).json(row);
});

router.get("/leads/:id", async (req, res): Promise<void> => {
  const params = GetLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, params.data.id));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  const [policies, calls, followUps] = await Promise.all([
    db
      .select()
      .from(policiesTable)
      .where(eq(policiesTable.lead_id, lead.id))
      .orderBy(desc(policiesTable.created_at)),
    db
      .select()
      .from(callLogsTable)
      .where(eq(callLogsTable.lead_id, lead.id))
      .orderBy(desc(callLogsTable.started_at)),
    db
      .select()
      .from(followUpsTable)
      .where(eq(followUpsTable.lead_id, lead.id))
      .orderBy(desc(followUpsTable.scheduled_at)),
  ]);

  res.json(
    GetLeadResponse.parse({
      ...lead,
      policies: policies.map((p) => ({ ...p, lead_name: lead.full_name })),
      call_logs: await serializeCallLogs(calls),
      follow_ups: followUps.map((f) => ({ ...f, lead_name: lead.full_name })),
    }),
  );
});

router.patch("/leads/:id", async (req, res): Promise<void> => {
  const params = UpdateLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = { ...parsed.data };
  if (data.phone) {
    const phone = normalizePhone(data.phone);
    if (!isValidIndianMobile(phone)) {
      res.status(400).json({ error: "Invalid Indian mobile number" });
      return;
    }
    data.phone = phone;
  }
  const [row] = await db
    .update(leadsTable)
    .set(data)
    .where(eq(leadsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  res.json(row);
});

router.delete("/leads/:id", async (req, res): Promise<void> => {
  const params = DeleteLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(leadsTable).where(eq(leadsTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/leads/:id/timeline", async (req, res): Promise<void> => {
  const params = GetLeadTimelineParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, params.data.id));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  const calls = await db
    .select()
    .from(callLogsTable)
    .where(eq(callLogsTable.lead_id, lead.id))
    .orderBy(desc(callLogsTable.started_at));

  const events: {
    id: string;
    kind: "call" | "stage_change" | "note" | "source";
    title: string;
    detail: string | null;
    timestamp: Date;
  }[] = [];

  events.push({
    id: `source-${lead.id}`,
    kind: "source",
    title: `Lead created via ${lead.source.replace(/_/g, " ").toLowerCase()}`,
    detail: null,
    timestamp: lead.created_at,
  });

  for (const c of calls) {
    events.push({
      id: `call-${c.id}`,
      kind: "call",
      title: `${c.direction === "INBOUND" ? "Inbound" : "Outbound"} call - ${c.status.replace(/_/g, " ").toLowerCase()}`,
      detail: c.summary ?? null,
      timestamp: c.started_at,
    });
  }

  if (lead.notes) {
    events.push({
      id: `note-${lead.id}`,
      kind: "note",
      title: "Note",
      detail: lead.notes,
      timestamp: lead.updated_at,
    });
  }

  events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  res.json(GetLeadTimelineResponse.parse(events));
});

router.post("/leads/:id/notes", async (req, res): Promise<void> => {
  const params = AddLeadNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AddLeadNoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, params.data.id));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  const stamp = new Date().toISOString();
  const appended = lead.notes
    ? `${lead.notes}\n[${stamp}] ${parsed.data.note}`
    : `[${stamp}] ${parsed.data.note}`;
  const [row] = await db
    .update(leadsTable)
    .set({ notes: appended })
    .where(eq(leadsTable.id, lead.id))
    .returning();
  res.json(row);
});

router.post("/leads/:id/call", async (req, res): Promise<void> => {
  const params = TriggerLeadCallParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = TriggerLeadCallBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, params.data.id));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  const outcome = await triggerCall({
    agentId: parsed.data.agent_id,
    phone: lead.phone,
    leadId: lead.id,
    callType: "manual",
    variables: {
      name: lead.full_name,
      city: lead.city ?? "",
      insurance_type: lead.insurance_type ?? "",
    },
  });
  res.json(outcome);
});

router.post("/leads/bulk-import", async (req, res): Promise<void> => {
  const parsed = BulkImportLeadsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { rows, trigger_calls, agent_id } = parsed.data;
  let imported = 0;
  let skippedDuplicates = 0;
  let skippedInvalid = 0;
  const errors: string[] = [];

  const existing = await db
    .select({ phone: leadsTable.phone })
    .from(leadsTable)
    .where(eq(leadsTable.org_id, DEFAULT_ORG_ID));
  const seen = new Set(existing.map((e) => e.phone));

  for (const [i, raw] of rows.entries()) {
    const name = (raw.full_name ?? "").trim();
    const phone = normalizePhone(raw.phone ?? "");
    if (!name || !isValidIndianMobile(phone)) {
      skippedInvalid += 1;
      errors.push(`Row ${i + 1}: missing name or invalid phone`);
      continue;
    }
    if (seen.has(phone)) {
      skippedDuplicates += 1;
      continue;
    }
    seen.add(phone);
    const genderRaw = (raw.gender ?? "").toUpperCase();
    const gender = (["MALE", "FEMALE", "OTHER"] as const).find(
      (g) => g === genderRaw,
    );
    const insuranceTypeRaw = (raw.insurance_type ?? "").toUpperCase();
    const insuranceType = (
      [
        "LIFE",
        "HEALTH",
        "MOTOR",
        "TERM",
        "ULIP",
        "ENDOWMENT",
        "ACCIDENT",
        "TRAVEL",
      ] as const
    ).find((t) => t === insuranceTypeRaw);
    const [lead] = await db
      .insert(leadsTable)
      .values({
        org_id: DEFAULT_ORG_ID,
        full_name: name,
        phone,
        gender: gender ?? "OTHER",
        email: raw.email || null,
        city: raw.city || null,
        state: raw.state || null,
        pincode: raw.pincode || null,
        insurance_type: insuranceType ?? null,
        notes: raw.notes || null,
        source: "CSV_UPLOAD",
      })
      .returning();
    imported += 1;
    if (trigger_calls && agent_id && lead) {
      void triggerCall({
        agentId: agent_id,
        phone: lead.phone,
        leadId: lead.id,
        callType: "bulk_import",
        variables: { name: lead.full_name },
      });
    }
  }

  const { importHistoryTable } = await import("@workspace/db");
  await db.insert(importHistoryTable).values({
    org_id: DEFAULT_ORG_ID,
    imported,
    skipped: skippedDuplicates,
    errors: skippedInvalid,
  });

  res.json({
    imported,
    skipped_duplicates: skippedDuplicates,
    skipped_invalid: skippedInvalid,
    errors,
  });
});

export default router;
