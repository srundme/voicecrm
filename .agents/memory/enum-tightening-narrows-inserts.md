---
name: pgEnum tightens Drizzle insert/update types
description: Converting Drizzle text columns to pgEnum narrows inferred types to literal unions, breaking code that passes plain strings.
---

When a Drizzle column is changed from `text(...)` to a `pgEnum(...)` column, the
inferred `$inferInsert`/update types for that column become a literal string
union (e.g. `"NEW" | "CONTACTED" | ...`) instead of `string`.

**Why:** any code that builds the value at runtime as a plain `string` — status
mappers (Bolna status -> call_status), CSV/webhook lead ingest that uppercases
free-text, etc. — will stop typechecking, because `string` is not assignable to
the union.

**How to apply:** after enum conversion, narrow such values before insert/update:
- For mappers, give the function an explicit union return type so all literal
  returns satisfy it (do NOT leave it `: string`).
- For external/free-text input, validate-and-narrow with
  `([...] as const).find(x => x === candidate)` and fall back to a default/null,
  instead of `.includes(...) ? candidate : null` (which keeps the type `string`).
Also: api-server consumes `@workspace/db` via TS project references, so after any
schema edit run `tsc --build` on lib/db (and clear api-server `.tsbuildinfo`)
before the new column/type is visible — otherwise typecheck reads stale `dist`.
