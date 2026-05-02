import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/access";

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

const SESSION_DIR = path.join(process.cwd(), "world", "session");
const PLAYER_MEMO_DIR = path.join(SESSION_DIR, "player-memo");
const SUMMARY_MEMORY_DIR = path.join(SESSION_DIR, "summary-memory");
const AUTO_MEMORY_DIR = path.join(SESSION_DIR, "auto-memory");
const EVENT_LOG_DIR = path.join(SESSION_DIR, "event-log");

const PLAYER_MEMO_FILE = path.join(PLAYER_MEMO_DIR, "player-memo.json");
const SUMMARY_MEMORY_FILE = path.join(SUMMARY_MEMORY_DIR, "summary-memory.json");
const AUTO_MEMORY_FILE = path.join(AUTO_MEMORY_DIR, "auto-memory.json");
const EVENT_LOG_FILE = path.join(EVENT_LOG_DIR, "event-log.json");

async function ensureSessionDirs() {
  await Promise.all([
    fs.mkdir(PLAYER_MEMO_DIR, { recursive: true }),
    fs.mkdir(SUMMARY_MEMORY_DIR, { recursive: true }),
    fs.mkdir(AUTO_MEMORY_DIR, { recursive: true }),
    fs.mkdir(EVENT_LOG_DIR, { recursive: true }),
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

export async function GET(req: Request) {
  if (!hasAccessFromRequestHeaders(req.headers)) {
    return NextResponse.json({ error: "접속 비밀번호가 필요합니다." }, { status: 401 });
  }

  await ensureSessionDirs();

  const memoData = await readJson<{ text?: string }>(PLAYER_MEMO_FILE, {});
  const summaryData = await readJson<{ items?: StoredMemoryItem[] }>(SUMMARY_MEMORY_FILE, { items: [] });
  const autoData = await readJson<{ items?: StoredMemoryItem[] }>(AUTO_MEMORY_FILE, { items: [] });
  const eventLogData = await readJson<{ items?: StoredEventLogItem[] }>(EVENT_LOG_FILE, { items: [] });

  return NextResponse.json({
    memo: typeof memoData.text === "string" ? memoData.text.slice(0, 300) : "",
    memoryItems: [
      ...normalizeMemoryItems(summaryData.items, "manual"),
      ...normalizeMemoryItems(autoData.items, "auto"),
    ],
    eventLogItems: normalizeEventLogItems(eventLogData.items),
    paths: {
      playerMemo: path.relative(process.cwd(), PLAYER_MEMO_FILE),
      summaryMemory: path.relative(process.cwd(), SUMMARY_MEMORY_FILE),
      autoMemory: path.relative(process.cwd(), AUTO_MEMORY_FILE),
      eventLog: path.relative(process.cwd(), EVENT_LOG_FILE),
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
