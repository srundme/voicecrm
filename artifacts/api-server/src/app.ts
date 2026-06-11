import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import authRouter from "./routes/auth";
import { logger } from "./lib/logger";
import { requireAuth } from "./lib/auth";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api", authRouter);

app.use("/api", (req, res, next) => {
  const open = ["/health", "/webhooks/", "/context", "/auth/"];
  if (open.some((p) => req.path === p.replace(/\/$/, "") || req.path.startsWith(p))) {
    next();
    return;
  }
  requireAuth(req, res, next);
});

app.use("/api", router);

if (process.env.NODE_ENV === "production") {
  const staticDir = path.resolve(__dirname, "../../web/dist/public");
  app.use(express.static(staticDir));
  app.get("{*path}", (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

export default app;
