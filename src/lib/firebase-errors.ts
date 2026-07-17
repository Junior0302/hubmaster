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
      title: "Configuration serveur incomplète",
      detail: "L’identifiant du projet Firebase est manquant côté serveur.",
      action: "Sur Render → Environment, ajoutez FIREBASE_PROJECT_ID=hubmaster-1a413, puis redéployez.",
      code: "MISSING_PROJECT_ID",
    };
  }

  if (!process.env.FIREBASE_CLIENT_EMAIL?.trim()) {
    return {
      title: "Configuration serveur incomplète",
      detail: "L’email du compte de service Firebase est manquant.",
      action:
        "Sur Render → Environment, ajoutez FIREBASE_CLIENT_EMAIL, puis redéployez.",
      code: "MISSING_CLIENT_EMAIL",
    };
  }

  if (!process.env.FIREBASE_PRIVATE_KEY?.trim() && !process.env.FIREBASE_PRIVATE_KEY_BASE64?.trim()) {
    return {
      title: "Configuration serveur incomplète",
      detail: "La clé privée Firebase n’est pas définie sur le serveur.",
      action:
        "Sur Render, ajoutez FIREBASE_PRIVATE_KEY_BASE64 (une seule ligne), puis redéployez. Testez /api/health.",
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
      title: "Clé de sécurité invalide",
      detail: "Le serveur ne peut pas lire la clé Firebase correctement.",
      action:
        "Remplacez FIREBASE_PRIVATE_KEY par FIREBASE_PRIVATE_KEY_BASE64 (Base64 d’une seule ligne), puis redéployez.",
      code: "INVALID_PRIVATE_KEY",
    };
  }

  if (lower.includes("id token") || lower.includes("session cookie") || lower.includes("firebase id token")) {
    return {
      title: "Session expirée ou invalide",
      detail: "Votre connexion n’a pas pu être validée.",
      action:
        "Reconnectez-vous. Si ça continue, ajoutez hubmaster.onrender.com dans Firebase → Authentication → Domaines autorisés.",
      code: "INVALID_ID_TOKEN",
    };
  }

  if (lower.includes("credential") || lower.includes("permission") || lower.includes("insufficient")) {
    return {
      title: "Accès serveur refusé",
      detail: "Les identifiants Firebase Admin ne correspondent pas au projet.",
      action: "Vérifiez FIREBASE_CLIENT_EMAIL et la clé privée du projet hubmaster-1a413.",
      code: "INVALID_CREDENTIAL",
    };
  }

  if (lower.includes("firebase admin non configuré")) {
    return {
      title: "Service temporairement indisponible",
      detail: "La configuration de connexion n’est pas complète sur le serveur.",
      action: "Contactez l’administrateur ou vérifiez /api/health sur Render.",
      code: "ADMIN_NOT_CONFIGURED",
    };
  }

  if (
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("timeout") ||
    lower.includes("econnrefused")
  ) {
    return {
      title: "Serveur en cours de démarrage",
      detail: "L’application se réveille (plan gratuit Render). Cela peut prendre 30 à 60 secondes.",
      action: "Attendez un instant puis réessayez. Pour éviter ça, passez au plan Render Starter.",
      code: "COLD_START",
    };
  }

  return {
    title: "Connexion impossible pour le moment",
    detail: "Une erreur est survenue pendant la création de votre session.",
    action: "Réessayez dans quelques secondes. Si le problème continue, vérifiez https://hubmaster.onrender.com/api/health",
    code: "SESSION_ERROR",
  };
}

/** Messages d’erreur lisibles pour l’utilisateur final (côté navigateur). */
export function explainClientAuthError(error: unknown): {
  title: string;
  detail: string;
  action?: string;
} {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code: string }).code)
      : "";
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return {
      title: "Email ou mot de passe incorrect",
      detail: "Aucun compte ne correspond à ces identifiants.",
      action: "Vérifiez votre saisie, ou créez un compte via l’onglet « Créer un compte ».",
    };
  }
  if (code === "auth/too-many-requests") {
    return {
      title: "Trop de tentatives",
      detail: "La connexion a été temporairement bloquée pour sécurité.",
      action: "Attendez quelques minutes avant de réessayer.",
    };
  }
  if (code === "auth/unauthorized-domain") {
    return {
      title: "Domaine non autorisé",
      detail: "Ce site n’est pas encore autorisé par Firebase.",
      action: "Ajoutez hubmaster.onrender.com dans Firebase → Authentication → Domaines autorisés.",
    };
  }
  if (code === "auth/email-already-in-use") {
    return {
      title: "Email déjà utilisé",
      detail: "Un compte existe déjà avec cette adresse.",
      action: "Connectez-vous, ou utilisez « Mot de passe oublié ».",
    };
  }
  if (code === "auth/weak-password") {
    return {
      title: "Mot de passe trop faible",
      detail: "Choisissez un mot de passe d’au moins 6 caractères.",
    };
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed") ||
    lower.includes("timeout")
  ) {
    return {
      title: "Le serveur démarre",
      detail:
        "Hubmaster se réveille après une période d’inactivité. Patientez 30 à 60 secondes, puis réessayez.",
      action: "Ne fermez pas la page. Actualisez une fois le démarrage terminé.",
    };
  }

  return {
    title: "Action impossible",
    detail: message || "Une erreur inattendue est survenue.",
    action: "Réessayez. Si ça continue, contactez le support.",
  };
}
