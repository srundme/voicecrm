import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const followUpsTable = pgTable("follow_ups", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: text("org_id").notNull(),
  lead_id: uuid("lead_id").notNull(),
  policy_id: uuid("policy_id"),
  type: text("type").notNull(),
  scheduled_at: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  completed_at: timestamp("completed_at", { withTimezone: true }),
  bolna_agent_id: text("bolna_agent_id"),
  call_log_id: uuid("call_log_id"),
  notes: text("notes"),
  status: text("status").notNull().default("PENDING"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type FollowUpRow = typeof followUpsTable.$inferSelect;
