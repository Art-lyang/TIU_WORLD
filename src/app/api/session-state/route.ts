import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/access";
import { pushCloudRecord } from "@/lib/cloudStorage";
import type { ApiUsageSnapshot, GameResponse } from "@/types/game";

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
  id: string;
  version: 1;
  title: string;
  createdAt: string;
  updatedAt: string;
  turns: StoredTurn[];
  memo: string;
  memoryItems: StoredMemoryItem[];
  eventLogItems: StoredEventLogItem[];
  mode: "official" | "custom";
  status: "in_progress" | "completed";
  visibility:
    | "private"
    | "uploaded_pending"
    | "public_user_session"
    | "featured_session"
    | "official_candidate"
    | "official_archive"
    | "rejected"
    | "removed";
  contentTier: "teen";
  difficultyMode: "story" | "traveler" | "observed";
  accountId?: string;
  accountName?: string;
  modelProfile: "default" | "fast" | "deep" | "claude";
  outputTokens: number;
  language: "ko" | "en";
};

const SESSION_DIR = path.join(process.cwd(), "world", "session");
const PLAYER_MEMO_DIR = path.join(SESSION_DIR, "player-memo");
const SUMMARY_MEMORY_DIR = path.join(SESSION_DIR, "summary-memory");
const AUTO_MEMORY_DIR = path.join(SESSION_DIR, "auto-memory");
const EVENT_LOG_DIR = path.join(SESSION_DIR, "event-log");
const CURRENT_SESSION_DIR = path.join(SESSION_DIR, "current-session");
const SAVED_SESSIONS_DIR = path.join(SESSION_DIR, "saved-sessions");
const LIBRARY_REVIEW_DIR = path.join(SESSION_DIR, "library-review");
const PERSONAL_ARCHIVE_DIR = path.join(SESSION_DIR, "personal-archive");
const API_USAGE_DIR = path.join(SESSION_DIR, "api-usage");

const PLAYER_MEMO_FILE = path.join(PLAYER_MEMO_DIR, "player-memo.json");
const SUMMARY_MEMORY_FILE = path.join(SUMMARY_MEMORY_DIR, "summary-memory.json");
const AUTO_MEMORY_FILE = path.join(AUTO_MEMORY_DIR, "auto-memory.json");
const EVENT_LOG_FILE = path.join(EVENT_LOG_DIR, "event-log.json");
const CURRENT_SESSION_FILE = path.join(CURRENT_SESSION_DIR, "current-session.json");
const SAVED_SESSIONS_FILE = path.join(SAVED_SESSIONS_DIR, "saved-sessions.json");
const REVIEW_PENDING_SESSIONS_FILE = path.join(LIBRARY_REVIEW_DIR, "review-pending-sessions.json");
const PRIVATE_ARCHIVE_FILE = path.join(PERSONAL_ARCHIVE_DIR, "private-sessions.json");
const COMPLETED_ARCHIVE_FILE = path.join(PERSONAL_ARCHIVE_DIR, "completed-sessions.json");
const ARCHIVE_INDEX_FILE = path.join(PERSONAL_ARCHIVE_DIR, "archive-index.json");
const API_USAGE_FILE = path.join(API_USAGE_DIR, "api-usage.json");
const SESSION_LIBRARY_LIMIT = 12;
const DAILY_CALL_LIMIT = readPositiveInteger("TIU_DAILY_CALL_LIMIT", 120, 1, 2000);
const DAILY_TOKEN_LIMIT = readPositiveInteger("TIU_DAILY_TOKEN_LIMIT", 900000, 10000, 10000000);
const MAX_OUTPUT_TOKENS = readPositiveInteger("TIU_MAX_OUTPUT_TOKENS", 4000, 800, 4000);
const MIN_REQUEST_INTERVAL_SECONDS = readPositiveInteger("TIU_MIN_SECONDS_BETWEEN_CALLS", 2, 0, 120);

async function ensureSessionDirs() {
  const results = await Promise.allSettled([
    fs.mkdir(PLAYER_MEMO_DIR, { recursive: true }),
    fs.mkdir(SUMMARY_MEMORY_DIR, { recursive: true }),
    fs.mkdir(AUTO_MEMORY_DIR, { recursive: true }),
    fs.mkdir(EVENT_LOG_DIR, { recursive: true }),
    fs.mkdir(CURRENT_SESSION_DIR, { recursive: true }),
    fs.mkdir(SAVED_SESSIONS_DIR, { recursive: true }),
    fs.mkdir(LIBRARY_REVIEW_DIR, { recursive: true }),
    fs.mkdir(PERSONAL_ARCHIVE_DIR, { recursive: true }),
    fs.mkdir(API_USAGE_DIR, { recursive: true }),
  ]);

  return results.every((result) => result.status === "fulfilled");
}

function readPositiveInteger(name: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function stripJsonBom(raw: string): string {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(stripJsonBom(raw)) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<boolean> {
  try {
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
    return true;
  } catch {
    return false;
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
  return value === "fast" || value === "deep" || value === "claude" ? value : "default";
}

function normalizeAccountName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, 24);
  return normalized || undefined;
}

function normalizeLanguage(value: unknown): StoredSessionSave["language"] {
  return value === "en" ? "en" : "ko";
}

function inferSessionMode(turns: StoredTurn[]): StoredSessionSave["mode"] {
  const source = turns
    .filter((turn): turn is Extract<StoredTurn, { role: "user" }> => turn.role === "user")
    .map((turn) => `${turn.apiContent ?? ""}\n${turn.content}`)
    .join("\n");

  return /START_ROUTE:|한국 방벽 내부|KR-INIT-001|남극|거대공동|Korean Barrier|Antarctic Hollow/i.test(source)
    ? "official"
    : "custom";
}

function normalizeSessionMode(value: unknown, turns: StoredTurn[]): StoredSessionSave["mode"] {
  return value === "official" || value === "custom" ? value : inferSessionMode(turns);
}

function normalizeSessionStatus(value: unknown): StoredSessionSave["status"] {
  return value === "completed" ? "completed" : "in_progress";
}

function normalizeSessionVisibility(value: unknown): StoredSessionSave["visibility"] {
  if (
    value === "uploaded_pending" ||
    value === "public_user_session" ||
    value === "featured_session" ||
    value === "official_candidate" ||
    value === "official_archive" ||
    value === "rejected" ||
    value === "removed"
  ) {
    return value;
  }

  return "private";
}

function createSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  if (record.engine && typeof record.engine === "object") {
    response.engine = record.engine as GameResponse["engine"];
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
    id: typeof record.id === "string" && record.id.trim() ? record.id.trim().slice(0, 80) : createSessionId(),
    version: 1,
    title: String(record.title ?? "WORLD SESSION").trim().slice(0, 80) || "WORLD SESSION",
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
    turns,
    memo: typeof record.memo === "string" ? record.memo.slice(0, 300) : "",
    memoryItems: normalizeMemoryItems(record.memoryItems, "manual"),
    eventLogItems: normalizeEventLogItems(record.eventLogItems),
    mode: normalizeSessionMode(record.mode, turns),
    status: normalizeSessionStatus(record.status),
    visibility: normalizeSessionVisibility(record.visibility),
    contentTier: "teen",
    accountId: typeof record.accountId === "string" ? record.accountId.trim().slice(0, 80) : undefined,
    accountName: normalizeAccountName(record.accountName),
    difficultyMode: normalizeDifficulty(record.difficultyMode),
    modelProfile: normalizeModelProfile(record.modelProfile),
    outputTokens: Math.min(4000, Math.max(800, Math.round(Number(record.outputTokens || 800) / 100) * 100)),
    language: normalizeLanguage(record.language),
  };
}

function normalizeSessionLibrary(items: unknown): StoredSessionSave[] {
  if (!Array.isArray(items)) return [];

  const seen = new Set<string>();
  return items
    .map(normalizeSessionSave)
    .filter((item): item is StoredSessionSave => item !== null)
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, SESSION_LIBRARY_LIMIT);
}

function filterReviewPendingSessions(items: StoredSessionSave[]): StoredSessionSave[] {
  return items.filter((item) => item.visibility === "uploaded_pending");
}

function filterPrivateArchiveSessions(items: StoredSessionSave[]): StoredSessionSave[] {
  return items.filter((item) => item.visibility === "private");
}

function filterCompletedArchiveSessions(items: StoredSessionSave[]): StoredSessionSave[] {
  return items.filter((item) => item.status === "completed");
}

function buildArchiveIndex(sessionLibrary: StoredSessionSave[], updatedAt: string) {
  const reviewPending = filterReviewPendingSessions(sessionLibrary);
  const privateArchive = filterPrivateArchiveSessions(sessionLibrary);
  const completedArchive = filterCompletedArchiveSessions(sessionLibrary);

  return {
    updatedAt,
    counts: {
      total: sessionLibrary.length,
      reviewPending: reviewPending.length,
      private: privateArchive.length,
      completed: completedArchive.length,
    },
    files: {
      savedSessions: path.relative(process.cwd(), SAVED_SESSIONS_FILE),
      reviewPending: path.relative(process.cwd(), REVIEW_PENDING_SESSIONS_FILE),
      privateArchive: path.relative(process.cwd(), PRIVATE_ARCHIVE_FILE),
      completedArchive: path.relative(process.cwd(), COMPLETED_ARCHIVE_FILE),
    },
  };
}

function normalizeApiUsageSnapshot(value: unknown): ApiUsageSnapshot {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  if (!value || typeof value !== "object" || (value as Record<string, unknown>).date !== today) {
    return {
      date: today,
      calls: 0,
      blocked: 0,
      dailyCallLimit: DAILY_CALL_LIMIT,
      dailyTokenLimit: DAILY_TOKEN_LIMIT,
      estimatedTokens: 0,
      actualTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      minSecondsBetweenCalls: MIN_REQUEST_INTERVAL_SECONDS,
      status: "ok",
    };
  }

  const record = value as Record<string, unknown>;
  const estimatedInputTokens = Math.max(0, Math.round(Number(record.estimatedInputTokens) || 0));
  const estimatedOutputTokens = Math.max(0, Math.round(Number(record.estimatedOutputTokens) || 0));
  const actualInputTokens = Math.max(0, Math.round(Number(record.actualInputTokens) || 0));
  const actualOutputTokens = Math.max(0, Math.round(Number(record.actualOutputTokens) || 0));
  const actualTotalTokens = Math.max(0, Math.round(Number(record.actualTotalTokens) || 0));

  return {
    date: today,
    calls: Math.max(0, Math.round(Number(record.calls) || 0)),
    blocked: Math.max(0, Math.round(Number(record.blocked) || 0)),
    dailyCallLimit: DAILY_CALL_LIMIT,
    dailyTokenLimit: DAILY_TOKEN_LIMIT,
    estimatedTokens: estimatedInputTokens + estimatedOutputTokens,
    actualTokens: actualTotalTokens,
    inputTokens: actualInputTokens || estimatedInputTokens,
    outputTokens: actualOutputTokens || estimatedOutputTokens,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    minSecondsBetweenCalls: MIN_REQUEST_INTERVAL_SECONDS,
    lastRequestAt: typeof record.lastRequestAt === "string" ? record.lastRequestAt : undefined,
    lastModel: typeof record.lastModel === "string" ? record.lastModel : undefined,
    status: "ok",
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
  const sessionLibraryData = await readJson<{ items?: StoredSessionSave[] }>(SAVED_SESSIONS_FILE, { items: [] });
  const reviewPendingData = await readJson<{ items?: StoredSessionSave[] }>(REVIEW_PENDING_SESSIONS_FILE, { items: [] });
  const privateArchiveData = await readJson<{ items?: StoredSessionSave[] }>(PRIVATE_ARCHIVE_FILE, { items: [] });
  const completedArchiveData = await readJson<{ items?: StoredSessionSave[] }>(COMPLETED_ARCHIVE_FILE, { items: [] });
  const apiUsageData = await readJson<unknown>(API_USAGE_FILE, null);
  const sessionSave = normalizeSessionSave(sessionData.sessionSave);
  const sessionLibrary = normalizeSessionLibrary([
    ...(Array.isArray(sessionLibraryData.items) ? sessionLibraryData.items : []),
    ...(Array.isArray(reviewPendingData.items) ? reviewPendingData.items : []),
    ...(Array.isArray(privateArchiveData.items) ? privateArchiveData.items : []),
    ...(Array.isArray(completedArchiveData.items) ? completedArchiveData.items : []),
  ]);

  return NextResponse.json({
    memo: typeof memoData.text === "string" ? memoData.text.slice(0, 300) : "",
    memoryItems: [
      ...normalizeMemoryItems(summaryData.items, "manual"),
      ...normalizeMemoryItems(autoData.items, "auto"),
    ],
    eventLogItems: normalizeEventLogItems(eventLogData.items),
    sessionSave,
    sessionLibrary: sessionLibrary.length > 0 ? sessionLibrary : sessionSave ? [sessionSave] : [],
    apiUsage: normalizeApiUsageSnapshot(apiUsageData),
    paths: {
      playerMemo: path.relative(process.cwd(), PLAYER_MEMO_FILE),
      summaryMemory: path.relative(process.cwd(), SUMMARY_MEMORY_FILE),
      autoMemory: path.relative(process.cwd(), AUTO_MEMORY_FILE),
      eventLog: path.relative(process.cwd(), EVENT_LOG_FILE),
      currentSession: path.relative(process.cwd(), CURRENT_SESSION_FILE),
      savedSessions: path.relative(process.cwd(), SAVED_SESSIONS_FILE),
      reviewPendingSessions: path.relative(process.cwd(), REVIEW_PENDING_SESSIONS_FILE),
      privateArchive: path.relative(process.cwd(), PRIVATE_ARCHIVE_FILE),
      completedArchive: path.relative(process.cwd(), COMPLETED_ARCHIVE_FILE),
      archiveIndex: path.relative(process.cwd(), ARCHIVE_INDEX_FILE),
      apiUsage: path.relative(process.cwd(), API_USAGE_FILE),
    },
  });
}

export async function POST(req: Request) {
  if (!hasAccessFromRequestHeaders(req.headers)) {
    return NextResponse.json({ error: "접속 비밀번호가 필요합니다." }, { status: 401 });
  }

  const directoriesReady = await ensureSessionDirs();

  const body = await req.json().catch(() => ({}));
  const memo = typeof body.memo === "string" ? body.memo.slice(0, 300) : "";
  const memoryItems = normalizeMemoryItems(body.memoryItems, "manual");
  const eventLogItems = normalizeEventLogItems(body.eventLogItems);
  const sessionSave = normalizeSessionSave(body.sessionSave);
  const sessionLibrary = normalizeSessionLibrary(body.sessionLibrary);
  const manualItems = memoryItems.filter((item) => item.source !== "auto");
  const autoItems = memoryItems.filter((item) => item.source === "auto");
  const updatedAt = new Date().toISOString();
  const reviewPendingSessions = filterReviewPendingSessions(sessionLibrary);
  const privateArchiveSessions = filterPrivateArchiveSessions(sessionLibrary);
  const completedArchiveSessions = filterCompletedArchiveSessions(sessionLibrary);
  const archiveIndex = buildArchiveIndex(sessionLibrary, updatedAt);
  const cloudPayload = {
    memo,
    memoryItems,
    eventLogItems,
    sessionSave,
    sessionLibrary,
    reviewPendingSessions,
    privateArchiveSessions,
    completedArchiveSessions,
    archiveIndex,
    updatedAt,
  };

  const writeResults = await Promise.all([
    writeJson(PLAYER_MEMO_FILE, { text: memo, updatedAt }),
    writeJson(SUMMARY_MEMORY_FILE, { items: manualItems, updatedAt }),
    writeJson(AUTO_MEMORY_FILE, { items: autoItems, updatedAt }),
    writeJson(EVENT_LOG_FILE, { items: eventLogItems, updatedAt }),
    writeJson(CURRENT_SESSION_FILE, { sessionSave, updatedAt }),
    writeJson(SAVED_SESSIONS_FILE, { items: sessionLibrary, updatedAt }),
    writeJson(REVIEW_PENDING_SESSIONS_FILE, { items: reviewPendingSessions, updatedAt }),
    writeJson(PRIVATE_ARCHIVE_FILE, { items: privateArchiveSessions, updatedAt }),
    writeJson(COMPLETED_ARCHIVE_FILE, { items: completedArchiveSessions, updatedAt }),
    writeJson(ARCHIVE_INDEX_FILE, archiveIndex),
  ]);
  const persisted = directoriesReady && writeResults.every(Boolean);
  const cloud = await pushCloudRecord({
    key: "session/state",
    value: cloudPayload,
    updatedAt,
  });

  return NextResponse.json({ ok: true, persisted, cloud });
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
