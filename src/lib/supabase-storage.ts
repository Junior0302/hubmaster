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

export type StoredFile = {
  url: string;
  filename: string;
  storagePath: string;
};

export async function uploadProjectFile(
  projectId: string,
  file: File,
): Promise<StoredFile> {
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
): Promise<StoredFile> {
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

/** Rebuild a usable URL for an already stored object. */
export async function getFileAccessUrl(storagePath: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const bucket = process.env.SUPABASE_BUCKET!;
  const { url } = await resolveStorageUrl(supabase, bucket, storagePath, storagePath.split("/").pop() ?? "file");
  return url;
}

export async function deleteStoredFile(storagePath: string): Promise<void> {
  if (!isSupabaseConfigured || !storagePath) return;
  const supabase = getSupabaseAdmin();
  const bucket = process.env.SUPABASE_BUCKET!;
  const { error } = await supabase.storage.from(bucket).remove([storagePath]);
  if (error) {
    console.warn("[supabase] deleteStoredFile", storagePath, error.message);
  }
}

/**
 * Try to recover the storage object path from a stored public/signed URL
 * or from a bare filename previously saved without storagePath.
 */
export function inferStoragePath(input: {
  storagePath?: string;
  filename?: string;
  url?: string;
  projectId?: string;
}): string | null {
  if (input.storagePath?.startsWith("projects/") || input.storagePath?.startsWith("avatars/")) {
    return input.storagePath;
  }

  const url = input.url ?? "";
  if (url && url !== "#") {
    try {
      const parsed = new URL(url);
      const marker = `/object/`;
      const idx = parsed.pathname.indexOf(marker);
      if (idx >= 0) {
        // /storage/v1/object/public/<bucket>/<path> or /sign/<bucket>/<path>
        const after = parsed.pathname.slice(idx + marker.length);
        const parts = after.split("/").filter(Boolean);
        // public|sign, bucket, ...path
        if (parts.length >= 3) {
          return parts.slice(2).map(decodeURIComponent).join("/");
        }
      }
    } catch {
      // ignore invalid URL
    }
  }

  if (input.projectId && input.filename && !input.filename.includes("/")) {
    // Legacy records only stored the basename under projects/<id>/
    return `projects/${input.projectId}/${input.filename}`;
  }

  if (input.filename?.includes("/")) {
    return input.filename;
  }

  return null;
}

async function resolveStorageUrl(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  bucket: string,
  storagePath: string,
  safeName: string,
): Promise<StoredFile> {
  const filename = storagePath.split("/").pop() ?? safeName;

  if (process.env.SUPABASE_STORAGE_PUBLIC === "true") {
    const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
    return { url: data.publicUrl, filename, storagePath };
  }

  const { data, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
  if (signError) throw signError;
  return { url: data.signedUrl, filename, storagePath };
}
