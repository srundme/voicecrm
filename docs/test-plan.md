# VoiceCRM — End-to-End Test Plan

> **Stack:** React+Vite frontend · Express 5 API · Bolna AI calling · Drizzle/Postgres  
> **Agent:** Dhivya (Bolna agent `0668dee1-d70a-4af9-8987-546263db970c`)  
> **Scheduler:** Fires every 60 seconds

---

## Prerequisites

| What | Where |
|---|---|
| Dev API running | `pnpm --filter @workspace/api-server run dev` |
| Admin login | `ADMIN_PASSWORD` secret |
| Test phone number | A real SIM that can receive calls |
| Bolna dashboard | Verify agent is live and has `{opening_line}` in the **First Message** field |
| DB access | `DATABASE_URL` or use the Replit SQL panel |

---

## Flow 1 — New Lead Outbound Call

**Goal:** Verify a brand-new lead receives the standard cold-call opening with no prior context.

### Steps

1. Add a new lead via the CRM UI (or directly in the DB) with a phone number that has **no prior call logs**.
2. Trigger an outbound call from the UI (or via API):
   ```
   POST /api/leads/:leadId/call
   ```
3. Answer the call.

### Expected Behaviour

- Dhivya opens with the standard pitch:  
  *"Namaskaar, main Dhivya baat kar rahi hoon पॉलिसीफाई dot com se…"*
- No mention of any previous conversation.
- `call_logs` row created with `call_type = 'new'`.
- `memory_injected.context` is empty `""`.

---

## Flow 2 — Callback Requested (the main bug fix flow)

**Goal:** Verify that the time the **customer** says is extracted correctly — not the time in Dhivya's opening line.

### Steps

1. Use the lead from Flow 1 (now has 1 call log).
2. Trigger a second outbound call.
3. Dhivya will open with:  
   *"…aapne humhe **10 minute** baad call karne ko kaha tha…"*  
   ← This line must **not** influence the extracted callback time.
4. During the call, say a different time, e.g.:  
   **"Do minute baad call karein"** (2 minutes)  
   or **"Kal subah call karo"** (tomorrow morning)
5. End the call. Wait for the Bolna webhook to fire (usually within 30 s).

### Verify in DB

```sql
SELECT notes, scheduled_at, status
FROM follow_ups
WHERE lead_id = '<your-lead-id>'
ORDER BY created_at DESC
LIMIT 1;
```

| Field | Expected |
|---|---|
| `notes` | `"Customer requested callback in 2 minute(s)"` (not 10) |
| `scheduled_at` | ~2 minutes after the call ended |
| `status` | `PENDING` |

### Verify the callback fires

- Wait up to 60 seconds after `scheduled_at`.
- Phone receives the callback call.
- Dhivya opens with:  
  *"[Name] ji, aapne humse baad mein call karne ko kaha tha. Main wapas aa gayi hoon…"*
- `follow_ups.status` → `COMPLETED` after the call ends.

---

## Flow 3 — Drop Retry (within 15 minutes)

**Goal:** Verify a dropped call triggers an automatic retry with a recovery opening.

### Steps

1. Trigger an outbound call.
2. Answer, say nothing, and **hang up immediately** (simulates a drop).
3. The call log should be marked with `drop_detected = true` by the webhook.
4. Within 15 minutes, trigger another outbound call to the same lead (or wait if auto-retry is wired).

### Expected Behaviour

- `call_type = 'drop_retry'`
- Opening: *"[Name] ji, maafi chahti hoon — lagta hai network ki wajah se call cut ho gayi thi…"*
- `memory_injected.context` = summary from the dropped call (may be empty if call was too short to summarise).

---

## Flow 4 — Memory Injection Across Calls

**Goal:** Verify the previous call's AI summary is carried into the next call.

### Steps

1. Complete a full call where Dhivya and the customer discuss something specific (e.g., health insurance for a family of 4).
2. Wait for the Bolna webhook → confirm `call_logs.summary` is populated:
   ```sql
   SELECT summary FROM call_logs
   WHERE lead_id = '<id>'
   ORDER BY created_at DESC LIMIT 1;
   ```
3. Trigger another outbound call (not a callback — wait until any PENDING follow-up clears first).

### Expected Behaviour

- `call_type = 'inbound_known'` (or `new` if it's the very next outbound).
- `memory_injected.context` = the summary text from step 2.
- Dhivya should be able to reference the previous conversation if asked.

---

## Flow 5 — Inbound Call from Known Number

**Goal:** Verify an inbound call from a known lead is enriched with full context.

### Steps

1. Ensure the lead has at least one completed call log with a non-empty `summary`.
2. Have the test number **call the Bolna inbound number** (or simulate by POSTing to `/context` with the phone number):
   ```
   POST /context
   { "phone": "+91XXXXXXXXXX" }
   ```

### Expected Behaviour

```json
{
  "call_type": "inbound_known",
  "user_name": "Sana Shaikh",
  "context": "<previous summary text>",
  "opening_line": "Namaskaar Sana ji, main Dhivya baat kar rahi hoon पॉलिसीफाई se. Kaise hain aap?",
  "policy_number": "...",
  "renewal_date": "..."
}
```

---

## Flow 6 — Inbound Call from Unknown Number

**Goal:** Verify an unknown caller is handled gracefully.

### Steps

1. POST to `/context` with a phone number **not in the leads table**:
   ```
   POST /context
   { "phone": "+910000000000" }
   ```

### Expected Behaviour

```json
{
  "call_type": "inbound_new",
  "user_name": "",
  "context": "",
  "opening_line": ""
}
```

---

## Scheduler Timing Reference

| Event | Approximate timing |
|---|---|
| Webhook fires after call ends | 5–30 seconds |
| `call_logs.summary` populated | Within the webhook processing |
| `follow_ups` row created | Same webhook |
| Scheduler picks up the follow-up | Within 60 seconds of `scheduled_at` |
| Max delay between `scheduled_at` and actual call | ≤60 seconds (one tick interval) |

---

## Quick DB Queries

```sql
-- All follow-ups for a lead
SELECT type, status, scheduled_at, notes
FROM follow_ups
WHERE lead_id = '<id>'
ORDER BY created_at DESC;

-- Last call log with injected memory
SELECT call_type, summary, memory_injected, created_at
FROM call_logs
WHERE lead_id = '<id>'
ORDER BY created_at DESC
LIMIT 3;

-- Stuck PENDING follow-ups (overdue by > 5 min)
SELECT id, lead_id, scheduled_at, notes
FROM follow_ups
WHERE status = 'PENDING'
  AND scheduled_at < NOW() - INTERVAL '5 minutes';
```

---

## Common Failures & Fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| Callback time always "10 minutes" | Bug now fixed — assistant lines were being parsed | Confirm you're on the latest deploy |
| Callback never fires | Scheduler not running / server restarted | Restart API server; check `Background scheduler started` in logs |
| `follow_ups` row not created | Webhook didn't fire or call ended too quickly | Check `/api/webhooks/bolna` in server logs |
| `context` is empty on second call | `summary` not populated on first call | Check Bolna transcript length — very short calls may not generate a summary |
| Double callback call | Manual trigger fired while scheduler was about to tick | Check for duplicate `Bolna startCall` entries in logs; safe to ignore |
