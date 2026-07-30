# CodeMaster — Backend API

API Node.js/Express + PostgreSQL pour la plateforme CodeMaster : authentification,
progression (XP/niveaux/badges), cours, quiz, et exécution de code sandboxée pour les défis.

## 1. Installation

```bash
cd backend
npm install
cp .env.example .env        # puis édite les valeurs (JWT_SECRET en priorité)
```

## 2. Lancer les services (Postgres + Judge0)

```bash
docker compose up -d
```

Judge0 est le moteur qui exécute réellement le code soumis par les utilisateurs dans
des containers isolés et éphémères — jamais sur le serveur principal. C'est la pièce
qui manquait dans la version 100% frontend pour exécuter Python/Java/C++ pour de vrai.

## 3. Créer les tables puis charger les données de démo

```bash
npm run migrate
node src/seed.js
```

## 4. Démarrer l'API

```bash
npm run dev
# → API disponible sur http://localhost:4000
```

## 5. Endpoints principaux

| Méthode | Route | Description |
|---|---|---|
| POST | `/api/auth/signup` | Créer un compte |
| POST | `/api/auth/login` | Connexion (pose un cookie httpOnly) |
| POST | `/api/auth/logout` | Déconnexion |
| GET | `/api/auth/me` | Utilisateur courant |
| GET | `/api/auth/verify-email?token=...` | Confirme l'adresse email |
| POST | `/api/auth/resend-verification` | Renvoie l'email de confirmation (connecté) |
| POST | `/api/auth/request-password-reset` | Envoie un lien de réinitialisation par email |
| POST | `/api/auth/reset-password` | Définit un nouveau mot de passe via le token reçu |
| GET | `/api/courses` | Liste des cours + progression |
| GET | `/api/courses/:id` | Détail d'un cours + chapitres |
| POST | `/api/courses/:id/complete-chapter` | Marque un chapitre fini, attribue l'XP |
| GET | `/api/courses/chapters/:id/quiz` | Questions du quiz d'un chapitre |
| POST | `/api/courses/chapters/:id/quiz/submit` | Corrige le quiz |
| GET | `/api/challenges` | Liste des défis |
| POST | `/api/challenges/:id/submit` | Exécute le code via Judge0 et corrige |
| GET | `/api/users/leaderboard` | Classement top 50 |
| GET | `/api/users/me/profile` | Profil, stats, badges |

Toutes les routes protégées lisent un cookie `cm_token` (JWT httpOnly) — pas besoin
de gérer un token côté client en JS, ce qui protège contre le vol de session par XSS.

## 6. Brancher le frontend `codemaster.html`

Le frontend fourni utilise un objet `DB` qui simule un backend via `localStorage`.
Pour le connecter à cette API réelle, remplace ces fonctions par des appels `fetch` :

```js
const API = 'http://localhost:4000/api';

async function doSignup() {
  const res = await fetch(`${API}/auth/signup`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    credentials: 'include', // indispensable pour envoyer/recevoir le cookie cm_token
    body: JSON.stringify({ name, email, password: pass })
  });
  const data = await res.json();
  if (!res.ok) return toast(data.error);
  // data.user contient { id, name, email, xp, streak }
}
```

Fais de même pour `doLogin`, `currentUser` (→ `GET /api/auth/me`), `awardXP` (les gains
d'XP sont désormais calculés côté serveur dans `/complete-chapter` et `/challenges/:id/submit`,
donc le frontend n'a plus qu'à afficher le total retourné), `renderLeaderboard`
(→ `GET /api/users/leaderboard`) et `renderProfile` (→ `GET /api/users/me/profile`).

Il faudra aussi servir `codemaster.html` par un serveur web (Nginx, Vercel, etc.) avec
`CLIENT_ORIGIN` dans `.env` pointant vers son domaine, pour que CORS + cookies fonctionnent.

## 6bis. Emails (vérification de compte & mot de passe oublié)

En développement, tu n'as **rien à configurer** : si `SMTP_HOST` est vide dans `.env`,
le serveur crée automatiquement un compte de test Ethereal et affiche dans les logs un
lien de prévisualisation de l'email (`✉️ Email envoyé (aperçu dev) : https://ethereal.email/...`),
sur lequel tu peux cliquer pour voir le rendu et récupérer le lien de vérification/reset.

En production, renseigne un vrai fournisseur SMTP dans `.env` :

```
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=ta-cle-api
SMTP_FROM="CodeMaster <no-reply@tondomaine.com>"
APP_URL=https://tondomaine.com
```

Fonctionnement :
- À l'inscription, un token de vérification (valide 24h) est généré et un email est envoyé.
  Le compte fonctionne immédiatement (pas besoin d'attendre pour se connecter), mais le
  frontend peut afficher un bandeau "Confirme ton email" tant que `user.emailVerified` est `false`.
- Le lien pointe vers `${APP_URL}/verify-email?token=...` — il faut donc une page côté
  frontend qui lit ce paramètre et appelle `GET /api/auth/verify-email?token=...`.
- Pour "mot de passe oublié" : `POST /api/auth/request-password-reset` avec `{email}`,
  puis la page `${APP_URL}/reset-password?token=...` appelle `POST /api/auth/reset-password`
  avec `{token, newPassword}`. La réponse est volontairement identique que l'email existe
  ou non, pour ne pas révéler quels comptes sont enregistrés.

## 6ter. Héberger Judge0 en production (exécution de code)

En local, `docker-compose.yml` lance Judge0 sur ta machine — parfait pour développer,
mais pas pour la production (pas de scalabilité, pas de mises à jour de sécurité gérées).
Deux options sérieuses :

**Option A — Judge0 CE managé via RapidAPI (le plus simple à démarrer) :**
1. Crée un compte sur [rapidapi.com](https://rapidapi.com) et abonne-toi à l'API "Judge0 CE".
2. Dans `.env` de production :
   ```
   JUDGE0_URL=https://judge0-ce.p.rapidapi.com
   JUDGE0_API_KEY=ta-cle-rapidapi
   ```
3. Le code de `challenges.js` envoie déjà la clé via l'en-tête `X-RapidAPI-Key` si elle est définie —
   aucune modification de code nécessaire.

**Option B — Auto-hébergement sur un serveur dédié (plus de contrôle, moins cher à grande échelle) :**
1. Déploie Judge0 sur une VM séparée (DigitalOcean, Hetzner, AWS EC2...) avec son propre
   `docker-compose.yml` (fourni par le [dépôt officiel Judge0](https://github.com/judge0/judge0)),
   isolée du reste de ton infrastructure — c'est un service qui exécute du code arbitraire,
   il ne doit jamais partager de réseau/volume avec ta base de données principale.
2. Mets cette VM derrière un reverse proxy (Nginx/Caddy) avec HTTPS et une authentification
   par clé (Judge0 supporte un `AUTHENTICATION_TOKEN` dans sa propre config).
3. Pointe `JUDGE0_URL` vers cette adresse dans `.env` de production.

Dans les deux cas : ajoute une limite de temps CPU et de mémoire par soumission (déjà
configurable côté Judge0 via `cpu_time_limit`/`memory_limit` dans le payload), pour
qu'un utilisateur ne puisse pas faire tourner une boucle infinie ou épuiser les ressources.

## 7. Sécurité déjà en place

- Mots de passe hashés avec bcrypt (12 rounds).
- Sessions via JWT dans un cookie **httpOnly** + `sameSite=lax` (protège contre le vol par script).
- Rate limiting global + limites dédiées sur `/auth` et `/challenges` (anti brute-force / anti-spam d'exécution).
- Le code utilisateur n'est **jamais** exécuté directement sur le serveur API : il transite
  systématiquement par Judge0, qui l'isole dans des containers jetables avec quotas CPU/mémoire/temps.
- Vérification d'email et réinitialisation de mot de passe par tokens à usage unique et durée
  de vie limitée (24h / 1h), sans jamais révéler si un email est inscrit ou non.

## 8. Pour aller en production

- Remplacer `docker compose` local par des services managés (RDS/Cloud SQL pour Postgres,
  Judge0 hébergé séparément — voir section 6ter ci-dessus).
- Ajouter des migrations versionnées (ex: `node-pg-migrate`) plutôt qu'un seul script SQL.
- Configurer un vrai fournisseur SMTP (voir section 6bis) plutôt que le fallback Ethereal de dev.
- Mettre `COOKIE_SECURE=true` et servir en HTTPS uniquement.
- Envisager de bloquer certaines actions (ex: soumettre un défi) tant que `email_verified`
  est `false`, si tu veux forcer la vérification plutôt que la rendre simplement informative.
