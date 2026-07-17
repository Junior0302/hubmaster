# ProjectHub / Hubmaster

App Next.js 15 (frontend + API) avec Firebase Auth/Firestore et Supabase Storage.

## Démarrage local

```bash
npm install
npm run dev
```

- Local : http://localhost:3000
- Réseau : http://VOTRE_IP:3000 (`ipconfig` → IPv4)

## Mise en ligne (Render — recommandé)

Le frontend **et** les API tournent sur le même service :
**https://hubmaster.onrender.com**

### Configuration Render

1. Web Service → repo `Junior0302/hubmaster` → branche `main`
2. **Runtime** : Node
3. **Build Command** : `npm install && npm run build`
4. **Start Command** : `npm run start`
5. Ajoutez les variables d’environnement (Environment) :

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY_BASE64
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_BUCKET=hubmaster datafile
SUPABASE_STORAGE_PUBLIC=false
```

Sur Render, préférez `FIREBASE_PRIVATE_KEY_BASE64` (fichier local `.firebase-private-key.b64.txt`).

6. Après déploiement, Firebase → **Authentication** → **Domaines autorisés** → ajoutez :
   - `hubmaster.onrender.com`

7. Test : https://hubmaster.onrender.com/api/health

### Pourquoi « APPLICATION LOADING » apparaît ?

Sur le **plan Free**, Render **éteint** le serveur après ~15 min d’inactivité.
Au prochain clic, Render affiche son écran noir de démarrage (30–60 s). **Ce n’est pas un bug Hubmaster** : c’est l’hébergeur.

Solutions :
1. **Recommandé** : passer le service Render en **Starter** (toujours allumé).
2. Keep-alive automatique : workflow GitHub Actions `.github/workflows/keep-alive.yml` (ping `/api/health` toutes les 10 min).
3. Ou un moniteur gratuit (UptimeRobot) pointant vers `https://hubmaster.onrender.com/api/health`.

## Architecture

| Service | Rôle |
|---------|------|
| Render (Next.js) | UI + API Routes |
| Firebase Auth | Connexion |
| Firestore | Projets, utilisateurs, métadonnées |
| Supabase Storage | Fichiers |

## Permissions

- **Admin** : tout
- **Manager** : créer/modifier projets et fichiers
- **Utilisateur** : lecture et téléchargement
