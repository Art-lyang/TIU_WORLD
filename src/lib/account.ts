import crypto from "node:crypto";

export const ACCOUNT_COOKIE = "tiu_account";

export type AccountRole = "admin";

export type AccountProfile = {
  id: string;
  displayName: string;
  role: AccountRole;
};

function adminId(): string {
  return process.env.TIU_ADMIN_ID?.trim() || "admin";
}

function adminPassword(): string {
  return process.env.TIU_ADMIN_PASSWORD?.trim() || "KSH2202@TIU#";
}

function adminDisplayName(): string {
  return process.env.TIU_ADMIN_DISPLAY_NAME?.trim() || "관리자";
}

function accountSecret(): string {
  return (
    process.env.TIU_ACCOUNT_SECRET?.trim() ||
    process.env.TIU_ACCESS_SECRET?.trim() ||
    process.env.TIU_ACCESS_PASSWORD?.trim() ||
    "tiu-local-account-secret"
  );
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", accountSecret()).update(payload).digest("base64url");
}

export function sanitizeDisplayName(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  return text.replace(/\s+/g, " ").trim().slice(0, 24);
}

export function verifyAccountLogin(id: string, password: string): AccountProfile | null {
  if (!safeEqual(id.trim(), adminId())) return null;
  if (!safeEqual(password, adminPassword())) return null;

  return {
    id: "admin",
    displayName: adminDisplayName(),
    role: "admin",
  };
}

export function createAccountToken(profile: AccountProfile): string {
  const payload = Buffer.from(JSON.stringify(profile), "utf-8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyAccountToken(token: string | undefined): AccountProfile | null {
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as Record<string, unknown>;
    const id = typeof parsed.id === "string" ? parsed.id : "";
    const displayName = sanitizeDisplayName(parsed.displayName);
    const role = parsed.role === "admin" ? "admin" : null;
    if (!id || !displayName || !role) return null;
    return { id, displayName, role };
  } catch {
    return null;
  }
}
