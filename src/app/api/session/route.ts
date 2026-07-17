import { NextResponse } from "next/server";
import { getAdminAuth, isAdminConfigured } from "@/lib/firebase-admin";
import { explainFirebaseAdminError } from "@/lib/firebase-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const expiresIn = 60 * 60 * 24 * 5 * 1000;

function configSnapshot() {
  return {
    hasProjectId: Boolean(process.env.FIREBASE_PROJECT_ID?.trim()),
    hasClientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL?.trim()),
    hasPrivateKey: Boolean(process.env.FIREBASE_PRIVATE_KEY?.trim()),
    hasPrivateKeyBase64: Boolean(process.env.FIREBASE_PRIVATE_KEY_BASE64?.trim()),
    adminConfigured: isAdminConfigured(),
  };
}

export async function POST(request: Request) {
  try {
    const { idToken } = (await request.json()) as { idToken?: string };
    if (!idToken) {
      return NextResponse.json(
        {
          title: "Jeton manquant",
          error: "Aucun idToken reçu depuis Firebase Auth.",
          action: "Reconnectez-vous. Si le problème continue, le login Firebase a échoué avant la session.",
          config: configSnapshot(),
        },
        { status: 400 },
      );
    }

    if (!isAdminConfigured()) {
      const explained = explainFirebaseAdminError(new Error("Firebase Admin non configuré"));
      return NextResponse.json(
        {
          title: explained.title,
          error: explained.detail,
          action: explained.action,
          code: explained.code,
          config: configSnapshot(),
          health: "/api/health",
        },
        { status: 503 },
      );
    }

    const session = await getAdminAuth().createSessionCookie(idToken, { expiresIn });
    const response = NextResponse.json({ ok: true });
    response.cookies.set("projecthub_session", session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: expiresIn / 1000,
      path: "/",
    });
    return response;
  } catch (error) {
    console.error("[api/session]", error);
    const explained = explainFirebaseAdminError(error);
    return NextResponse.json(
      {
        title: explained.title,
        error: explained.detail,
        action: explained.action,
        code: explained.code,
        config: configSnapshot(),
        health: "/api/health",
      },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("projecthub_session");
  return response;
}
