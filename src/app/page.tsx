"use client";

import Image from "next/image";
import { useState, useRef, useEffect, FormEvent } from "react";
import type { ChatMessage, GameResponse } from "@/types/game";

type Turn =
  | { role: "user"; content: string; apiContent?: string; hidden?: boolean }
  | { role: "assistant"; response: GameResponse };

type SessionInfoTab = "memory" | "length" | "difficulty" | "model" | "events" | null;
type EntryStage = "intro" | "boot" | "ready";
type DifficultyMode = "story" | "traveler" | "observed";
type ModelProfile = "default" | "fast" | "deep";
type Language = "ko" | "en";
type MemorySource = "manual" | "auto";
type SummaryMemoryItem = {
  id: string;
  text: string;
  source: MemorySource;
  createdAt?: string;
  updatedAt?: string;
};
type EventLogItem = {
  id: string;
  title: string;
  detail: string;
  sceneTime?: string;
  turn?: number;
  tags: string[];
  createdAt: string;
};
type SceneImageMatch = {
  src: string;
  title: string;
  detail: string;
};
type SceneImageRule = SceneImageMatch & {
  pattern: RegExp;
};

const TOKEN_MIN = 800;
const TOKEN_MAX = 4000;
const TOKEN_STEP = 100;
const DEFAULT_OUTPUT_TOKENS = 800;
const PLAYER_MEMO_LIMIT = 300;
const SUMMARY_MEMORY_LIMIT = 100;
const RESPONSE_LENGTH_STORAGE_KEY = "tiu-response-length-budget";
const SUMMARY_MEMORY_STORAGE_KEY = "tiu-summary-memory-stack";
const DIFFICULTY_STORAGE_KEY = "tiu-difficulty-mode";
const MODEL_PROFILE_STORAGE_KEY = "tiu-model-profile";
const EVENT_LOG_STORAGE_KEY = "tiu-event-log";
const LANGUAGE_STORAGE_KEY = "tiu-ui-language";
const ACCESS_ENDPOINT = "/api/access";
const SESSION_STATE_ENDPOINT = "/api/session-state";
const BOOT_DURATION_MS = 2600;
const EVENT_LOG_LIMIT = 60;

const SESSION_TITLE = "WORLD SESSION : Alpha 1.0v";

const BOOT_STEPS: Record<Language, string[]> = {
  ko: [
    "접속 권한 확인",
    "세계관 색인 연결",
    "장기 기억 채널 동기화",
    "2032년 1월 좌표 고정",
    "월드 세션 개방",
  ],
  en: [
    "Verifying access",
    "Linking world index",
    "Syncing long-term memory channel",
    "Locking coordinates: January 2032",
    "Opening world session",
  ],
};

const UPDATE_NOTES: Record<Language, string[]> = {
  ko: [
    "세계관 대한민국 세부 설정 추가 26.05.03",
    "상황 이미지 피드 및 사건 기록 UI 추가 26.05.03",
    "모델 프로필 선택 탭 추가 26.05.03",
  ],
  en: [
    "Korea regional setting details added 26.05.03",
    "Scene visual feed and event log UI added 26.05.03",
    "Model profile selector added 26.05.03",
  ],
};

const UI_TEXT = {
  ko: {
    sessionEntry: "SESSION ENTRY",
    introTitle: SESSION_TITLE,
    introParagraphs: [
      "신화, 음모론, 국가와 세력, 설명되지 않는 존재들이 한 좌표에서 겹쳐집니다. 당신은 아직 이름 없는 접속자로 이 세계의 첫 신호를 붙잡습니다.",
      "기록은 완전하지 않고, 목격담은 서로 다른 진실을 가리킵니다. 어떤 이름으로 깨어날지, 무엇을 믿고 따라갈지는 당신의 선택입니다.",
    ],
    bootButton: "세션 부팅",
    syncTitle: "AI-GM 신호 동기화 중",
    sceneCalc: "장면 계산",
    clueAlign: "단서 정렬",
    accessCheck: "TIU SESSION CHECK",
    accessPassword: "테스트 접속 비밀번호",
    accessButton: "접속",
    accessChecking: "확인 중",
    accessDefaultError: "접속 확인에 실패했습니다.",
    worldSession: "WORLD SESSION",
    tabs: {
      memory: "요약 메모리",
      memoryEmpty: "장기 기억 비어 있음",
      memoryCount: (count: number) => `${count}개 저장됨`,
      events: "사건 기록",
      eventsEmpty: "아직 기록 없음",
      eventsCount: (count: number) => `${count}개 누적`,
      length: "응답 길이",
    },
    memory: {
      addTitle: "기억 추가",
      placeholder: "장기 기억으로 남길 단서, 관계, 약속, 설정을 100자 안에 적어주세요.",
      add: "추가",
      empty: "아직 저장된 요약 메모리가 없습니다.",
      auto: "AI",
      manual: "수동",
      delete: "삭제",
    },
    model: {
      fallbackNote: "비어 있는 모델 프로필은 서버에서 기본 모델로 자동 대체됩니다. Claude 연결은 이후 provider 라우트를 추가하면 같은 탭 안에 붙일 수 있습니다.",
    },
    events: {
      title: "사건 기록",
      auto: "자동 누적",
      clear: "전체 삭제",
      empty: "아직 기록된 사건이 없습니다. 장면이 진행되면 자동으로 쌓입니다.",
      fallbackDetail: "세부 정보 미확인",
      delete: "삭제",
    },
    briefing: {
      title: "상황 브리핑",
      time: "시점",
      status: "상태",
      emotion: "감정",
      thought: "생각",
      noThought: "다음엔 뭘 해야 하지...",
      money: "소지금",
      inventory: "소지품",
      unknown: "미확인",
      groups: "집단",
      noGroups: "아직 드러난 집단 없음",
      people: "인물",
      noPeople: "아직 주요 인물 없음",
      emotionPrefix: "감정",
      logs: "로그 체크",
    },
    length: {
      title: "최대 출력량 조절",
      description: "기본 분량을 넘기면 100토큰 구간 단위로 더 긴 답변을 허용합니다.",
      extraArea: "추가 구간",
      extraSteps: (count: number) => count > 0 ? `추가 100토큰 구간 ${count}개` : "기본 제공 분량",
      basic: "기본",
      max: "MAX",
      decrease: "응답 길이 줄이기",
      slider: "응답 길이 조절",
      increase: "응답 길이 늘리기",
    },
    start: {
      title: "2032년 1월, 세계에 진입합니다",
      body: "이곳은 신화, 음모론, 여러 국가와 세력, 그리고 설명되지 않는 존재들이 뒤섞인 세계입니다. 당신은 이 세계에서 눈을 뜹니다. 당신은 어떤 사람인가요?",
      routeTitle: "시작 루트",
      characterTitle: "캐릭터 만들기",
      characterHelp: "이름 / 나이 / 직업(소속 등) / 소지품 / 소지금 순서로 만들 수 있습니다. 비워둔 항목은 AI가 세계관에 맞게 임시 배정하고, 이후 플레이 중 수정할 수 있습니다.",
      inputPlaceholder: "이름 / 나이 / 직업(소속) / 소지품 / 소지금",
    },
    bottom: {
      ai: "AI",
      memo: "메모",
      playerMemo: "플레이어 메모",
      memoPlaceholder: "짧은 단서, 의심, 지금 확인할 일을 적어두세요. 관련 장면에서 AI가 참조합니다.",
      send: "전송",
      scrollBottom: "맨 아래",
      scrollBottomLabel: "채팅 맨 아래로 이동",
      aiLabel: "AI 추천 답변",
    },
  },
  en: {
    sessionEntry: "SESSION ENTRY",
    introTitle: SESSION_TITLE,
    introParagraphs: [
      "Myths, conspiracy theories, nations, factions, and unexplained entities overlap on a single coordinate. You catch the first signal of this world as an unnamed access point.",
      "The records are incomplete, and every sighting points to a different truth. The name you wake with, and what you choose to believe, are yours to decide.",
    ],
    bootButton: "Boot Session",
    syncTitle: "Syncing AI-GM signal",
    sceneCalc: "Scene compute",
    clueAlign: "Clue alignment",
    accessCheck: "TIU SESSION CHECK",
    accessPassword: "Test Access Password",
    accessButton: "Enter",
    accessChecking: "Checking",
    accessDefaultError: "Access check failed.",
    worldSession: "WORLD SESSION",
    tabs: {
      memory: "Summary Memory",
      memoryEmpty: "No long-term memory",
      memoryCount: (count: number) => `${count} saved`,
      events: "Event Log",
      eventsEmpty: "No events yet",
      eventsCount: (count: number) => `${count} logged`,
      length: "Response Length",
    },
    memory: {
      addTitle: "Add Memory",
      placeholder: "Save a clue, relationship, promise, or setting detail in 100 characters.",
      add: "Add",
      empty: "No summary memory saved yet.",
      auto: "AI",
      manual: "Manual",
      delete: "Delete",
    },
    model: {
      fallbackNote: "Empty model profiles automatically fall back to the default server model. Claude can be added later through the same tab after a provider route is added.",
    },
    events: {
      title: "Event Log",
      auto: "Auto tracked",
      clear: "Clear All",
      empty: "No events have been logged yet. Scenes will add records automatically.",
      fallbackDetail: "No details confirmed",
      delete: "Delete",
    },
    briefing: {
      title: "Situation Briefing",
      time: "Time",
      status: "Status",
      emotion: "Emotion",
      thought: "Thought",
      noThought: "What should I do next...",
      money: "Funds",
      inventory: "Inventory",
      unknown: "Unknown",
      groups: "Groups",
      noGroups: "No revealed groups yet",
      people: "People",
      noPeople: "No key people yet",
      emotionPrefix: "Emotion",
      logs: "Log Check",
    },
    length: {
      title: "Maximum Output Control",
      description: "Allow longer replies in 100-token steps beyond the base length.",
      extraArea: "Extra Steps",
      extraSteps: (count: number) => count > 0 ? `${count} extra 100-token step(s)` : "Base response length",
      basic: "Base",
      max: "MAX",
      decrease: "Decrease response length",
      slider: "Adjust response length",
      increase: "Increase response length",
    },
    start: {
      title: "January 2032. Enter the world.",
      body: "This is a world where myths, conspiracy theories, nations, factions, and unexplained entities are tangled together. You wake inside it. Who are you?",
      routeTitle: "Starting Routes",
      characterTitle: "Create Character",
      characterHelp: "Use Name / Age / Occupation or Affiliation / Items / Funds. If you leave fields blank, the AI will assign temporary world-appropriate defaults that can be changed later.",
      inputPlaceholder: "Name / Age / Occupation / Items / Funds",
    },
    bottom: {
      ai: "AI",
      memo: "Memo",
      playerMemo: "Player Memo",
      memoPlaceholder: "Write short clues, doubts, or things to check. The AI can reference them when relevant.",
      send: "Send",
      scrollBottom: "Bottom",
      scrollBottomLabel: "Jump to latest chat",
      aiLabel: "AI suggested replies",
    },
  },
} as const;

const ASSET_BASE = "/assets/tiu";
const INTRO_ASSET_BASE = "/assets/intro";

const STARTER_ROUTES = [
  {
    title: "한국 방벽 내부",
    role: "민간 조사 보조원",
    tone: "생활 / 봉쇄 / 주민 신고",
    guide: "주민 신고와 생활구 기록을 대조하며, 평범한 민원 뒤에 숨은 첫 균열을 찾습니다.",
    objective: "첫 목표: 신고자의 말과 실제 거주 기록이 맞는지 확인하기.",
    prompt: "START_ROUTE:KR_BARRIER_CIVIL_ASSISTANT",
    accent: "bg-cyan-400",
    cardClass: "border-cyan-500/35 bg-cyan-950/10 hover:border-cyan-400/70 hover:bg-cyan-950/25",
    titleClass: "text-cyan-100",
    image: `${ASSET_BASE}/korea-barrier.webp`,
    signal: "COASTAL DEFENSE BARRIER",
  },
  {
    title: "KR-INIT-001",
    role: "잔여 문서 기록 관리자",
    tone: "문서 / 삭제 로그 / 은폐",
    guide: "삭제된 문서, 복원 로그, 열람 등급 불일치를 추적하는 기록 중심 플레이입니다.",
    objective: "첫 목표: KR-INIT-001이 왜 다시 나타났는지 원본 흔적 찾기.",
    prompt: "START_ROUTE:KR_INIT_001_RECORDS",
    accent: "bg-amber-400",
    cardClass: "border-amber-500/35 bg-amber-950/10 hover:border-amber-400/70 hover:bg-amber-950/25",
    titleClass: "text-amber-100",
    image: `${ASSET_BASE}/dprk-cctv-03.webp`,
    signal: "ORACLE NODE-04",
  },
  {
    title: "L3 현장 파견",
    role: "계약 분석관",
    tone: "현장 / 지도 오류 / 격리",
    guide: "현장 파견 중 지도와 현실이 어긋나는 지점을 따라가며 생존과 판단을 병행합니다.",
    objective: "첫 목표: L3 진입 경로에서 무엇이 실제로 바뀌었는지 확인하기.",
    prompt: "START_ROUTE:L3_FIELD_ANALYST",
    accent: "bg-violet-400",
    cardClass: "border-violet-500/35 bg-violet-950/10 hover:border-violet-400/70 hover:bg-violet-950/25",
    titleClass: "text-violet-100",
    image: `${ASSET_BASE}/antarctic-gate.webp`,
    signal: "L3 FIELD ANOMALY",
  },
] as const;

const CHARACTER_EXAMPLES = [
  "이름: 정아랑 / 나이: 29 / 직업(소속): 마이더스손 괴담 조사 기자 / 소지품: 녹음기, 취재수첩, 방수 손전등 / 소지금: 86,000원",
  "이름: 강지훈 / 나이: 34 / 직업(소속): 폐기 문서 검수 계약직 / 소지품: 임시 출입증, 보조 배터리, 낡은 USB / 소지금: 42,000원",
  "이름: 한유진 / 나이: 31 / 직업(소속): L3 현장 지원팀 분석관 / 소지품: 지도 단말기, 필름 카메라, 응급 파우치 / 소지금: 120,000원",
] as const;

const CHARACTER_EXAMPLES_EN = [
  "Name: Arang Jung / Age: 29 / Occupation: Midas-Hand urban legend reporter / Items: recorder, field notebook, waterproof flashlight / Funds: 86,000 KRW",
  "Name: Jihoon Kang / Age: 34 / Occupation: Contract archive disposal reviewer / Items: temporary pass, power bank, old USB drive / Funds: 42,000 KRW",
  "Name: Yujin Han / Age: 31 / Occupation: L3 field support analyst / Items: map terminal, film camera, emergency pouch / Funds: 120,000 KRW",
] as const;

const STARTER_ROUTE_EN: Record<string, {
  title: string;
  role: string;
  tone: string;
  guide: string;
  objective: string;
}> = {
  "START_ROUTE:KR_BARRIER_CIVIL_ASSISTANT": {
    title: "Inside the Korean Barrier",
    role: "Civil Investigation Aide",
    tone: "Daily life / lockdown / resident report",
    guide: "Compare resident reports with living-zone records and find the first fracture hidden behind an ordinary complaint.",
    objective: "First objective: confirm whether the caller's statement matches the actual residence records.",
  },
  "START_ROUTE:KR_INIT_001_RECORDS": {
    title: "KR-INIT-001",
    role: "Residual Records Keeper",
    tone: "Documents / deletion logs / concealment",
    guide: "Follow deleted documents, restoration logs, and clearance mismatches in a record-centered route.",
    objective: "First objective: find why KR-INIT-001 reappeared and trace the original source.",
  },
  "START_ROUTE:L3_FIELD_ANALYST": {
    title: "L3 Field Dispatch",
    role: "Contract Analyst",
    tone: "Field work / map errors / quarantine",
    guide: "Track the point where map and reality diverge while balancing survival and judgment.",
    objective: "First objective: identify what truly changed on the L3 entry route.",
  },
};

const DIFFICULTY_OPTIONS: Array<{
  id: DifficultyMode;
  title: string;
  summary: string;
  tone: string;
  className: string;
}> = [
  {
    id: "story",
    title: "스토리 모드",
    summary: "세계관 탐험 중심",
    tone: "위기는 분위기로 남고, 대부분의 문제는 쉽게 풀립니다.",
    className: "border-emerald-500/35 bg-emerald-950/10 hover:border-emerald-400/70",
  },
  {
    id: "traveler",
    title: "여행자 모드",
    summary: "현재 기본 진행",
    tone: "플레이어의 선택 성향에 맞춰 단서와 위험이 균형 있게 움직입니다.",
    className: "border-cyan-500/35 bg-cyan-950/10 hover:border-cyan-400/70",
  },
  {
    id: "observed",
    title: "관측되고 있음",
    summary: "고난도 관측 압력",
    tone: "선택의 대가가 커지고, 정보 은폐와 문제 전개가 더 까다로워집니다.",
    className: "border-red-500/35 bg-red-950/10 hover:border-red-400/70",
  },
] as const;

const DIFFICULTY_TEXT_EN: Record<DifficultyMode, { title: string; summary: string; tone: string }> = {
  story: {
    title: "Story Mode",
    summary: "World exploration first",
    tone: "Threats remain atmospheric, and most problems resolve easily.",
  },
  traveler: {
    title: "Traveler Mode",
    summary: "Balanced default",
    tone: "Clues and danger respond to the player's current play style.",
  },
  observed: {
    title: "Being Observed",
    summary: "High-pressure mode",
    tone: "Choices carry higher costs, with more concealment and difficult developments.",
  },
};

const MODEL_PROFILE_OPTIONS: Array<{
  id: ModelProfile;
  title: string;
  summary: string;
  detail: string;
  envKey: string;
}> = [
  {
    id: "default",
    title: "기본 모델",
    summary: "현재 세션 기본",
    detail: "균형 잡힌 진행용입니다. 서버의 OPENAI_MODEL 값을 사용합니다.",
    envKey: "OPENAI_MODEL",
  },
  {
    id: "fast",
    title: "빠른 모델",
    summary: "테스트 속도 우선",
    detail: "짧은 테스트와 반복 플레이용입니다. OPENAI_FAST_MODEL 값이 있으면 사용합니다.",
    envKey: "OPENAI_FAST_MODEL",
  },
  {
    id: "deep",
    title: "심층 모델",
    summary: "복잡한 추론 우선",
    detail: "음모, 기록 대조, 장기 맥락이 많은 장면용입니다. OPENAI_DEEP_MODEL 값이 있으면 사용합니다.",
    envKey: "OPENAI_DEEP_MODEL",
  },
] as const;

const MODEL_PROFILE_TEXT_EN: Record<ModelProfile, { title: string; summary: string; detail: string }> = {
  default: {
    title: "Default Model",
    summary: "Current session default",
    detail: "Balanced play. Uses the server OPENAI_MODEL value.",
  },
  fast: {
    title: "Fast Model",
    summary: "Speed for testing",
    detail: "Useful for short tests and repeated play. Uses OPENAI_FAST_MODEL when set.",
  },
  deep: {
    title: "Deep Model",
    summary: "Complex reasoning",
    detail: "For conspiracies, record comparison, and long-context scenes. Uses OPENAI_DEEP_MODEL when set.",
  },
};

const SUGGESTION_STYLES = [
  {
    button: "border-cyan-500/35 bg-cyan-950/10 hover:border-cyan-400/70 hover:bg-cyan-950/25",
    marker: "text-cyan-300",
  },
  {
    button: "border-amber-500/35 bg-amber-950/10 hover:border-amber-400/70 hover:bg-amber-950/25",
    marker: "text-amber-300",
  },
  {
    button: "border-violet-500/35 bg-violet-950/10 hover:border-violet-400/70 hover:bg-violet-950/25",
    marker: "text-violet-300",
  },
  {
    button: "border-emerald-500/35 bg-emerald-950/10 hover:border-emerald-400/70 hover:bg-emerald-950/25",
    marker: "text-emerald-300",
  },
] as const;

const SCENE_IMAGE_RULES: SceneImageRule[] = [
  {
    pattern: /세라프|seraph|absolution|perception/i,
    src: `${ASSET_BASE}/seraph-absolution.webp`,
    title: "SERAPH PROTOCOL",
    detail: "설명되지 않는 고에너지 존재 반응",
  },
  {
    pattern: /관측자|observer|설명되지 않는 존재|non-human entity|unknown entity/i,
    src: `${ASSET_BASE}/observer-sighting.webp`,
    title: "OBSERVER SIGHTING",
    detail: "분류 불가 관측 기록",
  },
  {
    pattern: /남극|antarctic|게이트|빙하|크레바스|L3|현장 파견/i,
    src: `${ASSET_BASE}/antarctic-gate.webp`,
    title: "ANTARCTIC GATE",
    detail: "L3 현장 이상 좌표",
  },
  {
    pattern: /한국 방벽|방벽|coastal defense|생활구|봉쇄/i,
    src: `${ASSET_BASE}/korea-barrier.webp`,
    title: "KOREA BARRIER",
    detail: "한국 방벽 내부 권역",
  },
  {
    pattern: /KR-?INIT|기록보존|잔여 문서|복원 로그|열람 등급|색인|oracle node|오라클 노드/i,
    src: `${ASSET_BASE}/dprk-cctv-03.webp`,
    title: "ORACLE NODE-04",
    detail: "불안정한 기록 감시 피드",
  },
  {
    pattern: /필라델피아|philadelphia|브리치|breach|quarantine failure/i,
    src: `${ASSET_BASE}/philadelphia-breach.webp`,
    title: "PHILADELPHIA BREACH",
    detail: "격리 실패 도시 기록",
  },
  {
    pattern: /ashfall|애쉬폴|생체 건물|biomass|도시 기능 붕괴/i,
    src: `${ASSET_BASE}/ashfall-city.webp`,
    title: "ASHFALL CITY",
    detail: "생체 구조물 침식 구역",
  },
  {
    pattern: /seed spreader|시드 스프레더|포자 살포|대기 포자|spore dispersal/i,
    src: `${ASSET_BASE}/seed-spreader.webp`,
    title: "SEED SPREADER",
    detail: "대기 포자 살포 개체",
  },
  {
    pattern: /brood drone|브루드|드론 발달|brood/i,
    src: `${ASSET_BASE}/brood-drone-closeup.webp`,
    title: "BROOD DRONE",
    detail: "감염 개체 근접 기록",
  },
  {
    pattern: /감염|숙주|전이|포자|infected|infection|TS-?Ω|TS-오메가/i,
    src: `${ASSET_BASE}/philadelphia-infected.webp`,
    title: "INFECTION SITE",
    detail: "감염 확산 관측 기록",
  },
  {
    pattern: /소바리|silent wolves|wolf|wolves|무전|마지막 무전/i,
    src: `${ASSET_BASE}/silent-wolves-raid.webp`,
    title: "SILENT WOLVES",
    detail: "주변부 교전 기록",
  },
];

function normalizeTokenValue(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_OUTPUT_TOKENS;
  const stepped = Math.round(value / TOKEN_STEP) * TOKEN_STEP;
  return Math.min(TOKEN_MAX, Math.max(TOKEN_MIN, stepped));
}

function responseLengthLabel(value: number, language: Language = "ko"): string {
  if (language === "en") {
    if (value <= 800) return "Base";
    if (value <= 1200) return "Longer";
    if (value <= 2000) return "Long";
    if (value <= 3000) return "Detailed";
    return "Maximum";
  }

  if (value <= 800) return "기본";
  if (value <= 1200) return "조금 길게";
  if (value <= 2000) return "길게";
  if (value <= 3000) return "상세";
  return "최대";
}

function responseMultiplier(value: number): string {
  const multiplier = value / DEFAULT_OUTPUT_TOKENS;
  return Number.isInteger(multiplier) ? `${multiplier}x` : `${multiplier.toFixed(1)}x`;
}

function normalizeDifficulty(value: string | null): DifficultyMode {
  if (value === "story" || value === "observed") return value;
  return "traveler";
}

function normalizeModelProfile(value: string | null): ModelProfile {
  if (value === "fast" || value === "deep") return value;
  return "default";
}

function normalizeLanguage(value: string | null): Language {
  return value === "en" ? "en" : "ko";
}

function getStarterRouteText(route: (typeof STARTER_ROUTES)[number], language: Language) {
  if (language === "ko") return route;
  return { ...route, ...(STARTER_ROUTE_EN[route.prompt] ?? {}) };
}

function getDifficultyOptionText(option: (typeof DIFFICULTY_OPTIONS)[number], language: Language) {
  if (language === "ko") return option;
  return { ...option, ...DIFFICULTY_TEXT_EN[option.id] };
}

function getModelProfileText(option: (typeof MODEL_PROFILE_OPTIONS)[number], language: Language) {
  if (language === "ko") return option;
  return { ...option, ...MODEL_PROFILE_TEXT_EN[option.id] };
}

function createMemoryId(): string {
  return `memory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEventLogId(): string {
  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createMemoryItem(text: string, source: MemorySource): SummaryMemoryItem {
  const now = new Date().toISOString();
  return {
    id: createMemoryId(),
    text: text.trim().slice(0, SUMMARY_MEMORY_LIMIT),
    source,
    createdAt: now,
    updatedAt: now,
  };
}

function splitMemoryText(text: string): SummaryMemoryItem[] {
  const normalized = text.trim();
  if (!normalized) return [];

  return normalized
    .split(/\r?\n+/)
    .flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed) return [];
      const chunks: SummaryMemoryItem[] = [];
      for (let index = 0; index < trimmed.length; index += SUMMARY_MEMORY_LIMIT) {
        chunks.push(createMemoryItem(trimmed.slice(index, index + SUMMARY_MEMORY_LIMIT), "manual"));
      }
      return chunks;
    });
}

function parseSavedMemoryItems(saved: string | null, legacy: string | null): SummaryMemoryItem[] {
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item): SummaryMemoryItem | null => {
            if (typeof item === "string") {
              const text = item.trim().slice(0, SUMMARY_MEMORY_LIMIT);
              return text ? createMemoryItem(text, "manual") : null;
            }
            if (item && typeof item === "object" && "text" in item) {
              const record = item as Record<string, unknown>;
              const text = String(record.text).trim().slice(0, SUMMARY_MEMORY_LIMIT);
              const source = record.source === "auto" ? "auto" : "manual";
              const now = new Date().toISOString();
              return text
                ? {
                    id: typeof record.id === "string" ? record.id : createMemoryId(),
                    text,
                    source,
                    createdAt: typeof record.createdAt === "string" ? record.createdAt : now,
                    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : now,
                  }
                : null;
            }
            return null;
          })
          .filter((item): item is SummaryMemoryItem => item !== null);
      }
    } catch {
      return splitMemoryText(saved);
    }
  }

  return splitMemoryText(legacy ?? "");
}

function mergeMemoryItems(
  current: SummaryMemoryItem[],
  additions: string[],
  source: MemorySource,
): SummaryMemoryItem[] {
  const existing = new Set(current.map((item) => item.text.trim()));
  const next = [...current];

  for (const addition of additions) {
    const text = addition.trim().slice(0, SUMMARY_MEMORY_LIMIT);
    if (!text || existing.has(text)) continue;
    existing.add(text);
    next.push(createMemoryItem(text, source));
  }

  return next;
}

function normalizeEventLogItem(item: unknown): EventLogItem | null {
  if (!item || typeof item !== "object" || !("title" in item)) return null;

  const record = item as Record<string, unknown>;
  const title = String(record.title ?? "").trim().slice(0, 80);
  const detail = String(record.detail ?? "").trim().slice(0, 160);
  if (!title) return null;

  const tags = Array.isArray(record.tags)
    ? record.tags
        .map((tag) => String(tag).trim().slice(0, 24))
        .filter(Boolean)
        .slice(0, 5)
    : [];

  return {
    id: typeof record.id === "string" ? record.id : createEventLogId(),
    title,
    detail,
    sceneTime: typeof record.sceneTime === "string" ? record.sceneTime.slice(0, 40) : undefined,
    turn: typeof record.turn === "number" && Number.isFinite(record.turn) ? record.turn : undefined,
    tags,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
  };
}

function parseSavedEventLogItems(saved: string | null): EventLogItem[] {
  if (!saved) return [];

  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeEventLogItem)
      .filter((item): item is EventLogItem => item !== null)
      .slice(0, EVENT_LOG_LIMIT);
  } catch {
    return [];
  }
}

function firstNarrativeLine(text: string): string {
  return text
    .replace(/^\s*\[Scene\]\s*/i, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 80) ?? "";
}

function translateBriefingValue(value: string, language: Language): string {
  if (language === "ko") return value;

  const map: Record<string, string> = {
    양호: "Stable",
    부상: "Injured",
    출혈: "Bleeding",
    주의: "Caution",
    긴장: "Tense",
    집중: "Focused",
    평온: "Calm",
    분노: "Anger",
    슬픔: "Grief",
    공포: "Fear",
    미확인: "Unknown",
  };

  return map[value] ?? value;
}

function buildEventLogItem(response: GameResponse, turn: number, language: Language): EventLogItem | null {
  if (/^\s*\[오류\]/.test(response.narrative)) return null;

  const briefing = response.briefing;
  const title =
    briefing?.logs
      .find((log) => log.startsWith("현재 장면:"))
      ?.replace("현재 장면:", "")
      .trim()
      .slice(0, 80) ||
    firstNarrativeLine(response.narrative) ||
    (language === "en" ? "New event record" : "새 사건 기록");

  const detail = [
    briefing?.time,
    briefing?.status
      ? `${language === "en" ? "Status" : "상태"} ${translateBriefingValue(briefing.status, language)}`
      : "",
    briefing?.emotion
      ? `${language === "en" ? "Emotion" : "감정"} ${translateBriefingValue(briefing.emotion, language)}`
      : "",
  ]
    .filter(Boolean)
    .join(" / ");

  const tags = Array.from(
    new Set([
      ...(briefing?.groups ?? []).map((group) => group.split(":")[0].trim()),
      briefing?.status ?? "",
    ].filter(Boolean)),
  ).slice(0, 5);

  return {
    id: createEventLogId(),
    title,
    detail,
    sceneTime: briefing?.time,
    turn,
    tags,
    createdAt: new Date().toISOString(),
  };
}

function mergeEventLogItem(current: EventLogItem[], item: EventLogItem | null): EventLogItem[] {
  if (!item) return current;

  const key = `${item.sceneTime ?? ""}::${item.title}`;
  const exists = current.some((entry) => `${entry.sceneTime ?? ""}::${entry.title}` === key);
  if (exists) return current;

  return [item, ...current].slice(0, EVENT_LOG_LIMIT);
}

function sceneImageSource(response: GameResponse): string {
  return [
    response.narrative,
    response.raw,
    response.briefing?.groups.join("\n") ?? "",
    response.briefing?.logs.join("\n") ?? "",
    response.briefing?.people.map((person) => `${person.name} ${person.detail}`).join("\n") ?? "",
  ].join("\n");
}

function pickSceneImage(response: GameResponse): SceneImageMatch | null {
  if (/^\s*\[오류\]/.test(response.narrative)) return null;

  const source = sceneImageSource(response);
  const match = SCENE_IMAGE_RULES.find((rule) => rule.pattern.test(source));
  if (!match) return null;

  return {
    src: match.src,
    title: match.title,
    detail: match.detail,
  };
}

function BriefingList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) {
    return <span className="text-zinc-500">{empty}</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="rounded border border-zinc-800 bg-zinc-900/70 px-2 py-1 text-zinc-300"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function BriefingPanel({
  briefing,
  labels,
  language,
}: {
  briefing: NonNullable<GameResponse["briefing"]>;
  labels: (typeof UI_TEXT)[Language]["briefing"];
  language: Language;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/70 text-xs">
      <div className="border-b border-zinc-800 px-3 py-2 font-medium text-zinc-200">
        {labels.title}
      </div>

      <div className="grid gap-2 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded border border-zinc-900 bg-zinc-900/45 px-3 py-2">
            <span className="mr-2 text-zinc-500">{labels.time}</span>
            <span className="text-zinc-200">{briefing.time}</span>
          </div>
          <div className="rounded border border-zinc-900 bg-zinc-900/45 px-3 py-2">
            <span className="mr-2 text-zinc-500">{labels.status}</span>
            <span className="text-amber-200">{translateBriefingValue(briefing.status, language)}</span>
          </div>
          <div className="rounded border border-zinc-900 bg-zinc-900/45 px-3 py-2">
            <span className="mr-2 text-zinc-500">{labels.emotion}</span>
            <span className="text-violet-200">{translateBriefingValue(briefing.emotion, language)}</span>
          </div>
        </div>

        <div className="rounded border border-blue-900/40 bg-blue-950/15 px-3 py-2">
          <div className="mb-1 text-[11px] font-medium text-blue-200">{labels.thought}</div>
          <div className="space-y-1 text-sm leading-relaxed text-zinc-200">
            {briefing.goals.length === 0 ? (
              <p className="text-zinc-500">{labels.noThought}</p>
            ) : (
              briefing.goals.map((goal) => <p key={goal}>{goal}</p>)
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded border border-zinc-900 bg-zinc-900/35 px-3 py-2">
            <div className="mb-1 text-[11px] font-medium text-zinc-400">{labels.money}</div>
            <span className="text-emerald-200">{translateBriefingValue(briefing.money, language)}</span>
          </div>
          <div className="rounded border border-zinc-900 bg-zinc-900/35 px-3 py-2">
            <div className="mb-1 text-[11px] font-medium text-zinc-400">{labels.inventory}</div>
            <BriefingList items={briefing.inventory} empty={labels.unknown} />
          </div>
        </div>

        <details className="rounded border border-zinc-900 bg-zinc-900/35 px-3 py-2">
          <summary className="cursor-pointer select-none font-medium text-zinc-300">
            {labels.groups}
          </summary>
          <div className="mt-2">
            <BriefingList items={briefing.groups} empty={labels.noGroups} />
          </div>
        </details>

        <details className="rounded border border-zinc-900 bg-zinc-900/35 px-3 py-2">
          <summary className="cursor-pointer select-none font-medium text-zinc-300">
            {labels.people}
          </summary>
          <div className="mt-2 space-y-1.5">
            {briefing.people.length === 0 ? (
              <span className="text-zinc-500">{labels.noPeople}</span>
            ) : (
              briefing.people.map((person) => (
                <div
                  key={`${person.name}-${person.emotion}-${person.detail}`}
                  className="rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1.5 text-zinc-300"
                >
                  <span className="font-medium text-zinc-100">{person.name}</span>
                  <span className="mx-2 text-zinc-600">|</span>
                  <span className="text-violet-200">
                    {labels.emotionPrefix}: {translateBriefingValue(person.emotion, language)}
                  </span>
                  {person.detail && <span className="ml-2 text-zinc-500">{person.detail}</span>}
                </div>
              ))
            )}
          </div>
        </details>

        <details className="rounded border border-zinc-900 bg-zinc-900/35 px-3 py-2">
          <summary className="cursor-pointer select-none font-medium text-zinc-300">
            {labels.logs}
          </summary>
          <div className="mt-2 space-y-1 text-zinc-500">
            {briefing.logs.map((log) => (
              <div key={log}>{log}</div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}

function SceneImageCard({ image }: { image: SceneImageMatch }) {
  return (
    <figure className="overflow-hidden rounded-md border border-zinc-800 bg-black">
      <div className="relative h-44 sm:h-56">
        <Image
          src={image.src}
          alt=""
          fill
          className="object-cover opacity-90"
          sizes="(min-width: 640px) 672px, 100vw"
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.72),transparent_56%)]" />
        <div className="tiu-scanline pointer-events-none absolute inset-0" />
        <figcaption className="absolute bottom-3 left-3 right-3">
          <div className="inline-flex border border-cyan-400/40 bg-black/65 px-2 py-1 text-[10px] font-medium tracking-[0.18em] text-cyan-100">
            LIVE VISUAL FEED
          </div>
          <div className="mt-2 text-sm font-semibold text-zinc-100">{image.title}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">{image.detail}</div>
        </figcaption>
      </div>
    </figure>
  );
}

function EventLogPanel({
  eventLogItems,
  loading,
  onDelete,
  onClear,
  labels,
}: {
  eventLogItems: EventLogItem[];
  loading: boolean;
  onDelete: (id: string) => void;
  onClear: () => void;
  labels: (typeof UI_TEXT)[Language]["events"];
}) {
  return (
    <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900/70 p-2">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium text-zinc-200">{labels.title}</span>
        <span className="text-[11px] text-zinc-600">{labels.auto}</span>
        <button
          type="button"
          onClick={onClear}
          disabled={loading || eventLogItems.length === 0}
          className="ml-auto rounded border border-zinc-800 px-2 py-1 text-[11px] text-zinc-400 hover:border-red-500/50 hover:text-red-200 disabled:opacity-40"
        >
          {labels.clear}
        </button>
      </div>

      {eventLogItems.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-800 px-3 py-4 text-center text-xs text-zinc-600">
          {labels.empty}
        </div>
      ) : (
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {eventLogItems.map((item, index) => (
            <div
              key={item.id}
              className="rounded-md border border-zinc-800 bg-zinc-950/80 p-2"
            >
              <div className="mb-1 flex items-start gap-2">
                <span className="rounded bg-emerald-950/50 px-2 py-1 text-[11px] font-medium text-emerald-200">
                  #{eventLogItems.length - index}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-xs font-medium text-zinc-100">
                    {item.title}
                  </div>
                  <div className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                    {item.detail || item.sceneTime || labels.fallbackDetail}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  disabled={loading}
                  className="rounded border border-zinc-800 px-2 py-1 text-[11px] text-zinc-500 hover:border-red-500/50 hover:text-red-200 disabled:opacity-40"
                >
                  {labels.delete}
                </button>
              </div>
              {item.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded border border-zinc-800 bg-zinc-900/80 px-2 py-0.5 text-[10px] text-zinc-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ResponseLengthControl({
  outputTokens,
  loading,
  extraSteps,
  labels,
  language,
  onPreset,
  onAdjust,
  onChange,
}: {
  outputTokens: number;
  loading: boolean;
  extraSteps: number;
  labels: (typeof UI_TEXT)[Language]["length"];
  language: Language;
  onPreset: (value: number) => void;
  onAdjust: (delta: number) => void;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-3">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-zinc-100">{labels.title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          {labels.description}
        </p>
      </div>

      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-red-500/15 text-[10px] font-bold text-red-300">
              MAX
            </span>
            <span className="text-2xl font-semibold text-zinc-100">
              {responseMultiplier(outputTokens)}
            </span>
            <span className="text-base font-medium text-zinc-400">
              {language === "en" ? `(${outputTokens} tokens)` : `(${outputTokens}토큰)`}
            </span>
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {labels.extraSteps(extraSteps)}
          </div>
        </div>
        <div className="rounded border border-amber-500/30 bg-amber-950/20 px-2.5 py-1.5 text-right text-xs text-amber-100">
          <div className="text-zinc-500">{labels.extraArea}</div>
          <div className="font-semibold">
            {language === "en" ? extraSteps : `${extraSteps}개`}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onAdjust(-TOKEN_STEP)}
          disabled={loading || outputTokens <= TOKEN_MIN}
          className="h-7 w-7 rounded border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
          aria-label={labels.decrease}
        >
          -
        </button>
        <input
          type="range"
          min={TOKEN_MIN}
          max={TOKEN_MAX}
          step={TOKEN_STEP}
          value={outputTokens}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={loading}
          className="min-w-0 flex-1 accent-red-400"
          aria-label={labels.slider}
        />
        <button
          type="button"
          onClick={() => onAdjust(TOKEN_STEP)}
          disabled={loading || outputTokens >= TOKEN_MAX}
          className="h-7 w-7 rounded border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
          aria-label={labels.increase}
        >
          +
        </button>
      </div>

      <div className="mt-2 grid grid-cols-4 text-[11px] text-zinc-500">
        <button
          type="button"
          onClick={() => onPreset(800)}
          disabled={loading}
          className="text-left hover:text-zinc-200 disabled:opacity-40"
        >
          {labels.basic}
        </button>
        <button
          type="button"
          onClick={() => onPreset(1200)}
          disabled={loading}
          className="text-center hover:text-zinc-200 disabled:opacity-40"
        >
          1.5x
        </button>
        <button
          type="button"
          onClick={() => onPreset(2400)}
          disabled={loading}
          className="text-center hover:text-zinc-200 disabled:opacity-40"
        >
          3x
        </button>
        <button
          type="button"
          onClick={() => onPreset(4000)}
          disabled={loading}
          className="text-right hover:text-zinc-200 disabled:opacity-40"
        >
          5x
        </button>
      </div>
    </div>
  );
}

function TiuLogoMark({ sessionLabel = "UNIVERSE" }: { sessionLabel?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center bg-emerald-400 text-2xl font-black leading-none text-black shadow-[0_0_18px_rgba(52,211,153,0.32)]"
        style={{
          clipPath:
            "polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)",
        }}
        aria-hidden="true"
      >
        T
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-base font-black tracking-[0.18em] text-zinc-100">
          TURTLE ISLE
        </span>
        <span className="mt-1 text-[10px] font-semibold tracking-[0.34em] text-zinc-500">
          {sessionLabel}
        </span>
      </div>
    </div>
  );
}

function LanguageToggle({
  language,
  onChange,
}: {
  language: Language;
  onChange: (language: Language) => void;
}) {
  return (
    <div className="flex shrink-0 rounded-md border border-zinc-800 bg-zinc-950/80 p-1">
      {(["ko", "en"] as const).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          aria-pressed={language === item}
          className={`rounded px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] transition-colors ${
            language === item
              ? "bg-emerald-400 text-black"
              : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
          }`}
        >
          {item.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function UpdateNotesPanel({ language }: { language: Language }) {
  return (
    <section className="max-w-xl border border-emerald-500/25 bg-black/35 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="h-1.5 w-1.5 bg-emerald-300" />
        <span className="text-[10px] font-semibold tracking-[0.22em] text-emerald-200">
          UPDATE NOTES
        </span>
      </div>
      <div className="space-y-1.5">
        {UPDATE_NOTES[language].map((note) => (
          <div key={note} className="flex gap-2 text-xs leading-relaxed text-zinc-400">
            <span className="mt-1.5 h-1 w-1 shrink-0 bg-zinc-600" />
            <span>{note}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function EntryScreen({
  stage,
  progress,
  bootStep,
  language,
  onLanguageChange,
  onBegin,
}: {
  stage: EntryStage;
  progress: number;
  bootStep: number;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onBegin: () => void;
}) {
  const text = UI_TEXT[language];
  const bootSteps = BOOT_STEPS[language];
  const isBooting = stage === "boot";
  const currentStep = bootSteps[Math.min(bootStep, bootSteps.length - 1)];

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#05070a] px-4 py-5 text-zinc-100 sm:py-8">
      <div className="tiu-grid-bg pointer-events-none absolute inset-0 opacity-40" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(6,182,212,0.14),transparent_34%,rgba(250,204,21,0.08)_64%,transparent)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-cyan-300/50" />
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <LanguageToggle language={language} onChange={onLanguageChange} />
      </div>

      <section className="relative mx-auto grid min-h-[calc(100dvh-2.5rem)] max-w-5xl items-center gap-5 sm:grid-cols-[1.05fr_0.95fr]">
        <div className="order-2 space-y-5 sm:order-1">
          <UpdateNotesPanel language={language} />
          <TiuLogoMark sessionLabel={text.worldSession} />

          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 border border-emerald-500/30 bg-emerald-950/20 px-2.5 py-1 text-[11px] font-medium tracking-[0.16em] text-emerald-200">
              <span className="h-1.5 w-1.5 bg-emerald-300" />
              {text.sessionEntry}
            </div>
            <h1 className="max-w-xl text-3xl font-black leading-tight text-zinc-50 sm:text-5xl">
              {text.introTitle}
            </h1>
            <div className="max-w-xl space-y-2 text-sm leading-relaxed text-zinc-400 sm:text-base">
              {text.introParagraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </div>

          {isBooting ? (
            <div className="max-w-xl border border-zinc-800 bg-black/45 p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-200">{currentStep}</span>
                <span className="text-zinc-500">{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden bg-zinc-900">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-amber-300 transition-[width] duration-100"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-3 grid gap-1 text-[11px] text-zinc-500">
                {bootSteps.map((step, index) => (
                  <div
                    key={step}
                    className={
                      index <= bootStep
                        ? "text-emerald-200"
                        : "text-zinc-600"
                    }
                  >
                    {index <= bootStep ? ">" : "-"} {step}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={onBegin}
              className="inline-flex items-center justify-center border border-emerald-400/70 bg-emerald-400 px-5 py-3 text-sm font-bold text-black shadow-[0_0_20px_rgba(52,211,153,0.22)] transition-colors hover:bg-emerald-300"
            >
              {text.bootButton}
            </button>
          )}
        </div>

        <div className="order-1 sm:order-2">
          <div className="relative min-h-[260px] overflow-hidden border border-zinc-800 bg-black shadow-[0_0_48px_rgba(34,211,238,0.08)] sm:min-h-[420px]">
            <Image
              src={`${INTRO_ASSET_BASE}/world-session-alpha.png`}
              alt=""
              fill
              priority
              className="object-cover opacity-95"
              sizes="(min-width: 640px) 44vw, 100vw"
            />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_42%,rgba(0,0,0,0.48))]" />
            <div className="tiu-scanline pointer-events-none absolute inset-0" />
          </div>
        </div>
      </section>
    </main>
  );
}

function TransmissionLoader({ language }: { language: Language }) {
  const text = UI_TEXT[language];

  return (
    <div className="self-start w-full max-w-sm rounded-md border border-zinc-800 bg-zinc-900/80 px-3.5 py-3 text-xs text-zinc-400">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-zinc-200">{text.syncTitle}</span>
        <span className="text-[10px] tracking-[0.18em] text-emerald-300">BOOT</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden bg-zinc-950">
        <span className="tiu-loading-bar block h-full w-1/2 bg-gradient-to-r from-cyan-400 via-emerald-400 to-amber-300" />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-zinc-500">
        <span>{text.sceneCalc}</span>
        <span>/</span>
        <span>{text.clueAlign}</span>
        <span>/</span>
        <span>{text.bottom.aiLabel}</span>
      </div>
    </div>
  );
}

export default function Home() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showPlayerMemo, setShowPlayerMemo] = useState(false);
  const [showScrollBottomButton, setShowScrollBottomButton] = useState(false);
  const [memo, setMemo] = useState("");
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memoryItems, setMemoryItems] = useState<SummaryMemoryItem[]>([]);
  const [sessionInfoTab, setSessionInfoTab] = useState<SessionInfoTab>(null);
  const [outputTokens, setOutputTokens] = useState(DEFAULT_OUTPUT_TOKENS);
  const [difficultyMode, setDifficultyMode] = useState<DifficultyMode>("traveler");
  const [modelProfile, setModelProfile] = useState<ModelProfile>("default");
  const [language, setLanguage] = useState<Language>("ko");
  const [eventLogItems, setEventLogItems] = useState<EventLogItem[]>([]);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [serverSyncReady, setServerSyncReady] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const [accessRequired, setAccessRequired] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);
  const [accessPassword, setAccessPassword] = useState("");
  const [accessError, setAccessError] = useState("");
  const [accessLoading, setAccessLoading] = useState(false);
  const [entryStage, setEntryStage] = useState<EntryStage>("intro");
  const [bootProgress, setBootProgress] = useState(0);
  const [bootStep, setBootStep] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function hydrateSessionState() {
    await fetch(SESSION_STATE_ENDPOINT)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { memo?: string; memoryItems?: SummaryMemoryItem[]; eventLogItems?: EventLogItem[] } | null) => {
        if (!data) return;
        if (typeof data.memo === "string" && data.memo) {
          setMemo(data.memo.slice(0, PLAYER_MEMO_LIMIT));
        }
        if (Array.isArray(data.memoryItems) && data.memoryItems.length > 0) {
          setMemoryItems(parseSavedMemoryItems(JSON.stringify(data.memoryItems), null));
        }
        if (Array.isArray(data.eventLogItems) && data.eventLogItems.length > 0) {
          setEventLogItems(parseSavedEventLogItems(JSON.stringify(data.eventLogItems)));
        }
      })
      .catch(() => undefined)
      .finally(() => setServerSyncReady(true));
  }

  useEffect(() => {
    const savedMemo = window.localStorage.getItem("tiu-player-memo");
    const savedMemoryStack = window.localStorage.getItem(SUMMARY_MEMORY_STORAGE_KEY);
    const legacyMemory = window.localStorage.getItem("tiu-summary-memory");
    const savedTokens = Number(window.localStorage.getItem(RESPONSE_LENGTH_STORAGE_KEY));
    const savedDifficulty = window.localStorage.getItem(DIFFICULTY_STORAGE_KEY);
    const savedModelProfile = window.localStorage.getItem(MODEL_PROFILE_STORAGE_KEY);
    const savedEventLog = window.localStorage.getItem(EVENT_LOG_STORAGE_KEY);
    const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);

    if (savedMemo) setMemo(savedMemo.slice(0, PLAYER_MEMO_LIMIT));
    setMemoryItems(parseSavedMemoryItems(savedMemoryStack, legacyMemory));
    setEventLogItems(parseSavedEventLogItems(savedEventLog));
    if (Number.isFinite(savedTokens) && savedTokens > 0) {
      setOutputTokens(normalizeTokenValue(savedTokens));
    }
    setDifficultyMode(normalizeDifficulty(savedDifficulty));
    setModelProfile(normalizeModelProfile(savedModelProfile));
    setLanguage(normalizeLanguage(savedLanguage));
    setStorageLoaded(true);

    fetch(ACCESS_ENDPOINT)
      .then((res) => (res.ok ? res.json() : { enabled: false, authenticated: true }))
      .then((data: { enabled?: boolean; authenticated?: boolean }) => {
        const enabled = Boolean(data.enabled);
        const authenticated = !enabled || Boolean(data.authenticated);
        setAccessRequired(enabled);
        setAccessGranted(authenticated);
        if (authenticated) {
          return hydrateSessionState();
        }
        setServerSyncReady(false);
        return undefined;
      })
      .catch(() => {
        setAccessRequired(false);
        setAccessGranted(true);
        return hydrateSessionState();
      })
      .finally(() => setAccessChecked(true));
  }, []);

  useEffect(() => {
    scrollToBottom("smooth");
  }, [turns, loading]);

  useEffect(() => {
    if (!storageLoaded) return;
    window.localStorage.setItem("tiu-player-memo", memo);
  }, [memo, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return;
    window.localStorage.setItem(SUMMARY_MEMORY_STORAGE_KEY, JSON.stringify(memoryItems));
  }, [memoryItems, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded || !serverSyncReady || !accessGranted) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      fetch(SESSION_STATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo, memoryItems, eventLogItems }),
        signal: controller.signal,
      }).catch(() => undefined);
    }, 400);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [accessGranted, eventLogItems, memo, memoryItems, serverSyncReady, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return;
    window.localStorage.setItem(RESPONSE_LENGTH_STORAGE_KEY, String(normalizeTokenValue(outputTokens)));
  }, [outputTokens, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return;
    window.localStorage.setItem(DIFFICULTY_STORAGE_KEY, difficultyMode);
  }, [difficultyMode, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return;
    window.localStorage.setItem(MODEL_PROFILE_STORAGE_KEY, modelProfile);
  }, [modelProfile, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return;
    window.localStorage.setItem(EVENT_LOG_STORAGE_KEY, JSON.stringify(eventLogItems));
  }, [eventLogItems, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language, storageLoaded]);

  useEffect(() => {
    if (entryStage !== "boot") return;

    const startedAt = window.performance.now();
    const timer = window.setInterval(() => {
      const elapsed = window.performance.now() - startedAt;
      const ratio = Math.min(1, elapsed / BOOT_DURATION_MS);
      const nextProgress = Math.round(ratio * 100);
      const bootStepCount = BOOT_STEPS[language].length;
      setBootProgress(nextProgress);
      setBootStep(Math.min(bootStepCount - 1, Math.floor(ratio * bootStepCount)));

      if (ratio >= 1) {
        window.clearInterval(timer);
        setEntryStage("ready");
      }
    }, 80);

    return () => window.clearInterval(timer);
  }, [entryStage, language]);

  const lastAssistant = [...turns]
    .reverse()
    .find((t): t is Extract<Turn, { role: "assistant" }> => t.role === "assistant");
  const choices = lastAssistant && !loading ? lastAssistant.response.choices : [];
  const allowFreeform = lastAssistant ? lastAssistant.response.allow_freeform : true;
  const hasSuggestions = choices.length > 0;
  const extraSteps = Math.max(0, Math.ceil((outputTokens - DEFAULT_OUTPUT_TOKENS) / TOKEN_STEP));
  const text = UI_TEXT[language];
  const baseDifficultyOption =
    DIFFICULTY_OPTIONS.find((option) => option.id === difficultyMode) ?? DIFFICULTY_OPTIONS[1];
  const currentDifficultyOption = getDifficultyOptionText(baseDifficultyOption, language);
  const baseModelOption =
    MODEL_PROFILE_OPTIONS.find((option) => option.id === modelProfile) ?? MODEL_PROFILE_OPTIONS[0];
  const currentModelOption = getModelProfileText(baseModelOption, language);
  const characterExamples = language === "en" ? CHARACTER_EXAMPLES_EN : CHARACTER_EXAMPLES;
  const summaryMemoryText = memoryItems
    .map((item, index) => `${index + 1}. ${item.text}`)
    .join("\n");

  async function send(text: string, displayText = text, options: { hideUserTurn?: boolean } = {}) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const display = displayText.trim() || trimmed;
    const userTurn: Turn = {
      role: "user",
      content: display,
      apiContent: trimmed,
      hidden: options.hideUserTurn,
    };
    const nextTurns = [...turns, userTurn];
    setTurns(nextTurns);
    setInput("");
    setLoading(true);
    setShowSuggestions(false);

    const apiMessages: ChatMessage[] = nextTurns.map((t) =>
      t.role === "user"
        ? { role: "user", content: t.apiContent ?? t.content }
        : { role: "assistant", content: t.response.raw },
    );

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          memo: memo.trim() || undefined,
          memory: summaryMemoryText || undefined,
          difficulty: difficultyMode,
          modelProfile,
          language,
          maxOutputTokens: normalizeTokenValue(outputTokens),
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }

      const data: GameResponse = await res.json();
      if (data.memory_updates?.length) {
        setMemoryItems((items) => mergeMemoryItems(items, data.memory_updates ?? [], "auto"));
      }
      setEventLogItems((items) => mergeEventLogItem(items, buildEventLogItem(data, nextTurns.length, language)));
      setTurns((prev) => [...prev, { role: "assistant", response: data }]);
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : language === "en"
          ? "Unknown error"
          : "알 수 없는 오류";
      const retryChoices = language === "en"
        ? [{ text: "Try again" }, { text: "Look around" }, { text: "Pause for a moment" }]
        : [{ text: "다시 시도한다" }, { text: "주변을 살핀다" }, { text: "잠시 멈춘다" }];
      const errorPrefix = language === "en" ? "Error" : "오류";
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          response: {
            narrative: `[${errorPrefix}] ${message}`,
            choices: retryChoices,
            allow_freeform: true,
            raw: `[${errorPrefix}] ${message}`,
          },
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    scrollElement.scrollTo({
      top: scrollElement.scrollHeight,
      behavior,
    });
    setShowScrollBottomButton(false);
  }

  function handleChatScroll() {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const distanceFromBottom =
      scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight;
    setShowScrollBottomButton(distanceFromBottom > 160);
  }

  function adjustOutputTokens(delta: number) {
    setOutputTokens((value) => normalizeTokenValue(value + delta));
  }

  function updateMemo(value: string) {
    setMemo(value.slice(0, PLAYER_MEMO_LIMIT));
  }

  function updateMemoryDraft(value: string) {
    setMemoryDraft(value.slice(0, SUMMARY_MEMORY_LIMIT));
  }

  function addMemoryItem() {
    const text = memoryDraft.trim().slice(0, SUMMARY_MEMORY_LIMIT);
    if (!text) return;

    setMemoryItems((items) => [...items, createMemoryItem(text, "manual")]);
    setMemoryDraft("");
  }

  function updateMemoryItem(id: string, value: string) {
    const text = value.slice(0, SUMMARY_MEMORY_LIMIT);
    const updatedAt = new Date().toISOString();
    setMemoryItems((items) =>
      items.map((item) => (item.id === id ? { ...item, text, updatedAt } : item)),
    );
  }

  function deleteMemoryItem(id: string) {
    setMemoryItems((items) => items.filter((item) => item.id !== id));
  }

  function deleteEventLogItem(id: string) {
    setEventLogItems((items) => items.filter((item) => item.id !== id));
  }

  function clearEventLogItems() {
    setEventLogItems([]);
  }

  function toggleSessionInfo(tab: Exclude<SessionInfoTab, null>) {
    setSessionInfoTab((current) => (current === tab ? null : tab));
  }

  function beginBootSequence() {
    setBootProgress(0);
    setBootStep(0);
    setEntryStage("boot");
  }

  async function handleAccessSubmit(e: FormEvent) {
    e.preventDefault();
    const password = accessPassword.trim();
    if (!password || accessLoading) return;

    setAccessLoading(true);
    setAccessError("");
    try {
      const res = await fetch(ACCESS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const fallbackError = language === "en" ? "Password does not match." : "비밀번호가 맞지 않습니다.";
        const data = await res.json().catch(() => ({ error: fallbackError }));
        throw new Error(data.error ?? fallbackError);
      }
      setAccessPassword("");
      setAccessGranted(true);
      await hydrateSessionState();
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : text.accessDefaultError);
    } finally {
      setAccessLoading(false);
    }
  }

  if (!accessChecked) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-zinc-950 px-4 text-zinc-100">
        <div className="text-xs tracking-[0.28em] text-zinc-500">{text.accessCheck}</div>
      </main>
    );
  }

  if (accessRequired && !accessGranted) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-zinc-950 px-4 text-zinc-100">
        <div className="absolute right-4 top-4">
          <LanguageToggle language={language} onChange={setLanguage} />
        </div>
        <form
          onSubmit={handleAccessSubmit}
          className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900/70 p-4"
        >
          <div className="mb-4">
            <TiuLogoMark sessionLabel={text.worldSession} />
          </div>
          <label className="block text-xs font-medium text-zinc-400" htmlFor="access-password">
            {text.accessPassword}
          </label>
          <input
            id="access-password"
            type="password"
            value={accessPassword}
            onChange={(e) => setAccessPassword(e.target.value)}
            autoComplete="current-password"
            className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
          />
          {accessError && <p className="mt-2 text-xs text-red-300">{accessError}</p>}
          <button
            type="submit"
            disabled={accessLoading || !accessPassword.trim()}
            className="mt-4 w-full rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            {accessLoading ? text.accessChecking : text.accessButton}
          </button>
        </form>
      </main>
    );
  }

  if (entryStage !== "ready") {
    return (
      <EntryScreen
        stage={entryStage}
        progress={bootProgress}
        bootStep={bootStep}
        language={language}
        onLanguageChange={setLanguage}
        onBegin={beginBootSequence}
      />
    );
  }

  return (
    <main
      className="relative flex flex-col bg-zinc-950 text-zinc-100"
      style={{ minHeight: "100dvh", height: "100dvh" }}
    >
      <header className="border-b border-zinc-800 bg-black/95 px-4 py-3 safe-top">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <TiuLogoMark />
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 text-[10px] font-medium tracking-[0.22em] text-zinc-500 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
              {text.worldSession}
            </div>
            <LanguageToggle language={language} onChange={setLanguage} />
          </div>
        </div>
      </header>

      <section className="border-b border-zinc-800 bg-zinc-950/95 px-4 py-2">
        <div className="mx-auto max-w-2xl">
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => toggleSessionInfo("difficulty")}
              className={`min-w-[8.5rem] flex-1 rounded-md border px-3 py-2 text-left transition-colors ${
                sessionInfoTab === "difficulty"
                  ? "border-emerald-400/60 bg-emerald-950/25"
                  : "border-zinc-800 bg-zinc-900/60 hover:border-emerald-500/40"
              }`}
            >
              <span className="block truncate text-xs font-medium text-zinc-100">
                {currentDifficultyOption.title}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-zinc-500">
                {currentDifficultyOption.summary}
              </span>
            </button>
            <button
              type="button"
              onClick={() => toggleSessionInfo("memory")}
              className={`min-w-[8.5rem] flex-1 rounded-md border px-3 py-2 text-left transition-colors ${
                sessionInfoTab === "memory"
                  ? "border-violet-400/60 bg-violet-950/25"
                  : "border-zinc-800 bg-zinc-900/60 hover:border-violet-500/40"
              }`}
            >
              <span className="block text-xs font-medium text-zinc-100">{text.tabs.memory}</span>
              <span className="mt-0.5 block truncate text-[11px] text-zinc-500">
                {memoryItems.length > 0 ? text.tabs.memoryCount(memoryItems.length) : text.tabs.memoryEmpty}
              </span>
            </button>
            <button
              type="button"
              onClick={() => toggleSessionInfo("model")}
              className={`min-w-[8.5rem] flex-1 rounded-md border px-3 py-2 text-left transition-colors ${
                sessionInfoTab === "model"
                  ? "border-cyan-400/60 bg-cyan-950/25"
                  : "border-zinc-800 bg-zinc-900/60 hover:border-cyan-500/40"
              }`}
            >
              <span className="block truncate text-xs font-medium text-zinc-100">
                {currentModelOption.title}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-zinc-500">
                {currentModelOption.summary}
              </span>
            </button>
            <button
              type="button"
              onClick={() => toggleSessionInfo("events")}
              className={`min-w-[8.5rem] flex-1 rounded-md border px-3 py-2 text-left transition-colors ${
                sessionInfoTab === "events"
                  ? "border-amber-400/60 bg-amber-950/20"
                  : "border-zinc-800 bg-zinc-900/60 hover:border-amber-500/40"
              }`}
            >
              <span className="block text-xs font-medium text-zinc-100">{text.tabs.events}</span>
              <span className="mt-0.5 block truncate text-[11px] text-zinc-500">
                {eventLogItems.length > 0 ? text.tabs.eventsCount(eventLogItems.length) : text.tabs.eventsEmpty}
              </span>
            </button>
            <button
              type="button"
              onClick={() => toggleSessionInfo("length")}
              className={`min-w-[8.5rem] flex-1 rounded-md border px-3 py-2 text-left transition-colors ${
                sessionInfoTab === "length"
                  ? "border-red-400/60 bg-red-950/20"
                  : "border-zinc-800 bg-zinc-900/60 hover:border-red-500/40"
              }`}
            >
              <span className="block text-xs font-medium text-zinc-100">{text.tabs.length}</span>
              <span className="mt-0.5 block truncate text-[11px] text-zinc-500">
                {responseLengthLabel(outputTokens, language)} / {responseMultiplier(outputTokens)}
              </span>
            </button>
          </div>

          {sessionInfoTab === "difficulty" && (
            <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900/70 p-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {DIFFICULTY_OPTIONS.map((option) => {
                  const optionText = getDifficultyOptionText(option, language);

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setDifficultyMode(option.id)}
                      disabled={loading}
                      className={`rounded-md border p-3 text-left transition-colors disabled:opacity-50 ${option.className} ${
                        difficultyMode === option.id ? "ring-1 ring-emerald-300/70" : ""
                      }`}
                    >
                      <span className="block text-sm font-semibold text-zinc-100">
                        {optionText.title}
                      </span>
                      <span className="mt-1 block text-[11px] text-zinc-400">
                        {optionText.summary}
                      </span>
                      <span className="mt-2 block text-[11px] leading-relaxed text-zinc-500">
                        {optionText.tone}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {sessionInfoTab === "memory" && (
            <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900/70 p-2">
              <div className="rounded-md border border-zinc-800 bg-zinc-950 p-2">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-medium text-zinc-200">{text.memory.addTitle}</span>
                  <span className="ml-auto text-[11px] text-zinc-600">
                    {memoryDraft.length}/{SUMMARY_MEMORY_LIMIT}{language === "en" ? "" : "자"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <textarea
                    value={memoryDraft}
                    onChange={(e) => updateMemoryDraft(e.target.value)}
                    onInput={(e) => updateMemoryDraft(e.currentTarget.value)}
                    maxLength={SUMMARY_MEMORY_LIMIT}
                    placeholder={text.memory.placeholder}
                    rows={2}
                    disabled={loading}
                    className="min-h-14 flex-1 resize-y rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs leading-relaxed text-zinc-200 placeholder-zinc-600 focus:border-violet-500 focus:outline-none disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={addMemoryItem}
                    disabled={loading || !memoryDraft.trim()}
                    className="self-stretch rounded-md bg-violet-600 px-3 text-xs font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-zinc-700"
                  >
                    {text.memory.add}
                  </button>
                </div>
              </div>

              <div className="mt-2 space-y-2">
                {memoryItems.length === 0 ? (
                  <div className="rounded-md border border-dashed border-zinc-800 px-3 py-4 text-center text-xs text-zinc-600">
                    {text.memory.empty}
                  </div>
                ) : (
                  memoryItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="rounded-md border border-zinc-800 bg-zinc-950/80 p-2"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="rounded bg-violet-950/50 px-2 py-1 text-[11px] font-medium text-violet-200">
                          #{index + 1}
                        </span>
                        <span className={`rounded px-2 py-1 text-[11px] font-medium ${
                          item.source === "auto"
                            ? "bg-blue-950/50 text-blue-200"
                            : "bg-zinc-900 text-zinc-400"
                        }`}>
                          {item.source === "auto" ? text.memory.auto : text.memory.manual}
                        </span>
                        <span className="text-[11px] text-zinc-600">
                          {item.text.length}/{SUMMARY_MEMORY_LIMIT}{language === "en" ? "" : "자"}
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteMemoryItem(item.id)}
                          disabled={loading}
                          className="ml-auto rounded border border-zinc-800 px-2 py-1 text-[11px] text-zinc-400 hover:border-red-500/50 hover:text-red-200 disabled:opacity-40"
                        >
                          {text.memory.delete}
                        </button>
                      </div>
                      <textarea
                        value={item.text}
                        onChange={(e) => updateMemoryItem(item.id, e.target.value)}
                        onInput={(e) => updateMemoryItem(item.id, e.currentTarget.value)}
                        maxLength={SUMMARY_MEMORY_LIMIT}
                        rows={2}
                        disabled={loading}
                        className="min-h-14 w-full resize-y rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs leading-relaxed text-zinc-200 focus:border-violet-500 focus:outline-none disabled:opacity-50"
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {sessionInfoTab === "model" && (
            <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900/70 p-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {MODEL_PROFILE_OPTIONS.map((option) => {
                  const optionText = getModelProfileText(option, language);

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setModelProfile(option.id)}
                      disabled={loading}
                      className={`rounded-md border p-3 text-left transition-colors disabled:opacity-50 ${
                        modelProfile === option.id
                          ? "border-cyan-400/70 bg-cyan-950/25 ring-1 ring-cyan-300/50"
                          : "border-zinc-800 bg-zinc-950/70 hover:border-cyan-500/40"
                      }`}
                    >
                      <span className="block text-sm font-semibold text-zinc-100">
                        {optionText.title}
                      </span>
                      <span className="mt-1 block text-[11px] text-zinc-400">
                        {optionText.summary}
                      </span>
                      <span className="mt-2 block text-[11px] leading-relaxed text-zinc-500">
                        {optionText.detail}
                      </span>
                      <span className="mt-2 inline-flex rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] font-medium text-zinc-500">
                        {option.envKey}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
                {text.model.fallbackNote}
              </p>
            </div>
          )}

          {sessionInfoTab === "events" && (
            <EventLogPanel
              eventLogItems={eventLogItems}
              loading={loading}
              onDelete={deleteEventLogItem}
              onClear={clearEventLogItems}
              labels={text.events}
            />
          )}

          {sessionInfoTab === "length" && (
            <div className="mt-2">
              <ResponseLengthControl
                outputTokens={outputTokens}
                loading={loading}
                extraSteps={extraSteps}
                labels={text.length}
                language={language}
                onPreset={setOutputTokens}
                onAdjust={adjustOutputTokens}
                onChange={(value) => setOutputTokens(normalizeTokenValue(value))}
              />
            </div>
          )}
        </div>
      </section>

      <div
        ref={scrollRef}
        onScroll={handleChatScroll}
        className="no-scrollbar flex-1 overflow-y-auto px-4 py-4"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {turns.length === 0 && (
            <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-zinc-100">{text.start.title}</h2>
                <p className="text-sm leading-relaxed text-zinc-400">
                  {text.start.body}
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {text.start.routeTitle}
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {STARTER_ROUTES.map((route) => {
                    const routeText = getStarterRouteText(route, language);

                    return (
                      <button
                        key={route.title}
                        type="button"
                        onClick={() => send(route.prompt, `${routeText.title} - ${routeText.role}`)}
                        disabled={loading}
                        className={`group overflow-hidden rounded-md border text-left transition-colors disabled:opacity-50 ${route.cardClass}`}
                      >
                        <span className="relative block h-28 overflow-hidden border-b border-zinc-800 bg-black">
                          <Image
                            src={route.image}
                            alt=""
                            fill
                            className="object-cover opacity-70 transition duration-300 group-hover:scale-105 group-hover:opacity-90"
                            sizes="(min-width: 640px) 320px, 100vw"
                          />
                          <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.78),transparent_62%)]" />
                          <span className="absolute bottom-2 left-3 right-3 truncate text-[10px] font-medium tracking-[0.14em] text-zinc-300">
                            {route.signal}
                          </span>
                        </span>
                        <span className="block p-3">
                          <span className={`mb-2 block h-1 w-9 rounded-full ${route.accent}`} />
                          <span className={`block text-sm font-medium ${route.titleClass}`}>{routeText.title}</span>
                          <span className="mt-1 block text-xs text-zinc-400">{routeText.role}</span>
                          <span className="mt-2 block text-[11px] text-zinc-500">{routeText.tone}</span>
                          <span className="mt-3 block border-t border-zinc-800/80 pt-2 text-[11px] leading-relaxed text-zinc-400">
                            {routeText.guide}
                          </span>
                          <span className="mt-1 block text-[11px] leading-relaxed text-zinc-300">
                            {routeText.objective}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {text.start.characterTitle}
                </h3>
                <p className="text-xs leading-relaxed text-zinc-500">
                  {text.start.characterHelp}
                </p>
                <div className="space-y-1.5">
                  {characterExamples.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setInput(example)}
                      disabled={loading}
                      className="w-full rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-left text-xs leading-relaxed text-zinc-400 hover:border-blue-500/50 hover:bg-blue-950/10 hover:text-zinc-200 disabled:opacity-50"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}

          {turns.map((t, i) =>
            t.role === "user" && t.hidden ? null : t.role === "user" ? (
              <div
                key={i}
                className="self-end max-w-[85%] rounded-lg bg-blue-600 px-3.5 py-2 text-sm leading-relaxed"
              >
                {t.content}
              </div>
            ) : (
              <div key={i} className="self-start w-full space-y-2">
                {(() => {
                  const sceneImage = pickSceneImage(t.response);
                  return sceneImage ? <SceneImageCard image={sceneImage} /> : null;
                })()}
                <div className="rounded-lg bg-zinc-900 px-3.5 py-3 text-sm leading-relaxed whitespace-pre-wrap text-zinc-200">
                  {t.response.narrative}
                </div>
                {t.response.briefing && (
                  <BriefingPanel
                    briefing={t.response.briefing}
                    labels={text.briefing}
                    language={language}
                  />
                )}
              </div>
            ),
          )}

          {loading && (
            <TransmissionLoader language={language} />
          )}
        </div>
      </div>

      {showScrollBottomButton && (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          className="absolute bottom-36 right-4 z-20 inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-xs font-medium text-zinc-200 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur transition-colors hover:border-blue-400/60 hover:bg-blue-950/80 hover:text-blue-100"
          aria-label={text.bottom.scrollBottomLabel}
        >
          <span className="text-sm leading-none">↓</span>
          <span>{text.bottom.scrollBottom}</span>
        </button>
      )}

      <div className="border-t border-zinc-800 bg-zinc-950 px-4 py-3 safe-bottom">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowSuggestions((value) => !value)}
                disabled={loading || !hasSuggestions}
                aria-pressed={showSuggestions}
                aria-label={text.bottom.aiLabel}
                className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                  showSuggestions
                    ? "border-blue-400/70 bg-blue-950/35 text-blue-100"
                    : "border-zinc-800 bg-zinc-950/50 text-zinc-300 hover:border-blue-500/40 hover:text-zinc-100"
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {text.bottom.ai}
              </button>
              <button
                type="button"
                onClick={() => setShowPlayerMemo((value) => !value)}
                aria-pressed={showPlayerMemo}
                className={`rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors ${
                  showPlayerMemo
                    ? "border-zinc-200 bg-zinc-100 text-zinc-950"
                    : "border-zinc-800 bg-zinc-950/50 text-zinc-300 hover:border-blue-500/40 hover:text-zinc-100"
                }`}
              >
                {text.bottom.memo} {memo.trim() ? `${memo.length}/${PLAYER_MEMO_LIMIT}` : ""}
              </button>
            </div>

            {showSuggestions && hasSuggestions && (
              <div className="mt-2 grid grid-cols-1 gap-1.5 rounded-md border border-zinc-800 bg-zinc-950/50 p-2">
                {choices.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => send(c.text)}
                    disabled={loading}
                    className={`rounded-md border px-3 py-2.5 text-left text-sm transition-colors active:bg-zinc-800 disabled:opacity-50 ${SUGGESTION_STYLES[i % SUGGESTION_STYLES.length].button}`}
                  >
                    <span className={`mr-2 ${SUGGESTION_STYLES[i % SUGGESTION_STYLES.length].marker}`}>
                      {String.fromCharCode(65 + i)}.
                    </span>
                    {c.text}
                  </button>
                ))}
              </div>
            )}

            {showPlayerMemo && (
              <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-950/55 p-2">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded bg-zinc-100 px-2.5 py-1.5 text-[11px] font-medium text-zinc-950">
                    {text.bottom.playerMemo}
                  </span>
                  <span className="ml-auto text-[11px] text-zinc-600">
                    {memo.length}/{PLAYER_MEMO_LIMIT}{language === "en" ? "" : "자"}
                  </span>
                </div>
                <textarea
                  value={memo}
                  onChange={(e) => updateMemo(e.target.value)}
                  onInput={(e) => updateMemo(e.currentTarget.value)}
                  maxLength={PLAYER_MEMO_LIMIT}
                  placeholder={text.bottom.memoPlaceholder}
                  rows={2}
                  disabled={loading}
                  className="max-h-28 min-h-16 w-full resize-y rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs leading-relaxed text-zinc-200 placeholder-zinc-600 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                />
              </div>
            )}
          </div>

          {allowFreeform && (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onInput={(e) => setInput(e.currentTarget.value)}
                placeholder={turns.length === 0 ? text.start.inputPlaceholder : ""}
                disabled={loading}
                autoComplete="off"
                className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm placeholder-zinc-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium hover:bg-blue-500 active:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-700"
              >
                {text.bottom.send}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
