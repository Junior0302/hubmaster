import { NextResponse } from "next/server";
import { getAdminAuth, isAdminConfigured } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const expiresIn = 60 * 60 * 24 * 5 * 1000;

export async function POST(request: Request) {
  try {
    const { idToken } = (await request.json()) as { idToken?: string };
    if (!idToken) {
      return NextResponse.json({ error: "Jeton manquant" }, { status: 400 });
    }

    if (!isAdminConfigured()) {
      return NextResponse.json(
        {
          error:
            "Firebase Admin non configuré. Sur Vercel, ajoutez FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL et FIREBASE_PRIVATE_KEY_BASE64.",
          hint: "Ouvrez /api/health pour vérifier les variables.",
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
    const message = error instanceof Error ? error.message : "Authentification refusée";
    return NextResponse.json(
      {
        error: message,
        hint: "Vérifiez FIREBASE_PRIVATE_KEY_BASE64 et que le domaine Vercel est autorisé dans Firebase Auth.",
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
