# VoiceCRM — Complete Build Specification

> Indian insurance agency SaaS portal. AI-powered voice calling via Bolna, lead management, policy tracking, automated follow-ups, and webhook integrations with Meta Ads and website forms.

---

## Table of Contents
1. [Tech Stack](#tech-stack)
2. [Architecture Overview](#architecture-overview)
3. [Database Schema](#database-schema)
4. [All Enum Values](#all-enum-values)
5. [API Endpoints](#api-endpoints)
6. [Frontend Pages](#frontend-pages)
7. [Business Logic](#business-logic)
8. [Integrations](#integrations)
9. [Webhook Endpoints](#webhook-endpoints)
10. [Context Variables Sent to Bolna](#context-variables-sent-to-bolna)
11. [Background Scheduler](#background-scheduler)
12. [Settings & Configuration](#settings--configuration)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, TailwindCSS, shadcn/ui, Recharts, Wouter (routing) |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL (Drizzle ORM) |
| AI Calling | Bolna API |
| SMS/Email | Brevo (Sendinblue) |
| Lead Sources | Meta Ads Webhook, Website Form Webhook, CSV Upload, Manual |
| Real-time | Server-Sent Events (SSE) for live call feed |
| Deployment | Single org, no authentication |

---

## Architecture Overview

```
[Meta Ads / Website Form]
        │ POST webhook
        ▼
[Express API Server :8080]
        │
        ├── /api/leads          ← Lead CRUD
        ├── /api/call-logs      ← Call history
        ├── /api/policies       ← Policy management
        ├── /api/follow-ups     ← Scheduled follow-ups
        ├── /api/agents         ← Bolna agent list
        ├── /api/automations    ← Auto-call rules
        ├── /api/settings       ← API key config
        ├── /api/webhooks/meta  ← Meta lead ingestion
        ├── /api/webhooks/website-form ← Form lead ingestion
        ├── /api/webhooks/bolna ← Call completion updates
        ├── /api/context        ← Memory injection for Bolna
        └── /api/live-feed      ← SSE stream
        │
        ▼
[PostgreSQL Database]

[Bolna API] ←── triggerCall() from api-server
     │
     └── POST /api/webhooks/bolna  (call completion)

[Background Scheduler — every 60s]
     ├── Check due follow-ups → triggerCall()
     └── Check policies renewing in 30 days → send email + create follow-up
```

**Single org design:** All data is scoped to `org_id = "org_default"`. No multi-tenancy, no auth.

---

## Database Schema

### Table: `leads`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | Primary key |
| `org_id` | text | NO | — | Always `"org_default"` |
| `full_name` | text | NO | — | |
| `gender` | enum(MALE,FEMALE,OTHER) | YES | — | |
| `dob` | timestamptz | YES | — | Date of birth |
| `age` | integer | YES | — | |
| `phone` | text | NO | — | 10-digit Indian mobile, no +91 |
| `phone_alt` | text | YES | — | Alternate phone |
| `email` | text | YES | — | |
| `address_line1` | text | YES | — | |
| `address_line2` | text | YES | — | |
| `city` | text | YES | — | |
| `state` | text | YES | — | |
| `pincode` | text | YES | — | |
| `pan_number` | text | YES | — | |
| `aadhaar_number` | text | YES | — | |
| `occupation` | text | YES | — | |
| `annual_income` | bigint | YES | — | In INR paise or rupees |
| `employer_name` | text | YES | — | |
| `insurance_type` | enum | YES | — | LIFE,HEALTH,MOTOR,TERM,ULIP,ENDOWMENT,ACCIDENT,TRAVEL |
| `sum_assured_interest` | bigint | YES | — | |
| `premium_budget` | bigint | YES | — | |
| `source` | enum | NO | MANUAL | META_ADS,WEBSITE_FORM,CSV_UPLOAD,MANUAL,INBOUND_CALL,REFERRAL |
| `source_campaign_id` | text | YES | — | Meta campaign ID |
| `source_form_id` | text | YES | — | Meta form ID |
| `stage` | enum | NO | NEW | NEW,CONTACTED,INTERESTED,DOCS_PENDING,POLICY_ISSUED,RENEWAL_DUE,LOST,DO_NOT_CALL |
| `assigned_to` | text | YES | — | Team member ID |
| `notes` | text | YES | — | |
| `tags` | text[] | NO | {} | Array of tags |
| `last_contacted_at` | timestamptz | YES | — | Updated on call completion |
| `next_followup_at` | timestamptz | YES | — | |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

**Phone rule:** Always store and compare as 10-digit string (no country code). Normalize by stripping `+91`, `0`, spaces, dashes.

---

### Table: `call_logs`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | |
| `org_id` | text | NO | — | |
| `lead_id` | uuid | YES | — | FK → leads |
| `bolna_execution_id` | text | YES | — | Bolna's call ID |
| `bolna_agent_id` | text | YES | — | |
| `agent_name` | text | YES | — | |
| `direction` | enum(OUTBOUND,INBOUND) | NO | OUTBOUND | |
| `phone_number` | text | NO | — | 10-digit |
| `status` | enum | NO | INITIATED | INITIATED,RINGING,IN_PROGRESS,COMPLETED,FAILED,NO_ANSWER,BUSY,CANCELLED |
| `call_type` | text | YES | — | new_lead / drop_retry / callback / monthly_checkin / inbound_new |
| `duration_seconds` | integer | YES | — | |
| `transcript` | text | YES | — | Full call transcript |
| `summary` | text | YES | — | AI-generated summary |
| `recording_url` | text | YES | — | |
| `disposition` | text | YES | — | AI disposition label |
| `drop_detected` | boolean | NO | false | True if call < 10s or status=FAILED |
| `retry_of_call_id` | uuid | YES | — | FK → call_logs (self) |
| `memory_injected` | jsonb | YES | — | Context vars sent to Bolna |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

**Drop detection rule:** A call is a "drop" if `duration_seconds < 10` OR `status IN (FAILED, NO_ANSWER, BUSY)` when status updates arrive.

---

### Table: `policies`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | |
| `org_id` | text | NO | — | |
| `lead_id` | uuid | NO | — | FK → leads |
| `policy_number` | text | YES | — | |
| `insurer_name` | text | YES | — | e.g. LIC, HDFC Life |
| `policy_type` | enum(insurance_type) | NO | LIFE | |
| `sum_assured` | bigint | YES | — | In rupees |
| `annual_premium` | bigint | YES | — | In rupees |
| `premium_frequency` | enum | NO | YEARLY | MONTHLY,QUARTERLY,HALF_YEARLY,YEARLY,SINGLE |
| `start_date` | timestamptz | YES | — | |
| `end_date` | timestamptz | YES | — | |
| `renewal_date` | timestamptz | YES | — | Triggers renewal reminder |
| `nominee_name` | text | YES | — | |
| `nominee_relation` | text | YES | — | |
| `nominee_dob` | timestamptz | YES | — | |
| `status` | enum | NO | ACTIVE | ACTIVE,LAPSED,SURRENDERED,MATURED,CLAIMED |
| `documents` | jsonb | NO | [] | Array of document objects |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

---

### Table: `follow_ups`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | |
| `org_id` | text | NO | — | |
| `lead_id` | uuid | NO | — | FK → leads |
| `type` | enum | NO | MANUAL | RENEWAL_REMINDER,MONTHLY_CHECKIN,CALLBACK_REQUESTED,MANUAL,POLICY_ANNIVERSARY |
| `status` | enum | NO | PENDING | PENDING,IN_PROGRESS,COMPLETED,SKIPPED,RESCHEDULED |
| `scheduled_at` | timestamptz | NO | — | When to fire the call |
| `bolna_agent_id` | text | YES | — | Override agent for this follow-up |
| `call_log_id` | uuid | YES | — | FK → call_logs (set after dial) |
| `notes` | text | YES | — | |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

---

### Table: `automations`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | |
| `org_id` | text | NO | — | |
| `name` | text | NO | — | Display name |
| `type` | enum | NO | — | AUTO_CALL_ON_LEAD,RETRY_ON_DROP,SCHEDULED_FOLLOWUP,MONTHLY_CHECKIN |
| `bolna_agent_id` | text | YES | — | Which Bolna agent to use |
| `trigger_config` | jsonb | NO | {} | Extra config (unused currently) |
| `is_active` | boolean | NO | true | Toggle on/off |
| `last_triggered_at` | timestamptz | YES | — | |
| `created_at` | timestamptz | NO | now() | |
| `updated_at` | timestamptz | NO | now() | |

---

### Table: `api_config`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `org_id` | text | Always `"org_default"` |
| `bolna_api_key` | text | Bolna REST API key |
| `bolna_base_url` | text | Default: `https://api.bolna.ai` |
| `brevo_api_key` | text | Brevo transactional API key |
| `brevo_sender_name` | text | SMS/email sender name |
| `meta_ads_access_token` | text | Meta Graph API token |
| `meta_ads_account_id` | text | Meta ad account ID |
| `webhook_secret` | text | Shared secret for webhook auth |
| `context_api_bearer_token` | text | Bearer token for /context endpoint |
| `monthly_checkin_agent_id` | text | Bolna agent for monthly check-ins |
| `sms_on_lead_created` | boolean | Default false |
| `sms_on_call_scheduled` | boolean | Default false |
| `email_renewal_reminders` | boolean | Default false |
| `updated_at` | timestamptz | |

---

### Table: `team_members`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `org_id` | text | |
| `name` | text | |
| `email` | text | Unique |
| `role` | text | Default: `AGENT` |
| `created_at` | timestamptz | |

---

### Table: `webhook_logs`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `org_id` | text | |
| `source` | text | META_ADS / WEBSITE_FORM / BOLNA |
| `status` | text | SUCCESS / SKIPPED / ERROR |
| `message` | text | Human-readable result |
| `created_at` | timestamptz | |

---

### Table: `dispositions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `org_id` | text | |
| `label` | text | Bolna extraction label (e.g. "interested") |
| `lead_stage` | enum(lead_stage) | Maps to this CRM stage |
| `create_followup` | boolean | Auto-create follow-up? |
| `followup_delay_hours` | integer | Hours after call |
| `is_active` | boolean | |
| `created_at` | timestamptz | |

---

### Table: `lead_sources` (import history)

Tracks CSV imports and webhook ingestion runs:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `org_id` | text | |
| `source_type` | text | CSV_UPLOAD / META_ADS / WEBSITE_FORM |
| `file_name` | text | For CSV imports |
| `total_rows` | integer | |
| `imported` | integer | Successfully created |
| `duplicates` | integer | |
| `errors` | integer | |
| `created_at` | timestamptz | |

---

## All Enum Values

```
gender:            MALE | FEMALE | OTHER
insurance_type:    LIFE | HEALTH | MOTOR | TERM | ULIP | ENDOWMENT | ACCIDENT | TRAVEL
lead_source:       META_ADS | WEBSITE_FORM | CSV_UPLOAD | MANUAL | INBOUND_CALL | REFERRAL
lead_stage:        NEW | CONTACTED | INTERESTED | DOCS_PENDING | POLICY_ISSUED | RENEWAL_DUE | LOST | DO_NOT_CALL
policy_status:     ACTIVE | LAPSED | SURRENDERED | MATURED | CLAIMED
premium_freq:      MONTHLY | QUARTERLY | HALF_YEARLY | YEARLY | SINGLE
call_dir:          OUTBOUND | INBOUND
call_status:       INITIATED | RINGING | IN_PROGRESS | COMPLETED | FAILED | NO_ANSWER | BUSY | CANCELLED
automation_type:   AUTO_CALL_ON_LEAD | RETRY_ON_DROP | SCHEDULED_FOLLOWUP | MONTHLY_CHECKIN
follow_up_type:    RENEWAL_REMINDER | MONTHLY_CHECKIN | CALLBACK_REQUESTED | MANUAL | POLICY_ANNIVERSARY
follow_up_status:  PENDING | IN_PROGRESS | COMPLETED | SKIPPED | RESCHEDULED
```

---

## API Endpoints

Base path: `/api`

### Leads

| Method | Path | Description |
|---|---|---|
| GET | `/leads` | List leads. Query: `stage`, `source`, `search`, `page`, `limit` |
| POST | `/leads` | Create lead manually |
| GET | `/leads/:id` | Get single lead with all details |
| PATCH | `/leads/:id` | Update lead fields |
| DELETE | `/leads/:id` | Delete lead |
| GET | `/leads/:id/timeline` | Chronological events (calls, follow-ups, notes) |
| POST | `/leads/:id/notes` | Add a note to lead |
| POST | `/leads/:id/call` | Manually trigger a Bolna call. Body: `{ agentId }` |
| POST | `/leads/bulk-import` | CSV bulk import. Body: `{ leads: [...] }` |

### Call Logs

| Method | Path | Description |
|---|---|---|
| GET | `/call-logs` | List all call logs. Query: `leadId`, `status`, `page` |
| GET | `/call-logs/:id` | Single call log with transcript, summary, recording |

### Policies

| Method | Path | Description |
|---|---|---|
| GET | `/policies` | List policies. Query: `leadId`, `status` |
| POST | `/policies` | Create policy |
| PATCH | `/policies/:id` | Update policy |
| DELETE | `/policies/:id` | Delete policy |

### Follow-ups

| Method | Path | Description |
|---|---|---|
| GET | `/follow-ups` | List follow-ups. Query: `status`, `type`, `leadId` |
| POST | `/follow-ups` | Create follow-up |
| PATCH | `/follow-ups/:id` | Update (reschedule, complete, skip) |
| DELETE | `/follow-ups/:id` | Delete |

### Agents (Bolna)

| Method | Path | Description |
|---|---|---|
| GET | `/agents` | List agents from Bolna API |
| POST | `/agents/test-call` | Body: `{ agentId, phone }`. Fire a test call |
| GET | `/phone-numbers` | List Bolna phone numbers |
| POST | `/phone-numbers/:id/agent` | Assign agent to phone number |

### Automations

| Method | Path | Description |
|---|---|---|
| GET | `/automations` | List all automations |
| POST | `/automations` | Create automation |
| PATCH | `/automations/:id` | Toggle `is_active`, change `bolna_agent_id` |
| DELETE | `/automations/:id` | Delete |

### Lead Sources

| Method | Path | Description |
|---|---|---|
| GET | `/lead-sources/import-history` | CSV and webhook import records |
| GET | `/lead-sources/recent-meta-leads` | Last 20 META_ADS leads |

### Settings

| Method | Path | Description |
|---|---|---|
| GET | `/settings/api-config` | Get current config (keys masked) |
| PATCH | `/settings/api-config` | Save keys, preferences |
| POST | `/settings/test-bolna` | Test Bolna connection |
| POST | `/settings/test-brevo` | Test Brevo connection |

### Dashboard

| Method | Path | Description |
|---|---|---|
| GET | `/dashboard/stats` | Counts: total leads, calls today, conversions, active policies |
| GET | `/dashboard/trends` | 14-day daily series for leads and calls (for line charts) |

### Team

| Method | Path | Description |
|---|---|---|
| GET | `/team` | List team members |
| POST | `/team` | Add member |
| PATCH | `/team/:id` | Update |
| DELETE | `/team/:id` | Remove |

### Dispositions

| Method | Path | Description |
|---|---|---|
| GET | `/dispositions` | List disposition mappings |
| POST | `/dispositions` | Create mapping |
| PATCH | `/dispositions/:id` | Update |
| DELETE | `/dispositions/:id` | Delete |

### Misc

| Method | Path | Description |
|---|---|---|
| GET | `/health` | `{ ok: true }` |
| GET | `/live-feed` | SSE stream for real-time call status updates |
| GET or POST | `/context` | Memory injection for Bolna (see below) |

---

## Webhook Endpoints

### GET `/api/webhooks/meta` — Meta Webhook Verification

Meta calls this to verify the webhook before activating it.

```
Query params:
  hub.mode         = "subscribe"
  hub.verify_token = <webhook_secret from api_config>
  hub.challenge    = <random string>

Response:
  200 + plain text body = hub.challenge value
  403 if token doesn't match
```

### POST `/api/webhooks/meta` — Meta Lead Ingestion

Meta sends lead data here when a lead form is submitted.

**Critical:** Respond `200 EVENT_RECEIVED` immediately, process in background.

```
Response: 200 "EVENT_RECEIVED"  (sent instantly, before any processing)

Background processing:
  1. Verify ?secret= query param matches webhook_secret
  2. Parse field_data array from body (Meta format):
     [{ name: "full_name", values: ["Ramesh Kumar"] }, ...]
  3. Extract: full_name/name, phone/phone_number, email, city, insurance_type/insuranceType, campaign_id, form_id
  4. Run ingestLead() — see Business Logic
  5. Log to webhook_logs

Meta's field_data format:
{
  "field_data": [
    { "name": "full_name", "values": ["Ramesh Kumar"] },
    { "name": "phone_number", "values": ["9876543210"] },
    { "name": "email", "values": ["ramesh@gmail.com"] }
  ]
}
```

### POST `/api/webhooks/website-form` — Website Form Lead

For custom website forms POSTing directly to the CRM.

```
Auth: ?secret=<webhook_secret> query param

Body (JSON):
{
  "full_name": "Ramesh Kumar",   // or "name" or "fullName"
  "phone": "9876543210",         // or "phone_number" or "mobile"
  "email": "ramesh@gmail.com",
  "city": "Mumbai",
  "insurance_type": "LIFE"       // or "insuranceType"
}

Response: { received: true, ok: true, message: "Lead created: <id>" }
         or { received: true, ok: false, message: "Duplicate lead" }
```

### POST `/api/webhooks/bolna` — Bolna Call Completion

Bolna calls this when a call ends to deliver transcript, summary, status.

```
Body:
{
  "execution_id": "exec_abc123",
  "status": "completed",           // or failed, no-answer, busy
  "transcript": "Agent: ...",
  "summary": "Customer interested in term plan...",
  "recording_url": "https://...",
  "duration_seconds": 120
}

Processing:
  1. Find call_log by bolna_execution_id
  2. Map Bolna status → call_status enum
  3. Update call_log (status, transcript, summary, recording_url, duration_seconds)
  4. Set drop_detected = true if duration < 10s or status is failed/no-answer/busy
  5. If COMPLETED: advance lead stage NEW → CONTACTED
  6. If drop_detected AND RETRY_ON_DROP automation active: trigger retry call
  7. Start polling Bolna for execution updates (every 6s, max 120 polls)
```

---

## Frontend Pages

### `/` — Dashboard
- Stats cards: Total Leads, Calls Today, Interested, Active Policies
- 14-day line chart: daily leads vs calls (Recharts LineChart)
- Recent calls feed (live via SSE)
- Quick action buttons

### `/leads` — Lead Management
- Table with search, filter by stage and source
- Columns: Name, Phone, City, Insurance Type, Stage (badge), Source, Last Contacted, Created
- Pagination
- "Add Lead" button → modal form
- CSV bulk import button
- Click row → Lead Detail

### `/leads/:id` — Lead Detail
- Full profile: all demographics, contact info
- Edit inline
- Call History tab: list of calls with status, duration, summary
- Policies tab: linked policies
- Follow-ups tab: scheduled tasks
- Timeline tab: chronological activity feed
- Notes section
- "Call Now" button → agent picker → trigger call immediately

### `/calls` — Call Logs
- Table: Lead name, Phone, Agent, Status (badge), Duration, Type, Date
- Filter by status, date range
- Click → Call Detail

### `/calls/:id` — Call Detail
- Status badge, duration, call type, date
- Full transcript (scrollable)
- AI summary
- Recording audio player (if URL present)
- Memory Injected JSON (what context was sent to Bolna)
- Lead link

### `/policies` — Policy Management
- Tabs: All Policies | Renewals Due (within 30 days)
- Table: Lead name, Policy number, Insurer, Type, Sum Assured, Premium, Renewal Date, Status
- "Create Reminder" button on renewal rows → creates RENEWAL_REMINDER follow-up
- Add/Edit policy modal

### `/follow-ups` — Follow-up Schedule
- Table: Lead name, Type, Scheduled At, Status, Notes
- Filter by status and type
- "Reschedule" button → date/time picker dialog
- "Mark Complete" / "Skip" actions
- "Add Follow-up" button

### `/agents` — AI Agents
- Fetches live agent list from Bolna API
- Cards: Agent name, tags, linked phone numbers
- "Test Call" button → phone number input → fires test call immediately
- Phone numbers list with agent assignment

### `/lead-sources` — Lead Sources
- Meta Ads tab: recent 20 META_ADS leads + webhook URL display
- Website Form tab: webhook URL + example payload
- Import History tab: CSV upload history with success/error counts
- Webhook Logs: real-time log of webhook hits (SUCCESS/SKIPPED/ERROR)

### `/settings` — Settings
- **API Keys section:** Bolna API Key (with Test button), Brevo API Key (with Test button), Meta Ads Access Token
- **SMS Notifications section:** Toggle "SMS on new lead", "SMS on scheduled call"
- **Automation Rules section:** Toggle "Auto-call new leads", "Retry dropped calls"
- **Monthly check-in agent:** Dropdown to select which Bolna agent handles monthly check-ins
- **System Webhooks section:** Shows read-only webhook URLs (Meta, Website Form, Bolna) including the secret token embedded

### `/team` — Team Management
- List team members: Name, Email, Role
- Add/edit/remove members
- Role options: AGENT, MANAGER, ADMIN

### `/automations` — (Dispositions/Mapping)
- Map Bolna disposition labels to lead stages
- Toggle create-follow-up per disposition
- Set follow-up delay in hours

---

## Business Logic

### Phone Normalization
All phones stored as 10 digits. Normalization strips: `+91`, leading `0`, spaces, dashes, parentheses. Validated: must be exactly 10 digits.

For Bolna calls: convert to E.164 format `+91XXXXXXXXXX`.

### Lead Deduplication
Before inserting a new lead (from any source), check if `phone` already exists for the org. If duplicate → return `{ ok: false, message: "Duplicate lead" }` and skip.

### Lead Ingestion Flow (`ingestLead`)
1. Validate: `full_name` and `phone` required
2. Normalize phone to 10 digits; validate length
3. Deduplicate by phone
4. Normalize `insurance_type` to uppercase, validate against allowed values
5. Insert lead with `source`, `source_campaign_id`, `source_form_id`
6. **Fire auto-call in background** (non-blocking):
   - Find active `AUTO_CALL_ON_LEAD` automation
   - Call `triggerCall({ agentId, phone, leadId, callType: "new_lead" })`
   - Log success or failure

### `triggerCall(opts)` — Core Call Function
```
Input: agentId, phone, leadId?, callType?, retryOfCallId?, variables?

1. Normalize phone; validate 10 digits
2. buildCallContext(phone) → context object (see below)
3. Merge context with any extra variables
4. POST to Bolna /call:
   {
     agent_id: agentId,
     recipient_phone_number: "+91" + phone,
     user_data: { ...context, ...variables }
   }
5. If Bolna success: insert call_log row (status=INITIATED)
6. Start polling Bolna execution every 6s (max 120 polls = 12 min)
7. Return { success, call_log_id, execution_id, error }
```

### Call Polling
Every 6 seconds, fetch `GET /executions/:executionId` from Bolna.
- Map Bolna status string → call_status enum
- Update call_log row
- On terminal status (COMPLETED/FAILED/NO_ANSWER/BUSY/CANCELLED/STOPPED): stop polling, run post-call logic

### Post-Call Logic (on terminal status)
1. Set `drop_detected = true` if duration < 10s OR status is not COMPLETED
2. If COMPLETED: advance lead stage NEW → CONTACTED (only if stage is NEW)
3. Update `last_contacted_at` on lead
4. If `drop_detected` AND active `RETRY_ON_DROP` automation exists:
   - Wait is not needed — immediately re-trigger call
   - Set `retry_of_call_id` on new call_log
5. Emit SSE event `call_update` to all connected clients

### Lead Stage Auto-Progression
Only one auto-progression is implemented:
- **NEW → CONTACTED**: triggers on first COMPLETED call

Other stage changes are manual (user updates via UI).

### Drop Detection
A call is "dropped" if:
- `duration_seconds < 10` AND status = COMPLETED (very short call)
- OR `status IN (FAILED, NO_ANSWER, BUSY, CANCELLED)`

### Context Building (`buildCallContext`)
Called before every outbound call to inject lead memory into Bolna:

```javascript
// Determines call_type based on history:
if (!lastCall) → call_type = "new"
if (lastCall.drop_detected && within 15min) → call_type = "drop_retry"
if (pendingCallback due within 5min) → call_type = "callback"
else → call_type = "inbound_known"

// Returns:
{
  call_type,
  user_name,      // lead.full_name
  gender,         // lowercase
  city,
  insurance_type, // lowercase
  lead_id,
  context,        // lastCall.summary
  opening_line,   // pre-built Hindi/English opener based on call_type
  previous_execution_id,
  previous_summary?,  // only on drop_retry
  callback_reason?,   // only on callback
  policy_number?,     // only if policy exists
  renewal_date?,      // "YYYY-MM-DD"
  account_status?,    // lead.stage
}
```

---

## Context Variables Sent to Bolna

Use these as `{{variable_name}}` in your Bolna agent system prompt:

| Variable | Always present | Description |
|---|---|---|
| `{{call_type}}` | ✅ | `new` / `drop_retry` / `callback` / `inbound_known` / `inbound_new` |
| `{{user_name}}` | ✅ | Lead's full name |
| `{{gender}}` | ✅ | `male` / `female` |
| `{{city}}` | ✅ | City |
| `{{insurance_type}}` | ✅ | `life` / `health` / `motor` etc. |
| `{{lead_id}}` | ✅ | UUID |
| `{{context}}` | ✅ | Summary of last call (empty string if none) |
| `{{opening_line}}` | ✅ | Pre-built opener (empty if not applicable) |
| `{{previous_execution_id}}` | ✅ | Last Bolna execution ID |
| `{{previous_summary}}` | drop_retry only | Summary of dropped call |
| `{{callback_reason}}` | callback only | Why they asked for callback |
| `{{policy_number}}` | If policy exists | e.g. `LIC-2024-9876` |
| `{{renewal_date}}` | If policy exists | `YYYY-MM-DD` |
| `{{account_status}}` | inbound_known | Lead stage |

---

## Integrations

### Bolna (AI Voice Calling)
**Base URL:** `https://api.bolna.ai`
**Auth:** `Authorization: Bearer <bolna_api_key>`

Endpoints used:
```
GET  /v2/agent/all          → list agents
GET  /phone-numbers/all     → list phone numbers
POST /call                  → start outbound call
GET  /executions/:id        → poll call status
POST /phone-numbers/:id/agent → assign agent to number
```

**startCall payload:**
```json
{
  "agent_id": "uuid",
  "recipient_phone_number": "+919876543210",
  "user_data": { ...contextVariables }
}
```

### Brevo (SMS + Email)
**Base URL:** `https://api.brevo.com/v3`
**Auth:** `api-key: <brevo_api_key>` header

**SMS** via `POST /transactionalSMS/sms`:
```json
{
  "sender": "VoiceCRM",
  "recipient": "+919876543210",
  "content": "Your message here"
}
```

**Email** via `POST /smtp/email`:
```json
{
  "sender": { "name": "VoiceCRM", "email": "no-reply@voicecrm.app" },
  "to": [{ "email": "customer@email.com" }],
  "subject": "Policy Renewal Reminder",
  "htmlContent": "<p>Your policy renews on...</p>"
}
```

SMS triggers (if enabled in settings):
- Lead created → welcome SMS
- Call scheduled → notification SMS

Email triggers (if enabled):
- Policy renewal within 30 days → renewal reminder email

### Meta Ads
- **Webhook verification:** GET `/api/webhooks/meta` (hub.verify_token = webhook_secret)
- **Lead delivery:** POST `/api/webhooks/meta` (Meta pushes `field_data` array)
- **Access token:** Used for future Graph API calls (stored in api_config)

---

## Background Scheduler

Runs every **60 seconds**. Two jobs:

### Job 1: Process Due Follow-ups
```
1. Query follow_ups WHERE status=PENDING AND scheduled_at <= NOW() AND org_id=default
2. For each row:
   a. Determine agentId:
      - MONTHLY_CHECKIN type → use api_config.monthly_checkin_agent_id
      - All other types → use follow_up.bolna_agent_id
   b. Skip if no agentId configured
   c. Atomically claim row: UPDATE status=IN_PROGRESS WHERE status=PENDING
      (prevents double-dial on overlapping ticks)
   d. Fetch lead from DB
   e. triggerCall({ agentId, phone, leadId, callType: followUp.type.toLowerCase() })
   f. On success: update follow_up.call_log_id
   g. On failure: revert status=PENDING (retry on next tick), log warning
```

### Job 2: Generate Renewal Reminders
```
1. Query policies WHERE renewal_date BETWEEN NOW() AND NOW()+30days AND status=ACTIVE
2. For each policy:
   a. Check if a RENEWAL_REMINDER follow-up already exists for this lead → skip if yes
   b. Create follow_up: type=RENEWAL_REMINDER, scheduled_at=renewal_date-7days, status=PENDING
   c. If email_renewal_reminders enabled: send Brevo email to lead.email
```

---

## Settings & Configuration

The `api_config` table holds a single row for the org. Settings page lets users:

1. **Bolna API Key** — Test button calls `GET /v2/agent/all` and returns success/fail
2. **Brevo API Key** — Test button sends a test request
3. **Meta Ads Access Token** — Stored for Graph API use
4. **Webhook Secret** — Auto-generated on first run; shown in webhook URLs
5. **SMS on new lead** — Toggle: sends Brevo SMS when lead ingested via webhook
6. **SMS on scheduled call** — Toggle: sends Brevo SMS before a scheduled call
7. **Email renewal reminders** — Toggle: sends email 30 days before policy renewal
8. **Auto-call new leads** — Controls `AUTO_CALL_ON_LEAD` automation `is_active`
9. **Retry dropped calls** — Controls `RETRY_ON_DROP` automation `is_active`
10. **Monthly check-in agent** — Dropdown: picks Bolna agent for MONTHLY_CHECKIN follow-ups

### Webhook URLs shown in Settings
- **Meta Ads:** `https://<domain>/api/webhooks/meta` (no secret in URL — verification uses verify_token)
- **Website Form:** `https://<domain>/api/webhooks/website-form?secret=<webhook_secret>`
- **Bolna (callback):** `https://<domain>/api/webhooks/bolna`

---

## Real-time Live Feed (SSE)

`GET /api/live-feed` returns a text/event-stream.

Events emitted:
```
event: ping
data: {}

event: call_update
data: { id, leadId, status, transcript, summary, duration_seconds, ... }
```

Dashboard subscribes to this stream and updates the call feed in real-time without polling.

---

## Lead Stage Pipeline (Visual Reference)

```
NEW
 │
 ▼ (auto: first COMPLETED call)
CONTACTED
 │
 ▼ (manual)
INTERESTED
 │
 ▼ (manual)
DOCS_PENDING
 │
 ▼ (manual)
POLICY_ISSUED
 │
 ├──► RENEWAL_DUE  (manual or scheduler)
 │
 ├──► LOST         (manual)
 └──► DO_NOT_CALL  (manual)
```

---

## Notes for Lovable Implementation

1. **No authentication** — single org, open access. All API calls are unauthenticated.

2. **Phone numbers** — Always Indian mobile numbers. Store as 10 digits. Display with +91 prefix. Call with E.164 (`+91XXXXXXXXXX`).

3. **Currency** — All monetary values (sum_assured, annual_premium, premium_budget) are stored as integers in rupees (not paise). Display with `₹` symbol and Indian number formatting (lakhs/crores).

4. **Dates** — Store as UTC timestamps. Display in IST (`Asia/Kolkata`, UTC+5:30).

5. **The `/api/context` endpoint** — Bolna can optionally call this mid-conversation to get fresh lead data. It accepts `phone` or `execution_id` and returns the same `CallContext` object as the pre-call injection. Secure with `Authorization: Bearer <context_api_bearer_token>`.

6. **Webhook secret** — Generate a random 32-char hex string on first startup if none exists. Used to authenticate incoming webhooks via `?secret=` query param.

7. **Bolna status mapping:**
   ```
   "completed"  → COMPLETED
   "failed"     → FAILED
   "no-answer" / "no_answer" → NO_ANSWER
   "busy"       → BUSY
   "cancelled" / "canceled"  → CANCELLED
   "in_progress" / "in-progress" → IN_PROGRESS
   "ringing"    → RINGING
   default      → INITIATED
   ```

8. **Drop detection threshold:** 10 seconds. Calls under 10s that show COMPLETED are still flagged as drops (likely unanswered or immediately disconnected).

9. **Retry window:** Only retry within 15 minutes of the original dropped call.

10. **Callback window:** A follow-up of type CALLBACK_REQUESTED is considered "due now" if it's scheduled within the next 5 minutes.
