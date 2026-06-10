import { inArray, eq } from "drizzle-orm";
import {
  db,
  leadsTable,
  dispositionsTable,
  type CallLogRow,
  type DispositionRow,
} from "@workspace/db";

export function serializeDisposition(row: DispositionRow) {
  return row;
}

async function leadNameMap(
  leadIds: (string | null)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(leadIds.filter((x): x is string => !!x))];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ id: leadsTable.id, full_name: leadsTable.full_name })
    .from(leadsTable)
    .where(inArray(leadsTable.id, ids));
  for (const r of rows) map.set(r.id, r.full_name);
  return map;
}

async function dispositionMap(
  ids: (string | null)[],
): Promise<Map<string, DispositionRow>> {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  const map = new Map<string, DispositionRow>();
  if (list.length === 0) return map;
  const rows = await db
    .select()
    .from(dispositionsTable)
    .where(inArray(dispositionsTable.id, list));
  for (const r of rows) map.set(r.id, r);
  return map;
}

export async function serializeCallLog(row: CallLogRow) {
  const [names, disps] = await Promise.all([
    leadNameMap([row.lead_id]),
    dispositionMap([row.disposition_id]),
  ]);
  return {
    ...row,
    lead_name: row.lead_id ? (names.get(row.lead_id) ?? null) : null,
    disposition: row.disposition_id
      ? (disps.get(row.disposition_id) ?? null)
      : null,
  };
}

export async function serializeCallLogs(rows: CallLogRow[]) {
  const [names, disps] = await Promise.all([
    leadNameMap(rows.map((r) => r.lead_id)),
    dispositionMap(rows.map((r) => r.disposition_id)),
  ]);
  return rows.map((row) => ({
    ...row,
    lead_name: row.lead_id ? (names.get(row.lead_id) ?? null) : null,
    disposition: row.disposition_id
      ? (disps.get(row.disposition_id) ?? null)
      : null,
  }));
}

export async function attachLeadNames<
  T extends { lead_id: string | null | undefined },
>(rows: T[]): Promise<(T & { lead_name: string | null })[]> {
  const names = await leadNameMap(rows.map((r) => r.lead_id ?? null));
  return rows.map((r) => ({
    ...r,
    lead_name: r.lead_id ? (names.get(r.lead_id) ?? null) : null,
  }));
}

export async function leadName(leadId: string): Promise<string | null> {
  const [row] = await db
    .select({ full_name: leadsTable.full_name })
    .from(leadsTable)
    .where(eq(leadsTable.id, leadId));
  return row?.full_name ?? null;
}
