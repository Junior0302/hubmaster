import { NextResponse } from "next/server";
import { adminAuth, isAdminConfigured } from "@/lib/firebase-admin";

const expiresIn = 60 * 60 * 24 * 5 * 1000;

export async function POST(request: Request) {
  const { idToken } = (await request.json()) as { idToken?: string };
  if (!idToken) return NextResponse.json({ error: "Jeton manquant" }, { status: 400 });

  try {
    const session = isAdminConfigured
      ? await adminAuth.createSessionCookie(idToken, { expiresIn })
      : "projecthub-demo-session";
    const response = NextResponse.json({ ok: true });
    response.cookies.set("projecthub_session", session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: expiresIn / 1000,
      path: "/",
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Authentification refusée" }, { status: 401 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("projecthub_session");
  return response;
}
