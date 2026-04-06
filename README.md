# Telnet Test Manager
## Application de gestion et automatisation des tests Telnet — PFE 2026

---

## Présentation

**Telnet Test Manager** est une plateforme web permettant d'exécuter, monitorer et rapporter des tests Telnet réels sur des équipements réseau (routeurs, switchs, passerelles embarquées). Elle offre une interface unifiée pour lancer des commandes individuelles ou des séquences de test sur un ou plusieurs slots simultanément.

L'application est déployée avec une infrastructure **DevOps complète** : Docker, Kubernetes, Helm, Prometheus, Grafana et GitHub Actions CI/CD.

---

## Stack technique

### Application
| Couche | Technologie |
|---|---|
| Frontend | React 18 + TypeScript |
| Backend | Node.js 20 + Express |
| Base de données | MongoDB 7 + Mongoose |
| Authentification | JWT + bcryptjs |
| Sécurité | Helmet.js, CORS, Rate Limiting |
| Temps réel | WebSocket (ws) |
| i18n | react-i18next (FR / EN / PT-BR) |
| Métriques | prom-client (Prometheus) |

### DevOps
| Outil | Rôle |
|---|---|
| Docker | Conteneurisation des services |
| Docker Compose | Orchestration locale (dev + démo) |
| Kubernetes (Minikube) | Orchestration en production |
| Helm | Déploiement K8s paramétrable |
| Prometheus | Collecte de métriques applicatives |
| Grafana | Dashboards de monitoring temps réel |
| GitHub Actions | Pipeline CI/CD automatisée |
| Nginx | Reverse proxy frontend |

---

## Démarrage rapide (Docker Compose)

### Prérequis
- Docker Desktop installé et démarré

### Lancer l'application complète (5 services)

```bash
docker compose up -d
```

### Vérifier que tout tourne

```bash
docker compose ps
```

Résultat attendu :
```
NAME         STATUS    PORTS
mongodb      running   0.0.0.0:27017->27017/tcp
backend      running   0.0.0.0:3002->3002/tcp
frontend     running   0.0.0.0:3000->80/tcp
prometheus   running   0.0.0.0:9090->9090/tcp
grafana      running   0.0.0.0:3001->3000/tcp
```

### URLs

| Service | URL | Credentials |
|---|---|---|
| Application | http://localhost:3000 | selon les comptes |
| API health | http://localhost:3002/health | — |
| Métriques backend | http://localhost:3002/metrics | — |
| Prometheus | http://localhost:9090 | — |
| Grafana | http://localhost:3001 | admin / admin123 |

### Arrêter

```bash
docker compose down
```

---

## Fonctionnalités

### Rôles utilisateurs
| Rôle | Accès |
|---|---|
| **Admin** | Gestion complète : utilisateurs, config, audit, analytics |
| **Ingénieur** | Tests multi-séquences, rapports, configuration |
| **Technicien** | Lancer des tests, voir les résultats |

### Pages principales
- **Login** — Authentification JWT avec design entreprise et cartes de rôles
- **Dashboard** — Lancement de tests Telnet avec suivi en temps réel via WebSocket
- **Multi-test** — Tests séquentiels sur plusieurs équipements simultanément
- **Configuration** — CRUD complet : Postes / Produits / Slots / Références / Commandes
- **Rapports** — Historique des tests avec export PDF
- **Admin** — 5 onglets : Vue d'ensemble, Utilisateurs, Tests, Audit Logs, Analytics
- **Monitoring** — Accès au dashboard Grafana

### Langues supportées
- Français (FR)
- English (EN)
- Português Brasileiro (PT-BR)

---

## Architecture du projet

```
telnet-web-server/
├── backend/                    # API Node.js/Express
│   ├── server.js               # Point d'entrée, routes, métriques Prometheus
│   ├── db.js                   # Modèles Mongoose (User, Poste, Produit, etc.)
│   ├── testWorker.js           # Worker Thread — exécution Telnet isolée
│   ├── seed.js                 # Données initiales MongoDB
│   └── Dockerfile              # Image node:20-alpine
├── frontend/                   # App React/TypeScript
│   ├── src/
│   │   ├── components/         # Composants réutilisables
│   │   ├── pages/              # Pages de l'app
│   │   └── i18n/               # Traductions FR/EN/PT-BR
│   ├── nginx.conf              # Config reverse proxy
│   └── Dockerfile              # Multi-stage build → nginx:alpine
├── k8s/                        # Manifestes Kubernetes bruts
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── mongodb/
│   ├── backend/
│   ├── frontend/
│   └── ingress.yaml
├── helm/telnet-app/            # Chart Helm (déploiement K8s)
│   ├── Chart.yaml
│   ├── values.yaml             # Paramètres configurables
│   └── templates/              # 12 templates K8s
├── monitoring/                 # Config Prometheus + Grafana
│   ├── prometheus.yml          # Targets à scraper (backend:3002/metrics)
│   ├── grafana-datasources.yaml
│   ├── grafana-dashboards.yaml
│   └── grafana-dashboard.json  # Dashboard custom Telnet Test Manager
├── .github/workflows/
│   └── ci-cd.yaml              # Pipeline GitHub Actions (3 jobs)
├── docker-compose.yml          # 5 services : app + monitoring
├── DEVOPS_README.md            # Documentation DevOps complète
└── README.md                   # Ce fichier
```

---

## Pipeline CI/CD

À chaque `git push` sur `main`, GitHub Actions déclenche automatiquement :

```
ci-backend  ──┐
              ├──► deploy + monitoring
ci-frontend ──┘
```

| Job | Étapes |
|---|---|
| **ci-backend** | npm ci → audit sécurité → tests → build image Docker |
| **ci-frontend** | npm ci → audit sécurité → build React → build image Docker |
| **deploy** | Minikube → Helm → healthchecks → Prometheus → Grafana |

**Fonctionnalités pipeline :**
- Audit de sécurité npm (`--audit-level=critical`) — bloque si faille critique
- Rollback automatique Helm si le déploiement échoue
- Healthcheck des 3 services (frontend, backend, mongodb)
- Monitoring (Prometheus + Grafana) dans le même cluster que l'app

---

## API — Endpoints principaux

### Authentification
```
POST   /login                     Connexion, retourne un token JWT
POST   /logout                    Déconnexion + enregistrement temps de session
```

### Configuration
```
GET    /postes                    Liste des postes
GET    /produits?posteId=X        Produits d'un poste
GET    /slots?produitId=X         Slots d'un produit
GET    /references?produitId=X    Références d'un produit
GET    /telnet-commands           Commandes Telnet
```

### Tests
```
POST   /run-test                  Lancer un test
POST   /stop-test                 Arrêter un test
GET    /test-results              Historique des tests
```

### Rapports
```
GET    /reports                   Liste des rapports
POST   /reports/generate          Générer un rapport
DELETE /reports/:id               Supprimer un rapport
```

### Monitoring
```
GET    /health                    État du serveur
GET    /metrics                   Métriques Prometheus
```

### Admin
```
GET    /admin/users               Liste des utilisateurs
POST   /admin/users               Créer un utilisateur
PUT    /admin/users/:id           Modifier un utilisateur
DELETE /admin/users/:id           Supprimer un utilisateur
GET    /admin/audit-logs          Logs d'audit
GET    /admin/analytics           Statistiques
```

---

## Monitoring

Le dashboard Grafana **"Telnet Test Manager - Monitoring"** est chargé **automatiquement** au démarrage grâce au provisioning. Il affiche :

- Statut Backend UP/DOWN (vert/rouge)
- Nombre de tests Telnet lancés en temps réel
- Requêtes HTTP par route et code de statut
- Durée moyenne des réponses (ms)
- RAM et CPU du backend Node.js
- Connexions WebSocket actives

---

## Documentation DevOps

Pour la documentation complète avec explications, justifications et questions jury :

**→ [DEVOPS_README.md](DEVOPS_README.md)**

---

## Versioning

| Version | Description |
|---|---|
| 0.1.0 | Release initiale — Dashboard, Rapports, authentification JWT |
| 0.2.0 | Multi-Test parallèle, Commandes CRUD, séquences de test |
| 0.3.0 | MongoDB, sécurité, rôles, admin dashboard, i18n, DevOps complet |

---

*Telnet Test Manager — PFE 2026*
