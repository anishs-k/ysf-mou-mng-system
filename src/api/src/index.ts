/**
 * Purpose: Entry point of @mou/api. createApp() wires the master data routers of
 * SPEC-01 section 7 onto an Express application and is exported so the integration
 * tests can drive the real HTTP surface on an ephemeral port instead of a mock.
 * The listen body runs only when this file is executed directly, so importing it
 * has no side effects. PACKAGE_NAME is exported for the workspace smoke test.
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import type { Express } from "express";
import type { Pool } from "pg";

import { requireSession } from "./auth/middleware.ts";
import { createDatabase, createPool } from "./db/client.ts";
import { runExportCleanup } from "./jobs/export-cleanup.ts";
import { runExpiryAlertJob } from "./jobs/expiry-alerts.ts";
import { createAlertsRouter } from "./routes/alerts.ts";
import { createAdminUsersRouter } from "./routes/admin-users.ts";
import { createAuthRouter } from "./routes/auth.ts";
import { createCompaniesRouter } from "./routes/companies.ts";
import { createAgreementHistoryRouter } from "./routes/agreement-history.ts";
import { createCompanyViewRouter } from "./routes/company-view.ts";
import { createDashboardSummaryRouter } from "./routes/dashboard-summary.ts";
import { createEditAgreementRouter } from "./routes/edit-agreement.ts";
import { createEnumsRouter } from "./routes/enums.ts";
import { createMouDocumentsRouter } from "./routes/mou-documents.ts";
import { createPublicStatsRouter } from "./routes/public-stats.ts";
import { createSearchExportRouter } from "./routes/search-export.ts";
import { createZoneDashboardRouter } from "./routes/zone-dashboard.ts";
import { createZonesRouter } from "./routes/zones.ts";

export const PACKAGE_NAME = "@mou/api";

const DEFAULT_PORT = 3001;
const DEFAULT_WEB_ORIGIN = "http://localhost:5173";

export function createApp(pool: Pool): Express {
  const db = createDatabase(pool);
  const app = express();

  const rawWebOrigin = process.env["WEB_ORIGIN"] ?? DEFAULT_WEB_ORIGIN;
  const configuredOrigins = rawWebOrigin
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);

  // The web app has its own origin in development (Vite on 5173) and shares the
  // origin behind nginx in production, so the allowed origin is configurable.
  // credentials:true is what lets the session cookie travel.
  app.use(
    cors({
      origin: (requestOrigin, callback) => {
        if (!requestOrigin) {
          callback(null, true);
          return;
        }
        const normalized = requestOrigin.replace(/\/$/, "");
        if (
          configuredOrigins.includes(normalized) ||
          configuredOrigins.includes("*")
        ) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    "/api",
    createAuthRouter(pool, db),
    createPublicStatsRouter(pool),
    createEnumsRouter(),
    createZonesRouter(db, pool),
    createCompaniesRouter(db, pool),
    createCompanyViewRouter(db, pool),
    createMouDocumentsRouter(db, pool),
    createEditAgreementRouter(db, pool),
    createAgreementHistoryRouter(db, pool),
    createZoneDashboardRouter(db, pool),
    createDashboardSummaryRouter(pool),
    createSearchExportRouter(db, pool),
    createAlertsRouter(pool),
    createAdminUsersRouter(db, pool),
  );

  const webDistPath = fs.existsSync(path.resolve(process.cwd(), "src/web/dist"))
    ? path.resolve(process.cwd(), "src/web/dist")
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");

  if (fs.existsSync(webDistPath)) {
    app.use(express.static(webDistPath));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) {
        return next();
      }
      res.sendFile(path.join(webDistPath, "index.html"));
    });
  }

  return app;
}

/** How often the process checks whether the expiry job is due (SPEC-08
 * section 3). The job itself is a no-op re-check when nothing is due, so an
 * hourly interval costs nothing beyond one cheap query - it is not the job's
 * own schedule, only how promptly a new day is noticed. */
const EXPIRY_JOB_CHECK_INTERVAL_MS = 60 * 60 * 1000;

async function main(): Promise<void> {
  const connectionString = process.env["DATABASE_URL"];
  if (connectionString === undefined || connectionString === "") {
    throw new Error(
      "DATABASE_URL must be set - see environment.sh and .env.example",
    );
  }
  const port = Number(process.env["PORT"] ?? DEFAULT_PORT);
  const pool = createPool(connectionString);
  createApp(pool).listen(port, () => {
    console.log(`@mou/api listening on port ${port}`);
  });

  // Runs once at startup (catching up any missed days immediately) and then
  // on a check interval - never inside a request handler, so a slow scan of
  // the mou table can never add latency to an HTTP response.
  const runAndLog = (): void => {
    runExpiryAlertJob(pool).catch((error: unknown) => {
      console.error("Expiry alert job failed:", error);
    });
  };
  runAndLog();
  setInterval(runAndLog, EXPIRY_JOB_CHECK_INTERVAL_MS);

  // SPEC-13 section 5: a generated export outlives its 24-hour window only
  // by however long it takes this same hourly check to notice - fine for a
  // "deleted after 24 hours" requirement, not a precise TTL.
  const runExportCleanupAndLog = (): void => {
    runExportCleanup(pool).catch((error: unknown) => {
      console.error("Export cleanup failed:", error);
    });
  };
  runExportCleanupAndLog();
  setInterval(runExportCleanupAndLog, EXPIRY_JOB_CHECK_INTERVAL_MS);
}

const invokedPath = process.argv[1];
const isDirectRun =
  invokedPath !== undefined &&
  path.resolve(invokedPath) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
