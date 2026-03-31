# Guide d'Implémentation des Séquences Telnet

##  Objectif

Ce système permet d'exécuter trois types de commandes Telnet :
1. **Commandes uniques** : Une seule commande Telnet
2. **Séquences** : Plusieurs commandes consécutives avec validation
3. **Monitoring** : Écoute en temps réel des événements

##  Structure des Fichiers

### `telnetCommands.json`

Contient la configuration de toutes les commandes disponibles :

```json
{
  "commands": [
    {
      "id": "single_command",
      "name": "Commande unique",
      "type": "single",
      "command": "ls -l",
      "description": "Liste les fichiers"
    },
    {
      "id": "monitoring_command", 
      "name": "Monitoring",
      "type": "monitoring",
      "command": "scos-keys monitor",
      "description": "Surveille les touches"
    },
    {
      "id": "sequence_command",
      "name": "Séquence système",
      "type": "sequence",
      "description": "Vérification complète",
      "steps": [
        {
          "command": "free -h",
          "expectedResponse": "Mem:",
          "timeout": 5000,
          "description": "Vérifier la mémoire"
        }
      ]
    }
  ]
}
```

## 🔧 Types de Commandes

### 1. Commande Unique (`type: "single"`)
- **Usage** : Commandes simples avec réponse immédiate
- **Exemple** : `ls`, `reboot`, `scos-sensors temp`
- **Timeout** : 15 secondes par défaut

### 2. Monitoring (`type: "monitoring"`)
- **Usage** : Écoute continue des événements
- **Exemple** : `scos-keys monitor`, `scos-events monitor`
- **Durée** : 60 secondes par défaut
- **Événements** : Envoyés en temps réel via WebSocket

### 3. Séquence (`type: "sequence"`)
- **Usage** : Enchaînement de commandes avec validation
- **Structure** : Tableau `steps` avec chaque étape

## 📋 Configuration des Séquences

Chaque étape de séquence contient :

```json
{
  "command": "free -h",           // Commande à exécuter
  "expectedResponse": "Mem:",    // Réponse attendue (optionnel)
  "timeout": 5000,               // Timeout en ms (optionnel)
  "description": "Vérifier mémoire" // Description pour les logs
}
```

### Paramètres des Étapes

- **`command`** (obligatoire) : Commande Telnet à exécuter
- **`expectedResponse`** (optionnel) : Texte attendu dans la réponse
- **`timeout`** (optionnel) : Timeout personnalisé (défaut: 10s)
- **`description`** (optionnel) : Description affichée dans les logs

## 🚀 Exemples de Séquences

### Séquence de Vérification Système

```json
{
  "id": "system_check",
  "name": "Vérification système",
  "type": "sequence",
  "description": "Vérification complète de l'état système",
  "steps": [
    {
      "command": "free -h",
      "expectedResponse": "Mem:",
      "timeout": 5000,
      "description": "Vérifier l'utilisation mémoire"
    },
    {
      "command": "df -h", 
      "expectedResponse": "Filesystem",
      "timeout": 5000,
      "description": "Vérifier l'espace disque"
    },
    {
      "command": "ps aux",
      "expectedResponse": "USER",
      "timeout": 10000,
      "description": "Lister processus actifs"
    }
  ]
}
```

### Séquence de Test LEDs

```json
{
  "id": "led_test",
  "name": "Test LEDs",
  "type": "sequence", 
  "description": "Cycle de test des LEDs",
  "steps": [
    {
      "command": "scos-leds off all",
      "expectedResponse": "#",
      "timeout": 3000,
      "description": "Éteindre toutes LEDs"
    },
    {
      "command": "sleep 2",
      "expectedResponse": "#", 
      "timeout": 3000,
      "description": "Attendre 2 secondes"
    },
    {
      "command": "scos-leds on all",
      "expectedResponse": "#",
      "timeout": 3000, 
      "description": "Allumer toutes LEDs"
    }
  ]
}
```

##  Fonctionnement

### 1. Commande Unique
```
User → Frontend → Backend → Worker → Telnet → Réponse → Frontend
```

### 2. Séquence
```
User → Frontend → Backend → Worker
Worker exécute chaque étape séquentiellement :
  Étape 1 → Validation → Étape 2 → Validation → ... → Fin
```

### 3. Monitoring
```
User → Frontend → Backend → Worker → Telnet (écoute continue)
Événements → Worker → WebSocket → Frontend (temps réel)
```

## Gestion des Erreurs

### Séquences
- **Arrêt immédiat** si une étape échoue
- **Erreur détaillée** avec numéro d'étape
- **Logs complets** pour chaque étape réussie

### Timeouts
- **Commande unique** : 15s
- **Monitoring** : 60s
- **Séquence** : Par étape (défaut 10s, personnalisable)

##  Frontend Integration

### État des Tests
- **PENDING** : En attente d'exécution
- **RUNNING** : En cours d'exécution
- **SUCCESS** : Terminé avec succès
- **FAIL** : Erreur détectée

### Messages WebSocket
- **`step`** : Mise à jour d'étape de séquence
- **`log`** : Message de log
- **`monitoring_event`** : Événement de monitoring
- **`completed`** : Test terminé

## 🛠️ Ajouter une Nouvelle Séquence

1. **Éditer `telnetCommands.json`**
2. **Ajouter une entrée avec `type: "sequence"`**
3. **Définir le tableau `steps`**
4. **Tester avec l'interface web**

### Exemple rapide :

```json
{
  "id": "my_sequence",
  "name": "Ma Séquence",
  "type": "sequence", 
  "description": "Description de ma séquence",
  "steps": [
    {
      "command": "ma_commande",
      "timeout": 5000,
      "description": "Description de l'étape"
    }
  ]
}
```

##  Débogage

### Logs Backend
- **Worker démarré** : ` Worker démarré avec les données`
- **Connexion** : ` Connexion réussie !`
- **Séquence** : ` Séquence détectée dans telnetCommands.json`
- **Étape** : ` Étape 1/3: Description`

### Logs Frontend
- **Progression** : État de chaque étape
- **Événements** : Monitoring en temps réel
- **Erreurs** : Messages détaillés


---

