# Backend — Telnet Test Manager

Serveur API REST + WebSocket pour l'exécution et le monitoring de tests Telnet en temps réel.

---

## Pourquoi ces choix technologiques ?

### Node.js

Le cœur de ce projet est l'exécution de **sessions Telnet concurrentes**. Node.js est taillé pour ça :

- **I/O non-bloquant** : Node.js gère des dizaines de connexions Telnet simultanées sans bloquer le thread principal, contrairement à un modèle thread-par-connexion (Java, .NET) qui exploserait en mémoire.
- **Worker Threads** : chaque test Telnet tourne dans un thread isolé via `worker_threads`. Si un test plante ou boucle, il n'affecte pas le reste de l'application.
- **Événements natifs** : la communication entre le worker Telnet et le serveur principal se fait via `parentPort.postMessage()` — exactement le modèle événementiel de Node.js, sans friction.
- **JavaScript full-stack** : même langage que le frontend React, ce qui réduit le coût cognitif et permet de partager des types/constantes entre les deux.
- **Écosystème** : `telnet-client`, `ws`, `express`, `mongoose` — tout existe, mature, maintenu.

> **Alternative rejetée** : Python (asyncio) aurait été viable pour l'I/O, mais l'intégration WebSocket + REST + Worker dans un même process est plus naturelle en Node.js. Java/Spring aurait été surdimensionné pour ce projet.

---

### MongoDB

Les données manipulées dans ce projet sont **naturellement hiérarchiques et variables** :

- Un `TestResult` contient un tableau de steps, chaque step a ses propres logs, durées, statuts — structure JSON imbriquée idéale pour un document MongoDB.
- Les commandes Telnet (`TelnetCommand`) varient selon le type : `single`, `builtin_sequence`, `sequence`, `monitoring` — pas de schéma fixe, le schéma flexible de MongoDB est un avantage direct.
- Les **rapports** générés sont des snapshots JSON volumineux et hétérogènes — stockés tels quels sans mapping objet-relationnel.
- Les **audit logs** s'accumulent en append-only avec des métadonnées variables (action, contexte, IP…) — parfaitement adapté aux insertions rapides MongoDB.
- **Mongoose** apporte la validation de schéma et les hooks au-dessus de MongoDB, sans sacrifier la flexibilité.

> **Alternative rejetée** : PostgreSQL aurait obligé à mapper des structures JSON imbriquées sur des tables relationnelles (via JSONB ou tables jointes), ajoutant de la complexité sans gain ici. Le modèle de données est fondamentalement documentaire, pas relationnel.

---

### Express.js

Framework HTTP minimaliste et sans opinion, choisi pour :

- **Légèreté** : pas de magie, on voit exactement ce qui se passe dans la chaîne de middlewares.
- **Flexibilité** : notre Clean Architecture impose d'organiser nous-mêmes les couches — Express ne force rien, il s'adapte.
- **Middlewares** : `helmet`, `cors`, `express-rate-limit`, `prom-client` s'intègrent en une ligne.
- **Maturité** : standard de facto Node.js, documentation abondante, pas de surprises.

> **Alternative rejetée** : Fastify est plus performant mais moins universel. NestJS impose une structure d'annotations (décorateurs) qui entre en conflit avec notre choix de Clean Architecture manuelle.

---

### WebSocket (`ws`)

Le monitoring des tests Telnet génère des événements en continu (logs, métriques, statuts). HTTP polling ne convient pas :

- **Temps réel** : les événements du worker Telnet sont broadcastés immédiatement aux clients connectés via `ws`.
- **Authentification JWT** à la connexion WebSocket — le token est vérifié avant d'autoriser le subscribe.
- **Légèreté** : `ws` est la librairie WebSocket Node.js la plus performante et la plus simple. Pas de dépendance à Socket.IO qui aurait ajouté du poids inutile.

---

### React (Frontend)

Le frontend est en React parce que :

- **Composants réactifs** : les logs et statuts de test arrivent en temps réel via WebSocket — React gère la mise à jour du DOM efficacement via son Virtual DOM.
- **Écosystème** : bibliothèques de graphiques (charts), tableaux, UI components — tout est disponible.
- **Cohérence** : même langage JS que le backend, même outillage (npm, ESLint).

---

## Pourquoi une Clean Architecture ?

Ce projet a une logique métier non triviale : validation de paramètres, gestion d'états de tests, audit de toutes les actions, métriques Prometheus, permissions granulaires par utilisateur. Sans structure, tout ça finit dans des fichiers `server.js` de 2000 lignes impossibles à maintenir.

La Clean Architecture résout ça en séparant les responsabilités en **4 couches concentriques** avec une règle unique : **les dépendances pointent toujours vers l'intérieur**.

```
┌─────────────────────────────────────────────────────────┐
│  Interfaces  (Controllers HTTP, Routes, WebSocket)       │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Application  (Use Cases — logique métier)        │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │  Domain  (Entités, Interfaces Repositories) │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
│  Infrastructure  (MongoDB, Telnet, Prometheus)           │
└─────────────────────────────────────────────────────────┘
```

**Bénéfices concrets** :

| Problème sans architecture | Solution apportée |
|---|---|
| Le controller fait de la logique métier | Les controllers ne font qu'extraire `req` et appeler le use case |
| Changer de base de données casse tout | Le domain ne sait pas que MongoDB existe — on swap le repository |
| Tester la logique métier nécessite un serveur | Les use cases s'instancient seuls, sans Express ni MongoDB |
| Les dépendances circulaires s'accumulent | La règle de direction des dépendances les rend impossibles |

---

## Structure des dossiers

```
backend/
├── src/
│   ├── domain/                    ← Règles métier pures, aucune dépendance externe
│   │   ├── entities/              ← User, Slot, TestResult, TelnetCommand…
│   │   └── repositories/         ← Interfaces (contrats) : ISlotRepository, IUserRepository…
│   │
│   ├── application/
│   │   └── usecases/              ← Logique métier organisée par domaine fonctionnel
│   │       ├── auth/              ← LoginUseCase, LogoutUseCase
│   │       ├── test/              ← RunTestUseCase, StopTestUseCase, GetResultsUseCase…
│   │       ├── admin/             ← GetAnalyticsUseCase, ManageUsersUseCase…
│   │       ├── slot/              ← CRUD Slots
│   │       ├── poste/             ← CRUD Postes
│   │       ├── produit/           ← CRUD Produits
│   │       ├── reference/         ← CRUD Références
│   │       ├── telnetCommand/     ← CRUD Commandes Telnet
│   │       └── report/            ← Génération et gestion des rapports
│   │
│   ├── infrastructure/            ← Implémentations concrètes des interfaces domain
│   │   ├── database/
│   │   │   ├── models/            ← Schémas Mongoose (UserModel, SlotModel…)
│   │   │   └── repositories/      ← MongoSlotRepository, MongoUserRepository…
│   │   ├── telnet/
│   │   │   ├── TestWorkerManager.js  ← Gère les Worker threads actifs + broadcast WebSocket
│   │   │   └── testWorker.js         ← Worker thread Telnet isolé
│   │   ├── metrics/
│   │   │   └── prometheusMetrics.js  ← Compteurs/histogrammes Prometheus
│   │   └── config/
│   │       └── database.js           ← Connexion MongoDB
│   │
│   ├── interfaces/                ← Adaptateurs vers le monde extérieur
│   │   ├── http/
│   │   │   ├── controllers/       ← Controllers Express (thin, délèguent aux use cases)
│   │   │   ├── routes/            ← Factories de Router Express
│   │   │   └── middlewares/       ← authenticate, requirePermission, requireRole, auditLog…
│   │   └── websocket/
│   │       └── WebSocketServer.js ← Serveur WebSocket (port 3003)
│   │
│   └── main/
│       ├── server.js              ← Point d'entrée : connectDB → buildContainer → listen
│       ├── container.js           ← Injection de dépendances (le seul endroit avec des `new`)
│       └── app.js                 ← Setup Express : middlewares globaux + montage des routes
│
├── Dockerfile
└── package.json
```

---

## Stack technique complète

| Technologie | Rôle | Pourquoi |
|---|---|---|
| **Node.js** | Runtime | I/O non-bloquant, Worker Threads, même langage que le frontend |
| **Express.js** | Framework HTTP | Minimaliste, flexible, standard |
| **MongoDB + Mongoose** | Base de données | Schéma documentaire adapté aux données imbriquées et variables |
| **jsonwebtoken** | Authentification | JWT stateless, pas de session serveur à synchroniser |
| **bcryptjs** | Hashage mots de passe | Standard sécurisé, résistant aux attaques par force brute |
| **ws** | WebSocket | Monitoring temps réel, léger, performant |
| **telnet-client** | Connexions Telnet | Exécution des commandes sur équipements réseau |
| **prom-client** | Métriques | Exposition Prometheus pour Grafana |
| **helmet** | Sécurité HTTP | Headers de sécurité automatiques |
| **express-rate-limit** | Rate limiting | Protection contre les abus API |
| **worker_threads** (Node built-in) | Isolation des tests | Chaque test Telnet dans un thread isolé |

---

## Points d'entrée

| Protocole | Port | Description |
|---|---|---|
| HTTP REST | `3002` | API principale |
| WebSocket | `3003` | Monitoring temps réel des tests |
| Prometheus | `3002/metrics` | Métriques pour Grafana |

---

## Démarrage

```bash
# Installer les dépendances
npm install

# Démarrer en développement (avec hot-reload)
npm run dev

# Démarrer en production
npm start
```

Variables d'environnement requises (`.env`) :

```env
MONGODB_URI=mongodb://localhost:27017/telnet-tests
JWT_SECRET=votre_secret_jwt
PORT=3002
WS_PORT=3003
```

---

## Flux d'exécution d'un test

```
Client HTTP → POST /run-test
    └── authenticate (vérifie JWT)
    └── requirePermission('run_tests')
    └── TestController.runTest()
        └── RunTestUseCase.execute()
            ├── Validation des paramètres
            ├── Récupération du Slot (MongoDB)
            ├── Création du TestResult (status: PENDING)
            └── TestWorkerManager.spawnWorker()
                └── Worker Thread isolé
                    ├── Connexion Telnet
                    ├── Exécution des commandes
                    └── parentPort.postMessage(events)
                        └── MongoDB mis à jour en temps réel
                        └── Broadcast WebSocket vers les clients connectés
```

Pour le détail complet de l'architecture et des flux, voir [ARCHITECTURE.md](ARCHITECTURE.md).
