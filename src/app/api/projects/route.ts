import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";
import { isSupabaseConfigured, uploadProjectFile } from "@/lib/supabase-storage";
import { demoProjects } from "@/lib/demo-data";
import { getSessionUser } from "@/lib/server-auth";
import { getUserProfile, resolveCreatorName } from "@/lib/users";
import { toIso } from "@/lib/dates";
import type { Project, ProjectFile } from "@/types";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!isAdminConfigured()) return NextResponse.json(demoProjects);

  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection("projects");
  if (user.role === "user") query = query.where("memberIds", "array-contains", user.uid);
  const snapshot = await query.orderBy("updatedAt", "desc").get();
  const projects = await Promise.all(
    snapshot.docs.map(async (document) => {
      const data = document.data();
      const filesSnapshot = await db.collection("files").where("projectId", "==", document.id).get();
      const files = filesSnapshot.docs.map((file) => {
        const fileData = file.data();
        return { id: file.id, ...fileData, createdAt: toIso(fileData.createdAt) } as ProjectFile;
      });
      return {
        id: document.id,
        ...data,
        creatorName: await resolveCreatorName(data.createdBy, data.creatorName),
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
        files,
      } as Project;
    }),
  );
  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role === "user") return NextResponse.json({ error: "Droits insuffisants" }, { status: 403 });

  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim();
  if (title.length < 2) return NextResponse.json({ error: "Nom invalide" }, { status: 400 });
  const uploads = form.getAll("files").filter((item): item is File => item instanceof File);
  const id =
    title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") + `-${Date.now().toString(36)}`;

  const profile = await getUserProfile(user.uid);
  const creatorName = profile ? `${profile.firstname} ${profile.lastname}`.trim() : "Utilisateur";

  if (!isAdminConfigured()) {
    const now = new Date().toISOString();
    const project: Project = {
      id,
      title,
      description: String(form.get("description") ?? ""),
      category: String(form.get("category") ?? ""),
      client: String(form.get("client") ?? ""),
      createdBy: user.uid,
      creatorName,
      createdAt: now,
      updatedAt: now,
      status: "active",
      memberIds: [user.uid],
      files: uploads.map((file, index) => ({
        id: `demo-${index}`,
        projectId: id,
        filename: file.name,
        originalName: file.name,
        extension: file.name.split(".").pop() ?? "",
        size: file.size,
        url: "#",
        uploadedBy: user.uid,
        createdAt: now,
      })),
    };
    return NextResponse.json(project, { status: 201 });
  }

  const db = getAdminDb();
  const projectRef = db.collection("projects").doc(id);
  await projectRef.set({
    title,
    description: String(form.get("description") ?? ""),
    category: String(form.get("category") ?? ""),
    client: String(form.get("client") ?? ""),
    createdBy: user.uid,
    creatorName,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    status: "active",
    memberIds: [user.uid],
  });

  if (uploads.length > 0 && !isSupabaseConfigured) {
    return NextResponse.json(
      { error: "Stockage Supabase non configuré. Ajoutez SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et SUPABASE_BUCKET." },
      { status: 503 },
    );
  }

  const files: ProjectFile[] = [];
  for (const upload of uploads) {
    const { url, filename } = await uploadProjectFile(id, upload);
    const fileRef = await db.collection("files").add({
      projectId: id,
      filename,
      originalName: upload.name,
      extension: upload.name.split(".").pop()?.toLowerCase() ?? "",
      size: upload.size,
      url,
      uploadedBy: user.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    files.push({
      id: fileRef.id,
      projectId: id,
      filename,
      originalName: upload.name,
      extension: upload.name.split(".").pop()?.toLowerCase() ?? "",
      size: upload.size,
      url,
      uploadedBy: user.uid,
      createdAt: new Date().toISOString(),
    });
  }

  const created = await projectRef.get();
  const data = created.data()!;
  const project: Project = {
    id,
    title: data.title,
    description: data.description,
    category: data.category,
    client: data.client,
    createdBy: data.createdBy,
    creatorName,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    status: data.status,
    memberIds: data.memberIds,
    files,
  };
  return NextResponse.json(project, { status: 201 });
}
