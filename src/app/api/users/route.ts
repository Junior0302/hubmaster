import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";
import { demoUsers } from "@/lib/demo-data";
import { getSessionUser } from "@/lib/server-auth";
import { getUserProfile } from "@/lib/users";
import { toIso } from "@/lib/dates";
import type { Role } from "@/types";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!isAdminConfigured()) return NextResponse.json(demoUsers);

  const snapshot = await getAdminDb().collection("users").get();
  const users = snapshot.docs
    .map((document) => {
      const data = document.data();
      return {
        id: document.id,
        firstname: String(data.firstname ?? ""),
        lastname: String(data.lastname ?? ""),
        email: String(data.email ?? ""),
        role: (data.role as Role) ?? "user",
        avatar: data.avatar ? String(data.avatar) : undefined,
        createdAt: toIso(data.createdAt),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session || session.role !== "admin") {
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
