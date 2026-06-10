import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const callLogsTable = pgTable("call_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: text("org_id").notNull(),
  lead_id: uuid("lead_id"),
  bolna_execution_id: text("bolna_execution_id").notNull(),
  bolna_agent_id: text("bolna_agent_id").notNull(),
  agent_name: text("agent_name"),
  direction: text("direction").notNull().default("OUTBOUND"),
  phone_number: text("phone_number").notNull(),
  status: text("status").notNull().default("INITIATED"),
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
  retry_of_call_id: uuid("retry_of_call_id"),
  retry_call_id: uuid("retry_call_id"),
  call_type: text("call_type"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type CallLogRow = typeof callLogsTable.$inferSelect;
