import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/access";
import { ACCOUNT_COOKIE, verifyAccountToken } from "@/lib/account";
import { pushCloudRecord } from "@/lib/cloudStorage";

export const runtime = "nodejs";

type FeedbackCategory = "bug" | "story" | "ui" | "performance" | "other";
type FeedbackStatus = "open" | "reviewed" | "resolved";

type TesterFeedbackItem = {
  id: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  message: string;
  accountId?: string;
  accountName?: string;
  sessionId?: string;
  sessionTitle?: string;
  turnCount?: number;
  context?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
};

const FEEDBACK_DIR = path.join(process.cwd(), "world", "session", "tester-feedback");
const FEEDBACK_FILE = path.join(FEEDBACK_DIR, "feedback.json");
const FEEDBACK_LIMIT = 200;

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

function normalizeCategory(value: unknown): FeedbackCategory {
  if (value === "bug" || value === "story" || value === "ui" || value === "performance") return value;
  return "other";
}

function normalizeStatus(value: unknown): FeedbackStatus {
  if (value === "reviewed" || value === "resolved") return value;
  return "open";
}

function normalizeText(value: unknown, limit: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

function normalizeContext(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const record = value as Record<string, unknown>;
  const context: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(record).slice(0, 20)) {
    if (typeof rawValue === "string") context[key] = rawValue.slice(0, 700);
    else if (typeof rawValue === "number" && Number.isFinite(rawValue)) context[key] = rawValue;
    else if (typeof rawValue === "boolean") context[key] = rawValue;
    else if (rawValue && typeof rawValue === "object") {
      context[key] = JSON.stringify(rawValue).slice(0, 900);
    }
  }
  return Object.keys(context).length > 0 ? context : undefined;
}

function normalizeFeedbackItem(value: unknown): TesterFeedbackItem | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const message = normalizeText(record.message, 800);
  if (!message) return null;

  const now = new Date().toISOString();
  return {
    id: typeof record.id === "string" ? record.id.slice(0, 80) : `feedback-${Date.now()}`,
    category: normalizeCategory(record.category),
    status: normalizeStatus(record.status),
    message,
    accountId: normalizeText(record.accountId, 80) || undefined,
    accountName: normalizeText(record.accountName, 40) || undefined,
    sessionId: normalizeText(record.sessionId, 80) || undefined,
    sessionTitle: normalizeText(record.sessionTitle, 120) || undefined,
    turnCount: typeof record.turnCount === "number" && Number.isFinite(record.turnCount)
      ? Math.max(0, Math.round(record.turnCount))
      : undefined,
    context: normalizeContext(record.context),
    createdAt: typeof record.createdAt === "string" ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
  };
}

async function readFeedback(): Promise<TesterFeedbackItem[]> {
  try {
    const raw = await fs.readFile(FEEDBACK_FILE, "utf-8");
    const parsed = JSON.parse(stripJsonBom(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeFeedbackItem)
      .filter((item): item is TesterFeedbackItem => item !== null)
      .slice(0, FEEDBACK_LIMIT);
  } catch {
    return [];
  }
}

async function writeFeedback(items: TesterFeedbackItem[]): Promise<boolean> {
  try {
    await fs.mkdir(FEEDBACK_DIR, { recursive: true });
    await fs.writeFile(FEEDBACK_FILE, `${JSON.stringify(items.slice(0, FEEDBACK_LIMIT), null, 2)}\n`, "utf-8");
    return true;
  } catch {
    return false;
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

  const items = await readFeedback();
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request) {
  if (!hasAccess(req)) {
    return NextResponse.json({ error: "Private access is required." }, { status: 401 });
  }

  const profile = verifyAccountToken(readCookie(req.headers, ACCOUNT_COOKIE));
  if (!profile) {
    return NextResponse.json({ error: "Account login is required." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const message = normalizeText((body as Record<string, unknown>).message, 800);
  if (message.length < 4) {
    return NextResponse.json({ error: "Feedback is too short." }, { status: 400 });
  }

  const context = normalizeContext((body as Record<string, unknown>).context);
  const now = new Date().toISOString();
  const item: TesterFeedbackItem = {
    id: `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    category: normalizeCategory((body as Record<string, unknown>).category),
    status: "open",
    message,
    accountId: profile.id,
    accountName: profile.displayName,
    sessionId: normalizeText(context?.sessionId, 80) || undefined,
    sessionTitle: normalizeText(context?.sessionTitle, 120) || undefined,
    turnCount: typeof context?.turnCount === "number" ? context.turnCount : undefined,
    context,
    createdAt: now,
  };

  const items = [item, ...(await readFeedback())].slice(0, FEEDBACK_LIMIT);
  const persisted = await writeFeedback(items);
  const cloud = await pushCloudRecord({
    key: "session/tester-feedback",
    value: { items, updatedAt: now },
    updatedAt: now,
  });
  return NextResponse.json({ ok: true, item, persisted, cloud });
}

export async function PATCH(req: Request) {
  if (!hasAccess(req)) {
    return NextResponse.json({ error: "Private access is required." }, { status: 401 });
  }

  const profile = verifyAccountToken(readCookie(req.headers, ACCOUNT_COOKIE));
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Admin login is required." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const id = normalizeText((body as Record<string, unknown>).id, 80);
  const status = normalizeStatus((body as Record<string, unknown>).status);
  if (!id) {
    return NextResponse.json({ error: "Feedback id is required." }, { status: 400 });
  }

  let found = false;
  const now = new Date().toISOString();
  const items = (await readFeedback()).map((item) => {
    if (item.id !== id) return item;
    found = true;
    return { ...item, status, updatedAt: now };
  });

  if (!found) {
    return NextResponse.json({ error: "Feedback not found." }, { status: 404 });
  }

  const persisted = await writeFeedback(items);
  const cloud = await pushCloudRecord({
    key: "session/tester-feedback",
    value: { items, updatedAt: now },
    updatedAt: now,
  });
  return NextResponse.json({ ok: true, items, persisted, cloud });
}
