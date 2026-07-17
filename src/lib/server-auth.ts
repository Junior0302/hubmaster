import { cookies } from "next/headers";
import { getAdminAuth, getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";
import type { Role } from "@/types";

export interface SessionUser {
  uid: string;
  role: Role;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = (await cookies()).get("projecthub_session")?.value;
  if (!session) return null;
  if (!isAdminConfigured()) return { uid: "demo-admin", role: "admin" };

  try {
    const decoded = await getAdminAuth().verifySessionCookie(session, true);
    const profile = await getAdminDb().collection("users").doc(decoded.uid).get();
    return { uid: decoded.uid, role: (profile.data()?.role as Role) ?? "user" };
  } catch {
    return null;
  }
}
