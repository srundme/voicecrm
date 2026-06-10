import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { followUpTypeEnum, followUpStatusEnum } from "./enums";

export const followUpsTable = pgTable(
  "follow_ups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: text("org_id").notNull(),
    lead_id: uuid("lead_id").notNull(),
    policy_id: uuid("policy_id"),
    type: followUpTypeEnum("type").notNull(),
    scheduled_at: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    bolna_agent_id: text("bolna_agent_id"),
    call_log_id: uuid("call_log_id"),
    notes: text("notes"),
    status: followUpStatusEnum("status").notNull().default("PENDING"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("follow_ups_org_sched_status_idx").on(
      table.org_id,
      table.scheduled_at,
      table.status,
    ),
    index("follow_ups_lead_idx").on(table.lead_id),
  ],
);

export const insertFollowUpSchema = createInsertSchema(followUpsTable);
export type FollowUpRow = typeof followUpsTable.$inferSelect;
export type FollowUpInsert = typeof followUpsTable.$inferInsert;
