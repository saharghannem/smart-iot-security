🏢 Smart IoT Security : Documentation & Guide d'Installation

Ce document est le guide complet du projet **Smart IoT Security** (Gestionnaire d'accès intelligent par badge RFID et reconnaissance faciale). Il explique comment installer le projet sur une nouvelle machine et détaille l'architecture globale.

---

## 🚀 1. Guide d'Installation (Pour exécuter le projet sur un autre PC)

Si vous venez de récupérer ce projet, suivez ces étapes attentivement pour le faire fonctionner sur votre machine.

### 📋 A. Prérequis (Logiciels à installer)
Avant de lancer le projet, assurez-vous d'avoir installé les logiciels suivants sur votre bureau :
1. **Node.js** : Téléchargez et installez la version LTS (recommandée) depuis [nodejs.org](https://nodejs.org/). *(Cela installera aussi `npm`)*.
2. **Angular CLI** : L'outil en ligne de commande Angular. Ouvrez un terminal (CMD ou PowerShell en administrateur) et tapez :
   ```bash
   npm install -g @angular/cli
   ```
3. Un éditeur de code (recommandé : **Visual Studio Code**).

### ⚙️ B. Installation des dépendances du projet
1. Décompressez (ou ouvrez) le dossier contenant le projet (`smart-iot-security`) sur le bureau.
2. Ouvrez ce dossier dans **Visual Studio Code**.
3. Ouvrez un nouveau Terminal dans VS Code (`Terminal -> New Terminal`) en vous assurant d'être **à l'intérieur** du dossier `smart-iot-security`.
4. Lancez l'installation des paquets (cela téléchargera le dossier `node_modules`) :
   ```bash
   npm install
   ```
   *(Si l'installation bloque avec une erreur "ERESOLVE", utilisez la commande de secours : `npm install --legacy-peer-deps`)*.

### 🔑 C. Configuration de l'environnement (Clés d'API)
Pour que le projet se connecte à vos bases de données, assurez-vous que les clés d'API sont bien présentes dans les fichiers de configuration (notamment dans `src/app/services/firebase.service.ts` ou dans le dossier `config/`). Le projet a besoin des accès suivants pour fonctionner à 100% :
*   **Firebase** : Clés du projet, Firestore et Realtime Database.
*   **Cloudinary** : Le `cloudName` et le `uploadPreset` (pour l'hébergement des photos et des badges).
*   **EmailJS** : Les clés publiques pour l'envoi des e-mails.

### 🏃‍♂️ D. Lancer l'application
Dans le terminal (toujours dans le dossier `smart-iot-security`), tapez la commande suivante :
```bash
ng serve
```
Attendez que la compilation se termine (message de succès vert). 
Puis, ouvrez votre navigateur internet et rendez-vous sur : **http://localhost:4200/**

---

## 🏗️ 2. Vue d'ensemble de l'architecture (Stack Technologique)

Le projet repose sur une approche **Serverless modern** connectée à des nœuds IoT matériels :

*   **Frontend (Interface Web)** : Angular (v17+) en mode *Standalone Components* et CSS modern (Material/Tailwind-like).
*   **Backend & Base de Données** : Firebase (Google Cloud).
    *   **Firestore (NoSQL)** : Pour stocker les données durables (profils utilisateurs, cartes RFID).
    *   **Realtime Database (RTDB)** : Pour le temps réel avec l'ESP32 / IoT (état de la porte, scannes bruts).
*   **Hébergement Médias** : Cloudinary (Permet d'avoir des URLs fixes avec cache-busting pour les avatars et les badges générés).
*   **Envois de Mails** : EmailJS (Envoi direct depuis le client web, sans backend Node.js).

---

## 📂 3. Structure détaillée du code source (`src/app/`)

### 🧩 Les Composants (`components/`)
*(L'interface visuelle de l'application)*

*   📁 **`dashboard/`** : Page d'accueil avec les statistiques (KPIs), graphiques Chart.js et la surveillance de la connectivité du matériel (ex: Porte verrouillée).
*   📁 **`users/`** : 
    *   Le module central pour ajouter/modifier/supprimer des employés.
    *   `users.component.ts` : Associe une carte RFID à un utilisateur, gère l'exportation CSV/PDF, et s'occupe de la sauvegarde complète.
    *   `image-cropper-dialog/` : Pop-up HTML5 sur-mesure (Canvas) permettant de recadrer la photo de l'utilisateur avant le téléchargement.
*   📁 **`events/`** : Centre de monitoring. Affiche et filtre les accès acceptés ou refusés (logs) ainsi que les alertes de sécurité/intrusions.
*   📁 **`rfid/`** : Gestion matérielle des badges. Permet d'ajouter des tags RFID à la volée, de voir lesquels sont disponibles ou assignés, et de les exporter.
*   📁 **`images/`** : Gestionnaire/Galerie des captures de la caméra IoT et des logs visuels de sécurité.

### ⚙️ Les Services (`services/`)
*(Le moteur caché de l'application)*

*   📄 **`firebase.service.ts`** : Le fichier le plus vital. Ses missions :
    *   **Synchronisation Temps Réel** : Gère les abonnements Observables (RxJS) vers Firestore et RTDB pour garantir une interface toujours à jour.
    *   **Moteur de Dédoublonnement** : Algorithme intelligent fusionnant les sources de données mixtes via des clés uniques `UID_TIMESTAMP`.
    *   **Génération visuelle des Badges** : Utilise l'API **Canvas** pour dessiner dynamiquement des badges PNG professionnels (QR code, photo, branding).
    *   **Gestion Cloudinary API** : Centralise l'upload et la suppression sécurisée des médias (via signature SHA-1).
    *   **Emails Audit** : Déclenche l'envoi d'EmailJS pour les notifications administratives.

### 🗃️ Les Modèles (`models/`)
*(Règles de données strictes TypeScript)*
*   📄 `user.model.ts` : Entité *Employé* (Nom, matricule, dates d'accès, horaires).
*   📄 `rfid-card.model.ts` : Entité *Badge physique* (Status, ID de carte).
*   📄 `access-log.model.ts` : Entité d'historique (Passage d'une carte sur la porte).

---

## 🎨 4. Design & Expérience Utilisateur (UI/UX Premium)

L'interface a été conçue pour offrir une esthétique moderne et "High-Tech" :

### ✨ A. Esthétique Neumorphic & Glassmorphism
- **Neumorphism** : Utilisation d'ombres douces (`var(--neu-elevated-shadow)`) pour donner un relief tactile aux composants du dashboard.
- **Glassmorphism** : Effets de flou d'arrière-plan sur les alertes critiques pour une immersion maximale.

### 📱 B. Dashboard Dynamique & Analytics
- **Supervision KPIs** : Calcul en temps réel du taux de rejet, des intrusions et de l'utilisateur le plus actif via des flux de données croisés (`combineLatest`).
- **Data Visualization** : Intégration de **Chart.js** pour projeter l'activité sécurisée sur des graphiques temporels.
- **Micro-interactions** : Animations fluides au chargement (`fade-in`) et boutons de suppression translucides réactifs.

---

## 🔄 5. Le Flux de données (Comment tout communique ?)

### Exemple A : L'ajout d'un nouvel employé
1. L'admin remplit le formulaire sur le web et ajoute une photo (qui est recadrée).
2. La photo recadrée est envoyée sur **Cloudinary** qui renvoie une URL internet sécurisée.
3. Le système crée le **Badge final en PNG** et le télécharge aussi sur Cloudinary.
4. L'utilisateur (avec son nom, son n° de carte RFID, l'URL de sa photo et de son badge) est sauvegardé dans **Firestore** (Base de données principale).
5. Un email de confirmation est expédié (via EmailJS) directement à l'employé avec le lien du badge.

### Exemple B : Quelqu'un badge sur la porte (Hardware IoT)
1. Le lecteur RFID / ESP32 scanne la puce physique.
2. Le lecteur vérifie la base ou insère un événement "Demande d'accès" dans **Firebase RTDB**.
3. Si accès valide, la porte s'ouvre.
4. Le registre "Logs d'accès" de l'UI **Angular** (qui est branché en direct sur le serveur via connexion WebSocket Permanente) se rafraîchit à la seconde et le tableau de bord affiche le nom de la personne vient d'entrer !