# ProjectHub

MVP de gestion de projets et de fichiers avec Next.js 15, Firebase (Auth + Firestore)
et Supabase Storage pour les fichiers.

## Démarrage local

```bash
npm install
npm run dev
```

- Sur votre PC : http://localhost:3000
- Sur le même réseau Wi‑Fi : http://192.168.1.171:3000 (remplacez par votre IP locale)

Pour trouver votre IP : `ipconfig` → **Adresse IPv4** (souvent `192.168.x.x`).

Si les collègues ne peuvent pas se connecter, autorisez le port **3000** dans le pare-feu Windows.

## Mise en ligne (Vercel — gratuit)

1. Poussez le projet sur GitHub.
2. Allez sur [vercel.com](https://vercel.com) → **Add New Project** → importez le repo.
3. Ajoutez toutes les variables de `.env.local` dans **Settings → Environment Variables**.
4. Déployez.

Après le déploiement, dans **Firebase Console → Authentication → Settings → Authorized domains**, ajoutez votre domaine Vercel (ex. `hubmaster.vercel.app`).

Pour la prod locale testée :

```bash
npm run build
npm run start
```

Puis partagez `http://VOTRE_IP:3000` sur le réseau.

## Architecture

| Service | Rôle |
|---------|------|
| Firebase Auth | Connexion email/mot de passe |
| Firestore | Projets, utilisateurs, métadonnées fichiers |
| Supabase Storage | Stockage des fichiers (gratuit) |

Firebase Storage n’est **pas** requis (forfait Blaze).

## Configuration Firebase

1. Créez une app Web dans Firebase Console.
2. Activez Authentication (email/mot de passe) et Firestore.
3. Renseignez les variables `NEXT_PUBLIC_FIREBASE_*` et `FIREBASE_*` dans `.env.local`.
4. Déployez les règles : `firebase deploy --only firestore:rules,firestore:indexes`.
5. Créez `users/{uid}` avec `role: "admin"` pour le premier utilisateur.

## Configuration Supabase Storage

1. Créez un bucket (ex. `hubmaster datafile`) dans Supabase → Storage.
2. Récupérez l’URL du projet et la **service_role key** (Settings → API).
3. Ajoutez dans `.env.local` :
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_BUCKET` (nom exact du bucket)
4. Redémarrez `npm run dev`.

La `service_role key` est secrète : ne jamais l’exposer côté navigateur.

## Permissions

- **Admin** : tout
- **Manager** : créer/modifier projets et fichiers
- **Utilisateur** : lecture et téléchargement
