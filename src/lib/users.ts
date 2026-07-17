import { adminDb, isAdminConfigured } from "@/lib/firebase-admin";
import { demoUsers } from "@/lib/demo-data";
import { toIso } from "@/lib/dates";
import type { AppUser, Role } from "@/types";

export function looksLikeUid(value: string): boolean {
  return /^[a-zA-Z0-9]{20,}$/.test(value);
}

export async function getUserProfile(uid: string): Promise<AppUser | null> {
  if (!isAdminConfigured) return demoUsers.find((user) => user.id === uid) ?? demoUsers[0] ?? null;

  const document = await adminDb.collection("users").doc(uid).get();
  if (!document.exists) return null;
  const data = document.data()!;
  return {
    id: document.id,
    firstname: String(data.firstname ?? ""),
    lastname: String(data.lastname ?? ""),
    email: String(data.email ?? ""),
    role: (data.role as Role) ?? "user",
    avatar: data.avatar ? String(data.avatar) : undefined,
    createdAt: toIso(data.createdAt),
  };
}

export async function resolveCreatorName(createdBy: string, creatorName?: string): Promise<string> {
  if (creatorName && creatorName !== createdBy && !looksLikeUid(creatorName)) return creatorName;
  const profile = await getUserProfile(createdBy);
  if (!profile) return "Utilisateur";
  return `${profile.firstname} ${profile.lastname}`.trim() || profile.email;
}
