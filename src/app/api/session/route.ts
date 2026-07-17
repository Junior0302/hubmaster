import { NextResponse } from "next/server";
import { getAdminAuth, isAdminConfigured } from "@/lib/firebase-admin";

const expiresIn = 60 * 60 * 24 * 5 * 1000;

export async function POST(request: Request) {
  const { idToken } = (await request.json()) as { idToken?: string };
  if (!idToken) return NextResponse.json({ error: "Jeton manquant" }, { status: 400 });

  try {
    if (!isAdminConfigured()) {
      return NextResponse.json(
        {
          error:
            "Firebase Admin non configuré sur Vercel. Ajoutez FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL et FIREBASE_PRIVATE_KEY.",
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
        error: message.includes("private key") || message.includes("DECODER")
          ? "FIREBASE_PRIVATE_KEY invalide. Sur Vercel, collez la clé avec les \\n (une seule ligne)."
          : "Authentification refusée. Vérifiez les variables Firebase Admin et le domaine autorisé.",
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
