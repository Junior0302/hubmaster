import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";
import { canManageUsers } from "@/lib/permissions";
import { getSessionUser } from "@/lib/server-auth";
import { getUserProfile } from "@/lib/users";
import type { Role } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session || !canManageUsers({ uid: session.uid, role: session.role })) {
    return NextResponse.json({ error: "Droits insuffisants" }, { status: 403 });
  }
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "Backend non configuré" }, { status: 503 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as { role?: Role };
  const role = body.role;
  if (!role || !["admin", "manager", "user"].includes(role)) {
    return NextResponse.json({ error: "Rôle invalide" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection("users").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }

  const currentRole = (snap.data()?.role as Role) ?? "user";
  if (currentRole === "admin" && role !== "admin") {
    const admins = await db.collection("users").where("role", "==", "admin").get();
    if (admins.size <= 1) {
      return NextResponse.json(
        { error: "Impossible de rétrograder le dernier administrateur." },
        { status: 400 },
      );
    }
  }

  await ref.set({ role, updatedAt: new Date().toISOString() }, { merge: true });
  const profile = await getUserProfile(id);
  return NextResponse.json(profile);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session || !canManageUsers({ uid: session.uid, role: session.role })) {
    return NextResponse.json({ error: "Droits insuffisants" }, { status: 403 });
  }
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "Backend non configuré" }, { status: 503 });
  }

  const { id } = await context.params;
  if (id === session.uid) {
    return NextResponse.json({ error: "Vous ne pouvez pas supprimer votre propre compte." }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection("users").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }

  const role = (snap.data()?.role as Role) ?? "user";
  if (role === "admin") {
    const admins = await db.collection("users").where("role", "==", "admin").get();
    if (admins.size <= 1) {
      return NextResponse.json(
        { error: "Impossible de supprimer le dernier administrateur." },
        { status: 400 },
      );
    }
  }

  // Clean friendships involving this user
  const friendships = await db.collection("friendships").get();
  const batch = db.batch();
  friendships.docs.forEach((doc) => {
    const data = doc.data();
    if (data.requesterId === id || data.addresseeId === id) {
      batch.delete(doc.ref);
    }
  });
  batch.delete(ref);
  await batch.commit();

  await getAdminAuth().deleteUser(id).catch((error) => {
    console.warn("[api/users DELETE] auth", error);
  });

  return NextResponse.json({ ok: true });
}
