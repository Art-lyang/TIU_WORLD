import type {
  ChatMessage,
  ClueRecord,
  ClueStatus,
  DisclosureGate,
  DisclosureLevel,
  GameBriefing,
  GameEngineState,
  GameResponse,
  NpcRecord,
  NpcRelation,
} from "@/types/game";
// 같은 폴더의 형제 모듈이라 상대 경로를 쓴다.
// scripts/qa-engine.mjs가 Next 번들러 없이 이 파일을 직접 실행할 수 있어야 한다.
import { matchRoute } from "./routes.ts";

type EngineLanguage = "ko" | "en";

type RouteProfile = {
  id: string;
  title: string;
  route: string;
  objective: Record<EngineLanguage, string>;
  question: Record<EngineLanguage, string>;
  pressure: Record<EngineLanguage, string>;
  clueSeeds: ClueRecord[];
  npcSeeds: NpcRecord[];
  gates: Omit<DisclosureGate, "status">[];
};

const STATUS_RANK: Record<ClueStatus, number> = {
  unseen: 0,
  noticed: 1,
  collected: 2,
  contradicted: 3,
  verified: 4,
};

const RELATION_RANK: Record<NpcRelation, number> = {
  unknown: 0,
  hostile: 1,
  wary: 2,
  neutral: 3,
  helpful: 4,
};

const DISCLOSURE_RANK: Record<DisclosureLevel, number> = {
  PUBLIC: 0,
  RESTRICTED: 1,
  OBSERVER: 2,
  PRIVATE: 3,
};

function makeId(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return normalized || "record";
}

function sourceFromMessages(messages: ChatMessage[], extra = ""): string {
  return `${messages.map((message) => message.content).join("\n")}\n${extra}`;
}

function countPlayerTurns(messages: ChatMessage[]): number {
  return messages.filter((message) => message.role === "user").length;
}

function clue(
  id: string,
  title: string,
  detail: string,
  source: string,
  status: ClueStatus = "noticed",
  unlocks?: DisclosureLevel,
): ClueRecord {
  return { id, title, detail, source, status, unlocks };
}

function npc(
  id: string,
  name: string,
  role: string,
  known: string,
  emotion = "평온",
  relation: NpcRelation = "neutral",
  trust = 45,
  lastSeen = "현재 장면",
): NpcRecord {
  return { id, name, role, emotion, relation, trust, known, lastSeen };
}

function gate(
  id: string,
  label: string,
  level: DisclosureLevel,
  requiredClues: string[],
  hint: string,
): Omit<DisclosureGate, "status"> {
  return { id, label, level, requiredClues, hint };
}

const ROUTE_PROFILES: RouteProfile[] = [
  {
    id: "midas-hand",
    title: "Midas-Hand Reporter Case",
    route: "Midas-Hand urban legend investigation",
    objective: {
      ko: "삭제된 기사와 협찬 기록을 대조해 마이더스손의 공개 가능한 흔적을 찾는다.",
      en: "Compare deleted articles and sponsorship records to find publishable traces of Midas-Hand.",
    },
    question: {
      ko: "삭제된 초안, 협찬 계약서, 제보자 중 어디서 첫 균열을 확인할까?",
      en: "Which first crack matters: the deleted draft, the sponsorship contract, or the informant?",
    },
    pressure: {
      ko: "편집 데스크와 제보자가 동시에 답을 기다린다.",
      en: "The desk editor and the informant are both waiting for a decision.",
    },
    clueSeeds: [
      clue("midas-deleted-draft", "삭제된 기사 초안", "CMS에서 사라진 마이더스손 기사 초안.", "편집 데스크", "noticed"),
      clue("midas-sponsorship-contract", "협찬 제안서", "같은 제목으로 올라온 협찬/광고 제안서.", "광고 메일함", "noticed"),
      clue("midas-locker-photo", "폐상가 3층 라커 사진", "기사와 계약서가 동시에 가리키는 현장 사진.", "익명 제보", "noticed"),
    ],
    npcSeeds: [
      npc("yoon-seoha", "윤서하", "편집 데스크", "삭제된 초안과 광고 제안서의 시간차를 알고 있다.", "긴장", "helpful", 55, "통화 중"),
      npc("aftergold-0310", "AfterGold_0310", "익명 제보자", "마이더스손 관련 사진과 DM을 보냈다.", "경계", "wary", 35, "DM"),
    ],
    gates: [
      gate(
        "gate-midas-money-trace",
        "마이더스손 소유/협찬 흐름",
        "RESTRICTED",
        ["midas-deleted-draft", "midas-sponsorship-contract"],
        "초안 삭제 시각과 협찬 제안서 등록 시각이 맞물릴 때 열린다.",
      ),
    ],
  },
  {
    id: "korean-barrier",
    title: "Korean Barrier Civil Case",
    route: "한국 방벽 내부",
    objective: {
      ko: "주민 신고와 생활구 기록을 대조해 민원 뒤의 첫 불일치를 확인한다.",
      en: "Compare the resident report against living-zone records to verify the first mismatch.",
    },
    question: {
      ko: "신고자에게 먼저 전화를 걸까, 아니면 거주 기록부터 맞춰볼까?",
      en: "Call the complainant first, or line up the residence records?",
    },
    pressure: {
      ko: "민원 접수 창구와 동행 조사원이 다음 확인을 기다린다.",
      en: "The civil desk and field assistant are waiting for the next check.",
    },
    clueSeeds: [
      clue("barrier-child-voice-report", "아이 목소리 신고", "아이 없는 세대에서 같은 목소리가 반복된다는 민원.", "주민 신고", "noticed"),
      clue("barrier-no-child-record", "미성년자 없음 거주 기록", "해당 동의 거주 기록에는 미성년자가 없다.", "생활구 기록", "noticed"),
      clue("barrier-pediatric-alert", "소아과 예약 알림", "기록과 맞지 않는 예약 알림이 남아 있다.", "민원 시스템", "noticed"),
    ],
    npcSeeds: [
      npc("park-minjae", "박민재", "민간 조사 보조원", "민원 기록과 현장 동행을 맡고 있다.", "신중", "helpful", 50, "접수 창구"),
      npc("barrier-caller", "신고자", "생활구 주민", "아이 목소리를 들었다고 주장한다.", "불안", "unknown", 25, "전화 대기"),
    ],
    gates: [
      gate(
        "gate-barrier-record-fracture",
        "생활구 기록 불일치의 원인",
        "RESTRICTED",
        ["barrier-child-voice-report", "barrier-no-child-record"],
        "신고 내용과 공식 거주 기록을 같은 시각 기준으로 대조해야 한다.",
      ),
    ],
  },
  {
    id: "kr-init-001",
    title: "KR-INIT-001 Residual Record Case",
    route: "KR-INIT-001 잔여 문서",
    objective: {
      ko: "복원 로그와 열람 권한을 맞춰 삭제된 대응 기록의 공개 가능한 흔적을 찾는다.",
      en: "Match restoration logs with clearance traces to find the public edge of a deleted response record.",
    },
    question: {
      ko: "파일을 열기 전에 누가 복원했는지부터 확인해야 할까?",
      en: "Before opening the file, should you check who restored it?",
    },
    pressure: {
      ko: "기록 보안 담당자가 권한 패널 앞에서 대기한다.",
      en: "Archive security is waiting at the authorization panel.",
    },
    clueSeeds: [
      clue("krinit-restoration-log", "KR-INIT-001 복원 로그", "삭제된 문서가 세션 시작 직전에 복원되었다.", "기록 보관소", "noticed"),
      clue("krinit-requester-player", "요청자: 플레이어 계정", "복원 요청자 필드가 플레이어 계정을 가리킨다.", "권한 로그", "noticed"),
      clue("krinit-clearance-gap", "열람 등급 불일치", "파일명과 실제 열람 등급이 맞지 않는다.", "보안 패널", "noticed"),
    ],
    npcSeeds: [
      npc("oh-yeonju", "오연주", "기록 보안 담당자", "권한 로그와 보존실 출입 절차를 알고 있다.", "의심", "neutral", 45, "기록실"),
    ],
    gates: [
      gate(
        "gate-krinit-original-response",
        "KR-INIT-001 원본 대응 기록",
        "RESTRICTED",
        ["krinit-restoration-log", "krinit-requester-player"],
        "복원 요청자와 열람 등급의 불일치가 확인되면 다음 기록이 열린다.",
      ),
    ],
  },
  {
    id: "antarctic-hollow",
    title: "Antarctic Field Anomaly Case",
    route: "남극 거대공동 현장 파견",
    objective: {
      ko: "진입 경로와 현장 표지의 차이를 확인해 파견 명령이 어디서 틀어졌는지 찾는다.",
      en: "Compare entry routes and field signs to find where the dispatch order diverged.",
    },
    question: {
      ko: "지도 오류일까, 아니면 누군가 진입 경로를 바꾼 걸까?",
      en: "Is it a map error, or did someone change the entry route?",
    },
    pressure: {
      ko: "임태오와 강사가 낮은 목소리로 현장 판단을 요구한다.",
      en: "Tae-o Lim and the instructor quietly ask for a field decision.",
    },
    clueSeeds: [
      clue("antarctic-route-change", "승인자 없는 경로 변경", "진입 경로가 세 번 바뀌었지만 승인자가 비어 있다.", "파견 명령서", "noticed"),
      clue("antarctic-map-scale", "축척이 바뀌는 지도", "지도 축척이 페이지마다 다르게 보인다.", "교육 자료", "noticed"),
      clue("antarctic-third-marker", "세 번째 표지판 경고", "돌아오지 말라는 손글씨가 남아 있다.", "현장 표지", "noticed"),
    ],
    npcSeeds: [
      npc("lim-taeo", "임태오", "현장 지원 오퍼레이터", "지도 단말기와 낮은 무전 채널을 맡고 있다.", "긴장", "helpful", 50, "교육장"),
      npc("field-instructor", "강사", "파견 교육 담당자", "공식 절차만 말하지만 중요한 부분에서 멈칫한다.", "절제", "neutral", 40, "브리핑실"),
    ],
    gates: [
      gate(
        "gate-antarctic-route-cause",
        "남극 진입 경로 변경 사유",
        "RESTRICTED",
        ["antarctic-route-change", "antarctic-map-scale"],
        "경로 변경 로그와 지도 축척 불일치를 같은 좌표로 묶어야 한다.",
      ),
    ],
  },
  {
    id: "streamer-signal",
    title: "Streamer Signal Case",
    route: "방송/스트리머 커스텀 세션",
    objective: {
      ko: "업로드 시각, 삭제된 클립, 계정 로그를 따라 방송 화면에 들어온 첫 이상 신호를 확인한다.",
      en: "Track upload times, deleted clips, and account logs to identify the first anomaly in the stream.",
    },
    question: {
      ko: "채팅창의 증언을 믿을까, 아니면 플랫폼 로그부터 열어볼까?",
      en: "Trust the chat witnesses, or open the platform logs first?",
    },
    pressure: {
      ko: "시청자는 장난처럼 떠들지만, 매니저는 방송 중단 여부를 묻는다.",
      en: "Chat treats it like a bit, but the manager asks whether to cut the stream.",
    },
    clueSeeds: [
      clue("stream-future-upload", "미래 시각 업로드", "아직 녹화되지 않은 클립이 업로드 목록에 있다.", "플랫폼 대시보드", "noticed"),
      clue("stream-deleted-clip", "삭제된 클립 링크", "삭제된 클립 링크가 채팅에 반복된다.", "채팅 로그", "noticed"),
      clue("stream-login-record", "계정 로그인 기록", "본인이 접속하지 않은 지역의 로그인 기록.", "보안 메일", "noticed"),
    ],
    npcSeeds: [
      npc("stream-manager", "매니저", "방송 운영 담당자", "방송 유지와 중단 사이에서 판단을 요구한다.", "초조", "helpful", 55, "음성 통화"),
      npc("anonymous-viewer", "익명 시청자", "채팅 참여자", "삭제된 링크를 계속 올린다.", "불명", "unknown", 15, "채팅창"),
    ],
    gates: [
      gate(
        "gate-stream-account-tamper",
        "플랫폼 계정 조작 경로",
        "RESTRICTED",
        ["stream-future-upload", "stream-login-record"],
        "미래 업로드 시각과 외부 로그인 기록을 함께 확인해야 한다.",
      ),
    ],
  },
];

const OPEN_PROFILE: RouteProfile = {
  id: "open-custom",
  title: "Open Investigation Case",
  route: "자유 캐릭터 세션",
  objective: {
    ko: "직업, 소지품, 현재 장소에 맞는 첫 단서를 찾는다.",
    en: "Find the first clue that fits the character's job, items, and current place.",
  },
  question: {
    ko: "지금 가진 역할로 가장 자연스럽게 확인할 수 있는 단서는 무엇일까?",
    en: "What clue can this character naturally verify first?",
  },
  pressure: {
    ko: "아직 사건은 작고 구체적인 확인 하나를 기다린다.",
    en: "The case is still waiting for one small, concrete check.",
  },
  clueSeeds: [
    clue("custom-first-message", "첫 메시지", "캐릭터에게 가장 먼저 도착한 연락 또는 기록.", "세션 앵커", "noticed"),
    clue("custom-local-trace", "현장 단서", "현재 직업과 소지품으로 확인 가능한 첫 흔적.", "주변 환경", "noticed"),
  ],
  npcSeeds: [
    npc("custom-contact", "첫 연락자", "현장 접점", "플레이어의 직업에 맞는 제한된 정보를 갖고 있다.", "경계", "unknown", 30, "미확정"),
  ],
  gates: [
    gate(
      "gate-custom-first-fracture",
      "첫 불일치의 원인",
      "RESTRICTED",
      ["custom-first-message", "custom-local-trace"],
      "첫 연락과 현장 단서가 같은 문제를 가리킬 때 열린다.",
    ),
  ],
};

function detectRouteProfile(source: string): RouteProfile {
  // 탐지 패턴은 src/lib/routes.ts가 단일 출처다. 엔진이 자체 정규식을 들고 있으면
  // UI/챗 라우트와 판정이 갈라진다.
  const matched = matchRoute(source);
  if (!matched) return OPEN_PROFILE;
  return ROUTE_PROFILES.find((profile) => profile.id === matched.id) ?? OPEN_PROFILE;
}

// 단서별 판정 키워드. 이 키워드가 등장하는 문장만 그 단서의 근거로 인정한다.
// 이 표가 없으면 이력 전체를 한 덩어리로 훑게 되어, 어딘가에 "확인 완료"가
// 한 번 나오는 순간 그 루트의 단서가 전부 함께 승격되는 문제가 생긴다.
const CLUE_KEYWORDS: Record<string, string[]> = {
  "midas-deleted-draft": ["초안", "기사", "cms", "draft", "article"],
  "midas-sponsorship-contract": ["협찬", "제안서", "계약", "광고", "sponsorship", "contract"],
  "midas-locker-photo": ["라커", "폐상가", "사진", "locker", "photo"],
  "barrier-child-voice-report": ["아이 목소리", "목소리", "신고", "child voice", "report"],
  "barrier-no-child-record": ["거주 기록", "미성년자", "세대", "residence", "record"],
  "barrier-pediatric-alert": ["소아과", "예약", "알림", "pediatric", "appointment"],
  "krinit-restoration-log": ["복원", "로그", "restoration", "log"],
  "krinit-requester-player": ["요청자", "계정", "requester", "account"],
  "krinit-clearance-gap": ["열람 등급", "등급", "권한", "clearance"],
  "antarctic-route-change": ["경로", "승인자", "변경", "route", "approval"],
  "antarctic-map-scale": ["축척", "지도", "map", "scale"],
  "antarctic-third-marker": ["표지", "표지판", "손글씨", "marker", "sign"],
  "stream-future-upload": ["업로드", "미래", "클립 목록", "upload"],
  "stream-deleted-clip": ["삭제된 클립", "클립", "링크", "clip", "link"],
  "stream-login-record": ["로그인", "접속", "보안 메일", "login"],
  "custom-first-message": ["첫 메시지", "메시지", "연락", "message", "contact"],
  "custom-local-trace": ["흔적", "현장", "소지품", "trace", "scene"],
};

/** 이력을 문장 단위로 쪼갠다. 단서 근거를 문장 범위로 좁히기 위한 전처리. */
function splitSegments(source: string): string[] {
  return source
    .split(/\r?\n|(?<=[.!?。])\s+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

/** 해당 단서를 실제로 언급하는 문장만 모은다. 없으면 빈 문자열. */
function evidenceForClue(segments: string[], clueItem: ClueRecord): string {
  const keywords = CLUE_KEYWORDS[clueItem.id] ?? [];
  const titleTokens = clueItem.title
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  const needles = [...keywords, ...titleTokens].map((needle) => needle.toLowerCase());
  if (needles.length === 0) return "";

  return segments
    .filter((segment) => {
      const lower = segment.toLowerCase();
      return needles.some((needle) => lower.includes(needle));
    })
    .join("\n");
}

function inferDisclosureLevel(source: string): DisclosureLevel {
  if (/private|비공개|최심도|접근 금지|eyes only/i.test(source)) return "PRIVATE";
  if (/observer|관측자|관측되고|observed/i.test(source)) return "OBSERVER";
  if (/restricted|제한|기밀|classified|보안 등급/i.test(source)) return "RESTRICTED";
  return "PUBLIC";
}

function inferClueStatus(text: string, fallback: ClueStatus): ClueStatus {
  if (/검증 완료|확인 완료|대조 완료|verified|confirmed|validated/i.test(text)) return "verified";
  if (/모순|불일치|충돌|contradict|mismatch|conflict/i.test(text)) return "contradicted";
  if (/확보|수집|복원|열람|found|collected|restored|opened/i.test(text)) return "collected";
  if (/발견|목격|noticed|seen|detected/i.test(text)) return "noticed";
  return fallback;
}

function mergeClue(target: Map<string, ClueRecord>, incoming: ClueRecord): void {
  const current = target.get(incoming.id);
  if (!current) {
    target.set(incoming.id, incoming);
    return;
  }

  const status = STATUS_RANK[incoming.status] > STATUS_RANK[current.status]
    ? incoming.status
    : current.status;
  target.set(incoming.id, {
    ...current,
    ...incoming,
    detail: incoming.detail || current.detail,
    source: incoming.source || current.source,
    status,
    unlocks: incoming.unlocks ?? current.unlocks,
  });
}

function buildClueRecords(
  profile: RouteProfile,
  briefing: GameBriefing | undefined,
  source: string,
  previous: ClueRecord[] = [],
): ClueRecord[] {
  const clues = new Map<string, ClueRecord>();
  const segments = splitSegments(source);

  // 이전 턴까지 확보한 단서를 먼저 깐다. 컨텍스트 창이 잘려도 진행이 사라지지 않는다.
  for (const carried of previous) {
    mergeClue(clues, carried);
  }

  for (const seed of profile.clueSeeds) {
    const evidence = evidenceForClue(segments, seed);
    // 근거 문장이 없으면 승격시키지 않는다.
    const status = evidence ? inferClueStatus(evidence, seed.status) : seed.status;
    mergeClue(clues, { ...seed, status });
  }

  for (const clueItem of briefing?.clues ?? []) {
    const title = clueItem.title.trim();
    if (!title) continue;
    const detail = clueItem.detail.trim() || title;
    const record: ClueRecord = {
      id: makeId(title),
      title,
      detail,
      source: clueItem.source.trim() || "Scene",
      status: "noticed",
    };
    // 브리핑이 직접 보고한 상태와 그 단서를 언급한 문장만 근거로 삼는다.
    const evidence = `${clueItem.status}\n${title}\n${detail}\n${evidenceForClue(segments, record)}`;
    mergeClue(clues, { ...record, status: inferClueStatus(evidence, "noticed") });
  }

  return Array.from(clues.values()).slice(0, 12);
}

function inferNpcRelation(text: string, fallback: NpcRelation): NpcRelation {
  if (/도움|협조|helpful|supports|trust/i.test(text)) return "helpful";
  if (/의심|경계|wary|hesitates|distrust/i.test(text)) return "wary";
  if (/적대|위협|hostile|threat/i.test(text)) return "hostile";
  if (/불명|unknown/i.test(text)) return "unknown";
  return fallback;
}

function mergeNpc(target: Map<string, NpcRecord>, incoming: NpcRecord): void {
  const current = target.get(incoming.id);
  if (!current) {
    target.set(incoming.id, incoming);
    return;
  }

  const relation = RELATION_RANK[incoming.relation] > RELATION_RANK[current.relation]
    ? incoming.relation
    : current.relation;
  target.set(incoming.id, {
    ...current,
    ...incoming,
    emotion: incoming.emotion || current.emotion,
    relation,
    trust: Math.max(current.trust, incoming.trust),
    known: incoming.known || current.known,
    lastSeen: incoming.lastSeen || current.lastSeen,
  });
}

function buildNpcRecords(
  profile: RouteProfile,
  briefing: GameBriefing | undefined,
  previous: NpcRecord[] = [],
): NpcRecord[] {
  const npcs = new Map<string, NpcRecord>();

  for (const carried of previous) {
    mergeNpc(npcs, carried);
  }

  for (const seed of profile.npcSeeds) {
    mergeNpc(npcs, seed);
  }

  for (const person of briefing?.people ?? []) {
    const name = person.name.trim();
    if (!name) continue;
    const detail = person.detail.trim();
    const relation = inferNpcRelation(`${person.trust ?? ""}\n${detail}`, "neutral");
    const trustText = person.trust ?? "";
    const trustNumber = Number(trustText.match(/\d+/)?.[0] ?? NaN);
    mergeNpc(npcs, {
      id: makeId(name),
      name,
      role: detail || "Scene contact",
      emotion: person.emotion.trim() || "평온",
      relation,
      trust: Number.isFinite(trustNumber) ? Math.min(100, Math.max(0, trustNumber)) : 40,
      known: person.known?.trim() || detail || "현재 장면에 연결된 인물.",
      lastSeen: person.lastSeen?.trim() || "현재 장면",
    });
  }

  return Array.from(npcs.values()).slice(0, 10);
}

/** 단서가 실제 물증 단계에 도달했는지. contradicted는 모순 발견이므로 물증에 포함한다. */
function hasEvidence(status: ClueStatus): boolean {
  return status === "collected" || status === "contradicted" || status === "verified";
}

function evaluateGate(
  baseGate: Omit<DisclosureGate, "status">,
  clues: ClueRecord[],
  previousStatus?: DisclosureGate["status"],
): DisclosureGate {
  const clueById = new Map(clues.map((item) => [item.id, item]));
  const required = baseGate.requiredClues
    .map((id) => clueById.get(id))
    .filter((item): item is ClueRecord => Boolean(item));

  // 이전에는 본문에 "공개"/"확인" 같은 흔한 단어가 있으면 게이트가 열렸다.
  // 이 세계관 텍스트에는 두 단어가 상시 등장하므로 사실상 잠금이 없는 것과 같았다.
  // 이제는 필요한 단서가 개별적으로 verified에 도달해야만 해제한다.
  const allVerified = required.length === baseGate.requiredClues.length
    && required.length > 0
    && required.every((item) => item.status === "verified");
  const anyEvidence = required.some((item) => hasEvidence(item.status));

  const status: DisclosureGate["status"] = allVerified
    ? "unlocked"
    : anyEvidence
      ? "hypothesis"
      : "locked";

  // 한 번 해제된 게이트는 되잠기지 않는다.
  if (previousStatus === "unlocked") {
    return { ...baseGate, status: "unlocked" };
  }

  return { ...baseGate, status };
}

function inferPhase(
  source: string,
  turn: number,
  gates: DisclosureGate[],
  disclosureLevel: DisclosureLevel,
): GameEngineState["caseState"]["phase"] {
  if (/종결|마무리|aftermath|closed|case closed/i.test(source)) return "aftermath";
  if (gates.some((item) => item.status === "unlocked") || DISCLOSURE_RANK[disclosureLevel] >= DISCLOSURE_RANK.OBSERVER) {
    return "reveal";
  }
  if (/검증 완료|확인 완료|대조 완료|verified|confirmed|validated/i.test(source)) return "verification";
  if (turn <= 1 && !gates.some((item) => item.status === "hypothesis")) return "intake";
  if (/검증|확인|대조|verify|check|compare|confirm/i.test(source)) return "verification";
  if (turn >= 2 || gates.some((item) => item.status === "hypothesis")) return "evidence";
  return "intake";
}

function inferRisk(source: string, phase: GameEngineState["caseState"]["phase"], disclosureLevel: DisclosureLevel): number {
  let risk = phase === "intake" ? 18 : phase === "evidence" ? 32 : phase === "verification" ? 45 : phase === "reveal" ? 62 : 28;
  risk += DISCLOSURE_RANK[disclosureLevel] * 12;
  if (/부상|출혈|위협|봉쇄|경보|hostile|injury|bleeding|alarm|lockdown/i.test(source)) risk += 14;
  return Math.min(95, Math.max(5, risk));
}

/**
 * 현재 이력에서 루트를 판정하되, 신호가 사라졌으면 직전 루트를 유지한다.
 *
 * 서버는 컨텍스트 윈도를 잘라서 프롬프트를 만들기 때문에, 세션이 길어지면
 * 루트를 알려주던 첫 메시지가 창 밖으로 밀려난다. 이때 매 턴 open-custom으로
 * 떨어지면 사건 단계와 단서가 통째로 리셋된다.
 */
function resolveRouteProfile(source: string, previous?: GameEngineState): RouteProfile {
  const matched = detectRouteProfile(source);
  if (matched.id !== OPEN_PROFILE.id || !previous) return matched;
  return ROUTE_PROFILES.find((profile) => profile.id === previous.caseState.id) ?? matched;
}

const PHASE_RANK: Record<GameEngineState["caseState"]["phase"], number> = {
  intake: 0,
  evidence: 1,
  verification: 2,
  reveal: 3,
  aftermath: 4,
};

export function buildGameEngineState(
  response: Pick<GameResponse, "raw" | "narrative">,
  messages: ChatMessage[],
  briefing: GameBriefing | undefined,
  language: EngineLanguage,
  previous?: GameEngineState,
): GameEngineState {
  const source = sourceFromMessages(messages, `${response.raw}\n${response.narrative}`);
  const profile = resolveRouteProfile(source, previous);

  // 루트가 바뀌었으면 이전 사건의 단서를 이어받지 않는다.
  const carried = previous && previous.caseState.id === profile.id ? previous : undefined;

  const clues = buildClueRecords(profile, briefing, source, carried?.clues);
  const disclosureLevel = inferDisclosureLevel(source);
  const previousGateStatus = new Map(
    (carried?.disclosureGates ?? []).map((item) => [item.id, item.status]),
  );
  const disclosureGates = profile.gates.map((item) =>
    evaluateGate(item, clues, previousGateStatus.get(item.id)),
  );
  const turn = countPlayerTurns(messages);
  const inferred = inferPhase(source, turn, disclosureGates, disclosureLevel);
  // 단계는 되돌아가지 않는다. 컨텍스트가 잘려도 사건이 intake로 리셋되지 않도록.
  const phase = carried && PHASE_RANK[carried.caseState.phase] > PHASE_RANK[inferred]
    ? carried.caseState.phase
    : inferred;

  return {
    caseState: {
      id: profile.id,
      title: profile.title,
      route: profile.route,
      phase,
      turn,
      publicObjective: profile.objective[language],
      activeQuestion: profile.question[language],
      pressure: profile.pressure[language],
      disclosureLevel,
      risk: inferRisk(source, phase, disclosureLevel),
    },
    clues,
    npcs: buildNpcRecords(profile, briefing, carried?.npcs),
    disclosureGates,
  };
}

export function buildGameEngineStateFromMessages(
  messages: ChatMessage[],
  language: EngineLanguage,
  previous?: GameEngineState,
): GameEngineState {
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";
  return buildGameEngineState(
    { raw: lastAssistant, narrative: lastAssistant },
    messages,
    undefined,
    language,
    previous,
  );
}

export function buildGameEngineInstructions(engine: GameEngineState, language: EngineLanguage): string {
  const lockedGates = engine.disclosureGates.filter((item) => item.status !== "unlocked");
  const activeClues = engine.clues
    .slice(0, 6)
    .map((item) => `${item.title}(${item.status})`)
    .join(", ");
  const activeNpcs = engine.npcs
    .slice(0, 4)
    .map((item) => `${item.name}:${item.relation}/${item.emotion}`)
    .join(", ");
  const gateText = lockedGates.length > 0
    ? lockedGates.map((item) => `${item.label} -> ${item.hint}`).join(" / ")
    : language === "en" ? "No locked disclosure gate in this case state." : "현재 잠긴 공개 게이트 없음.";

  if (language === "en") {
    return `
Game Rules Engine:
- CaseState: ${engine.caseState.title} / phase=${engine.caseState.phase} / disclosure=${engine.caseState.disclosureLevel} / risk=${engine.caseState.risk}.
- Current objective: ${engine.caseState.publicObjective}
- Active question: ${engine.caseState.activeQuestion}
- ClueRegistry: ${activeClues || "none yet"}
- NpcState: ${activeNpcs || "none yet"}
- DisclosureGate: ${gateText}
- Do not reveal locked gate answers directly. Convert them into inspectable records, witness friction, contradictions, or verification actions.
- Every choice must target one of these: collect a clue, verify a clue, question an NPC, compare records, or test a disclosure gate.
- If the player asks for unrelated free chat, answer briefly in-character and return to the current objective.`;
  }

  return `
Game Rules Engine:
- CaseState: ${engine.caseState.title} / phase=${engine.caseState.phase} / disclosure=${engine.caseState.disclosureLevel} / risk=${engine.caseState.risk}.
- 현재 목표: ${engine.caseState.publicObjective}
- 현재 질문: ${engine.caseState.activeQuestion}
- ClueRegistry: ${activeClues || "아직 없음"}
- NpcState: ${activeNpcs || "아직 없음"}
- DisclosureGate: ${gateText}
- 잠긴 게이트의 정답을 직접 설명하지 말고, 확인 가능한 기록/목격자 반응/모순/검증 행동으로 바꿔 제시합니다.
- 모든 선택지는 단서 수집, 단서 검증, NPC 질문, 기록 대조, 공개 게이트 테스트 중 하나를 향해야 합니다.
- 플레이어가 무관한 자유 채팅을 해도 짧게 받아주고 현재 목표로 자연스럽게 되돌립니다.`;
}

export function engineStateToBriefingLogs(engine: GameEngineState, language: EngineLanguage): string[] {
  const locked = engine.disclosureGates.filter((item) => item.status === "locked").length;
  const hypothesis = engine.disclosureGates.filter((item) => item.status === "hypothesis").length;
  const unlocked = engine.disclosureGates.filter((item) => item.status === "unlocked").length;
  if (language === "en") {
    return [
      `Case phase: ${engine.caseState.phase} / disclosure ${engine.caseState.disclosureLevel}`,
      `Rules engine: ${engine.clues.length} clues / ${engine.npcs.length} NPCs`,
      `Disclosure gates: locked ${locked}, hypothesis ${hypothesis}, unlocked ${unlocked}`,
    ];
  }
  return [
    `사건 단계: ${engine.caseState.phase} / 공개 등급 ${engine.caseState.disclosureLevel}`,
    `규칙 엔진: 단서 ${engine.clues.length}개 / 인물 ${engine.npcs.length}명`,
    `공개 게이트: 잠김 ${locked}, 가설 ${hypothesis}, 해제 ${unlocked}`,
  ];
}
