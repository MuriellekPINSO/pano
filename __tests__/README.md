# 🧪 Suite de Tests Algorithmiques — 360° Panorama

Ce dossier contient des tests autonomes qui s'exécutent sur votre Mac.
Aucune caméra, aucun téléphone requis — les images sont générées synthétiquement
ou téléchargées depuis des datasets open source.

## Structure

```
__tests__/
├── README.md
├── run_tests.js          ← Script principal (Node.js pur, sans dépendances)
├── datasets/             ← Images générées / téléchargées
│   ├── white_wall/       ← Test 1 : Manque de texture
│   ├── parallax/         ← Test 2 : Parallaxe (objets proches vs lointains)
│   ├── ghosting/         ← Test 3 : Fantômes (mouvement entre prises)
│   └── hdr/              ← Test 4 : Contrastes extrêmes (HDR)
└── results/              ← Rapports JSON + logs
```

## Lancer les tests

```bash
cd /Users/muriellekpinso/Documents/360
node __tests__/run_tests.js
```

## Tests couverts

| # | Scénario | Ce qu'on cherche |
|---|----------|-----------------|
| 1 | **Mur blanc** | L'algo ne crashe pas sur images sans texture |
| 2 | **Parallaxe** | Score de qualité `poor` détecté correctement |
| 3 | **Ghosting** | Le blending gère les pixels fantômes |
| 4 | **HDR / Contraste** | L'exposition est équilibrée entre photos claires/sombres |
| 5 | **dHash identité** | Deux photos identiques → hammingScore = 1.0 |
| 6 | **dHash décalé** | Même scène, léger décalage → hammingScore > 0.7 |
| 7 | **Edge match** | Photo A droite ≈ Photo B gauche |
| 8 | **Couverture complète** | 22 photos → panorama sans trous |
| 9 | **Couverture partielle** | 5 photos → trous détectés et comblés |
