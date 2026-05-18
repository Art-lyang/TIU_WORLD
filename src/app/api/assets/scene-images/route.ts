import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SceneManifestItem = {
  file?: unknown;
  title?: unknown;
  detail?: unknown;
  keywords?: unknown;
  priority?: unknown;
};

const USER_SCENE_DIR = path.join(process.cwd(), "public", "assets", "user-scenes");
const USER_SCENE_URL = "/assets/user-scenes";
const MANIFEST_FILE = path.join(USER_SCENE_DIR, "manifest.json");
const IMAGE_EXTENSIONS = new Set([".webp", ".png", ".jpg", ".jpeg", ".gif", ".avif"]);

function stripJsonBom(raw: string): string {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

function safeFileName(value: unknown): string {
  const file = typeof value === "string" ? value.trim() : "";
  if (!file || file.includes("/") || file.includes("\\") || file.startsWith(".")) return "";
  if (!IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase())) return "";
  return file;
}

function titleFromFile(file: string): string {
  return path
    .basename(file, path.extname(file))
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function keywordsFromFile(file: string): string[] {
  return path
    .basename(file, path.extname(file))
    .split(/[-_\s.]+/g)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
    .slice(0, 16);
}

function normalizeManifestItem(item: SceneManifestItem | undefined, file: string) {
  const title = typeof item?.title === "string" && item.title.trim()
    ? item.title.trim().slice(0, 80)
    : titleFromFile(file);
  const detail = typeof item?.detail === "string" && item.detail.trim()
    ? item.detail.trim().slice(0, 120)
    : "User supplied scene image";
  const manifestKeywords = Array.isArray(item?.keywords)
    ? item.keywords
        .map((keyword) => String(keyword).trim().slice(0, 40))
        .filter(Boolean)
    : [];
  const keywords = Array.from(new Set([...manifestKeywords, ...keywordsFromFile(file), title, detail]))
    .filter((keyword) => keyword.length >= 2)
    .slice(0, 24);
  const priority = Math.max(0, Math.min(999, Math.round(Number(item?.priority) || 0)));

  return {
    src: `${USER_SCENE_URL}/${encodeURIComponent(file)}`,
    file,
    title,
    detail,
    keywords,
    priority,
  };
}

async function readManifest(): Promise<Map<string, SceneManifestItem>> {
  try {
    const raw = await fs.readFile(MANIFEST_FILE, "utf-8");
    const parsed = JSON.parse(stripJsonBom(raw)) as { items?: SceneManifestItem[] };
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return new Map(
      items
        .map((item) => [safeFileName(item.file), item] as const)
        .filter(([file]) => Boolean(file)),
    );
  } catch {
    return new Map();
  }
}

async function readImageFiles(): Promise<string[]> {
  try {
    const entries = await fs.readdir(USER_SCENE_DIR, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => safeFileName(entry.name))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export async function GET() {
  const [manifest, files] = await Promise.all([readManifest(), readImageFiles()]);
  const manifestFiles = Array.from(manifest.keys());
  const allFiles = Array.from(new Set([...manifestFiles, ...files]));
  const items = allFiles
    .map((file) => normalizeManifestItem(manifest.get(file), file))
    .filter((item) => files.includes(item.file))
    .sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title));

  return NextResponse.json(
    {
      folder: "public/assets/user-scenes",
      urlBase: USER_SCENE_URL,
      count: items.length,
      items,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
