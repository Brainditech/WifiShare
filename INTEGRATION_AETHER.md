# Intégration Design Aether

## ⚠️ Important - Ne pas modifier App.tsx directement

Pour éviter de casser votre application, voici la méthode sécurisée :

## Méthode 1 : Remplacer temporairement (Test rapide)

### 1. Sauvegarder App.tsx
```bash
cd wifishare/src
copy App.tsx App.backup.tsx
```

### 2. Modifier manuellement App.tsx
Ouvrez `src/App.tsx` et changez SEULEMENT ces 3 lignes :

```tsx
// LIGNE 8 - Remplacer :
import { DesktopHome } from './pages/DesktopHome';
// PAR :
import { DesktopHomeAether } from './pages/DesktopHomeAether';

// LIGNE 9 - Remplacer :
import { WebClient } from './pages/WebClient';
// PAR :
import { WebClientAether } from './pages/WebClientAether';

// LIGNE 10 - Ajouter après les imports existants :
import './styles/aether-design-system.css';
```

### 3. Utiliser les nouveaux composants
Changez les lignes 42 et 45 :
```tsx
// Remplacer <DesktopHome /> par <DesktopHomeAether />
// Remplacer <WebClient /> par <WebClientAether />
```

### 4. Lancer
```bash
npm run dev
# ou
npm run electron:dev
```

### 5. Revenir en arrière
```bash
cd wifishare/src
copy App.backup.tsx App.tsx
```

---

## Méthode 2 : Créer une App alternative (Recommandé)

Créez `src/AppAether.tsx` avec le contenu que je vous ai préparé, puis :

```tsx
// Dans votre index.tsx ou main.tsx
// Remplacez :
import { App } from './App';
// Par :
import { App } from './AppAether';
```

---

## Fichiers créés

| Fichier | Description |
|---------|-------------|
| `src/styles/aether-design-system.css` | Design system CSS |
| `src/pages/DesktopHomeAether.tsx` | Page desktop avec design Aether |
| `src/pages/WebClientAether.tsx` | Page mobile avec design Aether |

---

## Test rapide Web Client

Pour voir le design mobile sans Electron :
```
http://localhost:5173?code=TEST123
```

Ou avec le vrai code de session depuis DesktopHomeAether.

---

*Votre code original est intact dans DesktopHome.tsx et WebClient.tsx*
