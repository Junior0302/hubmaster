import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";
import { getUserProfile } from "@/lib/users";
import { isSupabaseConfigured, uploadAvatar } from "@/lib/supabase-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: "Inscription indisponible : Firebase Admin non configuré." },
      { status: 503 },
    );
  }

  const form = await request.formData();
  const firstname = String(form.get("firstname") ?? "").trim();
  const lastname = String(form.get("lastname") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const avatarFile = form.get("avatar");

  if (!firstname || !lastname || !email || password.length < 6) {
    return NextResponse.json(
      { error: "Prénom, nom, email et mot de passe (6 caractères min.) sont requis." },
      { status: 400 },
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 });
  }

  try {
    const authUser = await getAdminAuth().createUser({
      email,
      password,
      displayName: `${firstname} ${lastname}`,
    });

    let avatar: string | undefined;
    if (avatarFile instanceof File && avatarFile.size > 0) {
      if (!isSupabaseConfigured) {
        await getAdminAuth().deleteUser(authUser.uid).catch(() => undefined);
        return NextResponse.json(
          { error: "Upload photo indisponible : Supabase non configuré." },
          { status: 503 },
        );
      }
      try {
        const uploaded = await uploadAvatar(authUser.uid, avatarFile);
        avatar = uploaded.url;
        await getAdminAuth().updateUser(authUser.uid, { photoURL: avatar });
      } catch (error) {
        await getAdminAuth().deleteUser(authUser.uid).catch(() => undefined);
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Échec de l’upload photo" },
          { status: 400 },
        );
      }
    }

    await getAdminDb()
      .collection("users")
      .doc(authUser.uid)
      .set({
        firstname,
        lastname,
        email,
        role: "user",
        ...(avatar ? { avatar } : {}),
        createdAt: new Date().toISOString(),
      });

    const profile = await getUserProfile(authUser.uid);
    return NextResponse.json({ ok: true, user: profile }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inscription impossible";
    const lower = message.toLowerCase();
    if (lower.includes("email already") || lower.includes("already exists")) {
      return NextResponse.json({ error: "Un compte existe déjà avec cet email." }, { status: 409 });
    }
    console.error("[api/register]", error);
    return NextResponse.json({ error: "Inscription impossible. Réessayez." }, { status: 500 });
  }
}
