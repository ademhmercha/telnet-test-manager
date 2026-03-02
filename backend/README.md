# Backend — Telnet Test Manager

API REST + WebSocket pour l'exécution et la gestion de tests Telnet sur des équipements embarqués.

---

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Runtime | Node.js |
| Framework HTTP | Express 4 |
| Authentification | JWT (`jsonwebtoken`) + `bcryptjs` |
| WebSocket | `ws` |
| Telnet | `telnet-client` |
| Exécution parallèle | Worker Threads (`worker_threads`) |
| Persistance | Fichiers JSON locaux |

---

## Structure des fichiers

```
backend/
├── server.js              # Point d'entrée — API REST + serveur WebSocket
├── testWorker.js          # Worker thread — exécution des tests Telnet
├── telnetCommands.json    # Catalogue des commandes et séquences
├── database.json          # Base de données locale (utilisateurs, rapports)
├── reports/               # Rapports de test sauvegardés (JSON)
├── SEQUENCES_GUIDE.md     # Guide de création de séquences
└── package.json
```

---

## Démarrage

```bash
# Installation des dépendances
npm install

# Démarrage en production
npm start

# Démarrage en développement (rechargement automatique)
npm run dev
```

Le serveur écoute sur le port **3002** par défaut.
Variable d'environnement : `PORT=3002`

---

## Authentification

Toutes les routes protégées nécessitent un header :

```
Authorization: Bearer <token>
```

Le token JWT est obtenu via `POST /api/auth/login`.
Secret JWT configurable via la variable d'environnement `JWT_SECRET`.

### Rôles disponibles

| Rôle | Description |
|------|-------------|
| `admin` | Accès complet — gestion utilisateurs, suppression rapports |
| `operator` | Lancement de tests, lecture des rapports |
| `viewer` | Lecture seule |

---

## Endpoints API

### Authentification

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/api/auth/login` | Connexion — retourne un JWT |
| `GET` | `/api/auth/me` | Informations de l'utilisateur connecté |

### Commandes Telnet

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/commands` | Liste toutes les commandes disponibles |

### Tests

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/api/tests/start` | Lance un test (single, monitoring, sequence) |
| `POST` | `/api/tests/:id/stop` | Arrête un test en cours |
| `GET` | `/api/tests/active` | Liste les tests actifs |

### Rapports

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/reports` | Liste tous les rapports |
| `GET` | `/api/reports/:id` | Détail d'un rapport |
| `DELETE` | `/api/reports/:id` | Supprime un rapport (admin uniquement) |

### Administration

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/admin/users` | Liste les utilisateurs (admin) |
| `POST` | `/api/admin/users` | Crée un utilisateur (admin) |
| `PUT` | `/api/admin/users/:id` | Modifie un utilisateur (admin) |
| `DELETE` | `/api/admin/users/:id` | Supprime un utilisateur (admin) |

---

## WebSocket

Le serveur WebSocket écoute sur le même port que HTTP.
Connexion : `ws://localhost:3002`

### Événements reçus (client → serveur)

```json
{ "type": "subscribe", "testId": "abc123" }
{ "type": "unsubscribe", "testId": "abc123" }
```

### Événements émis (serveur → client)

```json
{ "type": "log",      "testId": "...", "data": "ligne de log" }
{ "type": "result",   "testId": "...", "status": "success" | "failure" }
{ "type": "progress", "testId": "...", "step": 2, "total": 5 }
{ "type": "done",     "testId": "...", "report": { ... } }
```

---

## Configuration des commandes — `telnetCommands.json`

Chaque commande est un objet dans le tableau `commands`.

### Commande simple (`type: "single"`)

```json
{
  "id": "uptime",
  "name": "Uptime système",
  "type": "single",
  "command": "uptime",
  "description": "Affiche le temps de fonctionnement",
  "expectedResponse": "up"
}
```

### Commande de monitoring (`type: "monitoring"`)

```json
{
  "id": "keys",
  "name": "Moniteur clés",
  "type": "monitoring",
  "command": "scos-keys monitor",
  "description": "Surveille les appuis de touches",
  "expectedEvents": ["KEY_WLAN:PRESSED", "KEY_WPS_BUTTON:PRESSED"]
}
```

### Séquence (`type: "sequence"`)

```json
{
  "id": "sequence_led_test",
  "name": "Test complet LEDs",
  "type": "sequence",
  "description": "Cycle off → on → off",
  "steps": [
    { "command": "scos-leds off all", "expectedResponse": "#", "timeout": 3000, "description": "Éteindre" },
    { "command": "sleep 2",           "expectedResponse": "#", "timeout": 3000, "description": "Attendre" },
    { "command": "scos-leds on all",  "expectedResponse": "#", "timeout": 3000, "description": "Allumer" }
  ]
}
```

### Champs disponibles

| Champ | Type | Description |
|-------|------|-------------|
| `id` | string | Identifiant unique |
| `name` | string | Nom affiché dans l'UI |
| `type` | `single` \| `monitoring` \| `sequence` | Type d'exécution |
| `command` | string | Commande shell envoyée via Telnet |
| `description` | string | Description courte |
| `expectedResponse` | string | Sous-chaîne attendue dans la réponse (optionnel) |
| `expectedEvents` | string[] | Événements attendus en mode monitoring (optionnel) |
| `steps` | object[] | Étapes d'une séquence (type `sequence` uniquement) |
| `timeout` | number | Timeout en ms par étape (défaut : 5000) |

> **Validation** : si `expectedResponse` est défini, le test passe (`success`) uniquement si la réponse Telnet contient cette sous-chaîne. Sans `expectedResponse`, tout retour non vide est considéré comme succès.

---

## Base de données — `database.json`

Fichier JSON local contenant :

- `users` — comptes utilisateurs (mots de passe hashés avec bcrypt)
- `reports` — historique des rapports de tests

Les écritures sont sérialisées via une queue pour éviter les corruptions concurrentes.

---

## Worker Threads — `testWorker.js`

Chaque test est exécuté dans un **Worker Thread** isolé pour ne pas bloquer la boucle d'événements principale.
Les workers communiquent avec le thread principal via `parentPort.postMessage()` pour streamer les logs en temps réel.

---

## Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `PORT` | `3002` | Port d'écoute du serveur |
| `JWT_SECRET` | `votre-secret-jeton-securise` | Secret de signature des tokens JWT |

