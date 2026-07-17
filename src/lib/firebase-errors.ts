export function explainFirebaseAdminError(error: unknown): {
  title: string;
  detail: string;
  action: string;
  code?: string;
} {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const hostHint =
    "Sur Render (Environment) ou Vercel (Settings → Environment Variables), ajoutez les variables du fichier render-env-checklist.txt, puis redéployez. Vérifiez ensuite /api/health : firebase.adminConfigured doit être true.";

  if (!process.env.FIREBASE_PROJECT_ID?.trim()) {
    return {
      title: "FIREBASE_PROJECT_ID manquant",
      detail: "La variable n’est pas définie sur le serveur de production.",
      action: `${hostHint} Valeur attendue : hubmaster-1a413.`,
      code: "MISSING_PROJECT_ID",
    };
  }

  if (!process.env.FIREBASE_CLIENT_EMAIL?.trim()) {
    return {
      title: "FIREBASE_CLIENT_EMAIL manquant",
      detail: "La variable n’est pas définie sur le serveur de production.",
      action: `${hostHint} Valeur attendue : firebase-adminsdk-fbsvc@hubmaster-1a413.iam.gserviceaccount.com.`,
      code: "MISSING_CLIENT_EMAIL",
    };
  }

  if (!process.env.FIREBASE_PRIVATE_KEY?.trim() && !process.env.FIREBASE_PRIVATE_KEY_BASE64?.trim()) {
    return {
      title: "Clé privée Firebase manquante",
      detail: "Ni FIREBASE_PRIVATE_KEY ni FIREBASE_PRIVATE_KEY_BASE64 n’est définie.",
      action: `${hostHint} Préférez FIREBASE_PRIVATE_KEY_BASE64 (contenu de .firebase-private-key.b64.txt, une seule ligne).`,
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
        "Utilisez FIREBASE_PRIVATE_KEY_BASE64 (une seule ligne Base64) au lieu de la clé PEM avec \\n, puis redéployez.",
      code: "INVALID_PRIVATE_KEY",
    };
  }

  if (lower.includes("id token") || lower.includes("session cookie") || lower.includes("firebase id token")) {
    return {
      title: "Jeton de connexion invalide",
      detail: message,
      action:
        "Reconnectez-vous. Ajoutez aussi hubmaster.onrender.com (et hubmaster-theta.vercel.app si besoin) dans Firebase → Authentication → Domaines autorisés.",
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

  if (lower.includes("firebase admin non configuré")) {
    return {
      title: "Firebase Admin non configuré",
      detail: "Les variables serveur FIREBASE_* sont absentes ou incomplètes.",
      action: hostHint,
      code: "ADMIN_NOT_CONFIGURED",
    };
  }

  return {
    title: "Erreur serveur de session",
    detail: message,
    action: "Ouvrez /api/health pour vérifier la config, puis consultez les logs du déploiement (Render ou Vercel).",
    code: "SESSION_ERROR",
  };
}
