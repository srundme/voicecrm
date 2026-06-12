import { ensureApiConfig } from "./org";
import { toE164India } from "./phone";
import { logger } from "./logger";

export type BolnaResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type BolnaAgent = {
  id: string;
  name: string;
  tags: string[];
  phone_numbers: string[];
};

type BolnaPhoneNumber = {
  id: string;
  phone_number: string;
  agent_id: string | null;
  agent_name: string | null;
};

type StartCallResult = {
  execution_id: string;
  status: string;
};

export type BolnaExecution = {
  status: string;
  transcript: string | null;
  summary: string | null;
  recording_url: string | null;
  duration_seconds: number | null;
  ended: boolean;
};

async function getKeys(): Promise<
  { apiKey: string; baseUrl: string } | { error: string }
> {
  const cfg = await ensureApiConfig();
  if (!cfg.bolna_api_key) {
    return { error: "Bolna API key is not configured. Add it in Settings." };
  }
  return {
    apiKey: cfg.bolna_api_key,
    baseUrl: (cfg.bolna_base_url || "https://api.bolna.ai").replace(/\/$/, ""),
  };
}

async function request<T>(
  path: string,
  init: RequestInit,
): Promise<BolnaResult<T>> {
  const keys = await getKeys();
  if ("error" in keys) return { success: false, error: keys.error };
  try {
    const res = await fetch(`${keys.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${keys.apiKey}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let body: unknown = undefined;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = text;
    }
    if (!res.ok) {
      const message =
        (body && typeof body === "object" && "message" in body
          ? String((body as Record<string, unknown>)["message"])
          : null) ?? `Bolna API error (${res.status})`;
      return { success: false, error: message };
    }
    return { success: true, data: body as T };
  } catch (err) {
    logger.error({ err, path }, "Bolna request failed");
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

function asArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["data", "agents", "results", "phone_numbers"]) {
      if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
    }
  }
  return [];
}

function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") return extractSummaryText(v as Record<string, unknown>);
  return String(v);
}

/**
 * Bolna returns summary as a deeply-nested JSON object:
 * {"General":{"Call Summary":{"subjective":"...","objective":"..."}}}
 * This walks the tree and returns the first non-empty string value found
 * under keys like "subjective", "summary", "text", "description" — or
 * falls back to the longest string value anywhere in the object.
 */
function extractSummaryText(obj: unknown, depth = 0): string | null {
  if (obj == null) return null;
  if (typeof obj === "string") return obj.trim() || null;
  if (typeof obj !== "object" || depth > 6) return null;

  const PREFERRED = ["subjective", "summary", "text", "description", "content"];
  const rec = obj as Record<string, unknown>;

  // First pass: preferred keys
  for (const key of PREFERRED) {
    const val = rec[key];
    if (typeof val === "string" && val.trim().length > 10) return val.trim();
  }

  // Second pass: recurse into object values, collect all strings
  const strings: string[] = [];
  for (const val of Object.values(rec)) {
    if (typeof val === "string" && val.trim().length > 10) {
      strings.push(val.trim());
    } else if (typeof val === "object" && val !== null) {
      const nested = extractSummaryText(val, depth + 1);
      if (nested) strings.push(nested);
    }
  }

  // Return the longest string found (most likely the real summary)
  if (strings.length === 0) return null;
  return strings.reduce((a, b) => (a.length >= b.length ? a : b));
}

export const bolna = {
  async testConnection(): Promise<BolnaResult<true>> {
    const res = await request<unknown>("/v2/agent/all", { method: "GET" });
    if (!res.success) return res;
    return { success: true, data: true };
  },

  async listAgents(): Promise<BolnaResult<BolnaAgent[]>> {
    const res = await request<unknown>("/v2/agent/all", { method: "GET" });
    if (!res.success) return res;
    const agents = asArray(res.data).map((a) => {
      const cfg = (a["agent_config"] ?? {}) as Record<string, unknown>;
      const id = str(a["id"] ?? a["agent_id"]) ?? "";
      const name =
        str(a["agent_name"] ?? cfg["agent_name"] ?? a["name"]) ?? "Agent";
      return {
        id,
        name,
        tags: Array.isArray(a["tags"]) ? (a["tags"] as string[]) : [],
        phone_numbers: Array.isArray(a["phone_numbers"])
          ? (a["phone_numbers"] as string[])
          : [],
      };
    });
    return { success: true, data: agents };
  },

  async listPhoneNumbers(): Promise<BolnaResult<BolnaPhoneNumber[]>> {
    const res = await request<unknown>("/phone-numbers/all", { method: "GET" });
    if (!res.success) return res;
    const numbers = asArray(res.data).map((p) => ({
      id: str(p["id"] ?? p["phone_number_id"]) ?? "",
      phone_number: str(p["phone_number"] ?? p["number"]) ?? "",
      agent_id: str(p["agent_id"]),
      agent_name: str(p["agent_name"]),
    }));
    return { success: true, data: numbers };
  },

  async startCall(opts: {
    agentId: string;
    phone: string;
    fromPhone?: string;
    variables?: Record<string, unknown>;
  }): Promise<BolnaResult<StartCallResult>> {
    const payload: Record<string, unknown> = {
      agent_id: opts.agentId,
      recipient_phone_number: toE164India(opts.phone),
      user_data: opts.variables ?? {},
    };
    if (opts.fromPhone) {
      payload.from_phone_number = opts.fromPhone;
    }
    const ud = payload.user_data as Record<string, unknown>;
    logger.info(
      {
        agent_id: payload.agent_id,
        lead_id: ud["lead_id"],
        call_type: ud["call_type"],
        is_callback: ud["is_callback"],
      },
      "Bolna startCall",
    );
    const res = await request<Record<string, unknown>>("/call", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.success) return res;
    const execId =
      str(res.data["execution_id"] ?? res.data["call_id"] ?? res.data["id"]) ??
      "";
    return {
      success: true,
      data: { execution_id: execId, status: str(res.data["status"]) ?? "queued" },
    };
  },

  async getExecution(
    executionId: string,
  ): Promise<BolnaResult<BolnaExecution>> {
    const res = await request<Record<string, unknown>>(
      `/executions/${executionId}`,
      { method: "GET" },
    );
    if (!res.success) return res;
    const d = res.data;
    const rawStatus = (str(d["status"]) ?? "").toLowerCase();
    const ended = [
      "completed",
      "stopped",
      "error",
      "failed",
      "busy",
      "no-answer",
      "no_answer",
      "cancelled",
      "canceled",
    ].includes(rawStatus);
    return {
      success: true,
      data: {
        status: rawStatus || "in_progress",
        transcript: str(d["transcript"]),
        summary: str(d["summary"] ?? d["extracted_data"]),
        recording_url: str(d["telephony_data"]
          ? (d["telephony_data"] as Record<string, unknown>)["recording_url"]
          : d["recording_url"]),
        duration_seconds:
          d["conversation_duration"] != null
            ? Math.round(Number(d["conversation_duration"]))
            : d["duration"] != null
              ? Math.round(Number(d["duration"]))
              : null,
        ended,
      },
    };
  },

  async setInboundAgent(
    phoneNumberId: string,
    agentId: string,
  ): Promise<BolnaResult<true>> {
    const res = await request<unknown>(`/phone-numbers/${phoneNumberId}`, {
      method: "PATCH",
      body: JSON.stringify({ agent_id: agentId }),
    });
    if (!res.success) return res;
    return { success: true, data: true };
  },

  async removeInboundAgent(
    phoneNumberId: string,
  ): Promise<BolnaResult<true>> {
    const res = await request<unknown>(`/phone-numbers/${phoneNumberId}`, {
      method: "PATCH",
      body: JSON.stringify({ agent_id: null }),
    });
    if (!res.success) return res;
    return { success: true, data: true };
  },
};

export type CallStatus =
  | "INITIATED"
  | "RINGING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "NO_ANSWER"
  | "BUSY"
  | "CANCELLED";

export function mapBolnaStatusToCallStatus(status: string): CallStatus {
  const s = status.toLowerCase();
  if (["completed", "stopped"].includes(s)) return "COMPLETED";
  if (["error", "failed"].includes(s)) return "FAILED";
  if (["no-answer", "no_answer"].includes(s)) return "NO_ANSWER";
  if (s === "busy") return "BUSY";
  if (["cancelled", "canceled"].includes(s)) return "CANCELLED";
  if (["ringing", "ringing"].includes(s)) return "RINGING";
  if (["in-progress", "in_progress", "ongoing", "running"].includes(s))
    return "IN_PROGRESS";
  if (["queued", "initiated", "scheduled"].includes(s)) return "INITIATED";
  return "IN_PROGRESS";
}
