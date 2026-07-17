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
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const storagePath = `projects/${projectId}/${crypto.randomUUID()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw error;

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
