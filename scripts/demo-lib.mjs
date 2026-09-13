/**
 * Shared helpers for the demo-data pipeline scripts.
 *
 * The pipeline is a one-off authoring tool, not app runtime. Every script here
 * drives the REAL API routes on a running dev server so that reference
 * translations, gradings and cloze exercises in data/demo/*.json are genuine
 * model output rather than hand-written imitations.
 *
 * Prerequisites:
 *   npm run dev                     (http://localhost:3000)
 *   .env.local with NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Rate limits (lib/rate-limit.ts) are per user per rolling hour, and every run
 * of a script signs in as a BRAND NEW anonymous user — so the buckets reset per
 * invocation, and the real constraint is "per run", not "per day". That is what
 * makes splitting a large grading job across several invocations work.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServerClient } from "@supabase/ssr";

export const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(SCRIPT_DIR, "..");
export const OUT_DIR = join(SCRIPT_DIR, ".demo-out");

export const DEFAULT_BASE_URL = "http://localhost:3000";

// ---------------------------------------------------------------------------
// env
// ---------------------------------------------------------------------------

/**
 * Minimal .env.local reader — the app itself never loads dotenv, and adding a
 * dependency for a script that runs a handful of times is not worth it.
 * Never overrides a variable that is already set in the environment.
 */
export function loadEnvLocal() {
  const file = join(REPO_ROOT, ".env.local");
  if (!existsSync(file)) return;

  for (const rawLine of readFileSync(file, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------

/**
 * Sign in as a throwaway anonymous user and return its cookie header.
 *
 * proxy.ts answers 401 to any unauthenticated /api request, so the scripts need
 * a real session. Rather than hand-rolling the chunked `sb-<ref>-auth-token`
 * cookie format, we hand @supabase/ssr an in-memory Map as its cookie jar, let
 * it write whatever it wants, and replay that jar as a Cookie header.
 */
export async function signInAsGuest() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing (.env.local)");
  }

  const jar = new Map();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value } of list) {
          if (value === "") jar.delete(name);
          else jar.set(name, value);
        }
      },
    },
  });

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(`signInAnonymously failed: ${error.message}`);
  if (jar.size === 0) throw new Error("no auth cookie was written — cannot authenticate against /api");

  const cookieHeader = [...jar.entries()]
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");

  return { userId: data.user.id, cookieHeader };
}

// ---------------------------------------------------------------------------
// http
// ---------------------------------------------------------------------------

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Thrown on HTTP 429 so callers can flush partial work and print a resume hint. */
export class RateLimitError extends Error {
  constructor(path) {
    super(`rate limited on ${path}`);
    this.name = "RateLimitError";
    this.path = path;
  }
}

export async function postJson(baseUrl, cookieHeader, path, body) {
  const res = await fetch(baseUrl + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify(body),
  });

  if (res.status === 429) throw new RateLimitError(path);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${path} → ${res.status} ${text.slice(0, 300)}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// cli + files
// ---------------------------------------------------------------------------

/** Accepts both `--lang es` and `--lang=es`. */
export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq !== -1) {
      args[token.slice(2, eq)] = token.slice(eq + 1);
    } else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
      args[token.slice(2)] = argv[++i];
    } else {
      args[token.slice(2)] = true;
    }
  }
  return args;
}

export const parseList = (value) =>
  typeof value === "string" ? value.split(",").map((s) => s.trim()).filter(Boolean) : null;

export function ensureOutDir() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
}

export function readOut(name, fallback) {
  const file = join(OUT_DIR, name);
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, "utf8"));
}

export function writeOut(name, data) {
  ensureOutDir();
  const file = join(OUT_DIR, name);
  writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data, null, 2) + "\n", "utf8");
  return file;
}

/** Accent- and case-insensitive compare, for the vocabulary occurrence checks. */
export const normalize = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
