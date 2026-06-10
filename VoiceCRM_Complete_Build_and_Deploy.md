# VoiceCRM — Complete Build & Deploy Guide
### For AI Coding Assistants + Railway Deployment

> Paste this entire document as your first prompt to any AI coding assistant (Cursor, Windsurf, Lovable, v0, etc.). It contains everything needed to rebuild and deploy an exact replica of VoiceCRM on Railway.
>
> **This is a living document.** Every time a new feature is added or existing logic changes, this file is updated to match. Always use this as the single source of truth.

---

## Changelog

| Date | Change |
|---|---|
| 2026-06-10 | Initial full spec — schema, routes, webhooks, scheduler, frontend |
| 2026-06-10 | Added auto-callback scheduling from call transcript (Hindi + English NLP) |

---

## What You're Building

A **SaaS CRM portal for Indian insurance agencies** with:
- AI voice calling via Bolna (outbound + inbound)
- Lead management with pipeline stages
- Policy tracking + renewal reminders
- Automated follow-ups with a background scheduler
- **Auto-callback scheduling** — detects callback requests in Hindi/English during calls and auto-schedules the follow-up
- Meta Ads + website form webhook integrations
- Real-time call feed via Server-Sent Events
- SMS + email via Brevo

**Hosted on Railway as a single service** — Express backend serves the built React frontend.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, TailwindCSS v4, shadcn/ui, Recharts, Wouter |
| Backend | Node.js 20+, Express 5, TypeScript |
| Database | PostgreSQL (Railway managed), Drizzle ORM |
| AI Calling | Bolna API (`https://api.bolna.ai`) |
| SMS/Email | Brevo API (`https://api.brevo.com/v3`) |
| Build | pnpm monorepo, esbuild for backend, Vite for frontend |

---

## Project Structure

```
voicecrm/
├── package.json              ← root (pnpm workspaces)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── railway.json              ← Railway deploy config
├── Procfile                  ← fallback start command
│
├── lib/
│   └── db/                   ← shared database package
│       ├── package.json
│       ├── drizzle.config.ts
│       └── src/
│           ├── index.ts
│           └── schema/
│               ├── index.ts
│               ├── enums.ts
│               ├── leads.ts
│               ├── call-logs.ts
│               ├── policies.ts
│               ├── follow-ups.ts
│               ├── automations.ts
│               ├── api-config.ts
│               ├── team.ts
│               ├── dispositions.ts
│               └── lead-sources.ts
│
└── artifacts/
    ├── api-server/            ← Express backend
    │   ├── package.json
    │   ├── build.mjs
    │   └── src/
    │       ├── index.ts
    │       ├── app.ts
    │       ├── routes/
    │       │   ├── index.ts
    │       │   ├── health.ts
    │       │   ├── leads.ts
    │       │   ├── call-logs.ts
    │       │   ├── policies.ts
    │       │   ├── follow-ups.ts
    │       │   ├── automations.ts
    │       │   ├── agents.ts
    │       │   ├── dashboard.ts
    │       │   ├── lead-sources.ts
    │       │   ├── settings.ts
    │       │   ├── team.ts
    │       │   ├── dispositions.ts
    │       │   └── misc.ts      ← webhooks, context, SSE
    │       └── lib/
    │           ├── bolna.ts
    │           ├── brevo.ts
    │           ├── call-engine.ts
    │           ├── context.ts
    │           ├── events.ts
    │           ├── logger.ts
    │           ├── org.ts
    │           ├── phone.ts
    │           ├── scheduler.ts
    │           └── serialize.ts
    │
    └── web/                   ← React frontend
        ├── package.json
        ├── vite.config.ts
        ├── index.html
        └── src/
            ├── App.tsx
            ├── main.tsx
            ├── pages/
            │   ├── dashboard.tsx
            │   ├── leads.tsx
            │   ├── lead-detail.tsx
            │   ├── calls.tsx
            │   ├── call-detail.tsx
            │   ├── policies.tsx
            │   ├── follow-ups.tsx
            │   ├── agents.tsx
            │   ├── lead-sources.tsx
            │   ├── settings.tsx
            │   └── team.tsx
            └── components/
                ├── layout.tsx   ← sidebar + nav
                └── ui/          ← shadcn/ui components
```

---

## Step 1: Railway Project Setup

### 1.1 Create the Railway project

1. Go to [railway.app](https://railway.app) → New Project → Empty Project
2. Click **+ New** → **Database** → **PostgreSQL** → Add
3. Click the PostgreSQL service → **Variables** tab → copy `DATABASE_URL`
4. Click **+ New** → **Empty Service** → name it `voicecrm`
5. Connect this service to your GitHub repo (after you push the code)

### 1.2 Environment variables

In your Railway service → **Variables** tab, add all of these:

```env
# Required
NODE_ENV=production
PORT=8080
DATABASE_URL=${{Postgres.DATABASE_URL}}   # Railway auto-injects this

# Your app's public URL (set after first deploy)
APP_BASE_URL=https://YOUR-APP.up.railway.app

# Bolna (AI Voice)
BOLNA_API_KEY=your_bolna_key
BOLNA_BASE_URL=https://api.bolna.ai

# Brevo (SMS + Email)
BREVO_API_KEY=your_brevo_key
BREVO_SENDER_NAME=VoiceCRM

# Meta
META_ADS_ACCESS_TOKEN=your_meta_token

# Auto-generated secrets (Railway will seed these on first startup)
# Leave blank — the app generates them automatically
```

### 1.3 `railway.json` (create at project root)

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pnpm install && pnpm run build:all"
  },
  "deploy": {
    "startCommand": "node artifacts/api-server/dist/index.mjs",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 120,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5
  }
}
```

### 1.4 `Procfile` (fallback, create at project root)

```
web: node artifacts/api-server/dist/index.mjs
```

---

## Step 2: Root Package Files

### `package.json` (root)

```json
{
  "name": "voicecrm",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build:all": "pnpm run build:frontend && pnpm run build:backend",
    "build:frontend": "pnpm --filter @workspace/web run build",
    "build:backend": "pnpm --filter @workspace/api-server run build",
    "dev:api": "pnpm --filter @workspace/api-server run dev",
    "dev:web": "pnpm --filter @workspace/web run dev",
    "db:push": "pnpm --filter @workspace/db run push",
    "typecheck": "pnpm -r --if-present run typecheck"
  },
  "devDependencies": {
    "typescript": "~5.9.3"
  },
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

### `pnpm-workspace.yaml` (root)

```yaml
packages:
  - artifacts/*
  - lib/*
```

### `tsconfig.base.json` (root)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  }
}
```

### `.gitignore` (root)

```
node_modules/
dist/
.env
.env.local
*.log
```

---

## Step 3: Database Package (`lib/db`)

### `lib/db/package.json`

```json
{
  "name": "@workspace/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "push": "drizzle-kit push --config ./drizzle.config.ts"
  },
  "dependencies": {
    "drizzle-orm": "^0.45.2",
    "drizzle-zod": "^0.8.3",
    "pg": "^8.20.0",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/pg": "^8.20.0",
    "drizzle-kit": "^0.31.10",
    "typescript": "~5.9.3"
  }
}
```

### `lib/db/drizzle.config.ts`

```typescript
import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
});
```

### `lib/db/src/index.ts`

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool, { schema });
export * from "./schema";
```

### `lib/db/src/schema/enums.ts`

```typescript
import { pgEnum } from "drizzle-orm/pg-core";

export const genderEnum = pgEnum("gender", ["MALE", "FEMALE", "OTHER"]);
export const insuranceTypeEnum = pgEnum("insurance_type", [
  "LIFE", "HEALTH", "MOTOR", "TERM", "ULIP", "ENDOWMENT", "ACCIDENT", "TRAVEL",
]);
export const leadSourceEnum = pgEnum("lead_source", [
  "META_ADS", "WEBSITE_FORM", "CSV_UPLOAD", "MANUAL", "INBOUND_CALL", "REFERRAL",
]);
export const leadStageEnum = pgEnum("lead_stage", [
  "NEW", "CONTACTED", "INTERESTED", "DOCS_PENDING", "POLICY_ISSUED", "RENEWAL_DUE", "LOST", "DO_NOT_CALL",
]);
export const policyStatusEnum = pgEnum("policy_status", [
  "ACTIVE", "LAPSED", "SURRENDERED", "MATURED", "CLAIMED",
]);
export const premiumFreqEnum = pgEnum("premium_freq", [
  "MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY", "SINGLE",
]);
export const callDirEnum = pgEnum("call_dir", ["OUTBOUND", "INBOUND"]);
export const callStatusEnum = pgEnum("call_status", [
  "INITIATED", "RINGING", "IN_PROGRESS", "COMPLETED", "FAILED", "NO_ANSWER", "BUSY", "CANCELLED",
]);
export const automationTypeEnum = pgEnum("automation_type", [
  "AUTO_CALL_ON_LEAD", "RETRY_ON_DROP", "SCHEDULED_FOLLOWUP", "MONTHLY_CHECKIN",
]);
export const followUpTypeEnum = pgEnum("follow_up_type", [
  "RENEWAL_REMINDER", "MONTHLY_CHECKIN", "CALLBACK_REQUESTED", "MANUAL", "POLICY_ANNIVERSARY",
]);
export const followUpStatusEnum = pgEnum("follow_up_status", [
  "PENDING", "IN_PROGRESS", "COMPLETED", "SKIPPED", "RESCHEDULED",
]);

export type LeadStage = "NEW" | "CONTACTED" | "INTERESTED" | "DOCS_PENDING" | "POLICY_ISSUED" | "RENEWAL_DUE" | "LOST" | "DO_NOT_CALL";
export type CallStatus = "INITIATED" | "RINGING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "NO_ANSWER" | "BUSY" | "CANCELLED";
```

### `lib/db/src/schema/leads.ts`

```typescript
import { pgTable, uuid, text, integer, bigint, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { genderEnum, insuranceTypeEnum, leadSourceEnum, leadStageEnum } from "./enums";

export const leadsTable = pgTable("leads", {
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
  last_contacted_at: timestamp("last_contacted_at", { withTimezone: true }),
  next_followup_at: timestamp("next_followup_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("leads_phone_idx").on(t.phone),
  index("leads_org_stage_idx").on(t.org_id, t.stage),
  index("leads_org_source_idx").on(t.org_id, t.source),
]);

export const insertLeadSchema = createInsertSchema(leadsTable);
export type LeadRow = typeof leadsTable.$inferSelect;
export type LeadInsert = typeof leadsTable.$inferInsert;
```

### `lib/db/src/schema/call-logs.ts`

```typescript
import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { callDirEnum, callStatusEnum } from "./enums";

export const callLogsTable = pgTable("call_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: text("org_id").notNull(),
  lead_id: uuid("lead_id"),
  bolna_execution_id: text("bolna_execution_id").notNull(),
  bolna_agent_id: text("bolna_agent_id").notNull(),
  agent_name: text("agent_name"),
  direction: callDirEnum("direction").notNull().default("OUTBOUND"),
  phone_number: text("phone_number").notNull(),
  status: callStatusEnum("status").notNull().default("INITIATED"),
  started_at: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  ended_at: timestamp("ended_at", { withTimezone: true }),
  duration_seconds: integer("duration_seconds"),
  transcript: text("transcript"),
  summary: text("summary"),
  recording_url: text("recording_url"),
  disposition_id: uuid("disposition_id"),
  drop_detected: boolean("drop_detected").notNull().default(false),
  drop_reason: text("drop_reason"),
  retry_of_call_id: uuid("retry_of_call_id"),
  retry_call_id: uuid("retry_call_id"),
  memory_injected: jsonb("memory_injected").$type<Record<string, unknown>>(),
  call_type: text("call_type"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("call_logs_phone_created_idx").on(t.phone_number, t.created_at),
  index("call_logs_agent_idx").on(t.bolna_agent_id),
  index("call_logs_org_status_idx").on(t.org_id, t.status),
  index("call_logs_lead_created_idx").on(t.lead_id, t.created_at),
]);

export const insertCallLogSchema = createInsertSchema(callLogsTable);
export type CallLogRow = typeof callLogsTable.$inferSelect;
export type CallLogInsert = typeof callLogsTable.$inferInsert;
```

### `lib/db/src/schema/policies.ts`

```typescript
import { pgTable, uuid, text, bigint, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { insuranceTypeEnum, policyStatusEnum, premiumFreqEnum } from "./enums";

export const policiesTable = pgTable("policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: text("org_id").notNull(),
  lead_id: uuid("lead_id").notNull(),
  policy_number: text("policy_number"),
  insurer_name: text("insurer_name"),
  policy_type: insuranceTypeEnum("policy_type").notNull().default("LIFE"),
  sum_assured: bigint("sum_assured", { mode: "number" }),
  annual_premium: bigint("annual_premium", { mode: "number" }),
  premium_frequency: premiumFreqEnum("premium_frequency").notNull().default("YEARLY"),
  start_date: timestamp("start_date", { withTimezone: true }),
  end_date: timestamp("end_date", { withTimezone: true }),
  renewal_date: timestamp("renewal_date", { withTimezone: true }),
  nominee_name: text("nominee_name"),
  nominee_relation: text("nominee_relation"),
  nominee_dob: timestamp("nominee_dob", { withTimezone: true }),
  status: policyStatusEnum("status").notNull().default("ACTIVE"),
  documents: jsonb("documents").$type<{ name: string; url: string }[]>().notNull().default([]),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("policies_org_renewal_idx").on(t.org_id, t.renewal_date),
  index("policies_lead_idx").on(t.lead_id),
]);

export const insertPolicySchema = createInsertSchema(policiesTable);
export type PolicyRow = typeof policiesTable.$inferSelect;
export type PolicyInsert = typeof policiesTable.$inferInsert;
```

### `lib/db/src/schema/follow-ups.ts`

```typescript
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { followUpTypeEnum, followUpStatusEnum } from "./enums";

export const followUpsTable = pgTable("follow_ups", {
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
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("follow_ups_org_sched_status_idx").on(t.org_id, t.scheduled_at, t.status),
  index("follow_ups_lead_idx").on(t.lead_id),
]);

export const insertFollowUpSchema = createInsertSchema(followUpsTable);
export type FollowUpRow = typeof followUpsTable.$inferSelect;
export type FollowUpInsert = typeof followUpsTable.$inferInsert;
```

### `lib/db/src/schema/automations.ts`

```typescript
import { pgTable, uuid, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { automationTypeEnum } from "./enums";

export const automationsTable = pgTable("automations", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: text("org_id").notNull(),
  name: text("name").notNull(),
  type: automationTypeEnum("type").notNull(),
  bolna_agent_id: text("bolna_agent_id").notNull(),
  trigger_config: jsonb("trigger_config").$type<Record<string, unknown>>().notNull().default({}),
  is_active: boolean("is_active").notNull().default(true),
  last_triggered_at: timestamp("last_triggered_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAutomationSchema = createInsertSchema(automationsTable);
export type AutomationRow = typeof automationsTable.$inferSelect;
export type AutomationInsert = typeof automationsTable.$inferInsert;
```

### `lib/db/src/schema/api-config.ts`

```typescript
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
  email_renewal_reminders: boolean("email_renewal_reminders").notNull().default(false),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertApiConfigSchema = createInsertSchema(apiConfigTable);
export type ApiConfigRow = typeof apiConfigTable.$inferSelect;
export type ApiConfigInsert = typeof apiConfigTable.$inferInsert;
```

### `lib/db/src/schema/team.ts`

```typescript
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const teamMembersTable = pgTable("team_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: text("org_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("AGENT"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTeamMemberSchema = createInsertSchema(teamMembersTable);
export type TeamMemberRow = typeof teamMembersTable.$inferSelect;
export type TeamMemberInsert = typeof teamMembersTable.$inferInsert;
```

### `lib/db/src/schema/dispositions.ts`

```typescript
import { pgTable, uuid, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const dispositionsTable = pgTable("dispositions", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: text("org_id").notNull(),
  bolna_agent_id: text("bolna_agent_id").notNull(),
  label: text("label").notNull(),
  color: text("color").notNull().default("#6366f1"),
  description: text("description"),
  is_active: boolean("is_active").notNull().default(true),
  sort_order: integer("sort_order").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("dispositions_org_agent_idx").on(t.org_id, t.bolna_agent_id),
]);

export const insertDispositionSchema = createInsertSchema(dispositionsTable);
export type DispositionRow = typeof dispositionsTable.$inferSelect;
export type DispositionInsert = typeof dispositionsTable.$inferInsert;
```

### `lib/db/src/schema/lead-sources.ts`

```typescript
import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const importHistoryTable = pgTable("import_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: text("org_id").notNull(),
  imported: integer("imported").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  errors: integer("errors").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhookLogsTable = pgTable("webhook_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: text("org_id").notNull(),
  source: text("source").notNull(),
  status: text("status").notNull(),
  message: text("message"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertImportHistorySchema = createInsertSchema(importHistoryTable);
export const insertWebhookLogSchema = createInsertSchema(webhookLogsTable);
export type ImportHistoryRow = typeof importHistoryTable.$inferSelect;
export type WebhookLogRow = typeof webhookLogsTable.$inferSelect;
```

### `lib/db/src/schema/index.ts`

```typescript
export * from "./enums";
export * from "./api-config";
export * from "./leads";
export * from "./policies";
export * from "./call-logs";
export * from "./dispositions";
export * from "./automations";
export * from "./follow-ups";
export * from "./team";
export * from "./lead-sources";
```

---

## Step 4: Backend — API Server

### `artifacts/api-server/package.json`

```json
{
  "name": "@workspace/api-server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "NODE_ENV=development tsx watch src/index.ts",
    "build": "node ./build.mjs",
    "start": "node --enable-source-maps ./dist/index.mjs",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@workspace/db": "workspace:*",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.6",
    "drizzle-orm": "^0.45.2",
    "express": "^5.2.1",
    "pino": "^9.14.0",
    "pino-http": "^10.5.0",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@types/cookie-parser": "^1.4.10",
    "@types/cors": "^2.8.19",
    "@types/express": "^5.0.6",
    "@types/node": "^22.0.0",
    "esbuild": "^0.25.0",
    "esbuild-plugin-pino": "^2.3.3",
    "pino-pretty": "^13.1.3",
    "tsx": "^4.21.0",
    "typescript": "~5.9.3"
  }
}
```

### `artifacts/api-server/src/index.ts`

```typescript
import app from "./app";
import { logger } from "./lib/logger";
import { resumeActiveCalls } from "./lib/call-engine";
import { startScheduler } from "./lib/scheduler";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT: "${rawPort}"`);

app.listen(port, (err) => {
  if (err) { logger.error({ err }, "Error listening"); process.exit(1); }
  logger.info({ port }, "Server listening");
  void resumeActiveCalls();
  startScheduler();
});
```

### `artifacts/api-server/src/app.ts`

```typescript
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();

app.use(pinoHttp({ logger,
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url?.split("?")[0] }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use("/api", router);

// Serve static frontend in production
if (process.env.NODE_ENV === "production") {
  const staticPath = path.resolve(__dirname, "../../../artifacts/web/dist/public");
  app.use(express.static(staticPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });
}

export default app;
```

### `artifacts/api-server/src/lib/logger.ts`

```typescript
import pino from "pino";
const isProduction = process.env.NODE_ENV === "production";
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(isProduction ? {} : { transport: { target: "pino-pretty" } }),
});
```

### `artifacts/api-server/src/lib/phone.ts`

```typescript
/** Strip everything except digits, then remove country code +91 or leading 0 */
export function normalizePhone(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) return digits.slice(1);
  return digits;
}

/** Convert 10-digit number to E.164 for Bolna */
export function toE164India(phone: string): string {
  const normalized = normalizePhone(phone);
  return `+91${normalized}`;
}
```

### `artifacts/api-server/src/lib/org.ts`

```typescript
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, apiConfigTable, type ApiConfigRow } from "@workspace/db";

export const DEFAULT_ORG_ID = "org_default";

function token(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

export function publicBaseUrl(): string {
  // Railway: set APP_BASE_URL in environment variables
  const appBase = process.env["APP_BASE_URL"];
  if (appBase) return appBase;
  // Replit fallback
  const domain = process.env["REPLIT_DEV_DOMAIN"];
  if (domain) return `https://${domain}`;
  return "";
}

export async function ensureApiConfig(): Promise<ApiConfigRow> {
  const existing = await db.select().from(apiConfigTable)
    .where(eq(apiConfigTable.org_id, DEFAULT_ORG_ID));
  if (existing[0]) return existing[0];

  const [row] = await db.insert(apiConfigTable)
    .values({
      org_id: DEFAULT_ORG_ID,
      webhook_secret: token(16),
      context_api_bearer_token: token(24),
    })
    .onConflictDoNothing({ target: apiConfigTable.org_id })
    .returning();
  if (row) return row;
  const [again] = await db.select().from(apiConfigTable)
    .where(eq(apiConfigTable.org_id, DEFAULT_ORG_ID));
  return again!;
}

export function serializeApiConfig(row: ApiConfigRow) {
  const base = publicBaseUrl();
  return {
    ...row,
    context_api_url: `${base}/api/context`,
    meta_webhook_url: `${base}/api/webhooks/meta`,
    website_form_webhook_url: `${base}/api/webhooks/website-form?secret=${row.webhook_secret}`,
    bolna_webhook_url: `${base}/api/webhooks/bolna`,
  };
}
```

### `artifacts/api-server/src/lib/bolna.ts`

```typescript
import { ensureApiConfig } from "./org";
import { toE164India } from "./phone";
import { logger } from "./logger";

export type BolnaResult<T> = { success: true; data: T } | { success: false; error: string };

async function getKeys() {
  const cfg = await ensureApiConfig();
  if (!cfg.bolna_api_key) return { error: "Bolna API key not configured. Add it in Settings." };
  return { apiKey: cfg.bolna_api_key, baseUrl: (cfg.bolna_base_url || "https://api.bolna.ai").replace(/\/$/, "") };
}

async function request<T>(path: string, init: RequestInit): Promise<BolnaResult<T>> {
  const keys = await getKeys();
  if ("error" in keys) return { success: false, error: keys.error };
  try {
    const res = await fetch(`${keys.baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${keys.apiKey}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    const text = await res.text();
    let body: unknown;
    try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
    if (!res.ok) {
      const message = (body && typeof body === "object" && "message" in body)
        ? String((body as Record<string, unknown>)["message"])
        : `Bolna API error (${res.status})`;
      return { success: false, error: message };
    }
    return { success: true, data: body as T };
  } catch (err) {
    logger.error({ err, path }, "Bolna request failed");
    return { success: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

function asArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    for (const key of ["data", "agents", "results", "phone_numbers"]) {
      if (Array.isArray((data as Record<string, unknown>)[key]))
        return (data as Record<string, unknown>)[key] as Record<string, unknown>[];
    }
  }
  return [];
}

function str(v: unknown) { return v == null ? null : String(v); }

export const bolna = {
  async testConnection() {
    const res = await request<unknown>("/v2/agent/all", { method: "GET" });
    if (!res.success) return res;
    return { success: true as const, data: true };
  },

  async listAgents() {
    const res = await request<unknown>("/v2/agent/all", { method: "GET" });
    if (!res.success) return res;
    const agents = asArray(res.data).map((a) => {
      const cfg = (a["agent_config"] ?? {}) as Record<string, unknown>;
      return {
        id: str(a["id"] ?? a["agent_id"]) ?? "",
        name: str(a["agent_name"] ?? cfg["agent_name"] ?? a["name"]) ?? "Agent",
        tags: Array.isArray(a["tags"]) ? a["tags"] as string[] : [],
        phone_numbers: Array.isArray(a["phone_numbers"]) ? a["phone_numbers"] as string[] : [],
      };
    });
    return { success: true as const, data: agents };
  },

  async listPhoneNumbers() {
    const res = await request<unknown>("/phone-numbers/all", { method: "GET" });
    if (!res.success) return res;
    const numbers = asArray(res.data).map((p) => ({
      id: str(p["id"] ?? p["phone_number_id"]) ?? "",
      phone_number: str(p["phone_number"] ?? p["number"]) ?? "",
      agent_id: str(p["agent_id"]),
      agent_name: str(p["agent_name"]),
    }));
    return { success: true as const, data: numbers };
  },

  async startCall(opts: { agentId: string; phone: string; variables?: Record<string, unknown> }) {
    const res = await request<Record<string, unknown>>("/call", {
      method: "POST",
      body: JSON.stringify({
        agent_id: opts.agentId,
        recipient_phone_number: toE164India(opts.phone),
        user_data: opts.variables ?? {},
      }),
    });
    if (!res.success) return res;
    const execId = str(res.data["execution_id"] ?? res.data["call_id"] ?? res.data["id"]) ?? "";
    return { success: true as const, data: { execution_id: execId, status: str(res.data["status"]) ?? "queued" } };
  },

  async getExecution(executionId: string) {
    const res = await request<Record<string, unknown>>(`/executions/${executionId}`, { method: "GET" });
    if (!res.success) return res;
    const d = res.data;
    const rawStatus = (str(d["status"]) ?? "").toLowerCase();
    const ended = ["completed","stopped","error","failed","busy","no-answer","no_answer","cancelled","canceled"].includes(rawStatus);
    return {
      success: true as const,
      data: {
        status: rawStatus || "in_progress",
        transcript: str(d["transcript"]),
        summary: str(d["summary"] ?? d["extracted_data"]),
        recording_url: str(d["recording_url"]),
        duration_seconds: typeof d["duration_seconds"] === "number" ? d["duration_seconds"] : null,
        ended,
      },
    };
  },
};

export function mapBolnaStatusToCallStatus(status: string) {
  const s = status.toLowerCase();
  if (["completed","stopped"].includes(s)) return "COMPLETED" as const;
  if (["error","failed"].includes(s)) return "FAILED" as const;
  if (["no-answer","no_answer"].includes(s)) return "NO_ANSWER" as const;
  if (s === "busy") return "BUSY" as const;
  if (["cancelled","canceled"].includes(s)) return "CANCELLED" as const;
  if (s === "ringing") return "RINGING" as const;
  if (["in-progress","in_progress","ongoing","running"].includes(s)) return "IN_PROGRESS" as const;
  return "INITIATED" as const;
}
```

### `artifacts/api-server/src/lib/brevo.ts`

```typescript
import { ensureApiConfig } from "./org";
import { normalizePhone } from "./phone";
import { logger } from "./logger";

async function brevoFetch(path: string, apiKey: string, body: unknown) {
  const res = await fetch(`https://api.brevo.com/v3${path}`, {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    logger.warn({ path, status: res.status }, "Brevo request failed");
    return { success: false };
  }
  return { success: true };
}

export async function sendSMS(phone: string, message: string) {
  try {
    const cfg = await ensureApiConfig();
    if (!cfg.brevo_api_key) return { success: false };
    const digits = normalizePhone(phone);
    if (digits.length !== 10) return { success: false };
    return await brevoFetch("/transactionalSMS/sms", cfg.brevo_api_key, {
      sender: cfg.brevo_sender_name || "VoiceCRM",
      recipient: `+91${digits}`,
      content: message,
    });
  } catch (err) {
    logger.error({ err }, "Brevo sendSMS failed");
    return { success: false };
  }
}

export async function sendEmail(to: string, subject: string, htmlContent: string) {
  try {
    const cfg = await ensureApiConfig();
    if (!cfg.brevo_api_key) return { success: false };
    return await brevoFetch("/smtp/email", cfg.brevo_api_key, {
      sender: { name: cfg.brevo_sender_name || "VoiceCRM", email: "no-reply@voicecrm.app" },
      to: [{ email: to }],
      subject,
      htmlContent,
    });
  } catch (err) {
    logger.error({ err }, "Brevo sendEmail failed");
    return { success: false };
  }
}
```

### `artifacts/api-server/src/lib/events.ts`

```typescript
import type { Response } from "express";
import type { SerializedCallLog } from "./serialize";

const clients = new Set<Response>();

export function addClient(res: Response) { clients.add(res); }
export function removeClient(res: Response) { clients.delete(res); }

export function emitCallUpdate(log: SerializedCallLog) {
  const data = `event: call_update\ndata: ${JSON.stringify(log)}\n\n`;
  for (const res of clients) { try { res.write(data); } catch { clients.delete(res); } }
}

export type LiveFeedEvent = { type: "call_update"; data: SerializedCallLog };
export function liveFeed(res: Response) {
  addClient(res);
  return () => removeClient(res);
}
```

### `artifacts/api-server/src/lib/context.ts`

```typescript
import { and, desc, eq, lte } from "drizzle-orm";
import { db, leadsTable, policiesTable, callLogsTable, followUpsTable } from "@workspace/db";
import { DEFAULT_ORG_ID } from "./org";
import { normalizePhone } from "./phone";

const DROP_RETRY_WINDOW_MS = 15 * 60 * 1000;
const PENDING_FOLLOWUP_WINDOW_MS = 5 * 60 * 1000;

function firstName(fullName: string) {
  return (fullName ?? "").trim().split(/\s+/)[0] ?? "";
}

export async function buildCallContext(rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  const [lead] = await db.select().from(leadsTable)
    .where(and(eq(leadsTable.org_id, DEFAULT_ORG_ID), eq(leadsTable.phone, phone)))
    .limit(1);

  if (!lead) return {
    call_type: "inbound_new", user_name: "", gender: "", city: "",
    insurance_type: "", context: "", opening_line: "", previous_execution_id: "",
  };

  const now = Date.now();
  const [lastCall] = await db.select().from(callLogsTable)
    .where(eq(callLogsTable.lead_id, lead.id))
    .orderBy(desc(callLogsTable.created_at)).limit(1);

  const [pendingCallback] = await db.select().from(followUpsTable)
    .where(and(
      eq(followUpsTable.lead_id, lead.id),
      eq(followUpsTable.status, "PENDING"),
      eq(followUpsTable.type, "CALLBACK_REQUESTED"),
      lte(followUpsTable.scheduled_at, new Date(now + PENDING_FOLLOWUP_WINDOW_MS)),
    ))
    .orderBy(desc(followUpsTable.scheduled_at)).limit(1);

  const [policy] = await db.select().from(policiesTable)
    .where(eq(policiesTable.lead_id, lead.id))
    .orderBy(desc(policiesTable.created_at)).limit(1);

  const base = {
    user_name: lead.full_name,
    gender: (lead.gender ?? "").toLowerCase(),
    city: lead.city ?? "",
    insurance_type: (lead.insurance_type ?? "").toLowerCase(),
    lead_id: lead.id,
  };

  if (!lastCall) return { ...base, call_type: "new", context: "", opening_line: "", previous_execution_id: "" };

  const lastSummary = lastCall.summary ?? "";
  const lastExecId = lastCall.bolna_execution_id ?? "";

  if (lastCall.drop_detected && lastCall.created_at && now - lastCall.created_at.getTime() < DROP_RETRY_WINDOW_MS) {
    return { ...base, call_type: "drop_retry", context: lastSummary,
      opening_line: `${firstName(lead.full_name)} ji, maafi chahta hoon — lagta hai network ki wajah se call cut ho gayi thi.`,
      previous_execution_id: lastExecId, previous_summary: lastSummary,
    };
  }

  if (pendingCallback) {
    return { ...base, call_type: "callback", context: lastSummary,
      opening_line: `${firstName(lead.full_name)} ji, aapne humse baad mein call karne ko kaha tha. Kya abhi baat kar sakte hain?`,
      callback_reason: pendingCallback.notes ?? "", previous_execution_id: lastExecId,
    };
  }

  return { ...base, call_type: "inbound_known", context: lastSummary, opening_line: "", previous_execution_id: lastExecId,
    policy_number: policy?.policy_number ?? undefined,
    renewal_date: policy?.renewal_date ? policy.renewal_date.toISOString().slice(0, 10) : undefined,
    account_status: lead.stage,
  };
}
```

---

## Step 5: Key Route Implementations

### `artifacts/api-server/src/routes/health.ts`

```typescript
import { Router } from "express";
const router = Router();
router.get("/health", (req, res) => res.json({ ok: true, ts: Date.now() }));
export default router;
```

### `artifacts/api-server/src/routes/misc.ts` (Webhooks + SSE + Context)

```typescript
import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, leadsTable, callLogsTable, webhookLogsTable } from "@workspace/db";
import { DEFAULT_ORG_ID, ensureApiConfig } from "../lib/org";
import { normalizePhone } from "../lib/phone";
import { buildCallContext } from "../lib/context";
import { triggerCall, startPolling } from "../lib/call-engine";
import { bolna, mapBolnaStatusToCallStatus } from "../lib/bolna";
import { serializeCallLog } from "../lib/serialize";
import { logger } from "../lib/logger";

const router = Router();

function pickField(data: Record<string, unknown>, keys: string[]) {
  for (const k of keys) {
    const v = data[k];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return null;
}

function checkSecret(req: any, secret: string): boolean {
  return req.query["secret"] === secret;
}

async function logWebhook(source: string, status: string, message: string) {
  await db.insert(webhookLogsTable).values({ org_id: DEFAULT_ORG_ID, source, status, message }).catch(() => {});
}

async function ingestLead(opts: {
  source: "META_ADS" | "WEBSITE_FORM";
  fullName: string | null; phone: string | null; email: string | null;
  city: string | null; insuranceType: string | null;
  campaignId?: string | null; formId?: string | null;
}): Promise<{ ok: boolean; message: string }> {
  if (!opts.fullName || !opts.phone) return { ok: false, message: "Missing name or phone" };
  const phone = normalizePhone(opts.phone);
  if (phone.length !== 10) return { ok: false, message: "Invalid phone" };

  const existing = await db.select({ id: leadsTable.id }).from(leadsTable)
    .where(and(eq(leadsTable.org_id, DEFAULT_ORG_ID), eq(leadsTable.phone, phone)));
  if (existing[0]) return { ok: false, message: "Duplicate lead" };

  const validInsTypes = ["LIFE","HEALTH","MOTOR","TERM","ULIP","ENDOWMENT","ACCIDENT","TRAVEL"] as const;
  type InsType = typeof validInsTypes[number];
  const insType = (opts.insuranceType ?? "").toUpperCase() as InsType;
  const validInsType = validInsTypes.find(t => t === insType);

  const [lead] = await db.insert(leadsTable).values({
    org_id: DEFAULT_ORG_ID, full_name: opts.fullName, phone, email: opts.email,
    city: opts.city, insurance_type: validInsType ?? null, source: opts.source,
    source_campaign_id: opts.campaignId ?? null, source_form_id: opts.formId ?? null,
  }).returning();

  // Auto-call in background
  void (async () => {
    try {
      const { automationsTable } = await import("@workspace/db");
      const autos = await db.select().from(automationsTable).where(and(
        eq(automationsTable.org_id, DEFAULT_ORG_ID),
        eq(automationsTable.type, "AUTO_CALL_ON_LEAD"),
        eq(automationsTable.is_active, true),
      ));
      if (autos[0] && lead) {
        const outcome = await triggerCall({
          agentId: autos[0].bolna_agent_id, phone: lead.phone,
          leadId: lead.id, callType: "new_lead",
        });
        if (outcome.success) logger.info({ leadId: lead.id }, "auto-call triggered");
        else logger.error({ leadId: lead.id, error: outcome.error }, "auto-call failed");
      }
    } catch (err) {
      logger.error({ err }, "auto-call after webhook lead failed");
    }
  })();

  return { ok: true, message: `Lead created: ${lead!.id}` };
}

// ── SSE Live Feed ──────────────────────────────────────────────────────────
router.get("/live-feed", (req, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
  res.write("event: ping\ndata: {}\n\n");
  const { addClient, removeClient } = require("../lib/events");
  addClient(res);
  const heartbeat = setInterval(() => { try { res.write("event: ping\ndata: {}\n\n"); } catch { clearInterval(heartbeat); } }, 30000);
  req.on("close", () => { clearInterval(heartbeat); removeClient(res); });
});

// ── Context API (for Bolna memory injection) ───────────────────────────────
router.get("/context", async (req, res): Promise<void> => {
  const cfg = await ensureApiConfig();
  const token = req.headers["authorization"]?.replace("Bearer ", "") ?? req.query["token"];
  if (token !== cfg.context_api_bearer_token) { res.status(401).json({ error: "Unauthorized" }); return; }
  const phone = String(req.query["phone"] ?? "");
  if (!phone) { res.status(400).json({ error: "phone required" }); return; }
  const ctx = await buildCallContext(phone);
  res.json(ctx);
});

// ── Meta Webhook Verification (GET) ───────────────────────────────────────
router.get("/webhooks/meta", async (req, res): Promise<void> => {
  const cfg = await ensureApiConfig();
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === cfg.webhook_secret) {
    res.status(200).send(String(challenge ?? ""));
    return;
  }
  res.status(403).json({ error: "Verification failed" });
});

// ── Meta Webhook Lead (POST) ── Respond immediately, process in background ─
router.post("/webhooks/meta", (req, res): void => {
  res.status(200).send("EVENT_RECEIVED");  // Must respond immediately

  void (async () => {
    try {
      const cfg = await ensureApiConfig();
      if (!checkSecret(req, cfg.webhook_secret)) { logger.warn("Meta webhook: invalid secret"); return; }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const fieldData: Record<string, unknown> = {};
      const rawFields = body["field_data"];
      if (Array.isArray(rawFields)) {
        for (const f of rawFields as Record<string, unknown>[]) {
          const name = String(f["name"] ?? "");
          const values = f["values"];
          fieldData[name] = Array.isArray(values) ? values[0] : f["value"];
        }
      }
      const merged = { ...body, ...fieldData };
      const result = await ingestLead({
        source: "META_ADS",
        fullName: pickField(merged, ["full_name", "name", "fullName"]),
        phone: pickField(merged, ["phone", "phone_number", "phoneNumber"]),
        email: pickField(merged, ["email"]),
        city: pickField(merged, ["city"]),
        insuranceType: pickField(merged, ["insurance_type", "insuranceType"]),
        campaignId: pickField(merged, ["campaign_id", "campaignId"]),
        formId: pickField(merged, ["form_id", "formId"]),
      });
      await logWebhook("META_ADS", result.ok ? "SUCCESS" : "SKIPPED", result.message);
    } catch (err) {
      logger.error({ err }, "Meta webhook background processing failed");
    }
  })();
});

// ── Website Form Webhook ───────────────────────────────────────────────────
router.post("/webhooks/website-form", async (req, res): Promise<void> => {
  const cfg = await ensureApiConfig();
  if (!checkSecret(req, cfg.webhook_secret)) { res.status(401).json({ error: "Invalid secret" }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const result = await ingestLead({
    source: "WEBSITE_FORM",
    fullName: pickField(body, ["full_name", "name", "fullName"]),
    phone: pickField(body, ["phone", "phone_number", "mobile"]),
    email: pickField(body, ["email"]),
    city: pickField(body, ["city"]),
    insuranceType: pickField(body, ["insurance_type", "insuranceType"]),
  });
  await logWebhook("WEBSITE_FORM", result.ok ? "SUCCESS" : "SKIPPED", result.message);
  res.json({ received: true, ...result });
});

// ── Bolna Callback Webhook ─────────────────────────────────────────────────
router.post("/webhooks/bolna", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const executionId = String(body["execution_id"] ?? body["call_id"] ?? body["id"] ?? "");
  if (!executionId) { res.json({ received: true }); return; }

  let [row] = await db.select().from(callLogsTable)
    .where(eq(callLogsTable.bolna_execution_id, executionId));

  // Call made directly from Bolna — create log on the fly
  if (!row) {
    const rawPhone = String(body["to"] ?? body["recipient_phone_number"] ?? body["phone_number"] ?? "");
    const phone = normalizePhone(rawPhone);
    const agentId = String(body["agent_id"] ?? body["bolna_agent_id"] ?? "");
    if (!agentId) { res.json({ received: true }); return; }

    const [lead] = phone.length === 10
      ? await db.select({ id: leadsTable.id }).from(leadsTable)
          .where(and(eq(leadsTable.org_id, DEFAULT_ORG_ID), eq(leadsTable.phone, phone))).limit(1)
      : [];

    const [created] = await db.insert(callLogsTable).values({
      org_id: DEFAULT_ORG_ID, lead_id: lead?.id ?? null, bolna_execution_id: executionId,
      bolna_agent_id: agentId, direction: "OUTBOUND", phone_number: phone || rawPhone,
      status: mapBolnaStatusToCallStatus(String(body["status"] ?? "completed")),
      call_type: "manual_bolna",
    }).returning();
    if (!created) { res.json({ received: true }); return; }
    row = created;
  }

  const exec = await bolna.getExecution(executionId);
  if (exec.success) {
    const status = mapBolnaStatusToCallStatus(exec.data.status);
    const dropDetected = !exec.data.ended ? false :
      (exec.data.duration_seconds != null && exec.data.duration_seconds < 10) ||
      ["FAILED","NO_ANSWER","BUSY","CANCELLED"].includes(status);
    const [updated] = await db.update(callLogsTable).set({
      status, transcript: exec.data.transcript, summary: exec.data.summary,
      recording_url: exec.data.recording_url, duration_seconds: exec.data.duration_seconds,
      ended_at: exec.data.ended ? new Date() : row.ended_at, drop_detected: dropDetected,
    }).where(eq(callLogsTable.id, row.id)).returning();
    if (updated && !exec.data.ended) startPolling(updated.id, executionId);
    if (updated) {
      const { emitCallUpdate } = await import("../lib/events");
      emitCallUpdate(await serializeCallLog(updated));
    }
  }
  res.json({ received: true });
});

// ── Webhook Logs ───────────────────────────────────────────────────────────
router.get("/webhooks/logs", async (req, res): Promise<void> => {
  const logs = await db.select().from(webhookLogsTable)
    .where(eq(webhookLogsTable.org_id, DEFAULT_ORG_ID))
    .orderBy(webhookLogsTable.created_at).limit(100);
  res.json(logs.reverse());
});

export default router;
```

---

## Step 6: Frontend Setup

### `artifacts/web/vite.config.ts`

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  base: "/",   // Root path — Railway serves from /
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: Number(process.env.PORT) || 3000,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.API_PORT || 8080}`,
        changeOrigin: true,
      },
    },
  },
});
```

### `artifacts/web/src/App.tsx`

```tsx
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import Leads from "@/pages/leads";
import LeadDetail from "@/pages/lead-detail";
import Calls from "@/pages/calls";
import CallDetail from "@/pages/call-detail";
import Policies from "@/pages/policies";
import FollowUps from "@/pages/follow-ups";
import Agents from "@/pages/agents";
import LeadSources from "@/pages/lead-sources";
import Settings from "@/pages/settings";
import Team from "@/pages/team";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base="">
          <AppLayout>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/leads" component={Leads} />
              <Route path="/leads/:id" component={LeadDetail} />
              <Route path="/calls" component={Calls} />
              <Route path="/calls/:id" component={CallDetail} />
              <Route path="/policies" component={Policies} />
              <Route path="/follow-ups" component={FollowUps} />
              <Route path="/agents" component={Agents} />
              <Route path="/lead-sources" component={LeadSources} />
              <Route path="/settings" component={Settings} />
              <Route path="/team" component={Team} />
            </Switch>
          </AppLayout>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
```

---

## Step 7: Context Variables for Bolna System Prompt

When VoiceCRM triggers a call, it injects this context into Bolna's `user_data`. Use `{{variable_name}}` in your Bolna agent system prompt:

| Variable | Always? | Value |
|---|---|---|
| `{{call_type}}` | ✅ | `new` / `drop_retry` / `callback` / `inbound_known` / `inbound_new` |
| `{{user_name}}` | ✅ | Lead's full name |
| `{{gender}}` | ✅ | `male` / `female` / `other` |
| `{{city}}` | ✅ | City name |
| `{{insurance_type}}` | ✅ | `life` / `health` / `motor` etc. |
| `{{lead_id}}` | ✅ | UUID |
| `{{context}}` | ✅ | Summary of last call (empty if first call) |
| `{{opening_line}}` | ✅ | Pre-built opener (empty if not needed) |
| `{{previous_execution_id}}` | ✅ | Last Bolna execution ID |
| `{{previous_summary}}` | drop_retry | Summary of dropped call |
| `{{callback_reason}}` | callback | Why they asked for callback |
| `{{policy_number}}` | If policy exists | e.g. `LIC-2024-9876` |
| `{{renewal_date}}` | If policy exists | `YYYY-MM-DD` |
| `{{account_status}}` | inbound_known | Lead stage |

---

## Step 8: Webhook Configuration

### Bolna webhook URL (paste in Bolna agent settings)
```
https://YOUR-RAILWAY-DOMAIN.up.railway.app/api/webhooks/bolna
```

### Meta webhook URL (paste in Meta Business Manager)
```
Callback URL: https://YOUR-RAILWAY-DOMAIN.up.railway.app/api/webhooks/meta
Verify Token: <webhook_secret from your database — visible in Settings page>
```

### Website form webhook URL
```
https://YOUR-RAILWAY-DOMAIN.up.railway.app/api/webhooks/website-form?secret=<webhook_secret>
```

### Example website form POST payload
```json
{
  "full_name": "Ramesh Kumar",
  "phone": "9876543210",
  "email": "ramesh@gmail.com",
  "city": "Mumbai",
  "insurance_type": "LIFE"
}
```

---

## Step 9: Database Migration

After first deploy, run the Drizzle migration to create all tables:

```bash
# In Railway shell (or locally with Railway DATABASE_URL)
export DATABASE_URL="postgresql://..."
cd lib/db && npx drizzle-kit push
```

Or add to `railway.json` as a one-time command in the build phase.

---

## Step 10: Final Deployment Checklist

- [ ] All environment variables set in Railway
- [ ] `APP_BASE_URL` set to your Railway domain
- [ ] `railway.json` created at project root
- [ ] Database tables created (`drizzle-kit push`)
- [ ] First deploy successful — check `/api/health` returns `{ ok: true }`
- [ ] Settings page shows your webhook URLs
- [ ] Bolna webhook URL updated in Bolna dashboard
- [ ] Meta webhook verified (GET verification working)
- [ ] Test lead created via website form webhook
- [ ] Test call triggered from Agents page

---

## Complete Environment Variable Reference

```env
# ── Required ─────────────────────────────────────────────────────────────
NODE_ENV=production
PORT=8080
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
APP_BASE_URL=https://YOUR-APP.up.railway.app

# ── Bolna (AI Voice) ─────────────────────────────────────────────────────
BOLNA_API_KEY=
BOLNA_BASE_URL=https://api.bolna.ai

# ── Brevo (SMS + Email) ──────────────────────────────────────────────────
BREVO_API_KEY=
BREVO_SENDER_NAME=VoiceCRM

# ── Meta Ads ─────────────────────────────────────────────────────────────
META_ADS_ACCESS_TOKEN=
META_ADS_ACCOUNT_ID=

# ── Optional ─────────────────────────────────────────────────────────────
LOG_LEVEL=info
```

---

## Feature: Auto-Callback Scheduling from Call Transcript

### How it works

After every completed call, VoiceCRM reads the **transcript + summary** returned by Bolna and checks for callback requests in Hindi and English. If detected, it automatically creates a `CALLBACK_REQUESTED` follow-up in the database. The background scheduler (runs every 60 seconds) then dials the lead at the scheduled time using the same Bolna agent.

This works for calls triggered from VoiceCRM **and** calls made directly from the Bolna dashboard.

### Callback time resolution table

| Customer says | Scheduled at |
|---|---|
| *"do minute baad call karo"* | 2 minutes after call ends |
| *"5 minute baad"* | 5 minutes after call ends |
| *"ek ghante baad"* | 1 hour after call ends |
| *"kal do baje ke baad"* | Tomorrow 2 PM IST |
| *"kal subah"* | Tomorrow 9 AM IST |
| *"kal shaam"* | Tomorrow 5 PM IST |
| *"kal dopahar"* | Tomorrow 2 PM IST |
| *"kal raat"* | Tomorrow 8 PM IST |
| *"parso teen baje"* | Day after tomorrow 3 PM IST |
| *"call karo"* (no time) | 2 hours from now (default) |
| *"kal"* (no time) | Tomorrow 10 AM IST (default) |

### Callback detection signals (any of these trigger parsing)

```
"call back", "callback", "call kar", "call karo", "call karen", "call kijiye",
"call karna", "wapas call", "phir call", "baad mein call", "baad call",
"bad mein call", "call karti hoon", "call karta hoon", "call karenge",
"call later", "call again"
```

### Implementation — add to `artifacts/api-server/src/lib/call-engine.ts`

Add this entire block at the **top of the file**, after imports:

```typescript
// ── Callback intent parser ────────────────────────────────────────────────────

const HINDI_NUMS: Record<string, number> = {
  ek: 1, do: 2, teen: 3, char: 4, paanch: 5, chhe: 6, chhah: 6,
  saat: 7, aath: 8, nau: 9, das: 10, gyarah: 11, barah: 12,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

function toNum(s: string): number {
  return HINDI_NUMS[s.toLowerCase()] ?? Number(s);
}

const HINDI_NUM_PAT = Object.keys(HINDI_NUMS).join("|");
const NUM_PAT = `(\\d+|${HINDI_NUM_PAT})`;

/** Returns the IST wall-clock Date for a given hour/minute on a given UTC Date */
function istDateTime(base: Date, hour: number, minute = 0): Date {
  const d = new Date(base);
  d.setUTCHours(hour - 5, minute - 30, 0, 0); // IST = UTC+5:30
  return d;
}

/**
 * Parse a callback time hint out of call transcript + summary text.
 * Returns { scheduledAt, notes } if a callback was requested, or null otherwise.
 * All times are anchored to IST.
 */
export function parseCallbackIntent(
  text: string,
  callEndedAt: Date = new Date(),
): { scheduledAt: Date; notes: string } | null {
  if (!text || text.trim().length < 5) return null;

  const lower = text.toLowerCase();

  const callbackSignals = [
    "call back", "callback", "call kar", "call karo", "call karen", "call kijiye",
    "call karna", "wapas call", "phir call", "baad mein call", "baad call",
    "bad mein call", "call karti hoon", "call karta hoon", "call karenge",
    "call later", "call again",
  ];
  if (!callbackSignals.some((s) => lower.includes(s))) return null;

  // ── Relative: "X minute(s) baad" ─────────────────────────────────────────
  const minRx = new RegExp(
    `${NUM_PAT}\\s*(?:minute|minutes|min|mins)\\s*(?:baad|bad|ke baad|after|later)`,
    "i",
  );
  const minMatch = lower.match(minRx);
  if (minMatch) {
    const n = toNum(minMatch[1]!);
    const scheduledAt = new Date(callEndedAt.getTime() + n * 60 * 1000);
    return { scheduledAt, notes: `Customer requested callback in ${n} minute(s)` };
  }

  // ── Relative: "X ghante/hour(s) baad" ────────────────────────────────────
  const hrRx = new RegExp(
    `${NUM_PAT}\\s*(?:ghante|ghanta|hour|hours|hr|hrs)\\s*(?:baad|bad|ke baad|after|later)`,
    "i",
  );
  const hrMatch = lower.match(hrRx);
  if (hrMatch) {
    const n = toNum(hrMatch[1]!);
    const scheduledAt = new Date(callEndedAt.getTime() + n * 60 * 60 * 1000);
    return { scheduledAt, notes: `Customer requested callback in ${n} hour(s)` };
  }

  // ── Tomorrow / kal ────────────────────────────────────────────────────────
  const isTomorrow = /\b(kal|tomorrow|agle din|next day)\b/.test(lower);
  const isDayAfter = /\b(parso|परसों|day after tomorrow)\b/.test(lower);
  const baseDay = new Date(callEndedAt);
  if (isDayAfter) baseDay.setDate(baseDay.getDate() + 2);
  else if (isTomorrow) baseDay.setDate(baseDay.getDate() + 1);

  if (isTomorrow || isDayAfter) {
    const digitTimeRx = /(\d{1,2})(?::(\d{2}))?\s*(?:baje|bajey|baj|am\b|pm\b)/i;
    const dtm = lower.match(digitTimeRx);
    if (dtm) {
      let h = Number(dtm[1]);
      const m = dtm[2] ? Number(dtm[2]) : 0;
      if (/pm/i.test(dtm[0]) && h < 12) h += 12;
      if (/am/i.test(dtm[0]) && h === 12) h = 0;
      if (h <= 7 && !/am/i.test(dtm[0])) h += 12;
      return {
        scheduledAt: istDateTime(baseDay, h, m),
        notes: `Customer requested callback ${isTomorrow ? "tomorrow" : "day after tomorrow"} at ${h}:${String(m).padStart(2, "0")}`,
      };
    }

    const hindiTimeRx = new RegExp(`(${HINDI_NUM_PAT})\\s*(?:baje|bajey|baj|ke baad)`, "i");
    const htm = lower.match(hindiTimeRx);
    if (htm) {
      let h = toNum(htm[1]!);
      if (h <= 7) h += 12;
      return {
        scheduledAt: istDateTime(baseDay, h),
        notes: `Customer requested callback ${isTomorrow ? "tomorrow" : "day after"} at ${h}:00`,
      };
    }

    if (/\b(subah|morning|sawere)\b/.test(lower))
      return { scheduledAt: istDateTime(baseDay, 9), notes: "Customer requested callback tomorrow morning" };
    if (/\b(shaam|evening|sham)\b/.test(lower))
      return { scheduledAt: istDateTime(baseDay, 17), notes: "Customer requested callback tomorrow evening" };
    if (/\b(dopahar|afternoon|duphar)\b/.test(lower))
      return { scheduledAt: istDateTime(baseDay, 14), notes: "Customer requested callback tomorrow afternoon" };
    if (/\b(raat|night)\b/.test(lower))
      return { scheduledAt: istDateTime(baseDay, 20), notes: "Customer requested callback tomorrow night" };

    return { scheduledAt: istDateTime(baseDay, 10), notes: "Customer requested callback tomorrow (defaulted to 10 AM)" };
  }

  // ── Generic callback with no time → 2 hours from now ─────────────────────
  return {
    scheduledAt: new Date(callEndedAt.getTime() + 2 * 60 * 60 * 1000),
    notes: "Customer requested a callback (time unspecified, defaulted to 2 hours)",
  };
}

export async function maybeScheduleCallback(call: CallLogRow): Promise<void> {
  if (!call.lead_id) return;
  try {
    const text = [call.transcript ?? "", call.summary ?? ""].join(" ");
    const intent = parseCallbackIntent(text, call.ended_at ?? new Date());
    if (!intent) return;

    await db.insert(followUpsTable).values({
      org_id: call.org_id,
      lead_id: call.lead_id,
      type: "CALLBACK_REQUESTED",
      scheduled_at: intent.scheduledAt,
      bolna_agent_id: call.bolna_agent_id,
      call_log_id: call.id,
      notes: intent.notes,
      status: "PENDING",
    });

    await db
      .update(leadsTable)
      .set({ next_followup_at: intent.scheduledAt })
      .where(eq(leadsTable.id, call.lead_id));

    logger.info(
      { callId: call.id, leadId: call.lead_id, scheduledAt: intent.scheduledAt },
      "auto-scheduled callback follow-up from call transcript",
    );
  } catch (err) {
    logger.error({ err, callId: call.id }, "maybeScheduleCallback failed");
  }
}
```

### Wire-up — two places to call `maybeScheduleCallback`

**1. In `startPolling` — after `maybeAdvanceLeadStage`** (calls triggered from VoiceCRM):

```typescript
if (exec.ended || polls >= MAX_POLLS) {
  activePolls.delete(callLogId);
  if (updated && dropDetected) await maybeRetryOnDrop(updated);
  if (updated && !dropDetected && updated.status === "COMPLETED") {
    await maybeAdvanceLeadStage(updated);
    await maybeScheduleCallback(updated);   // ← add this line
  }
  return;
}
```

**2. In `routes/misc.ts` Bolna webhook handler** (calls made directly from Bolna):

```typescript
// Add to imports at top
import { triggerCall, startPolling, maybeScheduleCallback } from "../lib/call-engine";

// In the bolna webhook handler, after the update block:
if (updated && !exec.data.ended) {
  startPolling(updated.id, executionId);
}
if (updated && exec.data.ended && !dropDetected && status === "COMPLETED") {
  void maybeScheduleCallback(updated);   // ← add this block
}
```

### DB impact

`maybeScheduleCallback` inserts one row into `follow_ups` with:

| Column | Value |
|---|---|
| `type` | `CALLBACK_REQUESTED` |
| `status` | `PENDING` |
| `scheduled_at` | Parsed from transcript |
| `bolna_agent_id` | Same agent that made the original call |
| `call_log_id` | Source call log UUID |
| `notes` | Human-readable description of what was parsed |

The scheduler picks it up automatically on the next 60-second tick and dials the lead.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `DATABASE_URL` SSL error | Add `?sslmode=require` to the URL |
| Frontend 404 on refresh | Make sure Express serves `index.html` for all non-`/api` routes |
| Webhook URLs show empty in Settings | Set `APP_BASE_URL` env var |
| Meta webhook fails verification | Check `APP_BASE_URL` is set and the verify token matches `webhook_secret` in DB |
| Bolna calls not appearing | Ensure Bolna webhook URL is set in Bolna agent settings |
| Auto-call not firing | Check Bolna API key is set in Settings and account has call credits |
| Callback not auto-scheduled | Check Bolna is sending transcript/summary in the webhook payload; verify the callback phrase appears in `callbackSignals` list |
| Callback scheduled but not dialed | Check scheduler is running (server logs show "Background scheduler started"); verify `bolna_agent_id` is set on the follow-up row |
| `pnpm: not found` | Add `pnpm` to Railway's build environment or use `npm install -g pnpm` in build command |
