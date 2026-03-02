# Application de Test Telnet - Version 0 (POC)

Application web professionnelle de test de services Telnet (simulation uniquement).

## 📋 Description

Cette version 0 est une **simulation statique** qui permet de valider :
- L'interface utilisateur professionnelle
- Le workflow de test
- L'architecture technique
- L'expérience utilisateur

**⚠️ Important** : Aucun vrai service Telnet n'est utilisé - toutes les données sont simulées.

## 🏗️ Architecture

```
windsurf-project-2/
├── backend/                 # API Node.js/Express
│   ├── server.js           # Serveur principal
│   ├── database.json       # Base de données mockée
│   └── package.json        # Dépendances backend
├── frontend/               # Application React
│   ├── src/
│   │   ├── components/     # Composants React
│   │   ├── services/       # Services API
│   │   ├── types/          # Types TypeScript
│   │   └── App.tsx         # Application principale
│   └── package.json        # Dépendances frontend
└── README.md              # Documentation
```

## 🚀 Démarrage rapide

### Prérequis

- Node.js (v14 ou supérieur)
- npm ou yarn

### 1. Installation des dépendances

```bash
# Backend
cd backend
npm install

# Frontend (dans un autre terminal)
cd frontend
npm install
```

### 2. Démarrage de l'application

```bash
# Démarrer le backend (port 3001)
cd backend
npm start

# Démarrer le frontend (port 3000)
cd frontend
npm start
```

### 3. Accès à l'application

- Frontend : http://localhost:3000
- Backend API : http://localhost:3002
- Identifiants de démonstration : `admin` / `admin`

## 🔐 Authentification

- **Login** : admin
- **Mot de passe** : admin
- **Token JWT** : Valide 24 heures
- **Redirection automatique** vers le dashboard après connexion

## 📡 API Endpoints

### Authentification
- `POST /login` - Connexion avec identifiants statiques

### Données
- `GET /postes` - Liste des postes de travail
- `GET /produits?posteId=X` - Produits filtrés par poste
- `GET /slots?produitId=X` - Slots filtrés par produit

### Tests
- `POST /run-test` - Lancer un test simulé
- `GET /test-results` - Historique des résultats de tests

### Santé
- `GET /health` - Vérification du statut du serveur

## 🎯 Fonctionnalités

### 🔐 Page de Login
- Formulaire d'authentification propre et professionnel
- Gestion des erreurs
- Indicateur de chargement
- Design moderne avec gradient

### 🖥️ Dashboard Principal
- **Sélecteurs dépendants** : Poste → Produit → Slot
- **Lancement de test** : Simulation en temps réel (5 secondes)
- **Affichage des étapes** : Progression du test avec statuts
- **Historique** : Derniers résultats de tests
- **Design responsive** : Adapté mobile/desktop

### 📊 Simulation de Test
1. Initialisation de la connexion
2. Tentative de connexion au serveur
3. Authentification Telnet
4. Exécution des commandes de test
5. Analyse des résultats

## 🎨 Interface Utilisateur

- **Design professionnel** : Épuré et moderne
- **Couleurs cohérentes** : Bleu principal (#667eea)
- **Messages d'erreur clairs** : Feedback utilisateur
- **Indicateurs de chargement** : Pendant les tests
- **Responsive design** : Compatible mobile/tablette

## 🔧 Technologies Utilisées

### Backend
- **Node.js** : Runtime JavaScript
- **Express** : Framework web
- **JWT** : Authentification par token
- **CORS** : Partage de ressources cross-origin
- **File System** : Base de données JSON statique

### Frontend
- **React 18** : Bibliothèque UI
- **TypeScript** : Typage statique
- **Axios** : Client HTTP
- **CSS3** : Styles modernes

## 📈 Évolutions Possibles (V1)

### 🔐 Sécurité Avancée
- Base de données réelle (MongoDB/PostgreSQL)
- Gestion des utilisateurs et rôles
- Mots de passe hashés
- Refresh tokens

### 🌐 Vrai Service Telnet
- Intégration de librairie Telnet réelle
- Configuration des connexions
- Gestion des timeouts
- Logs détaillés

### 📊 Fonctionnalités Étendues
- Tests en lot
- Planning des tests
- Notifications email
- Export des résultats
- Tableaux de bord avancés

### 🚀 Performance
- WebSocket pour temps réel
- Cache des résultats
- Pagination des données
- Optimisation des requêtes

## 🐛 Dépannage

### Problèmes Communs

**Port déjà utilisé**
```bash
# Changer le port du backend
PORT=3002 npm start

# Ou tuer le processus existant
npx kill-port 3001
```

**CORS errors**
- Vérifier que le backend tourne sur le port 3001
- Le frontend doit appeler `http://localhost:3001`

**Token expiré**
- Déconnexion et reconnexion
- Les tokens expirent après 24 heures

### Logs

**Backend** : Console Node.js avec détails des requêtes
**Frontend** : Outils de développement du navigateur (onglet Network)

## 📝 Notes de Développement

### Architecture Scalable
- Séparation claire des responsabilités
- Services réutilisables
- Types TypeScript pour la robustesse
- Code commenté et maintenable

### Bonnes Pratiques
- Gestion des erreurs centralisée
- Validation des entrées
- Sécurité des tokens
- Interface utilisateur accessible



---

**Version 0.1.0** - Proof of Concept / Soft Test
