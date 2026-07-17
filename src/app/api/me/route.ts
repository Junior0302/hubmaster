import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server-auth";
import { getUserProfile } from "@/lib/users";
import { adminDb, isAdminConfigured } from "@/lib/firebase-admin";
import { demoUsers } from "@/lib/demo-data";

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

  const body = (await request.json()) as { firstname?: string; lastname?: string };
  const firstname = String(body.firstname ?? "").trim();
  const lastname = String(body.lastname ?? "").trim();
  if (!firstname || !lastname) {
    return NextResponse.json({ error: "Prénom et nom requis" }, { status: 400 });
  }

  if (!isAdminConfigured) {
    const profile = demoUsers[0];
    return NextResponse.json({ ...profile, firstname, lastname });
  }

  await adminDb.collection("users").doc(session.uid).set({ firstname, lastname }, { merge: true });
  const profile = await getUserProfile(session.uid);
  return NextResponse.json(profile);
}
