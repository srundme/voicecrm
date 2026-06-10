import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";

export const importHistoryTable = pgTable("import_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: text("org_id").notNull(),
  imported: integer("imported").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  errors: integer("errors").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const webhookLogsTable = pgTable("webhook_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: text("org_id").notNull(),
  source: text("source").notNull(),
  status: text("status").notNull(),
  message: text("message"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ImportHistoryRow = typeof importHistoryTable.$inferSelect;
export type WebhookLogRow = typeof webhookLogsTable.$inferSelect;
