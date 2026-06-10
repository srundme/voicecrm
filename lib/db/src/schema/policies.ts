import {
  pgTable,
  uuid,
  text,
  bigint,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { insuranceTypeEnum, policyStatusEnum, premiumFreqEnum } from "./enums";

export type PolicyDocumentJson = { name: string; url: string };

export const policiesTable = pgTable(
  "policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: text("org_id").notNull(),
    lead_id: uuid("lead_id").notNull(),
    policy_number: text("policy_number"),
    insurer_name: text("insurer_name"),
    policy_type: insuranceTypeEnum("policy_type").notNull().default("LIFE"),
    sum_assured: bigint("sum_assured", { mode: "number" }),
    annual_premium: bigint("annual_premium", { mode: "number" }),
    premium_frequency: premiumFreqEnum("premium_frequency")
      .notNull()
      .default("YEARLY"),
    start_date: timestamp("start_date", { withTimezone: true }),
    end_date: timestamp("end_date", { withTimezone: true }),
    renewal_date: timestamp("renewal_date", { withTimezone: true }),
    nominee_name: text("nominee_name"),
    nominee_relation: text("nominee_relation"),
    nominee_dob: timestamp("nominee_dob", { withTimezone: true }),
    status: policyStatusEnum("status").notNull().default("ACTIVE"),
    documents: jsonb("documents")
      .$type<PolicyDocumentJson[]>()
      .notNull()
      .default([]),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("policies_org_renewal_idx").on(table.org_id, table.renewal_date),
    index("policies_lead_idx").on(table.lead_id),
  ],
);

export const insertPolicySchema = createInsertSchema(policiesTable);
export type PolicyRow = typeof policiesTable.$inferSelect;
export type PolicyInsert = typeof policiesTable.$inferInsert;
