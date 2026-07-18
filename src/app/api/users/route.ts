import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";
import { demoUsers } from "@/lib/demo-data";
import { canManageUsers, directoryUsersFor, visibleUsersFor } from "@/lib/permissions";
import { getSessionUser } from "@/lib/server-auth";
import { getUserProfile } from "@/lib/users";
import { toIso } from "@/lib/dates";
import type { AppUser, Role } from "@/types";

function mapUserDoc(id: string, data: FirebaseFirestore.DocumentData): AppUser {
  return {
    id,
    firstname: String(data.firstname ?? ""),
    lastname: String(data.lastname ?? ""),
    email: String(data.email ?? ""),
    role: (data.role as Role) ?? "user",
    avatar: data.avatar ? String(data.avatar) : undefined,
    createdAt: toIso(data.createdAt),
  };
}

async function listAllUsers(): Promise<AppUser[]> {
  if (!isAdminConfigured()) return demoUsers;
  const snapshot = await getAdminDb().collection("users").get();
  return snapshot.docs
    .map((document) => mapUserDoc(document.id, document.data()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const url = new URL(request.url);
  const directory = url.searchParams.get("directory") === "1";
  const all = await listAllUsers();
  const viewer = { uid: session.uid, role: session.role };

  if (directory) {
    const users = directoryUsersFor(viewer, all).map((user) => {
      if (session.role === "user") {
        return { ...user, email: "" };
      }
      return user;
    });
    return NextResponse.json(users);
  }

  // Admin panel: full list for admins; managers see non-admins only.
  if (session.role === "admin") {
    return NextResponse.json(all);
  }
  return NextResponse.json(visibleUsersFor(viewer, all));
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session || !canManageUsers({ uid: session.uid, role: session.role })) {
    return NextResponse.json({ error: "Droits insuffisants" }, { status: 403 });
  }

  const body = (await request.json()) as {
    email?: string;
    password?: string;
    firstname?: string;
    lastname?: string;
    role?: Role;
  };

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const firstname = String(body.firstname ?? "").trim();
  const lastname = String(body.lastname ?? "").trim();
  const role = body.role ?? "user";

  if (!email || !password || password.length < 6 || !firstname || !lastname) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  if (!["admin", "manager", "user"].includes(role)) {
    return NextResponse.json({ error: "Rôle invalide" }, { status: 400 });
  }

  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: "Création d’utilisateur disponible uniquement avec Firebase configuré" },
      { status: 503 },
    );
  }

  const authUser = await getAdminAuth().createUser({
    email,
    password,
    displayName: `${firstname} ${lastname}`,
  });
  await getAdminDb().collection("users").doc(authUser.uid).set({
    firstname,
    lastname,
    email,
    role,
    createdAt: new Date().toISOString(),
  });

  const profile = await getUserProfile(authUser.uid);
  return NextResponse.json(profile, { status: 201 });
}
