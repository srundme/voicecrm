import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, apiConfigTable } from "@workspace/db";
import {
  GetApiConfigResponse,
  UpdateApiConfigBody,
  TestConnectionParams,
} from "@workspace/api-zod";
import {
  DEFAULT_ORG_ID,
  ensureApiConfig,
  serializeApiConfig,
} from "../lib/org";
import { bolna } from "../lib/bolna";

const router: IRouter = Router();

router.get("/settings/api-config", async (_req, res): Promise<void> => {
  const cfg = await ensureApiConfig();
  res.json(GetApiConfigResponse.parse(serializeApiConfig(cfg)));
});

router.put("/settings/api-config", async (req, res): Promise<void> => {
  const parsed = UpdateApiConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await ensureApiConfig();
  const [row] = await db
    .update(apiConfigTable)
    .set({ ...parsed.data })
    .where(eq(apiConfigTable.org_id, DEFAULT_ORG_ID))
    .returning();
  res.json(GetApiConfigResponse.parse(serializeApiConfig(row!)));
});

router.post(
  "/settings/test-connection/:service",
  async (req, res): Promise<void> => {
    const params = TestConnectionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const cfg = await ensureApiConfig();
    const service = params.data.service;

    if (service === "bolna") {
      const result = await bolna.testConnection();
      res.json({
        success: result.success,
        message: result.success ? "Connected to Bolna" : result.error,
      });
      return;
    }

    if (service === "brevo") {
      if (!cfg.brevo_api_key) {
        res.json({ success: false, message: "Brevo API key not set" });
        return;
      }
      try {
        const r = await fetch("https://api.brevo.com/v3/account", {
          headers: { "api-key": cfg.brevo_api_key },
        });
        res.json({
          success: r.ok,
          message: r.ok ? "Connected to Brevo" : `Brevo error (${r.status})`,
        });
      } catch (err) {
        res.json({
          success: false,
          message: err instanceof Error ? err.message : "Network error",
        });
      }
      return;
    }

    if (service === "meta") {
      if (!cfg.meta_ads_access_token) {
        res.json({ success: false, message: "Meta access token not set" });
        return;
      }
      try {
        const r = await fetch(
          `https://graph.facebook.com/v19.0/me?access_token=${encodeURIComponent(cfg.meta_ads_access_token)}`,
        );
        res.json({
          success: r.ok,
          message: r.ok ? "Connected to Meta" : `Meta error (${r.status})`,
        });
      } catch (err) {
        res.json({
          success: false,
          message: err instanceof Error ? err.message : "Network error",
        });
      }
      return;
    }

    res.json({ success: false, message: "Unknown service" });
  },
);

export default router;
