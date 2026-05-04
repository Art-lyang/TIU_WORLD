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

function isOpenAIOutputTruncated(response: unknown): boolean {
  if (!response || typeof response !== "object") return false;

  const status = (response as { status?: unknown }).status;
  const incomplete = (response as { incomplete_details?: unknown }).incomplete_details;
  if (status === "incomplete" && incomplete && typeof incomplete === "object") {
    const reason = (incomplete as { reason?: unknown }).reason;
    if (reason === "max_output_tokens") return true;
  }

  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) return false;

  return output.some((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as { incomplete_details?: unknown; status?: unknown };
    if (record.status !== "incomplete") return false;
    if (!record.incomplete_details || typeof record.incomplete_details !== "object") return true;
    const reason = (record.incomplete_details as { reason?: unknown }).reason;
    return reason === "max_output_tokens";
  });
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

const OPENING_FLOW_RULE = `Opening Flow Rule:
- Any start must connect smoothly in this order: player role -> immediate place or device -> human contact or system notice -> first clue -> choices.
- A new character should not be dropped into an abstract lore explanation. Begin with what they are doing, who contacted them, and why the first clue is their problem.
- If the player creates a custom character, echo only the useful parts of the character sheet naturally. Do not dump the sheet as a block unless the player wrote it that way.
- If age, money, or items were auto-filled, mention it briefly as a session calibration note, then move into the scene.
- Introduce one practical contact when useful: editor, clerk, handler, instructor, dispatcher, guard, witness, or informant. The contact can ask a question, warn the player, or hand over a file.
- Preserve hidden canon: do not expose secret faction names, entity identities, or internal codes in the opening unless the player character would already know them. Use public-facing labels first.
- The final choices should feel like the character's next plausible actions, not generic menu commands.`;

const CONVERSATIONAL_PLAY_RULE = `Conversational Play Rule:
- The session should feel like the player is talking with people inside a scene, not clicking a dry command list.
- Before [Choices], end the visible scene with a human handoff whenever possible: an NPC question, hesitation, warning, glance, message, or system prompt that naturally invites the player's reply.
- If an NPC just spoke, give them a small emotional beat or direct question before choices. Example: "임태오가 당신 표정을 살피며 묻습니다. '어때, 무슨 말인지 이해했어?'"
- Choices should read like natural intentions, replies, or specific actions. Prefer "그럼 변경 로그부터 볼게요. 임태오에게 요청한다" over "변경 로그를 확인한다".
- Include at least one choice that is a spoken reply when a conversation partner is present.
- Avoid ending a turn on a cold fact, state dump, or clue sentence without giving the player a social or emotional way back into the scene.
- If a scene has no visible NPC, create a human-scale contact point: a caller, sender, desk clerk, field operator, archived voice note, terminal prompt, or the player's own uneasy thought.
- Every generated choice should answer the last human pressure in the scene: reply to the speaker, ask a follow-up, protect someone, challenge a claim, buy time, or act while telling someone what you are doing.
- Avoid choices that are only nouns or commands such as "기록 확인", "이동", "조사한다", "Open file", or "Continue".`;

const SESSION_CONTINUITY_RULE = `Session Continuity Rule:
- Treat the first user message, selected route, character job, player memo, and summary memory as the active session anchor.
- Do not blend unrelated starter incidents into the current session.
- Answer the player's latest action directly before introducing new complications.
- Choices must follow from the current scene, current character role, and current investigation.
- Preserve the conversational thread: if the player speaks to someone, that person should answer before the scene jumps elsewhere.
- Create or reuse 1-2 grounded NPCs when the scene needs smoother dialogue or continuity. Give them a name, role, immediate attitude, and limited knowledge.
- Reuse established NPCs, informants, editors, clerks, guards, operators, or witnesses instead of inventing a new contact every turn.
- NPCs should help frame choices through their motives, fear, confusion, pressure, or partial knowledge. They should not solve the mystery for the player.
- Avoid abrupt unrelated scene cuts. If a jump is necessary, bridge it with a record, call, message, transit beat, or witness reaction.
- The Korean Barrier child-voice complaint belongs only to the Korean Barrier civilian route unless the player explicitly connects it to another case.
- A Midas-Hand reporter or urban-legend journalist session should stay centered on Midas-Hand leads: deleted articles, suspicious contracts, informants, ownership records, money trails, cult rumors, and public-facing conspiracy evidence.
- If earlier assistant text accidentally introduced a mismatched starter incident, treat it as a misfiled queue item or corrupted feed, then return to the active character's case without making the player repair the continuity.`;

function withSessionPrelude(response: GameResponse, language: ResponseLanguage, routeName?: string | null): GameResponse {
  const isAntarctic = /남극|거대공동|L3|Antarctic|Hollow/i.test(routeName ?? response.raw ?? response.narrative);
  const prelude = language === "en"
    ? isAntarctic
      ? `[Session Entry]
January 2032. The access terminal opens only the public layer of the assignment: Antarctic hollow survey, contract review, field safety.

The classified name of the site is withheld. For now, the world gives you weather reports, changed coordinates, and one dispatch order that arrived before it was approved.`
      : `[Session Entry]
January 2032. The world does not begin by explaining itself. It gives you a role, a device or room, and one record that should not already know you.

The deeper truth remains sealed. Your first useful thread is small enough to touch: a message, a file, a witness, or a place waiting for confirmation.`
    : isAntarctic
      ? `[Session Entry]
2032년 1월. 접속 단말기는 이번 배정의 공개 층위만 엽니다. 남극 거대공동 조사, 계약 검토, 현장 안전 확인.

현장의 내부 코드명과 원인은 아직 열람되지 않습니다. 지금 당신에게 보이는 것은 기상 보고, 어긋난 좌표, 승인보다 먼저 도착한 파견 명령뿐입니다.`
      : `[Session Entry]
2032년 1월. 세계는 처음부터 정답을 설명하지 않습니다. 먼저 당신에게 역할과 장소, 그리고 당신을 이미 알고 있는 듯한 기록 하나를 건넵니다.

더 깊은 진실은 아직 잠겨 있습니다. 지금 붙잡을 수 있는 첫 실마리는 메시지, 파일, 목격자, 혹은 확인을 기다리는 장소입니다.`;

  return {
    ...response,
    narrative: `${prelude}\n\n${response.narrative}`,
    raw: `${prelude}\n\n${response.raw}`,
  };
}

function buildRoutePlaybook(messages: ChatMessage[], language: ResponseLanguage): string {
  const source = messages.map((message) => message.content).join("\n");

  if (/마이더스\s*손|마이더스손|midas[-\s]*hand|midas/i.test(source)) {
    return language === "en"
      ? `Route Playbook: Midas-Hand Reporter
- Core loop: public rumor -> deleted article or contract -> human source -> ownership or money trail.
- Recurring contacts: Seo-ha Yoon, AfterGold_0310, ad/contract staff, property registry clerks.
- Keep danger social and documentary first: erased drafts, false sponsorship files, altered ownership records, account pressure.
- Do not import Korean Barrier child-voice, KR-INIT-001, L3, or Sovari incidents unless the player explicitly connects them.`
      : `Route Playbook: 마이더스손 괴담 조사 기자
- 핵심 루프: 공개 괴담 -> 삭제 기사/계약서 -> 사람 제보 -> 소유권/입금 흐름.
- 반복 접점: 윤서하, AfterGold_0310, 광고/계약 담당자, 등기/소유권 기록 담당자.
- 위험은 먼저 사회적/기록적 압박으로 전개한다: 삭제 초안, 가짜 협찬, 소유권 변경, 계정 압박.
- 플레이어가 직접 연결하지 않는 한 방벽 아이 신고, KR-INIT-001, L3, 소바리 사건을 섞지 않는다.`;
  }

  if (/KR-?INIT-?001|잔여\s*문서|복원\s*로그|열람\s*등급|archive|records|restoration|clearance/i.test(source)) {
    return language === "en"
      ? `Route Playbook: KR-INIT-001 Records
- Core loop: archive access -> restoration trace -> clearance mismatch -> human authorization -> concealed response record.
- Recurring contacts: Yeon-ju Oh, archive security, anonymous restoration requester.
- Keep choices about logs, permissions, redactions, preservation rooms, and access risk.
- Do not pivot to unrelated field horror without a record, call, or official transfer.`
      : `Route Playbook: KR-INIT-001 잔여 문서 기록
- 핵심 루프: 기록 접근 -> 복원 흔적 -> 열람 등급 불일치 -> 사람 승인 -> 은폐된 대응 기록.
- 반복 접점: 오연주, 기록보안 담당자, 익명 복원 요청자.
- 선택지는 로그, 권한, 검열, 보존실, 접속 위험을 중심으로 만든다.
- 기록, 호출, 공식 이관 없이 무관한 현장 공포 장면으로 이동하지 않는다.`;
  }

  if (/L3|남극|거대공동|극지|현장\s*파견|진입\s*경로|지도\s*단말기|field dispatch|antarctic|hollow|entry route|field analyst/i.test(source)) {
    return language === "en"
      ? `Route Playbook: Antarctic Hollow Field Dispatch
- Core loop: dispatch order -> map mismatch -> route/version check -> field contact -> boundary consequence.
- Recurring contacts: Tae-o Lim, instructor, dispatch controller, escort team.
- Keep tension spatial and procedural: wrong roads, changed signs, missing approvals, quarantine timing.
- Do not reveal the internal site code in opening narration unless the player discovers it through a record.
- Choices should preserve field judgment: verify, compare, mark coordinates, call support, decide whether to move.`
      : `Route Playbook: 남극 거대공동 현장 파견
- 핵심 루프: 파견 지시 -> 지도 불일치 -> 경로/버전 확인 -> 현장 접점 -> 경계 결과.
- 반복 접점: 임태오, 강사, 파견 통제관, 동행 팀.
- 긴장은 공간적/절차적으로 유지한다: 틀린 도로, 바뀐 표지판, 빈 승인란, 격리 시간.
- 시작 장면에서는 내부 코드명이나 숨겨진 정체를 노출하지 말고 공개 명칭인 남극 거대공동 조사로 부른다.
- 선택지는 확인, 대조, 좌표 기록, 지원 호출, 이동 판단처럼 현장 행동으로 만든다.`;
  }

  if (/한국\s*방벽|방벽\s*내부|생활구|민간\s*조사|주민\s*신고|child voice|living zone|barrier/i.test(source)) {
    return language === "en"
      ? `Route Playbook: Korean Barrier Civil Investigation
- Core loop: resident report -> residence record -> caller or neighbor -> local procedure -> first fracture.
- Recurring contacts: Min-jae Park, caller, living-zone clerk, escort guard.
- Keep the scene grounded in civic procedure before revealing anomalies.
- The child-voice report belongs here and should not spread to other routes by default.`
      : `Route Playbook: 한국 방벽 내부 민간 조사
- 핵심 루프: 주민 신고 -> 거주 기록 -> 신고자/이웃 -> 생활구 절차 -> 첫 균열.
- 반복 접점: 박민재, 신고자, 생활구 기록 담당자, 동행 경비.
- 이상 현상보다 생활 행정 절차를 먼저 통과하게 해 현실감을 만든다.
- 아이 목소리 신고는 이 루트 소속 사건이며 기본적으로 다른 루트에 번지지 않는다.`;
  }

  if (/소바리|sovari|무전소|산\s*능선|radio station|ridge/i.test(source)) {
    return language === "en"
      ? `Route Playbook: Sovari Peripheral Search
- Core loop: local testimony -> radio timestamp -> ridge sign -> missing team trace -> temporal contradiction.
- Recurring contacts: Elder Naro, radio operator, missing team file, local guide.
- Keep the mood quiet and uncertain; use folklore and records before direct confrontation.`
      : `Route Playbook: 소바리 주변부 실종 조사
- 핵심 루프: 현지 증언 -> 무전 시간 -> 산 능선 징후 -> 실종팀 흔적 -> 시간 모순.
- 반복 접점: 나로 노인, 무전 담당자, 실종팀 파일, 현지 안내인.
- 분위기는 조용하고 불확실하게 유지하며, 직접 충돌보다 전승과 기록을 먼저 사용한다.`;
  }

  return language === "en"
    ? `Route Playbook: Open Custom Start
- Build the first case from the player's job, items, and funds.
- Choose one practical contact and one concrete first clue.
- Keep the next choices anchored to the character's capabilities.`
    : `Route Playbook: 자유 캐릭터 시작
- 플레이어의 직업, 소지품, 소지금을 기준으로 첫 사건을 만든다.
- 실용적인 접촉 인물 한 명과 구체적인 첫 단서 하나를 둔다.
- 다음 선택지는 캐릭터가 실제로 할 수 있는 행동에 맞춘다.`;
}

function buildSessionAnchor(messages: ChatMessage[], language: ResponseLanguage): string {
  const firstUser = getFirstUserText(messages);
  const source = messages.map((message) => message.content).join("\n");

  if (/마이더스\s*손|마이더스손|midas[-\s]*hand|midas/i.test(source)) {
    return language === "en"
      ? `Active Session Anchor:
- Route: Midas-Hand urban legend reporter.
- Keep the story about the Midas-Hand investigation, not the Korean Barrier child-voice complaint.
- Core leads: erased article drafts, informant DM, suspicious contract files, ownership transfer records, small money trails, and people whose public records changed after contact with Midas-Hand.`
      : `Active Session Anchor:
- 루트: 마이더스손 괴담 조사 기자.
- 한국 방벽 내부 아이 목소리 신고가 아니라 마이더스손 취재 사건을 중심으로 진행한다.
- 핵심 단서: 삭제된 기사 초안, 익명 제보 DM, 수상한 계약 파일, 소유권 이전 기록, 소액 입금 흔적, 마이더스손 접촉 뒤 공개 기록이 바뀐 사람들.`;
  }

  if (/KR-?INIT-?001|폐기 문서|잔여 문서|기록 관리자|archive|records/i.test(source)) {
    return language === "en"
      ? `Active Session Anchor:
- Route: KR-INIT-001 residual records.
- Keep the story centered on deleted documents, restoration logs, clearance mismatches, and archive access traces.`
      : `Active Session Anchor:
- 루트: KR-INIT-001 잔여 문서 기록.
- 삭제 문서, 복원 로그, 열람 등급 불일치, 접속 흔적을 중심으로 진행한다.`;
  }

  if (/L3|남극|거대공동|극지|현장 파견|field support|field analyst|antarctic|hollow/i.test(source)) {
    return language === "en"
      ? `Active Session Anchor:
- Route: Antarctic hollow field dispatch.
- Keep the story centered on route errors, map/reality mismatch, quarantine pressure, and field-team judgment.`
      : `Active Session Anchor:
- 루트: 남극 거대공동 현장 파견.
- 진입 경로 오류, 지도와 현실의 불일치, 격리 압박, 현장 판단을 중심으로 진행한다.`;
  }

  if (/한국\s*방벽|생활구|민간\s*조사\s*보조원|child voice|아이 목소리/i.test(source)) {
    return language === "en"
      ? `Active Session Anchor:
- Route: Korean Barrier civilian investigation.
- The child-voice complaint may be used here because it belongs to this route.`
      : `Active Session Anchor:
- 루트: 한국 방벽 내부 민간 조사.
- 아이 목소리 신고는 이 루트에 속한 사건으로만 사용한다.`;
  }

  if (!firstUser.trim()) return "";

  return language === "en"
    ? `Active Session Anchor:
- First character statement: ${firstUser.slice(0, 240)}
- Continue from this character and their latest action. Do not restart with an unrelated starter case.`
    : `Active Session Anchor:
- 첫 캐릭터 입력: ${firstUser.slice(0, 240)}
- 이 캐릭터와 최신 행동에서 이어간다. 무관한 시작 사건으로 재시작하지 않는다.`;
}

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
    pattern: /L3|남극|거대공동|극지|현장\s*파견|계약\s*분석관|L3_FIELD_ANALYST/i,
    label: "남극 거대공동 현장 파견 계약 분석관",
  },
] as const;

function isStarterRouteCommand(input: string): boolean {
  const trimmed = input.trim();
  if (/^START_ROUTE:/i.test(trimmed)) return true;
  if (/^[1-3](?:[.)])?$/.test(trimmed)) return true;
  return STARTER_ROUTE_HINTS.some((hint) => trimmed === hint.label);
}

function detectStarterRoute(input: string): string | null {
  const numericRoute = input.trim().match(/^([1-4])(?:[.)])?$/)?.[1];
  if (numericRoute === "1") return "한국 방벽 내부 민간 조사 보조원";
  if (numericRoute === "2") return "KR-INIT-001 잔여 문서 기록 관리자";
  if (numericRoute === "3") return "남극 거대공동 현장 파견 계약 분석관";

  const route = STARTER_ROUTE_HINTS.find((hint) => hint.pattern.test(input));
  return route?.label ?? null;
}

function getCharacterName(input: string): string {
  const trimmed = input.trim();
  if (/^START_ROUTE:/i.test(trimmed) || /^[1-3](?:[.)])?$/.test(trimmed)) return "당신";
  const englishNameMatch = input.match(/(?:Name\s*[:：]\s*)([A-Za-z][A-Za-z0-9_-]{1,24})/i);
  if (englishNameMatch) return englishNameMatch[1];
  const nameMatch = input.match(/(?:이름\s*[:：]\s*)?([가-힣A-Za-z0-9_-]{2,12})/);
  return nameMatch?.[1] ?? "당신";
}

function completeCharacterInput(input: string): { character: string; note: string } {
  const parts = [input.trim()];
  const added: string[] = [];

  if (!/(?:나이|연령|age|years?\s*old|세)\s*[:：]?\s*\d+|\d+\s*(?:세|years?\s*old)/i.test(input)) {
    parts.push("나이: 29");
    added.push("나이 29세");
  }
  if (!/직업|소속|occupation|job|affiliation/i.test(input)) {
    parts.push("직업(소속): 민간 조사 협력자");
    added.push("직업/소속");
  }
  if (!/소지품|장비|items?|equipment|gear/i.test(input)) {
    parts.push("소지품: 휴대폰, 신분증, 작은 손전등");
    added.push("소지품");
  }
  if (!/소지금|현금|돈|자금|funds?|cash|money|krw|usd|원|만원/i.test(input)) {
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

function extractCharacterField(character: string, pattern: RegExp): string | null {
  const match = character.match(pattern);
  return match?.[1]?.trim().replace(/\s+/g, " ") ?? null;
}

function buildCharacterIdentityLine(character: string, name: string): string {
  const rawAge = extractCharacterField(character, /(?:나이|연령|age)\s*[:：]\s*([^/\n]+)/i)
    ?? character.match(/(\d+\s*(?:세|years?\s*old))/i)?.[1]?.trim()
    ?? "나이 미확정";
  const age = /^\d+$/.test(rawAge) ? `${rawAge}세` : rawAge;
  const job = extractCharacterField(character, /(?:직업(?:\(소속\))?|소속|occupation|job|affiliation)\s*[:：]\s*([^/\n]+)/i)
    ?? "민간 조사 협력자";
  const items = extractCharacterField(character, /(?:소지품|장비|items?|equipment|gear)\s*[:：]\s*([^/\n]+)/i)
    ?? "휴대폰, 신분증, 작은 손전등";
  const funds = extractCharacterField(character, /(?:소지금|현금|돈|자금|funds?|cash|money)\s*[:：]?\s*([^/\n]+)/i)
    ?? "50,000원";

  return `${name}. 세션은 당신을 ${age}의 ${job}로 등록합니다. 현재 확인된 소지품은 ${items}, 소지금은 ${funds}입니다.`;
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
  if (/남극|거대공동|극지|Antarctic|Hollow/i.test(source)) {
    groups.push(language === "en" ? "Antarctic Hollow: Survey Zone" : "남극 거대공동: 조사 권역");
  } else if (/L3/.test(source) && !/^START_ROUTE:L3_FIELD_ANALYST\s*$/m.test(source)) {
    groups.push(language === "en" ? "Restricted Field Dispatch Zone" : "제한 현장 파견 권역");
  }
  if (/소바리|Sovari/i.test(source)) groups.push(language === "en" ? "Sovari: Peripheral Investigation Zone" : "소바리: 주변부 조사 권역");

  return Array.from(new Set(groups)).slice(0, 6);
}

function extractPeople(text: string, messages: ChatMessage[], language: ResponseLanguage): NonNullable<GameResponse["briefing"]>["people"] {
  const source = `${getFirstUserText(messages)}\n${text}`;
  const people: NonNullable<GameResponse["briefing"]>["people"] = [];
  const characterName = getCharacterName(getFirstUserText(messages));
  const isMidasRoute = /마이더스\s*손|마이더스손|midas[-\s]*hand|midas/i.test(source);

  if (characterName !== "당신") {
    people.push({
      name: characterName,
      emotion: language === "en" ? "Calm" : "평온",
      detail: language === "en" ? "Player character" : "플레이어 캐릭터",
      trust: language === "en" ? "Self" : "본인",
      lastSeen: language === "en" ? "Current viewpoint" : "현재 시점",
      known: language === "en" ? "Identity anchor for this session" : "이번 세션의 시점 인물",
    });
  }
  if (!isMidasRoute && /제보자|신고자|caller|informant/i.test(source)) {
    const isReporter = /신고자|caller/i.test(source);
    people.push({
      name: language === "en" ? (isReporter ? "Caller" : "Informant") : (isReporter ? "신고자" : "제보자"),
      emotion: language === "en" ? "Uneasy" : "불안",
      detail: language === "en" ? "Contact possible / reliability unknown" : "접촉 가능 / 신뢰도 미확인",
      trust: language === "en" ? "Unverified" : "미검증",
      lastSeen: language === "en" ? "Waiting for contact" : "연락 대기",
      known: language === "en" ? "Holds the first human account" : "첫 사람 증언을 쥐고 있음",
    });
  }
  if (/박민재|민원 접수|방벽 내부|생활구|barrier|living zone/i.test(source)) {
    people.push({
      name: language === "en" ? "Min-jae Park" : "박민재",
      emotion: language === "en" ? "Cautious" : "신중",
      detail: language === "en" ? "Civil desk senior / knows local procedures" : "민원 접수 선임 / 생활구 절차 숙지",
      trust: language === "en" ? "Procedural ally" : "절차상 아군",
      lastSeen: language === "en" ? "Civil reception desk" : "민원 접수실",
      known: language === "en" ? "Can find similar reports and escort rules" : "유사 신고와 동행 절차 확인 가능",
    });
  }
  if (isMidasRoute) {
    people.push({
      name: language === "en" ? "Seo-ha Yoon" : "윤서하",
      emotion: language === "en" ? "Concerned" : "걱정",
      detail: language === "en" ? "Desk editor / can verify deleted drafts" : "편집 데스크 / 삭제 초안 확인 가능",
      trust: language === "en" ? "Known contact" : "기존 접점",
      lastSeen: language === "en" ? "Editor message" : "편집 데스크 메시지",
      known: language === "en" ? "Knows CMS and sponsorship file inconsistencies" : "CMS와 협찬 제안서 불일치를 알고 있음",
    });
    people.push({
      name: "AfterGold_0310",
      emotion: language === "en" ? "Fear" : "공포",
      detail: language === "en" ? "Anonymous informant / contact unstable" : "익명 제보자 / 접속 불안정",
      trust: language === "en" ? "Risky source" : "위험한 제보원",
      lastSeen: language === "en" ? "02:17 message" : "02:17 메시지",
      known: language === "en" ? "Claims ownership records change after contact" : "접촉 후 기록 소유권이 바뀐다고 주장",
    });
  }
  if (/강사|instructor/i.test(source)) {
    people.push({
      name: language === "en" ? "Field Instructor" : "현장 강사",
      emotion: language === "en" ? "Controlled" : "통제",
      detail: language === "en" ? "Knows procedure / avoids direct answers" : "절차 숙지 / 직접 답변 회피",
      trust: language === "en" ? "Official but evasive" : "공식적이나 회피적",
      lastSeen: language === "en" ? "Pre-dispatch classroom" : "파견 전 교육실",
      known: language === "en" ? "Repeats doctrine about trusting the road" : "길과 지도에 관한 원칙을 반복함",
    });
  }
  if (/임태오|지도 단말기|진입 경로|field support|entry route/i.test(source)) {
    people.push({
      name: language === "en" ? "Tae-o Lim" : "임태오",
      emotion: language === "en" ? "Alert" : "경계",
      detail: language === "en" ? "Field support operator / monitors route data" : "현장 지원 오퍼레이터 / 경로 데이터 감시",
      trust: language === "en" ? "Operational ally" : "작전상 아군",
      lastSeen: language === "en" ? "Map terminal handoff" : "지도 단말기 인계",
      known: language === "en" ? "Saw route changes with no approver" : "승인자 없는 경로 변경을 확인함",
    });
  }
  if (/복원 로그|폐기 문서|열람 등급|archive|restoration log/i.test(source)) {
    people.push({
      name: language === "en" ? "Archive Security" : "기록보안 담당자",
      emotion: language === "en" ? "Suspicious" : "의심",
      detail: language === "en" ? "Can lock access if alerted" : "접속 이상 감지 시 차단 가능",
      trust: language === "en" ? "Institutional risk" : "기관 위험",
      lastSeen: language === "en" ? "Access monitor" : "접속 감시",
      known: language === "en" ? "Controls archive alarms and lockouts" : "기록망 경보와 차단 권한 보유",
    });
  }
  if (/오연주|제3기록보존실|색인|기록 관리자/i.test(source)) {
    people.push({
      name: language === "en" ? "Yeon-ju Oh" : "오연주",
      emotion: language === "en" ? "Uneasy" : "불안",
      detail: language === "en" ? "Archive supervisor / can approve restoration checks" : "기록보존실 감독관 / 복원 확인 승인 가능",
      trust: language === "en" ? "Cautious supervisor" : "신중한 감독관",
      lastSeen: language === "en" ? "Preservation room entrance" : "기록보존실 출입구",
      known: language === "en" ? "Can authorize restoration-request checks" : "복원 요청자 확인 권한을 열 수 있음",
    });
  }
  if (/소바리|Sovari|무전소|산 능선/i.test(source)) {
    people.push({
      name: language === "en" ? "Elder Naro" : "나로 노인",
      emotion: language === "en" ? "Guarded" : "경계",
      detail: language === "en" ? "Local witness / knows the ridge stories" : "현지 증언자 / 산 능선 전승을 앎",
      trust: language === "en" ? "Local witness" : "현지 증언자",
      lastSeen: language === "en" ? "Small radio station" : "작은 무전소",
      known: language === "en" ? "Connects ridge lights to records, not rescue" : "산 능선의 빛을 구조가 아닌 기록과 연결함",
    });
  }

  const unique = new Map<string, NonNullable<GameResponse["briefing"]>["people"][number]>();
  for (const person of people) {
    if (!unique.has(person.name)) unique.set(person.name, person);
  }

  return Array.from(unique.values()).slice(0, 6);
}

function addClue(
  clues: NonNullable<GameResponse["briefing"]>["clues"],
  clue: NonNullable<GameResponse["briefing"]>["clues"][number],
) {
  if (!clues.some((item) => item.title === clue.title)) clues.push(clue);
}

function extractClues(text: string, messages: ChatMessage[], language: ResponseLanguage): NonNullable<GameResponse["briefing"]>["clues"] {
  const source = `${getFirstUserText(messages)}\n${text}`;
  const clues: NonNullable<GameResponse["briefing"]>["clues"] = [];

  if (/마이더스\s*손|마이더스손|midas[-\s]*hand|midas/i.test(source)) {
    addClue(clues, {
      title: language === "en" ? "Deleted Draft" : "삭제된 기사 초안",
      detail: language === "en" ? "The CMS draft vanished while a matching sponsorship file appeared." : "CMS 초안은 사라졌고 같은 제목의 협찬 제안서가 나타났다.",
      status: language === "en" ? "Unverified" : "미검증",
      source: language === "en" ? "Editor / CMS" : "윤서하 / CMS",
    });
    addClue(clues, {
      title: language === "en" ? "Locker 17 Deadline" : "라커 17번 시한",
      detail: language === "en" ? "AfterGold_0310 says the locker must be opened before 03:10." : "AfterGold_0310은 03:10 전에 라커를 열어야 한다고 말했다.",
      status: language === "en" ? "Time-sensitive" : "시간 민감",
      source: "AfterGold_0310",
    });
  }

  if (/아이 목소리|아이가 없습니다|child voice|there is no child/i.test(source)) {
    addClue(clues, {
      title: language === "en" ? "Child-Voice Complaint" : "아이 목소리 신고",
      detail: language === "en" ? "A neighbor reports a repeated sentence from a home with no child record." : "아이 기록이 없는 집에서 같은 문장이 반복된다는 신고가 접수됐다.",
      status: language === "en" ? "Needs record check" : "기록 대조 필요",
      source: language === "en" ? "Caller" : "신고자",
    });
  }
  if (/자동 분류|classification failed|생활구 기록|residence record/i.test(source)) {
    addClue(clues, {
      title: language === "en" ? "Classification Failure" : "자동 분류 실패",
      detail: language === "en" ? "The civic system failed to classify the report twice." : "민원 시스템이 신고를 두 번 자동 분류하지 못했다.",
      status: language === "en" ? "System anomaly" : "시스템 이상",
      source: language === "en" ? "Civil desk terminal" : "민원 단말기",
    });
  }

  if (/KR-?INIT-?001/i.test(source)) {
    addClue(clues, {
      title: "KR-INIT-001",
      detail: language === "en" ? "A deleted record reappeared with restoration and clearance mismatch." : "삭제된 기록이 복원 상태와 열람 등급 불일치로 다시 나타났다.",
      status: language === "en" ? "Contradictory record" : "불일치 기록",
      source: language === "en" ? "Archive index" : "기록 색인",
    });
  }
  if (/복원 로그|restoration log|복원 요청/i.test(source)) {
    addClue(clues, {
      title: language === "en" ? "Restoration Request" : "복원 요청",
      detail: language === "en" ? "A restoration request was filed under the player's account or route." : "플레이어 계정 또는 경로로 복원 요청이 올라왔다.",
      status: language === "en" ? "Traceable" : "추적 가능",
      source: language === "en" ? "Archive supervisor" : "오연주",
    });
  }

  if (/세 번째 표지판|third sign/i.test(source)) {
    addClue(clues, {
      title: language === "en" ? "Third Sign Warning" : "세 번째 표지판 경고",
      detail: language === "en" ? "A handwritten warning appears on page 17 of the field material." : "현장 교육 자료 17쪽에 돌아오지 말라는 필체가 남아 있다.",
      status: language === "en" ? "Route hazard" : "경로 위험",
      source: language === "en" ? "Training page 17" : "교육 자료 17쪽",
    });
  }
  if (/경로.*바뀌|route.*chang|승인자|approver|지도 단말기|map terminal/i.test(source)) {
    addClue(clues, {
      title: language === "en" ? "Changed Route" : "변경된 진입 경로",
      detail: language === "en" ? "The entry route changed without a visible approver." : "진입 경로가 승인자 없이 여러 번 바뀌었다.",
      status: language === "en" ? "Needs version check" : "버전 확인 필요",
      source: language === "en" ? "Tae-o Lim / map terminal" : "임태오 / 지도 단말기",
    });
  }

  if (/우리는 아직 출발하지 않았다|내일 오후|tomorrow afternoon|not departed/i.test(source)) {
    addClue(clues, {
      title: language === "en" ? "Future Radio Log" : "미래 시각 무전",
      detail: language === "en" ? "The missing team's last radio log is timestamped in the future." : "실종팀의 마지막 무전 시간이 내일 오후로 찍혀 있다.",
      status: language === "en" ? "Temporal contradiction" : "시간 모순",
      source: language === "en" ? "Radio station" : "무전소",
    });
  }
  if (/산 능선|ridge|빛이 세 개|three lights/i.test(source)) {
    addClue(clues, {
      title: language === "en" ? "Three Ridge Lights" : "산 능선의 세 빛",
      detail: language === "en" ? "Local testimony links the lights to records, not rescue." : "현지 증언은 그 빛을 구조가 아니라 기록과 연결한다.",
      status: language === "en" ? "Local testimony" : "현지 증언",
      source: language === "en" ? "Elder Naro" : "나로 노인",
    });
  }

  if (/이동 기록|미등록|진동|movement record|unregistered|vibrat/i.test(source)) {
    addClue(clues, {
      title: language === "en" ? "Future Movement Record" : "미래 이동 기록",
      detail: language === "en" ? "A movement log exists before the player has moved." : "아직 이동하지 않았는데 9분 뒤의 이동 기록이 생성됐다.",
      status: language === "en" ? "Open clue" : "초기 단서",
      source: language === "en" ? "Session terminal" : "세션 단말기",
    });
  }

  return clues.slice(0, 5);
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
    updates.push("현장 교육 자료 17쪽에 '세 번째 표지판을 보면 돌아오지 마라'가 적혀 있다.");
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

function extractGoals(response: Pick<GameResponse, "choices" | "narrative" | "raw">, messages: ChatMessage[], language: ResponseLanguage): string[] {
  const choiceGoals = response.choices
    .map((choice) => choice.text.replace(/[.。]$/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
  const source = `${messages.map((message) => message.content).join("\n")}\n${response.raw}\n${response.narrative}`;

  if (language === "en") {
    if (/midas[-\s]*hand|midas/i.test(source)) {
      return [
        "The deleted draft is the cleanest thread. Still, 03:10 keeps pressing on me; if the locker is real, the informant may not stay reachable.",
      ];
    }

    if (/KR-?INIT-?001|archive|restoration log|clearance/i.test(source)) {
      return [
        "Opening the document would be fast, but the access log may already be bait. The restoration log should tell me who woke it up.",
      ];
    }

    if (/L3|남극|거대공동|field dispatch|instructor|entry route|antarctic|hollow/i.test(source)) {
      return [
        "The instructor is waiting for my answer. I should ask Tae-o for the route log before pretending I understand that map.",
      ];
    }

    if (/child voice|caller|living zone|barrier/i.test(source)) {
      return [
        "Calling the reporter might give me a human read, but the residence record can tell me what the system thinks happened first.",
      ];
    }

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

  if (/마이더스\s*손|마이더스손|midas[-\s]*hand|midas/i.test(source)) {
    return [
      "삭제된 기사 초안부터 보면 누가 내 기록을 건드렸는지 나온다. 그래도 03:10이 계속 걸려. 라커가 진짜라면 제보자는 오래 기다려주지 않을 거야.",
    ];
  }

  if (/KR-?INIT-?001|폐기 문서|복원 로그|열람 등급|기록보안/i.test(source)) {
    return [
      "문서를 바로 열면 빠르겠지만, 그 자체가 미끼일 수도 있어. 복원 로그부터 보면 누가 이걸 다시 살렸는지 보일지 몰라.",
    ];
  }

  if (/L3|남극|거대공동|현장 파견|강사|진입 경로|세 번째 표지판/i.test(source)) {
    return [
      "강사가 내 대답을 기다리고 있어. 이해한 척하기 전에 임태오에게 변경 로그부터 받아보는 게 나을지도 몰라.",
    ];
  }

  if (/신고자|아이 목소리|생활구|방벽 내부/i.test(source)) {
    return [
      "신고자에게 바로 전화하면 사람의 반응은 잡을 수 있어. 그래도 거주 기록부터 보면, 이 신고가 현실 쪽 문제인지 기록 쪽 문제인지 갈릴 거야.",
    ];
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
    goals: extractGoals(response, messages, language),
    clues: extractClues(text, messages, language),
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

type ConversationContact = {
  pattern: RegExp;
  koPrompt: string;
  enPrompt: string;
};

const CONVERSATION_CONTACTS: ConversationContact[] = [
  {
    pattern: /임태오|Tae-o|진입 경로|지도 단말기|entry route|map terminal/i,
    koPrompt: `임태오가 단말기 밝기를 낮추고 당신을 봅니다. "지금 바로 경로부터 볼까요, 아니면 먼저 물어볼 게 있습니까?"`,
    enPrompt: `Tae-o lowers the map terminal brightness and looks at you. "Do we check the route now, or is there something you need to ask first?"`,
  },
  {
    pattern: /강사|Field Instructor|instructor|세 번째 표지판/i,
    koPrompt: `강사가 말을 멈추고 당신 표정을 살핍니다. "괜찮습니다. 이해한 척하지 말고, 걸리는 부분이 있으면 지금 물어보세요."`,
    enPrompt: `The instructor stops and studies your face. "It's fine. Don't pretend you understood it. Ask now if something bothers you."`,
  },
  {
    pattern: /윤서하|Seo-ha|CMS|초안|마이더스|Midas/i,
    koPrompt: `윤서하가 통화 너머로 숨을 고릅니다. "너 혼자 판단하지 말고 말해. 내가 먼저 열어줄 건 뭐야?"`,
    enPrompt: `Seo-ha exhales through the call. "Don't decide alone. Tell me what you want me to open first."`,
  },
  {
    pattern: /AfterGold_0310|제보자|informant/i,
    koPrompt: `제보자의 DM 창에 입력 중 표시가 깜빡입니다. "아직 거기 있습니까. 뭘 먼저 확인할 겁니까?"`,
    enPrompt: `The informant's DM bubble flickers. "Are you still there? What are you checking first?"`,
  },
  {
    pattern: /오연주|Yeon-ju|기록보안|복원 로그|열람 등급|archive|restoration log|clearance/i,
    koPrompt: `오연주가 권한 창 위에 손을 올린 채 묻습니다. "열까요, 아니면 누가 복원했는지부터 볼까요?"`,
    enPrompt: `Yeon-ju keeps one hand over the authorization panel. "Do we open it, or check who restored it first?"`,
  },
  {
    pattern: /박민재|Min-jae|신고자|생활구|방벽|caller|living zone|barrier/i,
    koPrompt: `박민재가 접수창 너머로 낮게 묻습니다. "바로 사람에게 걸어볼까요, 아니면 기록부터 맞춰볼까요?"`,
    enPrompt: `Min-jae leans closer behind the civil desk. "Do we call the person first, or line up the records?"`,
  },
  {
    pattern: /나로|Naro|소바리|Sovari|무전|radio|ridge/i,
    koPrompt: `나로 노인이 무전기 소리를 줄입니다. "지금 듣고 싶은 건 사람 말이오, 아니면 저 산 쪽 소리요?"`,
    enPrompt: `Elder Naro lowers the radio volume. "Do you want a human answer first, or the sound from the ridge?"`,
  },
];

function detectConversationContact(source: string): ConversationContact | null {
  return CONVERSATION_CONTACTS.find((contact) => contact.pattern.test(source)) ?? null;
}

function hasConversationalHandoff(narrative: string): boolean {
  const tail = narrative
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-6)
    .join("\n");

  return /[?？]\s*["'”’)]?\s*$/.test(tail)
    || /묻습니다|묻는다|말합니다|말한다|물어봅니다|메시지를 보냅니다|기다립니다|asks|says|waits|texts/i.test(tail);
}

function ensureConversationalHandoff(
  narrative: string,
  response: Pick<GameResponse, "raw" | "choices">,
  messages: ChatMessage[],
  language: ResponseLanguage,
): string {
  if (!narrative.trim() || hasConversationalHandoff(narrative)) return narrative;

  const source = `${messages.map((message) => message.content).join("\n")}\n${response.raw}\n${narrative}`;
  const contact = detectConversationContact(source);
  const prompt = contact
    ? language === "en" ? contact.enPrompt : contact.koPrompt
    : language === "en"
      ? `You take a breath and feel the scene waiting for an answer. What do you say or do first?`
      : `당신은 잠깐 숨을 고릅니다. 지금 무엇을 말하고, 무엇을 먼저 붙잡을지 결정해야 합니다.`;

  return `${narrative.trimEnd()}\n\n${prompt}`;
}

function isConversationalChoice(text: string): boolean {
  return /["“”'‘’]/.test(text)
    || /[?？]/.test(text)
    || /볼게|볼까요|할게|할까요|주세요|부탁|말한다|묻는다|물어|대답|답한다|요청|제가|잠깐|ask|tell|say|reply|request|let me|i'll|i will|should i/i.test(text);
}

function humanizeChoiceText(text: string, language: ResponseLanguage): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || isConversationalChoice(clean)) return clean;

  if (language === "en") {
    const lower = clean.toLowerCase();
    if (/route|coordinate|map|change|version/.test(lower)) return `"Show me what changed first." ${clean}`;
    if (/record|log|document|file|archive|restore|clearance/.test(lower)) return `"Let's line up the records first." ${clean}`;
    if (/caller|informant|contact|call|message/.test(lower)) return `"I'll hear it directly." ${clean}`;
    if (/ask|question/.test(lower)) return `"I'll ask that directly." ${clean}`;
    if (/look|search|around|inspect/.test(lower)) return `"Hold on. I want to look around first." ${clean}`;
    if (/move|go|enter|leave|head/.test(lower)) return `"I'll go myself. Keep the route open." ${clean}`;
    if (/review|summarize|think/.test(lower)) return `"Give me one second to line this up." ${clean}`;
    return `"All right. Let me try this first." ${clean}`;
  }

  if (/변경|경로|좌표|지도|버전/.test(clean)) return `"변경된 부분부터 보여주세요." ${clean}`;
  if (/기록|로그|문서|자료|파일|열람|복원|등급/.test(clean)) return `"기록부터 맞춰볼게요." ${clean}`;
  if (/신고자|제보자|연락|전화|메시지|DM/.test(clean)) return `"제가 직접 들어볼게요." ${clean}`;
  if (/묻|질문/.test(clean)) return `"그 부분은 제가 물어보겠습니다." ${clean}`;
  if (/주변|살핀|둘러|수색|조사/.test(clean)) return `"잠깐만요. 주변부터 다시 볼게요." ${clean}`;
  if (/이동|향한다|간다|들어간다|나간다/.test(clean)) return `"직접 가보겠습니다. 대신 경로는 열어두세요." ${clean}`;
  if (/정리|생각/.test(clean)) return `"한 번만 정리하고 움직일게요." ${clean}`;
  return `"좋아요. 제가 먼저 해볼게요." ${clean}`;
}

function applyConversationalLayer(response: GameResponse, messages: ChatMessage[], language: ResponseLanguage): GameResponse {
  const narrative = ensureConversationalHandoff(stripSystemLog(response.narrative), response, messages, language);
  const choices = response.choices.map((choice) => ({
    text: humanizeChoiceText(choice.text, language),
  }));

  return {
    ...response,
    narrative,
    choices,
  };
}

function withBriefing(response: GameResponse, messages: ChatMessage[], language: ResponseLanguage = "ko"): GameResponse {
  const conversationalResponse = applyConversationalLayer(response, messages, language);
  const memory_updates = Array.from(
    new Set([
      ...(conversationalResponse.memory_updates ?? []),
      ...inferMemoryUpdates(conversationalResponse, messages),
    ].map(normalizeMemoryUpdate).filter(Boolean)),
  ).slice(0, 3);

  return {
    ...conversationalResponse,
    briefing: buildBriefing(conversationalResponse, messages, language),
    memory_updates,
  };
}

function buildCustomCharacterOpening(input: string): GameResponse {
  const completed = completeCharacterInput(input);
  const character = completed.character;
  const name = getCharacterName(character);
  const identityLine = buildCharacterIdentityLine(character, name);
  const briefingMessages: ChatMessage[] = [{ role: "user", content: character }];

  if (/기자|취재|괴담|마이더스|midas[-\s]*hand|midas/i.test(character)) {
    const narrative = `[Scene]
${identityLine}
${completed.note}

마이더스손 관련 괴담을 추적하던 중, 익명 제보 하나가 새벽 2시 17분에 도착했습니다.

편집 데스크 윤서하에게서도 메시지가 와 있습니다.

"${name}, 네 초안이 CMS에서 사라졌어.
그런데 광고팀에는 같은 제목의 협찬 제안서가 올라와 있어. 네가 보낸 거 아니지?"

"당신이 아직 쓰지 않은 기사 초안이 세 번 삭제됐습니다.
제목은 같습니다.
마이더스손은 사람을 죽이지 않는다. 소유주를 바꾼다."

첨부 파일은 세 개입니다. 삭제된 기사 복구 로그, 광고 계약서 스캔본, 그리고 폐상가 3층 라커 17번을 찍은 흐린 사진입니다.
계약서의 서명란에는 당신 이름의 초성이 들어가 있고, 지급액은 방금 캐릭터가 적은 소지금과 같은 단위로 맞춰져 있습니다.

제보자 계정은 마지막으로 이렇게 보냈습니다.

"마이더스손을 팔로우한 사람은 돈을 받은 게 아닙니다.
자기 기록의 소유권을 넘긴 겁니다.
오늘 03:10 전에 라커를 열지 않으면, 당신 기사도 누군가의 이름으로 발행됩니다."

윤서하가 다시 메시지를 보냅니다.

"지금 이거 장난 아니지?
너 먼저 어디부터 볼 거야. 내가 열어줄 수 있는 건 하나야."

[State]
Disclosure Level: PUBLIC
Boundary Stability: 안정
Faction Heat: 마이더스손 주변 계정 주시
Visible Classification: 민간 괴담 / 확인 보류`;

    const raw = `${narrative}

[Choices]
1. "복구 로그부터 열어줘." 삭제된 기사 초안을 확인한다.
2. "협찬 제안서 원본이 먼저야." 윤서하에게 파일을 요청한다.
3. "제보자가 어디서 보냈는지 볼게." AfterGold_0310의 접속 위치를 추적한다.
4. "라커가 미끼여도 직접 확인해야 해." 폐상가 3층으로 향한다.`;

    return withBriefing({
      narrative,
      choices: [
        { text: "\"복구 로그부터 열어줘.\" 삭제된 기사 초안을 확인한다." },
        { text: "\"협찬 제안서 원본이 먼저야.\" 윤서하에게 파일을 요청한다." },
        { text: "\"제보자가 어디서 보냈는지 볼게.\" AfterGold_0310의 접속 위치를 추적한다." },
        { text: "\"라커가 미끼여도 직접 확인해야 해.\" 폐상가 3층으로 향한다." },
      ],
      allow_freeform: true,
      raw,
    }, briefingMessages);
  }

  if (/L3|남극|거대공동|극지|현장\s*지원|현장\s*파견|지도\s*단말기|field\s*support|field\s*analyst|antarctic|hollow/i.test(character)) {
    const narrative = `[Scene]
${identityLine}
${completed.note}

극지 현장 파견 대기실의 전광판에는 당신 이름 대신 임시 호출 부호가 떠 있습니다.
공개 임무명은 남극 거대공동 조사 지원. 내부 코드명과 원인 항목은 검은 칸으로 가려져 있습니다.

현장 지원 오퍼레이터 임태오가 지도 단말기를 건네며 낮게 말합니다.

"네 장비는 정상인데, 네 경로만 어제부터 세 번 바뀌었어.
문제는 변경 승인자가 없어. 승인란이 그냥 비어 있어."

단말기 화면에는 남극 조사 지점의 진입 경로가 표시됩니다. 같은 빙하 균열이 확대할 때마다 조금씩 다른 위치에 놓이고, 교육 자료 17쪽에는 다른 사람의 필체로 한 줄이 적혀 있습니다.

"세 번째 표지판을 보면 돌아오지 마라."

임태오가 단말기를 놓지 않은 채 당신 표정을 살핍니다.

"이해한 척하지 말고 말해.
지금 네가 먼저 확인하고 싶은 거, 경로야? 아니면 이 문장이야?"

[State]
Disclosure Level: RESTRICTED
Boundary Stability: 흔들림
Visible Classification: 남극 거대공동 조사 / 확인 전`;

    const raw = `${narrative}

[Choices]
1. "경로부터 볼게요. 변경 로그 보내주세요." 임태오에게 요청한다.
2. "17쪽 문장부터 확인해야겠어요." 필체와 배포 기록을 대조한다.
3. "이전 경로 버전이 남아 있나요?" 단말기의 변경 전 좌표를 조회한다.
4. 말없이 현재 좌표를 사진으로 남기고, 임태오의 반응을 본다.`;

    return withBriefing({
      narrative,
      choices: [
        { text: "\"경로부터 볼게요. 변경 로그 보내주세요.\" 임태오에게 요청한다." },
        { text: "\"17쪽 문장부터 확인해야겠어요.\" 필체와 배포 기록을 대조한다." },
        { text: "\"이전 경로 버전이 남아 있나요?\" 단말기의 변경 전 좌표를 조회한다." },
        { text: "말없이 현재 좌표를 사진으로 남기고, 임태오의 반응을 본다." },
      ],
      allow_freeform: true,
      raw,
    }, briefingMessages);
  }

  if (/기록|문서|색인|관리|아카이브|자료/i.test(character)) {
    const narrative = `[Scene]
${identityLine}
${completed.note}

제3기록보존실 출입구에서 임시 권한 카드가 한 박자 늦게 인식됩니다.
감독관 오연주는 카드 리더기를 한 번 더 확인하고, 목소리를 낮춥니다.

"오늘 네가 맡은 건 폐기 색인 검수야.
그런데 방금 네 계정으로 복원 요청 하나가 올라왔어. 네가 누른 거 아니지?"

당신의 작업 단말기에는 존재하면 안 되는 항목 하나가 내부 검색망에 다시 나타납니다.

KR-INIT-001 / 복원 상태: 부분 성공 / 열람 등급: 불일치

문서 제목 아래에는 제목이 아닌 문장이 적혀 있습니다.

"첫 대응은 실패하지 않았다. 성공했기 때문에 묻혔다."

오연주가 모니터를 끄지 않은 채 당신을 봅니다.

"이거 열면 네 계정에 흔적이 남아.
그래도 직접 볼 거야, 아니면 내가 먼저 권한 쪽을 건드려볼까?"

[State]
Disclosure Level: PUBLIC -> RESTRICTED
Boundary Stability: 안정`;

    const raw = `${narrative}

[Choices]
1. "권한부터 부탁드립니다." 오연주에게 요청자 확인을 열어달라고 한다.
2. "흔적 남아도 복원 로그를 먼저 볼게요." 로그를 연다.
3. "등급이 왜 틀렸는지부터 보죠." 열람 등급 사유를 조회한다.
4. 말없이 화면을 캡처하고 접속을 끊을 준비를 한다.`;

    return withBriefing({
      narrative,
      choices: [
        { text: "\"권한부터 부탁드립니다.\" 오연주에게 요청자 확인을 열어달라고 한다." },
        { text: "\"흔적 남아도 복원 로그를 먼저 볼게요.\" 로그를 연다." },
        { text: "\"등급이 왜 틀렸는지부터 보죠.\" 열람 등급 사유를 조회한다." },
        { text: "말없이 화면을 캡처하고 접속을 끊을 준비를 한다." },
      ],
      allow_freeform: true,
      raw,
    }, briefingMessages);
  }

  if (/방벽|생활구|민원|주민|조사\s*보조|barrier|living\s*zone/i.test(character)) {
    const narrative = `[Scene]
${identityLine}
${completed.note}

방벽 내부 제12생활구 민원 접수실은 비에 젖은 우산 냄새와 오래된 소독약 냄새가 섞여 있습니다.
선임 조사 보조원 박민재가 당신의 단말기에 새 업무를 밀어 넣습니다.

"평범한 민원처럼 보이는데, 자동 분류가 두 번 실패했어.
신고자는 겁먹었고, 생활구 기록은 이상하게 조용해."

신고 내용은 짧습니다.

"어젯밤부터 옆집 아이가 같은 문장을 반복합니다.
그 집에는 아이가 없습니다."

박민재가 당신에게 수화기를 밀어놓고 묻습니다.

"바로 전화할래?
아니면 기록부터 맞춰보고, 사람이 거짓말하는 건지 시스템이 빠뜨린 건지 보겠어?"

[State]
Disclosure Level: PUBLIC
Boundary Stability: 안정
Visible Classification: 주민 신고 / 확인 필요`;

    const raw = `${narrative}

[Choices]
1. "비슷한 신고가 있었나요?" 박민재에게 먼저 묻는다.
2. "제가 바로 전화해볼게요." 신고자에게 연락한다.
3. "기록부터 맞춰보죠." 옆집 주소의 거주 기록을 조회한다.
4. "혼자 가긴 찜찜합니다." 현장 동행 요청을 넣는다.`;

    return withBriefing({
      narrative,
      choices: [
        { text: "\"비슷한 신고가 있었나요?\" 박민재에게 먼저 묻는다." },
        { text: "\"제가 바로 전화해볼게요.\" 신고자에게 연락한다." },
        { text: "\"기록부터 맞춰보죠.\" 옆집 주소의 거주 기록을 조회한다." },
        { text: "\"혼자 가긴 찜찜합니다.\" 현장 동행 요청을 넣는다." },
      ],
      allow_freeform: true,
      raw,
    }, briefingMessages);
  }

  if (/소바리|sovari|현지\s*협력|무전|산악/i.test(character)) {
    const narrative = `[Scene]
${identityLine}
${completed.note}

소바리 외곽의 작은 무전소는 낮인데도 난방기가 꺼져 있습니다.
현지 안내인 나로 노인은 당신이 가져온 장비를 보고도 한동안 말이 없습니다. 그러다 산 능선 쪽을 가리킵니다.

"저 빛이 세 개로 보이면, 사람을 찾으러 가는 게 아니라 기록을 찾으러 가는 거야."

그때 실종된 조사팀의 마지막 무전이 다시 재생됩니다.

"우리는 아직 출발하지 않았다.
만약 우리가 도착했다고 말하면, 그건 우리가 아니다."

무전 기록의 시간은 내일 오후로 찍혀 있습니다.

나로 노인이 무전기 볼륨을 줄이며 묻습니다.

"그래도 산으로 갈 건가.
아니면 먼저, 저 목소리가 어디서 다시 살아났는지 볼 건가."

[State]
Disclosure Level: PUBLIC
Boundary Stability: 안정
Visible Classification: 실종 조사 / 시간 기록 오류`;

    const raw = `${narrative}

[Choices]
1. "저 빛을 본 사람이 또 있습니까?" 나로 노인에게 묻는다.
2. "좌표부터 찍어두겠습니다." 마지막 무전 위치를 지도에 표시한다.
3. "그 사람들이 정말 출발했는지부터 보죠." 출발 기록을 확인한다.
4. 말없이 무전 원본을 복사하고, 재생 시간을 다시 본다.`;

    return withBriefing({
      narrative,
      choices: [
        { text: "\"저 빛을 본 사람이 또 있습니까?\" 나로 노인에게 묻는다." },
        { text: "\"좌표부터 찍어두겠습니다.\" 마지막 무전 위치를 지도에 표시한다." },
        { text: "\"그 사람들이 정말 출발했는지부터 보죠.\" 출발 기록을 확인한다." },
        { text: "말없이 무전 원본을 복사하고, 재생 시간을 다시 본다." },
      ],
      allow_freeform: true,
      raw,
    }, briefingMessages);
  }

  const narrative = `[Scene]
${identityLine}
${completed.note}

접속 기록에는 당신이 직접 적은 세부 메모가 비공개 난에 보존됩니다.
아직 사건은 확정되지 않았지만, 단말기는 당신의 직업과 소지품을 기준으로 가장 낮은 공개 등급의 기록을 하나 고릅니다.

화면에는 방금 생성된 이동 기록이 떠 있습니다.

"출발지: 현재 위치
도착지: 미등록
동행자: 1명
비고: 사용자가 아직 이동하지 않음."

기록의 생성 시각은 지금보다 9분 뒤입니다. 지도에는 도착지가 보이지 않지만, 당신의 소지품 중 하나가 아주 짧게 진동합니다.

단말기 하단에 짧은 확인 문구가 떠오릅니다.

"이 기록을 당신의 첫 사건으로 열람합니까?"

[State]
Disclosure Level: PUBLIC
Boundary Stability: 안정
Visible Classification: 개인 기록 오류 / 확인 필요`;

  const raw = `${narrative}

[Choices]
1. "열람한다." 방금 생성된 이동 기록의 원본 로그를 확인한다.
2. "아직 열지 말고 주변부터 보자." 현재 위치의 단서를 찾는다.
3. 먼저 진동한 소지품을 꺼내 확인한다.
4. "내가 왜 여기에 있는지부터 정리하자." 소속과 목적을 더 구체화한다.`;

  return withBriefing({
    narrative,
    choices: [
      { text: "\"열람한다.\" 방금 생성된 이동 기록의 원본 로그를 확인한다." },
      { text: "\"아직 열지 말고 주변부터 보자.\" 현재 위치의 단서를 찾는다." },
      { text: "먼저 진동한 소지품을 꺼내 확인한다." },
      { text: "\"내가 왜 여기에 있는지부터 정리하자.\" 소속과 목적을 더 구체화한다." },
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

당신은 오늘부터 주민 신고와 생활구 기록을 대조하는 민간 조사 보조원으로 배정되었습니다.
선임 조사 보조원 박민재가 출근 확인도 끝나기 전에 당신의 단말기 쪽으로 새 업무를 밀어 넣습니다.

"평범한 민원처럼 보이는데, 자동 분류가 두 번 실패했어.
신고자는 겁먹었고, 생활구 기록은 이상하게 조용해."

단말기에 올라온 신고 내용은 짧습니다.

"어젯밤부터 옆집 아이가 같은 문장을 반복합니다.
그 집에는 아이가 없습니다."

박민재가 당신에게 수화기를 밀어놓고 묻습니다.

"바로 전화할래?
아니면 기록부터 맞춰보고, 사람이 거짓말하는 건지 시스템이 빠뜨린 건지 보겠어?"

[State]
Disclosure Level: PUBLIC
Boundary Stability: 안정
Visible Classification: 주민 신고 / 확인 필요`,
    choices: [
      { text: "\"비슷한 신고가 있었나요?\" 박민재에게 먼저 묻는다." },
      { text: "\"제가 바로 전화해볼게요.\" 신고자에게 연락한다." },
      { text: "\"기록부터 맞춰보죠.\" 옆집 주소의 거주 기록을 조회한다." },
      { text: "\"혼자 가긴 찜찜합니다.\" 현장 동행 요청을 넣는다." },
    ],
    allow_freeform: true,
    raw: `[Scene]
비가 오는 오전 7시 40분.
방벽 내부 제12생활구 민원 접수실에는 젖은 우산 냄새와 오래된 소독약 냄새가 섞여 있습니다.

당신은 오늘부터 주민 신고와 생활구 기록을 대조하는 민간 조사 보조원으로 배정되었습니다.
선임 조사 보조원 박민재가 출근 확인도 끝나기 전에 당신의 단말기 쪽으로 새 업무를 밀어 넣습니다.

"평범한 민원처럼 보이는데, 자동 분류가 두 번 실패했어.
신고자는 겁먹었고, 생활구 기록은 이상하게 조용해."

단말기에 올라온 신고 내용은 짧습니다.

"어젯밤부터 옆집 아이가 같은 문장을 반복합니다.
그 집에는 아이가 없습니다."

박민재가 당신에게 수화기를 밀어놓고 묻습니다.

"바로 전화할래?
아니면 기록부터 맞춰보고, 사람이 거짓말하는 건지 시스템이 빠뜨린 건지 보겠어?"

[State]
Disclosure Level: PUBLIC
Boundary Stability: 안정
Visible Classification: 주민 신고 / 확인 필요

[Choices]
1. "비슷한 신고가 있었나요?" 박민재에게 먼저 묻는다.
2. "제가 바로 전화해볼게요." 신고자에게 연락한다.
3. "기록부터 맞춰보죠." 옆집 주소의 거주 기록을 조회한다.
4. "혼자 가긴 찜찜합니다." 현장 동행 요청을 넣는다.`,
  },
  "KR-INIT-001 잔여 문서 기록 관리자": {
    narrative: `[Scene]
제3기록보존실의 조명은 늘 한 박자 늦게 깜박입니다.
당신은 오늘 폐기 예정 문서 색인을 검수하는 기록 관리자로 배정되어 있습니다.

감독관 오연주가 출입 카드 리더기를 다시 확인하더니, 화면을 당신 쪽으로 돌립니다.

"네 계정으로 복원 요청이 하나 올라왔어.
방금 자리 배정받은 사람이 누를 수 있는 메뉴가 아닌데."

작업 단말기에는 존재하면 안 되는 항목 하나가 내부 검색망에 다시 나타나 있습니다.

KR-INIT-001 / 복원 상태: 부분 성공 / 열람 등급: 불일치

문서 제목 아래에는 제목이 아닌 문장이 적혀 있습니다.

"첫 대응은 실패하지 않았다. 성공했기 때문에 묻혔다."

오연주가 모니터를 끄지 않은 채 당신을 봅니다.

"이거 열면 네 계정에 흔적이 남아.
그래도 직접 볼 거야, 아니면 내가 먼저 권한 쪽을 건드려볼까?"

[State]
Disclosure Level: PUBLIC -> RESTRICTED
Boundary Stability: 안정`,
    choices: [
      { text: "\"권한부터 부탁드립니다.\" 오연주에게 요청자 확인을 열어달라고 한다." },
      { text: "\"흔적 남아도 복원 로그를 먼저 볼게요.\" 로그를 연다." },
      { text: "\"등급이 왜 틀렸는지부터 보죠.\" 열람 등급 사유를 조회한다." },
      { text: "말없이 화면을 캡처하고 접속을 끊을 준비를 한다." },
    ],
    allow_freeform: true,
    raw: `[Scene]
제3기록보존실의 조명은 늘 한 박자 늦게 깜박입니다.
당신은 오늘 폐기 예정 문서 색인을 검수하는 기록 관리자로 배정되어 있습니다.

감독관 오연주가 출입 카드 리더기를 다시 확인하더니, 화면을 당신 쪽으로 돌립니다.

"네 계정으로 복원 요청이 하나 올라왔어.
방금 자리 배정받은 사람이 누를 수 있는 메뉴가 아닌데."

작업 단말기에는 존재하면 안 되는 항목 하나가 내부 검색망에 다시 나타나 있습니다.

KR-INIT-001 / 복원 상태: 부분 성공 / 열람 등급: 불일치

문서 제목 아래에는 제목이 아닌 문장이 적혀 있습니다.

"첫 대응은 실패하지 않았다. 성공했기 때문에 묻혔다."

오연주가 모니터를 끄지 않은 채 당신을 봅니다.

"이거 열면 네 계정에 흔적이 남아.
그래도 직접 볼 거야, 아니면 내가 먼저 권한 쪽을 건드려볼까?"

[State]
Disclosure Level: PUBLIC -> RESTRICTED
Boundary Stability: 안정

[Choices]
1. "권한부터 부탁드립니다." 오연주에게 요청자 확인을 열어달라고 한다.
2. "흔적 남아도 복원 로그를 먼저 볼게요." 로그를 연다.
3. "등급이 왜 틀렸는지부터 보죠." 열람 등급 사유를 조회한다.
4. 말없이 화면을 캡처하고 접속을 끊을 준비를 한다.`,
  },
  "남극 거대공동 현장 파견 계약 분석관": {
    narrative: `[Scene]
극지 현장 파견 대기실에는 창문이 없습니다.
당신은 남극 거대공동 조사 현장으로 배정된 계약 분석관입니다. 공개 임무는 계약서의 위험 조항과 실제 진입 좌표가 맞는지 확인하는 일입니다.

내부 코드명과 원인 항목은 검은 칸으로 가려져 있습니다.

현장 지원 오퍼레이터 임태오가 지도 단말기를 건네며 낮게 말합니다.

"네 장비는 정상인데, 네 경로만 어제부터 세 번 바뀌었어.
문제는 변경 승인자가 없어. 승인란이 그냥 비어 있어."

벽면 스크린에는 남극 조사 지점의 진입 경로가 표시되어 있지만, 지도 오른쪽 아래의 축척이 계속 바뀝니다.
강사는 아무렇지 않게 말합니다.

"현장에서 길이 다르면, 지도보다 길을 믿지 마십시오."

당신의 책상 위 교육 자료 17쪽에는 다른 사람의 필체로 한 줄이 적혀 있습니다.

"세 번째 표지판을 보면 돌아오지 마라."

강사가 당신 쪽으로 고개를 돌립니다.

"어때요. 방금 말한 원칙, 무슨 뜻인지 이해했습니까?
모르겠으면 지금 물어보는 게 낫습니다. 현장에서는 질문할 시간이 없을 수도 있으니까."

[State]
Disclosure Level: RESTRICTED
Boundary Stability: 흔들림
Visible Classification: 남극 거대공동 조사 / 확인 전`,
    choices: [
      { text: "\"무슨 뜻인지 정확히 듣고 싶습니다.\" 강사에게 되묻는다." },
      { text: "\"경로부터 확인하겠습니다.\" 임태오에게 변경 로그를 요청한다." },
      { text: "\"이전 좌표가 남아 있나요?\" 진입 경로의 이전 버전을 조회한다." },
      { text: "말없이 현재 좌표를 사진으로 남기고 두 사람의 반응을 살핀다." },
    ],
    allow_freeform: true,
    raw: `[Scene]
극지 현장 파견 대기실에는 창문이 없습니다.
당신은 남극 거대공동 조사 현장으로 배정된 계약 분석관입니다. 공개 임무는 계약서의 위험 조항과 실제 진입 좌표가 맞는지 확인하는 일입니다.

내부 코드명과 원인 항목은 검은 칸으로 가려져 있습니다.

현장 지원 오퍼레이터 임태오가 지도 단말기를 건네며 낮게 말합니다.

"네 장비는 정상인데, 네 경로만 어제부터 세 번 바뀌었어.
문제는 변경 승인자가 없어. 승인란이 그냥 비어 있어."

벽면 스크린에는 남극 조사 지점의 진입 경로가 표시되어 있지만, 지도 오른쪽 아래의 축척이 계속 바뀝니다.
강사는 아무렇지 않게 말합니다.

"현장에서 길이 다르면, 지도보다 길을 믿지 마십시오."

당신의 책상 위 교육 자료 17쪽에는 다른 사람의 필체로 한 줄이 적혀 있습니다.

"세 번째 표지판을 보면 돌아오지 마라."

강사가 당신 쪽으로 고개를 돌립니다.

"어때요. 방금 말한 원칙, 무슨 뜻인지 이해했습니까?
모르겠으면 지금 물어보는 게 낫습니다. 현장에서는 질문할 시간이 없을 수도 있으니까."

[State]
Disclosure Level: RESTRICTED
Boundary Stability: 흔들림
Visible Classification: 남극 거대공동 조사 / 확인 전

[Choices]
1. "무슨 뜻인지 정확히 듣고 싶습니다." 강사에게 되묻는다.
2. "경로부터 확인하겠습니다." 임태오에게 변경 로그를 요청한다.
3. "이전 좌표가 남아 있나요?" 진입 경로의 이전 버전을 조회한다.
4. 말없이 현재 좌표를 사진으로 남기고 두 사람의 반응을 살핀다.`,
  },
  "소바리 주변부 실종 조사팀 현지 협력자": {
    narrative: `[Scene]
소바리 외곽의 작은 무전소.
낮인데도 산 능선 위에는 별처럼 보이는 빛이 세 개 떠 있습니다.

당신은 실종 조사팀의 현지 협력자로 호출되었습니다.
현지 안내인 나로 노인은 오래된 무전기 옆에서 당신의 장비를 바라보다가, 산 능선 쪽을 가리킵니다.

"저 빛이 세 개로 보이면, 사람을 찾으러 가는 게 아니라 기록을 찾으러 가는 거야."

실종된 조사팀의 마지막 무전이 다시 재생됩니다.

"우리는 아직 출발하지 않았다.
만약 우리가 도착했다고 말하면, 그건 우리가 아니다."

무전 기록의 시간은 내일 오후로 찍혀 있습니다.

나로 노인이 무전기 볼륨을 줄이며 묻습니다.

"그래도 산으로 갈 건가.
아니면 먼저, 저 목소리가 어디서 다시 살아났는지 볼 건가."

[State]
Disclosure Level: PUBLIC
Boundary Stability: 안정`,
    choices: [
      { text: "\"저 빛을 본 사람이 또 있습니까?\" 나로 노인에게 묻는다." },
      { text: "\"좌표부터 찍어두겠습니다.\" 마지막 무전 위치를 지도에 표시한다." },
      { text: "\"그 사람들이 정말 출발했는지부터 보죠.\" 출발 기록을 확인한다." },
      { text: "말없이 무전 원본을 복사하고, 재생 시간을 다시 본다." },
    ],
    allow_freeform: true,
    raw: `[Scene]
소바리 외곽의 작은 무전소.
낮인데도 산 능선 위에는 별처럼 보이는 빛이 세 개 떠 있습니다.

당신은 실종 조사팀의 현지 협력자로 호출되었습니다.
현지 안내인 나로 노인은 오래된 무전기 옆에서 당신의 장비를 바라보다가, 산 능선 쪽을 가리킵니다.

"저 빛이 세 개로 보이면, 사람을 찾으러 가는 게 아니라 기록을 찾으러 가는 거야."

실종된 조사팀의 마지막 무전이 다시 재생됩니다.

"우리는 아직 출발하지 않았다.
만약 우리가 도착했다고 말하면, 그건 우리가 아니다."

무전 기록의 시간은 내일 오후로 찍혀 있습니다.

나로 노인이 무전기 볼륨을 줄이며 묻습니다.

"그래도 산으로 갈 건가.
아니면 먼저, 저 목소리가 어디서 다시 살아났는지 볼 건가."

[State]
Disclosure Level: PUBLIC
Boundary Stability: 안정

[Choices]
1. "저 빛을 본 사람이 또 있습니까?" 나로 노인에게 묻는다.
2. "좌표부터 찍어두겠습니다." 마지막 무전 위치를 지도에 표시한다.
3. "그 사람들이 정말 출발했는지부터 보죠." 출발 기록을 확인한다.
4. 말없이 무전 원본을 복사하고, 재생 시간을 다시 본다.`,
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
    continueFrom?: {
      narrative?: string;
      raw?: string;
    };
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
  const continueFrom = body.continueFrom && typeof body.continueFrom === "object"
    ? {
        narrative: typeof body.continueFrom.narrative === "string" ? body.continueFrom.narrative.slice(0, 8000) : "",
        raw: typeof body.continueFrom.raw === "string" ? body.continueFrom.raw.slice(0, 12000) : "",
      }
    : null;

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const selectedRoute = lastUser && isStarterRouteCommand(lastUser.content)
    ? detectStarterRoute(lastUser.content)
    : null;
  if (lastUser) {
    const check = checkForbidden(lastUser.content);
    if (check.rejected) {
      const reason = language === "en"
        ? "That lies outside human authority."
        : check.reason ?? "그 영역은 인간의 권능이 아닙니다.";
      return NextResponse.json({
        narrative: reason,
        choices: [
          { text: language === "en" ? "\"Then I'll try another way.\" Change the approach." : "\"그럼 다른 방식으로 해볼게요.\" 접근 방식을 바꾼다." },
          { text: language === "en" ? "\"Hold on. I need to read the room first.\" Look around." : "\"잠깐만요. 주변부터 다시 볼게요.\" 지금 보이는 단서를 살핀다." },
          { text: language === "en" ? "\"Give me one second to line this up.\" Review the current situation." : "\"한 번만 정리하고 움직일게요.\" 현재 상황을 다시 맞춰본다." },
        ],
        allow_freeform: true,
        raw: reason,
      });
    }
  }

  if (!continueFrom && language === "ko" && selectedRoute && messages.length <= 3) {
    const opening = STARTER_ROUTE_OPENINGS[selectedRoute];
    if (opening) return NextResponse.json(withSessionPrelude(withBriefing(opening, messages, language), language, selectedRoute));
  }

  if (!continueFrom && language === "ko" && !selectedRoute && messages.length === 1 && lastUser) {
    return NextResponse.json(withSessionPrelude(buildCustomCharacterOpening(lastUser.content), language, lastUser.content));
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
    const sessionAnchor = buildSessionAnchor(messages, language);
    const routePlaybook = buildRoutePlaybook(messages, language);
    const continuityInstructions = sessionAnchor
      ? `

---

${OPENING_FLOW_RULE}

---

${CONVERSATIONAL_PLAY_RULE}

---

${routePlaybook}

---

${SESSION_CONTINUITY_RULE}

${sessionAnchor}`
      : `

---

${OPENING_FLOW_RULE}

---

${CONVERSATIONAL_PLAY_RULE}

---

${routePlaybook}

---

${SESSION_CONTINUITY_RULE}`;
    const contextInstructions = `${languageInstructions}${difficultyInstructions}${continuityInstructions}${memoInstructions}${memoryInstructions}`;
    const baseInstructions = `${INSTRUCTIONS}

---

${MEMORY_CAPTURE_RULE}`;

    const responseInstructions = selectedRoute && !continueFrom
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

    const continuationInstruction = continueFrom
      ? language === "en"
        ? `The previous assistant response was cut off by the output limit. Continue it in a readable way.

Previous cut response:
${continueFrom.raw || continueFrom.narrative}

Rules:
- Return only the repaired continuation segment, not a full restart.
- Begin from the last incomplete sentence or the previous full sentence if needed, so the reader does not see a dangling suffix.
- Do not start with a fragment such as only the remaining syllables of a cut word.
- Preserve the same scene, NPCs, clues, and tone.
- If [Choices] were missing or cut, include complete [Choices] at the end.`
        : `이전 AI-GM 응답이 출력 제한으로 중간에 잘렸습니다. 읽기 좋게 이어서 생성하세요.

잘린 이전 응답:
${continueFrom.raw || continueFrom.narrative}

규칙:
- 전체 장면을 처음부터 다시 시작하지 말고, 읽기 좋은 이어쓰기 구간만 반환합니다.
- 마지막 미완성 문장 또는 필요하면 그 직전 완성 문장부터 다시 시작해 문맥이 자연스럽게 이어지게 합니다.
- 잘린 글자의 나머지 조각만, 예를 들어 "우하사..."처럼 시작하지 않습니다.
- 같은 장면, 인물, 단서, 말투를 유지합니다.
- [Choices]가 없거나 잘렸다면 마지막에 완성된 [Choices]를 포함합니다.`
      : "";

    const responseInput = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
    if (continuationInstruction) {
      responseInput.push({
        role: "user",
        content: continuationInstruction,
      });
    }
    const responseOptions = {
      model: selectedModel,
      instructions: continueFrom
        ? `${responseInstructions}

---

Continuation Mode:
The next answer is a readable continuation of a truncated assistant response. It should be useful as a separate message placed below the cut text.`
        : responseInstructions,
      max_output_tokens: continueFrom
        ? Math.min(MAX_OUTPUT_TOKENS, Math.max(1600, maxOutputTokens + 800))
        : maxOutputTokens,
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
    const gameResponse = withBriefing(parsed, messages, language);
    gameResponse.truncated = isOpenAIOutputTruncated(response);
    if (continueFrom) {
      gameResponse.continuation = true;
      gameResponse.continuation_of = (continueFrom.narrative || continueFrom.raw).slice(0, 160);
    }
    return NextResponse.json(gameResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : language === "en" ? "Unknown error" : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
