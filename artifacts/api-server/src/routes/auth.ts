import { Router, type IRouter } from "express";
import {
  checkPassword,
  setSessionCookie,
  clearSessionCookie,
  isAuthenticated,
  ADMIN_PASSWORD,
} from "../lib/auth";

const router: IRouter = Router();

router.post("/auth/login", (req, res): void => {
  const { password } = req.body as { password?: string };
  if (!password) {
    res.status(400).json({ error: "Password required" });
    return;
  }
  if (!ADMIN_PASSWORD) {
    res.status(503).json({
      error:
        "ADMIN_PASSWORD environment variable is not set. Ask your administrator to configure it.",
    });
    return;
  }
  if (!checkPassword(password)) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  setSessionCookie(res);
  res.json({ ok: true });
});

router.post("/auth/logout", (_req, res): void => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/auth/me", (req, res): void => {
  res.json({ authenticated: isAuthenticated(req) });
});

export default router;
