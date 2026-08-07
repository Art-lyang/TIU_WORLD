// 시작 루트 단일 정의.
//
// 이전에는 루트 식별이 세 곳에 흩어져 있었다.
//   - src/app/page.tsx        STARTER_ROUTES (UI 카드 3종)
//   - src/app/api/chat/route.ts STARTER_ROUTE_HINTS (탐지 3종)
//   - src/lib/gameEngine.ts   ROUTE_PROFILES (규칙 엔진 5종)
// 각각 자기 정규식을 따로 들고 있어서 UI에 없는 루트를 엔진만 알거나,
// 같은 입력을 서로 다른 루트로 판정하는 어긋남이 생겼다.
//
// 이 파일이 루트 id / START_ROUTE 토큰 / 표시 라벨 / 탐지 패턴의 단일 출처다.
// 표현(이미지, 색상, 후킹 문구)은 page.tsx에 남고 여기서는 id로만 연결한다.
//
// 정본 근거: world/system/TIU-AI-GM-STARTING-SCENARIOS.md
// 새 루트는 정본 문서에 정의가 먼저 있어야 추가한다.

export type RouteId =
  | "korean-barrier"
  | "kr-init-001"
  | "antarctic-hollow"
  | "midas-hand"
  | "streamer-signal"
  | "open-custom";

export type RouteKind =
  // 시작 화면에 카드로 노출되는 루트
  | "starter"
  // 카드로는 없고 자유 캐릭터 입력에서 탐지되는 루트
  | "custom";

export type RouteDefinition = {
  id: RouteId;
  kind: RouteKind;
  /** START_ROUTE:<token> 형태로 UI가 보내는 값. starter 루트만 가진다. */
  startToken: string | null;
  /** 시작 화면 카드 순서이자 플레이어가 숫자로 고를 때의 번호. */
  starterIndex: number | null;
  label: { ko: string; en: string };
  /** 자유 입력에서 이 루트를 알아보는 패턴. */
  pattern: RegExp;
};

export const ROUTE_DEFINITIONS: RouteDefinition[] = [
  {
    id: "korean-barrier",
    kind: "starter",
    startToken: "KR_BARRIER_CIVIL_ASSISTANT",
    starterIndex: 1,
    label: {
      ko: "한국 방벽 내부 민간 조사 보조원",
      en: "Korean barrier civil investigation aide",
    },
    pattern: /한국\s*방벽|방벽|생활구|주민\s*신고|민간\s*조사\s*보조원|KR_BARRIER_CIVIL_ASSISTANT|child voice|living zone|coastal defense barrier/i,
  },
  {
    id: "kr-init-001",
    kind: "starter",
    startToken: "KR_INIT_001_RECORDS",
    starterIndex: 2,
    label: {
      ko: "KR-INIT-001 잔여 문서 기록 관리자",
      en: "KR-INIT-001 residual records keeper",
    },
    pattern: /KR-?INIT-?001|잔여\s*문서|복원\s*로그|기록\s*관리자|KR_INIT_001_RECORDS|restoration log/i,
  },
  {
    id: "antarctic-hollow",
    kind: "starter",
    startToken: "L3_FIELD_ANALYST",
    starterIndex: 3,
    label: {
      ko: "남극 거대공동 현장 파견 계약 분석관",
      en: "Antarctic hollow field dispatch contract analyst",
    },
    pattern: /남극|거대공동|극지|현장\s*파견|계약\s*분석관|L3_FIELD_ANALYST|antarctic|field anomaly|entry route|hollow/i,
  },
  {
    id: "midas-hand",
    kind: "custom",
    startToken: null,
    starterIndex: null,
    label: {
      ko: "마이더스손 괴담 조사",
      en: "Midas-Hand urban legend investigation",
    },
    pattern: /midas|마이더스|괴담\s*조사\s*기자|urban legend|aftergold/i,
  },
  {
    id: "streamer-signal",
    kind: "custom",
    startToken: null,
    starterIndex: null,
    label: {
      ko: "방송/스트리머 세션",
      en: "Streamer signal session",
    },
    pattern: /스트리머|유튜버|방송|트위치|아프리카|youtube|twitch|streamer|broadcast/i,
  },
];

/** 어떤 루트에도 걸리지 않는 자유 캐릭터 세션. 레지스트리 순회 대상이 아니다. */
export const OPEN_CUSTOM_ROUTE_ID: RouteId = "open-custom";

export const STARTER_ROUTES: RouteDefinition[] = ROUTE_DEFINITIONS.filter(
  (route) => route.kind === "starter",
).sort((a, b) => (a.starterIndex ?? 0) - (b.starterIndex ?? 0));

/** 자유 캐릭터 선택지에 배정된 번호. 시작 카드 다음 번호를 쓴다. */
export const FREE_CHARACTER_INDEX = STARTER_ROUTES.length + 1;

export function findRouteByStartToken(token: string): RouteDefinition | null {
  const normalized = token.trim().replace(/^START_ROUTE:/i, "");
  return ROUTE_DEFINITIONS.find(
    (route) => route.startToken && route.startToken.toLowerCase() === normalized.toLowerCase(),
  ) ?? null;
}

export function findStarterRouteByIndex(index: number): RouteDefinition | null {
  return STARTER_ROUTES.find((route) => route.starterIndex === index) ?? null;
}

/**
 * 자유 입력에서 루트를 탐지한다. starter 루트를 먼저 보고,
 * 걸리지 않으면 custom 루트를 본다. 어느 쪽도 아니면 null.
 */
export function matchRoute(input: string): RouteDefinition | null {
  return (
    STARTER_ROUTES.find((route) => route.pattern.test(input)) ??
    ROUTE_DEFINITIONS.find((route) => route.kind === "custom" && route.pattern.test(input)) ??
    null
  );
}
