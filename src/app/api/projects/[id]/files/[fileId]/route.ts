import { NextResponse } from "next/server";
import { getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/server-auth";
import {
  getFileAccessUrl,
  inferStoragePath,
  isSupabaseConfigured,
} from "@/lib/supabase-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; fileId: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorisé. Reconnectez-vous." }, { status: 401 });
  }
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "Backend non configuré." }, { status: 503 });
  }

  const { id: projectId, fileId } = await context.params;
  const db = getAdminDb();

  const projectSnap = await db.collection("projects").doc(projectId).get();
  if (!projectSnap.exists) {
    return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  }

  const project = projectSnap.data()!;
  if (
    user.role === "user" &&
    !(Array.isArray(project.memberIds) && project.memberIds.includes(user.uid))
  ) {
    return NextResponse.json({ error: "Accès refusé à ce projet." }, { status: 403 });
  }

  const fileSnap = await db.collection("files").doc(fileId).get();
  if (!fileSnap.exists) {
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }

  const file = fileSnap.data()!;
  if (file.projectId !== projectId) {
    return NextResponse.json({ error: "Ce fichier n’appartient pas à ce projet." }, { status: 404 });
  }

  const storedUrl = typeof file.url === "string" ? file.url : "";
  const path = inferStoragePath({
    storagePath: typeof file.storagePath === "string" ? file.storagePath : undefined,
    filename: typeof file.filename === "string" ? file.filename : undefined,
    url: storedUrl,
    projectId,
  });

  if (isSupabaseConfigured && path) {
    try {
      const freshUrl = await getFileAccessUrl(path);
      return NextResponse.redirect(freshUrl, 302);
    } catch {
      // fall through to stored URL
    }
  }

  if (storedUrl && storedUrl !== "#") {
    return NextResponse.redirect(storedUrl, 302);
  }

  return NextResponse.json(
    {
      error:
        "Lien du fichier indisponible. Réimportez le fichier ou vérifiez la config Supabase.",
    },
    { status: 404 },
  );
}
