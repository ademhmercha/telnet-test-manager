# DevOps — Telnet Test Manager
## Documentation complète pour présentation jury PFE

---

## Table des matières

1. [Vue d'ensemble de l'architecture](#1-vue-densemble-de-larchitecture)
2. [Conteneurisation avec Docker](#2-conteneurisation-avec-docker)
3. [Orchestration avec Kubernetes](#3-orchestration-avec-kubernetes)
4. [Déploiement avec Helm](#4-déploiement-avec-helm)
5. [Monitoring avec Prometheus et Grafana](#5-monitoring-avec-prometheus-et-grafana)
6. [Pipeline CI/CD avec GitHub Actions](#6-pipeline-cicd-avec-github-actions)
7. [Comment tester avant la jury](#7-comment-tester-avant-la-jury)
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
    ├── ci-backend  → teste + build image Docker backend
    ├── ci-frontend → teste + build image Docker frontend
    ├── deploy      → déploie sur Kubernetes via Helm
    └── monitoring  → installe Prometheus + Grafana
                               │
                               ▼
                        Kubernetes (Minikube)
                               │
               ┌───────────────┼───────────────┐
               ▼               ▼               ▼
           MongoDB          Backend         Frontend
           (base de         (Node.js        (React +
            données)         Express)        Nginx)
                                     │
                               ┌─────┴─────┐
                               ▼           ▼
                          Prometheus    Grafana
                          (collecte   (dashboards
                           métriques)  visuels)
```

### Pourquoi cette architecture ?

L'application Telnet Test Manager est composée de 3 couches distinctes :
- **Frontend** : interface React pour les techniciens et ingénieurs
- **Backend** : API REST Node.js/Express qui gère la logique métier et la connexion Telnet
- **Base de données** : MongoDB pour stocker les utilisateurs, tests, séquences et rapports

Séparer ces couches en conteneurs indépendants permet de les déployer, mettre à jour et scaler individuellement sans affecter les autres.

---

## 2. Conteneurisation avec Docker

### Qu'est-ce que Docker ?

Docker est un outil qui permet d'emballer une application avec toutes ses dépendances dans un **conteneur**. Un conteneur est un environnement isolé et portable qui tourne de la même façon partout : sur ton PC, sur un serveur, sur le cloud.

**Analogie** : un conteneur Docker c'est comme une boîte hermétique qui contient l'application + tout ce dont elle a besoin pour fonctionner. Tu déplaces la boîte, l'application fonctionne exactement pareil.

### Pourquoi Docker dans ce projet ?

- **Portabilité** : l'app fonctionne identiquement en dev, en test et en production
- **Isolation** : le backend n'interfère pas avec le frontend, ni avec la base de données
- **Reproductibilité** : plus de problème "ça marche sur ma machine mais pas sur la tienne"
- **Déploiement simplifié** : une seule commande pour tout lancer

### Dockerfile Backend (`backend/Dockerfile`)

```dockerfile
FROM node:20-alpine        # image de base légère (Alpine Linux = ~5MB vs Ubuntu ~100MB)
WORKDIR /app               # répertoire de travail dans le conteneur
COPY package*.json ./      # copie les fichiers de dépendances en premier (cache Docker)
RUN npm ci --only=production  # installe seulement les dépendances de production
COPY . .                   # copie le code source
EXPOSE 3002                # documente le port utilisé
CMD ["node", "server.js"]  # commande de démarrage
```

**Justification des choix :**
- `node:20-alpine` : image légère (~150MB) vs `node:20` (~1GB). Alpine Linux est minimaliste et sécurisé.
- `npm ci` au lieu de `npm install` : plus rapide, reproductible, respecte exactement le `package-lock.json`
- `--only=production` : n'installe pas les devDependencies (mocha, nodemon, etc.) → image plus petite et sécurisée

### Dockerfile Frontend (`frontend/Dockerfile`) — Multi-stage build

```dockerfile
# ÉTAPE 1 : construction
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build          # compile React → fichiers HTML/CSS/JS statiques

# ÉTAPE 2 : production
FROM nginx:alpine          # serveur web ultra-léger
COPY --from=builder /app/build /usr/share/nginx/html  # copie seulement le build
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Pourquoi le multi-stage build ?**
- L'étape 1 utilise Node.js (lourd) pour compiler le code React
- L'étape 2 ne garde que les fichiers compilés servis par Nginx (léger)
- Résultat : image finale ~25MB au lieu de ~500MB si on gardait Node.js
- Le code source et les outils de dev ne sont PAS dans l'image de production → sécurité

### Nginx (`frontend/nginx.conf`)

Nginx joue le rôle de **reverse proxy** :
- Sert les fichiers React statiques
- Redirige les requêtes `/api/*` vers le backend sur le port 3002
- Gère le cache pour les assets (images, CSS, JS)
- Ajoute des headers de sécurité (X-Frame-Options, X-Content-Type-Options)

```nginx
location /api/ {
    proxy_pass http://backend:3002/;   # redirige vers le conteneur backend
}
```

### Docker Compose (`docker-compose.yml`)

Docker Compose permet de gérer plusieurs conteneurs ensemble avec un seul fichier de configuration.

```
docker compose up -d
```

Cette commande démarre **5 services** automatiquement :

| Service | Image | Port | Rôle |
|---|---|---|---|
| mongodb | mongo:7 | 27017 | Base de données |
| backend | build local | 3002 | API REST |
| frontend | build local | 3000 | Interface web |
| prometheus | prom/prometheus | 9090 | Collecte métriques |
| grafana | grafana/grafana | 3001 | Dashboards visuels |

**Réseau Docker** : tous les conteneurs sont sur le même réseau `telnet-network`. Ils se parlent par leur nom de service (ex: `backend` parle à `mongodb` via `mongodb:27017`).

**Volumes** : les données MongoDB et Grafana sont persistées dans des volumes Docker. Si le conteneur redémarre, les données ne sont pas perdues.

---

## 3. Orchestration avec Kubernetes

### Qu'est-ce que Kubernetes ?

Kubernetes (K8s) est un système d'orchestration de conteneurs. Là où Docker fait tourner des conteneurs, Kubernetes les **gère à grande échelle** : démarrage automatique, redémarrage en cas de crash, load balancing, scaling...

**Analogie** : Docker c'est un camion de livraison. Kubernetes c'est le système logistique complet qui gère des milliers de camions, s'assure que les livraisons arrivent, remplace un camion en panne, répartit la charge...

### Pourquoi Kubernetes dans ce projet ?

- **Haute disponibilité** : si un pod backend crash, K8s en redémarre un autre automatiquement
- **Scaling** : on peut passer de 2 à 10 replicas backend en une commande
- **Déploiement sans interruption** : rolling update (mise à jour progressive sans downtime)
- **Gestion déclarative** : on décrit l'état souhaité, K8s s'assure que l'état réel correspond

### Minikube

Minikube est une version locale de Kubernetes qui tourne dans un conteneur Docker. Il simule un cluster K8s sur ta machine sans avoir besoin de serveurs réels.

```
Machine Windows
    └── Docker Desktop
            └── Minikube (conteneur Docker)
                    └── Kubernetes
                            ├── Pod: backend (x2)
                            ├── Pod: frontend (x1)
                            ├── Pod: mongodb (x1)
                            ├── Pod: prometheus (x1)
                            └── Pod: grafana (x1)
```

### Concepts Kubernetes utilisés dans ce projet

#### Namespace
Espace de noms qui isole les ressources. On utilise `telnet-app` pour l'application et `monitoring` pour Prometheus/Grafana. Comme des dossiers qui séparent les ressources.

#### Pod
La plus petite unité Kubernetes. Contient un ou plusieurs conteneurs. Un Pod backend = un conteneur Node.js qui tourne.

#### Deployment
Gère un groupe de Pods identiques. Assure qu'il y a toujours le bon nombre de replicas en vie.

```yaml
replicas: 2   # K8s s'assure qu'il y a toujours 2 Pods backend
```

Si un Pod crash → K8s en crée un nouveau automatiquement.

#### Service
Expose les Pods sur le réseau. Les Pods ont des IPs qui changent, le Service a une IP stable.

```
Requête HTTP → Service (IP stable) → Pod1 ou Pod2 (load balancing)
```

#### PersistentVolumeClaim (PVC)
Réserve de l'espace disque persistant pour les conteneurs. MongoDB utilise 2Gi pour stocker les données. Même si le Pod redémarre, les données restent.

#### ConfigMap & Secret
- **ConfigMap** : variables de configuration non sensibles (NODE_ENV, PORT, MONGODB_HOST)
- **Secret** : données sensibles encodées en base64 (JWT_SECRET, mots de passe MongoDB)

#### Ingress
Point d'entrée unique pour l'application. Route le trafic vers le bon service selon l'URL.

```
http://telnet-app.local/      → Service frontend
http://telnet-app.local/api/  → Service backend
```

#### InitContainer
Conteneur qui s'exécute avant le conteneur principal. Le backend attend que MongoDB soit prêt avant de démarrer.

```yaml
initContainers:
  - name: wait-for-mongodb
    image: busybox
    command: ['sh', '-c', 'until nc -z mongodb-service 27017; do sleep 2; done']
```

#### Probes (Health Checks)
- **livenessProbe** : K8s vérifie si le conteneur est vivant. S'il ne répond pas → redémarre.
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

## 4. Déploiement avec Helm

### Qu'est-ce que Helm ?

Helm est le **gestionnaire de paquets** pour Kubernetes. Au lieu d'écrire des dizaines de fichiers YAML manuellement, Helm utilise des templates paramétrables.

**Analogie** : Helm c'est comme `npm` pour Node.js ou `pip` pour Python, mais pour les applications Kubernetes.

### Structure du chart Helm

```
helm/telnet-app/
├── Chart.yaml          → métadonnées (nom, version, description)
├── values.yaml         → valeurs par défaut paramétrables
└── templates/
    ├── configmap.yaml       → variables de config
    ├── secret.yaml          → secrets encodés
    ├── mongodb-pvc.yaml     → stockage MongoDB
    ├── mongodb-deployment.yaml
    ├── mongodb-service.yaml
    ├── backend-pvc.yaml     → stockage backend (rapports)
    ├── backend-deployment.yaml
    ├── backend-service.yaml
    ├── frontend-deployment.yaml
    ├── frontend-service.yaml
    └── ingress.yaml         → point d'entrée HTTP
```

### Pourquoi Helm plutôt que des YAML bruts ?

**Sans Helm** : si tu veux changer le nombre de replicas, tu modifies 1 fichier. Mais si tu veux déployer dans 3 environnements différents (dev, staging, prod) avec des configs différentes → tu maintiens 3 copies de chaque fichier.

**Avec Helm** : un seul `values.yaml` par environnement.

```bash
# Déploiement production
helm upgrade --install telnet-app ./helm/telnet-app \
  --namespace telnet-app \
  --set replicaCount.backend=5 \
  --set resources.backend.limits.memory=512Mi
```

### Commande de déploiement

```bash
helm upgrade --install telnet-app ./helm/telnet-app \
  --create-namespace \
  --namespace telnet-app \
  --timeout 300s
```

- `upgrade --install` : met à jour si existe, installe sinon (idempotent)
- `--create-namespace` : crée le namespace s'il n'existe pas
- `--timeout 300s` : attend 5 minutes max pour que tout soit prêt

---

## 5. Monitoring avec Prometheus et Grafana

### Pourquoi le monitoring ?

Sans monitoring, si l'application ralentit ou tombe, on le découvre quand l'utilisateur signale le problème. Avec monitoring, on voit les problèmes **avant** qu'ils impactent les utilisateurs.

### Prometheus

**Rôle** : collecte et stocke les métriques de l'infrastructure.

**Fonctionnement** : Prometheus "scrape" (interroge) les endpoints `/metrics` toutes les 15 secondes et stocke les données en séries temporelles.

**Ce qu'il collecte** :
- Utilisation CPU des pods
- Utilisation mémoire
- Nombre de requêtes HTTP
- Temps de réponse
- État des pods (up/down)

### Grafana

**Rôle** : visualise les métriques Prometheus sous forme de dashboards.

**Accès** : http://localhost:3001
- Login : `admin`
- Mot de passe : `admin123`

**Datasource** : configurée automatiquement via `monitoring/grafana-datasources.yaml`. Prometheus est déjà connecté à Grafana au premier démarrage.

### Dashboards disponibles (à importer)

| Dashboard | ID | Contenu |
|---|---|---|
| Node Exporter Full | 1860 | CPU, RAM, réseau, disque |
| Kubernetes Cluster | 3119 | État du cluster K8s |
| Prometheus Stats | 3662 | Métriques Prometheus lui-même |

Pour importer : Grafana → Dashboards → New → Import → entrer l'ID → Load

### Architecture monitoring dans Docker Compose

```
Backend (port 3002)
    │  /metrics endpoint
    ▼
Prometheus (port 9090)
    │  scrape toutes les 15s
    │  stocke les données
    ▼
Grafana (port 3001)
    │  requête PromQL
    │  affiche les graphes
    ▼
Navigateur (dashboard)
```

---

## 6. Pipeline CI/CD avec GitHub Actions

### Qu'est-ce que CI/CD ?

- **CI (Continuous Integration)** : à chaque `git push`, le code est automatiquement testé et les images Docker sont construites
- **CD (Continuous Deployment)** : si les tests passent, le code est automatiquement déployé

**But** : détecter les erreurs le plus tôt possible et déployer de façon fiable et répétable.

### Vue d'ensemble de la pipeline

```
git push origin main
        │
        ▼
GitHub Actions déclenche la pipeline
        │
        ├── [Job 1] ci-backend (parallèle)
        │       ├── checkout du code
        │       ├── installation des dépendances npm
        │       ├── exécution des tests
        │       └── build de l'image Docker backend
        │
        ├── [Job 2] ci-frontend (parallèle)
        │       ├── checkout du code
        │       ├── installation des dépendances npm
        │       ├── build React (npm run build)
        │       └── build de l'image Docker frontend
        │
        └── (si ci-backend ET ci-frontend réussissent)
                │
                ▼
        [Job 3] deploy
                ├── démarrage Minikube
                ├── build des images dans Minikube
                ├── helm upgrade --install
                ├── kubectl get all (vérification)
                └── kubectl wait (attente pods prêts)
                        │
                        ▼
                [Job 4] monitoring
                        ├── démarrage Minikube
                        ├── ajout repos Helm (prometheus, grafana)
                        ├── helm install prometheus
                        ├── helm install grafana
                        └── kubectl get pods (vérification)
```

### Fichier de pipeline (`.github/workflows/ci-cd.yaml`)

```yaml
on:
  push:
    branches: [main, develop]   # déclenché sur push vers main ou develop
  pull_request:
    branches: [main]            # déclenché sur PR vers main
```

**Déclencheurs** : la pipeline se lance automatiquement à chaque push sur `main` ou `develop`, et à chaque Pull Request vers `main`.

### Points clés de la configuration

**Cache npm** : les dépendances npm sont mises en cache entre les runs. Gain de temps significatif (30s → 5s pour npm install).

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '18'
    cache: 'npm'
    cache-dependency-path: backend/package-lock.json
```

**CI: false pour React** : par défaut, `npm run build` traite les warnings ESLint comme des erreurs en mode CI. On désactive ce comportement.

```yaml
- run: cd frontend && npm run build
  env:
    CI: false
```

**Minikube dans GitHub Actions** : on utilise `medyagh/setup-minikube@master` pour créer un cluster K8s éphémère directement dans le runner GitHub Actions (une VM Ubuntu).

**Séquençage des jobs** :

```yaml
deploy:
  needs: [ci-backend, ci-frontend]  # attend que CI passe
  if: github.ref == 'refs/heads/main'  # seulement sur main, pas sur develop

monitoring:
  needs: [deploy]  # attend que deploy réussisse
  if: github.ref == 'refs/heads/main'
```

### Résultat de la pipeline

Quand tout est vert ✅ :
- Code testé automatiquement
- Images Docker construites
- Application déployée sur Kubernetes
- Monitoring installé

Durée totale : ~3-5 minutes

---

## 7. Comment tester avant la jury

### Option A — Test avec Docker Compose (le plus simple)

**Prérequis** : Docker Desktop ouvert

```bash
# 1. Se placer dans le projet
cd "c:\Users\ademh\Desktop\telnet  web server"

# 2. Lancer tous les services
docker compose up -d

# 3. Vérifier que tout tourne
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

**URLs à montrer à la jury :**

| Ce que tu montres | URL |
|---|---|
| Application principale | http://localhost:3000 |
| API backend | http://localhost:3002/health |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 |

**Pour arrêter :**
```bash
docker compose down
```

**Pour tout effacer (données incluses) :**
```bash
docker compose down -v
```

---

### Option B — Test avec Minikube + Helm (Kubernetes complet)

**Prérequis** : Docker Desktop ouvert + Minikube installé

```powershell
# 1. Démarrer Minikube
minikube start --driver=docker --memory=4096 --cpus=2

# 2. Configurer Docker pour utiliser Minikube
& minikube -p minikube docker-env --shell powershell | Invoke-Expression

# 3. Build les images dans Minikube
docker build -t telnet-backend:latest ./backend
docker build -t telnet-frontend:latest ./frontend

# 4. Déployer l'application
helm upgrade --install telnet-app ./helm/telnet-app `
  --create-namespace --namespace telnet-app --timeout 300s

# 5. Vérifier les pods
kubectl get pods -n telnet-app

# 6. Installer le monitoring
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
helm upgrade --install prometheus prometheus-community/prometheus `
  -n monitoring --create-namespace -f monitoring/prometheus-values.yaml
helm upgrade --install grafana grafana/grafana `
  -n monitoring -f monitoring/grafana-values.yaml

# 7. Ouvrir Grafana
minikube service grafana -n monitoring
```

---

### Scénario de démonstration jury (10 minutes)

**Minute 1-2 : Montrer l'architecture**
- Ouvrir ce README et expliquer le schéma
- "Notre application est composée de 3 services : frontend React, backend Node.js, MongoDB. Chacun tourne dans un conteneur Docker indépendant."

**Minute 3-4 : Docker Compose**
- Lancer `docker compose up -d` en direct
- Montrer `docker compose ps` → tous les conteneurs UP
- "Avec une seule commande, on démarre toute l'infrastructure."

**Minute 5-6 : Application**
- Ouvrir http://localhost:3000
- Se connecter, montrer les fonctionnalités
- "L'application est accessible, les données sont stockées dans MongoDB."

**Minute 7-8 : Monitoring**
- Ouvrir http://localhost:9090 → Prometheus
- Montrer `up` dans la barre de recherche → voir les métriques
- Ouvrir http://localhost:3001 → Grafana
- Importer dashboard 1860 → montrer les graphes

**Minute 9-10 : Pipeline CI/CD**
- Ouvrir GitHub → Actions → montrer les jobs verts
- "À chaque push, cette pipeline teste le code, construit les images Docker, et déploie automatiquement. Aucune intervention manuelle."

---

## 8. Questions fréquentes jury

**Q : Pourquoi Docker et pas déployer directement sur le serveur ?**

R : Docker garantit que l'application fonctionne identiquement partout. Sans Docker, on peut avoir des problèmes de versions Node.js, de dépendances manquantes, de configuration différente entre les environnements. Docker élimine ces problèmes.

**Q : Quelle est la différence entre Docker et Kubernetes ?**

R : Docker fait tourner des conteneurs sur une seule machine. Kubernetes orchestre des conteneurs sur plusieurs machines. Kubernetes ajoute la haute disponibilité, le scaling automatique, et la gestion des pannes.

**Q : Pourquoi Helm plutôt que des fichiers YAML Kubernetes directement ?**

R : Helm permet de paramétrer les déploiements. Si on veut déployer en prod avec 5 replicas et en dev avec 1 replica, avec Helm on change juste une valeur. Sans Helm, on doit maintenir plusieurs copies des fichiers YAML.

**Q : Comment fonctionne la CI/CD ?**

R : Quand on fait `git push`, GitHub Actions déclenche automatiquement la pipeline. Elle teste le code, construit les images Docker, et déploie sur Kubernetes. Si un test échoue, le déploiement est bloqué. Ça garantit que seul du code fonctionnel arrive en production.

**Q : Que se passe-t-il si le backend tombe ?**

R : Kubernetes détecte que le Pod ne répond plus via les health checks (livenessProbe). Il redémarre automatiquement le Pod. Comme on a 2 replicas du backend, l'autre Pod continue à servir les requêtes pendant le redémarrage. L'utilisateur ne voit rien.

**Q : Comment Grafana sait-il où trouver Prometheus ?**

R : La datasource est configurée automatiquement via le fichier `monitoring/grafana-datasources.yaml`. Quand Grafana démarre, il lit ce fichier et crée la connexion vers Prometheus. Aucune configuration manuelle nécessaire.

**Q : Pourquoi deux replicas pour le backend et un seul pour le frontend ?**

R : Le backend fait des connexions Telnet réseau et gère la logique métier — c'est le composant le plus sollicité, donc on le scale à 2. Le frontend sert juste des fichiers statiques depuis Nginx, une seule instance suffit.

**Q : Quelle est la différence entre ConfigMap et Secret dans Kubernetes ?**

R : Les deux stockent des données de configuration. La différence est que les Secrets sont encodés en base64 et destinés aux données sensibles (mots de passe, tokens JWT). Les ConfigMaps sont pour les données non sensibles (port, environnement, nom de host).

**Q : Pourquoi utiliser Alpine Linux pour les images Docker ?**

R : Alpine Linux est une distribution ultra-légère (~5MB). Ça réduit la taille des images Docker (backend ~150MB vs ~500MB avec Ubuntu), diminue la surface d'attaque pour la sécurité, et accélère les téléchargements.

---

## Résumé des technologies DevOps utilisées

| Technologie | Rôle | Justification |
|---|---|---|
| **Docker** | Conteneurisation | Portabilité, isolation, reproductibilité |
| **Docker Compose** | Multi-conteneurs local | Simplicité, test local rapide |
| **Kubernetes** | Orchestration | Haute dispo, scaling, self-healing |
| **Minikube** | K8s local | Test K8s sans infrastructure cloud |
| **Helm** | Package manager K8s | Templates, versioning, paramétrage |
| **Prometheus** | Collecte métriques | Standard industrie, open-source |
| **Grafana** | Visualisation | Dashboards riches, datasources multiples |
| **GitHub Actions** | CI/CD | Intégré à GitHub, gratuit, YAML natif |
| **Nginx** | Reverse proxy | Léger, performant, proxy transparent |
| **MongoDB** | Base de données | Schéma flexible, adapté aux données variables |

---

*Documentation générée pour le projet Telnet Test Manager — PFE 2026*
