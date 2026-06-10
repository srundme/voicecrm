import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const dispositionsTable = pgTable(
  "dispositions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: text("org_id").notNull(),
    bolna_agent_id: text("bolna_agent_id").notNull(),
    label: text("label").notNull(),
    color: text("color").notNull().default("#6366f1"),
    description: text("description"),
    is_active: boolean("is_active").notNull().default(true),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("dispositions_org_agent_idx").on(table.org_id, table.bolna_agent_id),
  ],
);

export const insertDispositionSchema = createInsertSchema(dispositionsTable);
export type DispositionRow = typeof dispositionsTable.$inferSelect;
export type DispositionInsert = typeof dispositionsTable.$inferInsert;
