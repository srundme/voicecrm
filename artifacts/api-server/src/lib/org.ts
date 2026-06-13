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

export const SECRET_SENTINEL = "configured";

function maskKey(v: string | null | undefined): string | null {
  return v ? SECRET_SENTINEL : null;
}

export function serializeApiConfig(row: ApiConfigRow) {
  const base = publicBaseUrl();
  return {
    id: row.id,
    org_id: row.org_id,
    bolna_api_key: maskKey(row.bolna_api_key),
    bolna_base_url: row.bolna_base_url,
    brevo_api_key: maskKey(row.brevo_api_key),
    brevo_sender_name: row.brevo_sender_name,
    meta_ads_access_token: maskKey(row.meta_ads_access_token),
    meta_ads_account_id: row.meta_ads_account_id,
    openai_api_key: maskKey(row.openai_api_key),
    webhook_secret: maskKey(row.webhook_secret),
    context_api_bearer_token: row.context_api_bearer_token,
    monthly_checkin_agent_id: row.monthly_checkin_agent_id,
    human_agent_phone: row.human_agent_phone,
    sms_on_lead_created: row.sms_on_lead_created,
    sms_on_call_scheduled: row.sms_on_call_scheduled,
    email_renewal_reminders: row.email_renewal_reminders,
    updated_at: row.updated_at,
    context_api_url: `${base}/api/context`,
    meta_webhook_url: `${base}/api/webhooks/meta?secret=${row.webhook_secret}`,
    website_form_webhook_url: `${base}/api/webhooks/website-form?secret=${row.webhook_secret}`,
  };
}

/**
 * Returns the OpenAI API key to use, in priority order:
 * 1. DB-stored key (set via VoiceCRM settings UI)
 * 2. AI_INTEGRATIONS_OPENAI_API_KEY env var (Replit proxy)
 * 3. OPENAI_API_KEY env var (Railway / direct)
 * 4. "dummy" fallback (OpenAI client won't call if key is missing — will fail loudly)
 */
export async function getOpenAIApiKey(): Promise<string> {
  const cfg = await ensureApiConfig();
  return (
    cfg.openai_api_key ||
    process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] ||
    process.env["OPENAI_API_KEY"] ||
    "dummy"
  );
}
