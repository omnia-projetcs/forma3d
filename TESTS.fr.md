# Validation de FORMA 3D 1.0

Exécution dans l’environnement de développement le 27 septembre 2026.

## Résultats

**33 tests numériques et de sérialisation réussis** sous Node.js 22.16.0, via `node tests/geometry.test.cjs`.

Leur périmètre comprend les 11 types de géométrie (dont l’esquisse), fermeture/orientation/volume des primitives, fusion/soustraction/intersection avec volumes analytiques connus, perçage traversant, STL ASCII/binaire, en-tête binaire commençant par « solid », conversion pouces/mm, fichiers invalides, miroir, transformations non uniformes et rotation, extrusion positive/négative, découpe en deux, subdivision, composantes déconnectées, nettoyage, refus de volumes ouverts, plafond de triangles, sérialisation du projet et perçage après réimport du STL d’exemple.

**30 vérifications navigateur réussies** sous Chromium 144.0.7559.96, WebGL via SwiftShader, via `tests/browser_functional.py`.

Les actions testées incluent création, dimensions, annuler/rétablir, glissement du gizmo, import par sélection de fichier, sélection de face au clic, extrusion de la face du STL, création de perçage et composition dans un worker, sources masquées mais toujours accessibles, découpe en deux, conservation du volume, téléchargements STL ASCII/binaire et STL fusionné, téléchargement/réouverture du projet, esquisse concave extrudée, subdivision, pinceau et annulation, annulation d’un worker et diagnostic.

La mise en page a été contrôlée à 1 500 × 950, 820 × 1 180 et 390 × 844 pixels. **Aucune erreur JavaScript/WebGL ni requête HTTP/HTTPS de l’application n’a été observée pendant ce scénario.** Le script emploie un mélange d’actions réelles de souris/clavier/dialogues et d’accès à l’état public `window.FORMA` pour préparer et vérifier les scénarios.

## Contrôle indépendant de fichiers STL

Des fichiers ont aussi été ouverts avec la bibliothèque Python `trimesh`, indépendamment du parseur de l’application. Voir `tests/independent-stl-results.json`.

| Fichier | Résultat |
|---|---|
| Cube 20 mm, binaire | 12 triangles, fermé, orientations cohérentes, 8 000 mm³ |
| Cube 20 mm, ASCII | 12 triangles, fermé, orientations cohérentes, 8 000 mm³ |
| Support de fixation | 5 286 triangles, fermé, orientations cohérentes, environ 48 753,814 mm³, enveloppe 80 × 52 × 47 mm |
| Export navigateur après fusion des deux parties coupées | 1 300 triangles, fermé, orientations cohérentes, environ 9 295,159 mm³ |

Deux exports navigateur ont volontairement été faits **sans fusion** des parties qui se touchent. Leurs coordonnées/volumes et représentations ASCII/binaire concordent. Ils contiennent encore les faces internes de coupe et ne sont pas manifold comme maillage combiné. C’est le comportement documenté de l’export sans fusion, pas une preuve de fermeture globale. L’export avec fusion a été contrôlé séparément et est fermé dans ce scénario.

## Ce qui n’a pas été validé

- Le HTML autonome a été injecté dans une page `about:blank`, sans serveur ni ressource réseau. La politique de navigation gérée du navigateur de test interdisait les URL locales. **L’ouverture réelle via `file://` n’a donc pas été testée dans cet environnement.** Le projet utilise des scripts classiques et un worker Blob pour permettre cette utilisation dans les navigateurs qui l’autorisent ; le serveur statique local est fourni comme alternative.
- La persistance IndexedDB entre rechargements n’a pas été testée sur une origine persistante. Le chemin de repli lorsque le stockage est indisponible a été observé. Le format projet explicite, ses téléchargements et sa réouverture ont été testés.
- Firefox, Safari, les véritables appareils tactiles, les pertes de contexte GPU, les fichiers proches des limites maximales et toutes les familles de STL n’ont pas été testés.
- Les tests de fermeture ne prouvent ni l’absence d’auto-intersections, ni l’épaisseur suffisante, ni l’aptitude à une fabrication donnée.

## Reproduction

Les tests numériques utilisent seulement Node.js. Les tests navigateur demandent Python et Playwright installés dans l’environnement de développement. Sous Linux sans affichage, un serveur X virtuel peut être nécessaire pour le rendu logiciel :

```bash
node tests/geometry.test.cjs
node build.mjs
xvfb-run -a python tests/browser_functional.py
```

`CHROMIUM_EXECUTABLE` permet de préciser le chemin de Chromium. `--no-sandbox` est un réglage du banc de test isolé ; il n’est pas nécessaire pour utiliser l’application normalement. Aucun de ces composants de test n’est une dépendance d’exécution de l’éditeur.

## Mise à jour bilingue

Auteur : **Nicolas Hanteville**. `npm test` comprend désormais les 33 tests numériques et 6 tests de localisation, tous réussis. Le parcours navigateur existant comporte toujours 30 vérifications réussies en français.

Le nouveau script `tests/browser_i18n.py` réussit **75 vérifications**. Il vérifie les deux distributions en anglais et français, les dialogues et erreurs, les noms personnalisés, la conservation du projet, la mémorisation de la langue, les affichages de 320 à 1 500 pixels et l’ouverture réelle par `file://` lorsque le stockage des préférences est bloqué. Le rapport courant est `tests/i18n-browser-results.json`. Cette nouvelle vérification complète la limitation historique sur `file://` décrite plus haut ; elle ne valide pas toutes les politiques de navigateur.

```bash
npm test
node build.mjs
python tests/browser_i18n.py
```

Voir [TESTS.md](TESTS.md) pour la documentation principale actualisée en anglais.
