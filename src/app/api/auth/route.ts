import { NextResponse } from "next/server";
import {
  ACCOUNT_COOKIE,
  createAccountToken,
  isAdminLoginEnabled,
  sanitizeDisplayName,
  verifyAccountLogin,
  verifyAccountToken,
  type AccountProfile,
} from "@/lib/account";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/access";

export const runtime = "nodejs";

function readCookie(headers: Headers, name: string): string | undefined {
  const cookie = headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.split("=")[1];
}

function hasAccess(req: Request): boolean {
  return verifyAccessToken(readCookie(req.headers, ACCESS_COOKIE));
}

function accountCookie(profile: AccountProfile) {
  return {
    name: ACCOUNT_COOKIE,
    value: createAccountToken(profile),
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  };
}

export async function GET(req: Request) {
  if (!hasAccess(req)) {
    return NextResponse.json({ error: "접속 비밀번호가 필요합니다." }, { status: 401 });
  }

  const profile = verifyAccountToken(readCookie(req.headers, ACCOUNT_COOKIE));
  return NextResponse.json({
    authenticated: Boolean(profile),
    profile,
  });
}

export async function POST(req: Request) {
  if (!hasAccess(req)) {
    return NextResponse.json({ error: "접속 비밀번호가 필요합니다." }, { status: 401 });
  }

  if (!isAdminLoginEnabled()) {
    return NextResponse.json(
      { error: "관리자 로그인이 설정되지 않았습니다. TIU_ADMIN_PASSWORD와 TIU_ACCOUNT_SECRET을 설정해 주세요." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  const password = typeof body.password === "string" ? body.password : "";
  const profile = verifyAccountLogin(id, password);

  if (!profile) {
    return NextResponse.json({ error: "아이디 또는 비밀번호가 맞지 않습니다." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, profile });
  res.cookies.set(accountCookie(profile));
  return res;
}

export async function PUT(req: Request) {
  if (!hasAccess(req)) {
    return NextResponse.json({ error: "접속 비밀번호가 필요합니다." }, { status: 401 });
  }

  const current = verifyAccountToken(readCookie(req.headers, ACCOUNT_COOKIE));
  if (!current) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const displayName = sanitizeDisplayName(body.displayName);
  if (!displayName) {
    return NextResponse.json({ error: "표시 이름을 입력해 주세요." }, { status: 400 });
  }

  const profile: AccountProfile = { ...current, displayName };
  const res = NextResponse.json({ ok: true, profile });
  res.cookies.set(accountCookie(profile));
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ACCOUNT_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
