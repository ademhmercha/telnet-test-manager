#!/bin/bash
set -e

echo "=== 1. Demarrage Minikube ==="
minikube start --driver=docker --memory=4096 --cpus=2

echo "=== 2. Activation Ingress ==="
minikube addons enable ingress

echo "=== 3. Build des images Docker dans Minikube ==="
eval $(minikube docker-env)
docker build -t telnet-backend:latest ./backend
docker build -t telnet-frontend:latest ./frontend

echo "=== 4. Deploiement Helm ==="
helm upgrade --install telnet-app ./helm/telnet-app \
  --create-namespace \
  --namespace telnet-app \
  --wait \
  --timeout 180s

echo "=== 5. Installation Monitoring ==="
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

helm upgrade --install prometheus prometheus-community/prometheus \
  -n monitoring --create-namespace \
  -f monitoring/prometheus-values.yaml

helm upgrade --install grafana grafana/grafana \
  -n monitoring \
  -f monitoring/grafana-values.yaml

echo "=== 6. Configuration /etc/hosts ==="
echo "$(minikube ip) telnet-app.local" | sudo tee -a /etc/hosts

echo ""
echo "========================================"
echo "  Deploiement termine !"
echo "========================================"
echo "  App       : http://telnet-app.local"
echo "  Grafana   : minikube service grafana -n monitoring"
echo "  Prometheus: minikube service prometheus-server -n monitoring"
echo ""
echo "  IMPORTANT : lancer dans un terminal separe :"
echo "  minikube tunnel"
echo "========================================"
echo ""
kubectl get all -n telnet-app
