import { pgEnum } from "drizzle-orm/pg-core";

export const genderEnum = pgEnum("gender", ["MALE", "FEMALE", "OTHER"]);

export const insuranceTypeEnum = pgEnum("insurance_type", [
  "LIFE",
  "HEALTH",
  "MOTOR",
  "TERM",
  "ULIP",
  "ENDOWMENT",
  "ACCIDENT",
  "TRAVEL",
]);

export const leadSourceEnum = pgEnum("lead_source", [
  "META_ADS",
  "WEBSITE_FORM",
  "CSV_UPLOAD",
  "MANUAL",
  "INBOUND_CALL",
  "REFERRAL",
]);

export const leadStageEnum = pgEnum("lead_stage", [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "DOCS_PENDING",
  "POLICY_ISSUED",
  "RENEWAL_DUE",
  "LOST",
  "DO_NOT_CALL",
  "COLD",
]);

export const policyStatusEnum = pgEnum("policy_status", [
  "ACTIVE",
  "LAPSED",
  "SURRENDERED",
  "MATURED",
  "CLAIMED",
]);

export const premiumFreqEnum = pgEnum("premium_freq", [
  "MONTHLY",
  "QUARTERLY",
  "HALF_YEARLY",
  "YEARLY",
  "SINGLE",
]);

export const callDirEnum = pgEnum("call_dir", ["OUTBOUND", "INBOUND"]);

export const callStatusEnum = pgEnum("call_status", [
  "INITIATED",
  "RINGING",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "NO_ANSWER",
  "BUSY",
  "CANCELLED",
]);

export const automationTypeEnum = pgEnum("automation_type", [
  "AUTO_CALL_ON_LEAD",
  "RETRY_ON_DROP",
  "SCHEDULED_FOLLOWUP",
  "MONTHLY_CHECKIN",
]);

export const followUpTypeEnum = pgEnum("follow_up_type", [
  "RENEWAL_REMINDER",
  "MONTHLY_CHECKIN",
  "CALLBACK_REQUESTED",
  "MANUAL",
  "POLICY_ANNIVERSARY",
  "REFERRAL",
  "RETRY_NO_ANSWER",
]);

export const followUpStatusEnum = pgEnum("follow_up_status", [
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "SKIPPED",
  "RESCHEDULED",
]);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
]);

export const campaignLeadStatusEnum = pgEnum("campaign_lead_status", [
  "PENDING",
  "IN_PROGRESS",
  "CALLED",
  "FAILED",
  "SKIPPED",
]);
