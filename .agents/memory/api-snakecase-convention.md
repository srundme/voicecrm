---
name: API field naming convention (VoiceCRM)
description: Why DB rows parse directly into zod response schemas
---

This project's OpenAPI spec uses snake_case field names, so the orval-generated zod schemas expect snake_case keys. The Drizzle tables in `lib/db/src/schema` deliberately use snake_case JS property names (matching the column names) so that a raw `.$inferSelect` row can be passed straight to `XResponse.parse(row)` with no mapper layer.

**How to apply:** Keep new columns snake_case in both the OpenAPI schema and the Drizzle table. Computed/joined fields (lead_name, disposition, context_api_url, etc.) are assembled in route/serialize helpers, not stored.

**Dates:** generated zod uses `zod.coerce.date()` for date-time fields, which accepts JS Date objects returned by Drizzle — no ISO conversion needed before parse. Money columns are `bigint({mode:"number"})` → plain numbers.
