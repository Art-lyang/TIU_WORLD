import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, isAccessEnabled, verifyAccessToken } from "@/lib/access";
import { ACCOUNT_COOKIE, isAdminLoginEnabled, verifyAccountToken } from "@/lib/account";
import { getCloudStorageStatus } from "@/lib/cloudStorage";
import { getWorldIndexStatus } from "@/lib/worldIndex";

export const runtime = "nodejs";

const USER_SCENES_DIR = path.join(process.cwd(), "public", "assets", "user-scenes");
const USER_SCENES_MANIFEST = path.join(USER_SCENES_DIR, "manifest.json");
const API_USAGE_FILE = path.join(process.cwd(), "world", "session", "api-usage", "api-usage.json");
const CURRENT_SESSION_FILE = path.join(process.cwd(), "world", "session", "current-session", "current-session.json");
const SAVED_SESSIONS_FILE = path.join(process.cwd(), "world", "session", "saved-sessions", "saved-sessions.json");
const REVIEW_PENDING_FILE = path.join(
  process.cwd(),
  "world",
  "session",
  "library-review",
  "review-pending-sessions.json",
);
const PRIVATE_SESSIONS_FILE = path.join(process.cwd(), "world", "session", "personal-archive", "private-sessions.json");
const COMPLETED_SESSIONS_FILE = path.join(
  process.cwd(),
  "world",
  "session",
  "personal-archive",
  "completed-sessions.json",
);
const TESTER_FEEDBACK_FILE = path.join(process.cwd(), "world", "session", "tester-feedback", "feedback.json");

function readCookie(headers: Headers, name: string): string | undefined {
  const cookie = headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.split("=")[1];
}

function hasAccess(req: Request): boolean {
  return verifyAccessToken(readCookie(req.headers, ACCESS_COOKIE));
}

function stripJsonBom(raw: string): string {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

async function readJson(pathname: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(pathname, "utf-8");
    return JSON.parse(stripJsonBom(raw));
  } catch {
    return null;
  }
}

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function countFeedbackStatus(value: unknown, status: string): number {
  if (!Array.isArray(value)) return 0;
  return value.filter((item) => {
    if (!item || typeof item !== "object") return false;
    return (item as Record<string, unknown>).status === status;
  }).length;
}

async function countUserSceneFiles(): Promise<number> {
  try {
    const entries = await fs.readdir(USER_SCENES_DIR, { withFileTypes: true });
    return entries.filter((entry) => {
      if (!entry.isFile()) return false;
      return /\.(png|jpe?g|webp|gif|avif)$/i.test(entry.name);
    }).length;
  } catch {
    return 0;
  }
}

async function getWriteMode(): Promise<"writable" | "best_effort"> {
  const probeDir = path.join(process.cwd(), "world", "session", ".diagnostics");
  const probeFile = path.join(probeDir, "write-probe.tmp");
  try {
    await fs.mkdir(probeDir, { recursive: true });
    await fs.writeFile(probeFile, "ok", "utf-8");
    await fs.rm(probeFile, { force: true });
    return "writable";
  } catch {
    return "best_effort";
  }
}

export async function GET(req: Request) {
  if (!hasAccess(req)) {
    return NextResponse.json({ error: "Private access is required." }, { status: 401 });
  }

  const profile = verifyAccountToken(readCookie(req.headers, ACCOUNT_COOKIE));
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Admin login is required." }, { status: 403 });
  }

  const [
    usage,
    currentSession,
    savedSessions,
    reviewPending,
    privateSessions,
    completedSessions,
    manifest,
    feedback,
    imageFiles,
    writeMode,
  ] = await Promise.all([
    readJson(API_USAGE_FILE),
    readJson(CURRENT_SESSION_FILE),
    readJson(SAVED_SESSIONS_FILE),
    readJson(REVIEW_PENDING_FILE),
    readJson(PRIVATE_SESSIONS_FILE),
    readJson(COMPLETED_SESSIONS_FILE),
    readJson(USER_SCENES_MANIFEST),
    readJson(TESTER_FEEDBACK_FILE),
    countUserSceneFiles(),
    getWriteMode(),
  ]);

  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    account: {
      id: profile.id,
      displayName: profile.displayName,
      role: profile.role,
    },
    access: {
      privateGateConfigured: isAccessEnabled(),
      accountGateConfigured: isAdminLoginEnabled(),
      writeMode,
      vercel: Boolean(process.env.VERCEL),
    },
    providers: {
      openai: {
        configured: Boolean(process.env.OPENAI_API_KEY),
        model: process.env.OPENAI_MODEL || "gpt-5",
        fastModelConfigured: Boolean(process.env.OPENAI_FAST_MODEL),
        deepModelConfigured: Boolean(process.env.OPENAI_DEEP_MODEL),
      },
      anthropic: {
        configured: Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL),
        model: process.env.ANTHROPIC_MODEL || null,
        apiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
      },
    },
    limits: {
      dailyCallLimit: Number(process.env.TIU_DAILY_CALL_LIMIT || 120),
      dailyTokenLimit: Number(process.env.TIU_DAILY_TOKEN_LIMIT || 900000),
      maxOutputTokens: Number(process.env.TIU_MAX_OUTPUT_TOKENS || 4000),
      minSecondsBetweenCalls: Number(process.env.TIU_MIN_SECONDS_BETWEEN_CALLS || 2),
      maxContextMessages: Number(process.env.TIU_MAX_CONTEXT_MESSAGES || 36),
    },
    storage: {
      currentSession: Boolean(currentSession),
      savedSessions: countArray(savedSessions),
      reviewPending: countArray(reviewPending),
      privateSessions: countArray(privateSessions),
      completedSessions: countArray(completedSessions),
      apiUsage: usage,
      testerFeedback: {
        total: countArray(feedback),
        open: countFeedbackStatus(feedback, "open"),
        reviewed: countFeedbackStatus(feedback, "reviewed"),
        resolved: countFeedbackStatus(feedback, "resolved"),
      },
    },
    cloudStorage: getCloudStorageStatus(),
    worldIndex: getWorldIndexStatus(),
    assets: {
      userSceneImageFiles: imageFiles,
      manifestItems: countArray((manifest as { items?: unknown[] } | null)?.items),
      manifestPresent: Boolean(manifest),
    },
  });
}
