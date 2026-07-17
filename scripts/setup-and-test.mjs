import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const content = readFileSync(resolve(".env.local"), "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

loadEnv();

const email = "johnjuniort40@gmail.com";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const auth = getAuth();
const db = getFirestore();

async function setupFirestoreProfile() {
  const user = await auth.getUserByEmail(email);
  await db.collection("users").doc(user.uid).set(
    {
      firstname: "John",
      lastname: "Martin",
      email,
      role: "admin",
      createdAt: new Date().toISOString(),
    },
    { merge: true },
  );
  console.log("OK Firestore users/" + user.uid);
  return user.uid;
}

async function getIdToken(uid) {
  const customToken = await auth.createCustomToken(uid);
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "Échec auth");
  return data.idToken;
}

async function testApp(baseUrl, idToken) {
  const sessionRes = await fetch(`${baseUrl}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!sessionRes.ok) throw new Error("Session API: " + (await sessionRes.text()));
  const cookie = sessionRes.headers.getSetCookie?.()?.[0] ?? sessionRes.headers.get("set-cookie");
  if (!cookie) throw new Error("Pas de cookie de session");

  const projectsRes = await fetch(`${baseUrl}/api/projects`, {
    headers: { Cookie: cookie.split(";")[0] },
  });
  if (!projectsRes.ok) throw new Error("Projects API: " + (await projectsRes.text()));
  const projects = await projectsRes.json();
  console.log("OK Projects API:", projects.length, "projet(s)");

  const form = new FormData();
  form.append("title", "Test Hubmaster");
  form.append("description", "Projet créé automatiquement");
  form.append("category", "Design");
  form.append("client", "Hubmaster");
  const createRes = await fetch(`${baseUrl}/api/projects`, {
    method: "POST",
    headers: { Cookie: cookie.split(";")[0] },
    body: form,
  });
  const created = await createRes.json();
  if (!createRes.ok) throw new Error("Création projet: " + JSON.stringify(created));
  console.log("OK Création projet:", created.title);

  const projectsAfter = await fetch(`${baseUrl}/api/projects`, {
    headers: { Cookie: cookie.split(";")[0] },
  }).then((r) => r.json());
  console.log("OK Projets après création:", projectsAfter.length);

  const loginRes = await fetch(`${baseUrl}/login`);
  if (!loginRes.ok) throw new Error("Page login: " + loginRes.status);
  console.log("OK Page /login:", loginRes.status);

  const dashRes = await fetch(`${baseUrl}/dashboard`, {
    headers: { Cookie: cookie.split(";")[0] },
  });
  if (!dashRes.ok) throw new Error("Dashboard: " + dashRes.status);
  console.log("OK Page /dashboard:", dashRes.status);
}

const uid = await setupFirestoreProfile();
const idToken = await getIdToken(uid);
const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";
await testApp(baseUrl, idToken);
console.log("Tous les tests sont passés.");
