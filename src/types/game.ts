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

export type GameResponse = {
  narrative: string;
  choices: Choice[];
  allow_freeform: boolean;
  raw: string;
  briefing?: GameBriefing;
  memory_updates?: string[];
};
