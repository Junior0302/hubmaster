import { NextResponse } from "next/server";
import { getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";
import { isUserVisibleTo } from "@/lib/permissions";
import { getSessionUser } from "@/lib/server-auth";
import { pairKey } from "@/lib/social";
import { getUserProfile } from "@/lib/users";
import { toIso } from "@/lib/dates";
import type { Conversation } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function areFriends(db: FirebaseFirestore.Firestore, a: string, b: string): Promise<boolean> {
  const key = pairKey(a, b);
  const snap = await db.collection("friendships").where("pairKey", "==", key).limit(1).get();
  if (snap.empty) return false;
  return snap.docs[0]!.data().status === "accepted";
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!isAdminConfigured()) return NextResponse.json([]);

  const db = getAdminDb();
  const snapshot = await db
    .collection("conversations")
    .where("participantIds", "array-contains", session.uid)
    .get();

  const conversations: Conversation[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const participantIds = Array.isArray(data.participantIds)
      ? data.participantIds.map(String)
      : [];
    const otherId = participantIds.find((id) => id !== session.uid);
    if (!otherId) continue;
    const otherUser = await getUserProfile(otherId);
    if (!otherUser) continue;
    if (!isUserVisibleTo({ uid: session.uid, role: session.role }, otherUser)) continue;

    const lastReadAt = (data.lastReadAt ?? {}) as Record<string, string>;
    const myRead = lastReadAt[session.uid] ? new Date(lastReadAt[session.uid]!).getTime() : 0;
    const updatedAt = toIso(data.updatedAt);
    const unread =
      data.lastSenderId && data.lastSenderId !== session.uid && new Date(updatedAt).getTime() > myRead
        ? 1
        : 0;

    conversations.push({
      id: doc.id,
      pairKey: String(data.pairKey ?? ""),
      participantIds,
      updatedAt,
      lastMessage: data.lastMessage ? String(data.lastMessage) : undefined,
      lastSenderId: data.lastSenderId ? String(data.lastSenderId) : undefined,
      lastReadAt,
      otherUser,
      unreadCount: unread,
    });
  }

  conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return NextResponse.json(conversations);
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "Backend non configuré" }, { status: 503 });
  }

  const body = (await request.json()) as { userId?: string };
  const otherId = String(body.userId ?? "").trim();
  if (!otherId || otherId === session.uid) {
    return NextResponse.json({ error: "Destinataire invalide" }, { status: 400 });
  }

  const other = await getUserProfile(otherId);
  if (!other || !isUserVisibleTo({ uid: session.uid, role: session.role }, other)) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }

  const db = getAdminDb();
  if (!(await areFriends(db, session.uid, otherId))) {
    return NextResponse.json(
      { error: "Vous devez être amis pour discuter." },
      { status: 403 },
    );
  }

  const key = pairKey(session.uid, otherId);
  const existing = await db.collection("conversations").where("pairKey", "==", key).limit(1).get();
  if (!existing.empty) {
    const doc = existing.docs[0]!;
    return NextResponse.json({ id: doc.id });
  }

  const now = new Date().toISOString();
  const ref = await db.collection("conversations").add({
    pairKey: key,
    participantIds: [session.uid, otherId],
    updatedAt: now,
    lastReadAt: { [session.uid]: now },
  });

  return NextResponse.json({ id: ref.id }, { status: 201 });
}
