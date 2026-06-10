import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { campaignStatusEnum, campaignLeadStatusEnum } from "./enums";

export const campaignsTable = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: text("org_id").notNull(),
  name: text("name").notNull(),
  agent_id: text("agent_id").notNull(),
  agent_name: text("agent_name"),
  window_start: text("window_start").notNull().default("09:00"),
  window_end: text("window_end").notNull().default("18:00"),
  interval_minutes: integer("interval_minutes").notNull().default(3),
  status: campaignStatusEnum("status").notNull().default("DRAFT"),
  last_dialed_at: timestamp("last_dialed_at", { withTimezone: true }),
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const campaignLeadsTable = pgTable(
  "campaign_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaign_id: uuid("campaign_id")
      .notNull()
      .references(() => campaignsTable.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    full_name: text("full_name").notNull().default("Unknown"),
    status: campaignLeadStatusEnum("status").notNull().default("PENDING"),
    call_log_id: uuid("call_log_id"),
    called_at: timestamp("called_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("campaign_leads_campaign_status_idx").on(
      table.campaign_id,
      table.status,
    ),
    index("campaign_leads_campaign_id_idx").on(table.campaign_id),
  ],
);

export type CampaignRow = typeof campaignsTable.$inferSelect;
export type CampaignInsert = typeof campaignsTable.$inferInsert;
export type CampaignLeadRow = typeof campaignLeadsTable.$inferSelect;
export type CampaignLeadInsert = typeof campaignLeadsTable.$inferInsert;
