import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { isAdminConfigured } = await import("@/lib/firebase-admin");
    const { isSupabaseConfigured } = await import("@/lib/supabase-storage");

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
          privateKey.includes("BEGIN PRIVATE KEY") || privateKeyB64.length > 100,
      },
      supabase: {
        configured: isSupabaseConfigured,
        url: Boolean(process.env.SUPABASE_URL),
        serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        bucket: process.env.SUPABASE_BUCKET ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "health_failed",
        firebase: {
          publicApiKey: Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
          adminConfigured: false,
          projectId: Boolean(process.env.FIREBASE_PROJECT_ID),
          clientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
          privateKey: Boolean(process.env.FIREBASE_PRIVATE_KEY),
          privateKeyBase64: Boolean(process.env.FIREBASE_PRIVATE_KEY_BASE64),
        },
      },
      { status: 200 },
    );
  }
}
