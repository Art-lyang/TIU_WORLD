import type { GameResponse } from "@/types/game";

const FALLBACK_CHOICES = [
  { text: "주변을 더 살핀다" },
  { text: "기록을 확인한다" },
  { text: "그 자리를 떠난다" },
];

const CHOICES_HEADER_RE =
  /^\s*\**\s*\[?\s*(choices?|선택지|선택)\s*\]?\s*:?\s*\**\s*$/i;

const MEMORY_HEADER_RE =
  /^\s*\**\s*\[?\s*(memory|memories|summary memory|기억|메모리|요약 메모리)\s*\]?\s*:?\s*\**\s*$/i;

const SECTION_HEADER_RE = /^\s*\[[^\]]+\]\s*$/;

const CHOICE_LINE_RE =
  /^\s*(?:\d+\s*[.)\-:]|[A-Za-z]\s*[.)\-:]|[-•*])\s+(.+?)\s*$/;

function stripMemorySection(text: string): string {
  return text
    .replace(/\n?\s*\[?(?:Memory|Memories|Summary Memory|기억|메모리|요약 메모리)\]?\s*:?\s*\n[\s\S]*?(?=\n\s*\[?(?:Choices?|선택지|선택)\]?\s*:?\s*$|\n\[[^\]]+\]|\s*$)/gim, "")
    .trim();
}

function parseMemoryUpdates(lines: string[]): string[] {
  const headerIdx = lines.findIndex((line) => MEMORY_HEADER_RE.test(line));
  if (headerIdx === -1) return [];

  const updates: string[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    if (CHOICES_HEADER_RE.test(line) || SECTION_HEADER_RE.test(line)) break;

    const cleaned = line
      .replace(/^\s*(?:\d+\s*[.)\-:]|[-•*])\s*/, "")
      .trim();
    if (cleaned) updates.push(cleaned.slice(0, 100));
  }

  return Array.from(new Set(updates)).slice(0, 3);
}

export function parseGameResponse(text: string): GameResponse {
  const raw = text.trimEnd();

  const lines = raw.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => CHOICES_HEADER_RE.test(l));
  const memory_updates = parseMemoryUpdates(lines);

  if (headerIdx === -1) {
    return {
      narrative: stripMemorySection(raw),
      choices: FALLBACK_CHOICES,
      allow_freeform: true,
      raw,
      memory_updates,
    };
  }

  const narrative = stripMemorySection(lines.slice(0, headerIdx).join("\n"));
  const choices: { text: string }[] = [];

  for (const line of lines.slice(headerIdx + 1)) {
    if (MEMORY_HEADER_RE.test(line) || SECTION_HEADER_RE.test(line)) break;
    const m = line.match(CHOICE_LINE_RE);
    if (m) {
      const t = m[1].trim();
      if (t) choices.push({ text: t });
    }
  }

  if (choices.length === 0) {
    return {
      narrative: stripMemorySection(raw),
      choices: FALLBACK_CHOICES,
      allow_freeform: true,
      raw,
      memory_updates,
    };
  }

  return {
    narrative: narrative || stripMemorySection(raw),
    choices: choices.slice(0, 6),
    allow_freeform: true,
    raw,
    memory_updates,
  };
}
