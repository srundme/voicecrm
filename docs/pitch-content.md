# VoiceCRM — Pitch Deck Content

> **Audience:** AI Voice competition judges. Skip the basics. Lead with insight.

---

## SLIDE 1 — TITLE

**VoiceCRM**
*The first AI voice agent that actually remembers your customers*

Policyfy.com · IRDAI Registered Insurance Broker · Built for India

---

## SLIDE 2 — THE PROBLEM (30 seconds)

**Every AI voice agent in this room has the same bug.**

Each call starts cold.

> *"Namaste, I'm calling about your insurance needs..."*

Meanwhile the customer already told you last Tuesday:
- Family of 4
- No existing coverage
- Budget ₹8,000/year
- Asked you to call back Thursday morning

**Stateless agents don't just frustrate customers. They destroy conversion.**

The average insurance lead is contacted 4.2 times before closing.
Every repeat call that starts from zero erases trust built in the last one.

---

## SLIDE 3 — THE INSIGHT

**Memory isn't a feature. It's the product.**

We didn't build a voice bot for insurance.
We built a memory system that happens to speak Hindi.

Three questions every call should answer before it starts:
1. Who is this person?
2. Where did our last conversation end?
3. Why are we calling them right now?

Standard voice stack answers zero of these.
We answer all three — automatically, from every call.

---

## SLIDE 4 — WHERE WE START (the moat)

These aren't cold calls.

**Every lead in VoiceCRM submitted a form** — Meta ad, website, referral.
They expressed intent. They're expecting a call.

The problem isn't getting them on the phone.
The problem is that by the time you call, you don't know what they wanted,
and by the second call, you've forgotten the first.

We fix both.

---

## SLIDE 5 — ARCHITECTURE (the how)

```
Lead fills form
      │
      ▼
Outbound call triggered
      │
      ├── buildCallContext(phone)
      │     Queries DB: last call summary, pending callbacks, policy info
      │     Returns: call_type + opening_line + context + callback_reason
      │
      ├── Passed to Bolna as user_data (flat JSON, template variables)
      │
      └── Dhivya opens the call with exact situational awareness

Call ends
      │
      ├── Bolna Extraction (GPT-4.1 Mini) → generates structured summary
      ├── Webhook fires → summary stored in call_logs
      └── maybeScheduleCallback() → scans transcript for time intent
```

**One function. Four DB queries. Every call contextualised.**

---

## SLIDE 6 — THE MEMORY LOOP

```
CALL 1               CALL 2               CALL 3
   │                    │                    │
   │  Summary ──────►   │  Summary ──────►   │
   │  stored in DB      │  stored in DB      │
   ▼                    ▼                    ▼
Dhivya ──────────► Dhivya ──────────► Dhivya
remembers            remembers            remembers
nothing              Call 1               Call 1 + 2
```

The memory is not in the model.
The memory is in the database.
The model reads it fresh at the start of every call.

**This is why it works at scale. LLMs forget. Postgres doesn't.**

---

## SLIDE 7 — CALLBACK INTELLIGENCE (the hard part)

Most teams solve this with a button: *"Schedule callback."*

We extract it from the conversation.

> Customer: *"Do minute baad call karo"*

The system hears this, parses it, and schedules a callback 2 minutes out — no human in the loop.

**The non-obvious problem we solved:**

Dhivya's own opening line echoes the previous callback time:
> *"Aapne humhe 10 minute baad call karne ko kaha tha..."*

Early versions matched THIS line — scheduling every callback for 10 minutes.

**Fix:** Strip all `assistant:` lines before parsing. Only the customer's words are parsed.

One line of code. Required understanding the full transcript structure.

---

## SLIDE 8 — CALL TYPE INTELLIGENCE

The system classifies every call before Dhivya speaks a word:

| Call Type | Trigger | Opening Strategy |
|---|---|---|
| `new` | First ever call | References the form they filled |
| `drop_retry` | Call dropped < 15 min ago | Apologetic, continues from summary |
| `callback` | Scheduler fires | Echoes the exact time they requested |
| `inbound_known` | Known number calls in | Warm, picks up from last summary |
| `inbound_new` | Unknown number | Fresh prospect flow |

**Different context. Different opening. Same agent. Zero configuration.**

---

## SLIDE 9 — THE SCHEDULER

Callbacks are database-backed. Not in-memory. Not a cron job.

```
Scheduler tick (every 60 seconds)
  └── SELECT follow_ups WHERE status=PENDING AND scheduled_at <= now
  └── Atomic claim: UPDATE status=IN_PROGRESS WHERE status=PENDING
      (prevents double-dial across overlapping ticks)
  └── buildCallbackVars → inject callback context
  └── triggerCall → Dhivya calls back
  └── On failure: revert to PENDING (auto-retry next tick)
```

**Server restart? The queue survives. Bolna hiccup? Auto-retried.**
No in-memory state. No lost callbacks.

---

## SLIDE 10 — WHAT WE DIDN'T BUILD

We deliberately did not build:
- A custom LLM
- A custom speech model
- A new telephony stack

**We built the orchestration layer that makes existing voice AI remember.**

Bolna handles the voice. GPT handles summaries. We handle everything in between:
context retrieval, memory injection, callback detection, scheduling, live CRM sync.

The insight is that **the hard problem in voice AI for sales isn't the voice — it's the state.**

---

## SLIDE 11 — RESULTS / WHAT THIS ENABLES

A customer who said:
> *"Kal subah 10 baje call karna, family ke saath baat karni hai"*

Gets a call tomorrow at 10 AM that opens with:
> *"[Name] ji, aapne kal subah call karne ko kaha tha — kya family se baat ho gayi?"*

No CRM entry. No manual scheduling. No agent training.
**Fully automated. Fully contextual.**

---

## SLIDE 12 — STACK (for the technical judges)

| Layer | Tool | Our contribution |
|---|---|---|
| Voice AI | Bolna (Dhivya agent) | System prompt + variable injection |
| LLM | GPT-4.1 Mini | Post-call extraction + compliance |
| Memory | PostgreSQL + Drizzle | buildCallContext() — 4-query context builder |
| Scheduler | Node.js setInterval + DB | Restart-safe, atomic claim, auto-retry |
| API | Express 5 | Webhooks, SSE live feed, auth |
| Frontend | React + Vite | Real-time CRM, campaign manager |
| Infra | Railway | Production · Replit · Dev |

---

## SLIDE 13 — THE ONE-LINER

> **VoiceCRM gives AI voice agents the one thing they're missing: memory.**

Not session memory.
Not in-context memory.
**Persistent, cross-call, database-backed memory — automatically built from every conversation.**

---

## TALKING POINTS (for Q&A)

**"Why not just use a longer context window?"**
Context windows are per-call. The customer's third call happens days later in a fresh session.
You can't stuff 3 calls of transcript into every new call's context — latency, cost, and the model still can't prioritise. A structured summary injected at the right moment is more reliable than raw transcript flooding.

**"What stops the model from hallucinating the memory?"**
We inject structured summaries, not raw transcripts. The extraction prompt forces factual output.
And critically — if there's no memory (new lead), the system knows to say nothing about past interactions.

**"How do you handle the callback time parsing robustly?"**
Multi-pattern regex covering Hindi (Roman + Devanagari script), English, and mixed Hinglish.
Relative times (minutes, hours), absolute times (baje), and day references (kal, parso) all handled.
Most importantly: only customer lines are parsed — assistant lines are stripped first.

**"What's the failure mode?"**
If callback scheduling fails — Bolna webhook doesn't fire, transcript is empty, parsing finds nothing —
the follow_up row simply isn't created. No ghost calls. No incorrect scheduling. Fail silent, not fail loud.

**"Why India / insurance specifically?"**
Insurance renewal and cross-sell is the highest-value use case for voice AI in India:
- High repeat contact rate (4+ touches per close)
- Mixed Hindi/English communication
- Regulatory complexity (IRDAI) means trust matters
- Massive underinsured population = enormous TAM
