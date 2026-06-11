# VoiceCRM — Bolna Agent Setup Guide

This guide tells you exactly how to create and configure the two agents VoiceCRM uses,
and which variables to reference in each prompt so the AI has full memory of every lead.

---

## How Memory Works

Before every outbound call, VoiceCRM automatically looks up the lead in the database and
injects these variables into your Bolna agent. **You don't write any code** — just use
the variable names in single-curly-braces `{variable_name}` inside your Bolna prompt.

---

## Full Variable Reference

| Variable | What it contains | Example value |
|---|---|---|
| `{user_name}` | Lead's full name | `Ramesh Kumar` |
| `{gender}` | Lead's gender | `male` / `female` / `other` |
| `{city}` | Lead's city | `Mumbai` |
| `{insurance_type}` | Insurance interest | `life` / `health` / `motor` |
| `{call_type}` | Why this call is happening | `new` / `drop_retry` / `callback` / `inbound_known` |
| `{context}` | Summary of the last call with this person | *"Customer showed interest in term plan, asked for callback after salary..."* |
| `{opening_line}` | Pre-built opening sentence for this call | *"Ramesh ji, lagta hai call cut ho gayi..."* |
| `{callback_opening}` | Opening line for callback calls specifically | *"Aapne humse baad mein call karne ko kaha tha..."* |
| `{callback_reason}` | Why they asked to be called back | *"Customer requested callback in 30 minutes"* |
| `{previous_summary}` | Same as context (alias) | *"..."* |
| `{policy_number}` | Their existing policy number (if any) | `LIC-2023-884421` |
| `{renewal_date}` | Their policy renewal date (if any) | `2026-09-15` |
| `{account_status}` | Their current lead stage | `NEW` / `CONTACTED` / `INTERESTED` / `DOCS_PENDING` |
| `{lead_id}` | Internal UUID (for reference only) | `uuid-xxx` |

> **Call type values explained:**
> - `new` — first ever call to this number, no history
> - `drop_retry` — last call dropped/cut within 15 min, retrying
> - `callback` — lead asked to be called back, this is that callback
> - `inbound_known` — lead called in, we recognise the number
> - `inbound_new` — unknown caller, not in the system

---

## Agent 1 — Main Outbound Sales Agent

**Purpose:** Cold outreach to new leads + follow-up on warm leads.  
**Set this agent in:** Settings → AI Agent → Auto-Call Agent

### Bolna Agent Configuration

- **Name:** `VoiceCRM Main Agent` (or your agency name)
- **Language:** Hindi (India) / Hinglish
- **Voice:** Choose an Indian Hindi female or male voice
- **Agent Type:** Outbound

### Prompt Template

```
You are an insurance sales executive for [YOUR AGENCY NAME], calling in Hindi/Hinglish.

## Lead Context
- Name: {user_name}
- Gender: {gender}
- City: {city}
- Insurance Interest: {insurance_type}
- Lead Stage: {account_status}
- Call Type: {call_type}

## Memory from Previous Calls
{context}

## Instructions Based on Call Type

**If call_type is "new":**
Introduce yourself warmly. Say you're calling from [YOUR AGENCY NAME].
Ask about their insurance needs. Opening: "Namaste, {user_name} ji!
Main [Your Name] bol raha/rahi hoon [AGENCY NAME] se. Aapko thodi der ke liye
insurance ke baare mein baat karni thi."

**If call_type is "drop_retry":**
Use this exact opening: {opening_line}
Then continue from where the last call left off based on: {context}

**If call_type is "callback":**
Use this exact opening: {callback_opening}
Reason for callback: {callback_reason}
Refer to previous summary: {context}

**If call_type is "inbound_known":**
Greet them as a returning customer. Refer to: {context}
Policy number (if any): {policy_number}

## Personality
- Speak in natural Hinglish (mix of Hindi and English)
- Be warm, respectful, never pushy
- Address them as "ji" always
- If they are busy, politely ask when to call back and note it

## Goal
Understand their insurance needs, explain options, and if interested — collect:
- Full name, age, income, existing policies
- Preferred plan type
- Best time to follow up

## Compliance
- Do NOT guarantee returns or make specific financial promises
- Do NOT pressure or push repeatedly if they say no
- Always mention this is an advisory call, not a final offer
- If they say "mujhe nahi chahiye" (don't want), politely end the call
```

### Required Settings in VoiceCRM
After creating this agent in Bolna, copy the **Agent ID** and paste it in:  
`Settings → AI Agent → Auto-Call Agent ID`

---

## Agent 2 — Monthly Renewal / Check-in Agent

**Purpose:** Remind existing policy holders about upcoming renewals and do monthly
relationship check-ins.  
**Set this agent in:** Settings → AI Agent → Monthly Check-in Agent

### Bolna Agent Configuration

- **Name:** `VoiceCRM Renewal Agent`
- **Language:** Hindi (India) / Hinglish
- **Voice:** Same voice as main agent (consistency builds trust)
- **Agent Type:** Outbound

### Variables Available for This Agent

This agent gets the full context plus these extra fields when a renewal is near:

| Variable | What it contains |
|---|---|
| `{user_name}` | Customer's full name |
| `{policy_number}` | Their active policy number |
| `{renewal_date}` | When their policy renews (YYYY-MM-DD) |
| `{insurance_type}` | Type of policy (life, health, motor…) |
| `{context}` | Summary of last interaction |
| `{account_status}` | Their current stage (usually `POLICY_ISSUED` or `RENEWAL_DUE`) |
| `{city}` | Their city |

### Prompt Template

```
You are a customer relationship executive at [YOUR AGENCY NAME], calling
existing policyholders in Hindi/Hinglish for monthly check-ins and renewal reminders.

## Customer Details
- Name: {user_name}
- City: {city}
- Policy Number: {policy_number}
- Policy Type: {insurance_type}
- Renewal Date: {renewal_date}
- Account Status: {account_status}

## Previous Interaction Notes
{context}

## Your Goal

**If renewal_date is provided (within 30 days):**
This is a renewal reminder call. Opening:
"Namaste {user_name} ji! Main [Your Name] bol raha/rahi hoon [AGENCY NAME] se.
Aapki {insurance_type} policy {policy_number} ki renewal date
{renewal_date} aa rahi hai. Main aapko remind karne ke liye call kar raha/rahi tha."

Then:
1. Confirm they want to renew
2. Ask if anything has changed (health, vehicle, address)
3. Explain the renewal premium if known
4. If they want to upgrade or change plan, note it down
5. Confirm their preferred payment method

**If renewal_date is NOT provided (monthly check-in):**
This is a routine relationship call. Opening:
"Namaste {user_name} ji! Main [Your Name] bol raha/rahi hoon [AGENCY NAME] se.
Bas ek quick check-in call tha — sab theek chal raha hai na aapka?"

Then:
1. Ask about their satisfaction with the current policy
2. Ask if any family members need insurance
3. Check if they need any claims assistance
4. Note any new requirements for follow-up

## Tone
- Very warm, like a known relationship manager
- Reference their previous interaction: {context}
- Never be transactional — make them feel valued, not sold to

## Compliance
- Do NOT make specific premium promises without checking the system
- Remind them to pay on time to avoid lapse
- Do NOT collect card/bank details on call — direct them to the portal
```

### Required Settings in VoiceCRM
After creating this agent in Bolna, copy the **Agent ID** and paste it in:  
`Settings → AI Agent → Monthly Check-in Agent ID`

---

## Bulk Campaign Agent (Optional 3rd Agent)

If you run bulk calling campaigns (the Campaigns feature), you can either reuse the
Main Agent or create a dedicated campaign agent. The campaign variables available are:

| Variable | Value |
|---|---|
| `{user_name}` | Lead name from CSV |
| `{name}` | Same as user_name (alias) |
| `{is_campaign}` | `"true"` |
| `{campaign_name}` | Name of the campaign you created |

Plus all the standard memory variables above.

---

## Setup Checklist

- [ ] Create **Main Agent** in Bolna → copy Agent ID → paste in VoiceCRM Settings → **Auto-Call Agent**
- [ ] Create **Renewal Agent** in Bolna → copy Agent ID → paste in VoiceCRM Settings → **Monthly Check-in Agent**
- [ ] (Optional) Create **Campaign Agent** → set it when creating a campaign in VoiceCRM
- [ ] Go to Settings → add your Bolna API Key
- [ ] Test with a single lead first using the **Test Call** button on the Agents page

---

## Tips for Better Memory

1. **Always fill in leads completely** — name, city, gender, insurance type. These fields directly shape what the agent says.
2. **The system auto-detects callback intent** — if a customer says "baad mein call karna", the system schedules a follow-up automatically and the agent opens with the right line next time.
3. **Drop retry is automatic** — if a call drops within 15 minutes, the next call will open with an apology and pick up from the last summary.
4. **Summaries are generated by Bolna** — make sure your Bolna agent is configured to generate a call summary at the end of each call. This becomes the `{context}` for all future calls to that number.
