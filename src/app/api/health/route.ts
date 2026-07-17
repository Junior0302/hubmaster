import { NextResponse } from "next/server";
import { isAdminConfigured } from "@/lib/firebase-admin";
import { isSupabaseConfigured } from "@/lib/supabase-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY ?? "";
  const privateKeyB64 = process.env.FIREBASE_PRIVATE_KEY_BASE64 ?? "";

  return NextResponse.json({
    ok: true,
    firebase: {
      publicApiKey: Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
      publicProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null,
      adminConfigured: isAdminConfigured(),
      projectId: Boolean(process.env.FIREBASE_PROJECT_ID),
      clientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
      privateKey: Boolean(privateKey),
      privateKeyBase64: Boolean(privateKeyB64),
      privateKeyLooksValid:
        privateKey.includes("BEGIN PRIVATE KEY") ||
        privateKeyB64.length > 100,
    },
    supabase: {
      configured: isSupabaseConfigured,
      url: Boolean(process.env.SUPABASE_URL),
      serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      bucket: process.env.SUPABASE_BUCKET ?? null,
    },
  });
}
