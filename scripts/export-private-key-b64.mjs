import { readFileSync, writeFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const match = env.match(/FIREBASE_PRIVATE_KEY=(.*)/);
if (!match) throw new Error("FIREBASE_PRIVATE_KEY introuvable");

let value = match[1].trim();
if (
  (value.startsWith('"') && value.endsWith('"')) ||
  (value.startsWith("'") && value.endsWith("'"))
) {
  value = value.slice(1, -1);
}

const pem = value.replace(/\\n/g, "\n");
const base64 = Buffer.from(pem, "utf8").toString("base64");
writeFileSync(".firebase-private-key.b64.txt", base64);
console.log("OK écrit dans .firebase-private-key.b64.txt");
console.log("Longueur:", base64.length);
