import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  computeAuthToken,
  getAdminPassword,
  isAuthDisabled
} from "@/lib/auth";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  if (isAuthDisabled()) {
    return NextResponse.json({ ok: true, disabled: true });
  }

  let password = "";
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  if (!password || password !== getAdminPassword()) {
    return NextResponse.json(
      { ok: false, error: "Incorrect password." },
      { status: 401 }
    );
  }

  const token = await computeAuthToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // ~1 year. Cookie only clears on explicit sign out.
    maxAge: 60 * 60 * 24 * 365
  });
  return res;
}
