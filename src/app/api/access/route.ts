import { NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  createAccessToken,
  isAccessEnabled,
  verifyAccessPassword,
  verifyAccessToken,
} from "@/lib/access";

export const runtime = "nodejs";

function readCookieToken(req: Request): string | undefined {
  const cookie = req.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ACCESS_COOKIE}=`))
    ?.split("=")[1];
}

export async function GET(req: Request) {
  const enabled = isAccessEnabled();
  const authenticated = verifyAccessToken(readCookieToken(req));

  return NextResponse.json({
    enabled,
    authenticated,
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";

  if (!verifyAccessPassword(password)) {
    return NextResponse.json({ error: "비밀번호가 맞지 않습니다." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ACCESS_COOKIE,
    value: createAccessToken(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });

  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ACCESS_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return res;
}
