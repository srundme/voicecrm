# VoiceCRM — Full Technical Architecture & Function Reference

> **Product:** AI Voice CRM for Indian insurance agencies (Policyfy.com)  
> **Stack:** React + Vite (frontend) · Express 5 API · Drizzle ORM · PostgreSQL · Bolna AI calling  
> **Agent:** Dhivya — Hindi/Hinglish insurance sales agent  
> **Deployment:** Railway (production) · Replit (development)

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Module Map](#2-module-map)
3. [Authentication — `auth.ts`](#3-authentication--authts)
4. [Bolna API Client — `bolna.ts`](#4-bolna-api-client--bolnats)
5. [Call Context Engine — `context.ts`](#5-call-context-engine--contextts)
6. [Call Engine — `call-engine.ts`](#6-call-engine--call-enginets)
7. [Background Scheduler — `scheduler.ts`](#7-background-scheduler--schedulerts)
8. [Live Feed Events — `events.ts`](#8-live-feed-events--eventsts)
9. [HTTP Routes](#9-http-routes)
10. [Data Flow: Full Outbound Call Lifecycle](#10-data-flow-full-outbound-call-lifecycle)
11. [Data Flow: Callback Request Lifecycle](#11-data-flow-callback-request-lifecycle)
12. [Database Tables Reference](#12-database-tables-reference)
13. [Environment Secrets](#13-environment-secrets)

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend (React/Vite)               │
│  • Lead list, call log, campaign manager, settings       │
│  • Reads live call updates via SSE /api/calls/live       │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP + SSE
┌───────────────────────▼─────────────────────────────────┐
│                   Express 5 API Server                   │
│                                                          │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│   │  Call Engine │  │  Scheduler   │  │  Context API │  │
│   │  call-engine │  │  scheduler   │  │  context.ts  │  │
│   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│          │                 │                 │           │
│   ┌──────▼─────────────────▼─────────────────▼───────┐  │
│   │               Bolna API Client (bolna.ts)        │  │
│   └──────────────────────┬────────────────────────────┘  │
│                          │                               │
│   ┌──────────────────────▼────────────────────────────┐  │
│   │         PostgreSQL via Drizzle ORM                │  │
│   │  leads · call_logs · follow_ups · campaigns       │  │
│   │  policies · automations · api_config              │  │
│   └───────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │ REST + Webhooks
┌───────────────────────▼─────────────────────────────────┐
│                    Bolna AI Platform                     │
│  • Hosts Dhivya agent                                    │
│  • Places/receives calls via SIM-linked phone numbers    │
│  • POSTs webhook events back to /api/webhooks/bolna      │
│  • Calls GET /context before each inbound call           │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Module Map

```
artifacts/api-server/src/
├── index.ts              Entry point — starts server + scheduler + poll resume
├── app.ts                Express app setup — CORS, auth middleware, routing
├── routes/
│   ├── index.ts          Mounts all sub-routers
│   ├── auth.ts           POST /api/auth/login, /logout, GET /me
│   ├── leads.ts          CRUD for leads + POST /:id/call
│   ├── call-logs.ts      GET call history + SSE live feed + webhooks
│   ├── follow-ups.ts     GET/POST follow-ups + POST /:id/call (manual trigger)
│   ├── campaigns.ts      CRUD + start/pause/complete campaigns
│   ├── agents.ts         Bolna agent listing + inbound phone assignment
│   ├── settings.ts       GET/PUT api_config (keys masked in response)
│   ├── automations.ts    CRUD for automation rules (e.g. RETRY_ON_DROP)
│   ├── policies.ts       Policy records per lead
│   ├── dispositions.ts   Call outcome tagging
│   ├── dashboard.ts      Aggregated stats
│   ├── health.ts         GET /api/health (unauthenticated)
│   ├── misc.ts           GET/POST /context (Bolna inbound hook)
│   ├── team.ts           Team member management
│   └── lead-sources.ts   Lead source tracking
└── lib/
    ├── auth.ts           Session token creation/verification, HMAC cookie
    ├── bolna.ts          Bolna REST API client
    ├── call-engine.ts    Call triggering, polling, drop detection, callbacks
    ├── context.ts        Unified context builder (memory injection)
    ├── scheduler.ts      Background tick — follow-ups, campaigns, renewals
    ├── events.ts         In-process SSE event bus
    ├── brevo.ts          Transactional email (renewal reminders)
    ├── compliance.ts     IRDAI + DPDP async compliance checks
    ├── org.ts            Org config helpers + DEFAULT_ORG_ID
    ├── phone.ts          Phone number normalisation (10-digit / E.164)
    ├── serialize.ts      DB row → API response shape
    └── logger.ts         Pino structured logger
```

---

## 3. Authentication — `auth.ts`

A single-admin HMAC cookie system. No user table — one password protects the entire CRM.

### `sign(payload: string): string`
Creates an HMAC-SHA256 signature of a payload string using `SESSION_SECRET`. Used internally to sign and verify session tokens.

### `createSessionToken(): string`
Generates a new session token in the format `authed.<timestamp>.<hmac>`. The timestamp makes every token unique; the HMAC makes it tamper-proof. Returns a string that is stored in the `vcrm_session` cookie.

### `verifySessionToken(token: string): boolean`
Splits the token at the last `.`, re-signs the payload half, and compares the signatures using `timingSafeEqual` to prevent timing attacks. Returns `true` only if the signatures match exactly.

### `checkPassword(candidate: string): boolean`
Compares the submitted password against `ADMIN_PASSWORD` using `timingSafeEqual`. Returns `false` immediately if `ADMIN_PASSWORD` is not set (prevents accidental open access).

### `setSessionCookie(res: Response): void`
Writes the `vcrm_session` cookie. Settings:
- `httpOnly: true` — inaccessible to JavaScript
- `sameSite: lax` — CSRF protection
- `maxAge: 7 days`
- `secure: true` in production only

### `clearSessionCookie(res: Response): void`
Deletes the `vcrm_session` cookie on logout.

### `isAuthenticated(req: Request): boolean`
Reads the `vcrm_session` cookie from the request and calls `verifySessionToken`. Returns `true` if valid.

### `requireAuth(req, res, next): void`
Express middleware. Calls `isAuthenticated` — passes to `next()` if valid, otherwise returns HTTP 401. Applied to all `/api/*` routes **except**: `/api/health`, `/api/auth/*`, `/api/webhooks/*`, `/api/context`.

---

## 4. Bolna API Client — `bolna.ts`

Thin wrapper around the Bolna REST API. All methods return `BolnaResult<T>` — either `{ success: true, data: T }` or `{ success: false, error: string }`. API key and base URL are loaded from `api_config` in the DB on every call (no startup caching).

### `getKeys()`
Internal. Fetches `bolna_api_key` and `bolna_base_url` from `ensureApiConfig()`. Returns an error object if the key is missing.

### `request<T>(path, init): Promise<BolnaResult<T>>`
Internal. Generic authenticated fetch wrapper. Adds `Authorization: Bearer <key>` and `Content-Type: application/json` headers. Parses the response body as JSON (falls back to raw text). Maps non-2xx responses to `{ success: false, error: message }`.

### `bolna.testConnection()`
Calls `GET /v2/agent/all` to verify the API key is valid. Used on the Settings page.

### `bolna.listAgents()`
Fetches all Bolna agents for the account. Normalises varying response shapes (`agent_config`, `agent_name`, `name`) into a consistent `{ id, name, tags, phone_numbers }` array.

### `bolna.listPhoneNumbers()`
Returns all phone numbers linked to the Bolna account, including which agent (if any) each number is assigned to for inbound calls.

### `bolna.startCall(opts)`
Places an outbound call. Sends:
```json
{
  "agent_id": "...",
  "recipient_phone_number": "+91XXXXXXXXXX",
  "user_data": { ...all context variables }
}
```
The `user_data` object becomes Bolna template variables (e.g. `{opening_line}`, `{context}`, `{user_name}`). Logs `agent_id`, `lead_id`, `call_type`, `is_callback` at INFO level (no PII). Returns `{ execution_id, status }`.

### `bolna.getExecution(executionId)`
Polls `GET /executions/:id` for call status. Normalises Bolna's varied status strings into a consistent set and determines `ended: boolean`. Also extracts `transcript`, `summary`, `recording_url`, and `duration_seconds`.

### `bolna.setInboundAgent(phoneNumberId, agentId)`
PATCH assigns an agent to a phone number for inbound call handling.

### `bolna.removeInboundAgent(phoneNumberId)`
PATCH removes the inbound agent assignment from a phone number.

### `mapBolnaStatusToCallStatus(status): CallStatus`
Maps Bolna's raw status strings to the CRM's canonical `CallStatus` enum:
- `completed / stopped` → `COMPLETED`
- `error / failed` → `FAILED`
- `no-answer / no_answer` → `NO_ANSWER`
- `busy` → `BUSY`
- `cancelled / canceled` → `CANCELLED`
- `ringing` → `RINGING`
- `in-progress / ongoing / running` → `IN_PROGRESS`
- `queued / initiated / scheduled` → `INITIATED`
- anything else → `IN_PROGRESS` (safe default)

---

## 5. Call Context Engine — `context.ts`

**The memory system.** Called before every outbound call and by Bolna before every inbound call. Looks up the lead by phone number, fetches their history, and returns a `CallContext` object that is passed to Bolna as `user_data` template variables.

### `CallContext` type

| Field | Type | Description |
|---|---|---|
| `call_type` | enum | `new` · `drop_retry` · `callback` · `inbound_known` · `inbound_new` |
| `user_name` | string | Lead's full name |
| `gender` | string | `male` / `female` / `""` |
| `city` | string | Lead's city |
| `insurance_type` | string | `health` / `car` / `life` / etc. |
| `context` | string | AI summary from the last call (the "memory") |
| `opening_line` | string | Exact first sentence Dhivya should speak |
| `previous_execution_id` | string | Bolna execution ID of the last call |
| `previous_summary` | string | Same as `context` (some prompt blocks use this alias) |
| `callback_reason` | string | Notes + previous summary for callback calls |
| `policy_number` | string | Active policy number (inbound_known only) |
| `renewal_date` | string | ISO date of next renewal (inbound_known only) |
| `account_status` | string | Lead's current CRM stage |
| `lead_id` | string | DB UUID of the lead |

### `buildCallContext(rawPhone): Promise<CallContext>`

The single source of truth for all context/memory injection. Takes a raw phone string, normalises it, and runs 4 parallel DB queries:
1. `leads` — find the lead
2. `call_logs` — most recent call (ordered by `created_at DESC`)
3. `follow_ups` — any PENDING `CALLBACK_REQUESTED` follow-up for this lead
4. `policies` — most recent policy record

Then determines which `call_type` applies and builds the appropriate context:

**`inbound_new`** — phone not in the leads table. Returns empty context. Dhivya will treat the caller as a fresh prospect.

**`new`** — known lead with no prior call logs. Returns the standard cold-call opening pitch. No previous summary exists yet.

**`drop_retry`** — the most recent call has `drop_detected = true` AND ended within the last 15 minutes. Returns an apologetic recovery opening (*"maafi chahti hoon, network ki wajah se call cut ho gayi"*) with the previous summary as `context`.

**`callback`** — a PENDING `CALLBACK_REQUESTED` follow-up exists. Returns the callback opening (*"aapne humse baad mein call karne ko kaha tha"*). The `callback_reason` field carries both the follow-up notes and the previous call summary so Dhivya has full context.

**`inbound_known`** — known lead, no drop, no pending callback. Returns the warm returning-contact opening. Includes `context` (previous summary), `policy_number`, `renewal_date`, and `account_status`.

---

## 6. Call Engine — `call-engine.ts`

The core orchestration layer. Handles triggering calls, polling for results, detecting drops, advancing lead stages, and scheduling callbacks.

### `parseCallbackIntent(text, callEndedAt): { scheduledAt, notes } | null`

Parses free-form Hinglish/Hindi/English text to detect if the customer requested a callback and extract when.

**Step 1 — Signal detection.** The text must contain at least one callback signal word (e.g. `call back`, `wapas call`, `कॉल करो`). If no signal is found, returns `null` immediately.

**Step 2 — Time extraction.** Tries patterns in priority order:

| Pattern | Example | Result |
|---|---|---|
| `X minute(s) baad` | "do minute baad" | +2 min from call end |
| `after/in X minutes` | "in 3 minutes" | +3 min from call end |
| `X ghante/hour(s) baad` | "ek ghante baad" | +1 hr from call end |
| `after/in X hours` | "after 2 hours" | +2 hr from call end |
| `kal/tomorrow + time` | "kal 2 baje" | next day 14:00 IST |
| `kal/tomorrow + subah/shaam` | "kal subah" | next day 09:00 IST |
| `kal` with no time | "kal call karo" | next day 10:00 IST |
| `parso/day after tomorrow` | "parso shaam" | day+2 17:00 IST |
| No time given | "call karo" | +2 hours from call end |

Hindi number words (`ek`, `do`, `teen`, `दो`, `तीन`, etc.) are resolved via `HINDI_NUMS` lookup. All times are computed in IST (UTC+5:30).

### `istDateTime(base, hour, minute): Date`
Internal. Given a base Date and an IST hour/minute, returns the correct UTC Date by offsetting `UTC = IST - 5:30`.

### `toNum(s): number`
Resolves a string to a number — first tries `HINDI_NUMS` dict lookup, falls back to `Number(s)`.

### `maybeScheduleCallback(call: CallLogRow): Promise<void>`

Called at the end of every COMPLETED call (not drops). Decides whether to create a `CALLBACK_REQUESTED` follow-up.

1. **Lead resolution** — if `lead_id` is missing (call made directly from Bolna dashboard), attempts to find and back-fill the lead by normalising the phone number.
2. **Text preparation** — splits the transcript by `\n`, **filters out all `assistant:` lines**, joins the remaining user lines, then appends the AI summary. This prevents Dhivya's own opening line from being matched instead of what the customer actually said.
3. **Parse** — calls `parseCallbackIntent` on the user-only text.
4. **Dedup check** — if a PENDING follow-up already exists for this exact call log ID, skips (guards against Bolna double-firing webhooks).
5. **Insert** — creates a `follow_ups` row with `type: CALLBACK_REQUESTED`, `status: PENDING`, and the calculated `scheduled_at`.
6. **Lead update** — sets `leads.next_followup_at` to the scheduled time for CRM display.

### `triggerCall(opts): Promise<TriggerOutcome>`

The single function used to place any outbound call. Steps:

1. Normalises the phone number to 10 digits. Rejects if invalid.
2. Calls `buildCallContext(phone)` to get memory/context variables.
3. Merges context with any extra `opts.variables` (caller's overrides win).
4. Calls `bolna.startCall` with the merged variables as `user_data`.
5. Inserts a `call_logs` row with `status: INITIATED`, `call_type`, and `memory_injected` (the full variable snapshot).
6. Updates `leads.last_contacted_at`.
7. Emits a live SSE update via `emitCallUpdate`.
8. Starts polling via `startPolling`.
9. Returns `{ success, call_log_id, execution_id, error }`.

### `isProperCallEnding(transcript, summary): boolean`

Determines whether a call ended naturally (customer said goodbye / agreed / refused) vs was dropped abruptly (network cut, silence timeout, Bolna error).

Scans the combined transcript+summary for signals in categories:
- **Goodbyes:** `dhanyawad`, `shukriya`, `bye`, `alvida`, `khuda hafiz`
- **Refusals:** `not interested`, `nahi chahiye`, `galat number`, `do not call`
- **Deferrals:** `sochta hoon`, `baad mein batata`, `sochenge`
- **Callback signals:** `wapas call`, `baad mein call` (handled by `maybeScheduleCallback`, not a drop)
- **AI summary signals:** `call ended`, `policy details shared`, `lead qualified`, `agreed to`

Returns `true` (proper ending) if any signal matches. Returns `true` if both transcript and summary are empty (safe default — avoids spam on transcription failures).

### `startPolling(callLogId, executionId): void`

Starts a polling loop that checks `bolna.getExecution` every 6 seconds for up to 120 polls (12 minutes). On each tick:

1. Fetches execution status from Bolna.
2. Computes `dropDetected`: `true` if the call ended AND (`status` is FAILED/NO_ANSWER/BUSY, OR the ending was not a proper ending per `isProperCallEnding`).
3. Updates the `call_logs` row with current status, transcript, summary, recording URL, duration, `ended_at`, `drop_detected`, and `drop_reason`.
4. Emits an SSE live update.
5. If the call has ended:
   - If `dropDetected`: calls `maybeRetryOnDrop`.
   - If COMPLETED and no drop: calls `maybeAdvanceLeadStage` then `maybeScheduleCallback`.
   - Stops the poll loop.

### `maybeAdvanceLeadStage(call): Promise<void>`

If the lead's stage is `NEW`, advances it to `CONTACTED`. Only fires on completed (non-dropped) calls. Uses a conditional update (`WHERE stage = 'NEW'`) so it cannot overwrite a more advanced stage.

### `maybeRetryOnDrop(call): Promise<void>`

Checks whether a `RETRY_ON_DROP` automation rule is active for the org. If yes (and the current call is not itself already a retry), places a new call to the same lead with `retryOfCallId` set. Links the new call log back to the original via `retry_call_id`. Skips if no automation is configured or if the call is already a retry (prevents infinite retry loops).

### `resumeActiveCalls(): Promise<void>`

Called once at server startup. Queries all `call_logs` with status `INITIATED`, `RINGING`, or `IN_PROGRESS` and resumes their polling loops. This ensures calls in flight when the server restarted are not silently orphaned.

---

## 7. Background Scheduler — `scheduler.ts`

A single `setInterval` tick loop that runs every 60 seconds. All state lives in the DB — no in-memory queue — so it is naturally restart-safe.

### `startScheduler(): void`

Entry point. Guards against double-start with a module-level `timer` variable. Calls `tick()` immediately on boot (so any overdue follow-ups are processed within seconds of startup), then sets the 60-second interval.

### `tick(): Promise<void>`

Top-level orchestrator. Uses a `running` boolean flag to prevent overlapping ticks (if one tick takes longer than 60 seconds, the next tick is skipped). Runs four phases in order:
1. `processDueFollowUps()`
2. `completeFinishedFollowUps()`
3. `processRenewalReminders()`
4. `processCampaigns()`

Errors in `tick()` are caught and logged without crashing the process.

### `processDueFollowUps(): Promise<void>`

Queries all `follow_ups` rows where `status = PENDING` AND `scheduled_at <= now`. Calls `processFollowUp` for each. Errors per-row are isolated — one failing follow-up never blocks others.

### `processFollowUp(followUp, monthlyAgentId): Promise<void>`

Fires a single due follow-up call. Steps:

1. **Agent selection** — `MONTHLY_CHECKIN` uses the org's `monthly_checkin_agent_id`; all others use `followUp.bolna_agent_id`. Skips (leaves PENDING) if no agent is configured.
2. **Atomic claim** — updates status to `IN_PROGRESS` WHERE `status = PENDING`. If 0 rows updated, another tick already claimed it — returns immediately. This prevents double-dials.
3. **Lead lookup** — fetches the lead. If missing, marks as `SKIPPED`.
4. **Variable build** — for `CALLBACK_REQUESTED` follow-ups, calls `buildCallbackVars` to build the contextual opening line.
5. **Trigger call** — calls `triggerCall` with the lead's phone, lead ID, and callback variables.
6. **Success path** — updates the follow-up's `call_log_id` to the new call.
7. **Failure path** — reverts status to `PENDING` (so the next tick retries). Logs a warning.

### `buildCallbackVars(notes, leadName): Record<string, string>`

Parses the stored `follow_ups.notes` text (e.g. `"Customer requested callback in 2 minute(s)"`) and builds Bolna template variables:

| Variable | Value |
|---|---|
| `is_callback` | `"true"` |
| `call_type` | `"callback"` |
| `callback_time` | e.g. `"2 minute"` or `"tomorrow"` |
| `callback_opening` | Contextual Hinglish opening line |
| `opening_line` | Same as `callback_opening` (overrides context.ts result) |
| `callback_reason` | Raw notes string |

The `opening_line` override is critical: by the time the callback fires, `buildCallContext` sees the follow-up as `IN_PROGRESS` (already claimed) and returns `inbound_known` type with a generic opening. This override ensures the callback-specific opening wins.

### `completeFinishedFollowUps(): Promise<void>`

Closes the loop on `IN_PROGRESS` follow-ups. For each `IN_PROGRESS` follow-up with a `call_log_id`, checks whether the linked call has reached a terminal status (`COMPLETED`, `FAILED`, `NO_ANSWER`, `BUSY`, `CANCELLED`). If yes, marks the follow-up `COMPLETED` with `completed_at = now`.

### `processRenewalReminders(): Promise<void>`

Runs only if `email_renewal_reminders` is enabled in `api_config`. Queries ACTIVE policies whose `renewal_date` falls within the next 30 days. For each:
1. Checks if a `RENEWAL_REMINDER` follow-up already exists for this policy (dedup).
2. Inserts the follow-up record first (crash-safe: prevents double-email even if email fails).
3. Sends a transactional email via Brevo (if the lead has an email address).

### `processCampaigns(): Promise<void>`

Processes all `ACTIVE` campaigns. For each campaign, delegates to `processSingleCampaign`.

### `processSingleCampaign(campaign, currentTime, now): Promise<void>`

Drives a single campaign forward. Steps:
1. **Window check** — compares IST wall-clock time against `window_start`/`window_end`. Skips if outside the calling window.
2. **Interval check** — ensures at least `interval_minutes` have elapsed since `last_dialed_at`.
3. **Lead pick** — selects the next `PENDING` lead from `campaign_leads`.
4. **Complete check** — if no PENDING leads remain, marks campaign `COMPLETED`.
5. **Atomic claim** — sets `campaign_leads.status = IN_PROGRESS` WHERE `status = PENDING`.
6. **Trigger call** — calls `triggerCall` with `is_campaign: "true"` and `campaign_name`.
7. **Update** — marks the lead `CALLED` (or `FAILED`) and updates `campaign.last_dialed_at`.

---

## 8. Live Feed Events — `events.ts`

A lightweight in-process pub/sub bus for streaming call updates to the frontend in real time.

### `liveFeed`
A Node.js `EventEmitter` instance. `setMaxListeners(0)` allows unlimited SSE client connections without warnings.

### `emitCallUpdate(call: unknown): void`
Emits a `{ type: "call_update", call }` event on the `liveFeed` emitter. Called every time a call log row is updated (status change, transcript arrived, etc.).

The SSE route handler in `call-logs.ts` subscribes each connected browser to `liveFeed` and forwards events as `data: ...` SSE messages. When the browser disconnects, the listener is removed.

---

## 9. HTTP Routes

### Auth — `POST /api/auth/login`
Accepts `{ password }`. Calls `checkPassword`. On success, calls `setSessionCookie` and returns `{ ok: true }`. Returns 401 on wrong password.

### Auth — `POST /api/auth/logout`
Calls `clearSessionCookie`. Returns `{ ok: true }`.

### Auth — `GET /api/auth/me`
Returns `{ authenticated: true/false }` based on the current cookie.

### Leads — `GET /api/leads`
Returns all leads for the org, ordered by `created_at DESC`.

### Leads — `POST /api/leads/:id/call`
Triggers an outbound call to the lead. Reads the lead's `bolna_agent_id`, calls `triggerCall`. Returns `TriggerOutcome`.

### Call Logs — `GET /api/calls`
Returns recent call logs with lead info joined.

### Call Logs — `GET /api/calls/live` (SSE)
Server-Sent Events endpoint. Subscribes the client to `liveFeed` and streams `call_update` events. Sends a heartbeat comment every 25 seconds to keep the connection alive through proxies.

### Call Logs — `POST /api/webhooks/bolna`
Receives Bolna webhook events (call status changes, transcripts). Updates the relevant `call_logs` row. Triggers `maybeScheduleCallback` for completed calls. **Open — no auth required.**

### Context — `GET /api/context` or `POST /api/context`
Called by Bolna before each inbound call. Accepts `{ phone }` in body or query. Calls `buildCallContext` and returns the full `CallContext` JSON. **Open — no auth required.**

### Follow-ups — `POST /api/follow-ups/:id/call`
Manually triggers a PENDING follow-up immediately (bypasses scheduler). Used for the "Call Now" button and for unsticking overdue follow-ups.

### Settings — `GET /api/settings`
Returns `api_config` with sensitive keys masked: Bolna, Brevo, and Meta keys are replaced with `"configured"` if set. `context_api_bearer_token` is returned unmasked.

### Settings — `PUT /api/settings`
Updates `api_config`. Values equal to `"configured"` are skipped (sentinel — preserves the existing stored key).

### Health — `GET /api/health`
Returns `{ status: "ok", ts: <iso> }`. Unauthenticated. Used by Railway for health checks.

---

## 10. Data Flow: Full Outbound Call Lifecycle

```
User clicks "Call" in UI
        │
        ▼
POST /api/leads/:id/call
        │
        ▼
triggerCall(agentId, phone, leadId)
        │
        ├─► buildCallContext(phone)
        │       │  Queries: leads, call_logs, follow_ups, policies
        │       └─► Returns CallContext (memory + opening_line + call_type)
        │
        ├─► bolna.startCall({ agent_id, phone, user_data: context })
        │       └─► Bolna places the call via SIM-linked number
        │
        ├─► INSERT call_logs (status: INITIATED, memory_injected: context)
        │
        ├─► UPDATE leads (last_contacted_at = now)
        │
        ├─► emitCallUpdate → SSE → Frontend shows "Ringing"
        │
        └─► startPolling(callLogId, executionId)
                │  (polls every 6s, max 120 polls)
                │
                ▼
        bolna.getExecution(executionId)
                │
                ├─► UPDATE call_logs (status, transcript, summary, ...)
                │
                ├─► emitCallUpdate → SSE → Frontend updates live
                │
                └─► On call.ended:
                        ├─► dropDetected?
                        │       YES → maybeRetryOnDrop
                        │             (triggers new call if RETRY_ON_DROP active)
                        │
                        └─► COMPLETED + no drop?
                                ├─► maybeAdvanceLeadStage (NEW → CONTACTED)
                                └─► maybeScheduleCallback
                                        (parses transcript for callback request)
```

---

## 11. Data Flow: Callback Request Lifecycle

```
Customer says "do minute baad call karo" during a call
        │
        ▼
Call ends → polling detects COMPLETED
        │
        ▼
maybeScheduleCallback(callLog)
        │
        ├─► Strip assistant: lines from transcript
        │       (prevents opening line "10 minute baad" from being matched)
        │
        ├─► parseCallbackIntent(userOnlyText + summary)
        │       └─► Detects "do minute baad call" → +2 minutes
        │
        ├─► Dedup: no existing PENDING follow-up for this call_log_id?
        │
        ├─► INSERT follow_ups (type: CALLBACK_REQUESTED, scheduled_at: +2min)
        │
        └─► UPDATE leads (next_followup_at = scheduled_at)

                        ↓ (up to 60 seconds later)

Scheduler tick fires (every 60s)
        │
        ▼
processDueFollowUps()
        │  WHERE status=PENDING AND scheduled_at <= now
        ▼
processFollowUp(followUp)
        │
        ├─► Atomic claim: UPDATE status=IN_PROGRESS WHERE status=PENDING
        │
        ├─► buildCallbackVars(notes, leadName)
        │       └─► opening_line: "do minute baad call karne ko kaha tha"
        │
        ├─► triggerCall(agentId, phone, leadId, callbackVars)
        │       │
        │       └─► buildCallContext(phone) runs again
        │               (follow-up is IN_PROGRESS, returns inbound_known)
        │               callbackVars.opening_line OVERRIDES the generic opening
        │
        └─► UPDATE follow_ups (call_log_id = new call log id)

                        ↓ (after callback call completes)

completeFinishedFollowUps()
        │  Linked call reaches terminal status
        └─► UPDATE follow_ups (status=COMPLETED, completed_at=now)
```

---

## 12. Database Tables Reference

| Table | Purpose |
|---|---|
| `leads` | Prospect/customer records. Has `stage`, `next_followup_at`, `last_contacted_at`. |
| `call_logs` | One row per call. Stores Bolna execution ID, transcript, summary, `memory_injected` snapshot, `drop_detected`, `call_type`. |
| `follow_ups` | Scheduled actions. Types: `CALLBACK_REQUESTED`, `MONTHLY_CHECKIN`, `RENEWAL_REMINDER`. Statuses: `PENDING → IN_PROGRESS → COMPLETED / SKIPPED`. |
| `campaigns` | Bulk outbound campaigns. Has `window_start`, `window_end`, `interval_minutes`. |
| `campaign_leads` | Individual leads within a campaign. Status: `PENDING → IN_PROGRESS → CALLED / FAILED`. |
| `policies` | Insurance policy records per lead. |
| `api_config` | Single-row org config: Bolna key, Brevo key, agent IDs, feature flags. |
| `automations` | Rules like `RETRY_ON_DROP`. Has `is_active` flag. |

---

## 13. Environment Secrets

| Secret | Used by | Purpose |
|---|---|---|
| `ADMIN_PASSWORD` | `auth.ts` | Single password for CRM login |
| `SESSION_SECRET` | `auth.ts` | HMAC key for session cookie signing |
| `DATABASE_URL` | Drizzle ORM | PostgreSQL connection string |

API keys (Bolna, Brevo, Meta) are stored in the `api_config` DB table and managed via the Settings page — not in environment variables. This lets them be updated at runtime without a redeploy.
