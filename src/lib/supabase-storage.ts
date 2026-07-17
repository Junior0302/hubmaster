import { createClient } from "@supabase/supabase-js";

export const isSupabaseConfigured = Boolean(
  process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.SUPABASE_BUCKET,
);

function getSupabaseAdmin() {
  if (!isSupabaseConfigured) throw new Error("Supabase non configuré");
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function uploadProjectFile(
  projectId: string,
  file: File,
): Promise<{ url: string; filename: string }> {
  const supabase = getSupabaseAdmin();
  const bucket = process.env.SUPABASE_BUCKET!;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-") || "fichier";
  const storagePath = `projects/${projectId}/${crypto.randomUUID()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) {
    throw new Error(error.message || "Échec de l’upload Supabase");
  }

  return resolveStorageUrl(supabase, bucket, storagePath, safeName);
}

export async function uploadAvatar(
  uid: string,
  file: File,
): Promise<{ url: string; filename: string }> {
  const allowed = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
  if (!allowed.has(file.type)) {
    throw new Error("Formats acceptés : JPG, PNG ou WebP");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("La photo ne doit pas dépasser 2 Mo");
  }

  const supabase = getSupabaseAdmin();
  const bucket = process.env.SUPABASE_BUCKET!;
  const ext =
    file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const storagePath = `avatars/${uid}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw error;

  return resolveStorageUrl(supabase, bucket, storagePath, `avatar.${ext}`);
}

async function resolveStorageUrl(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  bucket: string,
  storagePath: string,
  safeName: string,
): Promise<{ url: string; filename: string }> {
  if (process.env.SUPABASE_STORAGE_PUBLIC === "true") {
    const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
    return { url: data.publicUrl, filename: storagePath.split("/").pop() ?? safeName };
  }

  const { data, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
  if (signError) throw signError;
  return { url: data.signedUrl, filename: storagePath.split("/").pop() ?? safeName };
}
