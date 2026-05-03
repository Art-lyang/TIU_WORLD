import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  SYSTEM_PROMPT,
  TERM_MAPPING,
  DISCLOSURE_RULES,
  STARTING_SCENARIOS,
} from "@/lib/prompts";
import { checkForbidden } from "@/lib/constants";
import { parseGameResponse } from "@/lib/parseResponse";
import type { ChatMessage, GameResponse } from "@/types/game";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/access";

export const runtime = "nodejs";

const apiKey = process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY;
const defaultModel = process.env.OPENAI_MODEL ?? "gpt-5";
const fastModel = process.env.OPENAI_FAST_MODEL;
const deepModel = process.env.OPENAI_DEEP_MODEL;
const client = apiKey ? new OpenAI({ apiKey }) : null;
const DEFAULT_OUTPUT_TOKENS = 800;
const MIN_OUTPUT_TOKENS = 800;
const MAX_OUTPUT_TOKENS = 4000;
type DifficultyMode = "story" | "traveler" | "observed";
type ModelProfile = "default" | "fast" | "deep";
type ResponseLanguage = "ko" | "en";

function normalizeOutputTokens(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_OUTPUT_TOKENS;

  const stepped = Math.round(numeric / 100) * 100;
  return Math.min(MAX_OUTPUT_TOKENS, Math.max(MIN_OUTPUT_TOKENS, stepped));
}

function normalizeDifficulty(value: unknown): DifficultyMode {
  if (value === "story" || value === "observed") return value;
  return "traveler";
}

function normalizeModelProfile(value: unknown): ModelProfile {
  if (value === "fast" || value === "deep") return value;
  return "default";
}

function normalizeLanguage(value: unknown): ResponseLanguage {
  return value === "en" ? "en" : "ko";
}

function selectModel(profile: ModelProfile): string {
  if (profile === "fast" && fastModel) return fastModel;
  if (profile === "deep" && deepModel) return deepModel;
  return defaultModel;
}

function supportsReasoningConfig(model: string): boolean {
  const normalized = model.toLowerCase();
  return normalized.startsWith("gpt-5") || /^o\d/.test(normalized) || normalized.startsWith("o-");
}

function extractOpenAIText(response: unknown): string {
  if (!response || typeof response !== "object") return "";

  const direct = (response as { output_text?: unknown }).output_text;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";

  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;

    const outputItem = item as {
      content?: unknown;
      refusal?: unknown;
      text?: unknown;
    };

    if (typeof outputItem.text === "string") parts.push(outputItem.text);
    if (typeof outputItem.refusal === "string") parts.push(outputItem.refusal);

    if (!Array.isArray(outputItem.content)) continue;
    for (const content of outputItem.content) {
      if (!content || typeof content !== "object") continue;

      const part = content as { refusal?: unknown; text?: unknown };
      if (typeof part.text === "string") parts.push(part.text);
      if (typeof part.refusal === "string") parts.push(part.refusal);
    }
  }

  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function getEmptyResponseMessage(response: unknown, language: ResponseLanguage): string {
  const details: string[] = [];

  if (response && typeof response === "object") {
    const status = (response as { status?: unknown }).status;
    if (typeof status === "string" && status) details.push(`status: ${status}`);

    const incomplete = (response as { incomplete_details?: unknown }).incomplete_details;
    if (incomplete && typeof incomplete === "object") {
      const reason = (incomplete as { reason?: unknown }).reason;
      if (typeof reason === "string" && reason) details.push(`reason: ${reason}`);
    }

    const error = (response as { error?: unknown }).error;
    if (error && typeof error === "object") {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string" && message) details.push(`error: ${message}`);
    }
  }

  const suffix = details.length > 0 ? ` (${details.join(", ")})` : "";
  return language === "en"
    ? `OpenAI returned no visible text${suffix}. Try a larger response length or check the model setting.`
    : `OpenAI 응답에 표시 가능한 텍스트가 없습니다${suffix}. 응답 길이를 조금 늘리거나 모델 설정을 확인해 주세요.`;
}

const DIFFICULTY_INSTRUCTIONS: Record<DifficultyMode, string> = {
  story: `Difficulty Mode: 스토리 모드
- Prioritize world exploration, atmosphere, clues, and forward motion.
- Most reasonable player actions should succeed or partially succeed with helpful leads.
- Keep danger as tension and texture, not as harsh failure. Avoid sudden death, hard locks, or severe punishment.
- When the player is unsure, choices should gently point toward solvable next steps.
- Preserve canon secrecy, but provide alternative public clues rather than blocking progress.`,
  traveler: `Difficulty Mode: 여행자 모드
- Use the current balanced play style.
- Adapt to the player's demonstrated play tendency: cautious play earns cleaner information; reckless play creates pressure but remains fair.
- Let successes, partial successes, costs, and complications arise naturally from the scene.
- Keep choices meaningful without making the session feel punitive.`,
  observed: `Difficulty Mode: 관측되고 있음
- Increase difficulty through ambiguity, delayed consequences, resource pressure, faction attention, and imperfect records.
- Reasonable actions may still succeed, but often with costs, missing context, or new complications.
- Make player choices matter more; careless actions can raise Observer Attention, Faction Heat, Boundary instability, or access restrictions.
- Do not be arbitrary, unwinnable, or hostile. Always leave at least one playable path forward.
- Keep horror investigative: pressure, surveillance, contradiction, and records that no longer agree.`,
};

const LANGUAGE_INSTRUCTIONS: Record<ResponseLanguage, string> = {
  ko: `Language Mode: Korean
- Write all visible player-facing narrative, choices, memory updates, and state summaries in Korean.
- Keep [Scene], [Action Read], [World Response], [State], [Memory], and [Choices] section headers exactly as bracket labels when used.
- Preserve TIU proper nouns such as ORACLE, OBSERVER, KR-INIT-001, TS-Ω, and L3.`,
  en: `Language Mode: English
- Write all visible player-facing narrative, choices, memory updates, and state summaries in natural English.
- Keep [Scene], [Action Read], [World Response], [State], [Memory], and [Choices] section headers exactly as bracket labels when used.
- Preserve TIU proper nouns such as ORACLE, OBSERVER, KR-INIT-001, TS-Ω, and L3.
- If the first player message is an initial character description, begin a grounded first scene immediately. If age, items, or funds are missing, assign temporary world-appropriate defaults and say so briefly in English.
- Do not switch back to Korean unless the player explicitly asks to use Korean while EN mode is active.`,
};

const INSTRUCTIONS = [
  SYSTEM_PROMPT,
  TERM_MAPPING,
  DISCLOSURE_RULES,
  STARTING_SCENARIOS,
].join("\n\n---\n\n");

const MEMORY_CAPTURE_RULE = `Memory Capture Rule:
When a new durable fact becomes important for continuity, include an optional [Memory] section immediately before [Choices].
Use 0-3 bullet lines, each under 100 characters in the active language.
Capture only important facts: character identity, confirmed clues, promises, relationships, named locations, faction reactions, inventory or money changes, unresolved contradictions, or recurring phrases.
Do not ask the player whether to remember it. Do not mention memory capture in the visible story.
If nothing important changed, omit [Memory].
Keep [Choices] as the final section.`;

const STARTER_ROUTE_HINTS = [
  {
    pattern: /한국\s*방벽|민간\s*조사\s*보조원|KR_BARRIER_CIVIL_ASSISTANT/i,
    label: "한국 방벽 내부 민간 조사 보조원",
  },
  {
    pattern: /KR-?INIT-?001|잔여\s*문서|기록\s*관리자|KR_INIT_001_RECORDS/i,
    label: "KR-INIT-001 잔여 문서 기록 관리자",
  },
  {
    pattern: /L3|현장\s*파견|계약\s*분석관|L3_FIELD_ANALYST/i,
    label: "L3 현장 파견 계약 분석관",
  },
] as const;

function detectStarterRoute(input: string): string | null {
  const numericRoute = input.trim().match(/^([1-4])(?:[.)])?$/)?.[1];
  if (numericRoute === "1") return "한국 방벽 내부 민간 조사 보조원";
  if (numericRoute === "2") return "KR-INIT-001 잔여 문서 기록 관리자";
  if (numericRoute === "3") return "L3 현장 파견 계약 분석관";

  const route = STARTER_ROUTE_HINTS.find((hint) => hint.pattern.test(input));
  return route?.label ?? null;
}

function getCharacterName(input: string): string {
  const englishNameMatch = input.match(/(?:Name\s*[:：]\s*)([A-Za-z][A-Za-z0-9_-]{1,24})/i);
  if (englishNameMatch) return englishNameMatch[1];
  const nameMatch = input.match(/(?:이름\s*[:：]\s*)?([가-힣A-Za-z0-9_-]{2,12})/);
  return nameMatch?.[1] ?? "당신";
}

function completeCharacterInput(input: string): { character: string; note: string } {
  const parts = [input.trim()];
  const added: string[] = [];

  if (!/(?:나이|연령|세)\s*[:：]?\s*\d+|\d+\s*세/.test(input)) {
    parts.push("나이: 29");
    added.push("나이 29세");
  }
  if (!/직업|소속/.test(input)) {
    parts.push("직업(소속): 민간 조사 협력자");
    added.push("직업/소속");
  }
  if (!/소지품|장비/.test(input)) {
    parts.push("소지품: 휴대폰, 신분증, 작은 손전등");
    added.push("소지품");
  }
  if (!/소지금|현금|돈|자금|원|만원/.test(input)) {
    parts.push("소지금: 50,000원");
    added.push("소지금 50,000원");
  }

  return {
    character: parts.join(" / "),
    note: added.length > 0
      ? `\n\n※ 캐릭터 입력에서 ${added.join(", ")} 정보가 비어 있어 임시 기본값으로 보정했습니다. 원하면 이후 행동으로 수정할 수 있습니다.`
      : "",
  };
}

const STATE_LABELS: Record<string, string> = {
  "Disclosure Level": "공개 등급",
  "Boundary Stability": "경계 안정도",
  "Faction Heat": "집단 압력",
  "Observer Attention": "관측자 주의",
  "Visible Classification": "표면 분류",
  "Infection Exposure": "감염 노출",
  "Canon Drift": "정전 드리프트",
  "Safety Risk": "안전 위험",
};

function getFirstUserText(messages: ChatMessage[]): string {
  return messages.find((message) => message.role === "user")?.content ?? "";
}

function extractInventory(messages: ChatMessage[], language: ResponseLanguage): string[] {
  const joined = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join(" / ");
  const match = joined.match(/(?:소지품|장비|items?|equipment)\s*[:：]\s*([^/\n]+)/i);
  if (!match) return [language === "en" ? "Unknown" : "미확인"];
  return match[1]
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function extractMoney(messages: ChatMessage[], text: string, language: ResponseLanguage): string {
  const source = `${messages.map((message) => message.content).join("\n")}\n${text}`;
  const explicit = source.match(/(?:소지금|현금|돈|자금|funds?|cash|money)\s*[:：]?\s*([0-9,]+)\s*(원|만원|달러|크레딧|credits?|krw|usd|₩|\$)?/i);
  if (explicit) {
    const fallbackUnit = language === "en" ? "KRW" : "원";
    return `${explicit[1]}${explicit[2] ? ` ${explicit[2]}` : ` ${fallbackUnit}`}`.trim();
  }

  const won = source.match(/([0-9,]+)\s*(원|만원)/);
  if (won) return `${won[1]} ${won[2]}`;

  const credit = source.match(/([0-9,]+)\s*(크레딧|credits?)/i);
  if (credit) return `${credit[1]} ${credit[2]}`;

  return language === "en" ? "Unknown" : "미확인";
}

function extractSceneSummary(text: string, language: ResponseLanguage): string {
  const scene = text.match(/\[Scene\]([\s\S]*?)(?:\n\[[^\]]+\]|$)/)?.[1] ?? text;
  const line = scene
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find(Boolean);
  return line ? line.slice(0, 80) : language === "en" ? "In progress" : "진행 중";
}

function extractStateRows(text: string): string[] {
  const state = text.match(/\[State\]([\s\S]*?)(?:\n\[Choices\]|\n\[[^\]]+\]|$)/)?.[1];
  if (!state) return [];

  return state
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/Internal|PRIVATE|hidden|oracle_classification/i.test(line))
    .map((line) => {
      const [rawLabel, ...rest] = line.split(":");
      if (!rawLabel || rest.length === 0) return null;
      const label = STATE_LABELS[rawLabel.trim()] ?? rawLabel.trim();
      const value = rest.join(":").trim();
      if (!value) return null;
      return `${label}: ${value}`;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .slice(0, 6);
}

function extractTime(text: string, language: ResponseLanguage): string {
  if (/새벽\s*2시\s*17분/.test(text)) return "2032년 1월 1일 02:17 AM";
  if (/오전\s*7시\s*40분/.test(text)) return "2032년 1월 1일 07:40 AM";
  if (/내일\s*오전/.test(text)) return "2032년 1월 2일 오전";
  if (/내일\s*오후/.test(text)) return "2032년 1월 2일 오후";
  if (/2:17|02:17/.test(text)) return "January 1, 2032 02:17 AM";
  if (/7:40|07:40/.test(text)) return "January 1, 2032 07:40 AM";
  if (language === "en") return "January 1, 2032 00:00 AM";
  return "2032년 1월 1일 00:00 AM";
}

function extractStatus(text: string, language: ResponseLanguage): string {
  if (/출혈|피가|피를|bleeding|blood/i.test(text)) return language === "en" ? "Bleeding" : "출혈";
  if (/부상|다쳤|통증|골절|injur|wound|pain|fracture/i.test(text)) return language === "en" ? "Injured" : "부상";
  if (/감염|잠복|노출|infect|exposure|exposed/i.test(text)) return language === "en" ? "Caution" : "주의";
  return language === "en" ? "Good" : "양호";
}

function extractEmotion(text: string, language: ResponseLanguage): string {
  if (/분노|화가|격분|적대|anger|angry|hostile/i.test(text)) return language === "en" ? "Anger" : "분노";
  if (/슬픔|상실|눈물|애도|sad|grief|mourning|loss/i.test(text)) return language === "en" ? "Sorrow" : "슬픔";
  if (/공포|무섭|두려|겁|fear|afraid|terrified/i.test(text)) return language === "en" ? "Fear" : "공포";
  if (/불안|긴장|흔들림|위험|격리|신고|제보|불일치|uneasy|tension|risk|quarantine|report|contradiction/i.test(text)) {
    return language === "en" ? "Tension" : "긴장";
  }
  if (/안정|평온|조용|calm|quiet|stable/i.test(text)) return language === "en" ? "Calm" : "평온";
  return language === "en" ? "Focused" : "집중";
}

function extractGroups(text: string, messages: ChatMessage[], language: ResponseLanguage): string[] {
  const source = `${getFirstUserText(messages)}\n${text}`;
  const groups: string[] = [];

  if (/마이더스손|midas/i.test(source)) groups.push(language === "en" ? "Midas-Hand: Investigation Target" : "마이더스손: 조사 대상");
  if (/방벽|생활구|barrier|living zone/i.test(source)) groups.push(language === "en" ? "Inside the Barrier: Active Incident Zone" : "방벽 내부: 현재 사건 권역");
  if (/KR-?INIT-?001/i.test(source)) groups.push(language === "en" ? "KR-INIT-001: Contradictory Record" : "KR-INIT-001: 불일치 기록");
  if (/L3/.test(source)) groups.push(language === "en" ? "L3: Field Dispatch Zone" : "L3: 현장 파견 권역");
  if (/소바리|Sovari/i.test(source)) groups.push(language === "en" ? "Sovari: Peripheral Investigation Zone" : "소바리: 주변부 조사 권역");

  return Array.from(new Set(groups)).slice(0, 6);
}

function extractPeople(text: string, messages: ChatMessage[], language: ResponseLanguage): NonNullable<GameResponse["briefing"]>["people"] {
  const source = `${getFirstUserText(messages)}\n${text}`;
  const people: NonNullable<GameResponse["briefing"]>["people"] = [];
  const characterName = getCharacterName(getFirstUserText(messages));

  if (characterName !== "당신") {
    people.push({
      name: characterName,
      emotion: language === "en" ? "Calm" : "평온",
      detail: language === "en" ? "Player character" : "플레이어 캐릭터",
    });
  }
  if (/제보자|신고자|caller|informant|reporter/i.test(source)) {
    const isReporter = /신고자|caller|reporter/i.test(source);
    people.push({
      name: language === "en" ? (isReporter ? "Caller" : "Informant") : (isReporter ? "신고자" : "제보자"),
      emotion: language === "en" ? "Uneasy" : "불안",
      detail: language === "en" ? "Contact possible / reliability unknown" : "접촉 가능 / 신뢰도 미확인",
    });
  }

  return people.slice(0, 6);
}

function stripSystemLog(text: string): string {
  return text
    .replace(/^\s*\[Scene\]\s*/i, "")
    .replace(/\n?\[Memory\][\s\S]*?(?=\n\[Choices\]|\n\[[^\]]+\]|$)/gi, "")
    .replace(/\n?\[State\][\s\S]*?(?=\n\[Choices\]|\n\[[^\]]+\]|$)/g, "")
    .trim();
}

function normalizeMemoryUpdate(text: string): string {
  return text
    .replace(/^\s*(?:\d+\s*[.)\-:]|[-•*])\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function inferMemoryUpdates(response: Pick<GameResponse, "raw" | "narrative">, messages: ChatMessage[]): string[] {
  const text = `${getFirstUserText(messages)}\n${response.raw || response.narrative}`;
  const updates: string[] = [];
  const firstUser = getFirstUserText(messages);

  if (/이름\s*[:：]/.test(firstUser) || /직업\s*\(/.test(firstUser)) {
    updates.push(firstUser.replace(/\s+/g, " ").slice(0, 100));
  }
  if (/제12생활구\s*702호|702호/.test(text)) {
    updates.push("제12생활구 702호에는 아이가 없는데 아이 목소리가 같은 문장을 반복한다.");
  }
  if (/아이가 없습니다|아이가 없/.test(text)) {
    updates.push("반복되는 핵심 문장: 그 집에는 아이가 없습니다.");
  }
  if (/KR-?INIT-?001/i.test(text)) {
    updates.push("KR-INIT-001은 복원 상태와 열람 등급이 불일치하는 잔여 문서다.");
  }
  if (/세 번째 표지판/.test(text)) {
    updates.push("L3 교육 자료 17쪽에 '세 번째 표지판을 보면 돌아오지 마라'가 적혀 있다.");
  }
  if (/우리는 아직 출발하지 않았다/.test(text)) {
    updates.push("소바리 조사팀의 마지막 무전은 내일 오후 시각으로 기록되어 있다.");
  }

  return Array.from(new Set(updates.map(normalizeMemoryUpdate).filter(Boolean))).slice(0, 3);
}

function stripActionEnding(text: string): string {
  return text
    .replace(/[.。!?！？]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function actionAsQuestion(text: string): string {
  const clean = stripActionEnding(text);
  const replacements: Array<[RegExp, string]> = [
    [/전화한다$/, "전화해볼까?"],
    [/연락한다$/, "연락해볼까?"],
    [/조회한다$/, "조회해볼까?"],
    [/확인한다$/, "확인해볼까?"],
    [/분석한다$/, "분석해볼까?"],
    [/대조한다$/, "대조해볼까?"],
    [/클릭한다$/, "클릭해볼까?"],
    [/묻는다$/, "물어볼까?"],
    [/넣는다$/, "넣어볼까?"],
    [/남긴다$/, "남겨둘까?"],
    [/메모해 둔다$/, "메모해 둘까?"],
    [/한다$/, "해볼까?"],
  ];

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(clean)) return clean.replace(pattern, replacement);
  }

  return `${clean} 쪽으로 움직여볼까?`;
}

function actionAsMaybe(text: string): string {
  const clean = stripActionEnding(text);
  const replacements: Array<[RegExp, string]> = [
    [/전화한다$/, "전화해보는 게 나을지도"],
    [/연락한다$/, "연락해보는 게 나을지도"],
    [/조회한다$/, "조회해보는 게 나을지도"],
    [/확인한다$/, "확인해보는 게 나을지도"],
    [/분석한다$/, "분석해보는 게 나을지도"],
    [/대조한다$/, "대조해보는 게 나을지도"],
    [/클릭한다$/, "클릭해보는 게 나을지도"],
    [/묻는다$/, "물어보는 게 나을지도"],
    [/넣는다$/, "넣어보는 게 나을지도"],
    [/남긴다$/, "남겨두는 게 나을지도"],
    [/메모해 둔다$/, "메모해 두는 게 나을지도"],
    [/한다$/, "해보는 게 나을지도"],
  ];

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(clean)) return clean.replace(pattern, replacement);
  }

  return `${clean} 쪽이 나을지도`;
}

function thoughtFragment(text: string, mode: "question" | "maybe"): string {
  const clean = stripActionEnding(text);
  if (!clean) return "";
  return mode === "question" ? actionAsQuestion(clean) : actionAsMaybe(clean);
}

function extractGoals(response: Pick<GameResponse, "choices" | "narrative" | "raw">, language: ResponseLanguage): string[] {
  const choiceGoals = response.choices
    .map((choice) => choice.text.replace(/[.。]$/, "").trim())
    .filter(Boolean)
    .slice(0, 3);

  if (language === "en") {
    if (choiceGoals.length >= 2) {
      return [`Should I ${choiceGoals[0].charAt(0).toLowerCase()}${choiceGoals[0].slice(1)}? No, maybe ${choiceGoals[1].charAt(0).toLowerCase()}${choiceGoals[1].slice(1)} first...`];
    }

    if (choiceGoals.length === 1) {
      return [`Maybe ${choiceGoals[0].charAt(0).toLowerCase()}${choiceGoals[0].slice(1)} is the closest path right now.`];
    }

    if (/report|caller|informant|tip/i.test(response.raw + response.narrative)) {
      return ["Should I reach the caller first? No, maybe checking the local records would be smarter..."];
    }
    return ["I need to read the scene a little longer. Moving too fast might make me miss something..."];
  }

  if (choiceGoals.length >= 2) {
    return [
      `${thoughtFragment(choiceGoals[0], "question")} 아니, ${thoughtFragment(choiceGoals[1], "maybe")}...`,
    ];
  }

  if (choiceGoals.length === 1) {
    return [`${thoughtFragment(choiceGoals[0], "question")} 지금은 그게 제일 가까운 길 같아.`];
  }

  if (/제보|신고/.test(response.raw + response.narrative)) {
    return ["제보자에게 바로 닿아볼까? 아니, 현장 기록부터 대조하는 게 나을지도..."];
  }
  return ["일단 주변을 더 읽어야 해. 성급하게 움직이면 놓치는 게 생길지도 몰라..."];
}

function buildBriefing(response: Pick<GameResponse, "raw" | "narrative" | "choices">, messages: ChatMessage[], language: ResponseLanguage): GameResponse["briefing"] {
  const text = response.raw || response.narrative;

  return {
    time: extractTime(text, language),
    status: extractStatus(text, language),
    emotion: extractEmotion(text, language),
    goals: extractGoals(response, language),
    groups: extractGroups(text, messages, language),
    people: extractPeople(text, messages, language),
    money: extractMoney(messages, text, language),
    inventory: extractInventory(messages, language),
    logs: [
      `${language === "en" ? "Current scene" : "현재 장면"}: ${extractSceneSummary(text, language)}`,
      ...extractStateRows(text),
    ].slice(0, 8),
  };
}

function withBriefing(response: GameResponse, messages: ChatMessage[], language: ResponseLanguage = "ko"): GameResponse {
  const memory_updates = Array.from(
    new Set([
      ...(response.memory_updates ?? []),
      ...inferMemoryUpdates(response, messages),
    ].map(normalizeMemoryUpdate).filter(Boolean)),
  ).slice(0, 3);

  return {
    ...response,
    narrative: stripSystemLog(response.narrative),
    briefing: buildBriefing(response, messages, language),
    memory_updates,
  };
}

function buildCustomCharacterOpening(input: string): GameResponse {
  const completed = completeCharacterInput(input);
  const character = completed.character;
  const name = getCharacterName(character);
  const briefingMessages: ChatMessage[] = [{ role: "user", content: character }];

  if (/기자|취재|괴담|과탐|조사|탐사|마이더스/i.test(character)) {
    const narrative = `[Scene]
${name}. 당신의 취재 노트 첫 장에는 이렇게 적혀 있습니다.

${character}
${completed.note}

마이더스손 관련 괴담을 추적하던 중, 익명 제보 하나가 새벽 2시 17분에 도착했습니다.

"방벽 내부 제12생활구 702호.
그 집에는 아이가 없는데, 아이 목소리가 같은 문장을 반복합니다.
저는 방 안에 없습니다."

첨부된 음성 파일은 11초입니다. 배경에는 비 오는 소리와 낡은 환기구 진동음이 깔려 있습니다. 파일 생성 시각은 내일 오전으로 찍혀 있습니다.

[State]
Disclosure Level: PUBLIC
Boundary Stability: 안정
Faction Heat: 무관심 -> 주시`;

    const raw = `${narrative}

[Choices]
1. 제보자에게 먼저 연락한다.
2. 제12생활구 702호의 거주 기록을 확인한다.
3. 음성 파일의 생성 시각과 파형을 분석한다.
4. 마이더스손 관련 과거 제보 목록을 대조한다.`;

    return withBriefing({
      narrative,
      choices: [
        { text: "제보자에게 먼저 연락한다." },
        { text: "제12생활구 702호의 거주 기록을 확인한다." },
        { text: "음성 파일의 생성 시각과 파형을 분석한다." },
        { text: "마이더스손 관련 과거 제보 목록을 대조한다." },
      ],
      allow_freeform: true,
      raw,
    }, briefingMessages);
  }

  if (/기록|문서|색인|관리|아카이브|자료/i.test(character)) {
    const narrative = `[Scene]
${name}. 당신의 임시 권한 카드에는 아직 정식 직함이 찍히지 않았습니다.

${character}
${completed.note}

폐기 예정 색인을 검수하던 중, 존재하면 안 되는 항목 하나가 내부 검색망에 다시 나타납니다.

KR-INIT-001 / 복원 상태: 부분 성공 / 열람 등급: 불일치

문서 제목 아래에는 제목이 아닌 문장이 적혀 있습니다.

"첫 대응은 실패하지 않았다. 성공했기 때문에 묻혔다."

[State]
Disclosure Level: PUBLIC -> RESTRICTED
Boundary Stability: 안정`;

    const raw = `${narrative}

[Choices]
1. 문서 제목을 클릭한다.
2. 복원 로그를 먼저 확인한다.
3. 열람 등급 불일치 사유를 조회한다.
4. 화면을 캡처한 뒤 접속을 끊는다.`;

    return withBriefing({
      narrative,
      choices: [
        { text: "문서 제목을 클릭한다." },
        { text: "복원 로그를 먼저 확인한다." },
        { text: "열람 등급 불일치 사유를 조회한다." },
        { text: "화면을 캡처한 뒤 접속을 끊는다." },
      ],
      allow_freeform: true,
      raw,
    }, briefingMessages);
  }

  const narrative = `[Scene]
${name}. 접속 기록에는 당신이 직접 적은 캐릭터 메모가 남아 있습니다.

${character}
${completed.note}

아직 소속과 사건은 확정되지 않았지만, 단말기는 당신에게 가장 낮은 공개 등급의 제보 하나를 배정합니다.

"어젯밤부터 옆집 아이가 같은 문장을 반복합니다.
그 집에는 아이가 없습니다."

제보 위치는 한국 방벽 내부 제12생활구. 기록상 해당 호수는 8년째 공실입니다.

[State]
Disclosure Level: PUBLIC
Boundary Stability: 안정`;

  const raw = `${narrative}

[Choices]
1. 제보자에게 먼저 연락한다.
2. 현장 주소와 거주 기록을 확인한다.
3. 캐릭터의 소속과 장비를 간단히 정한다.
4. 제보 문장을 메모하고 유사 기록을 검색한다.`;

  return withBriefing({
    narrative,
    choices: [
      { text: "제보자에게 먼저 연락한다." },
      { text: "현장 주소와 거주 기록을 확인한다." },
      { text: "캐릭터의 소속과 장비를 간단히 정한다." },
      { text: "제보 문장을 메모하고 유사 기록을 검색한다." },
    ],
    allow_freeform: true,
    raw,
  }, briefingMessages);
}

const STARTER_ROUTE_OPENINGS: Record<string, GameResponse> = {
  "한국 방벽 내부 민간 조사 보조원": {
    narrative: `[Scene]
비가 오는 오전 7시 40분.
방벽 내부 제12생활구 민원 접수실에는 젖은 우산 냄새와 오래된 소독약 냄새가 섞여 있습니다.

당신의 단말기에 새 신고가 올라옵니다.

"어젯밤부터 옆집 아이가 같은 문장을 반복합니다.
그 집에는 아이가 없습니다."

[State]
Disclosure Level: PUBLIC
Boundary Stability: 안정`,
    choices: [
      { text: "신고자에게 먼저 전화한다." },
      { text: "현장 동행 요청을 넣는다." },
      { text: "옆집 주소의 거주 기록을 조회한다." },
      { text: "신고 문장을 메모해 둔다." },
    ],
    allow_freeform: true,
    raw: `[Scene]
비가 오는 오전 7시 40분.
방벽 내부 제12생활구 민원 접수실에는 젖은 우산 냄새와 오래된 소독약 냄새가 섞여 있습니다.

당신의 단말기에 새 신고가 올라옵니다.

"어젯밤부터 옆집 아이가 같은 문장을 반복합니다.
그 집에는 아이가 없습니다."

[State]
Disclosure Level: PUBLIC
Boundary Stability: 안정

[Choices]
1. 신고자에게 먼저 전화한다.
2. 현장 동행 요청을 넣는다.
3. 옆집 주소의 거주 기록을 조회한다.
4. 신고 문장을 메모해 둔다.`,
  },
  "KR-INIT-001 잔여 문서 기록 관리자": {
    narrative: `[Scene]
제3기록보존실의 조명은 늘 한 박자 늦게 깜박입니다.
당신은 폐기 예정 문서 색인을 검수하던 중, 존재하면 안 되는 항목 하나를 발견합니다.

KR-INIT-001 / 복원 상태: 부분 성공 / 열람 등급: 불일치

문서 제목 아래에는 제목이 아닌 문장이 적혀 있습니다.

"첫 대응은 실패하지 않았다. 성공했기 때문에 묻혔다."

[State]
Disclosure Level: PUBLIC -> RESTRICTED
Boundary Stability: 안정`,
    choices: [
      { text: "문서 제목을 클릭한다." },
      { text: "복원 로그를 먼저 확인한다." },
      { text: "열람 등급 불일치 사유를 조회한다." },
      { text: "화면을 캡처한 뒤 접속을 끊는다." },
    ],
    allow_freeform: true,
    raw: `[Scene]
제3기록보존실의 조명은 늘 한 박자 늦게 깜박입니다.
당신은 폐기 예정 문서 색인을 검수하던 중, 존재하면 안 되는 항목 하나를 발견합니다.

KR-INIT-001 / 복원 상태: 부분 성공 / 열람 등급: 불일치

문서 제목 아래에는 제목이 아닌 문장이 적혀 있습니다.

"첫 대응은 실패하지 않았다. 성공했기 때문에 묻혔다."

[State]
Disclosure Level: PUBLIC -> RESTRICTED
Boundary Stability: 안정

[Choices]
1. 문서 제목을 클릭한다.
2. 복원 로그를 먼저 확인한다.
3. 열람 등급 불일치 사유를 조회한다.
4. 화면을 캡처한 뒤 접속을 끊는다.`,
  },
  "L3 현장 파견 계약 분석관": {
    narrative: `[Scene]
파견 전 교육실에는 창문이 없습니다.
벽면 스크린에는 L3 진입 경로가 표시되어 있지만, 지도 오른쪽 아래의 축척이 계속 바뀝니다.

강사는 아무렇지 않게 말합니다.

"현장에서 길이 다르면, 지도보다 길을 믿지 마십시오."

당신의 책상 위 교육 자료 17쪽에는 다른 사람의 필체로 한 줄이 적혀 있습니다.

"세 번째 표지판을 보면 돌아오지 마라."

[State]
Disclosure Level: RESTRICTED
Boundary Stability: 흔들림
Visible Classification: 관찰`,
    choices: [
      { text: "강사에게 17쪽의 문장을 묻는다." },
      { text: "같은 교육 자료를 받은 사람들의 책자를 확인한다." },
      { text: "L3 진입 경로의 이전 버전을 조회한다." },
      { text: "문장을 사진으로 남긴다." },
    ],
    allow_freeform: true,
    raw: `[Scene]
파견 전 교육실에는 창문이 없습니다.
벽면 스크린에는 L3 진입 경로가 표시되어 있지만, 지도 오른쪽 아래의 축척이 계속 바뀝니다.

강사는 아무렇지 않게 말합니다.

"현장에서 길이 다르면, 지도보다 길을 믿지 마십시오."

당신의 책상 위 교육 자료 17쪽에는 다른 사람의 필체로 한 줄이 적혀 있습니다.

"세 번째 표지판을 보면 돌아오지 마라."

[State]
Disclosure Level: RESTRICTED
Boundary Stability: 흔들림
Visible Classification: 관찰

[Choices]
1. 강사에게 17쪽의 문장을 묻는다.
2. 같은 교육 자료를 받은 사람들의 책자를 확인한다.
3. L3 진입 경로의 이전 버전을 조회한다.
4. 문장을 사진으로 남긴다.`,
  },
  "소바리 주변부 실종 조사팀 현지 협력자": {
    narrative: `[Scene]
소바리 외곽의 작은 무전소.
낮인데도 산 능선 위에는 별처럼 보이는 빛이 세 개 떠 있습니다.

실종된 조사팀의 마지막 무전이 다시 재생됩니다.

"우리는 아직 출발하지 않았다.
만약 우리가 도착했다고 말하면, 그건 우리가 아니다."

무전 기록의 시간은 내일 오후로 찍혀 있습니다.

[State]
Disclosure Level: PUBLIC
Boundary Stability: 안정`,
    choices: [
      { text: "마지막 무전 좌표를 지도에 표시한다." },
      { text: "조사팀 출발 기록을 확인한다." },
      { text: "현지 노인에게 산 능선의 빛에 대해 묻는다." },
      { text: "무전 원본 파일을 복사한다." },
    ],
    allow_freeform: true,
    raw: `[Scene]
소바리 외곽의 작은 무전소.
낮인데도 산 능선 위에는 별처럼 보이는 빛이 세 개 떠 있습니다.

실종된 조사팀의 마지막 무전이 다시 재생됩니다.

"우리는 아직 출발하지 않았다.
만약 우리가 도착했다고 말하면, 그건 우리가 아니다."

무전 기록의 시간은 내일 오후로 찍혀 있습니다.

[State]
Disclosure Level: PUBLIC
Boundary Stability: 안정

[Choices]
1. 마지막 무전 좌표를 지도에 표시한다.
2. 조사팀 출발 기록을 확인한다.
3. 현지 노인에게 산 능선의 빛에 대해 묻는다.
4. 무전 원본 파일을 복사한다.`,
  },
};

export async function POST(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  const accessToken = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ACCESS_COOKIE}=`))
    ?.split("=")[1];

  if (!verifyAccessToken(accessToken)) {
    return NextResponse.json({ error: "접속 비밀번호가 필요합니다." }, { status: 401 });
  }

  let body: {
    messages?: ChatMessage[];
    memo?: string;
    memory?: string;
    difficulty?: DifficultyMode;
    modelProfile?: ModelProfile;
    language?: ResponseLanguage;
    maxOutputTokens?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "메시지가 비어 있습니다" }, { status: 400 });
  }
  const memo = typeof body.memo === "string" ? body.memo.trim().slice(0, 300) : "";
  const memory = typeof body.memory === "string" ? body.memory.trim().slice(0, 4000) : "";
  const difficulty = normalizeDifficulty(body.difficulty);
  const modelProfile = normalizeModelProfile(body.modelProfile);
  const language = normalizeLanguage(body.language);
  const selectedModel = selectModel(modelProfile);
  const maxOutputTokens = normalizeOutputTokens(body.maxOutputTokens);

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const selectedRoute = lastUser ? detectStarterRoute(lastUser.content) : null;
  if (lastUser) {
    const check = checkForbidden(lastUser.content);
    if (check.rejected) {
      const reason = language === "en"
        ? "That lies outside human authority."
        : check.reason ?? "그 영역은 인간의 권능이 아닙니다.";
      return NextResponse.json({
        narrative: reason,
        choices: [
          { text: language === "en" ? "Try a different action" : "다른 행동을 시도한다" },
          { text: language === "en" ? "Look around" : "주변을 살핀다" },
          { text: language === "en" ? "Review the current situation" : "현재 상황을 정리한다" },
        ],
        allow_freeform: true,
        raw: reason,
      });
    }
  }

  if (language === "ko" && selectedRoute && messages.length <= 3) {
    const opening = STARTER_ROUTE_OPENINGS[selectedRoute];
    if (opening) return NextResponse.json(withBriefing(opening, messages));
  }

  if (language === "ko" && !selectedRoute && messages.length === 1 && lastUser) {
    return NextResponse.json(buildCustomCharacterOpening(lastUser.content));
  }

  try {
    if (!client) {
      return NextResponse.json(
        {
          error:
            language === "en"
              ? "OPENAI_API_KEY must be set in .env.local. The legacy ANTHROPIC_API_KEY name is read temporarily, but no key is available."
              : ".env.local에 OPENAI_API_KEY를 설정해야 합니다. 임시로 기존 ANTHROPIC_API_KEY 이름도 읽지만, 키가 비어 있습니다.",
        },
        { status: 500 },
      );
    }

    if (apiKey?.startsWith("sk-ant-")) {
      return NextResponse.json(
        {
          error:
            language === "en"
              ? "The current key looks like an Anthropic key. Please set an OpenAI API key as OPENAI_API_KEY=..."
              : "현재 키가 Anthropic 키 형식으로 보입니다. OpenAI API 키를 OPENAI_API_KEY=... 이름으로 넣어주세요.",
        },
        { status: 500 },
      );
    }

    const memoInstructions = memo
      ? `

---

Player Memo Context:
The player keeps these notes for themselves. Treat them as the player's remembered notebook, not as hidden canon.
When directly relevant, naturally reference that the player remembers or wrote down the memo. Do not force it into every turn.

${memo}`
      : "";
    const memoryInstructions = memory
      ? `

---

Summary Memory Context:
This is editable long-term memory written by the player. Treat it as high-priority continuity context for established clues, relationships, promises, suspicions, and character facts.
Use it naturally when relevant, and let the player notice when a current event connects to it. If it conflicts with the latest explicit player action, prefer the latest player action.

${memory}`
      : "";
    const difficultyInstructions = `

---

${DIFFICULTY_INSTRUCTIONS[difficulty]}`;
    const languageInstructions = `

---

${LANGUAGE_INSTRUCTIONS[language]}`;
    const contextInstructions = `${languageInstructions}${difficultyInstructions}${memoInstructions}${memoryInstructions}`;
    const baseInstructions = `${INSTRUCTIONS}

---

${MEMORY_CAPTURE_RULE}`;

    const responseInstructions = selectedRoute
      ? `${baseInstructions}

---

Runtime Route Selection:
The player has already selected this starting route: ${selectedRoute}.
Begin that route immediately with its first grounded scene.
Do not offer the starting route list again.
Do not ask for a character sheet, exact age, gender, or name before the first scene.
${language === "en" ? 'Assume the player character is an adult and address them as "you" until details are provided.' : 'Assume the player character is an adult and address them as "당신" until details are provided.'}
End with [Choices] as the final section.${contextInstructions}`
      : `${baseInstructions}${contextInstructions}`;

    const responseInput = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
    const responseOptions = {
      model: selectedModel,
      instructions: responseInstructions,
      max_output_tokens: maxOutputTokens,
      input: responseInput,
      ...(supportsReasoningConfig(selectedModel)
        ? { reasoning: { effort: "low" as const } }
        : {}),
    };

    let response = await client.responses.create(responseOptions);
    let text = extractOpenAIText(response);
    if (!text && maxOutputTokens < MAX_OUTPUT_TOKENS) {
      const retryOutputTokens = Math.min(MAX_OUTPUT_TOKENS, Math.max(1600, maxOutputTokens + 800));
      response = await client.responses.create({
        ...responseOptions,
        max_output_tokens: retryOutputTokens,
      });
      text = extractOpenAIText(response);
    }
    if (!text) {
      throw new Error(getEmptyResponseMessage(response, language));
    }

    const parsed = parseGameResponse(text);
    return NextResponse.json(withBriefing(parsed, messages, language));
  } catch (err) {
    const message = err instanceof Error ? err.message : language === "en" ? "Unknown error" : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
