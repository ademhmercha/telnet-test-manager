# Scénario Démo DevOps — Jury PFE
## Telnet Test Manager

---

## Prérequis avant la démo (faire ça AVANT que le jury arrive)

```powershell
# 1. Docker Desktop ouvert et running

# 2. Lancer le self-hosted runner dans un terminal — laisser ouvert
cd C:\Users\ademh\Desktop\actions-runner
.\run.cmd
# Attendre : "Listening for Jobs"

# 3. Lancer minikube tunnel en ADMIN — laisser ouvert dans un terminal admin
#    (clic droit PowerShell → Exécuter en tant qu'administrateur)
minikube tunnel

# 4. Vérifier que tout tourne
kubectl get pods -n telnet-app     # backend, frontend, mongodb → Running
kubectl get pods -n monitoring     # grafana, prometheus → Running

# 5. Lancer le port-forward Grafana
Start-Job { kubectl port-forward svc/grafana 3000:80 -n monitoring } | Out-Null

# 6. Vérifier l'app dans le browser
# http://telnet-app.local  → Application Kubernetes (via Ingress)
# http://localhost:3000    → Grafana
```

---

## PARTIE 1 — Pipeline CI/CD (2 min)

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
| `ci-backend` | GitHub cloud | npm ci → audit sécurité → tests |
| `ci-frontend` | GitHub cloud | npm ci → audit sécurité → build React |
| `deploy` | **self-hosted (ta machine)** | build images → Helm deploy → Minikube |

### Ce que tu dis
> "Les jobs CI tournent sur les runners GitHub cloud pour l'isolation.
> Le job deploy s'exécute sur notre self-hosted runner — notre machine locale
> où Minikube tourne. Un seul git push suffit pour tout déployer automatiquement.
> Si deux pushs arrivent en même temps, le concurrency group annule le premier
> et garde uniquement le dernier."

---

## PARTIE 2 — Kubernetes + Helm (2 min)

### Ce que tu montres
L'application déployée sur Kubernetes via Helm.

### Commandes
```powershell
# Montrer les pods
kubectl get pods -n telnet-app
kubectl get pods -n monitoring

# Montrer les services
kubectl get svc -n telnet-app

# Montrer le Helm release et sa révision
helm list -n telnet-app
helm list -n monitoring
```

### Ce que tu dis
> "L'application est déployée sur un cluster Kubernetes Minikube via Helm.
> Helm gère le déploiement comme un package manager — versioning, rollback,
> configuration par environnement. On est à la révision X, déployée
> automatiquement par le pipeline après chaque push."

### Accéder à l'app
- http://localhost:4000 → Application (Kubernetes)
- Login : `admin` / `admin123`

---

## PARTIE 3 — Sécurité & Secrets (30 sec)

### Ce que tu montres
```powershell
# Montrer que values.yaml n'a pas de vrais secrets
cat helm/telnet-app/values.yaml | Select-String "CHANGE_ME"
```

### Montrer GitHub → Settings → Secrets → Actions

### Ce que tu dis
> "Les vrais credentials sont dans GitHub Secrets, jamais dans le code.
> Le pipeline les injecte via helm --set au moment du déploiement.
> Le values.yaml dans le repo ne contient que des placeholders CHANGE_ME."

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
backend-hpa   Deployment/backend   cpu: 5%/70%  1        5        1
```

### Terminal 2 — Générer de la charge CPU
```powershell
$bpod = kubectl get pods -n telnet-app -l app=backend -o jsonpath="{.items[0].metadata.name}"
kubectl exec -n telnet-app $bpod -- node -e "const end=Date.now()+120000;while(Date.now()<end){Math.sqrt(Math.random())}"
```

### Ce que tu observes dans Terminal 1
```
cpu: 5%/70%    → REPLICAS: 1   (repos)
cpu: 149%/70%  → REPLICAS: 3   (scale up automatique !)
cpu: 104%/70%  → REPLICAS: 5   (maximum atteint !)
cpu: 5%/70%    → REPLICAS: 1   (scale down après le test)
```

### Ce que tu dis
> "On voit le CPU passer de 5% à 149%. Le HPA réagit en moins d'une minute
> et crée automatiquement jusqu'à 5 replicas pour absorber la charge.
> Zéro intervention manuelle — c'est Kubernetes qui gère.
> Quand la charge retombe, il scale down automatiquement."

---

## PARTIE 5 — Monitoring + Alertes Email (2 min) ← EFFET WOW 2

### Ce que tu montres
Grafana détecte le CPU élevé et envoie un email automatiquement.

### Avant de lancer le stress test — ouvre Grafana
- http://localhost:3000 → admin / admin123
- Alerting → Alert rules → montre la règle **"Backend CPU High"** en état **Normal**

### Lance le stress test (même commande que PARTIE 4)
```powershell
$bpod = kubectl get pods -n telnet-app -l app=backend -o jsonpath="{.items[0].metadata.name}"
kubectl exec -n telnet-app $bpod -- node -e "const end=Date.now()+120000;while(Date.now()<end){Math.sqrt(Math.random())}"
```

### Ce que le jury voit en temps réel
1. Grafana → Alert rules → la règle passe **Normal → Firing** (rouge)
2. HPA → replicas monte 1 → 3 → 5
3. Email reçu sur `ademhmerchaaa@gmail.com` : **"[FIRING] Backend CPU High"**
4. Après le test : email **"[RESOLVED] Backend CPU High"**

### Ce que tu dis
> "Grafana surveille le CPU via Prometheus. Dès que le seuil est dépassé,
> une alerte email est envoyée automatiquement à l'équipe. Quand le problème
> se résout, un second email 'Resolved' confirme le retour à la normale.
> En production, ces alertes permettent de réagir avant que les utilisateurs
> ne soient impactés."

### Ouvrir Prometheus aussi (optionnel)
```powershell
Start-Job { kubectl port-forward svc/prometheus-server 9090:80 -n monitoring } | Out-Null
```
- http://localhost:9090
- Tape : `rate(container_cpu_usage_seconds_total{pod=~"backend.*", namespace="telnet-app"}[2m]) * 100`

---

## PARTIE 6 — Rollback (si le jury demande)

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
1. Pipeline CI/CD       → 2 min  (git push + GitHub Actions en direct)
2. Kubernetes + Helm    → 2 min  (kubectl get pods + localhost:4000)
3. Secrets              → 30 sec (GitHub Secrets + CHANGE_ME)
4. HPA scaling          → 2 min  (1 → 5 replicas en direct)
5. Monitoring + Email   → 2 min  (Grafana Firing + email reçu en live)
6. Rollback             → 30 sec (si demandé)
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
> "Les runners GitHub cloud sont éphémères et sans accès à notre Minikube local.
> Le self-hosted runner tourne sur notre machine où Minikube est installé —
> le déploiement est réel et persistant."

**"Que se passe-t-il si le backend crashe ?"**
> "Kubernetes détecte le crash via la livenessProbe sur /health et redémarre
> automatiquement le pod. Avec le HPA, si la charge est haute, d'autres replicas
> prennent le relais immédiatement."

**"Comment sont gérés les secrets ?"**
> "Les credentials sont dans GitHub Secrets, jamais dans le code.
> Le pipeline les injecte via helm --set au moment du déploiement."

**"C'est quoi Helm ?"**
> "Helm est le package manager de Kubernetes. Il regroupe tous les manifests
> YAML en un seul chart versionné, avec des variables pour différents
> environnements. C'est l'équivalent de npm pour Node.js mais pour K8s."
