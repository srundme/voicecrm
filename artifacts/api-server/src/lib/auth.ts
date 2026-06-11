import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const COOKIE_NAME = "vcrm_session";
const SESSION_SECRET =
  process.env["SESSION_SECRET"] ?? randomBytes(32).toString("hex");
export const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"] ?? "";

function sign(payload: string): string {
  return createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
}

export function createSessionToken(): string {
  const payload = `authed.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string): boolean {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  try {
    return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export function checkPassword(candidate: string): boolean {
  if (!ADMIN_PASSWORD) return false;
  try {
    return timingSafeEqual(
      Buffer.from(candidate),
      Buffer.from(ADMIN_PASSWORD),
    );
  } catch {
    return false;
  }
}

export function setSessionCookie(res: Response): void {
  res.cookie(COOKIE_NAME, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: process.env["NODE_ENV"] === "production",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "lax" });
}

export function isAuthenticated(req: Request): boolean {
  const token = (req.cookies as Record<string, string> | undefined)?.[COOKIE_NAME];
  if (!token) return false;
  return verifySessionToken(token);
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isAuthenticated(req)) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
}
