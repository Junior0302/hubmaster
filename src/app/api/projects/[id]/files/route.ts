import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";
import { isSupabaseConfigured, uploadProjectFile } from "@/lib/supabase-storage";
import { getSessionUser } from "@/lib/server-auth";
import { toIso } from "@/lib/dates";
import type { ProjectFile } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 40;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorisé. Reconnectez-vous." }, { status: 401 });
  }
  if (user.role === "user") {
    return NextResponse.json(
      { error: "Droits insuffisants. Seuls les managers et admins peuvent importer des fichiers." },
      { status: 403 },
    );
  }

  const { id: projectId } = await context.params;
  if (!projectId) {
    return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
  }

  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: "Import indisponible : Firebase Admin non configuré." },
      { status: 503 },
    );
  }
  if (!isSupabaseConfigured) {
    return NextResponse.json(
      {
        error:
          "Stockage non configuré. Ajoutez SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et SUPABASE_BUCKET sur Render.",
      },
      { status: 503 },
    );
  }

  const db = getAdminDb();
  const projectRef = db.collection("projects").doc(projectId);
  const projectSnap = await projectRef.get();
  if (!projectSnap.exists) {
    return NextResponse.json({ error: "Ce projet n’existe pas." }, { status: 404 });
  }

  const form = await request.formData();
  const uploads = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
  const folders = form.getAll("folders").map((item) => String(item ?? ""));

  if (uploads.length === 0) {
    return NextResponse.json({ error: "Aucun fichier sélectionné." }, { status: 400 });
  }
  if (uploads.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_FILES} fichiers par envoi.` },
      { status: 400 },
    );
  }

  const tooLarge = uploads.find((file) => file.size > MAX_FILE_BYTES);
  if (tooLarge) {
    return NextResponse.json(
      { error: `« ${tooLarge.name} » dépasse 50 Mo.` },
      { status: 400 },
    );
  }

  const files: ProjectFile[] = [];
  const errors: string[] = [];

  for (let index = 0; index < uploads.length; index += 1) {
    const upload = uploads[index]!;
    const relative = folders[index]?.trim() || "";
    const folder =
      relative.includes("/")
        ? relative.split("/").slice(0, -1).join("/")
        : relative || undefined;

    try {
      const { url, filename } = await uploadProjectFile(projectId, upload);
      const fileRef = await db.collection("files").add({
        projectId,
        filename,
        originalName: upload.name,
        extension: upload.name.split(".").pop()?.toLowerCase() ?? "",
        size: upload.size,
        url,
        uploadedBy: user.uid,
        ...(folder ? { folder } : {}),
        createdAt: FieldValue.serverTimestamp(),
      });
      files.push({
        id: fileRef.id,
        projectId,
        filename,
        originalName: upload.name,
        extension: upload.name.split(".").pop()?.toLowerCase() ?? "",
        size: upload.size,
        url,
        uploadedBy: user.uid,
        folder,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Échec upload";
      errors.push(`${upload.name} : ${message}`);
    }
  }

  await projectRef.set({ updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  if (files.length === 0) {
    return NextResponse.json(
      {
        error: errors[0] ?? "Aucun fichier n’a pu être importé.",
        details: errors,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    files,
    uploaded: files.length,
    failed: errors.length,
    details: errors,
    updatedAt: toIso(new Date()),
  });
}
