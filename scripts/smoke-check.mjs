#!/usr/bin/env node
/**
 * Pre-frontend smoke check for Sharing Music MVP.
 * Verifies Docker infra (if available), API /health (Postgres + Redis via Nest),
 * and prints clear pass/fail lines.
 *
 * Usage (from repo root, with API already running):
 *   npm run smoke
 *
 * Env:
 *   SMOKE_API_URL  default http://localhost:3001/api/v1
 */
import { spawnSync } from "node:child_process";

const API_BASE = (
  process.env.SMOKE_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001/api/v1"
).replace(/\/$/, "");

const HEALTH_URL = `${API_BASE}/health`;

function ok(label) {
  console.log(`PASS  ${label}`);
}

function fail(label, detail) {
  console.log(`FAIL  ${label}`);
  if (detail) {
    console.log(`      ${detail}`);
  }
}

function section(title) {
  console.log(`\n== ${title} ==`);
}

function checkDockerCompose() {
  section("Docker (PostgreSQL + Redis)");
  const ps = spawnSync("docker", ["compose", "ps", "--format", "json"], {
    encoding: "utf8",
  });

  if (ps.error || ps.status !== 0) {
    fail(
      "docker compose ps",
      (ps.stderr || "").trim() ||
        ps.error?.message ||
        "Docker Desktop may not be running, or docker is not on PATH.",
    );
    return false;
  }

  const raw = (ps.stdout || "").trim();
  if (!raw) {
    fail(
      "compose services",
      "No containers. Run: npm run db:up",
    );
    return false;
  }

  /** @type {Array<{Service?: string; Name?: string; State?: string; Health?: string}>} */
  let rows = [];
  try {
    // docker compose may emit one JSON object per line or a JSON array
    if (raw.startsWith("[")) {
      rows = JSON.parse(raw);
    } else {
      rows = raw
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    }
  } catch {
    // Fallback: plain text table
    const text = spawnSync("docker", ["compose", "ps"], {
      encoding: "utf8",
    });
    const out = text.stdout || "";
    const hasPostgres = /postgres/i.test(out) && /running|up/i.test(out);
    const hasRedis = /redis/i.test(out) && /running|up/i.test(out);
    if (hasPostgres) ok("postgres container looks up");
    else fail("postgres container", "Not running. Run: npm run db:up");
    if (hasRedis) ok("redis container looks up");
    else fail("redis container", "Not running. Run: npm run db:up");
    return hasPostgres && hasRedis;
  }

  const byService = new Map(
    rows.map((row) => [(row.Service || row.Name || "").toLowerCase(), row]),
  );

  let allGood = true;
  for (const name of ["postgres", "redis"]) {
    const row =
      byService.get(name) ||
      [...byService.entries()].find(([key]) => key.includes(name))?.[1];
    if (!row) {
      fail(`${name} container`, "Missing. Run: npm run db:up");
      allGood = false;
      continue;
    }
    const state = (row.State || "").toLowerCase();
    const health = (row.Health || "").toLowerCase();
    const running = state.includes("running") || state === "up";
    const healthy =
      !health || health === "healthy" || health === "starting" || health === "";
    if (running && healthy) {
      ok(`${name} is ${row.State}${row.Health ? ` (${row.Health})` : ""}`);
    } else {
      fail(
        `${name} container`,
        `State=${row.State || "?"} Health=${row.Health || "n/a"}`,
      );
      allGood = false;
    }
  }
  return allGood;
}

async function checkApiHealth() {
  section(`API health (${HEALTH_URL})`);
  try {
    const response = await fetch(HEALTH_URL, {
      headers: { Accept: "application/json" },
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    if (!response.ok) {
      fail(
        "GET /api/v1/health",
        `HTTP ${response.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`,
      );
      fail(
        "database / redis via API",
        "Health handler runs SELECT 1 on Postgres and PING on Redis. Fix API logs, DATABASE_URL, REDIS_URL, then retry.",
      );
      return false;
    }

    if (body && typeof body === "object" && body.status === "ok") {
      ok("API status=ok");
      ok("PostgreSQL reachable (Prisma SELECT 1)");
      ok("Redis reachable (PING)");
      if (body.timestamp) ok(`timestamp ${body.timestamp}`);
      return true;
    }

    fail(
      "GET /api/v1/health",
      `Unexpected body: ${JSON.stringify(body)}`,
    );
    return false;
  } catch (error) {
    fail(
      "GET /api/v1/health",
      `${error instanceof Error ? error.message : String(error)}. Is the API running? npm run api:dev`,
    );
    return false;
  }
}

const dockerOk = checkDockerCompose();
const apiOk = await checkApiHealth();

section("Summary");
if (dockerOk && apiOk) {
  ok("Smoke checks passed — safe to open the frontend (http://localhost:3000)");
  process.exit(0);
}

fail(
  "Smoke checks failed",
  "See docs/E2E-VALIDATION-CHECKLIST.md §0–§3 before opening the web app.",
);
process.exit(1);
