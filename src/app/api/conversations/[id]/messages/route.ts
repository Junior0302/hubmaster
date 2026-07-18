import { NextResponse } from "next/server";
import { getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/server-auth";
import { toIso } from "@/lib/dates";
import type { ChatMessage } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getConversationOrFail(
  db: FirebaseFirestore.Firestore,
  conversationId: string,
  uid: string,
) {
  const snap = await db.collection("conversations").doc(conversationId).get();
  if (!snap.exists) return { error: NextResponse.json({ error: "Conversation introuvable" }, { status: 404 }) };
  const data = snap.data()!;
  const participantIds = Array.isArray(data.participantIds) ? data.participantIds.map(String) : [];
  if (!participantIds.includes(uid)) {
    return { error: NextResponse.json({ error: "Accès refusé" }, { status: 403 }) };
  }
  return { snap, data, participantIds };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!isAdminConfigured()) return NextResponse.json([]);

  const { id } = await context.params;
  const db = getAdminDb();
  const result = await getConversationOrFail(db, id, session.uid);
  if ("error" in result && result.error) return result.error;

  const messagesSnap = await db
    .collection("conversations")
    .doc(id)
    .collection("messages")
    .orderBy("createdAt", "asc")
    .limit(200)
    .get();

  const messages: ChatMessage[] = messagesSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      conversationId: id,
      senderId: String(data.senderId ?? ""),
      text: String(data.text ?? ""),
      createdAt: toIso(data.createdAt),
    };
  });

  // Mark as read
  const now = new Date().toISOString();
  await db
    .collection("conversations")
    .doc(id)
    .set({ lastReadAt: { [session.uid]: now } }, { merge: true });

  return NextResponse.json(messages);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "Backend non configuré" }, { status: 503 });
  }

  const { id } = await context.params;
  const db = getAdminDb();
  const result = await getConversationOrFail(db, id, session.uid);
  if ("error" in result && result.error) return result.error;

  const body = (await request.json()) as { text?: string };
  const text = String(body.text ?? "").trim();
  if (!text || text.length > 2000) {
    return NextResponse.json({ error: "Message invalide (1–2000 caractères)." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const ref = await db.collection("conversations").doc(id).collection("messages").add({
    senderId: session.uid,
    text,
    createdAt: now,
  });

  await db.collection("conversations").doc(id).set(
    {
      lastMessage: text.slice(0, 200),
      lastSenderId: session.uid,
      updatedAt: now,
      lastReadAt: { [session.uid]: now },
    },
    { merge: true },
  );

  const message: ChatMessage = {
    id: ref.id,
    conversationId: id,
    senderId: session.uid,
    text,
    createdAt: now,
  };
  return NextResponse.json(message, { status: 201 });
}
