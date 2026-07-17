import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function normalizePrivateKey(raw: string): string {
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  // Vercel parfois double-échappe
  value = value.replace(/\\\\n/g, "\n").replace(/\\n/g, "\n");
  return value;
}

function resolvePrivateKey(): string | undefined {
  const b64 = process.env.FIREBASE_PRIVATE_KEY_BASE64?.trim();
  if (b64) {
    return Buffer.from(b64, "base64").toString("utf8");
  }
  const raw = process.env.FIREBASE_PRIVATE_KEY;
  return raw ? normalizePrivateKey(raw) : undefined;
}

export function isAdminConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID?.trim() &&
      process.env.FIREBASE_CLIENT_EMAIL?.trim() &&
      (process.env.FIREBASE_PRIVATE_KEY?.trim() || process.env.FIREBASE_PRIVATE_KEY_BASE64?.trim()),
  );
}

function getAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  if (!isAdminConfigured()) {
    return initializeApp({ projectId: "projecthub-demo" });
  }

  const privateKey = resolvePrivateKey();
  if (!privateKey?.includes("BEGIN PRIVATE KEY")) {
    throw new Error(
      "FIREBASE_PRIVATE_KEY invalide. Utilisez FIREBASE_PRIVATE_KEY_BASE64 sur Vercel (plus fiable).",
    );
  }

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey,
    }),
  });
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}
