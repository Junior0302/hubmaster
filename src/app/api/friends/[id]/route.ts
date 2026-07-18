import { NextResponse } from "next/server";
import { getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "Backend non configuré" }, { status: 503 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as { action?: string };
  const action = String(body.action ?? "");
  if (!["accept", "decline", "cancel"].includes(action)) {
    return NextResponse.json({ error: "Action invalide" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection("friendships").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  }

  const data = snap.data()!;
  const requesterId = String(data.requesterId ?? "");
  const addresseeId = String(data.addresseeId ?? "");

  if (action === "accept" || action === "decline") {
    if (addresseeId !== session.uid) {
      return NextResponse.json({ error: "Seule la personne invitée peut répondre." }, { status: 403 });
    }
    if (data.status !== "pending") {
      return NextResponse.json({ error: "Cette demande n’est plus en attente." }, { status: 400 });
    }
    await ref.set(
      {
        status: action === "accept" ? "accepted" : "declined",
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    return NextResponse.json({ ok: true });
  }

  // cancel pending request by requester
  if (requesterId !== session.uid) {
    return NextResponse.json({ error: "Vous ne pouvez pas annuler cette demande." }, { status: 403 });
  }
  if (data.status !== "pending") {
    return NextResponse.json({ error: "Rien à annuler." }, { status: 400 });
  }
  await ref.delete();
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "Backend non configuré" }, { status: 503 });
  }

  const { id } = await context.params;
  const db = getAdminDb();
  const ref = db.collection("friendships").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Relation introuvable" }, { status: 404 });
  }

  const data = snap.data()!;
  if (data.requesterId !== session.uid && data.addresseeId !== session.uid) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  await ref.delete();
  return NextResponse.json({ ok: true });
}
