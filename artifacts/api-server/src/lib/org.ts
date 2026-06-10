import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, apiConfigTable, type ApiConfigRow } from "@workspace/db";

export const DEFAULT_ORG_ID = "org_default";

function token(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

export function publicBaseUrl(): string {
  if (process.env["PUBLIC_URL"]) return process.env["PUBLIC_URL"].replace(/\/$/, "");
  if (process.env["RAILWAY_PUBLIC_DOMAIN"]) return `https://${process.env["RAILWAY_PUBLIC_DOMAIN"]}`;
  if (process.env["REPLIT_DEV_DOMAIN"]) return `https://${process.env["REPLIT_DEV_DOMAIN"]}`;
  return "";
}

let ensurePromise: Promise<ApiConfigRow> | null = null;

export async function ensureApiConfig(): Promise<ApiConfigRow> {
  const existing = await db
    .select()
    .from(apiConfigTable)
    .where(eq(apiConfigTable.org_id, DEFAULT_ORG_ID));
  if (existing[0]) return existing[0];

  if (!ensurePromise) {
    ensurePromise = (async () => {
      const [row] = await db
        .insert(apiConfigTable)
        .values({
          org_id: DEFAULT_ORG_ID,
          webhook_secret: token(16),
          context_api_bearer_token: token(24),
        })
        .onConflictDoNothing({ target: apiConfigTable.org_id })
        .returning();
      if (row) return row;
      const [again] = await db
        .select()
        .from(apiConfigTable)
        .where(eq(apiConfigTable.org_id, DEFAULT_ORG_ID));
      return again!;
    })();
  }
  try {
    return await ensurePromise;
  } finally {
    ensurePromise = null;
  }
}

export function serializeApiConfig(row: ApiConfigRow) {
  const base = publicBaseUrl();
  return {
    ...row,
    context_api_url: `${base}/api/context`,
    meta_webhook_url: `${base}/api/webhooks/meta?secret=${row.webhook_secret}`,
    website_form_webhook_url: `${base}/api/webhooks/website-form?secret=${row.webhook_secret}`,
  };
}
