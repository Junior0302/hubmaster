export function explainFirebaseAdminError(error: unknown): {
  title: string;
  detail: string;
  action: string;
  code?: string;
} {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (!process.env.FIREBASE_PROJECT_ID?.trim()) {
    return {
      title: "FIREBASE_PROJECT_ID manquant",
      detail: "La variable n’est pas définie sur Vercel.",
      action: "Ajoutez FIREBASE_PROJECT_ID=hubmaster-1a413 dans Vercel → Settings → Environment Variables, puis Redeploy.",
      code: "MISSING_PROJECT_ID",
    };
  }

  if (!process.env.FIREBASE_CLIENT_EMAIL?.trim()) {
    return {
      title: "FIREBASE_CLIENT_EMAIL manquant",
      detail: "La variable n’est pas définie sur Vercel.",
      action:
        "Ajoutez FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@hubmaster-1a413.iam.gserviceaccount.com, puis Redeploy.",
      code: "MISSING_CLIENT_EMAIL",
    };
  }

  if (!process.env.FIREBASE_PRIVATE_KEY?.trim() && !process.env.FIREBASE_PRIVATE_KEY_BASE64?.trim()) {
    return {
      title: "Clé privée Firebase manquante",
      detail: "Ni FIREBASE_PRIVATE_KEY ni FIREBASE_PRIVATE_KEY_BASE64 n’est définie.",
      action:
        "Sur Vercel, ajoutez FIREBASE_PRIVATE_KEY_BASE64 (contenu de .firebase-private-key.b64.txt), puis Redeploy.",
      code: "MISSING_PRIVATE_KEY",
    };
  }

  if (
    lower.includes("private key") ||
    lower.includes("decoder") ||
    lower.includes("pem") ||
    lower.includes("begin private key") ||
    lower.includes("invalid_argument")
  ) {
    return {
      title: "FIREBASE_PRIVATE_KEY invalide",
      detail: message,
      action:
        "Sur Vercel, utilisez FIREBASE_PRIVATE_KEY_BASE64 (une seule ligne Base64) au lieu de la clé PEM avec \\n, puis Redeploy.",
      code: "INVALID_PRIVATE_KEY",
    };
  }

  if (lower.includes("id token") || lower.includes("session cookie") || lower.includes("firebase id token")) {
    return {
      title: "Jeton de connexion invalide",
      detail: message,
      action:
        "Reconnectez-vous. Vérifiez aussi que hubmaster-theta.vercel.app est dans Firebase → Authentication → Domaines autorisés.",
      code: "INVALID_ID_TOKEN",
    };
  }

  if (lower.includes("credential") || lower.includes("permission") || lower.includes("insufficient")) {
    return {
      title: "Compte de service Firebase rejeté",
      detail: message,
      action:
        "Vérifiez FIREBASE_CLIENT_EMAIL et que la clé privée correspond bien au projet hubmaster-1a413.",
      code: "INVALID_CREDENTIAL",
    };
  }

  return {
    title: "Erreur serveur de session",
    detail: message,
    action: "Ouvrez /api/health pour vérifier la config, puis Vercel → Deployments → Logs pour le détail.",
    code: "SESSION_ERROR",
  };
}
