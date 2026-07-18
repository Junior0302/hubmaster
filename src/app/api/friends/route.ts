import { NextResponse } from "next/server";
import { getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";
import { isUserVisibleTo } from "@/lib/permissions";
import { getSessionUser } from "@/lib/server-auth";
import { pairKey } from "@/lib/social";
import { getUserProfile } from "@/lib/users";
import { toIso } from "@/lib/dates";
import type { Friendship, FriendshipStatus } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapFriendship(
  id: string,
  data: FirebaseFirestore.DocumentData,
): Friendship {
  return {
    id,
    pairKey: String(data.pairKey ?? ""),
    requesterId: String(data.requesterId ?? ""),
    addresseeId: String(data.addresseeId ?? ""),
    status: (data.status as FriendshipStatus) ?? "pending",
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!isAdminConfigured()) {
    return NextResponse.json({ friendships: [], pendingIncoming: [], pendingOutgoing: [] });
  }

  const db = getAdminDb();
  const snapshot = await db.collection("friendships").get();
  const mine = snapshot.docs
    .map((doc) => mapFriendship(doc.id, doc.data()))
    .filter(
      (f) => f.requesterId === session.uid || f.addresseeId === session.uid,
    );

  const enriched = await Promise.all(
    mine.map(async (f) => {
      const otherId = f.requesterId === session.uid ? f.addresseeId : f.requesterId;
      const otherUser = await getUserProfile(otherId);
      return { ...f, otherUser: otherUser ?? undefined };
    }),
  );

  // Drop friendships with invisible admins for non-admins
  const visible = enriched.filter((f) => {
    if (!f.otherUser) return false;
    return isUserVisibleTo(
      { uid: session.uid, role: session.role },
      f.otherUser,
    );
  });

  return NextResponse.json({
    friendships: visible.filter((f) => f.status === "accepted"),
    pendingIncoming: visible.filter(
      (f) => f.status === "pending" && f.addresseeId === session.uid,
    ),
    pendingOutgoing: visible.filter(
      (f) => f.status === "pending" && f.requesterId === session.uid,
    ),
  });
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "Backend non configuré" }, { status: 503 });
  }

  const body = (await request.json()) as { userId?: string };
  const targetId = String(body.userId ?? "").trim();
  if (!targetId || targetId === session.uid) {
    return NextResponse.json({ error: "Destinataire invalide" }, { status: 400 });
  }

  const target = await getUserProfile(targetId);
  if (!target) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }
  if (!isUserVisibleTo({ uid: session.uid, role: session.role }, target)) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }

  const key = pairKey(session.uid, targetId);
  const db = getAdminDb();
  const existing = await db.collection("friendships").where("pairKey", "==", key).limit(1).get();
  if (!existing.empty) {
    const doc = existing.docs[0]!;
    const data = doc.data();
    if (data.status === "accepted") {
      return NextResponse.json({ error: "Vous êtes déjà amis." }, { status: 409 });
    }
    if (data.status === "pending") {
      return NextResponse.json({ error: "Une demande est déjà en cours." }, { status: 409 });
    }
    // declined → reopen as new request from current user
    await doc.ref.set(
      {
        requesterId: session.uid,
        addresseeId: targetId,
        status: "pending",
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    return NextResponse.json({ ok: true, id: doc.id }, { status: 200 });
  }

  const now = new Date().toISOString();
  const ref = await db.collection("friendships").add({
    pairKey: key,
    requesterId: session.uid,
    addresseeId: targetId,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ ok: true, id: ref.id }, { status: 201 });
}
