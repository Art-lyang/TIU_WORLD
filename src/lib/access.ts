import crypto from "node:crypto";

export const ACCESS_COOKIE = "tiu_access";

function accessPassword(): string {
  return process.env.TIU_ACCESS_PASSWORD?.trim() ?? "";
}

function accessSecret(): string {
  return process.env.TIU_ACCESS_SECRET?.trim() || accessPassword();
}

export function isAccessEnabled(): boolean {
  return accessPassword().length > 0;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function verifyAccessPassword(password: string): boolean {
  const expected = accessPassword();
  if (!expected) return true;
  return safeEqual(password, expected);
}

export function createAccessToken(): string {
  const secret = accessSecret();
  if (!secret) return "local-dev";

  return crypto
    .createHmac("sha256", secret)
    .update("tiu-worldgame-access")
    .digest("hex");
}

export function verifyAccessToken(token: string | undefined): boolean {
  if (!isAccessEnabled()) return true;
  if (!token) return false;
  return safeEqual(token, createAccessToken());
}
