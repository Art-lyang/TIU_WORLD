import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/access";
import type { GameResponse } from "@/types/game";

export const runtime = "nodejs";

type MemorySource = "manual" | "auto";

type StoredMemoryItem = {
  id: string;
  text: string;
  source: MemorySource;
  createdAt?: string;
  updatedAt?: string;
};

type StoredEventLogItem = {
  id: string;
  title: string;
  detail: string;
  sceneTime?: string;
  turn?: number;
  tags: string[];
  createdAt: string;
};

type StoredTurn =
  | { role: "user"; content: string; apiContent?: string; hidden?: boolean }
  | { role: "assistant"; response: GameResponse };

type StoredSessionSave = {
  version: 1;
  title: string;
  updatedAt: string;
  turns: StoredTurn[];
  memo: string;
  memoryItems: StoredMemoryItem[];
  eventLogItems: StoredEventLogItem[];
  difficultyMode: "story" | "traveler" | "observed";
  modelProfile: "default" | "fast" | "deep";
  outputTokens: number;
  language: "ko" | "en";
};

const SESSION_DIR = path.join(process.cwd(), "world", "session");
const PLAYER_MEMO_DIR = path.join(SESSION_DIR, "player-memo");
const SUMMARY_MEMORY_DIR = path.join(SESSION_DIR, "summary-memory");
const AUTO_MEMORY_DIR = path.join(SESSION_DIR, "auto-memory");
const EVENT_LOG_DIR = path.join(SESSION_DIR, "event-log");
const CURRENT_SESSION_DIR = path.join(SESSION_DIR, "current-session");

const PLAYER_MEMO_FILE = path.join(PLAYER_MEMO_DIR, "player-memo.json");
const SUMMARY_MEMORY_FILE = path.join(SUMMARY_MEMORY_DIR, "summary-memory.json");
const AUTO_MEMORY_FILE = path.join(AUTO_MEMORY_DIR, "auto-memory.json");
const EVENT_LOG_FILE = path.join(EVENT_LOG_DIR, "event-log.json");
const CURRENT_SESSION_FILE = path.join(CURRENT_SESSION_DIR, "current-session.json");

async function ensureSessionDirs() {
  await Promise.all([
    fs.mkdir(PLAYER_MEMO_DIR, { recursive: true }),
    fs.mkdir(SUMMARY_MEMORY_DIR, { recursive: true }),
    fs.mkdir(AUTO_MEMORY_DIR, { recursive: true }),
    fs.mkdir(EVENT_LOG_DIR, { recursive: true }),
    fs.mkdir(CURRENT_SESSION_DIR, { recursive: true }),
  ]);
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeMemoryItem(item: unknown, source: MemorySource): StoredMemoryItem | null {
  if (!item || typeof item !== "object" || !("text" in item)) return null;

  const record = item as Record<string, unknown>;
  const text = String(record.text ?? "").trim().slice(0, 100);
  if (!text) return null;

  const now = new Date().toISOString();
  return {
    id: typeof record.id === "string" ? record.id : `memory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    source: record.source === "auto" || record.source === "manual" ? record.source : source,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : now,
    updatedAt: now,
  };
}

function normalizeMemoryItems(items: unknown, source: MemorySource): StoredMemoryItem[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => normalizeMemoryItem(item, source))
    .filter((item): item is StoredMemoryItem => item !== null);
}

function normalizeEventLogItem(item: unknown): StoredEventLogItem | null {
  if (!item || typeof item !== "object" || !("title" in item)) return null;

  const record = item as Record<string, unknown>;
  const title = String(record.title ?? "").trim().slice(0, 80);
  if (!title) return null;

  const tags = Array.isArray(record.tags)
    ? record.tags
        .map((tag) => String(tag).trim().slice(0, 24))
        .filter(Boolean)
        .slice(0, 5)
    : [];

  return {
    id: typeof record.id === "string" ? record.id : `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    detail: String(record.detail ?? "").trim().slice(0, 160),
    sceneTime: typeof record.sceneTime === "string" ? record.sceneTime.slice(0, 40) : undefined,
    turn: typeof record.turn === "number" && Number.isFinite(record.turn) ? record.turn : undefined,
    tags,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
  };
}

function normalizeEventLogItems(items: unknown): StoredEventLogItem[] {
  if (!Array.isArray(items)) return [];

  return items
    .map(normalizeEventLogItem)
    .filter((item): item is StoredEventLogItem => item !== null)
    .slice(0, 60);
}

function normalizeDifficulty(value: unknown): StoredSessionSave["difficultyMode"] {
  return value === "story" || value === "observed" ? value : "traveler";
}

function normalizeModelProfile(value: unknown): StoredSessionSave["modelProfile"] {
  return value === "fast" || value === "deep" ? value : "default";
}

function normalizeLanguage(value: unknown): StoredSessionSave["language"] {
  return value === "en" ? "en" : "ko";
}

function normalizeGameResponse(value: unknown): GameResponse | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const narrative = typeof record.narrative === "string" ? record.narrative : "";
  const raw = typeof record.raw === "string" ? record.raw : narrative;
  if (!narrative && !raw) return null;

  const choices = Array.isArray(record.choices)
    ? record.choices
        .map((choice) => {
          if (!choice || typeof choice !== "object") return null;
          const text = String((choice as Record<string, unknown>).text ?? "").trim();
          return text ? { text } : null;
        })
        .filter((choice): choice is { text: string } => choice !== null)
        .slice(0, 6)
    : [];

  const response: GameResponse = {
    narrative: narrative || raw,
    raw,
    choices,
    allow_freeform: record.allow_freeform !== false,
  };

  if (record.briefing && typeof record.briefing === "object") {
    response.briefing = record.briefing as GameResponse["briefing"];
  }
  if (Array.isArray(record.memory_updates)) {
    response.memory_updates = record.memory_updates
      .map((item) => String(item).trim().slice(0, 100))
      .filter(Boolean)
      .slice(0, 3);
  }
  if (typeof record.truncated === "boolean") response.truncated = record.truncated;
  if (typeof record.continuation === "boolean") response.continuation = record.continuation;
  if (typeof record.continuation_of === "string") response.continuation_of = record.continuation_of;

  return response;
}

function normalizeTurn(value: unknown): StoredTurn | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  if (record.role === "user") {
    const content = typeof record.content === "string" ? record.content : "";
    if (!content) return null;
    return {
      role: "user",
      content,
      apiContent: typeof record.apiContent === "string" ? record.apiContent : undefined,
      hidden: record.hidden === true,
    };
  }

  if (record.role === "assistant") {
    const response = normalizeGameResponse(record.response);
    return response ? { role: "assistant", response } : null;
  }

  return null;
}

function normalizeSessionSave(value: unknown): StoredSessionSave | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const turns = Array.isArray(record.turns)
    ? record.turns.map(normalizeTurn).filter((turn): turn is StoredTurn => turn !== null)
    : [];
  if (turns.length === 0) return null;

  return {
    version: 1,
    title: String(record.title ?? "WORLD SESSION").trim().slice(0, 80) || "WORLD SESSION",
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
    turns,
    memo: typeof record.memo === "string" ? record.memo.slice(0, 300) : "",
    memoryItems: normalizeMemoryItems(record.memoryItems, "manual"),
    eventLogItems: normalizeEventLogItems(record.eventLogItems),
    difficultyMode: normalizeDifficulty(record.difficultyMode),
    modelProfile: normalizeModelProfile(record.modelProfile),
    outputTokens: Math.min(4000, Math.max(800, Math.round(Number(record.outputTokens || 800) / 100) * 100)),
    language: normalizeLanguage(record.language),
  };
}

export async function GET(req: Request) {
  if (!hasAccessFromRequestHeaders(req.headers)) {
    return NextResponse.json({ error: "접속 비밀번호가 필요합니다." }, { status: 401 });
  }

  await ensureSessionDirs();

  const memoData = await readJson<{ text?: string }>(PLAYER_MEMO_FILE, {});
  const summaryData = await readJson<{ items?: StoredMemoryItem[] }>(SUMMARY_MEMORY_FILE, { items: [] });
  const autoData = await readJson<{ items?: StoredMemoryItem[] }>(AUTO_MEMORY_FILE, { items: [] });
  const eventLogData = await readJson<{ items?: StoredEventLogItem[] }>(EVENT_LOG_FILE, { items: [] });
  const sessionData = await readJson<{ sessionSave?: StoredSessionSave | null }>(CURRENT_SESSION_FILE, { sessionSave: null });

  return NextResponse.json({
    memo: typeof memoData.text === "string" ? memoData.text.slice(0, 300) : "",
    memoryItems: [
      ...normalizeMemoryItems(summaryData.items, "manual"),
      ...normalizeMemoryItems(autoData.items, "auto"),
    ],
    eventLogItems: normalizeEventLogItems(eventLogData.items),
    sessionSave: normalizeSessionSave(sessionData.sessionSave),
    paths: {
      playerMemo: path.relative(process.cwd(), PLAYER_MEMO_FILE),
      summaryMemory: path.relative(process.cwd(), SUMMARY_MEMORY_FILE),
      autoMemory: path.relative(process.cwd(), AUTO_MEMORY_FILE),
      eventLog: path.relative(process.cwd(), EVENT_LOG_FILE),
      currentSession: path.relative(process.cwd(), CURRENT_SESSION_FILE),
    },
  });
}

export async function POST(req: Request) {
  if (!hasAccessFromRequestHeaders(req.headers)) {
    return NextResponse.json({ error: "접속 비밀번호가 필요합니다." }, { status: 401 });
  }

  await ensureSessionDirs();

  const body = await req.json().catch(() => ({}));
  const memo = typeof body.memo === "string" ? body.memo.slice(0, 300) : "";
  const memoryItems = normalizeMemoryItems(body.memoryItems, "manual");
  const eventLogItems = normalizeEventLogItems(body.eventLogItems);
  const sessionSave = normalizeSessionSave(body.sessionSave);
  const manualItems = memoryItems.filter((item) => item.source !== "auto");
  const autoItems = memoryItems.filter((item) => item.source === "auto");
  const updatedAt = new Date().toISOString();

  await Promise.all([
    fs.writeFile(
      PLAYER_MEMO_FILE,
      `${JSON.stringify({ text: memo, updatedAt }, null, 2)}\n`,
      "utf-8",
    ),
    fs.writeFile(
      SUMMARY_MEMORY_FILE,
      `${JSON.stringify({ items: manualItems, updatedAt }, null, 2)}\n`,
      "utf-8",
    ),
    fs.writeFile(
      AUTO_MEMORY_FILE,
      `${JSON.stringify({ items: autoItems, updatedAt }, null, 2)}\n`,
      "utf-8",
    ),
    fs.writeFile(
      EVENT_LOG_FILE,
      `${JSON.stringify({ items: eventLogItems, updatedAt }, null, 2)}\n`,
      "utf-8",
    ),
    fs.writeFile(
      CURRENT_SESSION_FILE,
      `${JSON.stringify({ sessionSave, updatedAt }, null, 2)}\n`,
      "utf-8",
    ),
  ]);

  return NextResponse.json({ ok: true });
}

function hasAccessFromRequestHeaders(headers = new Headers()): boolean {
  const cookie = headers.get("cookie") ?? "";
  const accessToken = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ACCESS_COOKIE}=`))
    ?.split("=")[1];

  return verifyAccessToken(accessToken);
}
