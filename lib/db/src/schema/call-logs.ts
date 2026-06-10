import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { callDirEnum, callStatusEnum } from "./enums";

export type ComplianceCheckResult = {
  id: string;
  label: string;
  passed: boolean;
  score: number;
  note?: string;
};

export type ComplianceData = {
  overall_score: number;
  status: "PASS" | "WARNING" | "FAIL";
  irdai_score: number;
  dpdp_score: number;
  irdai_checks: ComplianceCheckResult[];
  dpdp_checks: ComplianceCheckResult[];
  flags: string[];
  analyzed_at: string;
};

export const callLogsTable = pgTable(
  "call_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: text("org_id").notNull(),
    lead_id: uuid("lead_id"),
    bolna_execution_id: text("bolna_execution_id").notNull(),
    bolna_agent_id: text("bolna_agent_id").notNull(),
    agent_name: text("agent_name"),
    direction: callDirEnum("direction").notNull().default("OUTBOUND"),
    phone_number: text("phone_number").notNull(),
    status: callStatusEnum("status").notNull().default("INITIATED"),
    started_at: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ended_at: timestamp("ended_at", { withTimezone: true }),
    duration_seconds: integer("duration_seconds"),
    transcript: text("transcript"),
    summary: text("summary"),
    recording_url: text("recording_url"),
    disposition_id: uuid("disposition_id"),
    drop_detected: boolean("drop_detected").notNull().default(false),
    drop_reason: text("drop_reason"),
    compliance_status: text("compliance_status"),
    compliance_score: integer("compliance_score"),
    compliance_data: jsonb("compliance_data").$type<ComplianceData>(),
    retry_of_call_id: uuid("retry_of_call_id"),
    retry_call_id: uuid("retry_call_id"),
    memory_injected: jsonb("memory_injected").$type<Record<string, unknown>>(),
    call_type: text("call_type"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("call_logs_phone_created_idx").on(
      table.phone_number,
      table.created_at,
    ),
    index("call_logs_agent_idx").on(table.bolna_agent_id),
    index("call_logs_org_status_idx").on(table.org_id, table.status),
    index("call_logs_lead_created_idx").on(table.lead_id, table.created_at),
  ],
);

export const insertCallLogSchema = createInsertSchema(callLogsTable);
export type CallLogRow = typeof callLogsTable.$inferSelect;
export type CallLogInsert = typeof callLogsTable.$inferInsert;
