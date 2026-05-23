# Scénario Démo DevOps — Jury PFE
## Telnet Test Manager

---

## Prérequis avant la démo (faire ça avant que la jury arrive)

```powershell
# 1. Docker Desktop ouvert et running

# 2. Lancer le self-hosted runner (laisser ce terminal ouvert)
cd C:\Users\ademh\Desktop\actions-runner
.\run.cmd
# Attendre : "Listening for Jobs"

# 3. Vérifier que tout tourne
docker ps                          # 5 containers Docker Compose
kubectl get pods -n telnet-app     # backend, frontend, mongodb Running
kubectl get pods -n monitoring     # grafana, prometheus Running
```

---

## PARTIE 1 — Docker Compose (2 min)

### Ce que tu montres
L'application tourne en local via Docker Compose — 5 services en une commande.

### Commandes
```powershell
# Montrer les containers qui tournent
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### Ce que tu dis
> "L'application est composée de 5 services : frontend React, backend Node.js,
> MongoDB, Prometheus et Grafana. Tout démarre avec une seule commande
> `docker compose up`. Les services communiquent via un réseau Docker isolé
> et les données sont persistées dans des volumes."

### Ouvre dans le browser
- http://localhost:3000 → Application (Docker Compose)
- Connecte-toi avec `admin` / ton mot de passe
- Montre l'interface rapidement

---

## PARTIE 2 — Pipeline CI/CD (2 min)

### Ce que tu montres
Un `git push` déclenche automatiquement le pipeline complet.

### Commandes
```powershell
# Déclencher le pipeline en live
git commit --allow-empty -m "demo: trigger pipeline"
git push origin main
```

### Ouvre GitHub → Actions → Regarde en direct

### Ce que tu expliques étape par étape

| Job | Runner | Ce qu'il fait |
|-----|--------|---------------|
| `ci-backend` | GitHub cloud | npm ci → audit sécurité → test |
| `ci-frontend` | GitHub cloud | npm ci → audit sécurité → build React |
| `deploy` | **self-hosted (ta machine)** | build images → Helm deploy → Minikube |

### Ce que tu dis
> "Les jobs CI tournent sur les runners GitHub cloud pour l'isolation.
> Le job deploy s'exécute sur notre self-hosted runner — notre machine locale
> où Minikube tourne. Un seul git push suffit pour tout déployer automatiquement.
> Si je fais deux pushs rapidement, le concurrency group annule le premier
> et lance uniquement le dernier."

### Point bonus — Concurrency group
```powershell
# Pousser 2 commits rapidement
git commit --allow-empty -m "test 1" && git push
git commit --allow-empty -m "test 2" && git push
# → GitHub annule automatiquement "test 1" et lance "test 2"
```

---

## PARTIE 3 — Kubernetes + Helm (2 min)

### Ce que tu montres
L'application déployée sur Kubernetes via Helm, accessible sur un port différent.

### Commandes
```powershell  
# Montrer les pods K8s
kubectl get pods -n telnet-app
kubectl get pods -n monitoring

# Montrer les services
kubectl get svc -n telnet-app

# Montrer le Helm release
helm list -n telnet-app
helm list -n monitoring
```

### Ce que tu dis
> "L'application est déployée sur un cluster Kubernetes Minikube via Helm.
> Helm gère le déploiement comme un package manager — versioning, rollback,
> paramétrage. On est à la révision X, déployée automatiquement par le pipeline."

### Accéder à l'app K8s
```powershell
# Dans un terminal séparé — laisser ouvert
kubectl port-forward svc/frontend-service 4000:80 -n telnet-app
```
- http://localhost:4000 → Application (Kubernetes)
- http://localhost:3000 → Application (Docker Compose)

### Ce que tu dis
> "Même application, deux environnements différents. Port 3000 c'est Docker Compose,
> port 4000 c'est Kubernetes. La portabilité est totale."

---

## PARTIE 4 — HorizontalPodAutoscaler (2 min) ← EFFET WOW

### Ce que tu montres
Kubernetes scale automatiquement le backend selon la charge CPU.

### Terminal 1 — Surveiller le HPA en temps réel
```powershell
kubectl get hpa -n telnet-app -w
```
Résultat initial :
```
NAME          REFERENCE            TARGETS      MINPODS  MAXPODS  REPLICAS
backend-hpa   Deployment/backend   cpu: 6%/70%  1        5        1
```

### Terminal 2 — Générer de la charge
```powershell
kubectl run stress1 -n telnet-app --image=busybox --restart=Never -- sh -c "while true; do wget -q -O- http://backend:3002/health; done"
kubectl run stress2 -n telnet-app --image=busybox --restart=Never -- sh -c "while true; do wget -q -O- http://backend:3002/health; done"
kubectl run stress3 -n telnet-app --image=busybox --restart=Never -- sh -c "while true; do wget -q -O- http://backend:3002/health; done"
kubectl run stress4 -n telnet-app --image=busybox --restart=Never -- sh -c "while true; do wget -q -O- http://backend:3002/health; done"
kubectl run stress5 -n telnet-app --image=busybox --restart=Never -- sh -c "while true; do wget -q -O- http://backend:3002/health; done"
```

### Ce que tu observes dans Terminal 1
```
cpu: 6%/70%    → REPLICAS: 1   (repos)
cpu: 198%/70%  → REPLICAS: 3   (scale up automatique !)
cpu: 99%/70%   → REPLICAS: 5   (maximum atteint !)
```

### Ce que tu dis
> "On voit le CPU passer de 6% à 198%. Le HPA réagit en 30 secondes
> et crée automatiquement jusqu'à 5 replicas pour absorber la charge.
> Zéro intervention manuelle — c'est Kubernetes qui gère."

### Nettoyer après la démo
```powershell
kubectl delete pod stress1 stress2 stress3 stress4 stress5 -n telnet-app
```

---

## PARTIE 5 — Monitoring (2 min)

### Ce que tu montres
Prometheus collecte les métriques, Grafana les visualise en temps réel.

### Ouvrir Prometheus
```powershell
kubectl port-forward svc/prometheus-server 9090:80 -n monitoring
```
- http://localhost:9090
- Tape dans la barre de recherche : `telnet_tests_launched_total`
- Montre que la métrique custom existe

### Ouvrir Grafana
```powershell
kubectl port-forward svc/grafana 3001:80 -n monitoring
```
- http://localhost:3001 → admin / admin123
- Montre le dashboard avec CPU, RAM, requêtes HTTP

### Ce que tu dis
> "Prometheus scrape les métriques du backend toutes les 15 secondes.
> On expose des métriques custom comme le nombre de tests Telnet lancés.
> Grafana les visualise en temps réel. En production, on configurerait
> des alertes automatiques si le CPU dépasse un seuil."

---

## PARTIE 6 — Sécurité & Secrets (30 sec)

### Ce que tu montres
```powershell
# Montrer que values.yaml n'a pas de vrais secrets
cat helm/telnet-app/values.yaml | grep -A4 "secrets:"
# → CHANGE_ME partout
```

### Montrer GitHub → Settings → Secrets → Actions
> "Les vrais credentials sont dans GitHub Secrets, jamais dans le code.
> Le pipeline les injecte via --set au moment du déploiement."

---

## PARTIE 7 — Rollback (si la jury demande)

```powershell
# Voir l'historique des déploiements
helm history telnet-app -n telnet-app

# Rollback à la version précédente
helm rollback telnet-app -n telnet-app

# Vérifier
helm list -n telnet-app
```

> "Helm garde l'historique de chaque déploiement. En cas de problème,
> un rollback ramène l'application à l'état précédent en quelques secondes."

---

## Ordre recommandé — 10 minutes total

```
1. Docker Compose       → 2 min  (docker ps + localhost:3000)
2. Pipeline CI/CD       → 2 min  (git push + GitHub Actions)
3. Kubernetes + Helm    → 2 min  (kubectl get pods + localhost:4000)
4. HPA scaling          → 2 min  (1 → 5 replicas en direct)
5. Monitoring           → 1 min  (Prometheus + Grafana)
6. Secrets              → 30 sec (GitHub Secrets)
```

---

## Questions fréquentes jury — Réponses courtes

**"Pourquoi pas de tests ?"**
> "L'architecture Clean Architecture isole les use cases — ils sont facilement
> testables avec Jest sans dépendances externes. C'est la prochaine étape prévue."

**"Pourquoi Minikube et pas un vrai cluster cloud ?"**
> "Minikube simule un vrai cluster K8s localement. La prochaine étape est
> de déployer sur GKE ou EKS — le Helm chart reste identique, seule la cible change."

**"Pourquoi un self-hosted runner ?"**
> "Les runners GitHub cloud sont éphémères. Le self-hosted runner tourne sur
> notre machine où Minikube est installé — le déploiement est réel et persistant."

**"Que se passe-t-il si le backend crashe ?"**
> "Kubernetes détecte le crash via la livenessProbe sur /health et redémarre
> automatiquement le pod. Avec le HPA, si la charge est haute, d'autres replicas
> prennent le relais immédiatement."

**"Comment sont gérés les secrets ?"**
> "Les credentials sont dans GitHub Secrets, jamais dans le code.
> Le pipeline les injecte via helm --set au moment du déploiement."
