import fs from "node:fs";
import path from "node:path";
import type { ChatMessage } from "@/types/game";

type ResponseLanguage = "ko" | "en";

type WorldIndexEntry = {
  id: string;
  source: string;
  title: string;
  heading?: string;
  tier: "public" | "restricted" | "private";
  tags?: string[];
  keywords?: string[];
  excerpt: string;
};

type WorldIndexFile = {
  format: "tiu-world-index-v1";
  generatedAt: string;
  entryCount: number;
  entries: WorldIndexEntry[];
};

type CacheState = {
  filePath: string;
  mtimeMs: number;
  index: WorldIndexFile;
};

const INDEX_CANDIDATES = [
  path.join(process.cwd(), "world", "index", "world-index.local.json"),
  path.join(process.cwd(), "world", "index", "world-index.json"),
];

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "into",
  "about",
  "그리고",
  "하지만",
  "대한",
  "관련",
  "정리",
  "설정",
  "문서",
  "세계관",
  "플레이",
]);

const EVIDENCE_TERMS = [
  /복원|원본|로그|증언|좌표|샘플|권한|대조|확인|검열|해제|기록|현장|목격|보고서|색인|시간표|분석/,
  /recover|original|log|witness|coordinate|sample|access|verify|redact|record|field|report|index|timeline|analysis/i,
];
const PUBLIC_SNIPPET_LIMIT = 3;
const EVIDENCE_SNIPPET_LIMIT = 4;
const MIN_MATCH_SCORE = 6;
const MAX_WORLD_CONTEXT_CHARS = 1400;

let cache: CacheState | null = null;

function readIndexFile(): { filePath: string; index: WorldIndexFile; mtimeMs: number } | null {
  for (const filePath of INDEX_CANDIDATES) {
    try {
      const stat = fs.statSync(filePath);
      if (cache && cache.filePath === filePath && cache.mtimeMs === stat.mtimeMs) {
        return cache;
      }
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as WorldIndexFile;
      if (parsed?.format !== "tiu-world-index-v1" || !Array.isArray(parsed.entries)) continue;
      cache = { filePath, mtimeMs: stat.mtimeMs, index: parsed };
      return cache;
    } catch {
      continue;
    }
  }
  return null;
}

function tokenize(text: string): string[] {
  return Array.from(text.toLowerCase().matchAll(/[a-z0-9][a-z0-9_-]{1,}|[가-힣A-Za-z0-9Ω廓誇]{2,}/g))
    .map((match) => match[0])
    .filter((token) => !STOPWORDS.has(token))
    .filter((token) => token.length <= 32);
}

function hasEvidenceLanguage(text: string): boolean {
  let count = 0;
  for (const pattern of EVIDENCE_TERMS) {
    const matches = text.match(pattern);
    if (matches) count += 1;
  }
  return count >= 1 && /(왜|어떻게|근거|확정|맞는지|확인|대조|verify|why|how|proof|confirm)/i.test(text);
}

function scoreEntry(entry: WorldIndexEntry, queryTerms: Set<string>): number {
  if (queryTerms.size === 0) return 0;
  const title = `${entry.title} ${entry.source}`.toLowerCase();
  const keywords = (entry.keywords ?? []).map((keyword) => keyword.toLowerCase());
  const tags = (entry.tags ?? []).map((tag) => tag.toLowerCase());
  const excerpt = entry.excerpt.toLowerCase();

  let score = 0;
  for (const term of queryTerms) {
    if (title.includes(term)) score += 9;
    if (keywords.includes(term)) score += 6;
    if (tags.includes(term)) score += 5;
    if (excerpt.includes(term)) score += 2;
  }
  if (entry.tier === "public") score += 0.5;
  if (entry.tier === "restricted") score += 0.25;
  return score;
}

function buildQuery(messages: ChatMessage[], memo: string, memory: string): string {
  const firstUser = messages.find((message) => message.role === "user")?.content ?? "";
  const latest = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const recentAssistant = [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";
  return [
    firstUser,
    latest,
    recentAssistant.slice(-1200),
    memo,
    memory,
  ].join("\n").slice(-5000);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}...`;
}

export function buildWorldIndexContext(options: {
  messages: ChatMessage[];
  memo: string;
  memory: string;
  language: ResponseLanguage;
}): string {
  const loaded = readIndexFile();
  if (!loaded) return "";

  const queryText = buildQuery(options.messages, options.memo, options.memory);
  const queryTerms = new Set(tokenize(queryText));
  const allowPrivate = hasEvidenceLanguage(queryText);
  const snippetLimit = allowPrivate ? EVIDENCE_SNIPPET_LIMIT : PUBLIC_SNIPPET_LIMIT;
  const ranked = loaded.index.entries
    .filter((entry) => entry.excerpt && (entry.tier !== "private" || allowPrivate))
    .map((entry) => ({ entry, score: scoreEntry(entry, queryTerms) }))
    .filter((item) => item.score >= MIN_MATCH_SCORE)
    .sort((a, b) => b.score - a.score || a.entry.source.localeCompare(b.entry.source))
    .slice(0, snippetLimit);

  if (ranked.length === 0) return "";

  const snippets = ranked.map(({ entry, score }, index) => {
    const source = truncate(entry.source, 120);
    const title = truncate(entry.title, 96);
    const excerpt = truncate(entry.excerpt, entry.tier === "private" ? 200 : 260);
    return `${index + 1}. [${entry.tier.toUpperCase()} | score ${score.toFixed(1)}] ${title}
Source: ${source}
Excerpt: ${excerpt}`;
  }).join("\n\n").slice(0, MAX_WORLD_CONTEXT_CHARS);

  const languageLine = options.language === "en"
    ? "Use these snippets only as internal world reference. Keep visible narration in English."
    : "아래 조각은 내부 세계관 참고 자료로만 사용한다. 보이는 출력은 한국어로 유지한다.";

  return `World Index Context:
${languageLine}
- Use only the snippets relevant to the active route, latest player choice, memo, or memory.
- Do not dump lore. Convert relevant facts into scene evidence, documents, NPC knowledge, or choices.
- Obey all disclosure rules. PRIVATE snippets, if present, are not automatic permission to reveal them.
- If no snippet fits the current scene, ignore this context.

${snippets}`;
}
