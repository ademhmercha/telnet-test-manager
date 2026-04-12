# Architecture — Telnet Test Manager Backend

## Vue d'ensemble

Le backend suit une **Clean Architecture** stricte à 4 couches concentriques.
La règle fondamentale : **les dépendances ne pointent que vers l'intérieur**.

```
┌─────────────────────────────────────────────────────┐
│  Interfaces (HTTP Controllers, Routes, WebSocket)    │
│  ┌───────────────────────────────────────────────┐  │
│  │  Application (Use Cases)                      │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │  Domain (Entités, Interfaces Repos)     │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
│  Infrastructure (MongoDB, Telnet, Prometheus)        │
└─────────────────────────────────────────────────────┘
```

---

## Structure des dossiers

```
backend/
├── src/
│   ├── domain/                       ← Couche 1 : aucune dépendance externe
│   │   ├── entities/                 ← Classes métier pures (User, Slot, TestResult…)
│   │   └── repositories/            ← Contrats (interfaces) des repositories
│   │
│   ├── application/
│   │   └── usecases/                 ← Couche 2 : logique métier, dépend uniquement du domain
│   │       ├── auth/                 ← Login, Logout
│   │       ├── poste/                ← CRUD Postes
│   │       ├── produit/              ← CRUD Produits
│   │       ├── slot/                 ← CRUD Slots
│   │       ├── reference/            ← CRUD Références
│   │       ├── telnetCommand/        ← CRUD Commandes Telnet
│   │       ├── test/                 ← RunTest, StopTest, StopMonitoring, GetResults
│   │       ├── admin/                ← Users, Stats, Analytics, AuditLogs…
│   │       └── report/               ← Génération et gestion des rapports
│   │
│   ├── infrastructure/               ← Couche 4 : implémentations concrètes
│   │   ├── database/
│   │   │   ├── models/               ← Schémas Mongoose (UserModel, SlotModel…)
│   │   │   └── repositories/        ← Implémentations MongoDB des interfaces domain
│   │   ├── telnet/
│   │   │   ├── TestWorkerManager.js  ← Gestion des Worker threads + WebSocket monitoring
│   │   │   └── testWorker.js         ← Worker thread Telnet (exécution des commandes)
│   │   ├── metrics/
│   │   │   └── prometheusMetrics.js  ← Compteurs/histogrammes Prometheus
│   │   └── config/
│   │       └── database.js           ← Connexion MongoDB
│   │
│   ├── interfaces/                   ← Couche 3 : adaptateurs vers le monde extérieur
│   │   ├── http/
│   │   │   ├── controllers/          ← Controllers Express (thin, délèguent aux use cases)
│   │   │   ├── routes/               ← Définition des routes Express
│   │   │   └── middlewares/          ← authenticate, requirePermission, requireRole, auditLog…
│   │   └── websocket/
│   │       └── WebSocketServer.js    ← Serveur WebSocket (port 3003, monitoring temps réel)
│   │
│   └── main/
│       ├── app.js                    ← Setup Express : middlewares globaux + montage des routes
│       ├── container.js              ← Injection de dépendances manuelle (DI)
│       └── server.js                 ← Point d'entrée : connectDB → buildContainer → listen
│
├── server.js     ← Ancien point d'entrée (conservé pour rétrocompatibilité)
├── db.js         ← Anciens modèles Mongoose (conservé)
├── testWorker.js ← Ancien worker (conservé)
├── Dockerfile
└── package.json  ← "main": "src/main/server.js"
```

---

## Description de chaque couche

### 1. Domain (`src/domain/`)

**Règle absolue : aucun import de librairie externe (Express, Mongoose, bcrypt…).**

- **`entities/`** : Classes JavaScript pures représentant les concepts métier.
  Exemple : `User`, `Slot`, `TestResult`, `TelnetCommand`.
  Ces classes ne contiennent pas de logique de persistance — elles décrivent la structure des données.

- **`repositories/`** : Interfaces (contrats) que l'infrastructure doit respecter.
  Exemple : `ISlotRepository` déclare `findById(id)`, `create(data)`, etc.
  Chaque méthode lève `new Error('Not implemented')` si appelée directement.

### 2. Application (`src/application/usecases/`)

**Contient toute la logique métier.** Dépend uniquement du domain (via les interfaces repositories).

Chaque use case est une classe avec :
- Un constructeur qui reçoit ses dépendances (repositories, services) par injection
- Une méthode `execute(params)` qui implémente la règle métier

Exemples clés :
- `LoginUseCase` : vérifie les credentials bcrypt, signe le JWT, crée l'audit log
- `RunTestUseCase` : valide les params, crée le `TestResult`, spawne le worker Telnet, câble les event handlers
- `GetAnalyticsUseCase` : agrège les données de tests, users et commandes pour le dashboard admin

### 3. Infrastructure (`src/infrastructure/`)

**Implémente les interfaces du domain avec des technologies concrètes.**

- **`database/models/`** : Schémas Mongoose identiques à l'ancien `db.js`, séparés en fichiers individuels.

- **`database/repositories/`** : Implémentations MongoDB des interfaces domain.
  Ex : `MongoSlotRepository` implémente `ISlotRepository` via les modèles Mongoose.

- **`telnet/TestWorkerManager.js`** : Service singleton qui :
  - Maintient la `Map` des workers actifs (`testId → Worker`)
  - Maintient la `Map` des clients WebSocket de monitoring (`testId → Set<WebSocket>`)
  - Expose `spawnWorker(testId, data, callbacks)`, `terminateWorker(id)`, `broadcast(testId, event)`

- **`telnet/testWorker.js`** : Worker thread Node.js qui exécute les commandes Telnet.
  S'exécute dans un thread isolé. Communique via `parentPort.postMessage()`.
  Supporte 4 modes : `single`, `builtin_sequence`, `sequence` (dashboard), `monitoring`.

- **`metrics/prometheusMetrics.js`** : Crée et exporte les métriques Prometheus (counters, histograms, gauges).

### 4. Interfaces (`src/interfaces/`)

**Adaptateurs vers le monde extérieur.** Peut dépendre de l'infrastructure.

- **`http/controllers/`** : Controllers Express **sans logique métier**.
  Chaque méthode : extrait les données du `req`, appelle le use case, renvoie le résultat.

- **`http/routes/`** : Factories de Router Express.
  Chaque fichier expose `createXxxRouter(controller, ...middlewares)`.

- **`http/middlewares/`** :
  - `authenticate.js` : vérifie le JWT, hydrate `req.user` depuis MongoDB
  - `requirePermission.js` : vérifie `req.user.permissions`
  - `requireRole.js` : vérifie `req.user.role`
  - `auditLog.js` : middleware fire-and-forget + helper `buildAuditContext(req)`
  - `metricsMiddleware.js` : incrémente les compteurs Prometheus par requête

- **`websocket/WebSocketServer.js`** : Serveur WebSocket (port 3003).
  Authentification JWT à la connexion. Subscribe/unsubscribe au monitoring via `TestWorkerManager`.

### 5. Main (`src/main/`)

- **`server.js`** : Point d'entrée. Charge `.env`, connecte MongoDB, construit le container, démarre HTTP + WebSocket.

- **`container.js`** : **Le seul endroit où des `new` sont utilisés.**
  Instancie dans l'ordre : repositories → services → use cases → controllers → middlewares.
  Retourne un objet avec tous les éléments prêts à l'emploi.

- **`app.js`** : Configure Express : helmet, CORS, JSON parser, rate limiter, métriques, toutes les routes, error handler.

---

## Flux complet : POST /run-test

```
1. Client HTTP → POST /run-test { slotId, posteId, produitId, commandId }

2. app.js
   └── metricsMiddleware (incrémente http_request_duration)
   └── testRoutes.js → authenticate middleware
       └── createAuthenticateMiddleware(userRepo)
           ├── Extrait le JWT de l'Authorization header
           ├── jwt.verify(token, JWT_SECRET)
           └── userRepo.findById(decoded.id) → hydrate req.user
   └── requirePermission('run_tests')
   └── TestController.runTest(req, res)

3. TestController (interfaces/http/controllers/TestController.js)
   ├── Appelle buildAuditContext(req) → { userId, username, method, url, ip, … }
   └── RunTestUseCase.execute(req.body, auditContext)

4. RunTestUseCase (application/usecases/test/RunTestUseCase.js)
   ├── metrics.testsLaunched.inc()
   ├── Validation des paramètres
   ├── slotRepo.findById(slotId) → MongoSlotRepository → SlotModel.findOne()
   ├── telnetCommandRepo.findAll() → MongoTelnetCommandRepository → TelnetCommandModel.find()
   ├── Détermine runMode (single | builtin_sequence | sequence | monitoring)
   ├── auditLogRepo.create({ action: 'RUN_TEST', … })
   ├── testResultRepo.create({ id: testId, status: 'PENDING', steps: […], … })
   └── testWorkerManager.spawnWorker(testId, workerData, {
           onLog:             async (msg) → testResultRepo.pushLog(testId, msg.message)
           onStep:            async (msg) → testResultRepo.updateStep(testId, …)
           onMonitoringEvent: async (msg) → broadcast aux WS + testResultRepo.pushLog()
           onCompleted:       async (msg) → testResultRepo.complete() + finalizePendingSteps()
           onError:           async (msg) → testResultRepo.updateById(…, { status: 'FAIL' })
           onUnexpectedExit:  async ({ code }) → testResultRepo.updateWithFilter(…)
       })

5. TestWorkerManager (infrastructure/telnet/TestWorkerManager.js)
   └── new Worker('./testWorker.js', { workerData })
       Worker thread isolé :
       ├── Connexion Telnet (host: slot.adresse, port: slot.port)
       ├── Authentification SSH (root/root)
       ├── Exécution commandes (send → waitFor '#')
       └── parentPort.postMessage({ type: 'completed', success: true })

6. Les messages du worker → callbacks → MongoDB mis à jour en temps réel

7. TestController ← RunTestUseCase retourne { testId, steps, message }
   └── res.json({ message: 'Test démarré', testId, steps, … })

8. Client WebSocket (port 3003)
   ├── subscribe_monitoring { testId }
   └── Reçoit les événements monitoring en temps réel via TestWorkerManager.broadcast()
```

---

## Flux : Injection de dépendances

```
container.js (buildContainer)
│
├── new MongoUserRepository(UserModel)          ←── UserModel (Mongoose)
├── new MongoSlotRepository(SlotModel)          ←── SlotModel (Mongoose)
├── new MongoTestResultRepository(TestResultModel)
├── …
│
├── new TestWorkerManager('./testWorker.js')
├── createMetrics()  ← Prometheus
│
├── new LoginUseCase(userRepo, auditLogRepo)
├── new RunTestUseCase(testResultRepo, slotRepo, telnetCommandRepo, auditLogRepo, testWorkerManager, metrics)
├── …
│
├── new AuthController(loginUseCase, logoutUseCase)
├── new TestController(runTestUseCase, stopTestUseCase, …)
├── …
│
├── createAuthenticateMiddleware(userRepo)
├── createAuditLogMiddleware(auditLogRepo)
└── createMetricsMiddleware(httpRequestsTotal, httpRequestDuration)
```

**Aucun `new` dans les controllers, use cases ou middlewares** — tout est injecté depuis `container.js`.

---

## Règles de dépendances respectées

| Couche | Peut importer | Ne peut PAS importer |
|--------|---------------|----------------------|
| Domain | — | Express, Mongoose, bcrypt, jwt, toute librairie |
| Application | Domain uniquement | Express, Mongoose, infrastructure |
| Infrastructure | Domain + librairies npm | Application, Interfaces |
| Interfaces | Application + Infrastructure | — |
| Main | Tout | — |

---

## Points d'entrée

| Protocole | Port | Fichier |
|-----------|------|---------|
| HTTP REST | 3002 | `src/main/server.js` |
| WebSocket | 3003 | `src/interfaces/websocket/WebSocketServer.js` |
| Prometheus | 3002/metrics | `src/interfaces/http/routes/healthRoutes.js` |
