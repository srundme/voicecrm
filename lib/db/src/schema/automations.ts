import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const automationsTable = pgTable("automations", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: text("org_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  bolna_agent_id: text("bolna_agent_id").notNull(),
  trigger_config: jsonb("trigger_config")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  is_active: boolean("is_active").notNull().default(true),
  last_triggered_at: timestamp("last_triggered_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type AutomationRow = typeof automationsTable.$inferSelect;
