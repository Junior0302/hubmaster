import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getSessionUser } from "@/lib/server-auth";
import { getUserProfile } from "@/lib/users";
import { getAdminAuth, getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";
import { demoUsers } from "@/lib/demo-data";
import { isSupabaseConfigured, uploadAvatar } from "@/lib/supabase-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const profile = await getUserProfile(session.uid);
  if (!profile) return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
  return NextResponse.json(profile);
}

export async function PATCH(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const contentType = request.headers.get("content-type") || "";
  let firstname = "";
  let lastname = "";
  let avatarFile: File | null = null;
  let removeAvatar = false;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    firstname = String(form.get("firstname") ?? "").trim();
    lastname = String(form.get("lastname") ?? "").trim();
    removeAvatar = String(form.get("removeAvatar") ?? "") === "1";
    const maybe = form.get("avatar");
    if (maybe instanceof File && maybe.size > 0) avatarFile = maybe;
  } else {
    const body = (await request.json()) as {
      firstname?: string;
      lastname?: string;
      removeAvatar?: boolean;
    };
    firstname = String(body.firstname ?? "").trim();
    lastname = String(body.lastname ?? "").trim();
    removeAvatar = Boolean(body.removeAvatar);
  }

  if (!firstname || !lastname) {
    return NextResponse.json({ error: "Prénom et nom requis" }, { status: 400 });
  }

  if (!isAdminConfigured()) {
    const profile = demoUsers[0];
    return NextResponse.json({
      ...profile,
      firstname,
      lastname,
      avatar: removeAvatar ? undefined : profile?.avatar,
    });
  }

  if (avatarFile) {
    if (!isSupabaseConfigured) {
      return NextResponse.json(
        { error: "Upload photo indisponible : Supabase non configuré." },
        { status: 503 },
      );
    }
    try {
      const uploaded = await uploadAvatar(session.uid, avatarFile);
      await getAdminAuth().updateUser(session.uid, { photoURL: uploaded.url }).catch(() => undefined);
      await getAdminDb().collection("users").doc(session.uid).set(
        { firstname, lastname, avatar: uploaded.url },
        { merge: true },
      );
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Échec de l’upload photo" },
        { status: 400 },
      );
    }
  } else if (removeAvatar) {
    await getAdminAuth().updateUser(session.uid, { photoURL: null }).catch(() => undefined);
    await getAdminDb().collection("users").doc(session.uid).set(
      { firstname, lastname, avatar: FieldValue.delete() },
      { merge: true },
    );
  } else {
    await getAdminDb().collection("users").doc(session.uid).set(
      { firstname, lastname },
      { merge: true },
    );
  }

  const profile = await getUserProfile(session.uid);
  return NextResponse.json(profile);
}
