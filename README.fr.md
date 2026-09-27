# FORMA 3D — atelier local de création et d’édition STL

Version 1.0 • interface français / anglais • HTML, CSS et JavaScript • rendu WebGL natif

**Auteur : Nicolas Hanteville** · [English README](README.md)

## Langues

Le sélecteur **EN / FR** dans l’en-tête change la langue sans recharger la page ni perdre le projet. La langue du navigateur est détectée au démarrage (anglais par défaut si elle n’est pas prise en charge). Le choix est mémorisé localement lorsque le stockage est disponible. Les noms existants des projets, objets et fichiers ne sont pas traduits. Les interfaces, dialogues, aides et erreurs sont disponibles dans les deux langues.

FORMA 3D est un éditeur de maillages avec formes paramétriques simples, manipulation 3D, opérations sur volumes, retouches locales et import/export STL. L’interaction s’inspire des éditeurs de création par assemblage de volumes. Ce n’est pas un clone complet de Fusion 360 : il ne contient pas de noyau B-rep ni de solveur de contraintes mécaniques.

## Démarrage

**Le plus simple : ouvrir `FORMA3D.html` dans un navigateur de bureau récent avec WebGL activé.** Ce fichier contient le code, les styles, le moteur de calcul et l’exemple. Il ne charge aucun CDN, aucune police distante, aucun modèle distant. Aucun compte ni abonnement n’est nécessaire.

Le dossier source contient également `index.html`, qui charge les fichiers locaux de `src/` et `assets/`. Garder l’arborescence intacte.

Certaines politiques de navigateur ou d’entreprise restreignent les workers ou le stockage depuis un fichier local. Dans ce cas, utiliser le petit serveur statique facultatif, sans installation de dépendances :

```bash
cd forma3d
./run.sh
# puis ouvrir http://127.0.0.1:8080
```

`run.sh` utilise Node.js ou Python 3 déjà installé. L’éditeur et les calculs restent intégralement dans le navigateur ; le serveur ne fait que distribuer des fichiers sur la boucle locale. Rien n’est envoyé à un service tiers.

Avec Node.js seul :

```bash
node server.mjs
# Port différent : PORT=8090 node server.mjs
```

Pour démarrer sans préparation, le bouton **Découvrir avec une pièce d’exemple** ouvre un support de fixation déjà percé. L’exemple existe aussi en STL dans `examples/`.

## Fonctions disponibles

| Domaine | Fonctions |
|---|---|
| Création | Cube/pavé, cylindre, sphère, cône/tronc de cône, tube, tore, prisme, rampe, plaque à coins arrondis, roue dentée décorative |
| Esquisse | Contour polygonal simple, déplacement des points, grille, extrusion en Z, réédition du contour tant que la forme reste paramétrique |
| Manipulation | Sélection simple/multiple, axes de déplacement, anneaux de rotation, poignées d’échelle, saisie numérique, conservation des proportions, pas de grille |
| Placement | Centrer X/Y, poser au sol, aligner des objets, miroir local, duplication, répétition linéaire |
| Volumes | Fusion, soustraction, intersection, composition de solides et de volumes « Perçage », conservation facultative des sources masquées |
| STL | Import ASCII/binaire, unités d’entrée mm/cm/m/pouces, import multiple, glisser-déposer, export ASCII/binaire de la sélection ou des solides visibles |
| Édition de maillage | Extrusion positive/négative d’une région plane, découpe par plan X/Y/Z, séparation des composantes, subdivision ×4 |
| Retouche | Pinceaux gonfler, creuser, lisser, aplatir ; rayon et intensité réglables ; annulation du trait |
| Contrôle | Mesure entre deux points de surface, enveloppe dimensionnelle, affichage des triangles, transparence, lissage visuel |
| Diagnostic | Comptage des triangles/sommets, arêtes ouvertes/non-manifold, orientations incohérentes, triangles dégénérés, surface et volume algébrique |
| Projet | Sauvegarde/réouverture `.forma3d`, tentative d’autosauvegarde IndexedDB, annuler/rétablir en session, image PNG de la vue |

Le bouton **Nettoyer les triangles** retire les doublons et les triangles dégénérés. **Il ne rebouche pas les trous.** La simplification et le lissage géométrique sont destructifs : l’éditeur conserve une copie masquée de l’original. Le lissage *visuel* des normales, lui, ne déplace pas les sommets.

## Modifier facilement un STL

1. Cliquer **Importer STL**, choisir le fichier et son unité. Le STL ne définit pas d’unité normalisée ; une mauvaise sélection peut donner une pièce 10, 25,4 ou 1 000 fois trop grande.
2. Ajuster **Dimensions locales**, **Position** et **Rotation** à droite. Les dimensions sont avant rotation ; les étiquettes dans la vue indiquent l’enveloppe mondiale.
3. Pour allonger une zone plane : activer **Face**, cliquer sa surface, renseigner une distance puis appliquer. Une distance positive ajoute de la matière, une valeur négative en enlève. Ce n’est pas une modification de rayon ou une reconstruction de l’historique CAO.
4. Pour enlever une moitié ou diviser une pièce : **Découper**, choisir l’axe du plan, sa coordonnée et le côté à conserver, ou créer deux parties.
5. Pour percer : ajouter un cylindre, régler sa taille, le placer à travers la pièce, passer en **Perçage**, sélectionner la pièce et le cylindre avec Maj+clic, puis **Opérations → Composer**.
6. Analyser le résultat, enregistrer le projet modifiable et exporter le STL. Contrôler ensuite le résultat dans le trancheur ou l’outil de fabrication.

Pour la soustraction directe, **le premier objet sélectionné est la cible**. Avec Composer, l’ordre importe moins : les solides sont d’abord fusionnés, puis les volumes de perçage sont soustraits.

Les sources conservées restent dans la liste des objets, atténuées. Le bouton œil les réaffiche. Les sources masquées ne sont pas exportées. Un objet « Perçage » est seulement un outil : il ne creuse rien avant une composition ou un export avec fusion des solides et application des perçages.

### Retoucher une surface

Sélectionner une pièce, activer **Retouche**, choisir l’action, puis glisser sur sa surface. Les pinceaux déplacent les sommets existants. Un grand triangle sans sommet à proximité du pinceau peut sembler insensible : agrandir le rayon ou utiliser **Subdiviser ×4**. Il n’y a pas de remeshing adaptatif pendant le trait. Les retouches peuvent créer des auto-intersections ; analyser et contrôler le résultat.

### Créer à partir d’un dessin

Cliquer **Créer une esquisse 2D**, poser au moins trois sommets puis extruder. Le contour est fermé automatiquement. Il peut être concave, mais pas auto-intersecté et ne contient pas de trous. Pour obtenir un trou, extruder un second contour et le soustraire. Il n’y a pas de contraintes géométriques/cotes d’esquisse résolues automatiquement.

## Navigation et raccourcis

| Action | Commande |
|---|---|
| Sélection | Clic ; Maj+clic pour ajouter/retirer |
| Sélection rectangulaire | Maj+glisser le fond ; prend les centres projetés des objets |
| Orbite | Glisser le fond ou bouton droit |
| Déplacement caméra | Bouton du milieu ou Alt+glisser |
| Zoom | Molette ; geste à deux doigts prévu pour le tactile |
| Vue | Boutons haut/face/gauche/droite/isométrique ; orthographique/perspective |
| Déplacer / tourner / échelle | G / R / S |
| Face / retouche / mesure | E / B / M |
| Cadrer | F |
| Annuler / rétablir | Ctrl+Z / Ctrl+Maj+Z ou Ctrl+Y |
| Sauvegarder / dupliquer | Ctrl+S / Ctrl+D |
| Tout sélectionner / supprimer | Ctrl+A / Suppr. |
| Déplacer par pas | Flèches ; Maj+haut/bas pour Z |

## Sauvegarde et confidentialité

`Exporter STL` produit une géométrie triangulée, sans couleurs, paramètres, objets nommés ou historique. **Conserver également un fichier `.forma3d`** pour reprendre le travail. Ce format sauvegarde les géométries, noms, couleurs, transformations, paramètres des formes non figées, états solide/perçage, visibilité et verrouillage. Les opérations de maillage figent les paramètres de la forme résultante ; leurs sources peuvent être conservées indépendamment.

L’historique annuler/rétablir est uniquement en mémoire pour la session (45 étapes au maximum, avec budget sur les tableaux géométriques). Il n’est pas enregistré dans le fichier projet. La caméra, les préférences de grille et les réglages de pinceau ne sont pas persistés.

L’autosauvegarde IndexedDB est une commodité, pas une sauvegarde durable : effacer les données du navigateur, changer d’origine/dossier ou utiliser un mode restrictif peut la rendre indisponible. L’interface signale cet état. Les fichiers projet constituent la sauvegarde explicite.

Aucun appel à un serveur d’IA, à un stockage cloud ou à une API externe n’est programmé. Ne pas confondre cette propriété du code avec une garantie sur les extensions, la configuration ou la télémétrie du navigateur utilisé.

## Garde-fous et limites

- **Booléens : 80 000 triangles cumulés par paire d’opérandes.** Les calculs exigent des volumes fermés et orientés vers l’extérieur. Un résultat topologiquement non fermé est refusé ; les objets du projet restent inchangés. Les cas tangents, quasi coplanaires, très fins, très étendus ou auto-intersectés peuvent échouer. Ce noyau flottant n’est pas un noyau de CAO exacte.
- **Fichiers :** 100 Mio maximum par STL, 1 200 000 triangles maximum par géométrie, 20 STL par import, 300 objets par projet. Ce sont des plafonds, pas des promesses de fluidité : viser des maillages nettement plus petits, surtout pour les booléens et la retouche.
- **Retouche :** limite interactive à 120 000 triangles ; subdivision limitée à 180 000 triangles d’entrée ; export ASCII limité à 150 000 triangles dans l’interface. Préférer le binaire.
- **Traitements :** worker interrompable, délai maximal de 90 secondes et budgets de calcul internes. Le choix d’une opération exigeante peut être refusé bien avant ces limites.
- **Qualité :** le diagnostic ne recherche pas les auto-intersections, les épaisseurs minimales ou toutes les erreurs de fabrication. Un contrôle d’arêtes réussi ne certifie pas l’imprimabilité. La simplification par regroupement de sommets peut altérer la forme et la topologie.
- **Fonctions non incluses :** STEP/IGES, surfaces NURBS, B-rep exact, solveur de contraintes, fonctions paramétriques dépendantes avec recalcul d’historique, filetages/engrenages mécaniques normalisés, assemblages articulés, congés/chanfreins sur arêtes arbitraires, réparation universelle de STL. La plaque arrondie possède uniquement un contour 2D arrondi extrudé.

Les sommets stockés utilisent des flottants 32 bits ; les calculs intermédiaires utilisent les nombres JavaScript. Le contrôle topologique soude par quantification de 0,00001 mm et les booléens utilisent une tolérance dépendant de l’étendue de la pièce. Ne pas utiliser l’éditeur comme outil de métrologie certifiée.

## Structure et développement

```text
FORMA3D.html             distribution autonome, prête à ouvrir
index.html              entrée multifichier
src/shell.html          structure HTML
src/ui.css              interface et affichage adaptatif
src/locales.js          traductions anglaises des messages français
src/i18n.js             choix de langue et mémorisation locale
src/app.js              état, commandes, historique et interactions
src/renderer.js         rendu WebGL, caméra, picking
src/math.js             matrices, vecteurs et quaternions
src/geometry.js         primitives, STL, topologie, esquisses, retouches
src/csg.js              BSP, fusion/soustraction/intersection, contrôles
src/worker.js           exécution isolée des traitements
src/storage.js          format de projet et IndexedDB
assets/worker-source.js worker intégré généré par le build
assets/demo.js          exemple intégré, sans téléchargement
examples/               projets et STL de démonstration
build.mjs               assemblage sans dépendances npm
server.mjs / run.sh     serveur statique facultatif
licenses/               attribution du code tiers adapté
 tests/                 tests numériques et navigateur
```

Les scripts sont classiques, sans imports ES modules au chargement, pour limiter les difficultés du mode fichier local. Le worker est construit à partir d’un Blob. Aucun framework, bundler, package npm ou WebAssembly n’est nécessaire à l’exécution.

```bash
node tests/geometry.test.cjs   # tests numériques et de sérialisation
node build.mjs                # régénère index.html, worker-source.js et FORMA3D.html
node server.mjs               # serveur local facultatif
```

Les équivalents `npm test`, `npm run build` et `npm start` sont définis, mais **`npm install` n’est pas nécessaire**. Les tests navigateur facultatifs utilisent Python/Playwright, uniquement pour le développement. Le script `tests/browser_functional.py` documente leur lancement. Les composants de test ne sont pas chargés par l’application.

## Validation livrée

Voir `TESTS.md`, `tests/geometry-results.json` et `tests/browser-results.json` pour le périmètre exact. Les tests ne constituent pas une validation industrielle, multi-navigateur ou sur toutes les familles de STL.

## Licence et références

Copyright © 2026 Nicolas Hanteville et les contributeurs FORMA 3D. Code distribué sous MIT. Les séquences booléennes BSP et le découpage par plans de `src/csg.js` sont adaptés de **csg.js, Evan Wallace, copyright 2011, MIT**. La notice complète figure dans `licenses/csg-MIT.txt` et dans la distribution autonome. Le reste de l’éditeur, le rendu, les formats, les garde-fous et les outils sont inclus dans les sources du projet.

Références techniques utilisées pour le format et l’algorithme (pas de dépendances chargées) :

- https://evanw.github.io/csg.js/
- https://github.com/evanw/csg.js
- https://threejs.org/docs/pages/STLExporter.html
- https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
