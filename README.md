# Telnet Test Manager

Application web de test automatisé sur équipements réseau via Telnet.

---

## Aperçu

**Telnet Test Manager** est une plateforme web permettant d'exécuter, monitorer et rapporter des tests Telnet réels sur des équipements réseau (routeurs, switchs, passerelles embarquées). Elle offre une interface unifiée pour lancer des commandes individuelles ou des séquences de test sur un ou plusieurs slots simultanément.

---

## Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| **Dashboard** | Lancement de tests unitaires ou séquences avec suivi en temps réel |
| **Multi-Test** | Exécution simultanée de N tests sur différents slots du même équipement |
| **Commandes** | CRUD complet des commandes Telnet (single, monitoring, séquence) |
| **Rapports** | Génération, visualisation et export PDF des résultats de tests |
| **Contrôle d'accès** | Authentification JWT avec rôles (admin / testeur / observateur) |

---

## Architecture

```
telnet-test-manager/
├── backend/
│   ├── server.js              # API REST Express + authentification JWT
│   ├── testWorker.js          # Worker Thread — exécution Telnet isolée
│   ├── database.json          # Persistance JSON (postes, produits, slots, résultats)
│   ├── telnetCommands.json    # Catalogue des commandes Telnet
│   └── reports/               # Rapports générés (JSON)
│
└── frontend/
    └── src/
        ├── components/
        │   ├── Dashboard.tsx  # Test unitaire / séquence
        │   ├── MultiTest.tsx  # Tests parallèles multi-slots
        │   ├── Reports.tsx    # Gestion des rapports
        │   └── Commands.tsx   # Gestion des commandes
        ├── services/
        │   └── api.ts         # Client HTTP Axios
        └── hooks/
            └── usePermissions.ts
```

---

## Stack technique

**Backend**
- Node.js + Express
- Worker Threads (isolation par test)
- JWT (authentification)
- Bibliothèque `telnet-client` (connexion Telnet réelle)

**Frontend**
- React 18 + TypeScript
- Axios
- CSS custom properties (design system unifié)

---

## Installation

### Prérequis
- Node.js v16+
- Accès réseau à l'équipement Telnet cible

### 1. Backend

```bash
cd backend
npm install
npm start
```

### 2. Frontend

```bash
cd frontend
npm install
npm start
```

---

## Accès

| URL | Description |
|---|---|
| `http://localhost:3000` | Interface web |
| `http://localhost:3002` | API REST |

**Identifiants par défaut**

| Utilisateur | Mot de passe | Rôle |
|---|---|---|
| `admin` | `admin` | Administrateur |

---

## API — Endpoints principaux

### Authentification
```
POST   /login                          Connexion, retourne un token JWT
```

### Configuration
```
GET    /postes                         Liste des postes
GET    /produits?posteId=X             Produits d'un poste
GET    /slots?produitId=X              Slots d'un produit
```

### Tests
```
POST   /run-test                       Lancer un test (commande unique)
POST   /run-test-sequence              Lancer une séquence de commandes
GET    /test-results/:testId           Résultat d'un test par ID
GET    /test-results                   Historique complet
```

### Commandes Telnet
```
GET    /telnet-commands                Liste des commandes
POST   /telnet-commands                Créer une commande
PUT    /telnet-commands/:id            Modifier une commande
DELETE /telnet-commands/:id            Supprimer une commande (admin)
```

### Rapports
```
GET    /reports                        Liste des rapports
POST   /reports/generate               Générer un rapport
GET    /reports/:id                    Consulter un rapport
DELETE /reports/:id                    Supprimer un rapport
```

---

## Types de commandes

| Type | Description |
|---|---|
| `single` | Commande exécutée une fois, réponse attendue immédiate |
| `monitoring` | Écoute continue du flux Telnet pendant N secondes |
| `sequence` | Ensemble de commandes exécutées dans l'ordre |

---

## Flux d'exécution d'un test

```
Frontend          Backend (server.js)       Worker Thread (testWorker.js)
   │                     │                           │
   │── POST /run-test ──>│                           │
   │                     │── spawn Worker ──────────>│
   │<── { testId } ──────│                           │── connect Telnet
   │                     │                           │── authenticate
   │── GET /test-results/│<─── step events ──────────│── execute command
   │       :testId ──────│                           │── collect response
   │<── { steps, logs } ─│<─── completed ────────────│
```

---

## Dépannage

**Port déjà utilisé**
```bash
npx kill-port 3002
```

**Connexion Telnet échoue**
- Vérifier que l'équipement est joignable : `ping <adresse>`
- Vérifier que le port Telnet est ouvert (par défaut 23)
- Vérifier les identifiants configurés dans `testWorker.js`

**Token expiré**
- Se déconnecter et se reconnecter — le token JWT est valide 24h

---

## Versioning

| Version | Description |
|---|---|
| 0.1.0 | Release initiale — Dashboard, Rapports, authentification JWT |
| 0.2.0 | Multi-Test parallèle, Commandes CRUD, séquences de test |
| 0.3.0 | Logs simplifiés (pc→gw / gw→pc), filtres rapports, modifier commandes |
