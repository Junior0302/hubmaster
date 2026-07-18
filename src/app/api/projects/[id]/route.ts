import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";
import {
  canAccessProject,
  canManageProjects,
} from "@/lib/permissions";
import { getSessionUser } from "@/lib/server-auth";
import { resolveCreatorName } from "@/lib/users";
import {
  deleteStoredFile,
  inferStoragePath,
  isSupabaseConfigured,
} from "@/lib/supabase-storage";
import { toIso } from "@/lib/dates";
import type { Project, ProjectFile, ProjectStatus } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "Backend non configuré" }, { status: 503 });
  }

  const { id } = await context.params;
  const db = getAdminDb();
  const snap = await db.collection("projects").doc(id).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
  }

  const data = snap.data()!;
  if (!canAccessProject({ uid: user.uid, role: user.role }, data)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const filesSnapshot = await db.collection("files").where("projectId", "==", id).get();
  const files = filesSnapshot.docs.map((file) => {
    const fileData = file.data();
    return {
      id: file.id,
      ...fileData,
      createdAt: toIso(fileData.createdAt),
      url: `/api/projects/${id}/files/${file.id}`,
    } as ProjectFile;
  });

  const project: Project = {
    id: snap.id,
    title: String(data.title ?? ""),
    description: String(data.description ?? ""),
    category: data.category ? String(data.category) : undefined,
    client: data.client ? String(data.client) : undefined,
    createdBy: String(data.createdBy ?? ""),
    creatorName: await resolveCreatorName(String(data.createdBy ?? ""), data.creatorName),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    status: (data.status as ProjectStatus) ?? "active",
    memberIds: Array.isArray(data.memberIds) ? data.memberIds.map(String) : [],
    files,
  };
  return NextResponse.json(project);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManageProjects({ uid: user.uid, role: user.role })) {
    return NextResponse.json({ error: "Droits insuffisants" }, { status: 403 });
  }
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "Backend non configuré" }, { status: 503 });
  }

  const { id } = await context.params;
  const db = getAdminDb();
  const ref = db.collection("projects").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
  }

  const body = (await request.json()) as {
    title?: string;
    description?: string;
    category?: string;
    client?: string;
    status?: ProjectStatus;
    memberIds?: string[];
  };

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (typeof body.title === "string" && body.title.trim().length >= 2) {
    updates.title = body.title.trim();
  }
  if (typeof body.description === "string") {
    updates.description = body.description.trim().slice(0, 500);
  }
  if (typeof body.category === "string") {
    updates.category = body.category.trim();
  }
  if (typeof body.client === "string") {
    updates.client = body.client.trim();
  }
  if (body.status && ["active", "archived", "draft"].includes(body.status)) {
    updates.status = body.status;
  }
  if (Array.isArray(body.memberIds)) {
    const unique = [...new Set(body.memberIds.map(String).filter(Boolean))];
    if (!unique.includes(String(snap.data()?.createdBy ?? user.uid))) {
      unique.push(String(snap.data()?.createdBy ?? user.uid));
    }
    updates.memberIds = unique;
  }

  await ref.set(updates, { merge: true });
  return GET(request, context);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManageProjects({ uid: user.uid, role: user.role })) {
    return NextResponse.json({ error: "Droits insuffisants" }, { status: 403 });
  }
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "Backend non configuré" }, { status: 503 });
  }

  const { id } = await context.params;
  const db = getAdminDb();
  const ref = db.collection("projects").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
  }

  const filesSnapshot = await db.collection("files").where("projectId", "==", id).get();
  for (const fileDoc of filesSnapshot.docs) {
    const fileData = fileDoc.data();
    const path = inferStoragePath({
      storagePath: typeof fileData.storagePath === "string" ? fileData.storagePath : undefined,
      filename: typeof fileData.filename === "string" ? fileData.filename : undefined,
      url: typeof fileData.url === "string" ? fileData.url : undefined,
      projectId: id,
    });
    if (isSupabaseConfigured && path) {
      await deleteStoredFile(path);
    }
    await fileDoc.ref.delete();
  }

  await ref.delete();
  return NextResponse.json({ ok: true });
}
