import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const apiConfigTable = pgTable("api_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: text("org_id").notNull().unique(),
  bolna_api_key: text("bolna_api_key"),
  bolna_base_url: text("bolna_base_url").notNull().default("https://api.bolna.ai"),
  brevo_api_key: text("brevo_api_key"),
  brevo_sender_name: text("brevo_sender_name"),
  meta_ads_access_token: text("meta_ads_access_token"),
  meta_ads_account_id: text("meta_ads_account_id"),
  webhook_secret: text("webhook_secret").notNull(),
  context_api_bearer_token: text("context_api_bearer_token").notNull(),
  monthly_checkin_agent_id: text("monthly_checkin_agent_id"),
  sms_on_lead_created: boolean("sms_on_lead_created").notNull().default(false),
  sms_on_call_scheduled: boolean("sms_on_call_scheduled").notNull().default(false),
  email_renewal_reminders: boolean("email_renewal_reminders")
    .notNull()
    .default(false),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertApiConfigSchema = createInsertSchema(apiConfigTable);
export type ApiConfigRow = typeof apiConfigTable.$inferSelect;
export type ApiConfigInsert = typeof apiConfigTable.$inferInsert;
