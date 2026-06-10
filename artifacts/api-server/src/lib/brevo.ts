import { ensureApiConfig } from "./org";
import { normalizePhone } from "./phone";
import { logger } from "./logger";

const BREVO_BASE_URL = "https://api.brevo.com/v3";

async function brevoFetch(
  path: string,
  apiKey: string,
  body: unknown,
): Promise<{ success: boolean }> {
  const res = await fetch(`${BREVO_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.warn({ path, status: res.status, text }, "Brevo request failed");
    return { success: false };
  }
  return { success: true };
}

/**
 * Send a transactional SMS via Brevo. Phone is normalized to 10 digits and
 * prefixed with +91 (India only). Never throws — returns {success:false} and
 * logs on any error so callers can fire-and-forget.
 */
export async function sendSMS(
  phone: string,
  message: string,
): Promise<{ success: boolean }> {
  try {
    const cfg = await ensureApiConfig();
    if (!cfg.brevo_api_key) return { success: false };
    const digits = normalizePhone(phone);
    if (digits.length !== 10) return { success: false };
    return await brevoFetch("/transactionalSMS/sms", cfg.brevo_api_key, {
      sender: cfg.brevo_sender_name || "VoiceCRM",
      recipient: `+91${digits}`,
      content: message,
    });
  } catch (err) {
    logger.error({ err }, "Brevo sendSMS failed");
    return { success: false };
  }
}

/**
 * Send a transactional email via Brevo. Never throws.
 */
export async function sendEmail(
  to: string,
  subject: string,
  htmlContent: string,
  templateId?: number,
): Promise<{ success: boolean }> {
  try {
    const cfg = await ensureApiConfig();
    if (!cfg.brevo_api_key) return { success: false };
    const senderName = cfg.brevo_sender_name || "VoiceCRM";
    const body: Record<string, unknown> = {
      sender: { name: senderName, email: "no-reply@voicecrm.app" },
      to: [{ email: to }],
      subject,
    };
    if (templateId !== undefined) {
      body["templateId"] = templateId;
    } else {
      body["htmlContent"] = htmlContent;
    }
    return await brevoFetch("/smtp/email", cfg.brevo_api_key, body);
  } catch (err) {
    logger.error({ err }, "Brevo sendEmail failed");
    return { success: false };
  }
}

/**
 * Send a templated email via Brevo using a Brevo template id and params.
 * Never throws.
 */
export async function sendTemplateEmail(
  to: string,
  templateId: number,
  params: Record<string, string>,
): Promise<{ success: boolean }> {
  try {
    const cfg = await ensureApiConfig();
    if (!cfg.brevo_api_key) return { success: false };
    const senderName = cfg.brevo_sender_name || "VoiceCRM";
    return await brevoFetch("/smtp/email", cfg.brevo_api_key, {
      sender: { name: senderName, email: "no-reply@voicecrm.app" },
      to: [{ email: to }],
      templateId,
      params,
    });
  } catch (err) {
    logger.error({ err }, "Brevo sendTemplateEmail failed");
    return { success: false };
  }
}

/**
 * Convenience helper: fire a "lead created" welcome SMS if the toggle is on.
 * Fire-and-forget; safe to call without awaiting.
 */
export async function notifyLeadCreated(
  phone: string,
  name: string,
): Promise<void> {
  try {
    const cfg = await ensureApiConfig();
    if (!cfg.sms_on_lead_created) return;
    const company = cfg.brevo_sender_name || "VoiceCRM";
    await sendSMS(
      phone,
      `Namaste ${name}! Hamari team aapko jaldi hi call karegi. - ${company}`,
    );
  } catch (err) {
    logger.error({ err }, "notifyLeadCreated failed");
  }
}

/**
 * Convenience helper: notify a contact that a call has been scheduled.
 * Fire-and-forget.
 */
export async function notifyCallScheduled(
  phone: string,
  whenLabel: string,
): Promise<void> {
  try {
    const cfg = await ensureApiConfig();
    if (!cfg.sms_on_call_scheduled) return;
    await sendSMS(phone, `Aapka call ${whenLabel} par scheduled hai.`);
  } catch (err) {
    logger.error({ err }, "notifyCallScheduled failed");
  }
}
