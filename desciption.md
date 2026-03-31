# Description Détaillée — Telnet Test Manager

---

## 1. Vue d'ensemble

**Telnet Test Manager** est une application web full-stack développée pour automatiser les tests fonctionnels sur des équipements réseau embarqués (passerelles, routeurs, set-top boxes) via le protocole **Telnet**.

L'objectif est de remplacer les tests manuels (connexion SSH/Telnet, saisie manuelle des commandes, lecture des réponses) par une interface centralisée qui :
- Lance les tests automatiquement
- Compare les réponses aux valeurs attendues
- Enregistre les résultats
- Génère des rapports PDF

L'application a été développée dans le cadre d'un projet de validation matérielle où un PC de test est connecté via Ethernet à un équipement cible qui expose plusieurs interfaces réseau (slots), chacune avec sa propre adresse IP.

---

## 2. Contexte matériel

```
┌─────────────────────────────────┐
│         Équipement cible        │
│                                 │
│  Slot 1 ── 192.168.5.1:23      │
│  Slot 2 ── 192.168.7.1:23      │
│  Slot N ── ...                  │
└──────────────┬──────────────────┘
               │ Câble Ethernet
┌──────────────┴──────────────────┐
│           PC de test            │
│    (Telnet Test Manager)        │
└─────────────────────────────────┘
```

- L'équipement cible possède **plusieurs ports Ethernet** (slots), chacun avec une adresse IP différente
- Le PC de test dispose d'**un seul port Ethernet** (ou plusieurs via adaptateur USB)
- Chaque slot peut être testé indépendamment via une session Telnet dédiée
- L'authentification Telnet est `root` / `root` (accès shell Linux embarqué)

---

## 3. Architecture technique

### 3.1 Vue globale

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│                   React 18 + TypeScript                     │
│                                                             │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐  │
│  │Dashboard │  │MultiTest  │  │Commands  │  │Reports   │  │
│  └──────────┘  └───────────┘  └──────────┘  └──────────┘  │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTP REST (Axios)
                        │ Port 3000 → 3002
┌───────────────────────┴─────────────────────────────────────┐
│                        BACKEND                              │
│                   Node.js + Express                         │
│                   server.js (Port 3002)                     │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Gestion des tests actifs                  │ │
│  │         Map<testId, { worker, result }>                │ │
│  └──────────────────────┬─────────────────────────────────┘ │
│                         │ spawn Worker Thread               │
│  ┌──────────────────────┴─────────────────────────────────┐ │
│  │              testWorker.js                             │ │
│  │    (1 worker isolé par test, s'exécute en parallèle)   │ │
│  └──────────────────────┬─────────────────────────────────┘ │
└─────────────────────────┼───────────────────────────────────┘
                          │ Connexion Telnet réelle
                          │ (bibliothèque telnet-client)
┌─────────────────────────┴───────────────────────────────────┐
│                    Équipement réseau                        │
│              192.168.X.X:23 (shell Linux)                  │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Persistance des données

Toutes les données sont stockées dans des fichiers JSON :

| Fichier | Contenu |
|---|---|
| `backend/database.json` | Postes, produits, slots, résultats des tests, utilisateurs, logs d'audit |
| `backend/telnetCommands.json` | Catalogue des commandes Telnet (single, monitoring, séquence) |
| `backend/reports/*.json` | Un fichier par rapport généré |

---

## 4. Comment fonctionne Telnet ici

### 4.1 Le protocole Telnet

Telnet est un protocole réseau qui permet d'ouvrir une **session shell à distance** sur un équipement. Dans ce projet, l'équipement cible expose un shell Linux sur le port 23 de chaque slot.

Une session Telnet fonctionne comme un terminal SSH mais **sans chiffrement** :
1. Le client (PC) se connecte à `IP:23`
2. L'équipement demande `login:` puis `Password:`
3. Le client s'authentifie (`root` / `root`)
4. Un shell Linux est disponible : on peut taper des commandes et lire les réponses

### 4.2 La bibliothèque utilisée

Le backend utilise la bibliothèque npm **`telnet-client`** qui gère :
- La négociation Telnet (options IAC)
- La détection du prompt shell (`#`)
- La détection des prompts d'authentification (`login:`, `Password:`)
- L'envoi de commandes et la récupération des réponses

### 4.3 Configuration de connexion (dans testWorker.js)

```javascript
const connectionParams = {
  host: slot.adresse,        // ex: 192.168.5.1
  port: slot.port,           // ex: 23
  timeout: 15000,
  shellPrompt: /#\s*$/,      // détecte le prompt "root@host:~# "
  loginPrompt: /login:\s*$/, // détecte "f5686b login:"
  passwordPrompt: /Password:\s*$/,
  username: 'root',
  password: 'root',
  negotiationMandatory: true,
  stripControls: true,       // supprime les caractères de contrôle
  echoLines: 0               // ne pas répéter la commande envoyée
};
```

---

## 5. Comment fonctionne un test

### 5.1 Flux complet d'un test unitaire

```
Utilisateur          Frontend              Backend              Worker              Équipement
    │                    │                    │                    │                    │
    │── clique "Lancer" ─>│                    │                    │                    │
    │                    │── POST /run-test ──>│                    │                    │
    │                    │                    │── spawn Worker ────>│                    │
    │                    │<── { testId: 42 } ──│                    │                    │
    │                    │                    │                    │── connect() ───────>│
    │                    │                    │                    │<── login prompt ────│
    │                    │                    │                    │── "root\n" ────────>│
    │                    │                    │                    │<── password prompt ─│
    │                    │                    │                    │── "root\n" ────────>│
    │                    │                    │                    │<── shell prompt # ──│
    │                    │                    │                    │── "uptime\n" ──────>│
    │                    │                    │                    │<── réponse texte ───│
    │                    │                    │<── step events ────│                    │
    │                    │── GET /test-results/│                    │                    │
    │                    │       42 (polling) ─│                    │                    │
    │<── mise à jour UI ──│<── { steps, logs }─│                    │                    │
    │                    │                    │<── completed ───────│                    │
    │                    │── GET /test-results/│                    │                    │
    │<── résultat final ──│       42 ──────────│                    │                    │
```

### 5.2 Les étapes systématiques de chaque test

Chaque test passe toujours par ces étapes, visibles dans l'interface :

| Étape | Description |
|---|---|
| **Étape 1** | Initialisation de la connexion (paramètres validés) |
| **Étape 2** | Connexion Telnet + authentification shell |
| **Étape 3** | Exécution de la commande ou séquence |

### 5.3 Évaluation du résultat

Après exécution d'une commande, le worker analyse la réponse :

- **Sans `expectedResponse`** : le test passe si la commande s'exécute sans erreur détectée
- **Avec `expectedResponse`** : le test passe si la réponse contient la sous-chaîne attendue (ex: `"USB:P1:2:OK"`)
- **Détection automatique des erreurs** : si la réponse contient `command not found`, `no such file`, `fatal:`, etc. → le test échoue automatiquement

---

## 6. Types de commandes Telnet

### 6.1 Single (commande unique)

Envoie une commande, attend la réponse jusqu'au prochain prompt `#`, compare à `expectedResponse` si défini.

```
(pc→gw): uptime
(gw→pc):  12:34:56 up 2 days, 3:21,  1 user,  load average: 0.01, 0.02, 0.00
```

Exemples : `uptime`, `help`, `scos-storage -b usb test -p P1`

### 6.2 Monitoring (écoute continue)

Envoie une commande qui génère un flux continu d'événements (mode streaming). Le worker écoute le flux pendant **N secondes** (défaut : 15s) et collecte les événements.

```
(pc→gw): scos-keys monitor
(gw→pc): KEY_WLAN:PRESSED
(gw→pc): KEY_WLAN:RELEASED
(gw→pc): KEY_WPS_BUTTON:PRESSED
```

Si `expectedEvents` est défini (ex: `["KEY_WLAN:PRESSED"]`), le test échoue si l'événement n'est pas reçu pendant la durée.

### 6.3 Séquence (multi-commandes)

Exécute une liste ordonnée de commandes, chaque commande pouvant être `single` ou `monitoring`. Le résultat global est `SUCCESS` si toutes les étapes passent.

---

## 7. Worker Thread — Isolation des tests

Chaque test est exécuté dans un **Worker Thread Node.js** séparé, ce qui garantit :
- **Isolation** : les logs, la connexion Telnet et l'état de chaque test sont totalement indépendants
- **Parallélisme** : plusieurs tests peuvent tourner en même temps sans bloquer le serveur
- **Sécurité** : un crash d'un test n'affecte pas les autres

Le backend maintient une `Map<testId, { worker, result }>` pour suivre tous les tests actifs simultanément.

```javascript
// server.js — création d'un worker par test
const worker = new Worker('./testWorker.js', { workerData: { testId, slotId, ... } });
activeTests.set(testId, { worker, result: { status: 'PENDING', steps: [], logs: [] } });

// Le worker envoie des messages au serveur en temps réel
worker.on('message', (msg) => {
  if (msg.type === 'log')       result.logs.push(msg.message);
  if (msg.type === 'step')      result.steps[msg.stepIndex].status = msg.status;
  if (msg.type === 'completed') result.status = msg.success ? 'SUCCESS' : 'FAIL';
});
```

---

## 8. Multi-Test — Tests parallèles

La page **Multi-Test** permet de lancer **N tests simultanément** sur différents slots du même équipement.

### Fonctionnement

```javascript
// Frontend — Promise.all pour lancer tous les tests en même temps
const results = await Promise.all(
  testConfigs.map(c =>
    c.isSeqMode
      ? testService.runTestSequence(c.slot, c.poste, c.produit, c.sequence)
      : testService.runTest(c.slot, c.poste, c.produit, c.command)
  )
);
```

- Chaque test reçoit son propre `testId`
- Un seul intervalle de polling côté frontend récupère les N résultats en parallèle
- Les logs de chaque test restent **strictement séparés** — pas de mélange

### Limites matérielles

Le Multi-Test nécessite **une connexion Ethernet par slot** testé en parallèle. Si le PC de test n'a qu'un seul port Ethernet, les tests simultanés sur des slots différents nécessitent un switch réseau ou un adaptateur USB-Ethernet.

---

## 9. Système de permissions (rôles)

| Rôle | Lire | Lancer tests | Écrire | Admin |
|---|---|---|---|---|
| `admin` | ✔ | ✔ | ✔ | ✔ |
| `testeur` | ✔ | ✔ | ✗ | ✗ |
| `observateur` | ✔ | ✗ | ✗ | ✗ |

- L'authentification utilise des tokens **JWT** (valides 24h)
- Le token est stocké dans `sessionStorage` côté frontend
- Chaque endpoint backend vérifie le token et le rôle avant d'exécuter

---

## 10. Rapports

Un rapport est généré à la demande pour un slot + une période donnée. Il agrège tous les tests correspondants et calcule :
- Nombre total de tests
- Nombre de succès / échecs
- Taux de réussite (%)
- Logs détaillés de chaque test au format `(pc→gw)` / `(gw→pc)`

Il est possible de filtrer les tests inclus dans le rapport :
- **Tous les tests**
- **Pass seulement** (status = SUCCESS)
- **Fail seulement** (status = FAIL)

Le rapport peut être exporté en **PDF** via l'impression navigateur (window.print).

---

## 11. Structure hiérarchique des données

```
Poste (ex: "Poste Lab 1")
└── Produit (ex: "Gateway F5686B")
    ├── Slot 1 (192.168.5.1:23)
    ├── Slot 2 (192.168.7.1:23)
    └── Slot N (...)
```

- Un **Poste** représente un banc de test physique
- Un **Produit** représente le modèle d'équipement testé
- Un **Slot** représente une interface réseau de l'équipement avec son IP et port Telnet

Cette hiérarchie permet de retrouver facilement l'historique des tests par équipement et par interface.

---

## 12. Valeur ajoutée du projet

| Avant | Après |
|---|---|
| Connexion Telnet manuelle à chaque test | Tests lancés en 1 clic depuis le navigateur |
| Lecture et interprétation manuelle des réponses | Comparaison automatique avec la réponse attendue |
| Aucun historique | Tous les résultats sauvegardés avec horodatage |
| Tests séquentiels uniquement | N tests en parallèle sur différents slots |
| Aucun rapport | Rapports PDF filtrables par date et statut |
| Accès sans contrôle | Système de rôles (admin / testeur / observateur) |

---

*Telnet Test Manager — v0.3.0*
