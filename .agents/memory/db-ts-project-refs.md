---
name: DB project-reference rebuild
description: Why api-server typecheck fails with stale @workspace/db exports
---

`lib/db` is a TypeScript composite project (`composite: true`, `emitDeclarationOnly`, outDir `dist`). Consumers like `artifacts/api-server` reference it via tsconfig `references` and resolve its types from `lib/db/dist/*.d.ts`, NOT from `src`.

**Rule:** After adding/changing schema files in `lib/db/src`, run `pnpm exec tsc -b lib/db` (and `lib/api-zod`) to regenerate declarations before typechecking/building api-server. Otherwise tsc reports "Module '@workspace/db' has no exported member 'xTable'".

**Why:** The stale `dist/index.d.ts` only reflects the old schema. `pnpm --filter @workspace/db run build` does NOT exist (only `push`/`push-force`); use `tsc -b`.

**Also:** the dev workflow bundles via esbuild on start — after route/code changes, restart the `artifacts/api-server: API Server` workflow or it serves a stale bundle (symptom: new routes 404 while /api/healthz still 200).
