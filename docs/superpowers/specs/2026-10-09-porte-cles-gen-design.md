# Générateur de porte-clés texte — Design

Date : 2026-10-09
Inspiration : https://www.atomm.com/fr/parametric-template/176172-porte-cles-lexie

## Objectif

Page web où l'utilisateur saisit un texte, choisit police et paramètres, ajoute éventuellement une icône et un trou d'attache, puis exporte :

- **Laser** : deux SVG à découper (base + lettres) qui se collent l'un sur l'autre.
- **Impression 3D** : un `.3mf` contenant deux objets (base + lettres en relief), les lettres s'emboîtant dans une poche peu profonde de la base.

## Contraintes

- 100 % client, site statique (GitHub Pages / Netlify). Aucun backend.
- Unités : mm uniquement.
- Aucun booléen 3D : toute la géométrie est calculée en 2D (polygones), puis extrudée.

## Stack

- Vite + TypeScript + Svelte 5
- `opentype.js` : lecture des polices, chemins des glyphes
- `clipper2-js` (ou équivalent Clipper2) : union, offset, différence de polygones
- `earcut` : triangulation des faces
- `three` : aperçu 3D uniquement (OrbitControls)
- `fflate` : zip (3MF et pack SVG)
- `remixicon` : source des icônes (Apache 2.0), indexée au build
- Polices Google Fonts (OFL) embarquées dans `public/fonts/`
- Vitest pour les tests

## Paramètres (`KeychainParams`)

| Groupe | Paramètre | Défaut |
|---|---|---|
| Texte | `text` | `"Lexie"` |
| Police | `fontId` (embarquée ou importée) | `pacifico` |
| | `fontSize` (mm, hauteur em) | 30 |
| | `textWeight` (mm, offset de graissage, ≥ 0) | 0 |
| | `letterSpacing` (mm) | 0.3 |
| | `outlineWidth` (mm, contour de base) | 3 |
| Icône | `iconEnabled`, `iconName` | `false`, — |
| | `iconSize` (mm), `iconGap` (mm) | = hauteur capitale, 2 |
| Trou | `holeEnabled` | `true` |
| | `holePosition` : `left` \| `right` \| `top` | `left` |
| | `holeOffset` (mm, décalage le long du bord) | 0 |
| | `holeDiameter` (mm), `holeMargin` (mm, anneau autour) | 4, 2.5 |
| Mode | `mode` : `laser` \| `print3d` | `laser` |
| 3D | `baseThickness` H (mm) | 3 |
| | `reliefHeight` (mm, au-dessus de la base) | 1.5 |
| | `pocketDepth` p (mm) | 0.6 |
| | `clearance` (mm, jeu de la poche ; 0 pour multi-matériau) | 0.15 |
| | `baseColor`, `lettersColor` | `#c8b496`, `#ffffff` |

## Pipeline géométrique (`src/geometry/`)

1. **Texte → polygones** (`text.ts`) : opentype.js produit les chemins de chaque glyphe, avancés de `advance + letterSpacing`. Béziers aplatis (`flatten.ts`, tolérance ~0,05 mm). Axe Y retourné (repère SVG, Y vers le bas).
2. **Lettres `L`** : union Clipper2 de tous les glyphes (fill-rule nonzero). Si `textWeight > 0`, offset arrondi de `textWeight / 2`.
3. **Icône `I`** (`icon.ts`) : chemin SVG Remix (24×24) parsé, aplati, mis à l'échelle à `iconSize`, centré verticalement sur la hauteur des lettres, placé à gauche du texte avec `iconGap`. Traité ensuite comme un glyphe.
4. **Base `B`** (`keychain.ts`) : `offset(L ∪ I, outlineWidth, round)`, puis on ne garde que les contours extérieurs (trous intérieurs remplis).
5. **Trou** : centre placé sur le bord choisi de la boîte englobante de `B`, à `holeDiameter/2 + holeMargin` vers l'extérieur moins un chevauchement pour fusionner, décalé de `holeOffset`. `B = (B ∪ disque(r + marge)) − disque(r)`.
6. **Sortie** : `{ base: Polygons, letters: Polygons, bounds }`, où `letters = L ∪ I`. Coordonnées normalisées pour que la boîte englobante de `B` commence en (0, 0).

Les îlots (point du « i », yeux d'une icône) restent des polygones séparés : posés dans la poche en 3D, petites pièces à coller au laser. Limite assumée.

## Maillage 3D (`src/mesh/`)

- `extrude.ts` : `extrude(polygons, z0, z1) → { positions, indices }`. Chaque polygone avec trous est triangulé par earcut (faces haut/bas, orientations inversées), murs latéraux construits en partageant les sommets des contours. Résultat garanti manifold.
- `keychain3d.ts` :
  - base = `extrude(B, 0, H − p)` + `extrude(B − offset(letters, clearance), H − p, H)`, fusionnés et soudés en un seul maillage ;
  - lettres = `extrude(letters, H − p, H + reliefHeight)`.
  - Si `pocketDepth = 0` : base pleine `0 → H`, lettres `H → H + relief`.

La base est un objet 3MF contenant **deux coques fermées** (tranche inférieure et tranche supérieure trouée), en contact sur le plan `z = H − p`. Chaque coque est manifold individuellement ; les slicers (Bambu Studio, PrusaSlicer) fusionnent les coques d'un même objet. Pas de soudure.

## Exports (`src/export/`)

- `svg.ts` : `toSvg(polygons, bounds)` → SVG avec `width/height` en mm et `viewBox` en mm, un `<path>` par polygone (`fill="none" stroke="#ff0000" stroke-width="0.01"`).
  - Laser : `base.svg` (B avec trou) + `lettres.svg` (L ∪ I), zippés dans `<texte>-laser.zip`.
- `threemf.ts` : 3MF Core minimal : `[Content_Types].xml`, `_rels/.rels`, `3D/3dmodel.model` avec `unit="millimeter"`, un `<basematerials>` à deux couleurs, deux objets maillés (`name="base"`, `name="lettres"`) regroupés dans un objet parent à `<components>`, un seul `<item>` dans `<build>`. Fichier `<texte>.3mf`.
- `download.ts` : Blob + lien temporaire.

## UI (`src/ui/`, Svelte 5)

- Store `params` unique source de vérité ; géométrie recalculée avec debounce ~100 ms (Web Worker seulement si nécessaire).
- **Zone principale** : toggle Aperçu 2D / Aperçu 3D.
  - 2D : SVG avec grille mm, règles, cotes largeur × hauteur ; base (rouge) et lettres (bleu) superposées, puis couche lettres seule en dessous.
  - 3D : Three.js + OrbitControls, couleurs `baseColor` / `lettersColor`.
- **Panneau droit** : sections Texte, Police (liste avec aperçu + import TTF/OTF), Icône (toggle + picker avec recherche et catégories Remix), Trou, Mode (laser / 3D, réglages 3D visibles en mode 3D), bouton Exporter.
- **Persistance** : localStorage + état encodé dans l'URL (hash) pour partager. Une police importée n'est pas partageable par lien (fallback sur la police par défaut).
- Polices embarquées (14) : scripts attachés (Pacifico, Lobster, Dancing Script, Satisfy, Kaushan Script, Yellowtail, Cookie) et grasses lisibles (Fredoka, Baloo 2, Righteous, Bungee, Titan One, Luckiest Guy, Chewy). Chargées à la demande.
- Icônes : script de build qui lit `remixicon` et génère `icons.json` (`{ name, category, path }`), seulement les variantes `-fill` pour rester découpables.

## Erreurs

- Police importée invalide : toast, police précédente conservée.
- Texte vide (et pas d'icône) : export désactivé, aperçu vide.
- Glyphe absent de la police : ignoré, avertissement affiché.
- Échec de calcul géométrique : message dans l'aperçu, export désactivé.

## Tests (Vitest)

- `geometry/` : aire > 0, `B` contient `L` (L − B vide), bornes cohérentes avec fontSize, trou bien soustrait (aire diminuée de πr²).
- `mesh/` : maillage étanche (chaque arête partagée par exactement 2 triangles), volume > 0, orientation sortante.
- `export/` : 3MF dézippable, XML parsable, 2 objets maillés regroupés dans un objet parent à composants, un seul `<item>` ; SVG avec bonnes dimensions mm.
- Manuel : import du 3MF dans Bambu Studio / PrusaSlicer, des SVG dans LightBurn / Inkscape.

## Hors scope

- Unités en pouces.
- Trous multiples ou déplaçables à la souris.
- Mode gravure (pièce unique, lettres gravées), export DXF.
- Import d'icône SVG personnalisée.
- Catalogue Google Fonts complet.
