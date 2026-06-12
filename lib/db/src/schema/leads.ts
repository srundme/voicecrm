import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import {
  genderEnum,
  insuranceTypeEnum,
  leadSourceEnum,
  leadStageEnum,
} from "./enums";

export const leadsTable = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: text("org_id").notNull(),
    full_name: text("full_name").notNull(),
    gender: genderEnum("gender").notNull().default("OTHER"),
    dob: timestamp("dob", { withTimezone: true }),
    age: integer("age"),
    phone: text("phone").notNull(),
    phone_alt: text("phone_alt"),
    email: text("email"),
    address_line1: text("address_line1"),
    address_line2: text("address_line2"),
    city: text("city"),
    state: text("state"),
    pincode: text("pincode"),
    pan_number: text("pan_number"),
    aadhaar_number: text("aadhaar_number"),
    occupation: text("occupation"),
    annual_income: bigint("annual_income", { mode: "number" }),
    employer_name: text("employer_name"),
    insurance_type: insuranceTypeEnum("insurance_type"),
    sum_assured_interest: bigint("sum_assured_interest", { mode: "number" }),
    premium_budget: bigint("premium_budget", { mode: "number" }),
    source: leadSourceEnum("source").notNull().default("MANUAL"),
    source_campaign_id: text("source_campaign_id"),
    source_form_id: text("source_form_id"),
    stage: leadStageEnum("stage").notNull().default("NEW"),
    assigned_to: text("assigned_to"),
    notes: text("notes"),
    tags: text("tags").array().notNull().default([]),
    is_dnd: boolean("is_dnd").notNull().default(false),
    last_contacted_at: timestamp("last_contacted_at", { withTimezone: true }),
    next_followup_at: timestamp("next_followup_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("leads_phone_idx").on(table.phone),
    index("leads_org_stage_idx").on(table.org_id, table.stage),
    index("leads_org_source_idx").on(table.org_id, table.source),
  ],
);

export const insertLeadSchema = createInsertSchema(leadsTable);
export type LeadRow = typeof leadsTable.$inferSelect;
export type LeadInsert = typeof leadsTable.$inferInsert;
