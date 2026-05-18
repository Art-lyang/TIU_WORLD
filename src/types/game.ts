export type Role = "user" | "assistant";

export type ChatMessage = {
  role: Role;
  content: string;
};

export type Choice = {
  text: string;
};

export type BriefingClue = {
  title: string;
  detail: string;
  status: string;
  source: string;
};

export type BriefingPerson = {
  name: string;
  emotion: string;
  detail: string;
  trust?: string;
  lastSeen?: string;
  known?: string;
};

export type GameBriefing = {
  time: string;
  status: string;
  emotion: string;
  goals: string[];
  clues: BriefingClue[];
  groups: string[];
  people: BriefingPerson[];
  money: string;
  inventory: string[];
  logs: string[];
};

export type DisclosureLevel = "PUBLIC" | "RESTRICTED" | "OBSERVER" | "PRIVATE";

export type CasePhase = "intake" | "evidence" | "verification" | "reveal" | "aftermath";

export type ClueStatus = "unseen" | "noticed" | "collected" | "verified" | "contradicted";

export type NpcRelation = "unknown" | "neutral" | "helpful" | "wary" | "hostile";

export type CaseState = {
  id: string;
  title: string;
  route: string;
  phase: CasePhase;
  turn: number;
  publicObjective: string;
  activeQuestion: string;
  pressure: string;
  disclosureLevel: DisclosureLevel;
  risk: number;
};

export type ClueRecord = {
  id: string;
  title: string;
  detail: string;
  status: ClueStatus;
  source: string;
  unlocks?: DisclosureLevel;
};

export type NpcRecord = {
  id: string;
  name: string;
  role: string;
  emotion: string;
  relation: NpcRelation;
  trust: number;
  known: string;
  lastSeen: string;
};

export type DisclosureGate = {
  id: string;
  label: string;
  level: DisclosureLevel;
  status: "locked" | "hypothesis" | "unlocked";
  requiredClues: string[];
  hint: string;
};

export type GameEngineState = {
  caseState: CaseState;
  clues: ClueRecord[];
  npcs: NpcRecord[];
  disclosureGates: DisclosureGate[];
};

export type ApiUsageSnapshot = {
  date: string;
  calls: number;
  blocked: number;
  dailyCallLimit: number;
  dailyTokenLimit: number;
  estimatedTokens: number;
  actualTokens: number;
  inputTokens: number;
  outputTokens: number;
  maxOutputTokens: number;
  minSecondsBetweenCalls: number;
  lastRequestAt?: string;
  nextAllowedAt?: string;
  lastModel?: string;
  status: "ok" | "cooldown" | "call_limit" | "token_limit";
  message?: string;
};

export type GameResponse = {
  narrative: string;
  choices: Choice[];
  allow_freeform: boolean;
  raw: string;
  briefing?: GameBriefing;
  memory_updates?: string[];
  truncated?: boolean;
  continuation?: boolean;
  continuation_of?: string;
  usage?: ApiUsageSnapshot;
  engine?: GameEngineState;
};
