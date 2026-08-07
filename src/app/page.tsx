"use client";

import Image from "next/image";
import { useState, useRef, useEffect, FormEvent } from "react";
import type { ApiUsageSnapshot, ChatMessage, GameResponse } from "@/types/game";

type Turn =
  | { role: "user"; content: string; apiContent?: string; hidden?: boolean }
  | { role: "assistant"; response: GameResponse };

type SessionInfoTab =
  | "menu"
  | "account"
  | "admin"
  | "feedback"
  | "save"
  | "library"
  | "usage"
  | "memory"
  | "length"
  | "difficulty"
  | "model"
  | "events"
  | "assets"
  | null;
type EntryStage = "intro" | "boot" | "ready";
type DifficultyMode = "story" | "traveler" | "observed";
type ModelProfile = "default" | "fast" | "deep" | "claude";
type Language = "ko" | "en";
type AccountRole = "admin";
type AccountProfile = {
  id: string;
  displayName: string;
  role: AccountRole;
};
type MemorySource = "manual" | "auto";
type ServerSyncStatus = "idle" | "syncing" | "synced" | "local_only" | "error";
type SessionMode = "official" | "custom";
type SessionStatus = "in_progress" | "completed";
type PublishConsentKey = "library" | "official" | "compensation" | "safety";
type TesterConsentKey = "tester" | "storage" | "ai" | "safety";
type FeedbackCategory = "bug" | "story" | "ui" | "performance" | "other";
type FeedbackStatus = "open" | "reviewed" | "resolved";
type SessionVisibility =
  | "private"
  | "uploaded_pending"
  | "public_user_session"
  | "featured_session"
  | "official_candidate"
  | "official_archive"
  | "rejected"
  | "removed";
type ContentTier = "teen";
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
type UserSceneImage = SceneImageMatch & {
  keywords: string[];
  priority: number;
};
type SessionSave = {
  id: string;
  version: 1;
  title: string;
  createdAt: string;
  updatedAt: string;
  turns: Turn[];
  memo: string;
  memoryItems: SummaryMemoryItem[];
  eventLogItems: EventLogItem[];
  mode: SessionMode;
  status: SessionStatus;
  visibility: SessionVisibility;
  contentTier: ContentTier;
  accountId?: string;
  accountName?: string;
  difficultyMode: DifficultyMode;
  modelProfile: ModelProfile;
  outputTokens: number;
  language: Language;
};
type TesterFeedbackItem = {
  id: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  message: string;
  accountId?: string;
  accountName?: string;
  sessionId?: string;
  sessionTitle?: string;
  turnCount?: number;
  context?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
};
type AdminDiagnostics = {
  checkedAt: string;
  account: {
    id: string;
    displayName: string;
    role: AccountRole;
  };
  access: {
    privateGateConfigured: boolean;
    accountGateConfigured: boolean;
    writeMode: "writable" | "best_effort";
    vercel: boolean;
  };
  providers: {
    openai: {
      configured: boolean;
      model: string;
      fastModelConfigured: boolean;
      deepModelConfigured: boolean;
    };
    anthropic: {
      configured: boolean;
      model: string | null;
      apiKeyConfigured: boolean;
    };
  };
  limits: {
    dailyCallLimit: number;
    dailyTokenLimit: number;
    maxOutputTokens: number;
    minSecondsBetweenCalls: number;
    maxContextMessages: number;
  };
  storage: {
    currentSession: boolean;
    savedSessions: number;
    reviewPending: number;
    privateSessions: number;
    completedSessions: number;
    testerFeedback?: {
      total: number;
      open: number;
      reviewed: number;
      resolved: number;
    };
  };
  cloudStorage?: {
    provider: "disabled" | "http";
    configured: boolean;
    ready: boolean;
    endpointConfigured: boolean;
    tokenConfigured: boolean;
    mode: "disabled" | "ready" | "misconfigured";
  };
  worldIndex?: {
    loaded: boolean;
    source: "local" | "public" | null;
    fileName: string | null;
    filePath: string | null;
    generatedAt: string | null;
    sourceRootName: string | null;
    sourceFileCount: number;
    entryCount: number;
    includePrivate: boolean;
    sizeBytes: number;
    mtime: string | null;
    tiers: {
      public: number;
      restricted: number;
      private: number;
    };
  };
  assets: {
    userSceneImageFiles: number;
    manifestItems: number;
    manifestPresent: boolean;
  };
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
const SESSION_SAVE_STORAGE_KEY = "tiu-current-session-save";
const SESSION_LIBRARY_STORAGE_KEY = "tiu-session-library";
const TESTER_CONSENT_STORAGE_KEY = "tiu-tester-consent-record";
const COOKIE_NOTICE_STORAGE_KEY = "tiu-cookie-notice-accepted";
const TESTER_FEEDBACK_STORAGE_KEY = "tiu-tester-feedback-local";
const ACCESS_ENDPOINT = "/api/access";
const ACCOUNT_ENDPOINT = "/api/auth";
const ADMIN_DIAGNOSTICS_ENDPOINT = "/api/admin/diagnostics";
const TESTER_FEEDBACK_ENDPOINT = "/api/tester-feedback";
const SESSION_STATE_ENDPOINT = "/api/session-state";
const USER_SCENE_ASSETS_ENDPOINT = "/api/assets/scene-images";
const BOOT_DURATION_MS = 2600;
const EVENT_LOG_LIMIT = 60;
const SESSION_LIBRARY_LIMIT = 12;
const TESTER_FEEDBACK_LIMIT = 80;
const TESTER_FEEDBACK_MESSAGE_LIMIT = 800;
const TESTER_CONSENT_VERSION = "alpha-2026-05-08";
const PUBLISH_CONSENT_KEYS: PublishConsentKey[] = ["library", "official", "compensation", "safety"];
const TESTER_CONSENT_KEYS: TesterConsentKey[] = ["tester", "storage", "ai", "safety"];
const EMPTY_PUBLISH_CONSENTS: Record<PublishConsentKey, boolean> = {
  library: false,
  official: false,
  compensation: false,
  safety: false,
};
const EMPTY_TESTER_CONSENTS: Record<TesterConsentKey, boolean> = {
  tester: false,
  storage: false,
  ai: false,
  safety: false,
};
const FORBIDDEN_SESSION_IMPORT_KEYS = new Set([
  "apikey",
  "openaiapikey",
  "anthropicapikey",
  "servertoken",
  "token",
  "accesstoken",
  "email",
  "phone",
  "phonenumber",
  "realname",
  "payment",
  "paymentinfo",
  "creditbalance",
  "billing",
  "apiusage",
  "adminmemo",
  "userid",
  "owneruserid",
  "adultverification",
  "ageverification",
]);

const SESSION_TITLE = "WORLD SESSION : Alpha 1.0v";

const BOOT_STEPS: Record<Language, string[]> = {
  ko: [
    "접속 권한 확인",
    "세계관 색인 연결",
    "장기 기억 채널 동기화",
    "2032년 좌표 고정",
    "월드 세션 개방",
  ],
  en: [
    "Verifying access",
    "Linking world index",
    "Syncing long-term memory channel",
    "Locking coordinates: 2032",
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
    syncTitle: "AI-GM 장면 작성 중",
    sceneCalc: "최근 선택 반영",
    clueAlign: "단서/대화 정리",
    accessCheck: "TIU SESSION CHECK",
    accessPassword: "테스트 접속 비밀번호",
    accessButton: "접속",
    accessChecking: "확인 중",
    accessDefaultError: "접속 확인에 실패했습니다.",
    worldSession: "WORLD SESSION",
    tabs: {
      menu: "메뉴",
      menuSummary: "세션 설정",
      account: "계정",
      save: "세이브 / 로드",
      saveEmpty: "저장된 진행 없음",
      saveReady: "이어하기 가능",
      library: "자료실 큐",
      libraryEmpty: "검수 대기 없음",
      libraryCount: (count: number) => `${count}개 대기`,
      usage: "사용량 보호",
      usageEmpty: "오늘 사용 없음",
      playMode: "진행 모드",
      model: "모델",
      close: "닫기",
      memory: "요약 메모리",
      memoryEmpty: "장기 기억 비어 있음",
      memoryCount: (count: number) => `${count}개 저장됨`,
      events: "사건 기록",
      eventsEmpty: "아직 기록 없음",
      eventsCount: (count: number) => `${count}개 누적`,
      assets: "장면 이미지",
      assetsEmpty: "이미지 없음",
      assetsCount: (count: number) => `${count}개 읽힘`,
      length: "응답 길이",
    },
    account: {
      gateTitle: "계정 로그인",
      gateDescription: "비공개 접속 확인 후 사용하는 테스트 계정 단계입니다.",
      loginTab: "로그인",
      signupTab: "회원가입",
      id: "아이디",
      password: "비밀번호",
      displayName: "표시 이름",
      login: "로그인",
      loggingIn: "확인 중",
      logout: "로그아웃",
      saveName: "이름 저장",
      savedName: "표시 이름을 저장했습니다.",
      roleAdmin: "관리자",
      signupPending: "회원가입은 클라우드 DB 연결 후 활성화됩니다. 지금은 임시 관리자 계정으로 테스트합니다.",
      adminHint: "임시 테스트 관리자 계정이 설정되어 있습니다.",
      profileTitle: "현재 계정",
      profileDetail: "캐릭터 이름을 직접 쓰지 않으면 이 표시 이름이 기본 이름으로 사용됩니다.",
      legalLink: "테스터 고지 / 개인정보 안내",
      authRequired: "계정 로그인 후 세션을 시작할 수 있습니다.",
      defaultError: "계정 확인에 실패했습니다.",
    },
    consent: {
      title: "비공개 테스트 동의",
      description: "정식 회원가입/클라우드 저장 전 단계의 테스트 동의입니다. 모든 항목을 확인하면 세션을 시작할 수 있습니다.",
      version: `동의 버전 ${TESTER_CONSENT_VERSION}`,
      accept: "동의 후 시작",
      required: "모든 항목 확인 필요",
      legalLink: "전체 고지 보기",
      tester: "현재 서비스가 비공개 테스트 단계이며 기능과 데이터 구조가 변경될 수 있음을 이해합니다.",
      storage: "브라우저 저장소와 필요한 쿠키가 로그인, 세션 저장, 메모리 유지에 사용됨을 이해합니다.",
      ai: "플레이어 메모, 요약 메모리, 선택 기록이 AI-GM 진행 맥락에 참조될 수 있음을 이해합니다.",
      safety: "금지 콘텐츠, 타인의 개인정보, API 키, 결제 정보를 세션/메모/가져오기 파일에 넣지 않겠습니다.",
    },
    cookie: {
      text: "이 테스트는 로그인, 비공개 접속, 세션 저장을 위해 필요한 쿠키와 브라우저 저장소를 사용합니다.",
      action: "확인",
      link: "자세히",
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
      fallbackNote: "OpenAI 빠른/심층 모델 값이 비어 있으면 기본 모델로 대체됩니다. Claude는 ANTHROPIC_API_KEY와 ANTHROPIC_MODEL이 둘 다 있을 때만 호출됩니다.",
    },
    events: {
      title: "사건 기록",
      auto: "자동 누적",
      clear: "전체 삭제",
      empty: "아직 기록된 사건이 없습니다. 장면이 진행되면 자동으로 쌓입니다.",
      fallbackDetail: "세부 정보 미확인",
      delete: "삭제",
    },
    assets: {
      title: "장면 이미지",
      description: "사용자 장면 이미지를 먼저 매칭하고, 맞는 이미지가 없으면 기본 TIU 이미지 규칙을 사용합니다.",
      folder: "이미지 폴더",
      loaded: "읽힌 이미지",
      rule: "파일명과 manifest.json 키워드가 현재 장면, 단서, 인물, 로그 문장에 포함될 때 표시됩니다.",
      empty: "아직 읽힌 사용자 장면 이미지가 없습니다.",
    },
    save: {
      title: "현재 세션",
      description: "대화 로그, 브리핑, 선택한 설정을 자동 저장합니다. 다음 접속 때 바로 이어할 수 있습니다.",
      libraryTitle: "저장 슬롯",
      libraryEmpty: "저장된 세션 슬롯이 없습니다.",
      libraryCount: (count: number) => `${count}개 세션`,
      currentBadge: "현재 진행",
      auto: "자동 저장 활성화",
      noSave: "아직 이어할 수 있는 세션이 없습니다. 시작 루트나 캐릭터로 첫 장면을 열면 자동 저장됩니다.",
      updated: "저장 시각",
      created: "생성",
      turns: (count: number) => `${count}개 턴`,
      load: "불러오기",
      saveNow: "지금 저장",
      export: "내보내기",
      import: "가져오기",
      importSuccess: "가져온 세션을 개인 슬롯에 저장했습니다.",
      importError: "세션 파일을 읽을 수 없습니다.",
      importPrivacyError: "민감 정보나 API 키 흔적이 포함된 세션 파일은 가져올 수 없습니다.",
      newSession: "새 세션 시작",
      newSessionHint: "현재 대화, 플레이어 메모, 요약 메모리, 사건 기록을 비우고 새 세션으로 돌아갑니다.",
      delete: "삭제",
      deleteLabel: "세션 삭제",
      rename: "이름 변경",
      renameSave: "저장",
      cancel: "취소",
      copy: "복사",
      copySuffix: "복사본",
      copySuccess: "세션을 개인 슬롯에 복사했습니다.",
      renameSuccess: "세션 이름을 변경했습니다.",
      completed: "완료",
      reopen: "재개",
      completedBadge: "완료",
      inProgressBadge: "진행 중",
      completedDetail: "완료된 기록",
      inProgressDetail: "진행 중인 세션",
      preparePublish: "공개 준비",
      requestPublish: "검수 요청",
      makePrivate: "비공개 전환",
      publishPendingSuccess: "자료실 공개 검수 대기 상태로 변경했습니다.",
      privateSuccess: "세션을 비공개 보관 상태로 되돌렸습니다.",
      pendingVisibility: "검수 대기",
      pendingDetail: "자료실 공개 검수 대기",
      publishTitle: "세션 공개 전 확인",
      publishIntro: "이 세션은 자료실 공개 요청 전 단계입니다. 체크한 뒤 검수 대기 상태로 저장됩니다.",
      publishConsentLibrary: "다른 사용자가 이 세션을 열람, 다운로드, 복사, 재플레이할 수 있음을 이해합니다.",
      publishConsentOfficial: "공개한 세션의 제목, 설정, 선택 기록, 요약, 캐릭터 구성, 사건 전개가 TIU 공식 콘텐츠 제작에 참고 또는 반영될 수 있음을 이해합니다.",
      publishConsentCompensation: "별도 합의가 없는 한 자동 보상, 수익 분배, 공동 저작자 표기 의무가 발생하지 않을 수 있음을 이해합니다.",
      publishConsentSafety: "이 세션에 타인의 개인정보, 저작권 침해 자료, 선정적/고어/금지 콘텐츠가 포함되지 않았음을 확인합니다.",
      officialMode: "OFFICIAL MODE",
      officialDetail: "공식 아카이브 기준",
      customMode: "USER SESSION RECORD",
      customDetail: "비공식 개인 기록",
      privateVisibility: "PRIVATE",
      privateDetail: "비공개 보관",
    },
    library: {
      title: "자료실 큐",
      description: "공개 검수 대기 세션과 개인 아카이브 상태를 한곳에서 확인합니다.",
      pendingTitle: "검수 대기",
      archiveTitle: "아카이브 요약",
      emptyPending: "검수 대기 중인 세션이 없습니다.",
      reviewHint: "저장 슬롯에서 동의 체크를 완료한 세션만 여기에 올라옵니다.",
      total: "전체",
      private: "비공개",
      pending: "대기",
      completed: "완료",
      quickActions: "빠른 처리",
    },
    usage: {
      title: "API 사용량 보호",
      description: "오늘의 호출 수와 토큰 예산을 추적해 테스트 비용이 튀지 않게 막습니다.",
      calls: "호출",
      tokenBudget: "토큰 예산",
      actual: "실측",
      estimated: "예상",
      outputCap: "출력 상한",
      cooldown: "연속 호출 대기",
      blocked: "차단",
      lastModel: "최근 모델",
      noUsage: "아직 오늘 기록된 API 호출이 없습니다.",
      ok: "정상",
      limited: "보호 작동",
      note: "한도는 .env.local의 TIU_DAILY_CALL_LIMIT, TIU_DAILY_TOKEN_LIMIT, TIU_MAX_OUTPUT_TOKENS, TIU_MIN_SECONDS_BETWEEN_CALLS로 조절할 수 있습니다.",
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
      clues: "단서",
      noClues: "아직 확정 단서 없음",
      unknown: "미확인",
      groups: "집단",
      noGroups: "아직 드러난 집단 없음",
      people: "인물 / 대화 상대",
      noPeople: "아직 대화 상대 없음",
      emotionPrefix: "감정",
      trust: "관계",
      lastSeen: "접점",
      known: "알고 있는 것",
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
      title: "2032년, TIU 세계에 진입합니다",
      body: "신화와 음모론, 여러 국가와 세력, 설명되지 않는 존재들이 뒤섞인 세계입니다.\n당신은 이곳에서 하나의 분신을 만들고, 목표를 좇거나 자유롭게 세계를 탐험하며 감춰진 비밀을 발견할 수 있습니다.\n\n당신은 어떤 선택으로 이 세계를 마주하겠습니까?",
      routeTitle: "시작 루트",
      characterTitle: "캐릭터 만들기",
      characterHelp: "이름 / 나이 / 직업(소속 등) / 소지품 순서로 만들 수 있습니다. 비워둔 항목은 AI가 세계관에 맞게 임시 배정하고, 이후 플레이 중 조정할 수 있습니다.",
      inputPlaceholder: "이름 / 나이 / 직업(소속) / 소지품",
      customCharacter: "직접 캐릭터 설정",
      customSubmit: "세션 시작",
    },
    bottom: {
      ai: "AI",
      memo: "메모",
      freeform: "질문",
      playerMemo: "플레이어 메모",
      memoPlaceholder: "짧은 단서, 의심, 지금 확인할 일을 적어두세요. 관련 장면에서 AI가 참조합니다.",
      send: "전송",
      freeformPlaceholder: "짧은 질문이나 보정만 입력하세요. 진행은 AI 추천 답변 중심으로 이어집니다.",
      scrollBottom: "맨 아래",
      scrollBottomLabel: "채팅 맨 아래로 이동",
      aiLabel: "AI 추천 답변",
      continueHint: "응답이 출력 제한으로 중간에 끊겼을 수 있습니다.",
      continueGeneration: "이어서 생성",
      continuing: "이어 쓰는 중",
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
    syncTitle: "Writing AI-GM scene",
    sceneCalc: "Applying latest choice",
    clueAlign: "Clues and dialogue",
    accessCheck: "TIU SESSION CHECK",
    accessPassword: "Test Access Password",
    accessButton: "Enter",
    accessChecking: "Checking",
    accessDefaultError: "Access check failed.",
    worldSession: "WORLD SESSION",
    tabs: {
      menu: "Menu",
      menuSummary: "Session controls",
      account: "Account",
      save: "Save / Load",
      saveEmpty: "No saved run",
      saveReady: "Continue ready",
      library: "Library Queue",
      libraryEmpty: "No review queue",
      libraryCount: (count: number) => `${count} pending`,
      usage: "Usage Guard",
      usageEmpty: "No usage today",
      playMode: "Play Mode",
      model: "Model",
      close: "Close",
      memory: "Summary Memory",
      memoryEmpty: "No long-term memory",
      memoryCount: (count: number) => `${count} saved`,
      events: "Event Log",
      eventsEmpty: "No events yet",
      eventsCount: (count: number) => `${count} logged`,
      assets: "Scene Images",
      assetsEmpty: "No images",
      assetsCount: (count: number) => `${count} loaded`,
      length: "Response Length",
    },
    account: {
      gateTitle: "Account Login",
      gateDescription: "Private tester access is confirmed first, then this account layer is used.",
      loginTab: "Login",
      signupTab: "Sign Up",
      id: "ID",
      password: "Password",
      displayName: "Display Name",
      login: "Login",
      loggingIn: "Checking",
      logout: "Log out",
      saveName: "Save name",
      savedName: "Display name saved.",
      roleAdmin: "Admin",
      signupPending: "Sign-up turns on after cloud database storage is connected. Use the temporary admin account for now.",
      adminHint: "A temporary test admin account is configured.",
      profileTitle: "Current Account",
      profileDetail: "If no character name is set, this display name is used as the default name.",
      legalLink: "Tester Notice / Privacy Info",
      authRequired: "Log in before starting the session.",
      defaultError: "Account check failed.",
    },
    consent: {
      title: "Private Test Consent",
      description: "This is a test-stage consent step before full signup and cloud storage are enabled. Confirm all items to start a session.",
      version: `Consent version ${TESTER_CONSENT_VERSION}`,
      accept: "Accept and Start",
      required: "All items required",
      legalLink: "View Full Notice",
      tester: "I understand this is a private test and features or data structures may change.",
      storage: "I understand browser storage and required cookies are used for login, saves, and memory continuity.",
      ai: "I understand player notes, summary memory, and choices may be referenced by the AI-GM for continuity.",
      safety: "I will not place forbidden content, private data, API keys, or payment information into sessions, notes, or import files.",
    },
    cookie: {
      text: "This test uses required cookies and browser storage for login, private access, and session saves.",
      action: "OK",
      link: "Details",
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
      fallbackNote: "Empty OpenAI fast/deep profiles fall back to the default model. Claude is called only when both ANTHROPIC_API_KEY and ANTHROPIC_MODEL are set.",
    },
    events: {
      title: "Event Log",
      auto: "Auto tracked",
      clear: "Clear All",
      empty: "No events have been logged yet. Scenes will add records automatically.",
      fallbackDetail: "No details confirmed",
      delete: "Delete",
    },
    assets: {
      title: "Scene Images",
      description: "User scene images are matched first; built-in TIU image rules are used only when no user image fits.",
      folder: "Image folder",
      loaded: "Loaded images",
      rule: "Shown when file names or manifest.json keywords appear in the current scene, clues, people, or logs.",
      empty: "No user scene images have been loaded yet.",
    },
    save: {
      title: "Current Session",
      description: "Auto-saves the dialogue log, briefing, and selected settings so you can continue next time.",
      libraryTitle: "Save Slots",
      libraryEmpty: "No saved session slots yet.",
      libraryCount: (count: number) => `${count} sessions`,
      currentBadge: "Current run",
      auto: "Auto-save active",
      noSave: "No playable session is saved yet. Open a first scene from a route or character to start auto-saving.",
      updated: "Saved",
      created: "Created",
      turns: (count: number) => `${count} turns`,
      load: "Load",
      saveNow: "Save now",
      export: "Export",
      import: "Import",
      importSuccess: "Imported session saved to your private slots.",
      importError: "Could not read this session file.",
      importPrivacyError: "Session files containing sensitive data or API key traces cannot be imported.",
      newSession: "New session",
      newSessionHint: "Clears the current dialogue, player memo, summary memory, and event log before starting again.",
      delete: "Delete",
      deleteLabel: "Delete session",
      rename: "Rename",
      renameSave: "Save",
      cancel: "Cancel",
      copy: "Copy",
      copySuffix: "Copy",
      copySuccess: "Session copied to your private slots.",
      renameSuccess: "Session name updated.",
      completed: "Complete",
      reopen: "Reopen",
      completedBadge: "Completed",
      inProgressBadge: "In progress",
      completedDetail: "Completed record",
      inProgressDetail: "Active session",
      preparePublish: "Prepare publish",
      requestPublish: "Request review",
      makePrivate: "Make private",
      publishPendingSuccess: "Session moved to library review pending.",
      privateSuccess: "Session returned to private archive.",
      pendingVisibility: "Review pending",
      pendingDetail: "Waiting for library review",
      publishTitle: "Before Publishing",
      publishIntro: "This is the pre-publication step. Confirm each item, then save the session as review pending.",
      publishConsentLibrary: "I understand other users may read, download, copy, and replay this session.",
      publishConsentOfficial: "I understand this session's title, settings, choices, summary, characters, and events may be referenced or adapted for TIU official content.",
      publishConsentCompensation: "I understand reference or adaptation does not automatically create compensation, revenue share, or co-author credit unless separately agreed.",
      publishConsentSafety: "I confirm this session does not include another person's private data, copyright-infringing material, sexual/gore/forbidden content.",
      officialMode: "OFFICIAL MODE",
      officialDetail: "Official archive baseline",
      customMode: "USER SESSION RECORD",
      customDetail: "Unofficial personal record",
      privateVisibility: "PRIVATE",
      privateDetail: "Private archive",
    },
    library: {
      title: "Library Queue",
      description: "Review pending sessions and personal archive status in one compact panel.",
      pendingTitle: "Review pending",
      archiveTitle: "Archive Summary",
      emptyPending: "No sessions are waiting for review.",
      reviewHint: "Only sessions confirmed from save slots appear here.",
      total: "Total",
      private: "Private",
      pending: "Pending",
      completed: "Completed",
      quickActions: "Quick Actions",
    },
    usage: {
      title: "API Usage Guard",
      description: "Tracks today's calls and token budget to prevent surprise test costs.",
      calls: "Calls",
      tokenBudget: "Token Budget",
      actual: "Actual",
      estimated: "Estimated",
      outputCap: "Output Cap",
      cooldown: "Cooldown",
      blocked: "Blocked",
      lastModel: "Last Model",
      noUsage: "No API calls have been recorded today.",
      ok: "OK",
      limited: "Guard Active",
      note: "Limits can be adjusted in .env.local with TIU_DAILY_CALL_LIMIT, TIU_DAILY_TOKEN_LIMIT, TIU_MAX_OUTPUT_TOKENS, and TIU_MIN_SECONDS_BETWEEN_CALLS.",
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
      clues: "Clues",
      noClues: "No confirmed clues yet",
      unknown: "Unknown",
      groups: "Groups",
      noGroups: "No revealed groups yet",
      people: "People / Contacts",
      noPeople: "No active contacts yet",
      emotionPrefix: "Emotion",
      trust: "Relation",
      lastSeen: "Contact",
      known: "Known",
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
      title: "2032. Enter the TIU world.",
      body: "Myths, conspiracies, nations, factions, and unexplained entities collide in one unsettled world.\nCreate a persona, pursue a goal, or wander freely in search of hidden truths.\n\nWhat choice will you make here?",
      routeTitle: "Starting Routes",
      characterTitle: "Create Character",
      characterHelp: "Use Name / Age / Occupation or Affiliation / Items. If you leave fields blank, the AI will assign temporary world-appropriate defaults that can be adjusted later.",
      inputPlaceholder: "Name / Age / Occupation / Items",
      customCharacter: "Custom character",
      customSubmit: "Start session",
    },
    bottom: {
      ai: "AI",
      memo: "Memo",
      freeform: "Ask",
      playerMemo: "Player Memo",
      memoPlaceholder: "Write short clues, doubts, or things to check. The AI can reference them when relevant.",
      send: "Send",
      freeformPlaceholder: "Use short questions or corrections. Main play continues through AI suggested replies.",
      scrollBottom: "Bottom",
      scrollBottomLabel: "Jump to latest chat",
      aiLabel: "AI suggested replies",
      continueHint: "This response may have been cut off by the output limit.",
      continueGeneration: "Continue",
      continuing: "Continuing",
    },
  },
} as const;

const ADMIN_TEXT: Record<Language, {
  tab: string;
  value: string;
  detail: string;
  title: string;
  description: string;
  refresh: string;
  loading: string;
  unavailable: string;
  checkedAt: string;
  providers: string;
  storage: string;
  assets: string;
  limits: string;
  access: string;
  ready: string;
  missing: string;
  yes: string;
  no: string;
  openai: string;
  claude: string;
  fastModel: string;
  deepModel: string;
  privateGate: string;
  accountGate: string;
  writeMode: string;
  writable: string;
  bestEffort: string;
  vercel: string;
  cloudStorage: string;
  cloudReady: string;
  cloudDisabled: string;
  cloudMisconfigured: string;
  cloudEndpoint: string;
  cloudToken: string;
  worldIndex: string;
  worldIndexSource: string;
  worldIndexFile: string;
  worldIndexEntries: string;
  worldIndexFiles: string;
  worldIndexGenerated: string;
  worldIndexTiers: string;
  localIndex: string;
  publicIndex: string;
  privateIncluded: string;
  privateExcluded: string;
  currentSession: string;
  savedSessions: string;
  reviewPending: string;
  privateSessions: string;
  completedSessions: string;
  imageFiles: string;
  manifestItems: string;
  dailyCalls: string;
  dailyTokens: string;
  outputCap: string;
  cooldown: string;
  context: string;
}> = {
  ko: {
    tab: "운영 체크",
    value: "ADMIN",
    detail: "배포/키/저장/이미지 상태를 관리자용으로 확인",
    title: "운영 진단",
    description: "API 키가 직접 노출되지 않도록 준비 여부와 숫자만 보여줍니다.",
    refresh: "새로고침",
    loading: "진단 정보 확인 중",
    unavailable: "진단 정보를 불러오지 못했습니다.",
    checkedAt: "확인 시각",
    providers: "모델 연결",
    storage: "저장 상태",
    assets: "장면 이미지",
    limits: "사용 제한",
    access: "접속 보호",
    ready: "준비됨",
    missing: "미설정",
    yes: "예",
    no: "아니오",
    openai: "OpenAI",
    claude: "Claude",
    fastModel: "빠른 모델",
    deepModel: "깊은 모델",
    privateGate: "비밀번호 게이트",
    accountGate: "계정 게이트",
    writeMode: "서버 파일 기록",
    writable: "기록 가능",
    bestEffort: "브라우저 저장 우선",
    vercel: "Vercel 환경",
    cloudStorage: "클라우드 저장",
    cloudReady: "연결 준비",
    cloudDisabled: "비활성",
    cloudMisconfigured: "설정 필요",
    cloudEndpoint: "엔드포인트",
    cloudToken: "토큰",
    worldIndex: "세계관 색인",
    worldIndexSource: "색인 종류",
    worldIndexFile: "색인 파일",
    worldIndexEntries: "검색 조각",
    worldIndexFiles: "원본 MD",
    worldIndexGenerated: "생성 시각",
    worldIndexTiers: "공개/제한/비공개",
    localIndex: "로컬 색인",
    publicIndex: "배포 색인",
    privateIncluded: "비공개 포함",
    privateExcluded: "비공개 제외",
    currentSession: "현재 세션",
    savedSessions: "저장 슬롯",
    reviewPending: "검토 대기",
    privateSessions: "비공개",
    completedSessions: "완료",
    imageFiles: "이미지 파일",
    manifestItems: "매니페스트 항목",
    dailyCalls: "일일 호출",
    dailyTokens: "일일 토큰",
    outputCap: "출력 상한",
    cooldown: "호출 간격",
    context: "문맥 메시지",
  },
  en: {
    tab: "Ops Check",
    value: "ADMIN",
    detail: "Admin-only deployment, key, storage, and image diagnostics",
    title: "Operations Diagnostics",
    description: "Shows readiness and counts without exposing API keys.",
    refresh: "Refresh",
    loading: "Checking diagnostics",
    unavailable: "Could not load diagnostics.",
    checkedAt: "Checked",
    providers: "Model Connections",
    storage: "Storage Status",
    assets: "Scene Images",
    limits: "Usage Limits",
    access: "Access Protection",
    ready: "Ready",
    missing: "Missing",
    yes: "Yes",
    no: "No",
    openai: "OpenAI",
    claude: "Claude",
    fastModel: "Fast model",
    deepModel: "Deep model",
    privateGate: "Password gate",
    accountGate: "Account gate",
    writeMode: "Server file writes",
    writable: "Writable",
    bestEffort: "Browser-first",
    vercel: "Vercel environment",
    cloudStorage: "Cloud storage",
    cloudReady: "Ready",
    cloudDisabled: "Disabled",
    cloudMisconfigured: "Needs setup",
    cloudEndpoint: "Endpoint",
    cloudToken: "Token",
    worldIndex: "World Index",
    worldIndexSource: "Index source",
    worldIndexFile: "Index file",
    worldIndexEntries: "Snippets",
    worldIndexFiles: "Source MD files",
    worldIndexGenerated: "Generated",
    worldIndexTiers: "Public/restricted/private",
    localIndex: "Local index",
    publicIndex: "Deploy index",
    privateIncluded: "Private included",
    privateExcluded: "Private excluded",
    currentSession: "Current session",
    savedSessions: "Saved slots",
    reviewPending: "Review pending",
    privateSessions: "Private",
    completedSessions: "Completed",
    imageFiles: "Image files",
    manifestItems: "Manifest items",
    dailyCalls: "Daily calls",
    dailyTokens: "Daily tokens",
    outputCap: "Output cap",
    cooldown: "Cooldown",
    context: "Context messages",
  },
};

const FEEDBACK_CATEGORIES: FeedbackCategory[] = ["bug", "story", "ui", "performance", "other"];
const FEEDBACK_STATUS_OPTIONS: FeedbackStatus[] = ["open", "reviewed", "resolved"];

const FEEDBACK_TEXT: Record<Language, {
  tab: string;
  value: (open: number, total: number) => string;
  detail: string;
  title: string;
  description: string;
  category: string;
  message: string;
  placeholder: string;
  submit: string;
  submitting: string;
  saved: string;
  localSaved: string;
  error: string;
  adminTitle: string;
  adminDescription: string;
  refresh: string;
  empty: string;
  recent: string;
  status: Record<FeedbackStatus, string>;
  categories: Record<FeedbackCategory, string>;
}> = {
  ko: {
    tab: "피드백",
    value: (open, total) => (total > 0 ? `${open}/${total} 열림` : "없음"),
    detail: "버그, 몰입감, UI, 속도 문제를 테스트 기록으로 남김",
    title: "테스터 피드백",
    description: "현재 장면과 세션 정보 일부를 함께 보내 관리자가 재현하기 쉽게 만듭니다.",
    category: "분류",
    message: "내용",
    placeholder: "무엇이 어색했는지, 어디에서 막혔는지, 기대한 흐름을 짧게 적어주세요.",
    submit: "피드백 보내기",
    submitting: "저장 중",
    saved: "피드백을 저장했습니다.",
    localSaved: "서버 저장은 실패했지만 이 브라우저에 피드백을 남겼습니다.",
    error: "피드백을 저장하지 못했습니다.",
    adminTitle: "최근 피드백",
    adminDescription: "관리자 계정에서는 서버에 미러링된 피드백 상태를 변경할 수 있습니다.",
    refresh: "목록 새로고침",
    empty: "아직 피드백이 없습니다.",
    recent: "최근 장면",
    status: {
      open: "열림",
      reviewed: "검토",
      resolved: "해결",
    },
    categories: {
      bug: "버그",
      story: "스토리",
      ui: "UI",
      performance: "속도",
      other: "기타",
    },
  },
  en: {
    tab: "Feedback",
    value: (open, total) => (total > 0 ? `${open}/${total} open` : "None"),
    detail: "Log bugs, immersion issues, UI problems, and performance notes",
    title: "Tester Feedback",
    description: "Sends a small scene/session snapshot so admins can reproduce the issue.",
    category: "Category",
    message: "Message",
    placeholder: "Briefly note what felt wrong, where you got stuck, or what you expected to happen.",
    submit: "Send Feedback",
    submitting: "Saving",
    saved: "Feedback saved.",
    localSaved: "Server save failed, but this browser kept the feedback.",
    error: "Could not save feedback.",
    adminTitle: "Recent Feedback",
    adminDescription: "Admin accounts can update the status of server-mirrored feedback.",
    refresh: "Refresh List",
    empty: "No feedback yet.",
    recent: "Recent scene",
    status: {
      open: "Open",
      reviewed: "Reviewed",
      resolved: "Resolved",
    },
    categories: {
      bug: "Bug",
      story: "Story",
      ui: "UI",
      performance: "Speed",
      other: "Other",
    },
  },
};

const ASSET_BASE = "/assets/tiu";
const INTRO_ASSET_BASE = "/assets/intro";

const STARTER_ROUTES = [
  {
    title: "한국 방벽 내부",
    role: "민간 조사 보조원",
    tone: "생활 / 봉쇄 / 주민 신고",
    guide: "아이 없는 집에서 아이 목소리 신고가 반복됩니다. 그런데 생활구 기록은 아무 일도 없다는 듯 조용합니다.",
    objective: "첫 물음: 거짓말하는 쪽은 신고자일까, 기록일까, 아니면 방 안의 무언가일까.",
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
    guide: "폐기된 문서가 당신 계정으로 되살아납니다. 요청 시각은 당신이 아직 출근하지 않았던 시간입니다.",
    objective: "첫 물음: 누가 당신 이름을 빌렸고, 왜 이 문서만 다시 열리게 했을까.",
    prompt: "START_ROUTE:KR_INIT_001_RECORDS",
    accent: "bg-amber-400",
    cardClass: "border-amber-500/35 bg-amber-950/10 hover:border-amber-400/70 hover:bg-amber-950/25",
    titleClass: "text-amber-100",
    image: `${ASSET_BASE}/dprk-cctv-03.webp`,
    signal: "ORACLE NODE-04",
  },
  {
    title: "남극 거대공동 현장 파견",
    role: "계약 분석관",
    tone: "극지 현장 / 지도 오류 / 격리",
    guide: "파견 경로가 세 번 바뀌었습니다. 승인자는 없고, 교육 자료에는 누군가 손글씨로 경고를 남겼습니다.",
    objective: "첫 물음: 지도와 현장 중 무엇을 믿어야 하고, 누가 돌아오지 말라고 적었을까.",
    prompt: "START_ROUTE:L3_FIELD_ANALYST",
    accent: "bg-violet-400",
    cardClass: "border-violet-500/35 bg-violet-950/10 hover:border-violet-400/70 hover:bg-violet-950/25",
    titleClass: "text-violet-100",
    image: `${ASSET_BASE}/antarctic-gate.webp`,
    signal: "ANTARCTIC FIELD ANOMALY",
  },
] as const;

const CHARACTER_EXAMPLES = [
  "이름: 정아랑 / 나이: 29 / 직업(소속): 마이더스손 괴담 조사 기자 / 소지품: 녹음기, 취재수첩, 방수 손전등",
  "이름: 강지훈 / 나이: 34 / 직업(소속): 폐기 문서 검수 계약직 / 소지품: 임시 출입증, 보조 배터리, 낡은 USB",
  "이름: 한유진 / 나이: 31 / 직업(소속): 극지 현장 지원팀 분석관 / 소지품: 지도 단말기, 필름 카메라, 응급 파우치",
] as const;

const CHARACTER_EXAMPLES_EN = [
  "Name: Arang Jung / Age: 29 / Occupation: Midas-Hand urban legend reporter / Items: recorder, field notebook, waterproof flashlight",
  "Name: Jihoon Kang / Age: 34 / Occupation: Contract archive disposal reviewer / Items: temporary pass, power bank, old USB drive",
  "Name: Yujin Han / Age: 31 / Occupation: polar field support analyst / Items: map terminal, film camera, emergency pouch",
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
    guide: "A child-voice report keeps coming from an apartment with no child. The living-zone records stay calmly silent.",
    objective: "First question: is the caller lying, are the records wrong, or is something in the room answering?",
  },
  "START_ROUTE:KR_INIT_001_RECORDS": {
    title: "KR-INIT-001",
    role: "Residual Records Keeper",
    tone: "Documents / deletion logs / concealment",
    guide: "A destroyed file restores itself under your account. The timestamp says it happened before you arrived.",
    objective: "First question: who borrowed your name, and why did this file need to be reopened?",
  },
  "START_ROUTE:L3_FIELD_ANALYST": {
    title: "Antarctic Hollow Dispatch",
    role: "Contract Analyst",
    tone: "Polar fieldwork / map errors / quarantine",
    guide: "Your entry route changed three times. No one approved it, and a handwritten warning waits inside the training packet.",
    objective: "First question: what should you trust when the map and the site disagree?",
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
  {
    id: "claude",
    title: "Claude",
    summary: "Anthropic 연결 준비",
    detail: "결제/API 권한이 해결된 뒤 ANTHROPIC_API_KEY와 ANTHROPIC_MODEL을 넣으면 사용합니다.",
    envKey: "ANTHROPIC_MODEL",
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
  claude: {
    title: "Claude",
    summary: "Anthropic-ready",
    detail: "After billing/API access is fixed, set ANTHROPIC_API_KEY and ANTHROPIC_MODEL to use it.",
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
    detail: "남극 거대공동 조사 좌표",
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

function formatUsageNumber(value: number, language: Language): string {
  return new Intl.NumberFormat(language === "en" ? "en-US" : "ko-KR").format(Math.max(0, Math.round(value || 0)));
}

function usagePercent(value: number, limit: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(limit) || limit <= 0) return 0;
  return Math.min(100, Math.round((value / limit) * 100));
}

function getServerSyncStatusText(status: ServerSyncStatus, language: Language) {
  const isEnglish = language === "en";

  if (status === "syncing") {
    return {
      chip: isEnglish ? "Syncing" : "동기화 중",
      title: isEnglish ? "Syncing local run" : "세션 동기화 중",
      detail: isEnglish ? "Saving the latest local state to the server mirror." : "현재 진행을 서버 미러에 저장하는 중입니다.",
      className: "border-cyan-400/30 bg-cyan-950/20 text-cyan-100",
    };
  }
  if (status === "synced") {
    return {
      chip: isEnglish ? "Synced" : "동기화됨",
      title: isEnglish ? "Server mirror updated" : "서버 미러 저장됨",
      detail: isEnglish ? "This device save and the local server mirror are aligned." : "이 기기 저장과 로컬 서버 미러가 맞춰졌습니다.",
      className: "border-emerald-400/30 bg-emerald-950/20 text-emerald-100",
    };
  }
  if (status === "local_only") {
    return {
      chip: isEnglish ? "Local only" : "기기 저장",
      title: isEnglish ? "Local save is active" : "이 기기 저장으로 유지 중",
      detail: isEnglish
        ? "The server mirror is not durable here, but the browser save still keeps this run playable."
        : "현재 환경에서는 서버 미러가 영구 저장되지 않을 수 있지만, 브라우저 저장으로 이어하기는 유지됩니다.",
      className: "border-amber-400/30 bg-amber-950/20 text-amber-100",
    };
  }
  if (status === "error") {
    return {
      chip: isEnglish ? "Sync issue" : "동기화 확인",
      title: isEnglish ? "Server mirror was not updated" : "서버 미러 저장 확인 필요",
      detail: isEnglish
        ? "Gameplay can continue from this device. Export a session file before switching devices."
        : "이 기기에서는 계속 플레이할 수 있습니다. 다른 기기로 옮기기 전에는 세션 파일을 내보내세요.",
      className: "border-red-400/30 bg-red-950/20 text-red-100",
    };
  }

  return {
    chip: isEnglish ? "Local ready" : "로컬 준비",
    title: isEnglish ? "Local save ready" : "로컬 저장 준비",
    detail: isEnglish ? "A server mirror will update after the first playable scene." : "첫 장면이 열린 뒤 서버 미러 동기화를 시도합니다.",
    className: "border-zinc-700 bg-zinc-900/60 text-zinc-400",
  };
}

function normalizeDifficulty(value: string | null): DifficultyMode {
  if (value === "story" || value === "observed") return value;
  return "traveler";
}

function normalizeModelProfile(value: string | null): ModelProfile {
  if (value === "fast" || value === "deep" || value === "claude") return value;
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

function normalizeFeedbackCategory(value: unknown): FeedbackCategory {
  if (value === "bug" || value === "story" || value === "ui" || value === "performance") return value;
  return "other";
}

function normalizeFeedbackStatus(value: unknown): FeedbackStatus {
  if (value === "reviewed" || value === "resolved") return value;
  return "open";
}

function normalizeTesterFeedbackItem(value: unknown): TesterFeedbackItem | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const message = String(record.message ?? "").replace(/\s+/g, " ").trim().slice(0, TESTER_FEEDBACK_MESSAGE_LIMIT);
  if (!message) return null;

  const now = new Date().toISOString();
  return {
    id: typeof record.id === "string" ? record.id.slice(0, 90) : `local-feedback-${Date.now()}`,
    category: normalizeFeedbackCategory(record.category),
    status: normalizeFeedbackStatus(record.status),
    message,
    accountId: typeof record.accountId === "string" ? record.accountId.slice(0, 80) : undefined,
    accountName: typeof record.accountName === "string" ? record.accountName.slice(0, 40) : undefined,
    sessionId: typeof record.sessionId === "string" ? record.sessionId.slice(0, 90) : undefined,
    sessionTitle: typeof record.sessionTitle === "string" ? record.sessionTitle.slice(0, 140) : undefined,
    turnCount: typeof record.turnCount === "number" && Number.isFinite(record.turnCount)
      ? Math.max(0, Math.round(record.turnCount))
      : undefined,
    context: record.context && typeof record.context === "object" && !Array.isArray(record.context)
      ? (record.context as Record<string, unknown>)
      : undefined,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
  };
}

function parseTesterFeedbackItems(saved: string | null): TesterFeedbackItem[] {
  if (!saved) return [];

  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeTesterFeedbackItem)
      .filter((item): item is TesterFeedbackItem => item !== null)
      .slice(0, TESTER_FEEDBACK_LIMIT);
  } catch {
    return [];
  }
}

function mergeTesterFeedbackItems(
  current: TesterFeedbackItem[],
  incoming: TesterFeedbackItem[],
): TesterFeedbackItem[] {
  const byId = new Map<string, TesterFeedbackItem>();
  for (const item of [...incoming, ...current]) {
    byId.set(item.id, item);
  }
  return Array.from(byId.values())
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, TESTER_FEEDBACK_LIMIT);
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
    allow_freeform: record.allow_freeform === true
      && /\[(?:Question|Freeform|Ask)\]|(?:짧은|직접)\s*(?:질문|입력|보정)|질문을\s*입력|궁금한\s*점을\s*직접|직접\s*묻고\s*싶은|ask a short question|type a question|custom question|brief correction/i.test(`${raw}\n${narrative}`),
  };

  if (record.briefing && typeof record.briefing === "object") {
    response.briefing = record.briefing as GameResponse["briefing"];
  }
  if (record.engine && typeof record.engine === "object") {
    response.engine = record.engine as GameResponse["engine"];
  }
  if (Array.isArray(record.memory_updates)) {
    response.memory_updates = record.memory_updates
      .map((item) => String(item).trim().slice(0, SUMMARY_MEMORY_LIMIT))
      .filter(Boolean)
      .slice(0, 3);
  }
  if (typeof record.truncated === "boolean") response.truncated = record.truncated;
  if (typeof record.continuation === "boolean") response.continuation = record.continuation;
  if (typeof record.continuation_of === "string") response.continuation_of = record.continuation_of;

  return response;
}

function normalizeTurn(value: unknown): Turn | null {
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

function createSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeFileName(value: string): string {
  const safe = value
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 60)
    .replace(/^_+|_+$/g, "");

  return safe || "tiu-session";
}

function normalizeSessionImportKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, "");
}

function hasForbiddenSessionImportField(value: unknown, depth = 0): boolean {
  if (depth > 8 || value === null || value === undefined) return false;

  if (typeof value === "string") {
    return /(?:OPENAI|ANTHROPIC)_API_KEY/i.test(value) || /sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}/.test(value);
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasForbiddenSessionImportField(item, depth + 1));
  }

  if (typeof value !== "object") return false;

  return Object.entries(value as Record<string, unknown>).some(([key, item]) => {
    if (FORBIDDEN_SESSION_IMPORT_KEYS.has(normalizeSessionImportKey(key))) return true;
    return hasForbiddenSessionImportField(item, depth + 1);
  });
}

function inferSessionModeFromTurns(turns: Turn[]): SessionMode {
  const source = turns
    .filter((turn): turn is Extract<Turn, { role: "user" }> => turn.role === "user")
    .map((turn) => `${turn.apiContent ?? ""}\n${turn.content}`)
    .join("\n");

  return /START_ROUTE:|한국 방벽 내부|KR-INIT-001|남극|거대공동|Korean Barrier|Antarctic Hollow/i.test(source)
    ? "official"
    : "custom";
}

function normalizeSessionMode(value: unknown, turns: Turn[]): SessionMode {
  if (value === "official" || value === "custom") return value;
  return inferSessionModeFromTurns(turns);
}

function normalizeSessionStatus(value: unknown): SessionStatus {
  return value === "completed" ? "completed" : "in_progress";
}

function normalizeSessionVisibility(value: unknown): SessionVisibility {
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

function normalizeContentTier(value: unknown): ContentTier {
  return value === "teen" ? "teen" : "teen";
}

function normalizeAccountProfile(value: unknown): AccountProfile | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim().slice(0, 80) : "";
  const displayName = typeof record.displayName === "string"
    ? record.displayName.replace(/\s+/g, " ").trim().slice(0, 24)
    : "";
  const role = record.role === "admin" ? "admin" : null;
  if (!id || !displayName || !role) return null;

  return { id, displayName, role };
}

function normalizeAccountDisplayName(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 24);
}

function hasAcceptedTesterConsent(saved: string | null): boolean {
  if (!saved) return false;

  try {
    const parsed = JSON.parse(saved) as Record<string, unknown>;
    return parsed.version === TESTER_CONSENT_VERSION && typeof parsed.acceptedAt === "string";
  } catch {
    return false;
  }
}

function getSessionModeText(mode: SessionMode, labels: (typeof UI_TEXT)[Language]["save"]) {
  return mode === "official"
    ? { title: labels.officialMode, detail: labels.officialDetail }
    : { title: labels.customMode, detail: labels.customDetail };
}

function getSessionStatusText(status: SessionStatus, labels: (typeof UI_TEXT)[Language]["save"]) {
  return status === "completed"
    ? { title: labels.completedBadge, detail: labels.completedDetail }
    : { title: labels.inProgressBadge, detail: labels.inProgressDetail };
}

function getSessionVisibilityText(visibility: SessionVisibility, labels: (typeof UI_TEXT)[Language]["save"]) {
  if (visibility === "private") return { title: labels.privateVisibility, detail: labels.privateDetail };
  if (visibility === "uploaded_pending") return { title: labels.pendingVisibility, detail: labels.pendingDetail };

  return { title: visibility.replace(/_/g, " ").toUpperCase(), detail: visibility.replace(/_/g, " ") };
}

function getPublishConsentLabel(key: PublishConsentKey, labels: (typeof UI_TEXT)[Language]["save"]) {
  if (key === "library") return labels.publishConsentLibrary;
  if (key === "official") return labels.publishConsentOfficial;
  if (key === "compensation") return labels.publishConsentCompensation;
  return labels.publishConsentSafety;
}

function parseSessionSave(saved: string | null): SessionSave | null {
  if (!saved) return null;

  try {
    const parsed = JSON.parse(saved) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;

    const turns = Array.isArray(parsed.turns)
      ? parsed.turns.map(normalizeTurn).filter((turn): turn is Turn => turn !== null)
      : [];
    if (turns.length === 0) return null;

    return {
      id: typeof parsed.id === "string" && parsed.id.trim() ? parsed.id.trim().slice(0, 80) : createSessionId(),
      version: 1,
      title: typeof parsed.title === "string" ? parsed.title.slice(0, 80) : "WORLD SESSION",
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      turns,
      memo: typeof parsed.memo === "string" ? parsed.memo.slice(0, PLAYER_MEMO_LIMIT) : "",
      memoryItems: Array.isArray(parsed.memoryItems)
        ? parseSavedMemoryItems(JSON.stringify(parsed.memoryItems), null)
        : [],
      eventLogItems: Array.isArray(parsed.eventLogItems)
        ? parseSavedEventLogItems(JSON.stringify(parsed.eventLogItems))
        : [],
      mode: normalizeSessionMode(parsed.mode, turns),
      status: normalizeSessionStatus(parsed.status),
      visibility: normalizeSessionVisibility(parsed.visibility),
      contentTier: normalizeContentTier(parsed.contentTier),
      accountId: typeof parsed.accountId === "string" ? parsed.accountId.trim().slice(0, 80) : undefined,
      accountName: typeof parsed.accountName === "string" ? normalizeAccountDisplayName(parsed.accountName) : undefined,
      difficultyMode: normalizeDifficulty(typeof parsed.difficultyMode === "string" ? parsed.difficultyMode : null),
      modelProfile: normalizeModelProfile(typeof parsed.modelProfile === "string" ? parsed.modelProfile : null),
      outputTokens: normalizeTokenValue(Number(parsed.outputTokens) || DEFAULT_OUTPUT_TOKENS),
      language: normalizeLanguage(typeof parsed.language === "string" ? parsed.language : null),
    };
  } catch {
    return null;
  }
}

function parseSessionLibrary(saved: string | null): SessionSave[] {
  if (!saved) return [];

  try {
    const parsed = JSON.parse(saved);
    const items = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { items?: unknown }).items)
        ? (parsed as { items: unknown[] }).items
        : [];

    return normalizeSessionLibrary(items);
  } catch {
    return [];
  }
}

function normalizeSessionLibrary(items: unknown[]): SessionSave[] {
  const seen = new Set<string>();

  return items
    .map((item) => {
      const serialized = JSON.stringify(item);
      return parseSessionSave(typeof serialized === "string" ? serialized : null);
    })
    .filter((item): item is SessionSave => item !== null)
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, SESSION_LIBRARY_LIMIT);
}

function upsertSessionLibrary(items: SessionSave[], save: SessionSave): SessionSave[] {
  return normalizeSessionLibrary([save, ...items.filter((item) => item.id !== save.id)]);
}

function createSessionCopyTitle(title: string, language: Language): string {
  const suffix = language === "en" ? "Copy" : "복사본";
  const baseTitle = title.trim().slice(0, 64) || SESSION_TITLE;
  return `${baseTitle} ${suffix}`.slice(0, 80);
}

function formatSavedAt(value: string, language: Language): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(language === "en" ? "en-US" : "ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
      ...(briefing?.clues ?? []).map((clue) => clue.title),
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
    response.briefing?.clues.map((clue) => `${clue.title} ${clue.detail}`).join("\n") ?? "",
    response.briefing?.logs.join("\n") ?? "",
    response.briefing?.people.map((person) => `${person.name} ${person.detail}`).join("\n") ?? "",
  ].join("\n");
}

function normalizeSceneAssetText(value: string): string {
  return value.toLowerCase();
}

function scoreUserSceneImage(source: string, image: UserSceneImage): number {
  const normalizedSource = normalizeSceneAssetText(source);
  const keywords = image.keywords
    .map((keyword) => normalizeSceneAssetText(keyword.trim()))
    .filter((keyword) => keyword.length >= 2);

  if (keywords.length === 0) return 0;

  const matched = keywords.filter((keyword) => normalizedSource.includes(keyword));
  if (matched.length === 0) return 0;

  const longest = matched.reduce((max, keyword) => Math.max(max, keyword.length), 0);
  return matched.length * 100 + longest + image.priority;
}

function normalizeUserSceneImages(value: unknown): UserSceneImage[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): UserSceneImage | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const src = typeof record.src === "string" ? record.src : "";
      if (!src.startsWith("/assets/user-scenes/")) return null;

      const title = typeof record.title === "string" && record.title.trim()
        ? record.title.trim().slice(0, 80)
        : "USER SCENE";
      const detail = typeof record.detail === "string" && record.detail.trim()
        ? record.detail.trim().slice(0, 120)
        : "User supplied scene image";
      const keywords = Array.isArray(record.keywords)
        ? record.keywords
            .map((keyword) => String(keyword).trim().slice(0, 40))
            .filter(Boolean)
            .slice(0, 24)
        : [];
      const priority = Math.max(0, Math.min(999, Math.round(Number(record.priority) || 0)));

      return { src, title, detail, keywords, priority };
    })
    .filter((item): item is UserSceneImage => item !== null)
    .slice(0, 200);
}

function pickSceneImage(response: GameResponse, userSceneImages: UserSceneImage[]): SceneImageMatch | null {
  if (/^\s*\[오류\]/.test(response.narrative)) return null;

  const source = sceneImageSource(response);
  const userMatch = userSceneImages
    .map((image) => ({ image, score: scoreUserSceneImage(source, image) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.image;
  if (userMatch) {
    return {
      src: userMatch.src,
      title: userMatch.title,
      detail: userMatch.detail,
    };
  }

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
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={item}
          className="rounded border border-zinc-800 bg-zinc-900/50 px-1.5 py-0.5 text-[10px] text-zinc-300"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function BriefingChip({
  label,
  value,
  className = "border-zinc-800 bg-zinc-900/60 text-zinc-200",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex min-h-6 items-center gap-1 rounded border px-1.5 py-0.5 ${className}`}>
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
      <span className="text-[11px] font-medium">{value}</span>
    </span>
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
  const clues = briefing.clues ?? [];
  const primaryThought = briefing.goals[0] ?? labels.noThought;
  const inventory = briefing.inventory ?? [];
  const groups = briefing.groups ?? [];
  const people = briefing.people ?? [];
  const logs = briefing.logs ?? [];
  const detailCount = clues.length + people.length + inventory.length + groups.length + logs.length;

  return (
    <div className="rounded-md border border-zinc-800/70 bg-zinc-950/45 text-xs shadow-[0_6px_18px_rgba(0,0,0,0.18)]">
      <div className="flex flex-wrap items-center gap-1 border-b border-zinc-900/80 px-2.5 py-1.5">
        <span className="mr-0.5 text-[11px] font-semibold tracking-wide text-zinc-300">
          {labels.title}
        </span>
        <BriefingChip label={labels.time} value={briefing.time} />
        <BriefingChip
          label={labels.status}
          value={translateBriefingValue(briefing.status, language)}
          className="border-amber-900/50 bg-amber-950/15 text-amber-100"
        />
        <BriefingChip
          label={labels.emotion}
          value={translateBriefingValue(briefing.emotion, language)}
          className="border-violet-900/50 bg-violet-950/15 text-violet-100"
        />
      </div>

      <div className="px-3 py-2">
        <span className="mr-2 text-[11px] font-medium text-blue-200">{labels.thought}</span>
        <span className="text-[12px] leading-relaxed text-zinc-200">{primaryThought}</span>
      </div>

      <details className="border-t border-zinc-900/80 px-2.5 py-1.5">
        <summary className="cursor-pointer select-none text-[11px] font-medium text-zinc-400">
          {labels.clues} {clues.length} · {labels.people} {people.length} · {labels.inventory} {inventory.length}
          {detailCount === 0 ? "" : ` · ${labels.logs} ${logs.length}`}
        </summary>
        <div className="mt-2 grid gap-2">
          <section className="rounded border border-cyan-900/30 bg-cyan-950/10 px-2 py-1.5">
            <div className="mb-1 text-[11px] font-medium text-cyan-100">
              {labels.clues} <span className="text-cyan-400/70">{clues.length}</span>
            </div>
            <div className="grid gap-1.5">
              {clues.length === 0 ? (
                <span className="text-[11px] text-zinc-500">{labels.noClues}</span>
              ) : (
                clues.map((clue) => (
                  <div
                    key={`${clue.title}-${clue.status}`}
                    className="rounded border border-cyan-900/40 bg-black/25 px-2 py-1.5"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-zinc-100">{clue.title}</span>
                      <span className="rounded border border-cyan-800/50 px-1.5 py-0.5 text-[10px] text-cyan-200">
                        {clue.status}
                      </span>
                      <span className="text-[10px] text-zinc-500">{clue.source}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{clue.detail}</p>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded border border-zinc-900 bg-zinc-900/20 px-2 py-1.5">
            <div className="mb-1 text-[11px] font-medium text-zinc-300">
              {labels.people} <span className="text-zinc-500">{people.length}</span>
            </div>
            <div className="space-y-1.5">
              {people.length === 0 ? (
                <span className="text-[11px] text-zinc-500">{labels.noPeople}</span>
              ) : (
                people.map((person) => (
                  <div
                    key={`${person.name}-${person.emotion}-${person.detail}`}
                    className="rounded border border-zinc-800 bg-zinc-950/45 px-2 py-1.5 text-zinc-300"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-zinc-100">{person.name}</span>
                      <span className="rounded border border-violet-900/50 px-1.5 py-0.5 text-[10px] text-violet-200">
                        {labels.emotionPrefix}: {translateBriefingValue(person.emotion, language)}
                      </span>
                      {person.trust && (
                        <span className="rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                          {labels.trust}: {person.trust}
                        </span>
                      )}
                    </div>
                    {person.detail && <p className="mt-1 text-[11px] text-zinc-500">{person.detail}</p>}
                    {(person.lastSeen || person.known) && (
                      <div className="mt-1 grid gap-1 text-[11px] text-zinc-500 sm:grid-cols-2">
                        {person.lastSeen && <span>{labels.lastSeen}: {person.lastSeen}</span>}
                        {person.known && <span>{labels.known}: {person.known}</span>}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <div className="grid gap-2 sm:grid-cols-2">
            <section className="rounded border border-zinc-900 bg-zinc-900/20 px-2 py-1.5">
              <div className="mb-1 text-[11px] font-medium text-zinc-300">
                {labels.inventory} <span className="text-zinc-500">{inventory.length}</span>
              </div>
              <BriefingList items={inventory} empty={labels.unknown} />
            </section>
            <section className="rounded border border-zinc-900 bg-zinc-900/20 px-2 py-1.5">
              <div className="mb-1 text-[11px] font-medium text-zinc-300">
                {labels.groups} <span className="text-zinc-500">{groups.length}</span>
              </div>
              <BriefingList items={groups} empty={labels.noGroups} />
            </section>
          </div>

          <section className="rounded border border-zinc-900 bg-zinc-900/20 px-2 py-1.5">
            <div className="mb-1 text-[11px] font-medium text-zinc-300">
              {labels.logs} <span className="text-zinc-500">{logs.length}</span>
            </div>
            <div className="space-y-1 text-[11px] text-zinc-500">
              {logs.length === 0 ? (
                <span>{labels.unknown}</span>
              ) : (
                logs.map((log) => <div key={log}>{log}</div>)
              )}
            </div>
          </section>
        </div>
      </details>
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

function AccountGateScreen({
  language,
  labels,
  loginMode,
  loginId,
  loginPassword,
  error,
  loading,
  onLanguageChange,
  onLoginModeChange,
  onLoginIdChange,
  onLoginPasswordChange,
  onSubmit,
}: {
  language: Language;
  labels: (typeof UI_TEXT)[Language]["account"];
  loginMode: "login" | "signup";
  loginId: string;
  loginPassword: string;
  error: string;
  loading: boolean;
  onLanguageChange: (language: Language) => void;
  onLoginModeChange: (mode: "login" | "signup") => void;
  onLoginIdChange: (value: string) => void;
  onLoginPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <div className="absolute right-4 top-4">
        <LanguageToggle language={language} onChange={onLanguageChange} />
      </div>
      <section className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900/70 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
        <div className="mb-5">
          <TiuLogoMark sessionLabel="ACCOUNT" />
        </div>
        <div className="mb-4">
          <h1 className="text-lg font-bold text-zinc-100">{labels.gateTitle}</h1>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">{labels.gateDescription}</p>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-md border border-zinc-800 bg-zinc-950 p-1">
          {(["login", "signup"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onLoginModeChange(mode)}
              className={`rounded px-3 py-2 text-xs font-semibold transition-colors ${
                loginMode === mode
                  ? "bg-emerald-400 text-black"
                  : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              {mode === "login" ? labels.loginTab : labels.signupTab}
            </button>
          ))}
        </div>

        {loginMode === "login" ? (
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block text-xs font-medium text-zinc-400" htmlFor="account-id">
              {labels.id}
              <input
                id="account-id"
                type="text"
                value={loginId}
                onChange={(event) => onLoginIdChange(event.target.value)}
                autoComplete="username"
                className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-zinc-400" htmlFor="account-password">
              {labels.password}
              <input
                id="account-password"
                type="password"
                value={loginPassword}
                onChange={(event) => onLoginPasswordChange(event.target.value)}
                autoComplete="current-password"
                className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <p className="rounded border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs leading-relaxed text-zinc-500">
              {labels.adminHint}
            </p>
            <a
              href="/legal"
              className="block text-xs font-medium text-emerald-300 hover:text-emerald-100"
            >
              {labels.legalLink}
            </a>
            {error && <p className="text-xs text-red-300">{error}</p>}
            <button
              type="submit"
              disabled={loading || !loginId.trim() || !loginPassword}
              className="w-full rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {loading ? labels.loggingIn : labels.login}
            </button>
          </form>
        ) : (
          <div className="rounded-md border border-dashed border-zinc-700 bg-zinc-950/60 px-3 py-4 text-sm leading-relaxed text-zinc-400">
            {labels.signupPending}
          </div>
        )}
      </section>
    </main>
  );
}

function TesterConsentScreen({
  language,
  labels,
  consents,
  onLanguageChange,
  onToggle,
  onAccept,
}: {
  language: Language;
  labels: (typeof UI_TEXT)[Language]["consent"];
  consents: Record<TesterConsentKey, boolean>;
  onLanguageChange: (language: Language) => void;
  onToggle: (key: TesterConsentKey, checked: boolean) => void;
  onAccept: () => void;
}) {
  const allAccepted = TESTER_CONSENT_KEYS.every((key) => consents[key]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-950 px-4 py-6 text-zinc-100">
      <div className="absolute right-4 top-4">
        <LanguageToggle language={language} onChange={onLanguageChange} />
      </div>
      <section className="w-full max-w-lg rounded-lg border border-zinc-800 bg-zinc-900/75 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.36)]">
        <div className="mb-5">
          <TiuLogoMark sessionLabel="TEST NOTICE" />
        </div>
        <div className="mb-4">
          <p className="text-[10px] font-semibold tracking-[0.24em] text-emerald-300">{labels.version}</p>
          <h1 className="mt-2 text-lg font-bold text-zinc-100">{labels.title}</h1>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">{labels.description}</p>
        </div>

        <div className="grid gap-2">
          {TESTER_CONSENT_KEYS.map((key) => (
            <label
              key={key}
              className="flex gap-3 rounded-md border border-zinc-800 bg-zinc-950/65 px-3 py-2.5 text-xs leading-relaxed text-zinc-300"
            >
              <input
                type="checkbox"
                checked={consents[key]}
                onChange={(event) => onToggle(key, event.currentTarget.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-400"
              />
              <span>{labels[key]}</span>
            </label>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAccept}
            disabled={!allAccepted}
            className="rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            {labels.accept}
          </button>
          <a
            href="/legal"
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-emerald-400/50 hover:text-emerald-100"
          >
            {labels.legalLink}
          </a>
          {!allAccepted && <span className="text-[11px] text-zinc-600">{labels.required}</span>}
        </div>
      </section>
    </main>
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
        <span className="text-[10px] tracking-[0.18em] text-emerald-300">WRITE</span>
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
  const [continuingTurnIndex, setContinuingTurnIndex] = useState<number | null>(null);
  const [showPlayerMemo, setShowPlayerMemo] = useState(false);
  const [showFreeformInput, setShowFreeformInput] = useState(false);
  const [showCustomStartInput, setShowCustomStartInput] = useState(false);
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
  const [sessionSave, setSessionSave] = useState<SessionSave | null>(null);
  const [sessionLibrary, setSessionLibrary] = useState<SessionSave[]>([]);
  const [apiUsage, setApiUsage] = useState<ApiUsageSnapshot | null>(null);
  const [userSceneImages, setUserSceneImages] = useState<UserSceneImage[]>([]);
  const [serverSyncStatus, setServerSyncStatus] = useState<ServerSyncStatus>("idle");
  const [lastServerSyncAt, setLastServerSyncAt] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState("");
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [publishSessionId, setPublishSessionId] = useState<string | null>(null);
  const [publishConsents, setPublishConsents] = useState<Record<PublishConsentKey, boolean>>(EMPTY_PUBLISH_CONSENTS);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [serverSyncReady, setServerSyncReady] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const [accessRequired, setAccessRequired] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);
  const [accessPassword, setAccessPassword] = useState("");
  const [accessError, setAccessError] = useState("");
  const [accessLoading, setAccessLoading] = useState(false);
  const [accountChecked, setAccountChecked] = useState(false);
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null);
  const [accountLoginMode, setAccountLoginMode] = useState<"login" | "signup">("login");
  const [accountLoginId, setAccountLoginId] = useState("admin");
  const [accountLoginPassword, setAccountLoginPassword] = useState("");
  const [accountDisplayNameDraft, setAccountDisplayNameDraft] = useState("");
  const [accountError, setAccountError] = useState("");
  const [accountNotice, setAccountNotice] = useState("");
  const [accountLoading, setAccountLoading] = useState(false);
  const [adminDiagnostics, setAdminDiagnostics] = useState<AdminDiagnostics | null>(null);
  const [adminDiagnosticsLoading, setAdminDiagnosticsLoading] = useState(false);
  const [adminDiagnosticsError, setAdminDiagnosticsError] = useState("");
  const [feedbackCategory, setFeedbackCategory] = useState<FeedbackCategory>("bug");
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [feedbackItems, setFeedbackItems] = useState<TesterFeedbackItem[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackNotice, setFeedbackNotice] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [testerConsentAccepted, setTesterConsentAccepted] = useState(false);
  const [testerConsentDraft, setTesterConsentDraft] = useState<Record<TesterConsentKey, boolean>>(EMPTY_TESTER_CONSENTS);
  const [cookieNoticeDismissed, setCookieNoticeDismissed] = useState(false);
  const [entryStage, setEntryStage] = useState<EntryStage>("intro");
  const [bootProgress, setBootProgress] = useState(0);
  const [bootStep, setBootStep] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionImportInputRef = useRef<HTMLInputElement>(null);
  const activeSessionIdRef = useRef<string | null>(null);

  function applySessionSave(save: SessionSave, markReady = false) {
    activeSessionIdRef.current = save.id;
    setTurns(save.turns);
    setInput("");
    setShowPlayerMemo(false);
    setShowFreeformInput(false);
    setShowCustomStartInput(false);
    setMemo(save.memo.slice(0, PLAYER_MEMO_LIMIT));
    setMemoryItems(save.memoryItems);
    setEventLogItems(save.eventLogItems);
    setDifficultyMode(save.difficultyMode);
    setModelProfile(save.modelProfile);
    setOutputTokens(normalizeTokenValue(save.outputTokens));
    setLanguage(save.language);
    setSessionSave(save);
    setSessionLibrary((items) => upsertSessionLibrary(items, save));
    if (markReady) {
      setEntryStage("ready");
      setBootProgress(100);
      setBootStep(BOOT_STEPS[save.language].length - 1);
    }
    window.setTimeout(() => scrollToBottom("auto"), 0);
  }

  function buildCurrentSessionSave(): SessionSave | null {
    if (turns.length === 0) return null;
    const now = new Date().toISOString();
    const sessionId = activeSessionIdRef.current ?? sessionSave?.id ?? createSessionId();
    const createdAt = sessionSave?.createdAt ?? now;
    activeSessionIdRef.current = sessionId;

    const lastAssistantTurn = [...turns]
      .reverse()
      .find((turn): turn is Extract<Turn, { role: "assistant" }> => turn.role === "assistant");
    const firstUserTurn = turns.find((turn): turn is Extract<Turn, { role: "user" }> => turn.role === "user" && !turn.hidden);
    const briefingTitle = lastAssistantTurn?.response.briefing?.logs
      ?.find((log) => log.startsWith("현재 장면:") || log.startsWith("Current scene:"))
      ?.replace(/^현재 장면:\s*/, "")
      .replace(/^Current scene:\s*/, "")
      .trim();
    const title =
      briefingTitle ||
      (lastAssistantTurn ? firstNarrativeLine(lastAssistantTurn.response.narrative) : "") ||
      firstUserTurn?.content.slice(0, 80) ||
      SESSION_TITLE;

    return {
      id: sessionId,
      version: 1,
      title,
      createdAt,
      updatedAt: now,
      turns,
      memo,
      memoryItems,
      eventLogItems,
      mode: sessionSave?.mode ?? inferSessionModeFromTurns(turns),
      status: sessionSave?.status ?? "in_progress",
      visibility: sessionSave?.visibility ?? "private",
      contentTier: sessionSave?.contentTier ?? "teen",
      accountId: accountProfile?.id ?? sessionSave?.accountId,
      accountName: accountProfile?.displayName ?? sessionSave?.accountName,
      difficultyMode,
      modelProfile,
      outputTokens: normalizeTokenValue(outputTokens),
      language,
    };
  }

  function saveCurrentSession() {
    const save = buildCurrentSessionSave();
    if (!save) return;

    setSessionSave(save);
    window.localStorage.setItem(SESSION_SAVE_STORAGE_KEY, JSON.stringify(save));
    setSessionLibrary((items) => {
      const nextItems = upsertSessionLibrary(items, save);
      window.localStorage.setItem(SESSION_LIBRARY_STORAGE_KEY, JSON.stringify(nextItems));
      return nextItems;
    });
  }

  function updateStoredSession(sessionId: string, updater: (save: SessionSave) => SessionSave) {
    let updatedSave: SessionSave | null = null;

    setSessionLibrary((items) => {
      const nextItems = normalizeSessionLibrary(
        items.map((item) => {
          if (item.id !== sessionId) return item;
          updatedSave = updater(item);
          return updatedSave;
        }),
      );
      window.localStorage.setItem(SESSION_LIBRARY_STORAGE_KEY, JSON.stringify(nextItems));
      return nextItems;
    });

    if (sessionSave?.id === sessionId) {
      const source = updatedSave ?? updater(sessionSave);
      setSessionSave(source);
      window.localStorage.setItem(SESSION_SAVE_STORAGE_KEY, JSON.stringify(source));
    }
  }

  function beginRenameSession(save: SessionSave) {
    setRenamingSessionId(save.id);
    setRenameValue(save.title);
    setSaveNotice("");
  }

  function commitRenameSession(sessionId: string) {
    const title = renameValue.trim().slice(0, 80);
    if (!title) return;
    const now = new Date().toISOString();

    updateStoredSession(sessionId, (save) => ({ ...save, title, updatedAt: now }));
    setRenamingSessionId(null);
    setRenameValue("");
    setSaveNotice(text.save.renameSuccess);
  }

  function copySessionToLibrary(save: SessionSave) {
    const now = new Date().toISOString();
    const copiedSave: SessionSave = {
      ...save,
      id: createSessionId(),
      title: createSessionCopyTitle(save.title, language),
      createdAt: now,
      updatedAt: now,
      status: "in_progress",
      visibility: "private",
    };

    setSessionLibrary((items) => {
      const nextItems = upsertSessionLibrary(items, copiedSave);
      window.localStorage.setItem(SESSION_LIBRARY_STORAGE_KEY, JSON.stringify(nextItems));
      return nextItems;
    });
    setSaveNotice(text.save.copySuccess);
  }

  function setStoredSessionStatus(save: SessionSave, status: SessionStatus) {
    const now = new Date().toISOString();
    updateStoredSession(save.id, (item) => ({ ...item, status, updatedAt: now }));
  }

  function beginPublishConsent(save: SessionSave) {
    setPublishSessionId(save.id);
    setPublishConsents(EMPTY_PUBLISH_CONSENTS);
    setRenamingSessionId(null);
    setRenameValue("");
    setSaveNotice("");
  }

  function updatePublishConsent(key: PublishConsentKey, checked: boolean) {
    setPublishConsents((items) => ({ ...items, [key]: checked }));
  }

  function requestPublishReview(save: SessionSave) {
    if (!PUBLISH_CONSENT_KEYS.every((key) => publishConsents[key])) return;

    const now = new Date().toISOString();
    updateStoredSession(save.id, (item) => ({
      ...item,
      status: item.status === "completed" ? item.status : "in_progress",
      visibility: "uploaded_pending",
      updatedAt: now,
    }));
    setPublishSessionId(null);
    setPublishConsents(EMPTY_PUBLISH_CONSENTS);
    setSaveNotice(text.save.publishPendingSuccess);
  }

  function makeSessionPrivate(save: SessionSave) {
    const now = new Date().toISOString();
    updateStoredSession(save.id, (item) => ({ ...item, visibility: "private", updatedAt: now }));
    setPublishSessionId(null);
    setPublishConsents(EMPTY_PUBLISH_CONSENTS);
    setSaveNotice(text.save.privateSuccess);
  }

  function exportSessionSave(save: SessionSave) {
    const payload = {
      schemaVersion: "1.0",
      exportType: "tiu_session",
      exportedAt: new Date().toISOString(),
      title: save.title,
      mode: save.mode,
      status: save.status,
      visibility: save.visibility,
      contentTier: save.contentTier,
      session: save,
    };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${sanitizeFileName(save.title)}.tiu-session.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function importSessionSaveFile(file: File | null) {
    if (!file || loading) return;

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (hasForbiddenSessionImportField(parsed)) {
        setSaveNotice(text.save.importPrivacyError);
        return;
      }
      const source = parsed.session ?? parsed.sessionSave ?? parsed;
      const imported = parseSessionSave(JSON.stringify(source));
      if (!imported) throw new Error("Invalid session file");

      const now = new Date().toISOString();
      const importedSave: SessionSave = {
        ...imported,
        id: createSessionId(),
        createdAt: now,
        updatedAt: now,
        mode: "custom",
        status: "in_progress",
        visibility: "private",
        contentTier: "teen",
      };

      applySessionSave(importedSave, true);
      window.localStorage.setItem(SESSION_SAVE_STORAGE_KEY, JSON.stringify(importedSave));
      setSessionLibrary((items) => {
        const nextItems = upsertSessionLibrary(items, importedSave);
        window.localStorage.setItem(SESSION_LIBRARY_STORAGE_KEY, JSON.stringify(nextItems));
        return nextItems;
      });
      setSaveNotice(text.save.importSuccess);
    } catch {
      setSaveNotice(text.save.importError);
    } finally {
      if (sessionImportInputRef.current) {
        sessionImportInputRef.current.value = "";
      }
    }
  }

  function clearCurrentSession() {
    activeSessionIdRef.current = null;
    setTurns([]);
    setInput("");
    setShowPlayerMemo(false);
    setShowFreeformInput(false);
    setShowCustomStartInput(false);
    setMemo("");
    setMemoryDraft("");
    setMemoryItems([]);
    setEventLogItems([]);
    setSessionSave(null);
    setSaveNotice("");
    window.localStorage.removeItem(SESSION_SAVE_STORAGE_KEY);
    window.localStorage.setItem("tiu-player-memo", "");
    window.localStorage.setItem(SUMMARY_MEMORY_STORAGE_KEY, "[]");
    window.localStorage.setItem("tiu-summary-memory", "");
    window.localStorage.setItem(EVENT_LOG_STORAGE_KEY, "[]");
    setEntryStage("ready");
    setBootProgress(100);
    setBootStep(BOOT_STEPS[language].length - 1);
  }

  function deleteSessionFromLibrary(sessionId: string) {
    setSessionLibrary((items) => {
      const nextItems = items.filter((item) => item.id !== sessionId);
      window.localStorage.setItem(SESSION_LIBRARY_STORAGE_KEY, JSON.stringify(nextItems));
      return nextItems;
    });

    if (sessionSave?.id === sessionId) {
      activeSessionIdRef.current = null;
      setTurns([]);
      setInput("");
      setShowPlayerMemo(false);
      setShowFreeformInput(false);
      setShowCustomStartInput(false);
      setMemo("");
      setMemoryDraft("");
      setMemoryItems([]);
      setEventLogItems([]);
      setSessionSave(null);
      window.localStorage.removeItem(SESSION_SAVE_STORAGE_KEY);
      window.localStorage.setItem("tiu-player-memo", "");
      window.localStorage.setItem(SUMMARY_MEMORY_STORAGE_KEY, "[]");
      window.localStorage.setItem("tiu-summary-memory", "");
      window.localStorage.setItem(EVENT_LOG_STORAGE_KEY, "[]");
      setEntryStage("ready");
      setBootProgress(100);
      setBootStep(BOOT_STEPS[language].length - 1);
    }
  }

  async function hydrateAccountState() {
    setAccountChecked(false);
    return fetch(ACCOUNT_ENDPOINT)
      .then((res) => (res.ok ? res.json() : { authenticated: false, profile: null }))
      .then((data: { authenticated?: boolean; profile?: unknown }) => {
        const profile = data.authenticated ? normalizeAccountProfile(data.profile) : null;
        setAccountProfile(profile);
        setAccountDisplayNameDraft(profile?.displayName ?? "");
      })
      .catch(() => {
        setAccountProfile(null);
      })
      .finally(() => setAccountChecked(true));
  }

  async function hydrateSessionState() {
    await fetch(SESSION_STATE_ENDPOINT)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: {
        memo?: string;
        memoryItems?: SummaryMemoryItem[];
        eventLogItems?: EventLogItem[];
        sessionSave?: SessionSave;
        sessionLibrary?: SessionSave[];
        apiUsage?: ApiUsageSnapshot;
      } | null) => {
        if (!data) return;
        if (data.apiUsage) setApiUsage(data.apiUsage);
        const hasLocalSessionSave = Boolean(window.localStorage.getItem(SESSION_SAVE_STORAGE_KEY));
        const hasLocalSessionLibrary = Boolean(window.localStorage.getItem(SESSION_LIBRARY_STORAGE_KEY));
        const hasLocalMemo = window.localStorage.getItem("tiu-player-memo") !== null;
        const hasLocalMemoryStack =
          window.localStorage.getItem(SUMMARY_MEMORY_STORAGE_KEY) !== null
          || window.localStorage.getItem("tiu-summary-memory") !== null;
        const hasLocalEventLog = window.localStorage.getItem(EVENT_LOG_STORAGE_KEY) !== null;
        if (!hasLocalSessionLibrary && Array.isArray(data.sessionLibrary) && data.sessionLibrary.length > 0) {
          setSessionLibrary(normalizeSessionLibrary(data.sessionLibrary));
        }
        if (!hasLocalSessionSave && !hasLocalMemo && typeof data.memo === "string" && data.memo) {
          setMemo(data.memo.slice(0, PLAYER_MEMO_LIMIT));
        }
        if (!hasLocalSessionSave && !hasLocalMemoryStack && Array.isArray(data.memoryItems) && data.memoryItems.length > 0) {
          setMemoryItems(parseSavedMemoryItems(JSON.stringify(data.memoryItems), null));
        }
        if (!hasLocalSessionSave && !hasLocalEventLog && Array.isArray(data.eventLogItems) && data.eventLogItems.length > 0) {
          setEventLogItems(parseSavedEventLogItems(JSON.stringify(data.eventLogItems)));
        }
        if (!hasLocalSessionSave && data.sessionSave) {
          const normalizedSave = parseSessionSave(JSON.stringify(data.sessionSave));
          if (normalizedSave) applySessionSave(normalizedSave, true);
        }
      })
      .catch(() => undefined)
      .finally(() => setServerSyncReady(true));
  }

  useEffect(() => {
    fetch(USER_SCENE_ASSETS_ENDPOINT)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { items?: unknown[] } | null) => {
        setUserSceneImages(normalizeUserSceneImages(data?.items));
      })
      .catch(() => setUserSceneImages([]));

    const savedMemo = window.localStorage.getItem("tiu-player-memo");
    const savedMemoryStack = window.localStorage.getItem(SUMMARY_MEMORY_STORAGE_KEY);
    const legacyMemory = window.localStorage.getItem("tiu-summary-memory");
    const savedTokens = Number(window.localStorage.getItem(RESPONSE_LENGTH_STORAGE_KEY));
    const savedDifficulty = window.localStorage.getItem(DIFFICULTY_STORAGE_KEY);
    const savedModelProfile = window.localStorage.getItem(MODEL_PROFILE_STORAGE_KEY);
    const savedEventLog = window.localStorage.getItem(EVENT_LOG_STORAGE_KEY);
    const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const savedSession = parseSessionSave(window.localStorage.getItem(SESSION_SAVE_STORAGE_KEY));
    const savedSessionLibrary = parseSessionLibrary(window.localStorage.getItem(SESSION_LIBRARY_STORAGE_KEY));
    const savedFeedbackItems = parseTesterFeedbackItems(window.localStorage.getItem(TESTER_FEEDBACK_STORAGE_KEY));
    setTesterConsentAccepted(hasAcceptedTesterConsent(window.localStorage.getItem(TESTER_CONSENT_STORAGE_KEY)));
    setCookieNoticeDismissed(window.localStorage.getItem(COOKIE_NOTICE_STORAGE_KEY) === "true");
    setFeedbackItems(savedFeedbackItems);
    const initialSessionLibrary = savedSession
      ? upsertSessionLibrary(savedSessionLibrary, savedSession)
      : savedSessionLibrary;
    if (initialSessionLibrary.length > 0) {
      setSessionLibrary(initialSessionLibrary);
    }

    if (savedSession) {
      applySessionSave(savedSession, true);
    } else {
      if (savedMemo !== null) setMemo(savedMemo.slice(0, PLAYER_MEMO_LIMIT));
      setMemoryItems(parseSavedMemoryItems(savedMemoryStack, legacyMemory));
      setEventLogItems(parseSavedEventLogItems(savedEventLog));
      if (Number.isFinite(savedTokens) && savedTokens > 0) {
        setOutputTokens(normalizeTokenValue(savedTokens));
      }
      setDifficultyMode(normalizeDifficulty(savedDifficulty));
      setModelProfile(normalizeModelProfile(savedModelProfile));
      setLanguage(normalizeLanguage(savedLanguage));
    }
    setStorageLoaded(true);

    fetch(ACCESS_ENDPOINT)
      .then((res) => (res.ok ? res.json() : { enabled: false, authenticated: true }))
      .then((data: { enabled?: boolean; authenticated?: boolean }) => {
        const enabled = Boolean(data.enabled);
        const authenticated = !enabled || Boolean(data.authenticated);
        setAccessRequired(enabled);
        setAccessGranted(authenticated);
        if (authenticated) {
          return Promise.all([hydrateSessionState(), hydrateAccountState()]);
        }
        setServerSyncReady(false);
        setAccountChecked(true);
        return undefined;
      })
      .catch(() => {
        setAccessRequired(false);
        setAccessGranted(true);
        return Promise.all([hydrateSessionState(), hydrateAccountState()]);
      })
      .finally(() => setAccessChecked(true));
    // Initial storage/access hydration should run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!storageLoaded) return;
    const save = buildCurrentSessionSave();
    if (!save) return;

    window.localStorage.setItem(SESSION_SAVE_STORAGE_KEY, JSON.stringify(save));
    setSessionSave(save);
    setSessionLibrary((items) => {
      const nextItems = upsertSessionLibrary(items, save);
      window.localStorage.setItem(SESSION_LIBRARY_STORAGE_KEY, JSON.stringify(nextItems));
      return nextItems;
    });
    // buildCurrentSessionSave is derived from the explicit state dependencies below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    accountProfile,
    difficultyMode,
    eventLogItems,
    language,
    memo,
    memoryItems,
    modelProfile,
    outputTokens,
    storageLoaded,
    turns,
  ]);

  useEffect(() => {
    if (!storageLoaded || !serverSyncReady || !accessGranted) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setServerSyncStatus("syncing");
      fetch(SESSION_STATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo, memoryItems, eventLogItems, sessionSave, sessionLibrary }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const data = await response.json().catch(() => null);
          if (!response.ok) throw new Error("Session mirror sync failed");
          setServerSyncStatus(data?.persisted === false ? "local_only" : "synced");
          setLastServerSyncAt(new Date().toISOString());
        })
        .catch(() => {
          if (!controller.signal.aborted) setServerSyncStatus("error");
        });
    }, 400);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [accessGranted, eventLogItems, memo, memoryItems, serverSyncReady, sessionLibrary, sessionSave, storageLoaded]);

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
    window.localStorage.setItem(TESTER_FEEDBACK_STORAGE_KEY, JSON.stringify(feedbackItems.slice(0, TESTER_FEEDBACK_LIMIT)));
  }, [feedbackItems, storageLoaded]);

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

  useEffect(() => {
    if (sessionInfoTab !== "admin" || accountProfile?.role !== "admin") return;
    if (adminDiagnostics || adminDiagnosticsLoading) return;
    void refreshAdminDiagnostics();
    // Admin diagnostics should load lazily when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionInfoTab, accountProfile?.role]);

  useEffect(() => {
    if (sessionInfoTab !== "feedback" || accountProfile?.role !== "admin") return;
    void refreshTesterFeedback({ silent: true });
    // Feedback should refresh lazily when the admin opens the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionInfoTab, accountProfile?.role]);

  const lastAssistant = [...turns]
    .reverse()
    .find((t): t is Extract<Turn, { role: "assistant" }> => t.role === "assistant");
  const choices = lastAssistant && !loading ? lastAssistant.response.choices : [];
  const allowFreeform = lastAssistant?.response.allow_freeform === true;
  const canOpenFreeformInput = allowFreeform && turns.length > 0;
  const shouldShowFreeformInput = canOpenFreeformInput && showFreeformInput;
  const shouldShowCustomStartInput = turns.length === 0 && showCustomStartInput;
  const shouldShowInputForm = shouldShowFreeformInput || shouldShowCustomStartInput;
  const hasSuggestions = choices.length > 0;
  const extraSteps = Math.max(0, Math.ceil((outputTokens - DEFAULT_OUTPUT_TOKENS) / TOKEN_STEP));
  const text = UI_TEXT[language];
  const adminText = ADMIN_TEXT[language];
  const feedbackText = FEEDBACK_TEXT[language];
  const baseDifficultyOption =
    DIFFICULTY_OPTIONS.find((option) => option.id === difficultyMode) ?? DIFFICULTY_OPTIONS[1];
  const currentDifficultyOption = getDifficultyOptionText(baseDifficultyOption, language);
  const baseModelOption =
    MODEL_PROFILE_OPTIONS.find((option) => option.id === modelProfile) ?? MODEL_PROFILE_OPTIONS[0];
  const currentModelOption = getModelProfileText(baseModelOption, language);
  const usageCallPercent = apiUsage ? usagePercent(apiUsage.calls, apiUsage.dailyCallLimit) : 0;
  const usageTokenPercent = apiUsage ? usagePercent(apiUsage.estimatedTokens, apiUsage.dailyTokenLimit) : 0;
  const usageStatusLabel = apiUsage?.status && apiUsage.status !== "ok" ? text.usage.limited : text.usage.ok;
  const serverSyncText = getServerSyncStatusText(serverSyncStatus, language);
  const characterExamples = language === "en" ? CHARACTER_EXAMPLES_EN : CHARACTER_EXAMPLES;
  const summaryMemoryText = memoryItems
    .map((item, index) => `${index + 1}. ${item.text}`)
    .join("\n");
  const pendingLibrarySessions = sessionLibrary.filter((save) => save.visibility === "uploaded_pending");
  const privateLibrarySessions = sessionLibrary.filter((save) => save.visibility === "private");
  const completedLibrarySessions = sessionLibrary.filter((save) => save.status === "completed");
  const openFeedbackCount = feedbackItems.filter((item) => item.status === "open").length;
  const sessionMenuItems: Array<{
    id: Exclude<SessionInfoTab, "menu" | null>;
    title: string;
    value: string;
    detail: string;
    className: string;
  }> = [
    {
      id: "account",
      title: text.tabs.account,
      value: accountProfile ? accountProfile.displayName : text.account.authRequired,
      detail: accountProfile ? text.account.profileDetail : text.account.gateDescription,
      className: "hover:border-emerald-500/50",
    },
    ...(accountProfile?.role === "admin"
      ? [
          {
            id: "admin" as const,
            title: adminText.tab,
            value: adminText.value,
            detail: adminText.detail,
            className: "hover:border-teal-500/50",
          },
        ]
      : []),
    {
      id: "feedback",
      title: feedbackText.tab,
      value: feedbackText.value(openFeedbackCount, feedbackItems.length),
      detail: feedbackText.detail,
      className: "hover:border-rose-500/50",
    },
    {
      id: "save",
      title: text.tabs.save,
      value: sessionLibrary.length > 0 ? text.save.libraryCount(sessionLibrary.length) : text.tabs.saveEmpty,
      detail: sessionSave ? `${text.save.updated}: ${formatSavedAt(sessionSave.updatedAt, language)}` : text.save.description,
      className: "hover:border-blue-500/50",
    },
    {
      id: "library",
      title: text.tabs.library,
      value: pendingLibrarySessions.length > 0 ? text.tabs.libraryCount(pendingLibrarySessions.length) : text.tabs.libraryEmpty,
      detail: text.library.description,
      className: "hover:border-amber-500/50",
    },
    {
      id: "difficulty",
      title: text.tabs.playMode,
      value: currentDifficultyOption.title,
      detail: currentDifficultyOption.summary,
      className: "hover:border-emerald-500/50",
    },
    {
      id: "memory",
      title: text.tabs.memory,
      value: memoryItems.length > 0 ? text.tabs.memoryCount(memoryItems.length) : text.tabs.memoryEmpty,
      detail: language === "en" ? "Long-term facts referenced by the AI" : "AI가 실제 진행에 참조하는 장기 기억",
      className: "hover:border-violet-500/50",
    },
    {
      id: "model",
      title: text.tabs.model,
      value: currentModelOption.title,
      detail: currentModelOption.summary,
      className: "hover:border-cyan-500/50",
    },
    {
      id: "length",
      title: text.tabs.length,
      value: `${responseLengthLabel(outputTokens, language)} / ${responseMultiplier(outputTokens)}`,
      detail: language === "en" ? "Adjust maximum response length" : "AI 답변 최대 분량 조절",
      className: "hover:border-red-500/50",
    },
    {
      id: "usage",
      title: text.tabs.usage,
      value: apiUsage ? `${formatUsageNumber(apiUsage.calls, language)}/${formatUsageNumber(apiUsage.dailyCallLimit, language)}` : text.tabs.usageEmpty,
      detail: apiUsage
        ? `${usageStatusLabel} · ${formatUsageNumber(apiUsage.estimatedTokens, language)}/${formatUsageNumber(apiUsage.dailyTokenLimit, language)}`
        : text.usage.description,
      className: "hover:border-lime-500/50",
    },
    {
      id: "assets",
      title: text.tabs.assets,
      value: userSceneImages.length > 0 ? text.tabs.assetsCount(userSceneImages.length) : text.tabs.assetsEmpty,
      detail: text.assets.description,
      className: "hover:border-fuchsia-500/50",
    },
    {
      id: "events",
      title: text.tabs.events,
      value: eventLogItems.length > 0 ? text.tabs.eventsCount(eventLogItems.length) : text.tabs.eventsEmpty,
      detail: language === "en" ? "Automatically tracked scene records" : "진행 중 자동 누적되는 사건 기록",
      className: "hover:border-amber-500/50",
    },
  ];

  function buildErrorResponse(err: unknown): GameResponse {
    const message = err instanceof Error
      ? err.message
      : language === "en"
        ? "Unknown error"
        : "알 수 없는 오류";
    const retryChoices = language === "en"
      ? [{ text: "Try again" }, { text: "Look around" }, { text: "Pause for a moment" }]
      : [{ text: "다시 시도한다" }, { text: "주변을 살핀다" }, { text: "잠시 멈춘다" }];
    const errorPrefix = language === "en" ? "Error" : "오류";

    return {
      narrative: `[${errorPrefix}] ${message}`,
      choices: retryChoices,
      allow_freeform: false,
      raw: `[${errorPrefix}] ${message}`,
    };
  }

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
    setShowFreeformInput(false);
    setShowCustomStartInput(false);

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
          playerAccount: accountProfile
            ? { displayName: accountProfile.displayName, role: accountProfile.role }
            : undefined,
          difficulty: difficultyMode,
          modelProfile,
          language,
          maxOutputTokens: normalizeTokenValue(outputTokens),
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        if (errBody.usage) setApiUsage(errBody.usage);
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }

      const data: GameResponse = await res.json();
      if (data.usage) setApiUsage(data.usage);
      if (data.memory_updates?.length) {
        setMemoryItems((items) => mergeMemoryItems(items, data.memory_updates ?? [], "auto"));
      }
      setEventLogItems((items) => mergeEventLogItem(items, buildEventLogItem(data, nextTurns.length, language)));
      setTurns((prev) => [...prev, { role: "assistant", response: data }]);
    } catch (err) {
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          response: buildErrorResponse(err),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function continueAssistantTurn(turnIndex: number, response: GameResponse) {
    if (loading || continuingTurnIndex !== null) return;

    const apiMessages: ChatMessage[] = turns.map((turn) =>
      turn.role === "user"
        ? { role: "user", content: turn.apiContent ?? turn.content }
        : { role: "assistant", content: turn.response.raw },
    );

    setLoading(true);
    setContinuingTurnIndex(turnIndex);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          memo: memo.trim() || undefined,
          memory: summaryMemoryText || undefined,
          playerAccount: accountProfile
            ? { displayName: accountProfile.displayName, role: accountProfile.role }
            : undefined,
          difficulty: difficultyMode,
          modelProfile,
          language,
          maxOutputTokens: normalizeTokenValue(outputTokens),
          continueFrom: {
            narrative: response.narrative,
            raw: response.raw,
          },
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        if (errBody.usage) setApiUsage(errBody.usage);
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }

      const data: GameResponse = await res.json();
      if (data.usage) setApiUsage(data.usage);
      if (data.memory_updates?.length) {
        setMemoryItems((items) => mergeMemoryItems(items, data.memory_updates ?? [], "auto"));
      }

      setTurns((prev) => [
        ...prev.map((turn, index) =>
          index === turnIndex && turn.role === "assistant"
            ? { ...turn, response: { ...turn.response, truncated: false } }
            : turn,
        ),
        { role: "assistant", response: data },
      ]);
    } catch (err) {
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          response: buildErrorResponse(err),
        },
      ]);
    } finally {
      setContinuingTurnIndex(null);
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
      await Promise.all([hydrateSessionState(), hydrateAccountState()]);
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : text.accessDefaultError);
    } finally {
      setAccessLoading(false);
    }
  }

  async function handleAccountLoginSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accountLoginId.trim() || !accountLoginPassword || accountLoading) return;

    setAccountLoading(true);
    setAccountError("");
    setAccountNotice("");
    try {
      const res = await fetch(ACCOUNT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: accountLoginId.trim(),
          password: accountLoginPassword,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: text.account.defaultError }));
        throw new Error(data.error ?? text.account.defaultError);
      }
      const data = await res.json();
      const profile = normalizeAccountProfile(data.profile);
      if (!profile) throw new Error(text.account.defaultError);
      setAccountProfile(profile);
      setAccountDisplayNameDraft(profile.displayName);
      setAccountLoginPassword("");
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : text.account.defaultError);
    } finally {
      setAccountLoading(false);
    }
  }

  async function updateAccountDisplayName() {
    const displayName = normalizeAccountDisplayName(accountDisplayNameDraft);
    if (!displayName || accountLoading) return;

    setAccountLoading(true);
    setAccountError("");
    setAccountNotice("");
    try {
      const res = await fetch(ACCOUNT_ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: text.account.defaultError }));
        throw new Error(data.error ?? text.account.defaultError);
      }
      const data = await res.json();
      const profile = normalizeAccountProfile(data.profile);
      if (!profile) throw new Error(text.account.defaultError);
      setAccountProfile(profile);
      setAccountDisplayNameDraft(profile.displayName);
      setAccountNotice(text.account.savedName);
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : text.account.defaultError);
    } finally {
      setAccountLoading(false);
    }
  }

  async function logoutAccount() {
    if (accountLoading) return;
    setAccountLoading(true);
    setAccountError("");
    setAccountNotice("");
    try {
      await fetch(ACCOUNT_ENDPOINT, { method: "DELETE" });
    } finally {
      setAccountProfile(null);
      setAccountDisplayNameDraft("");
      setAccountLoginPassword("");
      setAdminDiagnostics(null);
      setAdminDiagnosticsError("");
      setAccountLoading(false);
      setSessionInfoTab(null);
    }
  }

  async function refreshAdminDiagnostics() {
    if (accountProfile?.role !== "admin" || adminDiagnosticsLoading) return;

    setAdminDiagnosticsLoading(true);
    setAdminDiagnosticsError("");
    try {
      const res = await fetch(ADMIN_DIAGNOSTICS_ENDPOINT);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: ADMIN_TEXT[language].unavailable }));
        throw new Error(data.error ?? ADMIN_TEXT[language].unavailable);
      }

      const data = (await res.json()) as AdminDiagnostics;
      setAdminDiagnostics(data);
    } catch (err) {
      setAdminDiagnosticsError(err instanceof Error ? err.message : ADMIN_TEXT[language].unavailable);
    } finally {
      setAdminDiagnosticsLoading(false);
    }
  }

  function buildFeedbackContext(): Record<string, unknown> {
    const lastUserTurn = [...turns]
      .reverse()
      .find((turn): turn is Extract<Turn, { role: "user" }> => turn.role === "user");
    const recentAssistant = lastAssistant?.response;

    return {
      accountId: accountProfile?.id,
      accountName: accountProfile?.displayName,
      sessionId: sessionSave?.id ?? activeSessionIdRef.current,
      sessionTitle: sessionSave?.title,
      turnCount: turns.length,
      language,
      difficultyMode,
      modelProfile,
      outputTokens,
      sceneTime: recentAssistant?.briefing?.time,
      sceneStatus: recentAssistant?.briefing?.status,
      sceneEmotion: recentAssistant?.briefing?.emotion,
      lastUser: lastUserTurn?.content.slice(0, 240),
      lastAssistant: recentAssistant?.narrative.slice(0, 600),
    };
  }

  async function submitTesterFeedback() {
    const message = feedbackDraft.replace(/\s+/g, " ").trim().slice(0, TESTER_FEEDBACK_MESSAGE_LIMIT);
    if (message.length < 4 || feedbackLoading) return;

    if (!accountProfile) {
      setFeedbackError(text.account.authRequired);
      setFeedbackNotice("");
      return;
    }

    const context = buildFeedbackContext();
    setFeedbackLoading(true);
    setFeedbackNotice("");
    setFeedbackError("");
    try {
      const res = await fetch(TESTER_FEEDBACK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: feedbackCategory, message, context }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: feedbackText.error }));
        throw new Error(typeof data.error === "string" ? data.error : feedbackText.error);
      }

      const data = await res.json();
      const item = normalizeTesterFeedbackItem((data as { item?: unknown }).item);
      if (!item) throw new Error(feedbackText.error);
      setFeedbackItems((items) => mergeTesterFeedbackItems(items, [item]));
      setFeedbackDraft("");
      setFeedbackNotice((data as { persisted?: boolean }).persisted === false ? feedbackText.localSaved : feedbackText.saved);
    } catch (err) {
      const now = new Date().toISOString();
      const localItem: TesterFeedbackItem = {
        id: `local-feedback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        category: feedbackCategory,
        status: "open",
        message,
        accountId: accountProfile.id,
        accountName: accountProfile.displayName,
        sessionId: typeof context.sessionId === "string" ? context.sessionId : undefined,
        sessionTitle: typeof context.sessionTitle === "string" ? context.sessionTitle : undefined,
        turnCount: typeof context.turnCount === "number" ? context.turnCount : undefined,
        context,
        createdAt: now,
      };
      setFeedbackItems((items) => mergeTesterFeedbackItems(items, [localItem]));
      setFeedbackDraft("");
      setFeedbackNotice(feedbackText.localSaved);
      setFeedbackError(err instanceof Error ? err.message : feedbackText.error);
    } finally {
      setFeedbackLoading(false);
    }
  }

  async function refreshTesterFeedback(options: { silent?: boolean } = {}) {
    if (accountProfile?.role !== "admin" || feedbackLoading) return;

    if (!options.silent) {
      setFeedbackNotice("");
      setFeedbackError("");
    }
    setFeedbackLoading(true);
    try {
      const res = await fetch(TESTER_FEEDBACK_ENDPOINT);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: feedbackText.error }));
        throw new Error(typeof data.error === "string" ? data.error : feedbackText.error);
      }

      const data = await res.json();
      const items = Array.isArray((data as { items?: unknown }).items)
        ? (data as { items: unknown[] }).items
            .map(normalizeTesterFeedbackItem)
            .filter((item): item is TesterFeedbackItem => item !== null)
        : [];
      setFeedbackItems((current) => mergeTesterFeedbackItems(current, items));
    } catch (err) {
      if (!options.silent) {
        setFeedbackError(err instanceof Error ? err.message : feedbackText.error);
      }
    } finally {
      setFeedbackLoading(false);
    }
  }

  async function updateTesterFeedbackStatus(id: string, status: FeedbackStatus) {
    if (accountProfile?.role !== "admin" || feedbackLoading) return;

    setFeedbackItems((items) =>
      items.map((item) =>
        item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item,
      ),
    );
    setFeedbackLoading(true);
    setFeedbackNotice("");
    setFeedbackError("");
    try {
      const res = await fetch(TESTER_FEEDBACK_ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: feedbackText.error }));
        throw new Error(typeof data.error === "string" ? data.error : feedbackText.error);
      }

      const data = await res.json();
      const items = Array.isArray((data as { items?: unknown }).items)
        ? (data as { items: unknown[] }).items
            .map(normalizeTesterFeedbackItem)
            .filter((item): item is TesterFeedbackItem => item !== null)
        : [];
      if (items.length > 0) {
        setFeedbackItems((current) => mergeTesterFeedbackItems(current, items));
      }
      setFeedbackNotice(feedbackText.saved);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : feedbackText.error);
    } finally {
      setFeedbackLoading(false);
    }
  }

  function updateTesterConsent(key: TesterConsentKey, checked: boolean) {
    setTesterConsentDraft((items) => ({ ...items, [key]: checked }));
  }

  function acceptTesterConsent() {
    if (!TESTER_CONSENT_KEYS.every((key) => testerConsentDraft[key])) return;

    window.localStorage.setItem(
      TESTER_CONSENT_STORAGE_KEY,
      JSON.stringify({
        version: TESTER_CONSENT_VERSION,
        acceptedAt: new Date().toISOString(),
      }),
    );
    setTesterConsentAccepted(true);
  }

  function dismissCookieNotice() {
    window.localStorage.setItem(COOKIE_NOTICE_STORAGE_KEY, "true");
    setCookieNoticeDismissed(true);
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

  if (!accountChecked) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-zinc-950 px-4 text-zinc-100">
        <div className="text-xs tracking-[0.28em] text-zinc-500">{text.account.authRequired}</div>
      </main>
    );
  }

  if (!accountProfile) {
    return (
      <AccountGateScreen
        language={language}
        labels={text.account}
        loginMode={accountLoginMode}
        loginId={accountLoginId}
        loginPassword={accountLoginPassword}
        error={accountError}
        loading={accountLoading}
        onLanguageChange={setLanguage}
        onLoginModeChange={setAccountLoginMode}
        onLoginIdChange={setAccountLoginId}
        onLoginPasswordChange={setAccountLoginPassword}
        onSubmit={handleAccountLoginSubmit}
      />
    );
  }

  if (!testerConsentAccepted) {
    return (
      <TesterConsentScreen
        language={language}
        labels={text.consent}
        consents={testerConsentDraft}
        onLanguageChange={setLanguage}
        onToggle={updateTesterConsent}
        onAccept={acceptTesterConsent}
      />
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
            <button
              type="button"
              onClick={() => toggleSessionInfo("account")}
              className="hidden rounded-md border border-zinc-800 bg-zinc-950/70 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-100 sm:inline-flex"
            >
              {accountProfile.displayName}
            </button>
            <LanguageToggle language={language} onChange={setLanguage} />
          </div>
        </div>
      </header>

      <section className="border-b border-zinc-800 bg-zinc-950/95 px-4 py-2">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => toggleSessionInfo("menu")}
              className={`inline-flex h-9 shrink-0 items-center rounded-md border px-3 text-xs font-semibold transition-colors ${
                sessionInfoTab === "menu"
                  ? "border-emerald-400/60 bg-emerald-950/20"
                  : "border-zinc-800 bg-zinc-900/70 hover:border-emerald-500/50"
              }`}
            >
              {text.tabs.menu}
            </button>
          </div>

          {sessionInfoTab === "menu" && (
            <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900/80 p-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200">{text.tabs.menuSummary}</span>
                <button
                  type="button"
                  onClick={() => setSessionInfoTab(null)}
                  className="rounded border border-zinc-800 px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-200"
                >
                  {text.tabs.close}
                </button>
              </div>
              <div className="space-y-1.5">
                {sessionMenuItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSessionInfoTab(item.id)}
                    className={`flex w-full items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-left transition-colors ${item.className}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-zinc-100">{item.title}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-zinc-500">{item.detail}</span>
                    </span>
                    <span className="max-w-[45%] truncate text-right text-[11px] font-medium text-zinc-300">
                      {item.value}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {sessionInfoTab === "account" && (
            <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900/70 p-2">
              <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.8)]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-zinc-100">{text.account.profileTitle}</div>
                    <div className="mt-1 text-xs leading-relaxed text-zinc-500">{text.account.profileDetail}</div>
                  </div>
                  <span className="shrink-0 rounded border border-emerald-400/30 bg-emerald-950/25 px-2 py-1 text-[11px] text-emerald-100">
                    {text.account.roleAdmin}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <label className="block min-w-0 text-xs font-medium text-zinc-400" htmlFor="account-display-name">
                    {text.account.displayName}
                    <input
                      id="account-display-name"
                      type="text"
                      value={accountDisplayNameDraft}
                      onChange={(event) => setAccountDisplayNameDraft(event.currentTarget.value.slice(0, 24))}
                      disabled={accountLoading}
                      maxLength={24}
                      className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-emerald-400/70 disabled:opacity-40"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={updateAccountDisplayName}
                    disabled={accountLoading || !normalizeAccountDisplayName(accountDisplayNameDraft)}
                    className="self-end rounded-md border border-emerald-500/40 bg-emerald-950/25 px-3 py-2 text-xs font-semibold text-emerald-100 transition-colors hover:border-emerald-300/70 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {text.account.saveName}
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                  <span>ID: {accountProfile.id}</span>
                  <span>{text.account.roleAdmin}</span>
                </div>
                {accountNotice && <p className="mt-2 text-[11px] text-emerald-300">{accountNotice}</p>}
                {accountError && <p className="mt-2 text-[11px] text-red-300">{accountError}</p>}

                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href="/legal"
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-emerald-400/50 hover:text-emerald-100"
                  >
                    {text.account.legalLink}
                  </a>
                  <button
                    type="button"
                    onClick={logoutAccount}
                    disabled={accountLoading || loading}
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-red-400/50 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {text.account.logout}
                  </button>
                </div>
              </div>
            </div>
          )}

          {sessionInfoTab === "admin" && accountProfile?.role === "admin" && (
            <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900/70 p-2">
              <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-teal-300 shadow-[0_0_10px_rgba(94,234,212,0.8)]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-zinc-100">{adminText.title}</div>
                    <div className="mt-1 text-xs leading-relaxed text-zinc-500">{adminText.description}</div>
                  </div>
                  <button
                    type="button"
                    onClick={refreshAdminDiagnostics}
                    disabled={adminDiagnosticsLoading}
                    className="shrink-0 rounded-md border border-teal-500/40 bg-teal-950/20 px-3 py-2 text-xs font-semibold text-teal-100 transition-colors hover:border-teal-300/70 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {adminDiagnosticsLoading ? adminText.loading : adminText.refresh}
                  </button>
                </div>

                {adminDiagnosticsError && (
                  <p className="mt-3 rounded-md border border-red-500/25 bg-red-950/20 px-3 py-2 text-xs text-red-200">
                    {adminDiagnosticsError}
                  </p>
                )}

                {!adminDiagnostics && !adminDiagnosticsError && (
                  <div className="mt-3 rounded-md border border-dashed border-zinc-800 px-3 py-4 text-xs text-zinc-600">
                    {adminDiagnosticsLoading ? adminText.loading : adminText.unavailable}
                  </div>
                )}

                {adminDiagnostics && (
                  <div className="mt-3 space-y-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-md border border-zinc-800 bg-zinc-900/55 p-3">
                        <div className="mb-2 text-xs font-semibold text-zinc-200">{adminText.providers}</div>
                        <div className="space-y-1.5 text-[11px] text-zinc-400">
                          <div className="flex items-center justify-between gap-2">
                            <span>{adminText.openai} · {adminDiagnostics.providers.openai.model}</span>
                            <span className={`rounded border px-1.5 py-0.5 ${adminDiagnostics.providers.openai.configured ? "border-emerald-400/30 bg-emerald-950/20 text-emerald-100" : "border-red-400/30 bg-red-950/20 text-red-100"}`}>
                              {adminDiagnostics.providers.openai.configured ? adminText.ready : adminText.missing}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span>{adminText.claude} · {adminDiagnostics.providers.anthropic.model ?? "ANTHROPIC_MODEL"}</span>
                            <span className={`rounded border px-1.5 py-0.5 ${adminDiagnostics.providers.anthropic.configured ? "border-emerald-400/30 bg-emerald-950/20 text-emerald-100" : "border-amber-400/30 bg-amber-950/20 text-amber-100"}`}>
                              {adminDiagnostics.providers.anthropic.configured ? adminText.ready : adminText.missing}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 text-zinc-500">
                            <span>{adminText.fastModel}: {adminDiagnostics.providers.openai.fastModelConfigured ? adminText.yes : adminText.no}</span>
                            <span>{adminText.deepModel}: {adminDiagnostics.providers.openai.deepModelConfigured ? adminText.yes : adminText.no}</span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-md border border-zinc-800 bg-zinc-900/55 p-3">
                        <div className="mb-2 text-xs font-semibold text-zinc-200">{adminText.access}</div>
                        <div className="space-y-1.5 text-[11px] text-zinc-400">
                          <div className="flex items-center justify-between gap-2">
                            <span>{adminText.privateGate}</span>
                            <span>{adminDiagnostics.access.privateGateConfigured ? adminText.yes : adminText.no}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span>{adminText.accountGate}</span>
                            <span>{adminDiagnostics.access.accountGateConfigured ? adminText.yes : adminText.no}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span>{adminText.writeMode}</span>
                            <span>{adminDiagnostics.access.writeMode === "writable" ? adminText.writable : adminText.bestEffort}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span>{adminText.vercel}</span>
                            <span>{adminDiagnostics.access.vercel ? adminText.yes : adminText.no}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span>{adminText.cloudStorage}</span>
                            <span>
                              {adminDiagnostics.cloudStorage?.mode === "ready"
                                ? adminText.cloudReady
                                : adminDiagnostics.cloudStorage?.mode === "misconfigured"
                                  ? adminText.cloudMisconfigured
                                  : adminText.cloudDisabled}
                            </span>
                          </div>
                          {adminDiagnostics.cloudStorage?.configured && (
                            <div className="flex flex-wrap gap-1.5 text-zinc-500">
                              <span>{adminText.cloudEndpoint}: {adminDiagnostics.cloudStorage.endpointConfigured ? adminText.yes : adminText.no}</span>
                              <span>{adminText.cloudToken}: {adminDiagnostics.cloudStorage.tokenConfigured ? adminText.yes : adminText.no}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-md border border-zinc-800 bg-zinc-900/55 p-3">
                        <div className="mb-2 text-xs font-semibold text-zinc-200">{adminText.storage}</div>
                        <div className="space-y-1 text-[11px] text-zinc-400">
                          <div>{adminText.currentSession}: {adminDiagnostics.storage.currentSession ? adminText.yes : adminText.no}</div>
                          <div>{adminText.savedSessions}: {formatUsageNumber(adminDiagnostics.storage.savedSessions, language)}</div>
                          <div>{adminText.reviewPending}: {formatUsageNumber(adminDiagnostics.storage.reviewPending, language)}</div>
                          <div>{adminText.privateSessions}: {formatUsageNumber(adminDiagnostics.storage.privateSessions, language)}</div>
                          <div>{adminText.completedSessions}: {formatUsageNumber(adminDiagnostics.storage.completedSessions, language)}</div>
                          <div>{feedbackText.tab}: {formatUsageNumber(adminDiagnostics.storage.testerFeedback?.total ?? 0, language)}</div>
                        </div>
                      </div>

                      <div className="rounded-md border border-zinc-800 bg-zinc-900/55 p-3">
                        <div className="mb-2 text-xs font-semibold text-zinc-200">{adminText.assets}</div>
                        <div className="space-y-1 text-[11px] text-zinc-400">
                          <div>{adminText.imageFiles}: {formatUsageNumber(adminDiagnostics.assets.userSceneImageFiles, language)}</div>
                          <div>{adminText.manifestItems}: {formatUsageNumber(adminDiagnostics.assets.manifestItems, language)}</div>
                          <div>manifest.json: {adminDiagnostics.assets.manifestPresent ? adminText.yes : adminText.no}</div>
                        </div>
                      </div>

                      <div className="rounded-md border border-zinc-800 bg-zinc-900/55 p-3">
                        <div className="mb-2 text-xs font-semibold text-zinc-200">{adminText.worldIndex}</div>
                        <div className="space-y-1 text-[11px] text-zinc-400">
                          <div className="flex items-center justify-between gap-2">
                            <span>{adminText.worldIndexSource}</span>
                            <span className={`rounded border px-1.5 py-0.5 ${adminDiagnostics.worldIndex?.loaded ? "border-emerald-400/30 bg-emerald-950/20 text-emerald-100" : "border-amber-400/30 bg-amber-950/20 text-amber-100"}`}>
                              {adminDiagnostics.worldIndex?.loaded
                                ? adminDiagnostics.worldIndex.source === "local"
                                  ? adminText.localIndex
                                  : adminText.publicIndex
                                : adminText.missing}
                            </span>
                          </div>
                          <div>{adminText.worldIndexEntries}: {formatUsageNumber(adminDiagnostics.worldIndex?.entryCount ?? 0, language)}</div>
                          <div>{adminText.worldIndexFiles}: {formatUsageNumber(adminDiagnostics.worldIndex?.sourceFileCount ?? 0, language)}</div>
                          <div>{adminText.worldIndexFile}: {adminDiagnostics.worldIndex?.fileName ?? "-"}</div>
                          <div>{adminText.worldIndexTiers}: {formatUsageNumber(adminDiagnostics.worldIndex?.tiers.public ?? 0, language)} / {formatUsageNumber(adminDiagnostics.worldIndex?.tiers.restricted ?? 0, language)} / {formatUsageNumber(adminDiagnostics.worldIndex?.tiers.private ?? 0, language)}</div>
                          <div>{adminDiagnostics.worldIndex?.includePrivate ? adminText.privateIncluded : adminText.privateExcluded}</div>
                          {adminDiagnostics.worldIndex?.generatedAt && (
                            <div>{adminText.worldIndexGenerated}: {formatSavedAt(adminDiagnostics.worldIndex.generatedAt, language)}</div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-md border border-zinc-800 bg-zinc-900/55 p-3">
                        <div className="mb-2 text-xs font-semibold text-zinc-200">{adminText.limits}</div>
                        <div className="space-y-1 text-[11px] text-zinc-400">
                          <div>{adminText.dailyCalls}: {formatUsageNumber(adminDiagnostics.limits.dailyCallLimit, language)}</div>
                          <div>{adminText.dailyTokens}: {formatUsageNumber(adminDiagnostics.limits.dailyTokenLimit, language)}</div>
                          <div>{adminText.outputCap}: {formatUsageNumber(adminDiagnostics.limits.maxOutputTokens, language)}</div>
                          <div>{adminText.cooldown}: {formatUsageNumber(adminDiagnostics.limits.minSecondsBetweenCalls, language)}s</div>
                          <div>{adminText.context}: {formatUsageNumber(adminDiagnostics.limits.maxContextMessages, language)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-md border border-zinc-800 bg-zinc-900/45 px-3 py-2 text-[11px] text-zinc-500">
                      {adminText.checkedAt}: {formatSavedAt(adminDiagnostics.checkedAt, language)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {sessionInfoTab === "feedback" && (
            <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900/70 p-2">
              <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-rose-300 shadow-[0_0_10px_rgba(253,164,175,0.8)]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-zinc-100">{feedbackText.title}</div>
                    <div className="mt-1 text-xs leading-relaxed text-zinc-500">{feedbackText.description}</div>
                  </div>
                  <span className="shrink-0 rounded border border-rose-400/30 bg-rose-950/25 px-2 py-1 text-[11px] text-rose-100">
                    {feedbackText.value(openFeedbackCount, feedbackItems.length)}
                  </span>
                </div>

                <div className="mt-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    {feedbackText.category}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                    {FEEDBACK_CATEGORIES.map((category) => (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setFeedbackCategory(category)}
                        className={`rounded-md border px-2 py-2 text-xs font-semibold transition-colors ${
                          feedbackCategory === category
                            ? "border-rose-300/70 bg-rose-500/15 text-rose-50"
                            : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-rose-400/40 hover:text-zinc-100"
                        }`}
                      >
                        {feedbackText.categories[category]}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="mt-3 block text-xs font-medium text-zinc-400" htmlFor="tester-feedback-message">
                  {feedbackText.message}
                  <textarea
                    id="tester-feedback-message"
                    value={feedbackDraft}
                    onChange={(event) => setFeedbackDraft(event.currentTarget.value.slice(0, TESTER_FEEDBACK_MESSAGE_LIMIT))}
                    maxLength={TESTER_FEEDBACK_MESSAGE_LIMIT}
                    rows={4}
                    className="mt-2 w-full resize-none rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm leading-relaxed text-zinc-100 outline-none transition-colors placeholder:text-zinc-700 focus:border-rose-400/60"
                    placeholder={feedbackText.placeholder}
                  />
                </label>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-zinc-600">
                    {feedbackDraft.length}/{TESTER_FEEDBACK_MESSAGE_LIMIT}
                  </span>
                  <button
                    type="button"
                    onClick={submitTesterFeedback}
                    disabled={feedbackLoading || feedbackDraft.trim().length < 4}
                    className="rounded-md border border-rose-500/40 bg-rose-950/25 px-3 py-2 text-xs font-semibold text-rose-100 transition-colors hover:border-rose-300/70 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {feedbackLoading ? feedbackText.submitting : feedbackText.submit}
                  </button>
                </div>

                {feedbackNotice && <p className="mt-2 text-[11px] text-emerald-300">{feedbackNotice}</p>}
                {feedbackError && <p className="mt-2 text-[11px] text-red-300">{feedbackError}</p>}

                {accountProfile?.role === "admin" && (
                  <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-900/55 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-zinc-200">{feedbackText.adminTitle}</div>
                        <div className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                          {feedbackText.adminDescription}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => refreshTesterFeedback()}
                        disabled={feedbackLoading}
                        className="shrink-0 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:border-rose-400/50 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {feedbackText.refresh}
                      </button>
                    </div>

                    <div className="mt-3 space-y-2">
                      {feedbackItems.length === 0 && (
                        <div className="rounded-md border border-dashed border-zinc-800 px-3 py-4 text-xs text-zinc-600">
                          {feedbackText.empty}
                        </div>
                      )}
                      {feedbackItems.slice(0, 8).map((item) => (
                        <div key={item.id} className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                            <span className="rounded border border-rose-400/25 bg-rose-950/20 px-1.5 py-0.5 text-rose-100">
                              {feedbackText.categories[item.category]}
                            </span>
                            <span>{feedbackText.status[item.status]}</span>
                            <span>{item.accountName ?? item.accountId ?? "tester"}</span>
                            <span>{formatSavedAt(item.createdAt, language)}</span>
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-zinc-200">{item.message}</p>
                          {(item.sessionTitle || item.turnCount !== undefined) && (
                            <p className="mt-1 text-[11px] text-zinc-600">
                              {feedbackText.recent}: {item.sessionTitle ?? "session"} · {formatUsageNumber(item.turnCount ?? 0, language)}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {FEEDBACK_STATUS_OPTIONS.map((status) => (
                              <button
                                key={status}
                                type="button"
                                onClick={() => updateTesterFeedbackStatus(item.id, status)}
                                disabled={feedbackLoading || item.status === status}
                                className={`rounded border px-2 py-1 text-[11px] transition-colors ${
                                  item.status === status
                                    ? "border-emerald-400/35 bg-emerald-950/20 text-emerald-100"
                                    : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600 hover:text-zinc-200"
                                } disabled:cursor-not-allowed disabled:opacity-55`}
                              >
                                {feedbackText.status[status]}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {sessionInfoTab === "save" && (
            <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900/70 p-2">
              <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
                <input
                  ref={sessionImportInputRef}
                  type="file"
                  accept=".json,.tiu-session,.tiu-session.json,application/json"
                  className="hidden"
                  onChange={(event) => importSessionSaveFile(event.currentTarget.files?.[0] ?? null)}
                />
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-blue-300 shadow-[0_0_10px_rgba(147,197,253,0.8)]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-zinc-100">{text.save.title}</div>
                    <div className="mt-1 text-xs leading-relaxed text-zinc-500">{text.save.description}</div>
                  </div>
                  <span className="shrink-0 rounded border border-blue-400/30 bg-blue-950/25 px-2 py-1 text-[11px] text-blue-100">
                    {text.save.auto}
                  </span>
                </div>
                <div className={`mt-3 rounded-md border px-3 py-2 text-xs leading-relaxed ${serverSyncText.className}`}>
                  <div className="font-semibold">{serverSyncText.title}</div>
                  <div className="mt-1 opacity-80">{serverSyncText.detail}</div>
                  {lastServerSyncAt && (
                    <div className="mt-1 text-[11px] opacity-60">
                      {language === "en" ? "Last check" : "최근 확인"}: {formatSavedAt(lastServerSyncAt, language)}
                    </div>
                  )}
                </div>

                {sessionSave ? (
                  <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-full min-w-0 truncate text-sm font-medium text-zinc-100 sm:w-auto sm:flex-1">{sessionSave.title}</div>
                      <span className="shrink-0 rounded border border-emerald-400/30 bg-emerald-950/20 px-2 py-0.5 text-[10px] text-emerald-200">
                        {text.save.currentBadge}
                      </span>
                      <span
                        className={`shrink-0 rounded border px-2 py-0.5 text-[10px] ${
                          sessionSave.status === "completed"
                            ? "border-violet-400/30 bg-violet-950/20 text-violet-100"
                            : "border-emerald-400/30 bg-emerald-950/20 text-emerald-100"
                        }`}
                      >
                        {getSessionStatusText(sessionSave.status, text.save).title}
                      </span>
                      <span
                        className={`shrink-0 rounded border px-2 py-0.5 text-[10px] ${
                          sessionSave.mode === "official"
                            ? "border-cyan-400/30 bg-cyan-950/20 text-cyan-100"
                            : "border-amber-400/30 bg-amber-950/20 text-amber-100"
                        }`}
                      >
                        {getSessionModeText(sessionSave.mode, text.save).title}
                      </span>
                      <span className="shrink-0 rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-[10px] text-zinc-300">
                        {getSessionVisibilityText(sessionSave.visibility, text.save).title}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                      <span>{text.save.updated}: {formatSavedAt(sessionSave.updatedAt, language)}</span>
                      <span>{text.save.turns(sessionSave.turns.length)}</span>
                      <span>{getSessionStatusText(sessionSave.status, text.save).detail}</span>
                      <span>{getSessionModeText(sessionSave.mode, text.save).detail}</span>
                      <span>{getSessionVisibilityText(sessionSave.visibility, text.save).detail}</span>
                      <span>{getDifficultyOptionText(
                        DIFFICULTY_OPTIONS.find((option) => option.id === sessionSave.difficultyMode) ?? DIFFICULTY_OPTIONS[1],
                        language,
                      ).title}</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-md border border-dashed border-zinc-800 px-3 py-4 text-xs leading-relaxed text-zinc-600">
                    {text.save.noSave}
                  </div>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <button
                    type="button"
                    onClick={() => sessionSave && applySessionSave(sessionSave, true)}
                    disabled={!sessionSave || loading}
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-blue-400/60 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {text.save.load}
                  </button>
                  <button
                    type="button"
                    onClick={saveCurrentSession}
                    disabled={turns.length === 0 || loading}
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-emerald-400/60 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {text.save.saveNow}
                  </button>
                  <button
                    type="button"
                    onClick={() => sessionSave && exportSessionSave(sessionSave)}
                    disabled={!sessionSave || loading}
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-cyan-400/60 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {text.save.export}
                  </button>
                  <button
                    type="button"
                    onClick={() => sessionImportInputRef.current?.click()}
                    disabled={loading}
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-amber-400/60 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {text.save.import}
                  </button>
                  <button
                    type="button"
                    onClick={clearCurrentSession}
                    disabled={loading}
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-red-400/50 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {text.save.newSession}
                  </button>
                </div>
                {saveNotice && (
                  <p className="mt-2 text-[11px] leading-relaxed text-emerald-300">{saveNotice}</p>
                )}
                <div className="mt-4 border-t border-zinc-900 pt-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-zinc-200">{text.save.libraryTitle}</span>
                    <span className="text-[11px] text-zinc-600">{text.save.libraryCount(sessionLibrary.length)}</span>
                  </div>
                  {sessionLibrary.length > 0 ? (
                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1 no-scrollbar">
                      {sessionLibrary.map((save) => {
                        const isCurrent = sessionSave?.id === save.id;
                        const saveDifficulty = getDifficultyOptionText(
                          DIFFICULTY_OPTIONS.find((option) => option.id === save.difficultyMode) ?? DIFFICULTY_OPTIONS[1],
                          language,
                        );
                        const saveMode = getSessionModeText(save.mode, text.save);
                        const saveStatus = getSessionStatusText(save.status, text.save);
                        const saveVisibility = getSessionVisibilityText(save.visibility, text.save);

                        return (
                          <div
                            key={save.id}
                            className={`rounded-md border p-3 transition-colors ${
                              isCurrent
                                ? "border-blue-400/45 bg-blue-950/15"
                                : "border-zinc-800 bg-zinc-900/45"
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="w-full min-w-0 truncate text-sm font-medium text-zinc-100 sm:w-auto sm:flex-1">{save.title}</span>
                                  <span
                                    className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${
                                      save.status === "completed"
                                        ? "border-violet-400/30 bg-violet-950/20 text-violet-100"
                                        : "border-emerald-400/30 bg-emerald-950/20 text-emerald-100"
                                    }`}
                                  >
                                    {saveStatus.title}
                                  </span>
                                  <span
                                    className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${
                                      save.mode === "official"
                                        ? "border-cyan-400/30 bg-cyan-950/20 text-cyan-100"
                                        : "border-amber-400/30 bg-amber-950/20 text-amber-100"
                                    }`}
                                  >
                                    {saveMode.title}
                                  </span>
                                  <span className="shrink-0 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-[10px] text-zinc-300">
                                    {saveVisibility.title}
                                  </span>
                                  {isCurrent && (
                                    <span className="shrink-0 rounded border border-blue-400/30 bg-blue-950/30 px-1.5 py-0.5 text-[10px] text-blue-100">
                                      {text.save.currentBadge}
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                                  <span>{text.save.updated}: {formatSavedAt(save.updatedAt, language)}</span>
                                  <span>{text.save.turns(save.turns.length)}</span>
                                  <span>{saveStatus.detail}</span>
                                  <span>{saveMode.detail}</span>
                                  <span>{saveVisibility.detail}</span>
                                  <span>{saveDifficulty.title}</span>
                                </div>
                              </div>
                            </div>
                            {renamingSessionId === save.id && (
                              <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-2">
                                <input
                                  value={renameValue}
                                  onChange={(event) => setRenameValue(event.currentTarget.value.slice(0, 80))}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") commitRenameSession(save.id);
                                    if (event.key === "Escape") {
                                      setRenamingSessionId(null);
                                      setRenameValue("");
                                    }
                                  }}
                                  disabled={loading}
                                  maxLength={80}
                                  className="min-w-0 rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 outline-none transition-colors focus:border-emerald-400/70 disabled:opacity-40"
                                />
                                <button
                                  type="button"
                                  onClick={() => commitRenameSession(save.id)}
                                  disabled={loading || !renameValue.trim()}
                                  className="rounded border border-emerald-500/40 bg-emerald-950/20 px-2 py-1.5 text-xs text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {text.save.renameSave}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRenamingSessionId(null);
                                    setRenameValue("");
                                  }}
                                  disabled={loading}
                                  className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-500 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {text.save.cancel}
                                </button>
                              </div>
                            )}
                            {publishSessionId === save.id && (
                              <div className="mt-2 rounded-md border border-amber-500/25 bg-amber-950/10 p-2">
                                <div className="text-xs font-semibold text-amber-100">{text.save.publishTitle}</div>
                                <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{text.save.publishIntro}</p>
                                <div className="mt-2 space-y-1.5">
                                  {PUBLISH_CONSENT_KEYS.map((key) => (
                                    <label key={key} className="flex gap-2 rounded border border-zinc-800 bg-zinc-950/70 px-2 py-1.5 text-[11px] leading-relaxed text-zinc-300">
                                      <input
                                        type="checkbox"
                                        checked={publishConsents[key]}
                                        onChange={(event) => updatePublishConsent(key, event.currentTarget.checked)}
                                        disabled={loading}
                                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-amber-400"
                                      />
                                      <span>{getPublishConsentLabel(key, text.save)}</span>
                                    </label>
                                  ))}
                                </div>
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => requestPublishReview(save)}
                                    disabled={loading || !PUBLISH_CONSENT_KEYS.every((key) => publishConsents[key])}
                                    className="rounded border border-amber-400/50 bg-amber-950/20 px-2 py-1.5 text-xs text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    {text.save.requestPublish}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPublishSessionId(null);
                                      setPublishConsents(EMPTY_PUBLISH_CONSENTS);
                                    }}
                                    disabled={loading}
                                    className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-500 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    {text.save.cancel}
                                  </button>
                                </div>
                              </div>
                            )}
                            <div className="mt-2 grid grid-cols-3 gap-2">
                              <button
                                type="button"
                                onClick={() => applySessionSave(save, true)}
                                disabled={loading}
                                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 hover:border-blue-400/60 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {text.save.load}
                              </button>
                              <button
                                type="button"
                                onClick={() => copySessionToLibrary(save)}
                                disabled={loading}
                                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 hover:border-emerald-400/60 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {text.save.copy}
                              </button>
                              <button
                                type="button"
                                onClick={() => exportSessionSave(save)}
                                disabled={loading}
                                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 hover:border-cyan-400/60 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {text.save.export}
                              </button>
                              <button
                                type="button"
                                onClick={() => beginRenameSession(save)}
                                disabled={loading}
                                className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-400 hover:border-amber-400/60 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {text.save.rename}
                              </button>
                              <button
                                type="button"
                                onClick={() => setStoredSessionStatus(save, save.status === "completed" ? "in_progress" : "completed")}
                                disabled={loading}
                                className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-400 hover:border-violet-400/60 hover:text-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {save.status === "completed" ? text.save.reopen : text.save.completed}
                              </button>
                              <button
                                type="button"
                                onClick={() => (save.visibility === "private" ? beginPublishConsent(save) : makeSessionPrivate(save))}
                                disabled={loading}
                                className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-400 hover:border-amber-400/60 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {save.visibility === "private" ? text.save.preparePublish : text.save.makePrivate}
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteSessionFromLibrary(save.id)}
                                disabled={loading}
                                aria-label={`${text.save.deleteLabel}: ${save.title}`}
                                className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-500 hover:border-red-400/50 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {text.save.delete}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-zinc-800 px-3 py-4 text-xs text-zinc-600">
                      {text.save.libraryEmpty}
                    </div>
                  )}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
                  {text.save.newSessionHint}
                </p>
              </div>
            </div>
          )}

          {sessionInfoTab === "library" && (
            <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900/70 p-2">
              <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.75)]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-zinc-100">{text.library.title}</div>
                    <div className="mt-1 text-xs leading-relaxed text-zinc-500">{text.library.description}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSessionInfoTab("menu")}
                    className="shrink-0 rounded border border-zinc-800 px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-200"
                  >
                    {text.tabs.menu}
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: text.library.total, value: sessionLibrary.length, className: "border-zinc-800 text-zinc-200" },
                    { label: text.library.pending, value: pendingLibrarySessions.length, className: "border-amber-500/30 text-amber-100" },
                    { label: text.library.private, value: privateLibrarySessions.length, className: "border-blue-500/25 text-blue-100" },
                    { label: text.library.completed, value: completedLibrarySessions.length, className: "border-violet-500/25 text-violet-100" },
                  ].map((stat) => (
                    <div key={stat.label} className={`rounded-md border bg-zinc-900/55 px-3 py-2 ${stat.className}`}>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{stat.label}</div>
                      <div className="mt-1 text-lg font-semibold">{stat.value}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-900/45">
                  <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
                    <div>
                      <div className="text-xs font-semibold text-zinc-200">{text.library.pendingTitle}</div>
                      <div className="mt-0.5 text-[11px] text-zinc-600">{text.library.reviewHint}</div>
                    </div>
                    <span className="shrink-0 rounded border border-amber-400/30 bg-amber-950/20 px-2 py-1 text-[11px] text-amber-100">
                      {pendingLibrarySessions.length}
                    </span>
                  </div>

                  {pendingLibrarySessions.length > 0 ? (
                    <div className="max-h-72 space-y-2 overflow-y-auto p-2 pr-1 no-scrollbar">
                      {pendingLibrarySessions.map((save) => {
                        const saveDifficulty = getDifficultyOptionText(
                          DIFFICULTY_OPTIONS.find((option) => option.id === save.difficultyMode) ?? DIFFICULTY_OPTIONS[1],
                          language,
                        );
                        const saveMode = getSessionModeText(save.mode, text.save);
                        const saveStatus = getSessionStatusText(save.status, text.save);

                        return (
                          <div key={save.id} className="rounded-md border border-amber-500/20 bg-amber-950/10 p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="w-full min-w-0 truncate text-sm font-medium text-zinc-100 sm:w-auto sm:flex-1">{save.title}</span>
                              <span className="shrink-0 rounded border border-amber-400/30 bg-zinc-950 px-1.5 py-0.5 text-[10px] text-amber-100">
                                {getSessionVisibilityText(save.visibility, text.save).title}
                              </span>
                              <span
                                className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${
                                  save.mode === "official"
                                    ? "border-cyan-400/30 bg-cyan-950/20 text-cyan-100"
                                    : "border-amber-400/30 bg-amber-950/20 text-amber-100"
                                }`}
                              >
                                {saveMode.title}
                              </span>
                              <span
                                className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${
                                  save.status === "completed"
                                    ? "border-violet-400/30 bg-violet-950/20 text-violet-100"
                                    : "border-emerald-400/30 bg-emerald-950/20 text-emerald-100"
                                }`}
                              >
                                {saveStatus.title}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                              <span>{text.save.updated}: {formatSavedAt(save.updatedAt, language)}</span>
                              <span>{text.save.turns(save.turns.length)}</span>
                              <span>{saveDifficulty.title}</span>
                              <span>{saveMode.detail}</span>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                              <button
                                type="button"
                                onClick={() => applySessionSave(save, true)}
                                disabled={loading}
                                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 hover:border-blue-400/60 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {text.save.load}
                              </button>
                              <button
                                type="button"
                                onClick={() => copySessionToLibrary(save)}
                                disabled={loading}
                                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 hover:border-emerald-400/60 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {text.save.copy}
                              </button>
                              <button
                                type="button"
                                onClick={() => exportSessionSave(save)}
                                disabled={loading}
                                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 hover:border-cyan-400/60 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {text.save.export}
                              </button>
                              <button
                                type="button"
                                onClick={() => makeSessionPrivate(save)}
                                disabled={loading}
                                className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-400 hover:border-amber-400/60 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {text.save.makePrivate}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-3 py-5 text-xs leading-relaxed text-zinc-600">
                      {text.library.emptyPending}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {sessionInfoTab === "usage" && (
            <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900/70 p-2">
              <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-lime-300 shadow-[0_0_10px_rgba(190,242,100,0.75)]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-zinc-100">{text.usage.title}</div>
                    <div className="mt-1 text-xs leading-relaxed text-zinc-500">{text.usage.description}</div>
                  </div>
                  <span
                    className={`shrink-0 rounded border px-2 py-1 text-[11px] ${
                      apiUsage?.status && apiUsage.status !== "ok"
                        ? "border-amber-400/30 bg-amber-950/20 text-amber-100"
                        : "border-lime-400/30 bg-lime-950/20 text-lime-100"
                    }`}
                  >
                    {usageStatusLabel}
                  </span>
                </div>

                {apiUsage ? (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        {
                          label: text.usage.calls,
                          value: `${formatUsageNumber(apiUsage.calls, language)} / ${formatUsageNumber(apiUsage.dailyCallLimit, language)}`,
                          percent: usageCallPercent,
                          className: "border-lime-500/25 text-lime-100",
                        },
                        {
                          label: text.usage.tokenBudget,
                          value: `${formatUsageNumber(apiUsage.estimatedTokens, language)} / ${formatUsageNumber(apiUsage.dailyTokenLimit, language)}`,
                          percent: usageTokenPercent,
                          className: "border-cyan-500/25 text-cyan-100",
                        },
                        {
                          label: text.usage.outputCap,
                          value: `${formatUsageNumber(apiUsage.maxOutputTokens, language)} tokens`,
                          percent: 0,
                          className: "border-red-500/25 text-red-100",
                        },
                        {
                          label: text.usage.blocked,
                          value: formatUsageNumber(apiUsage.blocked, language),
                          percent: 0,
                          className: "border-amber-500/25 text-amber-100",
                        },
                      ].map((item) => (
                        <div key={item.label} className={`rounded-md border bg-zinc-900/55 px-3 py-2 ${item.className}`}>
                          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{item.label}</div>
                          <div className="mt-1 text-sm font-semibold">{item.value}</div>
                          {item.percent > 0 && (
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                              <div className="h-full rounded-full bg-current" style={{ width: `${item.percent}%` }} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="rounded-md border border-zinc-800 bg-zinc-900/45 px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <span>{text.usage.actual}: {formatUsageNumber(apiUsage.actualTokens, language)}</span>
                        <span>{text.usage.estimated}: {formatUsageNumber(apiUsage.estimatedTokens, language)}</span>
                        <span>{text.usage.cooldown}: {apiUsage.minSecondsBetweenCalls}s</span>
                        {apiUsage.lastModel && <span>{text.usage.lastModel}: {apiUsage.lastModel}</span>}
                      </div>
                      {apiUsage.message && (
                        <div className="mt-2 rounded border border-amber-400/25 bg-amber-950/10 px-2 py-1 text-amber-100">
                          {apiUsage.message}
                        </div>
                      )}
                      <p className="mt-2 text-zinc-600">{text.usage.note}</p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-md border border-dashed border-zinc-800 px-3 py-5 text-xs leading-relaxed text-zinc-600">
                    {text.usage.noUsage}
                  </div>
                )}
              </div>
            </div>
          )}

          {sessionInfoTab === "assets" && (
            <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900/70 p-2">
              <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-fuchsia-300 shadow-[0_0_10px_rgba(240,171,252,0.75)]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-zinc-100">{text.assets.title}</div>
                    <div className="mt-1 text-xs leading-relaxed text-zinc-500">{text.assets.description}</div>
                  </div>
                  <span className="shrink-0 rounded border border-fuchsia-400/25 bg-fuchsia-950/15 px-2 py-1 text-[11px] text-fuchsia-100">
                    {userSceneImages.length > 0 ? text.tabs.assetsCount(userSceneImages.length) : text.tabs.assetsEmpty}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-md border border-zinc-800 bg-zinc-900/55 px-3 py-2">
                    <div className="text-[11px] text-zinc-500">{text.assets.folder}</div>
                    <div className="mt-1 break-all text-xs font-medium text-zinc-200">
                      public/assets/user-scenes
                    </div>
                  </div>
                  <div className="rounded-md border border-zinc-800 bg-zinc-900/55 px-3 py-2">
                    <div className="text-[11px] text-zinc-500">{text.assets.loaded}</div>
                    <div className="mt-1 text-xs font-medium text-zinc-200">
                      {userSceneImages.length > 0
                        ? `${formatUsageNumber(userSceneImages.length, language)} / manifest.json`
                        : text.assets.empty}
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-900/45 px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
                  {text.assets.rule}
                </div>
              </div>
            </div>
          )}

          {sessionInfoTab === "difficulty" && (
            <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900/70 p-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
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

      {!cookieNoticeDismissed && (
        <div className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-2xl rounded-md border border-zinc-700 bg-zinc-950/95 p-3 shadow-[0_16px_60px_rgba(0,0,0,0.45)] safe-bottom">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-zinc-400">{text.cookie.text}</p>
            <div className="flex shrink-0 gap-2">
              <a
                href="/legal"
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-emerald-400/50 hover:text-emerald-100"
              >
                {text.cookie.link}
              </a>
              <button
                type="button"
                onClick={dismissCookieNotice}
                className="rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold text-black transition-colors hover:bg-emerald-400"
              >
                {text.cookie.action}
              </button>
            </div>
          </div>
        </div>
      )}

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
                <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-400">
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
                      onClick={() => send(example, language === "en" ? "Start with this character" : "이 캐릭터로 시작")}
                      disabled={loading}
                      className="w-full rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-left text-xs leading-relaxed text-zinc-400 hover:border-blue-500/50 hover:bg-blue-950/10 hover:text-zinc-200 disabled:opacity-50"
                    >
                      {example}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowCustomStartInput((value) => !value)}
                    aria-pressed={showCustomStartInput}
                    disabled={loading}
                    className={`w-full rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors disabled:opacity-50 ${
                      showCustomStartInput
                        ? "border-emerald-400/70 bg-emerald-950/20 text-emerald-100"
                        : "border-zinc-800 bg-zinc-950/40 text-zinc-300 hover:border-emerald-500/45 hover:text-zinc-100"
                    }`}
                  >
                    {text.start.customCharacter}
                  </button>
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
                  const sceneImage = pickSceneImage(t.response, userSceneImages);
                  return sceneImage ? <SceneImageCard image={sceneImage} /> : null;
                })()}
                <div className="rounded-lg bg-zinc-900 px-3.5 py-3 text-sm leading-relaxed whitespace-pre-wrap text-zinc-200">
                  {t.response.continuation && (
                    <div className="mb-2 inline-flex rounded border border-amber-400/35 bg-amber-950/20 px-2 py-1 text-[11px] font-medium text-amber-100">
                      {text.bottom.continueGeneration}
                    </div>
                  )}
                  {t.response.narrative}
                </div>
                {t.response.truncated && (
                  <div className="rounded-md border border-amber-500/25 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
                    <div className="mb-2 text-amber-200/90">{text.bottom.continueHint}</div>
                    <button
                      type="button"
                      onClick={() => continueAssistantTurn(i, t.response)}
                      disabled={loading || continuingTurnIndex !== null}
                      className="rounded-md border border-amber-400/35 bg-black/35 px-3 py-1.5 font-medium text-amber-50 transition-colors hover:border-amber-300 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {continuingTurnIndex === i ? text.bottom.continuing : text.bottom.continueGeneration}
                    </button>
                  </div>
                )}
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
                onClick={() => undefined}
                disabled={loading || !hasSuggestions}
                aria-pressed={hasSuggestions}
                aria-label={text.bottom.aiLabel}
                className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                  hasSuggestions
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
              {canOpenFreeformInput && (
                <button
                  type="button"
                  onClick={() => setShowFreeformInput((value) => !value)}
                  aria-pressed={showFreeformInput}
                  className={`rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors ${
                    showFreeformInput
                      ? "border-amber-400/70 bg-amber-950/25 text-amber-100"
                      : "border-zinc-800 bg-zinc-950/50 text-zinc-300 hover:border-amber-500/40 hover:text-zinc-100"
                  }`}
                >
                  {text.bottom.freeform}
                </button>
              )}
            </div>

            {hasSuggestions && (
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

          {shouldShowInputForm && (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onInput={(e) => setInput(e.currentTarget.value)}
                placeholder={shouldShowCustomStartInput ? text.start.inputPlaceholder : text.bottom.freeformPlaceholder}
                disabled={loading}
                autoComplete="off"
                className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm placeholder-zinc-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium hover:bg-blue-500 active:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-700"
              >
                {shouldShowCustomStartInput ? text.start.customSubmit : text.bottom.send}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
