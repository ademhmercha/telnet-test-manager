# DevOps — Telnet Test Manager
## Documentation complète — Présentation jury PFE

---

## Table des matières

1. [Vue d'ensemble de l'architecture](#1-vue-densemble-de-larchitecture)
2. [Conteneurisation avec Docker](#2-conteneurisation-avec-docker)
3. [Orchestration avec Kubernetes](#3-orchestration-avec-kubernetes)
4. [Déploiement avec Helm](#4-déploiement-avec-helm)
5. [Monitoring avec Prometheus et Grafana](#5-monitoring-avec-prometheus-et-grafana)
6. [Pipeline CI/CD avec GitHub Actions](#6-pipeline-cicd-avec-github-actions)
7. [Comment tester — Scénario jury](#7-comment-tester--scénario-jury)
8. [Questions fréquentes jury](#8-questions-fréquentes-jury)

---

## 1. Vue d'ensemble de l'architecture

### Schéma global

```
Développeur
    │
    │  git push
    ▼
GitHub (code source)
    │
    │  déclenche automatiquement
    ▼
GitHub Actions (CI/CD Pipeline)
    │
    ├── [1] ci-backend  → runner GitHub cloud (ubuntu-latest)
    │       installe deps, audit sécurité, build image Docker
    │
    ├── [2] ci-frontend → runner GitHub cloud (ubuntu-latest)
    │       installe deps, audit sécurité, build React, build image Docker
    │
    │   (si les 2 jobs CI réussissent → seulement sur main)
    │
    └── [3] deploy → runner self-hosted (machine locale Windows)
                │   Minikube déjà en cours d'exécution
                │   helm upgrade --install (déploiement RÉEL et PERSISTANT)
                ▼
        Kubernetes — Namespace: telnet-app
                │
   ┌────────────┼────────────┐
   ▼            ▼            ▼
MongoDB       Backend     Frontend
(mongo:7)  (Node.js)   (React+Nginx)
Port 27017  Port 3002    Port 80
PVC: 2Gi    PVC: 1Gi   replicas: 1
replicas:1  replicas: 2
                │
         expose /metrics
                │
        Kubernetes — Namespace: monitoring
                │
       ┌────────┴────────┐
       ▼                 ▼
  Prometheus          Grafana
  Port 9090           Port 3001
```

### Services exposés

| Service | URL locale | Description |
|---|---|---|
| Application | http://localhost:3000 | Interface React |
| Backend API | http://localhost:3002 | API REST Node.js |
| Métriques | http://localhost:3002/metrics | Endpoint Prometheus |
| Prometheus | http://localhost:9090 | Collecte métriques |
| Grafana | http://localhost:3001 | Dashboards visuels |

### Stack technologique

| Couche | Technologie | Version |
|---|---|---|
| Frontend | React + TypeScript | 18 |
| Backend | Node.js + Express | 20 |
| Base de données | MongoDB | 7 |
| Conteneurs | Docker | 29 |
| Orchestration | Kubernetes (Minikube) | 1.35 |
| Package K8s | Helm | 4.1 |
| Métriques | Prometheus | latest |
| Dashboards | Grafana | latest |
| CI/CD | GitHub Actions | — |
| Self-hosted Runner | GitHub Actions Runner | Déploiement réel persistant sur Minikube local |

---

## 2. Conteneurisation avec Docker

### Qu'est-ce que Docker ?

Docker permet d'emballer une application avec **toutes ses dépendances** dans un conteneur isolé et portable. L'application fonctionne de façon identique sur n'importe quelle machine : PC de dev, serveur de prod, pipeline CI/CD.

**Analogie** : un conteneur Docker c'est comme une boîte hermétique qui contient l'application et tout ce dont elle a besoin. Tu déplaces la boîte, l'application fonctionne exactement pareil.

**Problème résolu** : "ça marche sur ma machine mais pas sur la tienne" — Docker élimine ce problème.

---

### Dockerfile Backend (`backend/Dockerfile`)

```dockerfile
FROM node:20-alpine        # image légère Alpine (~150MB vs ~1GB pour node:20)
WORKDIR /app
COPY package*.json ./      # copier d'abord pour profiter du cache Docker
RUN npm ci --only=production  # seulement les dépendances de production
COPY . .
EXPOSE 3002
CMD ["node", "server.js"]
```

**Justifications :**
- `node:20-alpine` : Alpine Linux est minimaliste (~5MB), image finale ~150MB au lieu de ~1GB
- `npm ci` : plus rapide et reproductible que `npm install`, respecte exactement `package-lock.json`
- `--only=production` : exclut les devDependencies (nodemon, etc.) → image plus petite et sécurisée
- L'ordre des instructions exploite le **cache Docker** : les dépendances ne se réinstallent que si `package.json` change

---

### Dockerfile Frontend (`frontend/Dockerfile`) — Multi-stage build

```dockerfile
# ÉTAPE 1 : construction (builder)
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build       # compile React → HTML/CSS/JS statiques

# ÉTAPE 2 : production
FROM nginx:alpine       # serveur web ultra-léger
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Pourquoi le multi-stage build ?**
- Étape 1 (builder) : utilise Node.js pour compiler le code React
- Étape 2 : ne contient **que** les fichiers compilés + Nginx
- Résultat : image finale ~25MB au lieu de ~500MB
- Le code source et les outils de build **ne sont pas** dans l'image de production → sécurité

---

### Nginx (`frontend/nginx.conf`)

Nginx joue le rôle de **reverse proxy** :
- Sert les fichiers statiques React
- Redirige `/api/*` vers le backend sur le port 3002
- Gère le cache long (1 an) pour les assets
- Ajoute des headers de sécurité (X-Frame-Options, X-Content-Type-Options)

```nginx
location /api/ {
    proxy_pass http://backend:3002/;  # backend = nom du service Docker
}
```

---

### Docker Compose (`docker-compose.yml`)

Une seule commande pour démarrer toute l'infrastructure :

```bash
docker compose up -d
```

**5 services démarrés automatiquement :**

| Service | Image | Port | Rôle |
|---|---|---|---|
| mongodb | mongo:7 | 27017 | Base de données |
| backend | build local | 3002 | API REST + /metrics |
| frontend | build local | 3000 | Interface web |
| prometheus | prom/prometheus | 9090 | Collecte métriques |
| grafana | grafana/grafana | 3001 | Dashboards |

**Réseau Docker** : tous les services sont sur le même réseau `telnet-network`. Ils communiquent par leur nom de service (ex: backend → `mongodb:27017`).

**Volumes persistants** : les données MongoDB et Grafana survivent aux redémarrages des conteneurs.

**Provisioning automatique** : Prometheus et Grafana sont préconfigurés au démarrage via des fichiers montés en volumes :
- `monitoring/prometheus.yml` → targets à scraper
- `monitoring/grafana-datasources.yaml` → connexion Prometheus automatique
- `monitoring/grafana-dashboards.yaml` → chargement automatique du dashboard
- `monitoring/grafana-dashboard.json` → dashboard custom Telnet Test Manager

---

## 3. Orchestration avec Kubernetes

### Qu'est-ce que Kubernetes ?

Kubernetes (K8s) est un système d'**orchestration de conteneurs**. Là où Docker fait tourner des conteneurs sur une machine, Kubernetes les gère à grande échelle : démarrage automatique, redémarrage en cas de crash, load balancing, scaling.

**Analogie** : Docker c'est un camion de livraison. Kubernetes c'est le système logistique complet qui gère des milliers de camions — remplace un camion en panne, répartit la charge, garantit les livraisons.

**Pourquoi Kubernetes dans ce projet ?**
- **Haute disponibilité** : si un pod backend crash → K8s en redémarre un autre automatiquement
- **Scaling** : passer de 2 à 10 replicas backend en une commande
- **Rolling update** : mise à jour sans interruption de service
- **Gestion déclarative** : on décrit l'état souhaité, K8s s'assure que l'état réel correspond

---

### Minikube

Minikube est une version locale de Kubernetes qui tourne dans un conteneur Docker. Il simule un vrai cluster K8s sur ta machine sans avoir besoin de serveurs cloud.

```
Machine Windows
    └── Docker Desktop
            └── Minikube (conteneur Docker)
                    └── Kubernetes cluster
                            ├── Namespace: telnet-app
                            │       ├── Pod backend  (x2)
                            │       ├── Pod frontend (x1)
                            │       └── Pod mongodb  (x1)
                            └── Namespace: monitoring
                                    ├── Pod prometheus
                                    └── Pod grafana
```

---

### Concepts Kubernetes utilisés

#### Namespace
Espace de noms qui isole les ressources. `telnet-app` pour l'application, `monitoring` pour la supervision. Comme des dossiers séparés dans le cluster.

#### Pod
La plus petite unité Kubernetes. Contient un ou plusieurs conteneurs. Un Pod backend = un conteneur Node.js qui tourne.

#### Deployment
Gère un groupe de Pods identiques. Assure qu'il y a toujours le bon nombre de replicas.

```yaml
replicas: 2   # K8s maintient toujours 2 Pods backend en vie
```

Si un Pod crash → K8s en crée un nouveau automatiquement.

#### Service
Expose les Pods sur le réseau avec une IP stable. Les Pods ont des IPs qui changent, le Service a une IP fixe → load balancing automatique entre les replicas.

#### PersistentVolumeClaim (PVC)
Réserve de l'espace disque persistant. MongoDB utilise 2Gi, backend 1Gi pour les rapports. Les données survivent aux redémarrages de Pods.

#### ConfigMap & Secret
- **ConfigMap** : variables non sensibles (NODE_ENV, PORT, MONGODB_HOST)
- **Secret** : données sensibles encodées en base64 (JWT_SECRET, mots de passe MongoDB)

#### Ingress
Point d'entrée unique. Route le trafic selon l'URL :
```
http://telnet-app.local/      → Service frontend (port 80)
http://telnet-app.local/api/  → Service backend  (port 3002)
```

#### InitContainer
Conteneur qui s'exécute **avant** le conteneur principal. Le backend attend que MongoDB soit prêt :

```yaml
initContainers:
  - name: wait-for-mongodb
    image: busybox
    command: ['sh', '-c', 'until nc -z mongodb-service 27017; do sleep 2; done']
```

#### Health Checks (Probes)
- **livenessProbe** : K8s vérifie si le conteneur est vivant. S'il ne répond pas → redémarrage automatique.
- **readinessProbe** : K8s vérifie si le conteneur est prêt à recevoir du trafic.

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3002
  initialDelaySeconds: 30
  periodSeconds: 10
```

---

### Structure des fichiers K8s

```
k8s/
├── namespace.yaml
├── configmap.yaml
├── secret.yaml
├── mongodb/
│   ├── pvc.yaml            → Stockage 2Gi
│   ├── deployment.yaml
│   └── service.yaml        → ClusterIP port 27017
├── backend/
│   ├── pvc.yaml            → Stockage rapports 1Gi
│   ├── deployment.yaml     → 2 replicas, initContainer, probes
│   └── service.yaml        → ClusterIP port 3002
├── frontend/
│   ├── deployment.yaml     → 1 replica
│   └── service.yaml        → ClusterIP port 80
└── ingress.yaml            → Routing HTTP telnet-app.local
```

---

## 4. Déploiement avec Helm

### Qu'est-ce que Helm ?

Helm est le **gestionnaire de paquets** pour Kubernetes. Au lieu de maintenir des dizaines de fichiers YAML manuellement, Helm utilise des templates paramétrables.

**Analogie** : Helm c'est comme `npm` pour Node.js — il gère les dépendances, les versions, et simplifie le déploiement.

**Problème résolu** : pour déployer en dev (1 replica) et en prod (5 replicas), sans Helm on maintient 2 copies de chaque fichier YAML. Avec Helm, on change juste les valeurs.

---

### Structure du chart Helm

```
helm/telnet-app/
├── Chart.yaml          → métadonnées (nom: telnet-app, version: 0.3.0)
├── values.yaml         → toutes les valeurs paramétrables
└── templates/          → 12 templates (configmap, secret, mongodb, backend, frontend, ingress)
```

### Valeurs paramétrables (`values.yaml`)

```yaml
replicaCount:
  backend: 2      # changer à 5 pour scaler en prod
  frontend: 1

resources:
  backend:
    requests:
      memory: "128Mi"
      cpu: "100m"
    limits:
      memory: "256Mi"
      cpu: "300m"
```

### Commande de déploiement

```bash
helm upgrade --install telnet-app ./helm/telnet-app \
  --create-namespace \
  --namespace telnet-app \
  --timeout 300s
```

- `upgrade --install` : met à jour si existe, installe sinon (idempotent)
- `--create-namespace` : crée le namespace automatiquement
- `--timeout 300s` : attend 5 minutes max

### Scaler à la demande

```bash
helm upgrade telnet-app ./helm/telnet-app \
  --set replicaCount.backend=5
```

---

## 5. Monitoring avec Prometheus et Grafana

### Pourquoi le monitoring ?

Sans monitoring : on découvre les problèmes quand l'utilisateur se plaint.
Avec monitoring : on voit les problèmes **avant** qu'ils impactent les utilisateurs.

---

### Architecture monitoring

```
Backend Node.js
    │  expose GET /metrics (format Prometheus)
    ▼
Prometheus
    │  scrape /metrics toutes les 15 secondes
    │  stocke en séries temporelles
    ▼
Grafana
    │  requête PromQL
    │  affiche les graphes en temps réel
    ▼
Dashboard "Telnet Test Manager - Monitoring"
```

---

### Endpoint `/metrics` du backend

Implémenté avec `prom-client` — bibliothèque officielle Prometheus pour Node.js.

**Métriques custom exposées :**

| Métrique | Type | Description |
|---|---|---|
| `http_requests_total` | Counter | Requêtes par route/méthode/status |
| `http_request_duration_seconds` | Histogram | Durée des requêtes |
| `telnet_tests_launched_total` | Counter | Tests Telnet lancés |
| `websocket_active_connections` | Gauge | Connexions WebSocket actives |

**Métriques Node.js automatiques :** CPU, RAM, heap, event loop lag, garbage collector.

---

### Prometheus (`monitoring/prometheus.yml`)

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['prometheus:9090']

  - job_name: 'backend'
    static_configs:
      - targets: ['backend:3002']
    metrics_path: '/metrics'
```

---

### Grafana — Provisioning automatique

Le dashboard et la datasource sont chargés **automatiquement** au démarrage de Docker Compose via des fichiers de configuration montés en volumes. Aucune action manuelle nécessaire.

**Dashboard "Telnet Test Manager - Monitoring" contient :**
- Statut Backend UP/DOWN
- Compteur Tests Telnet lancés (monte à chaque test)
- Total requêtes HTTP backend
- RAM backend en temps réel
- Graphe requêtes HTTP par route
- Durée moyenne des réponses (ms)
- Historique RAM
- Connexions WebSocket actives

**Accès** : http://localhost:3001 — `admin` / `admin123`

---

## 6. Pipeline CI/CD avec GitHub Actions

### Qu'est-ce que CI/CD ?

- **CI (Continuous Integration)** : à chaque `git push`, le code est automatiquement testé et les images Docker construites
- **CD (Continuous Deployment)** : si les tests passent, le code est déployé automatiquement sur l'environnement cible

**But** : détecter les erreurs tôt et déployer de façon fiable, répétable, sans intervention humaine.

---

### Self-hosted Runner — clé du déploiement réel

#### Qu'est-ce qu'un self-hosted runner ?

GitHub Actions propose deux types de runners (machines qui exécutent les jobs) :

| Type | Où ça tourne | Persistance | Usage |
|---|---|---|---|
| **GitHub-hosted** (`ubuntu-latest`) | Serveur cloud GitHub temporaire | Éphémère — détruit après le job | CI (build, test, audit) |
| **Self-hosted** (`self-hosted`) | **Ta propre machine** | Persistant — ta machine reste allumée | CD (déploiement réel) |

#### Pourquoi le self-hosted runner est indispensable ici ?

Sans self-hosted runner, le job `deploy` tourne sur un serveur GitHub temporaire qui :
- Lance un Minikube éphémère
- Déploie l'app dessus
- S'arrête → **tout disparaît**

Avec un self-hosted runner installé sur ta machine Windows :
- Le job `deploy` s'exécute **sur ta machine**
- Minikube est déjà en cours d'exécution sur ta machine
- `helm upgrade --install` déploie dans **ton Minikube local**
- Quand le job finit → **l'app reste déployée** et accessible

```
git push origin main
        │
        ▼
GitHub détecte le push
        │
        ├── [Job 1] ci-backend  → serveur GitHub cloud (ubuntu-latest)
        │   ├── npm ci
        │   ├── npm audit --audit-level=critical   ← bloque si faille critique
        │   ├── npm test --if-present
        │   └── docker build
        │
        ├── [Job 2] ci-frontend → serveur GitHub cloud (ubuntu-latest)
        │   ├── npm ci
        │   ├── npm audit --audit-level=critical   ← bloque si faille critique
        │   ├── npm run build
        │   └── docker build
        │
        │   (si les 2 jobs CI réussissent ET branche = main)
        │
        ▼
        [Job 3] deploy → self-hosted runner (ta machine Windows)
        ├── eval $(minikube docker-env)    ← contexte Minikube local
        ├── docker build telnet-backend    ← image dans Minikube
        ├── docker build telnet-frontend   ← image dans Minikube
        ├── helm upgrade --install telnet-app   ← déploiement RÉEL persistant
        ├── rollback automatique si échec
        ├── helm install prometheus + grafana
        ├── kubectl wait (pods ready)
        └── kubectl get pods + summary
```

#### Comment installer le self-hosted runner (une seule fois)

1. Aller sur GitHub → ton repo → **Settings → Actions → Runners → New self-hosted runner**
2. Choisir **Windows**
3. Suivre les commandes affichées (télécharger, configurer, démarrer) :

```powershell
# Dans PowerShell sur ta machine Windows
mkdir actions-runner; cd actions-runner

# Télécharger le runner (URL fournie par GitHub)
Invoke-WebRequest -Uri https://github.com/actions/runner/releases/download/v2.x.x/actions-runner-win-x64-2.x.x.zip -OutFile actions-runner-win-x64.zip

# Extraire
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory("$PWD/actions-runner-win-x64.zip", "$PWD")

# Configurer avec ton token GitHub (affiché sur la page GitHub)
./config.cmd --url https://github.com/TON-USER/TON-REPO --token TON_TOKEN

# Installer comme service Windows (démarre automatiquement)
./svc.cmd install
./svc.cmd start
```

4. Vérifier que le runner apparaît **Online** dans GitHub → Settings → Runners

Une fois installé, le runner démarre automatiquement avec Windows et écoute en permanence les jobs GitHub Actions.

---

### Déclencheurs

```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
```

---

### Points clés de la pipeline

**Jobs CI sur runners cloud** — isolation propre, pas de pollution entre runs :
```yaml
ci-backend:
  runs-on: ubuntu-latest   # serveur GitHub temporaire → OK pour CI
```

**Job deploy sur self-hosted** — accès à Minikube local, déploiement persistant :
```yaml
deploy:
  runs-on: self-hosted     # ta machine → Minikube déjà là, déploiement réel
```

**Cache npm** — évite de retélécharger les dépendances à chaque run :
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '18'
    cache: 'npm'
```

**CI=false pour React** — empêche ESLint de bloquer le build :
```yaml
- run: cd frontend && npm run build
  env:
    CI: false
```

**Séquençage des jobs** :
```yaml
deploy:
  needs: [ci-backend, ci-frontend]  # attend que les 2 CI passent
  if: github.ref == 'refs/heads/main'  # seulement sur main
```

**Rollback automatique** — si le deploy Helm échoue, retour à la version précédente :
```yaml
- name: Rollback on failure
  if: failure() && steps.deploy.conclusion == 'failure'
  run: helm rollback telnet-app 0 --namespace telnet-app || echo "No previous version."
```

**Audit de sécurité** — bloque si faille critique dans les dépendances :
```yaml
- run: npm audit --audit-level=critical
```

**Healthcheck des services** après deploy :
```yaml
kubectl wait --for=condition=available deployment/backend  -n telnet-app --timeout=240s
kubectl wait --for=condition=available deployment/frontend -n telnet-app --timeout=180s
kubectl wait --for=condition=available deployment/mongodb  -n telnet-app --timeout=180s
```

---

### Résultat d'une pipeline réussie

```
✅ ci-backend   (~1 min)   — audit sécurité + build image   [GitHub cloud]
✅ ci-frontend  (~2 min)   — audit sécurité + build React   [GitHub cloud]
✅ deploy       (~5 min)   — Helm + Minikube local + monitoring persistant   [self-hosted]
──────────────────────────────────────────────────────────────────────────
Total : ~5-8 minutes
```

À chaque push sur `main` : code testé, images buildées, app déployée sur Minikube, monitoring installé. **Zéro intervention manuelle. Déploiement persistant.**

---

## 7. Comment tester — Scénario jury

### Lancer l'infrastructure

```bash
docker compose up -d
docker compose ps
```

Résultat attendu — 5 conteneurs **running** :
```
NAME         STATUS    PORTS
mongodb      running   0.0.0.0:27017->27017/tcp
backend      running   0.0.0.0:3002->3002/tcp
frontend     running   0.0.0.0:3000->80/tcp
prometheus   running   0.0.0.0:9090->9090/tcp
grafana      running   0.0.0.0:3001->3000/tcp
```

---

### URLs à montrer à la jury

| Ce que tu montres | URL | Credentials |
|---|---|---|
| Application | http://localhost:3000 | selon les comptes |
| API health | http://localhost:3002/health | — |
| Métriques backend | http://localhost:3002/metrics | — |
| Prometheus targets | http://localhost:9090/targets | — |
| Grafana dashboard | http://localhost:3001 | admin / admin123 |

---

### Ordre de démonstration (10 min)

**1. Architecture (2 min)**
- Montre le schéma dans ce README
- "5 services démarrent avec une seule commande"

**2. Docker Compose (1 min)**
- Lance `docker compose up -d` en direct
- Montre `docker compose ps` → 5 conteneurs UP

**3. Application (2 min)**
- http://localhost:3000 → connexion → lancer un test Telnet

**4. Métriques backend (1 min)**
- http://localhost:3002/metrics → métriques en format texte Prometheus
- "C'est ce format que Prometheus collecte automatiquement toutes les 15 secondes"

**5. Prometheus (1 min)**
- http://localhost:9090/targets → backend UP + prometheus UP
- Tape `telnet_tests_launched_total` → Execute → voir le compteur

**6. Grafana (2 min)**
- http://localhost:3001 → dashboard chargé automatiquement
- Montre Backend UP, RAM, Requêtes HTTP
- Lance un test dans l'app → retour Grafana → le compteur monte en direct

**7. CI/CD (1 min)**
- GitHub → Actions → 4 jobs verts ✅
- "À chaque push, tout est automatisé sans intervention humaine"

---

### Arrêter l'infrastructure

```bash
docker compose down
```

---

## 8. Questions fréquentes jury

**Q : Pourquoi un self-hosted runner et pas un runner GitHub standard ?**

R : Les runners GitHub standard (`ubuntu-latest`) sont des machines cloud temporaires — elles sont détruites dès que le job se termine. Pour le job `deploy`, on a besoin d'accéder à Minikube qui tourne sur notre machine locale. Un self-hosted runner est un agent GitHub Actions installé sur notre propre machine Windows. Quand GitHub déclenche le job `deploy`, il s'exécute directement sur notre machine où Minikube est déjà en cours d'exécution — le déploiement Helm est donc réel et persistant, pas éphémère.

---

**Q : Pourquoi Docker et pas déployer directement sur le serveur ?**

R : Docker garantit que l'application fonctionne identiquement partout. Sans Docker, on peut avoir des problèmes de versions Node.js différentes, de dépendances manquantes, de configuration différente entre les environnements. Docker élimine ces problèmes — une image buildée une fois fonctionne partout.

---

**Q : Quelle est la différence entre Docker et Kubernetes ?**

R : Docker fait tourner des conteneurs sur une seule machine. Kubernetes orchestre des conteneurs sur plusieurs machines. Kubernetes ajoute la haute disponibilité, le scaling automatique, et la gestion des pannes. Dans ce projet, on utilise les deux : Docker pour construire les images, Kubernetes pour les déployer et les gérer.

---

**Q : Pourquoi Helm plutôt que des fichiers YAML Kubernetes directement ?**

R : Helm permet de paramétrer les déploiements. Pour déployer en prod avec 5 replicas et en dev avec 1, avec Helm on change juste une valeur dans `values.yaml`. Sans Helm, on maintient plusieurs copies des fichiers YAML ce qui est source d'erreurs.

---

**Q : Comment fonctionne la CI/CD ?**

R : À chaque `git push`, GitHub Actions déclenche la pipeline automatiquement. Elle teste le code, construit les images Docker, déploie sur Kubernetes et installe le monitoring. Si un test échoue, le déploiement est bloqué. Ça garantit que seul du code fonctionnel arrive en production.

---

**Q : Que se passe-t-il si le backend tombe ?**

R : Kubernetes détecte que le Pod ne répond plus via la `livenessProbe` sur l'endpoint `/health`. Il redémarre automatiquement le Pod. Comme on a 2 replicas backend, l'autre Pod continue à servir les requêtes pendant le redémarrage. L'utilisateur ne voit rien.

---

**Q : Comment Grafana sait-il où trouver Prometheus ?**

R : La datasource est configurée automatiquement via `monitoring/grafana-datasources.yaml`. Quand Grafana démarre, il lit ce fichier et crée la connexion vers Prometheus. Le dashboard est aussi chargé automatiquement via `monitoring/grafana-dashboards.yaml`. Aucune configuration manuelle.

---

**Q : Pourquoi deux replicas pour le backend et un seul pour le frontend ?**

R : Le backend gère la logique métier, les connexions Telnet et les requêtes API — c'est le composant le plus sollicité, on le scale à 2 pour la disponibilité. Le frontend sert uniquement des fichiers statiques depuis Nginx, une instance suffit largement.

---

**Q : Qu'est-ce que le provisioning automatique Grafana ?**

R : Normalement il faut importer manuellement le dashboard dans Grafana à chaque redémarrage. Grâce au provisioning, des fichiers YAML et JSON sont montés dans le conteneur Grafana au démarrage. Grafana les lit et configure automatiquement la datasource Prometheus et charge le dashboard. Zéro action manuelle.

---

**Q : Quelle est la différence entre ConfigMap et Secret dans Kubernetes ?**

R : Les deux stockent des données de configuration. Les Secrets sont encodés en base64 et destinés aux données sensibles (mots de passe, tokens JWT). Les ConfigMaps sont pour les données non sensibles (port, environnement). K8s peut restreindre l'accès aux Secrets via RBAC.

---

**Q : Pourquoi utiliser Alpine Linux pour les images Docker ?**

R : Alpine Linux est une distribution minimaliste (~5MB). Ça réduit la taille des images (backend ~150MB au lieu de ~1GB), diminue la surface d'attaque pour la sécurité, et accélère les déploiements.

---

## Résumé des technologies DevOps

| Technologie | Rôle | Justification |
|---|---|---|
| **Docker** | Conteneurisation | Portabilité, isolation, reproductibilité |
| **Docker Compose** | Multi-conteneurs local | Démarrage en une commande |
| **Kubernetes** | Orchestration | Haute dispo, scaling, self-healing |
| **Minikube** | K8s local | Test K8s sans infrastructure cloud |
| **Helm** | Package manager K8s | Templates, versioning, paramétrage |
| **Prometheus** | Collecte métriques | Standard industrie, open-source |
| **prom-client** | SDK métriques Node.js | Officiel Prometheus, métriques custom |
| **Grafana** | Visualisation | Dashboards riches, provisioning auto |
| **GitHub Actions** | CI/CD | Intégré GitHub, gratuit, YAML natif |
| **Self-hosted Runner** | CD persistant | Déploiement réel sur Minikube local, pas éphémère |
| **Nginx** | Reverse proxy | Léger, performant, proxy transparent |
| **MongoDB** | Base de données | Schéma flexible, adapté NoSQL |

---

