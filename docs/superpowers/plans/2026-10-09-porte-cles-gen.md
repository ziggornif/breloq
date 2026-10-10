# Générateur de porte-clés texte — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Page web statique qui génère un porte-clés texte (+ icône, + trou) et l'exporte en 2 SVG laser ou en 3MF bi-objet pour l'impression 3D.

**Architecture:** Toute la géométrie est 2D (polygones entiers en µm via Clipper), calculée par des modules TS purs (`src/geometry`), puis extrudée en maillages étanches maison (`src/mesh`) et sérialisée (`src/export`). L'UI Svelte 5 (`src/ui`) ne fait qu'orchestrer : état → géométrie → aperçus 2D/3D → export.

**Tech Stack:** Vite 8, Svelte 5 (runes), TypeScript 5.9, Vitest 5, clipper-lib (Clipper 1), opentype.js 2, earcut 3, fflate, three, remixicon, @fontsource/*.

**Spec:** `docs/superpowers/specs/2026-10-09-porte-cles-gen-design.md`

## Global Constraints

- 100 % client, aucun backend ; build statique (`base: './'`).
- Unités : mm partout dans l'API publique ; en interne les `Shape` sont en entiers µm (`SCALE = 1000`), axe Y vers le bas (repère SVG).
- Aucun booléen 3D : seulement des opérations 2D puis extrusion.
- Maillages exportés : chaque coque est manifold (chaque arête orientée `a→b` apparaît exactement une fois et `b→a` exactement une fois).
- Icônes : seulement les variantes `-fill` de Remix Icon, catégorie `Logos` exclue.
- Polices : servies depuis les paquets `@fontsource/*` (fichiers `.woff`, sous-ensemble latin), licence OFL.
- Défauts des paramètres : copiés de la table de la spec (voir Task 9).
- Textes UI en français.
- Commits : Conventional Commits, sujet court, terminés par la ligne `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

---

## File Structure

```
package.json, vite.config.ts, svelte.config.js, tsconfig.json, index.html
scripts/build-icons.mjs          # génère src/icons/icons.json depuis remixicon
src/main.ts                      # monte App
src/app.css                      # styles globaux
src/params.ts                    # KeychainParams, DEFAULT_PARAMS, sanitize, encode/decode
src/geometry/types.ts            # Shape, SCALE, Bounds, PathCommand
src/geometry/clip.ts             # wrapper Clipper2 (union, offset, diff, intersect, circle, bounds…)
src/geometry/flatten.ts          # PathCommand[] → Shape (Béziers aplatis)
src/geometry/svgpath.ts          # attribut d (M L H V C Q Z) → PathCommand[]
src/geometry/text.ts             # Font + texte → Shape
src/geometry/keychain.ts         # params → { base, letters, width, height, missing }
src/mesh/extrude.ts              # Shape + z0/z1 → Mesh étanche ; mergeMeshes
src/mesh/keychain3d.ts           # géométrie → { base, letters } meshes
src/export/svg.ts                # Shape → SVG mm
src/export/threemf.ts            # meshes → .3mf (zip)
src/export/bundle.ts             # laserZip(), fileBaseName()
src/export/download.ts           # déclenche le téléchargement navigateur
src/fonts/registry.ts            # liste des polices embarquées + chargement/cache + import
src/icons/icons.ts               # chargement lazy de icons.json + catégories FR
src/ui/App.svelte                # layout, pipeline réactif, toasts
src/ui/Panel.svelte              # panneau de réglages
src/ui/NumberField.svelte        # champ numérique avec unité
src/ui/IconPicker.svelte         # recherche + catégories + grille
src/ui/Preview2D.svelte          # SVG grille/règles/cotes
src/ui/Preview3D.svelte          # Three.js + OrbitControls
tests: src/**/*.test.ts (à côté des modules)
```

---

### Task 1: Scaffold Vite + Svelte + TS + Vitest

**Files:**
- Create: `package.json`, `vite.config.ts`, `svelte.config.js`, `tsconfig.json`, `index.html`, `src/main.ts`, `src/app.css`, `src/ui/App.svelte`, `.gitignore`, `src/smoke.test.ts`

**Interfaces:**
- Produces: scripts `npm run dev|build|test|check`.

- [ ] **Step 1: Créer `package.json`**

```json
{
  "name": "porte-cles-gen",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "icons": "node scripts/build-icons.mjs",
    "dev": "npm run icons && vite",
    "build": "npm run icons && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "check": "svelte-check --tsconfig ./tsconfig.json"
  }
}
```

- [ ] **Step 2: Installer les dépendances**

Run:
```bash
npm i clipper2-js@^1.2.4 opentype.js@^2.0.0 earcut@^3.0.0 fflate@^0.8.2 three@^0.186.0 remixicon@^4.9.0 \
  @fontsource/pacifico @fontsource/lobster @fontsource/dancing-script @fontsource/great-vibes @fontsource/satisfy \
  @fontsource/kaushan-script @fontsource/yellowtail @fontsource/cookie @fontsource/fredoka @fontsource/baloo-2 \
  @fontsource/righteous @fontsource/bungee @fontsource/titan-one @fontsource/luckiest-guy @fontsource/chewy
npm i -D vite@^8 svelte@^5 @sveltejs/vite-plugin-svelte@^7 typescript@~5.9.3 vitest@^5 svelte-check@^4 \
  @tsconfig/svelte@^5 @types/three@^0.186.0 @types/opentype.js @types/node
```
Expected: installation sans erreur de peer dependency.

- [ ] **Step 3: Fichiers de config**

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  base: './',
  plugins: [svelte()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

`svelte.config.js`:
```js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default { preprocess: vitePreprocess() };
```

`tsconfig.json`:
```json
{
  "extends": "@tsconfig/svelte/tsconfig.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src/**/*.ts", "src/**/*.svelte", "vite.config.ts"]
}
```

`.gitignore`:
```
node_modules
dist
src/icons/icons.json
```

`index.html`:
```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Générateur de porte-clés</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts`:
```ts
import { mount } from 'svelte';
import './app.css';
import App from './ui/App.svelte';

mount(App, { target: document.getElementById('app')! });
```

`src/app.css`:
```css
:root {
  --bg: #f4f4f5; --panel: #fafafa; --card: #fff; --border: #e4e4e7;
  --text: #18181b; --muted: #71717a; --accent: #27272a;
  --base: #d0312d; --letters: #3436c9;
  font-family: system-ui, -apple-system, sans-serif; color: var(--text);
}
* { box-sizing: border-box; }
html, body, #app { margin: 0; height: 100%; background: var(--bg); }
button { font: inherit; cursor: pointer; }
input, select { font: inherit; }
```

`src/ui/App.svelte` (provisoire, remplacé en Task 13):
```svelte
<h1>Porte-clés</h1>
```

`src/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs', () => expect(1 + 1).toBe(2));
});
```

- [ ] **Step 4: Vérifier**

Run: `npx vitest run` → Expected: 1 test PASS.
Run: `npx vite build` → Expected: build OK dans `dist/` (le script `icons` n'existe pas encore, on appelle vite directement).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite svelte ts project"
```

---

### Task 2: Wrapper Clipper (`geometry/types.ts`, `geometry/clip.ts`)

> Ruling (exécution) : `clipper2-js` 1.2.4 produit des offsets faux et un `pointInPolygon` erroné. On utilise `clipper-lib` (Clipper 1 v6.4.2, licence Boost, `@types/clipper-lib`), entièrement encapsulé dans `clip.ts`. Le reste du code ne voit que nos types `Pt`/`Path`/`Shape`.

**Files:**
- Modify: `package.json` (retirer `clipper2-js`, ajouter `clipper-lib` + `@types/clipper-lib` en dev)
- Create: `src/geometry/types.ts`, `src/geometry/clip.ts`
- Test: `src/geometry/clip.test.ts`

**Interfaces:**
- Produces:
  - `interface Pt { x: number; y: number }`, `type Path = Pt[]`, `type Shape = Path[]` (entiers µm, Y bas), `const SCALE = 1000`
  - `interface Bounds { minX: number; minY: number; maxX: number; maxY: number }` (mm)
  - `type PathCommand = { type: 'M' | 'L'; x: number; y: number } | { type: 'Q'; x1: number; y1: number; x: number; y: number } | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number } | { type: 'Z' }` (mm)
  - `makePath(coordsMm: number[]): Path` (paires x,y en mm → µm arrondis), `emptyShape(): Shape`, `toShape(paths: Path[]): Shape`, `isOuter(p: Path): boolean` (orientation positive = contour extérieur), `union(a: Shape, b?: Shape): Shape`, `difference(a: Shape, b: Shape): Shape`, `intersect(a: Shape, b: Shape): Shape`, `offset(s: Shape, mm: number): Shape`, `outerOnly(s: Shape): Shape`, `circle(cx: number, cy: number, r: number, steps?: number): Shape`, `translate(s: Shape, dx: number, dy: number): Shape`, `area(s: Shape): number` (mm², signée : extérieurs +, trous −), `bounds(s: Shape): Bounds | null`, `groupPolygons(s: Shape): { outer: Path; holes: Path[] }[]`, `cleanPath(p: Path): Path`

- [ ] **Step 1: Dépendances**

Run:
```bash
npm uninstall clipper2-js
npm i clipper-lib@^6.4.2
npm i -D @types/clipper-lib
```

- [ ] **Step 2: Écrire `src/geometry/types.ts`**

```ts
export interface Pt {
  x: number;
  y: number;
}

/** Contour fermé, coordonnées entières en µm, axe Y vers le bas. */
export type Path = Pt[];

/** Ensemble de contours fermés (extérieurs orientés positivement, trous négativement). */
export type Shape = Path[];

/** Unités internes par mm. */
export const SCALE = 1000;

/** Boîte englobante en mm. */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Commande de chemin vectoriel, coordonnées en mm. */
export type PathCommand =
  | { type: 'M' | 'L'; x: number; y: number }
  | { type: 'Q'; x1: number; y1: number; x: number; y: number }
  | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: 'Z' };
```

- [ ] **Step 3: Écrire le test qui échoue `src/geometry/clip.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import {
  area, bounds, circle, cleanPath, difference, emptyShape, groupPolygons, intersect, isOuter,
  makePath, offset, outerOnly, toShape, translate, union,
} from './clip';

const rect = (x: number, y: number, w: number, h: number) =>
  toShape([makePath([x, y, x + w, y, x + w, y + h, x, y + h])]);

describe('clip', () => {
  it('makePath converts mm to integer µm', () => {
    expect(makePath([1.5, 2, 0.0004, 3])).toEqual([{ x: 1500, y: 2000 }, { x: 0, y: 3000 }]);
  });

  it('union merges overlapping squares', () => {
    const u = union(toShape([...rect(0, 0, 10, 10), ...rect(5, 5, 10, 10)]));
    expect(u.length).toBe(1);
    expect(area(u)).toBeCloseTo(175, 3);
  });

  it('difference punches a hole', () => {
    const d = difference(rect(0, 0, 10, 10), rect(2.5, 2.5, 5, 5));
    expect(area(d)).toBeCloseTo(75, 3);
    expect(groupPolygons(d)).toHaveLength(1);
    expect(groupPolygons(d)[0].holes).toHaveLength(1);
  });

  it('intersect keeps overlap', () => {
    expect(area(intersect(rect(0, 0, 10, 10), rect(5, 0, 10, 10)))).toBeCloseTo(50, 3);
  });

  it('offset grows with round joins', () => {
    const o = offset(rect(0, 0, 10, 10), 1);
    // 10x10 + 4 bandes 10x1 + disque r=1
    expect(area(o)).toBeCloseTo(100 + 40 + Math.PI, 1);
    expect(bounds(o)).toEqual({ minX: -1, minY: -1, maxX: 11, maxY: 11 });
    expect(offset(rect(0, 0, 10, 10), 0)).toHaveLength(1);
  });

  it('negative offset erodes', () => {
    expect(area(offset(rect(0, 0, 10, 10), -1))).toBeCloseTo(64, 1);
  });

  it('offset of an L shape stays a single outline', () => {
    const L = union(toShape([...rect(0, 0, 2, 10), ...rect(0, 8, 10, 2)]));
    const o = offset(L, 1);
    expect(o).toHaveLength(1);
    expect(isOuter(o[0])).toBe(true);
  });

  it('outerOnly fills holes', () => {
    const ring = difference(rect(0, 0, 10, 10), rect(2.5, 2.5, 5, 5));
    expect(area(outerOnly(ring))).toBeCloseTo(100, 3);
  });

  it('circle has expected area and positive orientation', () => {
    const c = circle(0, 0, 5);
    expect(area(c)).toBeCloseTo(Math.PI * 25, 0);
    expect(isOuter(c[0])).toBe(true);
  });

  it('bounds and translate', () => {
    const t = translate(rect(0, 0, 10, 4), 1.5, -2);
    expect(bounds(t)).toEqual({ minX: 1.5, minY: -2, maxX: 11.5, maxY: 2 });
    expect(bounds(emptyShape())).toBeNull();
  });

  it('groupPolygons separates islands and assigns holes to the right outer', () => {
    const two = union(toShape([...rect(0, 0, 10, 10), ...rect(20, 0, 10, 10)]));
    const withHole = difference(two, rect(22, 2, 2, 2));
    const g = groupPolygons(withHole);
    expect(g).toHaveLength(2);
    const owner = g.find((p) => p.holes.length === 1)!;
    expect(bounds([owner.outer])!.minX).toBe(20);
  });

  it('groupPolygons handles island inside a hole', () => {
    const s = union(toShape([...difference(rect(0, 0, 20, 20), rect(2, 2, 16, 16)), ...rect(8, 8, 4, 4)]));
    const g = groupPolygons(s);
    expect(g).toHaveLength(2);
    expect(g.find((p) => bounds([p.outer])!.minX === 8)!.holes).toHaveLength(0);
    expect(g.find((p) => bounds([p.outer])!.minX === 0)!.holes).toHaveLength(1);
  });

  it('cleanPath removes duplicates and collinear points', () => {
    const p = makePath([0, 0, 5, 0, 10, 0, 10, 0, 10, 10, 0, 10]);
    expect(cleanPath(p)).toHaveLength(4);
  });
});
```

- [ ] **Step 4: Lancer, vérifier l'échec**

Run: `npx vitest run src/geometry/clip.test.ts` → Expected: FAIL (`Cannot find module './clip'`).

- [ ] **Step 5: Implémenter `src/geometry/clip.ts`**

```ts
import * as ClipperNS from 'clipper-lib';
import { SCALE, type Bounds, type Path, type Pt, type Shape } from './types';

// clipper-lib est un module CommonJS : selon l'interop, l'API est sur le namespace ou sur `default`.
const CL = ((ClipperNS as unknown as { default?: typeof ClipperNS }).default ?? ClipperNS) as typeof ClipperNS;
const { Clipper, ClipperOffset, ClipType, PolyType, PolyFillType, JoinType, EndType } = CL;

/** Tolérance d'arc des offsets arrondis : 5 µm. */
const ARC_TOLERANCE = 5;

type CPath = ClipperNS.Path;
const toC = (p: Path): CPath => p.map((pt) => ({ X: pt.x, Y: pt.y }));
const fromC = (p: CPath): Path => p.map((pt) => ({ x: pt.X, y: pt.Y }));

export function makePath(coordsMm: number[]): Path {
  const p: Path = [];
  for (let i = 0; i + 1 < coordsMm.length; i += 2) {
    p.push({ x: Math.round(coordsMm[i] * SCALE), y: Math.round(coordsMm[i + 1] * SCALE) });
  }
  return p;
}

export function emptyShape(): Shape {
  return [];
}

export function toShape(paths: Path[]): Shape {
  return [...paths];
}

export function isOuter(p: Path): boolean {
  return Clipper.Orientation(toC(p));
}

function boolean(type: number, a: Shape, b: Shape): Shape {
  const c = new Clipper();
  c.AddPaths(a.map(toC), PolyType.ptSubject, true);
  if (b.length) c.AddPaths(b.map(toC), PolyType.ptClip, true);
  const out: CPath[] = [];
  c.Execute(type, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero);
  return out.map(fromC);
}

export function union(a: Shape, b: Shape = []): Shape {
  return boolean(ClipType.ctUnion, a, b);
}

export function difference(a: Shape, b: Shape): Shape {
  return boolean(ClipType.ctDifference, a, b);
}

export function intersect(a: Shape, b: Shape): Shape {
  return boolean(ClipType.ctIntersection, a, b);
}

/** Offset arrondi en mm (négatif = érosion). Résultat normalisé (union). */
export function offset(s: Shape, mm: number): Shape {
  const u = union(s);
  if (mm === 0 || u.length === 0) return u;
  const o = new ClipperOffset(2, ARC_TOLERANCE);
  o.AddPaths(u.map(toC), JoinType.jtRound, EndType.etClosedPolygon);
  const out: CPath[] = [];
  o.Execute(out, mm * SCALE);
  return union(out.map(fromC));
}

/** Garde uniquement les contours extérieurs (remplit les trous). */
export function outerOnly(s: Shape): Shape {
  return union(union(s).filter(isOuter));
}

export function circle(cx: number, cy: number, r: number, steps = 96): Shape {
  const p: Path = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    p.push({ x: Math.round((cx + r * Math.cos(a)) * SCALE), y: Math.round((cy + r * Math.sin(a)) * SCALE) });
  }
  return [isOuter(p) ? p : p.reverse()];
}

export function translate(s: Shape, dx: number, dy: number): Shape {
  const ix = Math.round(dx * SCALE);
  const iy = Math.round(dy * SCALE);
  return s.map((p) => p.map((pt) => ({ x: pt.x + ix, y: pt.y + iy })));
}

/** Aire nette en mm² (extérieurs positifs, trous négatifs). */
export function area(s: Shape): number {
  let a = 0;
  for (const p of s) a += Clipper.Area(toC(p));
  return a / (SCALE * SCALE);
}

export function bounds(s: Shape): Bounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of s) for (const pt of p) {
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }
  if (minX === Infinity) return null;
  return { minX: minX / SCALE, minY: minY / SCALE, maxX: maxX / SCALE, maxY: maxY / SCALE };
}

/** Supprime doublons consécutifs et points colinéaires (indispensable avant earcut). */
export function cleanPath(p: Path): Path {
  return fromC(Clipper.CleanPolygon(toC(p), 1.415));
}

/** Regroupe chaque contour extérieur avec ses trous directs (pour la triangulation). */
export function groupPolygons(s: Shape): { outer: Path; holes: Path[] }[] {
  const absArea = (p: Path) => Math.abs(Clipper.Area(toC(p)));
  const groups = s.filter(isOuter)
    .map((outer) => ({ outer, holes: [] as Path[], a: absArea(outer) }))
    .sort((x, y) => x.a - y.a);
  for (const h of s.filter((p) => !isOuter(p))) {
    const ha = absArea(h);
    // le plus petit extérieur plus grand que le trou qui contient un sommet du trou
    const owner = groups.find((g) => g.a > ha && h.some((pt) => inside(pt, g.outer)));
    owner?.holes.push(h);
  }
  return groups.map(({ outer, holes }) => ({ outer, holes }));
}

/** Point strictement intérieur ou sur le bord (sommet de trou sur le contour = possédé). */
function inside(pt: Pt, poly: Path): boolean {
  return Clipper.PointInPolygon({ X: pt.x, Y: pt.y }, toC(poly)) !== 0;
}
```

- [ ] **Step 6: Lancer, vérifier le succès**

Run: `npx vitest run src/geometry/clip.test.ts` → Expected: 13 PASS.
Run: `npm run check` → Expected: 0 erreur (si `import * as ClipperNS` pose un souci de typage, garder le namespace pour les types et l'accès `default ?? namespace` pour le runtime comme ci-dessus).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/geometry
git commit -m "feat(geometry): add clipper wrapper"
```

---

### Task 3: Aplatissement des chemins (`geometry/flatten.ts`)

**Files:**
- Create: `src/geometry/flatten.ts`
- Test: `src/geometry/flatten.test.ts`

**Interfaces:**
- Consumes: `PathCommand`, `SCALE`, `Shape` (Task 2), `toShape` (Task 2)
- Produces: `flattenCommands(cmds: PathCommand[], segLen?: number): Shape` — contours bruts (non unis), un par sous-chemin, ≥ 3 points, sans point de fermeture dupliqué. Un `M` démarre un nouveau contour même sans `Z` (Pacifico n'émet pas de `Z`).

- [ ] **Step 1: Test qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import { flattenCommands } from './flatten';
import { area, union } from './clip';
import type { PathCommand } from './types';

const square: PathCommand[] = [
  { type: 'M', x: 0, y: 0 }, { type: 'L', x: 10, y: 0 },
  { type: 'L', x: 10, y: 10 }, { type: 'L', x: 0, y: 10 }, { type: 'Z' },
];

describe('flattenCommands', () => {
  it('converts lines to one contour', () => {
    const s = flattenCommands(square);
    expect(s).toHaveLength(1);
    expect(s[0]).toHaveLength(4);
    expect(Math.abs(area(s))).toBeCloseTo(100, 3);
  });

  it('starts a new contour on M without Z', () => {
    const noZ: PathCommand[] = [
      { type: 'M', x: 0, y: 0 }, { type: 'L', x: 1, y: 0 }, { type: 'L', x: 1, y: 1 },
      { type: 'M', x: 5, y: 5 }, { type: 'L', x: 6, y: 5 }, { type: 'L', x: 6, y: 6 },
    ];
    expect(flattenCommands(noZ)).toHaveLength(2);
  });

  it('drops duplicated closing point', () => {
    const closed: PathCommand[] = [...square.slice(0, 4), { type: 'L', x: 0, y: 0 }, { type: 'Z' }];
    expect(flattenCommands(closed)[0]).toHaveLength(4);
  });

  it('approximates a circle made of cubic curves', () => {
    const k = 0.5522847498 * 10;
    const c: PathCommand[] = [
      { type: 'M', x: 10, y: 0 },
      { type: 'C', x1: 10, y1: k, x2: k, y2: 10, x: 0, y: 10 },
      { type: 'C', x1: -k, y1: 10, x2: -10, y2: k, x: -10, y: 0 },
      { type: 'C', x1: -10, y1: -k, x2: -k, y2: -10, x: 0, y: -10 },
      { type: 'C', x1: k, y1: -10, x2: 10, y2: -k, x: 10, y: 0 },
      { type: 'Z' },
    ];
    expect(Math.abs(area(union(flattenCommands(c))))).toBeCloseTo(Math.PI * 100, 0);
  });

  it('handles quadratic curves', () => {
    const q: PathCommand[] = [
      { type: 'M', x: 0, y: 0 }, { type: 'Q', x1: 5, y1: 10, x: 10, y: 0 }, { type: 'Z' },
    ];
    // aire sous une parabole de hauteur de contrôle 10 : 2/3 * 10 * 5
    expect(Math.abs(area(flattenCommands(q)))).toBeCloseTo((2 / 3) * 10 * 5, 0);
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run src/geometry/flatten.test.ts` → Expected: FAIL (module absent).

- [ ] **Step 3: Implémenter `src/geometry/flatten.ts`**

```ts
import { toShape } from './clip';
import { SCALE, type PathCommand, type Shape } from './types';

type Pt = { x: number; y: number };

/** Aplatit des commandes (mm) en contours fermés (µm). segLen = longueur max visée d'un segment, en mm. */
export function flattenCommands(cmds: PathCommand[], segLen = 0.2): Shape {
  const contours: Pt[][] = [];
  let cur: Pt[] = [];
  let last: Pt = { x: 0, y: 0 };

  const flush = () => {
    if (cur.length > 1) {
      const a = cur[0];
      const b = cur[cur.length - 1];
      if (a.x === b.x && a.y === b.y) cur.pop();
    }
    if (cur.length >= 3) contours.push(cur);
    cur = [];
  };

  for (const c of cmds) {
    switch (c.type) {
      case 'M':
        flush();
        last = { x: c.x, y: c.y };
        cur.push(last);
        break;
      case 'L':
        last = { x: c.x, y: c.y };
        cur.push(last);
        break;
      case 'Q': {
        const p0 = last;
        const n = steps([p0, { x: c.x1, y: c.y1 }, { x: c.x, y: c.y }], segLen);
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const u = 1 - t;
          cur.push({
            x: u * u * p0.x + 2 * u * t * c.x1 + t * t * c.x,
            y: u * u * p0.y + 2 * u * t * c.y1 + t * t * c.y,
          });
        }
        last = { x: c.x, y: c.y };
        break;
      }
      case 'C': {
        const p0 = last;
        const n = steps([p0, { x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }, { x: c.x, y: c.y }], segLen);
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const u = 1 - t;
          cur.push({
            x: u * u * u * p0.x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
            y: u * u * u * p0.y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
          });
        }
        last = { x: c.x, y: c.y };
        break;
      }
      case 'Z':
        flush();
        break;
    }
  }
  flush();

  return toShape(
    contours.map((pts) => pts.map((pt) => ({ x: Math.round(pt.x * SCALE), y: Math.round(pt.y * SCALE) }))),
  );
}

function steps(ctrl: Pt[], segLen: number): number {
  let len = 0;
  for (let i = 1; i < ctrl.length; i++) len += Math.hypot(ctrl[i].x - ctrl[i - 1].x, ctrl[i].y - ctrl[i - 1].y);
  return Math.min(64, Math.max(2, Math.ceil(len / segLen)));
}
```

- [ ] **Step 4: Lancer, vérifier le succès**

Run: `npx vitest run src/geometry/flatten.test.ts` → Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/geometry/flatten.ts src/geometry/flatten.test.ts
git commit -m "feat(geometry): flatten bezier path commands"
```

---

### Task 4: Parseur d'attribut `d` SVG (`geometry/svgpath.ts`)

**Files:**
- Create: `src/geometry/svgpath.ts`
- Test: `src/geometry/svgpath.test.ts`

**Interfaces:**
- Consumes: `PathCommand` (Task 2)
- Produces: `parseSvgPath(d: string, scale?: number, dx?: number, dy?: number): PathCommand[]` — supporte `M L H V C Q Z` absolus et `m l h v c q z` relatifs, répétitions implicites (paires après `M` = `L`). Applique `x*scale+dx`, `y*scale+dy`. Lève `Error('Unsupported SVG path command: X')` sinon.

- [ ] **Step 1: Test qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import { parseSvgPath } from './svgpath';

describe('parseSvgPath', () => {
  it('parses absolute M L H V Z', () => {
    expect(parseSvgPath('M1 2L3 4H5V6Z')).toEqual([
      { type: 'M', x: 1, y: 2 }, { type: 'L', x: 3, y: 4 },
      { type: 'L', x: 5, y: 4 }, { type: 'L', x: 5, y: 6 }, { type: 'Z' },
    ]);
  });

  it('parses cubic with compact numbers and implicit lineto', () => {
    expect(parseSvgPath('M0 0 1 1C1.5-2 .5.5 3 3')).toEqual([
      { type: 'M', x: 0, y: 0 }, { type: 'L', x: 1, y: 1 },
      { type: 'C', x1: 1.5, y1: -2, x2: 0.5, y2: 0.5, x: 3, y: 3 },
    ]);
  });

  it('parses relative commands', () => {
    expect(parseSvgPath('m1 1l2 0h1v1z')).toEqual([
      { type: 'M', x: 1, y: 1 }, { type: 'L', x: 3, y: 1 },
      { type: 'L', x: 4, y: 1 }, { type: 'L', x: 4, y: 2 }, { type: 'Z' },
    ]);
  });

  it('applies scale and translation', () => {
    expect(parseSvgPath('M2 4', 0.5, 10, 20)).toEqual([{ type: 'M', x: 11, y: 22 }]);
  });

  it('rejects arcs', () => {
    expect(() => parseSvgPath('M0 0A1 1 0 0 1 2 2')).toThrow('Unsupported SVG path command: A');
  });

  it('parses a real Remix icon', () => {
    const d = 'M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2Z';
    expect(parseSvgPath(d).filter((c) => c.type === 'C')).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run src/geometry/svgpath.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implémenter `src/geometry/svgpath.ts`**

```ts
import type { PathCommand } from './types';

const TOKEN = /([a-zA-Z])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;

export function parseSvgPath(d: string, scale = 1, dx = 0, dy = 0): PathCommand[] {
  const tokens: (string | number)[] = [];
  for (const m of d.matchAll(TOKEN)) tokens.push(m[1] ?? Number(m[2]));

  const out: PathCommand[] = [];
  const X = (x: number) => x * scale + dx;
  const Y = (y: number) => y * scale + dy;
  let i = 0;
  let cmd = '';
  let cx = 0, cy = 0, sx = 0, sy = 0;

  const num = () => {
    const t = tokens[i++];
    if (typeof t !== 'number') throw new Error(`Malformed SVG path near token ${i}`);
    return t;
  };

  while (i < tokens.length) {
    if (typeof tokens[i] === 'string') cmd = tokens[i++] as string;
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    switch (cmd.toUpperCase()) {
      case 'M': {
        cx = ox + num(); cy = oy + num(); sx = cx; sy = cy;
        out.push({ type: 'M', x: X(cx), y: Y(cy) });
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L': cx = ox + num(); cy = oy + num(); out.push({ type: 'L', x: X(cx), y: Y(cy) }); break;
      case 'H': cx = ox + num(); out.push({ type: 'L', x: X(cx), y: Y(cy) }); break;
      case 'V': cy = oy + num(); out.push({ type: 'L', x: X(cx), y: Y(cy) }); break;
      case 'C': {
        const x1 = ox + num(), y1 = oy + num(), x2 = ox + num(), y2 = oy + num();
        cx = ox + num(); cy = oy + num();
        out.push({ type: 'C', x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), x: X(cx), y: Y(cy) });
        break;
      }
      case 'Q': {
        const x1 = ox + num(), y1 = oy + num();
        cx = ox + num(); cy = oy + num();
        out.push({ type: 'Q', x1: X(x1), y1: Y(y1), x: X(cx), y: Y(cy) });
        break;
      }
      case 'Z': cx = sx; cy = sy; out.push({ type: 'Z' }); break;
      default: throw new Error(`Unsupported SVG path command: ${cmd}`);
    }
  }
  return out;
}
```

- [ ] **Step 4: Lancer, vérifier le succès**

Run: `npx vitest run src/geometry/svgpath.test.ts` → Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/geometry/svgpath.ts src/geometry/svgpath.test.ts
git commit -m "feat(geometry): parse svg path data"
```

---

### Task 5: Texte → forme (`geometry/text.ts`)

**Files:**
- Create: `src/geometry/text.ts`, `src/test/fonts.ts`
- Test: `src/geometry/text.test.ts`

**Interfaces:**
- Consumes: `flattenCommands` (Task 3), `union`, `emptyShape`, `toShape` (Task 2)
- Produces:
  - `interface TextOptions { text: string; fontSize: number; letterSpacing: number }`
  - `interface TextResult { shape: Shape; missing: string[] }`
  - `textToShape(font: Font, o: TextOptions): TextResult` — ligne de base à y=0, x démarre à 0, glyphes unis.
  - (tests) `loadTestFont(pkg: string, file: string): Font` dans `src/test/fonts.ts`

- [ ] **Step 1: Helper de test `src/test/fonts.ts`**

```ts
import { readFileSync } from 'node:fs';
import { parse, type Font } from 'opentype.js';

export function loadTestFont(pkg = 'pacifico', file = 'pacifico-latin-400-normal.woff'): Font {
  const b = readFileSync(`node_modules/@fontsource/${pkg}/files/${file}`);
  return parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}
```

- [ ] **Step 2: Test qui échoue `src/geometry/text.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { textToShape } from './text';
import { area, bounds } from './clip';
import { loadTestFont } from '../test/fonts';

const font = loadTestFont();

describe('textToShape', () => {
  it('produces a merged shape sized by fontSize', () => {
    const r = textToShape(font, { text: 'Lexie', fontSize: 30, letterSpacing: 0 });
    const b = bounds(r.shape)!;
    expect(area(r.shape)).toBeGreaterThan(100);
    expect(b.maxY).toBeLessThan(5);            // au plus un léger débordement sous la ligne de base
    expect(b.minY).toBeLessThan(-15);          // les ascendantes montent (Y vers le bas)
    expect(b.maxX - b.minX).toBeGreaterThan(50);
    expect(r.missing).toEqual([]);
  });

  it('letter spacing widens the text', () => {
    const a = bounds(textToShape(font, { text: 'abc', fontSize: 20, letterSpacing: 0 }).shape)!;
    const b = bounds(textToShape(font, { text: 'abc', fontSize: 20, letterSpacing: 5 }).shape)!;
    expect(b.maxX - b.minX).toBeCloseTo(a.maxX - a.minX + 10, 0);
  });

  it('reports missing glyphs, ignores spaces and does not draw .notdef', () => {
    const r = textToShape(font, { text: 'a 漢', fontSize: 20, letterSpacing: 0 });
    expect(r.missing).toEqual(['漢']);
    const a = textToShape(font, { text: 'a', fontSize: 20, letterSpacing: 0 });
    expect(area(r.shape)).toBeCloseTo(area(a.shape), 3);
  });

  it('empty text gives empty shape', () => {
    expect(textToShape(font, { text: '', fontSize: 20, letterSpacing: 0 }).shape).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Lancer, vérifier l'échec**

Run: `npx vitest run src/geometry/text.test.ts` → Expected: FAIL.

- [ ] **Step 4: Implémenter `src/geometry/text.ts`**

```ts
import type { Font } from 'opentype.js';
import { emptyShape, union } from './clip';
import { flattenCommands } from './flatten';
import type { PathCommand, Shape } from './types';

export interface TextOptions {
  text: string;
  fontSize: number;
  letterSpacing: number;
}

export interface TextResult {
  shape: Shape;
  missing: string[];
}

export function textToShape(font: Font, o: TextOptions): TextResult {
  const missing = Array.from(new Set(
    Array.from(o.text).filter((ch) => ch.trim() !== '' && font.charToGlyphIndex(ch) === 0),
  ));
  if (o.text.trim() === '') return { shape: emptyShape(), missing };

  const glyphs = font.stringToGlyphs(o.text);
  const unit = o.fontSize / font.unitsPerEm;
  const all = emptyShape();
  let x = 0;
  glyphs.forEach((g, i) => {
    if (g.index !== 0) { // .notdef (glyphe absent) : ne pas dessiner le rectangle de remplacement
      const cmds = g.getPath(x, 0, o.fontSize).commands as unknown as PathCommand[];
      for (const p of flattenCommands(cmds)) all.push(p);
    }
    x += (g.advanceWidth ?? 0) * unit + o.letterSpacing;
    const next = glyphs[i + 1];
    if (next) x += font.getKerningValue(g, next) * unit;
  });
  return { shape: union(all), missing };
}
```

- [ ] **Step 5: Lancer, vérifier le succès**

Run: `npx vitest run src/geometry/text.test.ts` → Expected: 4 PASS.
Si `font.stringToGlyphs` applique des ligatures, le test d'espacement peut dévier : vérifier avec `'abc'` (pas de ligature dans Pacifico).

- [ ] **Step 6: Commit**

```bash
git add src/geometry/text.ts src/geometry/text.test.ts src/test
git commit -m "feat(geometry): convert text to merged shape"
```

---

### Task 6: Orchestrateur porte-clés (`params.ts` types + `geometry/keychain.ts`)

**Files:**
- Create: `src/params.ts` (types et défauts seulement ; sanitize/encode en Task 9), `src/geometry/keychain.ts`
- Test: `src/geometry/keychain.test.ts`

**Interfaces:**
- Consumes: `textToShape` (Task 5), `parseSvgPath` (Task 4), `flattenCommands` (Task 3), clip (Task 2)
- Produces:
  - `src/params.ts`: `type HolePosition = 'left' | 'right' | 'top'`, `type Mode = 'laser' | 'print3d'`, `interface KeychainParams` (champs ci-dessous), `DEFAULT_PARAMS: KeychainParams`
  - `interface KeychainGeometry { base: Shape; letters: Shape; width: number; height: number; missing: string[] }`
  - `buildKeychain(p: KeychainParams, font: Font, iconPath?: string): KeychainGeometry | null` — `null` si rien à dessiner. Coordonnées normalisées : boîte de `base` commence à (0,0).

- [ ] **Step 1: Écrire `src/params.ts`**

```ts
export type HolePosition = 'left' | 'right' | 'top';
export type Mode = 'laser' | 'print3d';

export interface KeychainParams {
  text: string;
  fontId: string;
  fontSize: number;
  textWeight: number;
  letterSpacing: number;
  outlineWidth: number;
  iconEnabled: boolean;
  iconName: string;
  iconSize: number;
  iconGap: number;
  holeEnabled: boolean;
  holePosition: HolePosition;
  holeOffset: number;
  holeDiameter: number;
  holeMargin: number;
  mode: Mode;
  baseThickness: number;
  reliefHeight: number;
  pocketDepth: number;
  clearance: number;
  baseColor: string;
  lettersColor: string;
}

export const DEFAULT_PARAMS: KeychainParams = {
  text: 'Lexie',
  fontId: 'pacifico',
  fontSize: 30,
  textWeight: 0,
  letterSpacing: 0.3,
  outlineWidth: 3,
  iconEnabled: false,
  iconName: 'emotion-laugh-fill',
  iconSize: 20,
  iconGap: 2,
  holeEnabled: true,
  holePosition: 'left',
  holeOffset: 0,
  holeDiameter: 4,
  holeMargin: 2.5,
  mode: 'laser',
  baseThickness: 3,
  reliefHeight: 1.5,
  pocketDepth: 0.6,
  clearance: 0.15,
  baseColor: '#c8b496',
  lettersColor: '#ffffff',
};
```

Note : la spec dit `iconSize` = « hauteur capitale » par défaut ; on fixe 20 mm (≈ hauteur capitale de Pacifico à 30 mm), modifiable.

- [ ] **Step 2: Test qui échoue `src/geometry/keychain.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { buildKeychain, type KeychainGeometry } from './keychain';
import { area, bounds, difference, isOuter, toShape } from './clip';
import { DEFAULT_PARAMS, type KeychainParams } from '../params';
import { loadTestFont } from '../test/fonts';

const font = loadTestFont();
const P = (o: Partial<KeychainParams> = {}): KeychainParams => ({ ...DEFAULT_PARAMS, ...o });
const SMILEY = 'M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2Z';
const outers = (g: KeychainGeometry) => g.base.filter(isOuter);
const holes = (g: KeychainGeometry) => g.base.filter((p) => !isOuter(p));

describe('buildKeychain', () => {
  it('base contains letters and is normalized at origin', () => {
    const g = buildKeychain(P({ holeEnabled: false }), font)!;
    expect(area(difference(g.letters, g.base))).toBeCloseTo(0, 1);
    const b = bounds(g.base)!;
    expect(b.minX).toBeCloseTo(0, 2);
    expect(b.minY).toBeCloseTo(0, 2);
    expect(g.width).toBeCloseTo(b.maxX, 2);
    expect(g.height).toBeCloseTo(b.maxY, 2);
  });

  it('base has no inner holes', () => {
    const g = buildKeychain(P({ holeEnabled: false }), font)!;
    expect(holes(g)).toHaveLength(0);
    expect(area(g.base)).toBeGreaterThan(area(g.letters));
  });

  it('outline width grows the base', () => {
    const a = buildKeychain(P({ holeEnabled: false, outlineWidth: 2 }), font)!;
    const b = buildKeychain(P({ holeEnabled: false, outlineWidth: 4 }), font)!;
    expect(b.width).toBeCloseTo(a.width + 4, 0);
  });

  it('left hole adds an attached ear with one hole of the right size', () => {
    const without = buildKeychain(P({ holeEnabled: false }), font)!;
    const g = buildKeychain(P({ holePosition: 'left' }), font)!;
    expect(g.width).toBeGreaterThan(without.width);
    expect(outers(g)).toHaveLength(outers(without).length); // l'oreille est fusionnée, pas d'îlot en plus
    expect(holes(g)).toHaveLength(1);
    expect(Math.abs(area(toShape(holes(g))))).toBeCloseTo(Math.PI * 4, 0); // r = 2
  });

  it('top hole extends height', () => {
    const without = buildKeychain(P({ holeEnabled: false }), font)!;
    const g = buildKeychain(P({ holePosition: 'top' }), font)!;
    expect(g.height).toBeGreaterThan(without.height);
  });

  it('icon is placed left of the text', () => {
    const without = buildKeychain(P({ holeEnabled: false }), font)!;
    const g = buildKeychain(P({ holeEnabled: false, iconEnabled: true, iconSize: 20, iconGap: 2 }), font, SMILEY)!;
    // le disque du smiley fait 20 unités sur 24 → 20 * 20/24 mm, plus iconGap
    expect(g.width).toBeCloseTo(without.width + 20 * (20 / 24) + 2, 0);
  });

  it('textWeight thickens letters', () => {
    const a = buildKeychain(P({ holeEnabled: false }), font)!;
    const b = buildKeychain(P({ holeEnabled: false, textWeight: 1 }), font)!;
    expect(area(b.letters)).toBeGreaterThan(area(a.letters));
  });

  it('returns null when nothing to draw', () => {
    expect(buildKeychain(P({ text: '  ' }), font)).toBeNull();
  });

  it('icon alone is drawable', () => {
    expect(buildKeychain(P({ text: '', iconEnabled: true }), font, SMILEY)).not.toBeNull();
  });
});
```

- [ ] **Step 3: Lancer, vérifier l'échec**

Run: `npx vitest run src/geometry/keychain.test.ts` → Expected: FAIL (module absent).

- [ ] **Step 4: Implémenter `src/geometry/keychain.ts`**

```ts
import type { Font } from 'opentype.js';
import type { KeychainParams } from '../params';
import {
  area, bounds, circle, difference, intersect, offset, outerOnly, translate, union,
} from './clip';
import { flattenCommands } from './flatten';
import { parseSvgPath } from './svgpath';
import { textToShape } from './text';
import type { Shape } from './types';

export interface KeychainGeometry {
  base: Shape;
  letters: Shape;
  width: number;
  height: number;
  missing: string[];
}

const ICON_VIEWBOX = 24;

export function buildKeychain(p: KeychainParams, font: Font, iconPath?: string): KeychainGeometry | null {
  const t = textToShape(font, { text: p.text, fontSize: p.fontSize, letterSpacing: p.letterSpacing });
  let letters = t.shape;
  if (p.textWeight > 0 && letters.length) letters = offset(letters, p.textWeight / 2);

  if (p.iconEnabled && iconPath) {
    const tb = bounds(letters) ?? { minX: 0, maxX: 0, minY: -p.fontSize * 0.7, maxY: 0 };
    const k = p.iconSize / ICON_VIEWBOX;
    const raw = flattenCommands(parseSvgPath(iconPath, k));
    const ib = bounds(raw);
    if (ib) {
      const dx = tb.minX - p.iconGap - ib.maxX;
      const dy = (tb.minY + tb.maxY) / 2 - (ib.minY + ib.maxY) / 2;
      letters = union(letters, translate(union(raw), dx, dy));
    }
  }
  if (letters.length === 0) return null;

  let base = outerOnly(offset(letters, p.outlineWidth));
  if (p.holeEnabled) base = addHole(base, p);

  const b = bounds(base)!;
  base = translate(base, -b.minX, -b.minY);
  letters = translate(letters, -b.minX, -b.minY);
  return { base, letters, width: b.maxX - b.minX, height: b.maxY - b.minY, missing: t.missing };
}

/** Ajoute une oreille percée, glissée vers la base jusqu'à recouvrir ~25 % du disque. */
function addHole(base: Shape, p: KeychainParams): Shape {
  const b = bounds(base)!;
  const r = p.holeDiameter / 2;
  const R = r + p.holeMargin;
  const target = 0.25 * Math.PI * R * R;
  const step = 0.25;

  let cx: number, cy: number, sx: number, sy: number;
  if (p.holePosition === 'top') {
    cx = (b.minX + b.maxX) / 2 + p.holeOffset; cy = b.minY - r; sx = 0; sy = step;
  } else if (p.holePosition === 'right') {
    cx = b.maxX + r; cy = (b.minY + b.maxY) / 2 + p.holeOffset; sx = -step; sy = 0;
  } else {
    cx = b.minX - r; cy = (b.minY + b.maxY) / 2 + p.holeOffset; sx = step; sy = 0;
  }

  const maxIter = Math.ceil((b.maxX - b.minX + b.maxY - b.minY) / step);
  for (let i = 0; i < maxIter && area(intersect(circle(cx, cy, R), base)) < target; i++) {
    cx += sx; cy += sy;
  }
  return difference(union(base, circle(cx, cy, R)), circle(cx, cy, r));
}
```

- [ ] **Step 5: Lancer, vérifier le succès**

Run: `npx vitest run src/geometry/keychain.test.ts` → Expected: 9 PASS.
Si `icon is placed left` dévie d'une fraction de mm à cause de l'offset `outlineWidth` arrondi, la tolérance `toBeCloseTo(..., 0)` (±0,5 mm) doit suffire ; sinon vérifier `dx`.

- [ ] **Step 6: Commit**

```bash
git add src/params.ts src/geometry/keychain.ts src/geometry/keychain.test.ts
git commit -m "feat(geometry): build keychain base, letters, icon and hole"
```

---

### Task 7: Extrusion et maillages 3D (`mesh/extrude.ts`, `mesh/keychain3d.ts`)

**Files:**
- Create: `src/mesh/extrude.ts`, `src/mesh/keychain3d.ts`, `src/mesh/check.ts`
- Test: `src/mesh/extrude.test.ts`, `src/mesh/keychain3d.test.ts`

**Interfaces:**
- Consumes: `groupPolygons`, `cleanPath`, `difference`, `offset` (Task 2), `KeychainGeometry` (Task 6), `KeychainParams` (Task 6)
- Produces:
  - `interface Mesh { positions: number[]; indices: number[] }` (mm, Z vers le haut, Y 3D = −Y SVG)
  - `extrude(s: Shape, z0: number, z1: number): Mesh`
  - `mergeMeshes(...m: Mesh[]): Mesh`
  - `buildMeshes(g: KeychainGeometry, p: Pick<KeychainParams, 'baseThickness' | 'reliefHeight' | 'pocketDepth' | 'clearance'>): { base: Mesh; letters: Mesh }`
  - (tests) `isWatertight(m: Mesh): boolean`, `volume(m: Mesh): number` dans `src/mesh/check.ts`

- [ ] **Step 1: Écrire `src/mesh/check.ts`**

```ts
import type { Mesh } from './extrude';

/** Chaque arête orientée a→b apparaît une fois et son opposée b→a une fois. */
export function isWatertight(m: Mesh): boolean {
  const edges = new Map<string, number>();
  for (let i = 0; i < m.indices.length; i += 3) {
    const t = [m.indices[i], m.indices[i + 1], m.indices[i + 2]];
    for (let k = 0; k < 3; k++) {
      const key = `${t[k]}>${t[(k + 1) % 3]}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  for (const [key, n] of edges) {
    if (n !== 1) return false;
    const [a, b] = key.split('>');
    if (edges.get(`${b}>${a}`) !== 1) return false;
  }
  return true;
}

/** Volume signé (positif si normales sortantes). */
export function volume(m: Mesh): number {
  const P = m.positions;
  let v = 0;
  for (let i = 0; i < m.indices.length; i += 3) {
    const [a, b, c] = [m.indices[i] * 3, m.indices[i + 1] * 3, m.indices[i + 2] * 3];
    v += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1])
      - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c])
      + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
  }
  return v;
}
```

- [ ] **Step 2: Test qui échoue `src/mesh/extrude.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { extrude, mergeMeshes } from './extrude';
import { isWatertight, volume } from './check';
import { circle, difference, makePath, toShape } from '../geometry/clip';

const rect = (x: number, y: number, w: number, h: number) =>
  toShape([makePath([x, y, x + w, y, x + w, y + h, x, y + h])]);

describe('extrude', () => {
  it('box is watertight with correct volume', () => {
    const m = extrude(rect(0, 0, 10, 20), 0, 3);
    expect(isWatertight(m)).toBe(true);
    expect(volume(m)).toBeCloseTo(600, 3);
  });

  it('shape with hole is watertight', () => {
    const m = extrude(difference(rect(0, 0, 10, 10), rect(3, 3, 4, 4)), 1, 2);
    expect(isWatertight(m)).toBe(true);
    expect(volume(m)).toBeCloseTo(84, 3);
  });

  it('collinear points do not break manifoldness', () => {
    const p = makePath([0, 0, 5, 0, 10, 0, 10, 10, 0, 10]);
    expect(isWatertight(extrude(toShape([p]), 0, 1))).toBe(true);
  });

  it('circle is watertight', () => {
    const m = extrude(circle(0, 0, 5), 0, 2);
    expect(isWatertight(m)).toBe(true);
    expect(volume(m)).toBeCloseTo(Math.PI * 25 * 2, 0);
  });

  it('flips Y so text reads from above', () => {
    const m = extrude(rect(0, 0, 1, 5), 0, 1);
    const ys = m.positions.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBeCloseTo(-5, 6);
    expect(Math.max(...ys)).toBeCloseTo(0, 6);
  });

  it('mergeMeshes offsets indices', () => {
    const a = extrude(rect(0, 0, 1, 1), 0, 1);
    const m = mergeMeshes(a, extrude(rect(5, 5, 1, 1), 0, 1));
    expect(isWatertight(m)).toBe(true);
    expect(volume(m)).toBeCloseTo(2, 6);
  });
});
```

- [ ] **Step 3: Lancer, vérifier l'échec**

Run: `npx vitest run src/mesh/extrude.test.ts` → Expected: FAIL.

- [ ] **Step 4: Implémenter `src/mesh/extrude.ts`**

```ts
import earcut from 'earcut';
import { cleanPath, groupPolygons } from '../geometry/clip';
import { SCALE, type Shape } from '../geometry/types';

export interface Mesh {
  positions: number[];
  indices: number[];
}

/**
 * Extrude une forme 2D entre z0 et z1. Y SVG (vers le bas) devient −Y 3D.
 * Faces haut/bas triangulées par earcut sur les mêmes sommets que les murs → étanche.
 */
export function extrude(s: Shape, z0: number, z1: number): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];

  for (const g of groupPolygons(s)) {
    // rings en coordonnées 3D (x, -y) entières µm ; outer CCW, holes CW vus de dessus
    const rings = [g.outer, ...g.holes]
      .map((p) => cleanPath(p).map((pt) => [pt.x, -pt.y] as [number, number]))
      .filter((r) => r.length >= 3)
      .map((r, i) => (signedArea(r) > 0) === (i === 0) ? r : r.reverse());
    if (rings.length === 0 || signedArea(rings[0]) <= 0) continue;

    const flat: number[] = [];
    const holeIdx: number[] = [];
    for (let i = 0; i < rings.length; i++) {
      if (i > 0) holeIdx.push(flat.length / 2);
      for (const [x, y] of rings[i]) flat.push(x, y);
    }
    const n = flat.length / 2;
    const bottom = positions.length / 3;
    const top = bottom + n;
    for (let i = 0; i < n; i++) positions.push(flat[2 * i] / SCALE, flat[2 * i + 1] / SCALE, z0);
    for (let i = 0; i < n; i++) positions.push(flat[2 * i] / SCALE, flat[2 * i + 1] / SCALE, z1);

    const tris = earcut(flat, holeIdx.length ? holeIdx : null, 2);
    for (let i = 0; i < tris.length; i += 3) {
      let [a, b, c] = [tris[i], tris[i + 1], tris[i + 2]];
      if (triArea(flat, a, b, c) < 0) [b, c] = [c, b];
      indices.push(top + a, top + b, top + c);       // dessus, CCW vu de +Z
      indices.push(bottom + a, bottom + c, bottom + b); // dessous, inversé
    }

    let start = 0;
    for (const r of rings) {
      const len = r.length;
      for (let i = 0; i < len; i++) {
        const a = start + i;
        const b = start + ((i + 1) % len);
        indices.push(bottom + a, bottom + b, top + b);
        indices.push(bottom + a, top + b, top + a);
      }
      start += len;
    }
  }
  return { positions, indices };
}

export function mergeMeshes(...meshes: Mesh[]): Mesh {
  const out: Mesh = { positions: [], indices: [] };
  for (const m of meshes) {
    const o = out.positions.length / 3;
    out.positions.push(...m.positions);
    for (const i of m.indices) out.indices.push(i + o);
  }
  return out;
}

function signedArea(r: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i];
    const [x2, y2] = r[(i + 1) % r.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

function triArea(f: number[], a: number, b: number, c: number): number {
  return (f[2 * b] - f[2 * a]) * (f[2 * c + 1] - f[2 * a + 1])
    - (f[2 * c] - f[2 * a]) * (f[2 * b + 1] - f[2 * a + 1]);
}
```

Attention : `mergeMeshes` avec `push(...array)` peut dépasser la pile sur de très gros maillages ; si un test ou l'appli lève `RangeError: Maximum call stack size exceeded`, remplacer par une boucle `for`.

- [ ] **Step 5: Lancer `extrude.test.ts`**

Run: `npx vitest run src/mesh/extrude.test.ts` → Expected: 6 PASS.
Si `collinear points` échoue : earcut a filtré un sommet que `cleanPath` n'a pas retiré. Vérifier que `cleanPath` est bien appliqué avant la construction de `flat` (c'est la seule source des sommets).

- [ ] **Step 6: Test qui échoue `src/mesh/keychain3d.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { buildKeychain } from '../geometry/keychain';
import { buildMeshes } from './keychain3d';
import { isWatertight, volume } from './check';
import { DEFAULT_PARAMS } from '../params';
import { loadTestFont } from '../test/fonts';

const font = loadTestFont();
const g = buildKeychain(DEFAULT_PARAMS, font)!;

const zRange = (pos: number[]) => {
  const zs = pos.filter((_, i) => i % 3 === 2);
  return [Math.min(...zs), Math.max(...zs)];
};

describe('buildMeshes', () => {
  it('builds watertight base and letters at expected heights', () => {
    const m = buildMeshes(g, DEFAULT_PARAMS);
    expect(isWatertight(m.base)).toBe(true);
    expect(isWatertight(m.letters)).toBe(true);
    expect(volume(m.base)).toBeGreaterThan(0);
    expect(volume(m.letters)).toBeGreaterThan(0);
    expect(zRange(m.base.positions)).toEqual([0, 3]);
    const [lz0, lz1] = zRange(m.letters.positions);
    expect(lz0).toBeCloseTo(2.4, 6);
    expect(lz1).toBeCloseTo(4.5, 6);
  });

  it('without pocket the letters sit on top', () => {
    const m = buildMeshes(g, { ...DEFAULT_PARAMS, pocketDepth: 0 });
    expect(zRange(m.letters.positions)[0]).toBeCloseTo(3, 6);
    expect(isWatertight(m.base)).toBe(true);
  });

  it('pocket removes material from the base', () => {
    const solid = buildMeshes(g, { ...DEFAULT_PARAMS, pocketDepth: 0 });
    const pocketed = buildMeshes(g, DEFAULT_PARAMS);
    expect(volume(pocketed.base)).toBeLessThan(volume(solid.base));
  });
});
```

- [ ] **Step 7: Implémenter `src/mesh/keychain3d.ts`**

```ts
import { difference, offset } from '../geometry/clip';
import type { KeychainGeometry } from '../geometry/keychain';
import type { KeychainParams } from '../params';
import { extrude, mergeMeshes, type Mesh } from './extrude';

export type PrintParams = Pick<KeychainParams, 'baseThickness' | 'reliefHeight' | 'pocketDepth' | 'clearance'>;

/** Base = 2 coques fermées (tranche pleine + tranche à poche), lettres en relief depuis le fond de poche. */
export function buildMeshes(g: KeychainGeometry, p: PrintParams): { base: Mesh; letters: Mesh } {
  const H = p.baseThickness;
  const d = Math.min(p.pocketDepth, H);
  let base: Mesh;
  if (d > 0) {
    const pocket = offset(g.letters, p.clearance);
    base = mergeMeshes(extrude(g.base, 0, H - d), extrude(difference(g.base, pocket), H - d, H));
  } else {
    base = extrude(g.base, 0, H);
  }
  const letters = extrude(g.letters, H - d, H + p.reliefHeight);
  return { base, letters };
}
```

- [ ] **Step 8: Lancer**

Run: `npx vitest run src/mesh` → Expected: 9 PASS.

- [ ] **Step 9: Commit**

```bash
git add src/mesh
git commit -m "feat(mesh): extrude shapes into watertight meshes"
```

---

### Task 8: Exports SVG, 3MF, zip laser (`export/*`)

**Files:**
- Create: `src/export/svg.ts`, `src/export/threemf.ts`, `src/export/bundle.ts`, `src/export/download.ts`
- Test: `src/export/svg.test.ts`, `src/export/threemf.test.ts`, `src/export/bundle.test.ts`

**Interfaces:**
- Consumes: `Shape`, `SCALE` (Task 2), `Mesh` (Task 7), `KeychainGeometry` (Task 6)
- Produces:
  - `shapeToSvg(s: Shape, width: number, height: number, stroke?: string): string`
  - `interface ThreeMfObject { name: string; color: string; mesh: Mesh }`, `build3mf(objects: ThreeMfObject[]): Uint8Array`
  - `fileBaseName(text: string): string`, `laserZip(g: KeychainGeometry): Uint8Array` (contient `base.svg`, `lettres.svg`)
  - `download(data: Uint8Array | string, filename: string, mime: string): void`

- [ ] **Step 1: Tests qui échouent**

`src/export/svg.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { shapeToSvg } from './svg';
import { makePath, toShape } from '../geometry/clip';

describe('shapeToSvg', () => {
  it('writes mm dimensions and one path per contour', () => {
    const s = toShape([
      makePath([0, 0, 10, 0, 10, 5, 0, 5]),
      makePath([20, 0, 21.5, 0, 21.5, 1]),
    ]);
    const svg = shapeToSvg(s, 21.5, 5);
    expect(svg).toContain('width="21.5mm"');
    expect(svg).toContain('height="5mm"');
    expect(svg).toContain('viewBox="0 0 21.5 5"');
    expect(svg).toContain('M0 0L10 0L10 5L0 5Z');
    expect(svg).toContain('M20 0L21.5 0L21.5 1Z');
    expect(svg).toContain('stroke="#ff0000"');
    expect(svg).toContain('fill="none"');
  });
});
```

`src/export/threemf.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { build3mf } from './threemf';
import type { Mesh } from '../mesh/extrude';

const tri: Mesh = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3] };

describe('build3mf', () => {
  it('produces a valid 3MF package with two named objects', () => {
    const files = unzipSync(build3mf([
      { name: 'base', color: '#c8b496', mesh: tri },
      { name: 'lettres', color: '#ffffff', mesh: tri },
    ]));
    expect(Object.keys(files).sort()).toEqual(['3D/3dmodel.model', '[Content_Types].xml', '_rels/.rels']);
    const model = strFromU8(files['3D/3dmodel.model']);
    expect(model).toContain('unit="millimeter"');
    expect(model.match(/<object /g)).toHaveLength(2);
    expect(model).toContain('name="base"');
    expect(model).toContain('name="lettres"');
    expect(model.match(/<vertex /g)).toHaveLength(8);
    expect(model.match(/<triangle /g)).toHaveLength(8);
    expect(model.match(/<item /g)).toHaveLength(2);
    expect(model).toContain('displaycolor="#C8B496FF"');
    expect(strFromU8(files['_rels/.rels'])).toContain('Target="/3D/3dmodel.model"');
  });
});
```

`src/export/bundle.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { fileBaseName, laserZip } from './bundle';
import { buildKeychain } from '../geometry/keychain';
import { DEFAULT_PARAMS } from '../params';
import { loadTestFont } from '../test/fonts';

describe('bundle', () => {
  it('fileBaseName slugifies', () => {
    expect(fileBaseName('Léa & Zoé !')).toBe('lea-zoe');
    expect(fileBaseName('   ')).toBe('porte-cles');
  });

  it('laserZip contains base and letters svg with same size', () => {
    const g = buildKeychain(DEFAULT_PARAMS, loadTestFont())!;
    const files = unzipSync(laserZip(g));
    expect(Object.keys(files).sort()).toEqual(['base.svg', 'lettres.svg']);
    const w = `width="${+g.width.toFixed(3)}mm"`;
    expect(strFromU8(files['base.svg'])).toContain(w);
    expect(strFromU8(files['lettres.svg'])).toContain(w);
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run src/export` → Expected: FAIL (modules absents).

- [ ] **Step 3: Implémenter**

`src/export/svg.ts`:
```ts
import { SCALE, type Shape } from '../geometry/types';

const n = (v: number) => String(+v.toFixed(3));

/** SVG en mm, trait fin (découpe laser), un sous-chemin par contour. */
export function shapeToSvg(s: Shape, width: number, height: number, stroke = '#ff0000'): string {
  const d = s
    .filter((p) => p.length >= 3)
    .map((p) => p.map((pt, i) => `${i ? 'L' : 'M'}${n(pt.x / SCALE)} ${n(pt.y / SCALE)}`).join('') + 'Z')
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}mm" height="${n(height)}mm" viewBox="0 0 ${n(width)} ${n(height)}">
  <path d="${d}" fill="none" fill-rule="evenodd" stroke="${stroke}" stroke-width="0.01"/>
</svg>
`;
}
```

`src/export/threemf.ts`:
```ts
import { strToU8, zipSync } from 'fflate';
import type { Mesh } from '../mesh/extrude';

export interface ThreeMfObject {
  name: string;
  color: string;
  mesh: Mesh;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const f = (v: number) => String(+v.toFixed(4));

export function build3mf(objects: ThreeMfObject[]): Uint8Array {
  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="fr-FR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n<resources>\n<basematerials id="1">');
  for (const o of objects) parts.push(`<base name="${esc(o.name)}" displaycolor="${o.color.toUpperCase()}FF"/>`);
  parts.push('</basematerials>\n');
  objects.forEach((o, k) => {
    parts.push(`<object id="${k + 2}" type="model" name="${esc(o.name)}" pid="1" pindex="${k}"><mesh><vertices>`);
    const P = o.mesh.positions;
    for (let i = 0; i < P.length; i += 3) parts.push(`<vertex x="${f(P[i])}" y="${f(P[i + 1])}" z="${f(P[i + 2])}"/>`);
    parts.push('</vertices><triangles>');
    const I = o.mesh.indices;
    for (let i = 0; i < I.length; i += 3) parts.push(`<triangle v1="${I[i]}" v2="${I[i + 1]}" v3="${I[i + 2]}"/>`);
    parts.push('</triangles></mesh></object>\n');
  });
  parts.push('</resources>\n<build>');
  objects.forEach((_, k) => parts.push(`<item objectid="${k + 2}"/>`));
  parts.push('</build>\n</model>\n');

  return zipSync({
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    '_rels/.rels': strToU8(RELS),
    '3D/3dmodel.model': strToU8(parts.join('')),
  });
}
```

`src/export/bundle.ts`:
```ts
import { strToU8, zipSync } from 'fflate';
import type { KeychainGeometry } from '../geometry/keychain';
import { shapeToSvg } from './svg';

export function fileBaseName(text: string): string {
  const slug = text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'porte-cles';
}

export function laserZip(g: KeychainGeometry): Uint8Array {
  return zipSync({
    'base.svg': strToU8(shapeToSvg(g.base, g.width, g.height)),
    'lettres.svg': strToU8(shapeToSvg(g.letters, g.width, g.height)),
  });
}
```

`src/export/download.ts`:
```ts
export function download(data: Uint8Array | string, filename: string, mime: string): void {
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [ ] **Step 4: Lancer**

Run: `npx vitest run src/export` → Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/export
git commit -m "feat(export): add svg, 3mf and laser zip exports"
```

---

### Task 9: Paramètres persistants (`params.ts` sanitize/encode)

**Files:**
- Modify: `src/params.ts`
- Test: `src/params.test.ts`

**Interfaces:**
- Consumes: `KeychainParams`, `DEFAULT_PARAMS` (Task 6)
- Produces: `sanitize(raw: unknown): KeychainParams`, `encodeParams(p: KeychainParams): string`, `decodeParams(s: string): KeychainParams | null`

- [ ] **Step 1: Test qui échoue `src/params.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_PARAMS, decodeParams, encodeParams, sanitize } from './params';

describe('params', () => {
  it('sanitize fills defaults and drops bad types', () => {
    const p = sanitize({ text: 'Zoé', fontSize: 'big', foo: 1, holePosition: 'bottom', mode: 'print3d' });
    expect(p.text).toBe('Zoé');
    expect(p.fontSize).toBe(DEFAULT_PARAMS.fontSize);
    expect(p.holePosition).toBe('left');
    expect(p.mode).toBe('print3d');
    expect('foo' in p).toBe(false);
  });

  it('sanitize clamps negatives and non-finite numbers', () => {
    const p = sanitize({ outlineWidth: -3, fontSize: Infinity, letterSpacing: -2 });
    expect(p.outlineWidth).toBe(0);
    expect(p.fontSize).toBe(DEFAULT_PARAMS.fontSize);
    expect(p.letterSpacing).toBe(-2); // seul paramètre autorisé négatif
  });

  it('sanitize rejects bad colors', () => {
    expect(sanitize({ baseColor: 'red' }).baseColor).toBe(DEFAULT_PARAMS.baseColor);
    expect(sanitize({ baseColor: '#00ff00' }).baseColor).toBe('#00ff00');
  });

  it('round-trips through encode/decode', () => {
    const p = { ...DEFAULT_PARAMS, text: 'Léa ❤', fontSize: 22 };
    expect(decodeParams(encodeParams(p))).toEqual(p);
  });

  it('decode returns null on garbage', () => {
    expect(decodeParams('%%%not-base64')).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run src/params.test.ts` → Expected: FAIL (exports absents).

- [ ] **Step 3: Ajouter à `src/params.ts`**

```ts
const ENUMS: Partial<Record<keyof KeychainParams, readonly string[]>> = {
  holePosition: ['left', 'right', 'top'],
  mode: ['laser', 'print3d'],
};
const MAY_BE_NEGATIVE: (keyof KeychainParams)[] = ['letterSpacing', 'holeOffset'];
const COLOR = /^#[0-9a-f]{6}$/i;

export function sanitize(raw: unknown): KeychainParams {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_PARAMS } as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_PARAMS) as (keyof KeychainParams)[]) {
    const def = DEFAULT_PARAMS[key];
    const v = src[key];
    if (typeof v !== typeof def) continue;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) continue;
      out[key] = MAY_BE_NEGATIVE.includes(key) ? v : Math.max(0, v);
    } else if (typeof v === 'string') {
      if (ENUMS[key] && !ENUMS[key]!.includes(v)) continue;
      if (key.endsWith('Color') && !COLOR.test(v)) continue;
      out[key] = v;
    } else {
      out[key] = v;
    }
  }
  return out as unknown as KeychainParams;
}

export function encodeParams(p: KeychainParams): string {
  const bytes = new TextEncoder().encode(JSON.stringify(p));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeParams(s: string): KeychainParams | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return sanitize(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Lancer**

Run: `npx vitest run src/params.test.ts` → Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/params.ts src/params.test.ts
git commit -m "feat: sanitize and encode keychain params"
```

---

### Task 10: Index des icônes (`scripts/build-icons.mjs`, `icons/icons.ts`)

**Files:**
- Create: `scripts/build-icons.mjs`, `src/icons/icons.ts`
- Test: `src/icons/icons.test.ts`

**Interfaces:**
- Produces:
  - fichier généré `src/icons/icons.json` : `{ name: string; category: string; path: string }[]`
  - `interface IconEntry { name: string; category: string; path: string }`
  - `CATEGORY_LABELS: Record<string, string>` (dossier Remix → libellé FR)
  - `loadIcons(): Promise<IconEntry[]>` (import dynamique, mis en cache)
  - `filterIcons(icons: IconEntry[], query: string, category: string | null): IconEntry[]`

- [ ] **Step 1: Écrire `scripts/build-icons.mjs`**

```js
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = 'node_modules/remixicon/icons';
const out = [];
for (const category of readdirSync(root).sort()) {
  if (category === 'Logos') continue;
  for (const file of readdirSync(join(root, category)).sort()) {
    if (!file.endsWith('-fill.svg')) continue;
    const svg = readFileSync(join(root, category, file), 'utf8');
    const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
    if (paths.length !== 1) continue;
    out.push({ name: file.replace(/\.svg$/, ''), category, path: paths[0] });
  }
}
mkdirSync('src/icons', { recursive: true });
writeFileSync('src/icons/icons.json', JSON.stringify(out));
console.log(`icons.json: ${out.length} icons`);
```

Run: `npm run icons` → Expected: `icons.json: ~1500 icons`.

- [ ] **Step 2: Test qui échoue `src/icons/icons.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { CATEGORY_LABELS, filterIcons, loadIcons } from './icons';
import { parseSvgPath } from '../geometry/svgpath';

describe('icons', () => {
  it('loads fill icons without logos', async () => {
    const icons = await loadIcons();
    expect(icons.length).toBeGreaterThan(1000);
    expect(icons.every((i) => i.name.endsWith('-fill'))).toBe(true);
    expect(icons.some((i) => i.category === 'Logos')).toBe(false);
    expect(icons.find((i) => i.name === 'emotion-laugh-fill')).toBeDefined();
  });

  it('every icon path is parseable', async () => {
    for (const i of await loadIcons()) expect(() => parseSvgPath(i.path)).not.toThrow();
  });

  it('every category has a French label', async () => {
    const cats = new Set((await loadIcons()).map((i) => i.category));
    for (const c of cats) expect(CATEGORY_LABELS[c]).toBeTruthy();
  });

  it('filters by query and category', async () => {
    const icons = await loadIcons();
    const r = filterIcons(icons, 'heart', null);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((i) => i.name.includes('heart'))).toBe(true);
    expect(filterIcons(icons, '', 'Weather').every((i) => i.category === 'Weather')).toBe(true);
  });
});
```

- [ ] **Step 3: Lancer, vérifier l'échec**

Run: `npx vitest run src/icons` → Expected: FAIL.

- [ ] **Step 4: Implémenter `src/icons/icons.ts`**

```ts
export interface IconEntry {
  name: string;
  category: string;
  path: string;
}

export const CATEGORY_LABELS: Record<string, string> = {
  'User & Faces': 'Visages',
  'Health & Medical': 'Santé',
  'Game & Sports': 'Jeux & sports',
  Weather: 'Météo',
  Food: 'Nourriture',
  Map: 'Lieux',
  Buildings: 'Bâtiments',
  Media: 'Médias',
  Communication: 'Communication',
  Business: 'Business',
  Finance: 'Finance',
  Design: 'Design',
  Development: 'Dev',
  Device: 'Appareils',
  Document: 'Documents',
  Editor: 'Éditeur',
  Arrows: 'Flèches',
  System: 'Système',
  Others: 'Divers',
};

let cache: Promise<IconEntry[]> | null = null;

export function loadIcons(): Promise<IconEntry[]> {
  cache ??= import('./icons.json').then((m) => m.default as IconEntry[]);
  return cache;
}

export function filterIcons(icons: IconEntry[], query: string, category: string | null): IconEntry[] {
  const q = query.trim().toLowerCase();
  return icons.filter((i) => (!category || i.category === category) && (!q || i.name.includes(q)));
}
```

Si `CATEGORY_LABELS` manque une catégorie, le test le dira : ajouter la ligne correspondante.

- [ ] **Step 5: Lancer**

Run: `npx vitest run src/icons` → Expected: 4 PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts src/icons/icons.ts src/icons/icons.test.ts
git commit -m "feat(icons): index remix fill icons"
```

---

### Task 11: Registre des polices (`fonts/registry.ts`)

**Files:**
- Create: `src/fonts/registry.ts`, `src/fonts/fontsource.d.ts`

**Interfaces:**
- Produces:
  - `interface FontEntry { id: string; label: string; family: string; url?: string; font?: Font }`
  - `FONTS: FontEntry[]` (15 polices embarquées)
  - `loadFont(id: string): Promise<Font>` (cache ; lève une erreur si id inconnu)
  - `importFont(file: File): Promise<FontEntry>` (parse, enregistre `custom:<nom>`, lève si invalide)
  - `listFonts(): FontEntry[]` (embarquées + importées)

Pas de test unitaire (dépend de `fetch`/`?url` Vite) ; vérifié manuellement en Task 13.

- [ ] **Step 1: Écrire `src/fonts/registry.ts`**

```ts
import { parse, type Font } from 'opentype.js';
import '@fontsource/pacifico/400.css';
import '@fontsource/lobster/400.css';
import '@fontsource/dancing-script/700.css';
import '@fontsource/great-vibes/400.css';
import '@fontsource/satisfy/400.css';
import '@fontsource/kaushan-script/400.css';
import '@fontsource/yellowtail/400.css';
import '@fontsource/cookie/400.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/baloo-2/700.css';
import '@fontsource/righteous/400.css';
import '@fontsource/bungee/400.css';
import '@fontsource/titan-one/400.css';
import '@fontsource/luckiest-guy/400.css';
import '@fontsource/chewy/400.css';
import pacifico from '@fontsource/pacifico/files/pacifico-latin-400-normal.woff?url';
import lobster from '@fontsource/lobster/files/lobster-latin-400-normal.woff?url';
import dancing from '@fontsource/dancing-script/files/dancing-script-latin-700-normal.woff?url';
import greatVibes from '@fontsource/great-vibes/files/great-vibes-latin-400-normal.woff?url';
import satisfy from '@fontsource/satisfy/files/satisfy-latin-400-normal.woff?url';
import kaushan from '@fontsource/kaushan-script/files/kaushan-script-latin-400-normal.woff?url';
import yellowtail from '@fontsource/yellowtail/files/yellowtail-latin-400-normal.woff?url';
import cookie from '@fontsource/cookie/files/cookie-latin-400-normal.woff?url';
import fredoka from '@fontsource/fredoka/files/fredoka-latin-700-normal.woff?url';
import baloo from '@fontsource/baloo-2/files/baloo-2-latin-700-normal.woff?url';
import righteous from '@fontsource/righteous/files/righteous-latin-400-normal.woff?url';
import bungee from '@fontsource/bungee/files/bungee-latin-400-normal.woff?url';
import titanOne from '@fontsource/titan-one/files/titan-one-latin-400-normal.woff?url';
import luckiest from '@fontsource/luckiest-guy/files/luckiest-guy-latin-400-normal.woff?url';
import chewy from '@fontsource/chewy/files/chewy-latin-400-normal.woff?url';

export interface FontEntry {
  id: string;
  label: string;
  /** famille CSS pour l'aperçu dans la liste */
  family: string;
  url?: string;
  font?: Font;
}

export const FONTS: FontEntry[] = [
  { id: 'pacifico', label: 'Pacifico', family: 'Pacifico', url: pacifico },
  { id: 'lobster', label: 'Lobster', family: 'Lobster', url: lobster },
  { id: 'dancing-script', label: 'Dancing Script', family: 'Dancing Script', url: dancing },
  { id: 'great-vibes', label: 'Great Vibes', family: 'Great Vibes', url: greatVibes },
  { id: 'satisfy', label: 'Satisfy', family: 'Satisfy', url: satisfy },
  { id: 'kaushan-script', label: 'Kaushan Script', family: 'Kaushan Script', url: kaushan },
  { id: 'yellowtail', label: 'Yellowtail', family: 'Yellowtail', url: yellowtail },
  { id: 'cookie', label: 'Cookie', family: 'Cookie', url: cookie },
  { id: 'fredoka', label: 'Fredoka', family: 'Fredoka', url: fredoka },
  { id: 'baloo-2', label: 'Baloo 2', family: 'Baloo 2', url: baloo },
  { id: 'righteous', label: 'Righteous', family: 'Righteous', url: righteous },
  { id: 'bungee', label: 'Bungee', family: 'Bungee', url: bungee },
  { id: 'titan-one', label: 'Titan One', family: 'Titan One', url: titanOne },
  { id: 'luckiest-guy', label: 'Luckiest Guy', family: 'Luckiest Guy', url: luckiest },
  { id: 'chewy', label: 'Chewy', family: 'Chewy', url: chewy },
];

const custom: FontEntry[] = [];
const cache = new Map<string, Promise<Font>>();

export function listFonts(): FontEntry[] {
  return [...FONTS, ...custom];
}

export function loadFont(id: string): Promise<Font> {
  const entry = listFonts().find((f) => f.id === id);
  if (!entry) return Promise.reject(new Error(`Police inconnue : ${id}`));
  if (entry.font) return Promise.resolve(entry.font);
  let p = cache.get(id);
  if (!p) {
    p = fetch(entry.url!)
      .then((r) => {
        if (!r.ok) throw new Error(`Téléchargement de la police impossible (${r.status})`);
        return r.arrayBuffer();
      })
      .then((buf) => parse(buf));
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

export async function importFont(file: File): Promise<FontEntry> {
  let font: Font;
  try {
    font = parse(await file.arrayBuffer());
  } catch {
    throw new Error(`« ${file.name} » n'est pas une police TTF/OTF/WOFF valide`);
  }
  const name = file.name.replace(/\.(ttf|otf|woff)$/i, '');
  const entry: FontEntry = { id: `custom:${name}`, label: `${name} (importée)`, family: 'inherit', font };
  const i = custom.findIndex((f) => f.id === entry.id);
  if (i >= 0) custom[i] = entry; else custom.push(entry);
  return entry;
}
```

- [ ] **Step 2: Typage des imports `?url` et CSS** — `vite/client` (déjà dans `tsconfig` `types`) déclare `*?url` et `*.css`. Créer `src/fonts/fontsource.d.ts` seulement si `npm run check` se plaint :

```ts
declare module '*.woff?url' {
  const url: string;
  export default url;
}
```

- [ ] **Step 3: Vérifier le typage**

Run: `npx svelte-check --tsconfig ./tsconfig.json` → Expected: 0 erreur dans `src/fonts`.

- [ ] **Step 4: Commit**

```bash
git add src/fonts
git commit -m "feat(fonts): register embedded fontsource fonts"
```

---

### Task 12: Aperçu 2D (`ui/Preview2D.svelte`)

**Files:**
- Create: `src/ui/Preview2D.svelte`

**Interfaces:**
- Consumes: `KeychainGeometry` (Task 6), `SCALE` (Task 2)
- Produces: composant `<Preview2D geometry={KeychainGeometry} />` — deux vues empilées (base rouge + lettres bleues ; lettres seules rouges), grille 5 mm / 25 mm, graduations tous les 10 mm, cotes largeur et hauteur.

- [ ] **Step 1: Écrire le composant**

```svelte
<script lang="ts">
  import type { KeychainGeometry } from '../geometry/keychain';
  import { SCALE, type Shape } from '../geometry/types';

  let { geometry }: { geometry: KeychainGeometry } = $props();

  const PAD = 15;
  const GAP = 12;

  const toD = (s: Shape) =>
    s.map((p) => p.map((pt, i) => `${i ? 'L' : 'M'}${pt.x / SCALE} ${pt.y / SCALE}`).join('') + 'Z').join('');

  let baseD = $derived(toD(geometry.base));
  let lettersD = $derived(toD(geometry.letters));
  let w = $derived(geometry.width);
  let h = $derived(geometry.height);
  let vbW = $derived(w + PAD * 2);
  let vbH = $derived(h * 2 + GAP + PAD * 2 + 8);
  let ticks = $derived(Array.from({ length: Math.floor(w / 10) + 1 }, (_, i) => i * 10));
</script>

<svg class="preview" viewBox="{-PAD} {-PAD} {vbW} {vbH}" preserveAspectRatio="xMidYMid meet">
  <defs>
    <pattern id="g5" width="5" height="5" patternUnits="userSpaceOnUse">
      <path d="M5 0H0V5" fill="none" stroke="#e4e4e7" stroke-width="0.1" />
    </pattern>
    <pattern id="g25" width="25" height="25" patternUnits="userSpaceOnUse">
      <rect width="25" height="25" fill="url(#g5)" />
      <path d="M25 0H0V25" fill="none" stroke="#d4d4d8" stroke-width="0.2" />
    </pattern>
  </defs>
  <rect x={-PAD} y={-PAD} width={vbW} height={vbH} fill="url(#g25)" />

  <!-- graduations -->
  {#each ticks as t}
    <line x1={t} y1={-PAD} x2={t} y2={-PAD + 2} stroke="#a1a1aa" stroke-width="0.2" />
    <text x={t} y={-PAD + 4.5} font-size="2.4" fill="#71717a" text-anchor="middle">{t}</text>
  {/each}

  <!-- vue assemblée -->
  <path d={baseD} fill="none" stroke="var(--base)" stroke-width="0.3" fill-rule="evenodd" />
  <path d={lettersD} fill="none" stroke="var(--letters)" stroke-width="0.3" fill-rule="evenodd" />

  <!-- cotes -->
  <g stroke="#52525b" stroke-width="0.2" fill="#52525b" font-size="3">
    <line x1="0" y1={h + 3} x2={w} y2={h + 3} />
    <line x1="0" y1={h + 2} x2="0" y2={h + 4} />
    <line x1={w} y1={h + 2} x2={w} y2={h + 4} />
    <text x={w / 2} y={h + 7} text-anchor="middle" stroke="none">{w.toFixed(1)} mm</text>
    <line x1={w + 3} y1="0" x2={w + 3} y2={h} />
    <line x1={w + 2} y1="0" x2={w + 4} y2="0" />
    <line x1={w + 2} y1={h} x2={w + 4} y2={h} />
    <text x={w + 5} y={h / 2} dominant-baseline="middle" stroke="none">{h.toFixed(1)} mm</text>
  </g>

  <!-- couche lettres seule -->
  <g transform="translate(0 {h + GAP})">
    <path d={lettersD} fill="none" stroke="var(--base)" stroke-width="0.3" fill-rule="evenodd" />
  </g>
</svg>

<style>
  .preview { width: 100%; height: 100%; display: block; }
</style>
```

- [ ] **Step 2: Vérifier le typage**

Run: `npx svelte-check --tsconfig ./tsconfig.json` → Expected: 0 erreur.

- [ ] **Step 3: Commit**

```bash
git add src/ui/Preview2D.svelte
git commit -m "feat(ui): add 2d preview with grid and dimensions"
```

---

### Task 13: App, panneau et pipeline réactif (`ui/App.svelte`, `ui/Panel.svelte`, `ui/NumberField.svelte`)

**Files:**
- Create: `src/ui/NumberField.svelte`, `src/ui/Panel.svelte`
- Modify: `src/ui/App.svelte` (remplacement complet)

**Interfaces:**
- Consumes: `KeychainParams`, `DEFAULT_PARAMS`, `sanitize`, `encodeParams`, `decodeParams` (Tasks 6, 9) ; `buildKeychain` (Task 6) ; `buildMeshes` (Task 7) ; `laserZip`, `fileBaseName`, `build3mf`, `download` (Task 8) ; `listFonts`, `loadFont`, `importFont` (Task 11) ; `loadIcons` (Task 10) ; `Preview2D` (Task 12)
- Produces: `<Panel bind:params fonts={FontEntry[]} canExport={boolean} onexport={() => void} onimportfont={(f: File) => void} onpickicon={() => void} iconLabel={string} />` (`params` est `$bindable`, muté champ par champ), `<NumberField label value unit step min? max? />` avec `bind:value`.

- [ ] **Step 1: `src/ui/NumberField.svelte`**

```svelte
<script lang="ts">
  let {
    label, value = $bindable(), unit = 'mm', step = 0.1, min, max,
  }: { label: string; value: number; unit?: string; step?: number; min?: number; max?: number } = $props();
</script>

<label class="field">
  <span>{label}</span>
  <span class="input">
    <input type="number" bind:value {step} {min} {max} />
    <small>{unit}</small>
  </span>
</label>

<style>
  .field { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 6px 0; }
  .input { display: flex; align-items: center; background: #f4f4f5; border-radius: 6px; padding: 4px 8px; }
  input { width: 70px; border: 0; background: transparent; text-align: right; }
  small { color: var(--muted); margin-left: 6px; }
</style>
```

- [ ] **Step 2: `src/ui/Panel.svelte`**

```svelte
<script lang="ts">
  import type { KeychainParams } from '../params';
  import type { FontEntry } from '../fonts/registry';
  import NumberField from './NumberField.svelte';

  let {
    params = $bindable(), fonts, canExport, iconLabel, onexport, onimportfont, onpickicon,
  }: {
    params: KeychainParams;
    fonts: FontEntry[];
    canExport: boolean;
    iconLabel: string;
    onexport: () => void;
    onimportfont: (f: File) => void;
    onpickicon: () => void;
  } = $props();

  let fileInput: HTMLInputElement;
  let currentFamily = $derived(fonts.find((f) => f.id === params.fontId)?.family ?? 'inherit');
</script>

<aside class="panel">
  <section class="card">
    <h3>Nom</h3>
    <input class="text" bind:value={params.text} maxlength="40" />
  </section>

  <section class="card">
    <h3>Police</h3>
    <div class="row">
      <select bind:value={params.fontId} style:font-family={currentFamily}>
        {#each fonts as f (f.id)}
          <option value={f.id} style:font-family={f.family}>{f.label}</option>
        {/each}
      </select>
      <button class="ghost" onclick={() => fileInput.click()}>Importer</button>
      <input bind:this={fileInput} type="file" accept=".ttf,.otf,.woff" hidden
        onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) onimportfont(f); e.currentTarget.value = ''; }} />
    </div>
    <NumberField label="Taille de police" bind:value={params.fontSize} step={0.5} min={5} />
    <NumberField label="Épaisseur du texte" bind:value={params.textWeight} min={0} />
    <NumberField label="Espacement des lettres" bind:value={params.letterSpacing} />
    <NumberField label="Épaisseur du trait" bind:value={params.outlineWidth} min={0.5} />
  </section>

  <section class="card">
    <div class="head">
      <h3>Icône</h3>
      <input type="checkbox" class="toggle" bind:checked={params.iconEnabled} />
    </div>
    {#if params.iconEnabled}
      <button class="ghost wide" onclick={onpickicon}>{iconLabel} ›</button>
      <NumberField label="Taille" bind:value={params.iconSize} step={0.5} min={3} />
      <NumberField label="Espacement" bind:value={params.iconGap} />
    {/if}
  </section>

  <section class="card">
    <div class="head">
      <h3>Trou</h3>
      <input type="checkbox" class="toggle" bind:checked={params.holeEnabled} />
    </div>
    {#if params.holeEnabled}
      <div class="seg">
        {#each [['left', 'Gauche'], ['top', 'Haut'], ['right', 'Droite']] as [v, l]}
          <button class:on={params.holePosition === v} onclick={() => (params.holePosition = v as KeychainParams['holePosition'])}>{l}</button>
        {/each}
      </div>
      <NumberField label="Décalage" bind:value={params.holeOffset} step={0.5} />
      <NumberField label="Diamètre" bind:value={params.holeDiameter} min={1} />
      <NumberField label="Marge" bind:value={params.holeMargin} min={0.5} />
    {/if}
  </section>

  <section class="card">
    <h3>Fabrication</h3>
    <div class="seg">
      <button class:on={params.mode === 'laser'} onclick={() => (params.mode = 'laser')}>Laser</button>
      <button class:on={params.mode === 'print3d'} onclick={() => (params.mode = 'print3d')}>Impression 3D</button>
    </div>
    {#if params.mode === 'print3d'}
      <NumberField label="Épaisseur de base" bind:value={params.baseThickness} min={0.6} />
      <NumberField label="Relief des lettres" bind:value={params.reliefHeight} min={0.2} />
      <NumberField label="Profondeur de poche" bind:value={params.pocketDepth} min={0} />
      <NumberField label="Jeu (0 = multi-matériau)" bind:value={params.clearance} step={0.05} min={0} />
      <label class="field">Couleur base <input type="color" bind:value={params.baseColor} /></label>
      <label class="field">Couleur lettres <input type="color" bind:value={params.lettersColor} /></label>
    {/if}
  </section>

  <div class="actions">
    <button class="primary" disabled={!canExport} onclick={onexport}>
      Exporter {params.mode === 'laser' ? '(2 SVG)' : '(3MF)'}
    </button>
  </div>
</aside>

<style>
  .panel { width: 360px; height: 100%; overflow-y: auto; background: var(--panel); border-left: 1px solid var(--border); padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 12px 16px; }
  h3 { margin: 0 0 8px; font-size: 15px; font-weight: 600; }
  .head { display: flex; justify-content: space-between; align-items: center; }
  .head h3 { margin: 0; }
  .text { width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 18px; }
  .row { display: flex; gap: 8px; margin-bottom: 4px; }
  select { flex: 1; padding: 8px; border-radius: 8px; border: 0; background: #f4f4f5; font-size: 18px; }
  .ghost { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; }
  .wide { width: 100%; text-align: left; margin: 8px 0; }
  .seg { display: flex; background: #f4f4f5; border-radius: 8px; padding: 3px; margin: 6px 0; }
  .seg button { flex: 1; border: 0; background: transparent; padding: 6px; border-radius: 6px; color: var(--muted); }
  .seg button.on { background: #fff; color: var(--text); box-shadow: 0 1px 2px #0002; }
  .field { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; }
  .toggle { width: 18px; height: 18px; }
  .actions { margin-top: auto; position: sticky; bottom: 0; background: var(--panel); padding-top: 8px; }
  .primary { width: 100%; padding: 12px; border: 0; border-radius: 10px; background: var(--accent); color: #fff; font-size: 16px; font-weight: 600; }
  .primary:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
```

- [ ] **Step 3: `src/ui/App.svelte`** (remplace le contenu provisoire)

```svelte
<script lang="ts">
  import type { Font } from 'opentype.js';
  import { DEFAULT_PARAMS, decodeParams, encodeParams, sanitize, type KeychainParams } from '../params';
  import { buildKeychain, type KeychainGeometry } from '../geometry/keychain';
  import { buildMeshes } from '../mesh/keychain3d';
  import { build3mf } from '../export/threemf';
  import { fileBaseName, laserZip } from '../export/bundle';
  import { download } from '../export/download';
  import { importFont, listFonts, loadFont, type FontEntry } from '../fonts/registry';
  import { loadIcons, type IconEntry } from '../icons/icons';
  import Panel from './Panel.svelte';
  import Preview2D from './Preview2D.svelte';

  const STORAGE_KEY = 'porte-cles-gen:params';

  function initialParams(): KeychainParams {
    const fromUrl = location.hash.length > 1 ? decodeParams(location.hash.slice(1)) : null;
    if (fromUrl) return fromUrl;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return sanitize(JSON.parse(raw));
    } catch { /* stockage indisponible */ }
    return { ...DEFAULT_PARAMS };
  }

  let params = $state<KeychainParams>(initialParams());
  let fonts = $state<FontEntry[]>(listFonts());
  let font = $state<Font | null>(null);
  let icons = $state<IconEntry[]>([]);
  let geometry = $state<KeychainGeometry | null>(null);
  let error = $state<string | null>(null);
  let toast = $state<string | null>(null);
  let view = $state<'2d' | '3d'>('2d');
  let pickerOpen = $state(false);
  let lastGoodFontId = params.fontId;

  function notify(msg: string) {
    toast = msg;
    setTimeout(() => (toast = null), 4000);
  }

  // police
  $effect(() => {
    const id = params.fontId;
    loadFont(id)
      .then((f) => { font = f; lastGoodFontId = id; })
      .catch((e: Error) => {
        notify(e.message);
        if (id !== lastGoodFontId) params.fontId = lastGoodFontId;
        else if (id !== DEFAULT_PARAMS.fontId) params.fontId = DEFAULT_PARAMS.fontId;
      });
  });

  // icônes (lazy)
  $effect(() => {
    if (params.iconEnabled && icons.length === 0) loadIcons().then((l) => (icons = l));
  });
  let iconPath = $derived(icons.find((i) => i.name === params.iconName)?.path);

  // géométrie (debounce)
  $effect(() => {
    const snapshot = $state.snapshot(params) as KeychainParams;
    const f = font;
    const ip = iconPath;
    const t = setTimeout(() => {
      if (!f) return;
      try {
        geometry = buildKeychain(snapshot, f, ip);
        error = null;
      } catch (e) {
        geometry = null;
        error = `Calcul impossible : ${(e as Error).message}`;
      }
    }, 100);
    return () => clearTimeout(t);
  });

  // persistance
  $effect(() => {
    const snapshot = $state.snapshot(params) as KeychainParams;
    const t = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* ignoré */ }
      const shareable = snapshot.fontId.startsWith('custom:') ? { ...snapshot, fontId: DEFAULT_PARAMS.fontId } : snapshot;
      history.replaceState(null, '', `#${encodeParams(shareable)}`);
    }, 300);
    return () => clearTimeout(t);
  });

  async function onimportfont(file: File) {
    try {
      const entry = await importFont(file);
      fonts = listFonts();
      params.fontId = entry.id;
    } catch (e) {
      notify((e as Error).message);
    }
  }

  function onexport() {
    if (!geometry) return;
    const name = fileBaseName(params.text);
    if (params.mode === 'laser') {
      download(laserZip(geometry), `${name}-laser.zip`, 'application/zip');
    } else {
      const m = buildMeshes(geometry, params);
      download(build3mf([
        { name: 'base', color: params.baseColor, mesh: m.base },
        { name: 'lettres', color: params.lettersColor, mesh: m.letters },
      ]), `${name}.3mf`, 'model/3mf');
    }
  }
</script>

<main class="layout">
  <div class="stage">
    <div class="tabs">
      <button class:on={view === '2d'} onclick={() => (view = '2d')}>Aperçu 2D</button>
      <button class:on={view === '3d'} onclick={() => (view = '3d')}>Aperçu 3D</button>
    </div>
    {#if error}
      <p class="msg">{error}</p>
    {:else if !geometry}
      <p class="msg">Saisis un texte pour commencer.</p>
    {:else if view === '2d'}
      <Preview2D {geometry} />
    {:else}
      <p class="msg">Aperçu 3D (Task 14)</p>
    {/if}
    {#if geometry?.missing.length}
      <p class="warn">Caractères absents de la police, ignorés : {geometry.missing.join(' ')}</p>
    {/if}
  </div>

  <Panel bind:params {fonts} canExport={!!geometry}
    iconLabel={params.iconName.replace(/-fill$/, '')}
    {onexport} {onimportfont} onpickicon={() => (pickerOpen = true)} />

  {#if toast}<div class="toast">{toast}</div>{/if}
</main>

<style>
  .layout { display: flex; height: 100%; }
  .stage { flex: 1; position: relative; display: flex; flex-direction: column; padding: 56px 24px 24px; min-width: 0; }
  .tabs { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); display: flex; background: #e4e4e7; border-radius: 10px; padding: 3px; z-index: 1; }
  .tabs button { border: 0; background: transparent; padding: 6px 14px; border-radius: 8px; color: var(--muted); }
  .tabs button.on { background: #fff; color: var(--text); }
  .msg { margin: auto; color: var(--muted); }
  .warn { position: absolute; bottom: 12px; left: 24px; color: #b45309; background: #fef3c7; padding: 6px 10px; border-radius: 6px; }
  .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #18181b; color: #fff; padding: 10px 16px; border-radius: 8px; }
</style>
```

- [ ] **Step 4: Vérifier**

Run: `npm run check` → Expected: 0 erreur.
Run: `npm run dev`, ouvrir l'URL. Expected :
- « Lexie » en Pacifico, contour rouge + lettres bleues + trou à gauche, cotes affichées (~110 × 42 mm ordre de grandeur).
- Changer police / taille / épaisseur du trait / espacement → aperçu mis à jour.
- Trou : gauche/haut/droite et décalage fonctionnent ; désactivable.
- Recharger la page → réglages conservés ; copier l'URL dans un autre onglet → même modèle.
- Importer un `.txt` renommé `.ttf` → toast d'erreur, police inchangée.
- Exporter en mode laser → `lexie-laser.zip` contenant `base.svg` et `lettres.svg` ; les ouvrir dans Inkscape : dimensions en mm identiques, superposables.

- [ ] **Step 5: Commit**

```bash
git add src/ui
git commit -m "feat(ui): add settings panel, reactive pipeline and laser export"
```

---

### Task 14: Aperçu 3D (`ui/Preview3D.svelte`)

**Files:**
- Create: `src/ui/Preview3D.svelte`
- Modify: `src/ui/App.svelte` (brancher le composant)

**Interfaces:**
- Consumes: `buildMeshes` (Task 7), `Mesh` (Task 7), `KeychainGeometry` (Task 6), `KeychainParams` (Task 6)
- Produces: `<Preview3D {geometry} {params} />`

- [ ] **Step 1: Écrire `src/ui/Preview3D.svelte`**

```svelte
<script lang="ts">
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import type { KeychainGeometry } from '../geometry/keychain';
  import type { KeychainParams } from '../params';
  import { buildMeshes } from '../mesh/keychain3d';
  import type { Mesh } from '../mesh/extrude';

  let { geometry, params }: { geometry: KeychainGeometry; params: KeychainParams } = $props();

  let host: HTMLDivElement;
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let controls: OrbitControls;
  let group = new THREE.Group();
  let framedFor = '';

  function toThree(m: Mesh, color: string): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(m.positions, 3));
    g.setIndex(m.indices);
    const flat = g.toNonIndexed();
    flat.computeVertexNormals();
    g.dispose();
    return new THREE.Mesh(flat, new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
  }

  function clearGroup() {
    for (const c of [...group.children]) {
      const m = c as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      group.remove(m);
    }
  }

  $effect(() => {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(devicePixelRatio);
    host.appendChild(renderer.domElement);
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(-50, -80, 150);
    scene.add(sun, group);
    camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
    camera.up.set(0, 0, 1);
    controls = new OrbitControls(camera, renderer.domElement);

    const ro = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = host;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    });
    ro.observe(host);
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

    return () => {
      ro.disconnect();
      renderer.setAnimationLoop(null);
      clearGroup();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  });

  $effect(() => {
    const m = buildMeshes(geometry, params);
    clearGroup();
    group.add(toThree(m.base, params.baseColor), toThree(m.letters, params.lettersColor));

    const key = `${Math.round(geometry.width)}x${Math.round(geometry.height)}`;
    if (key !== framedFor) {
      framedFor = key;
      const cx = geometry.width / 2;
      const cy = -geometry.height / 2;
      const size = Math.max(geometry.width, geometry.height);
      controls.target.set(cx, cy, 0);
      camera.position.set(cx, cy - size * 1.2, size * 1.4);
    }
  });
</script>

<div class="host" bind:this={host}></div>

<style>
  .host { width: 100%; height: 100%; min-height: 300px; }
</style>
```

- [ ] **Step 2: Brancher dans `App.svelte`**

Ajouter l'import :
```ts
  import Preview3D from './Preview3D.svelte';
```
Remplacer :
```svelte
    {:else}
      <p class="msg">Aperçu 3D (Task 14)</p>
```
par :
```svelte
    {:else}
      <Preview3D {geometry} {params} />
```

- [ ] **Step 3: Vérifier**

Run: `npm run check` → 0 erreur.
Run: `npm run dev`, onglet « Aperçu 3D ». Expected : base beige + lettres blanches en relief, rotation/zoom à la souris, mise à jour live quand on change relief/épaisseur/couleurs, pas de fuite visible (changer 20× le texte n'augmente pas indéfiniment la mémoire dans l'onglet Performance).

- [ ] **Step 4: Commit**

```bash
git add src/ui
git commit -m "feat(ui): add three.js 3d preview"
```

---

### Task 15: Sélecteur d'icônes (`ui/IconPicker.svelte`)

**Files:**
- Create: `src/ui/IconPicker.svelte`
- Modify: `src/ui/App.svelte`

**Interfaces:**
- Consumes: `IconEntry`, `CATEGORY_LABELS`, `filterIcons` (Task 10)
- Produces: `<IconPicker icons={IconEntry[]} selected={string} onselect={(name: string) => void} onclose={() => void} />`

- [ ] **Step 1: Écrire `src/ui/IconPicker.svelte`**

```svelte
<script lang="ts">
  import { CATEGORY_LABELS, filterIcons, type IconEntry } from '../icons/icons';

  let { icons, selected, onselect, onclose }: {
    icons: IconEntry[];
    selected: string;
    onselect: (name: string) => void;
    onclose: () => void;
  } = $props();

  let query = $state('');
  let category = $state<string | null>('User & Faces');
  let categories = $derived([...new Set(icons.map((i) => i.category))]);
  let results = $derived(filterIcons(icons, query, query ? null : category).slice(0, 240));
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="overlay" onclick={onclose} role="presentation"></div>
<div class="picker" role="dialog" aria-label="Choisir une icône">
  <!-- svelte-ignore a11y_autofocus -->
  <input class="search" placeholder="Rechercher des icônes… (en anglais)" bind:value={query} autofocus />
  <div class="chips">
    {#each categories as c}
      <button class:on={!query && category === c} onclick={() => { query = ''; category = c; }}>
        {CATEGORY_LABELS[c] ?? c}
      </button>
    {/each}
  </div>
  {#if icons.length === 0}
    <p class="muted">Chargement…</p>
  {:else}
    <div class="grid">
      {#each results as i (i.name)}
        <button class="icon" class:on={i.name === selected} title={i.name}
          onclick={() => { onselect(i.name); onclose(); }}>
          <svg viewBox="0 0 24 24"><path d={i.path} /></svg>
          <span>{i.name.replace(/-fill$/, '')}</span>
        </button>
      {/each}
    </div>
    {#if results.length === 0}<p class="muted">Aucune icône.</p>{/if}
  {/if}
</div>

<style>
  .overlay { position: fixed; inset: 0; background: #0003; z-index: 10; }
  .picker { position: fixed; top: 5vh; right: 380px; width: 480px; max-height: 90vh; overflow-y: auto; background: #fff; border-radius: 14px; padding: 16px; z-index: 11; box-shadow: 0 10px 40px #0003; }
  .search { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; font-size: 16px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
  .chips button { border: 1px solid var(--border); background: #fff; border-radius: 999px; padding: 4px 12px; }
  .chips button.on { background: var(--accent); color: #fff; border-color: var(--accent); }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .icon { display: flex; flex-direction: column; align-items: center; gap: 4px; border: 1px solid var(--border); background: #fff; border-radius: 10px; padding: 10px 4px; }
  .icon.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .icon svg { width: 36px; height: 36px; fill: #3f3f46; }
  .icon span { font-size: 11px; color: var(--muted); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .muted { color: var(--muted); }
</style>
```

- [ ] **Step 2: Brancher dans `App.svelte`**

Ajouter l'import :
```ts
  import IconPicker from './IconPicker.svelte';
```
Juste avant `{#if toast}` :
```svelte
  {#if pickerOpen}
    <IconPicker {icons} selected={params.iconName}
      onselect={(n) => (params.iconName = n)} onclose={() => (pickerOpen = false)} />
  {/if}
```
Et dans l'effet de chargement lazy des icônes, charger aussi à l'ouverture du sélecteur :
```ts
  $effect(() => {
    if ((params.iconEnabled || pickerOpen) && icons.length === 0) loadIcons().then((l) => (icons = l));
  });
```

- [ ] **Step 3: Vérifier**

Run: `npm run check` → 0 erreur.
Run: `npm run dev`. Expected : activer « Icône » → smiley à gauche du texte, englobé dans le contour ; ouvrir le sélecteur → catégories en français, recherche `heart` filtre, clic → icône remplacée, Échap ferme. Mode 3D : l'icône est en relief comme les lettres.

- [ ] **Step 4: Commit**

```bash
git add src/ui
git commit -m "feat(ui): add remix icon picker"
```

---

### Task 16: Vérification finale

**Files:** aucun nouveau (corrections éventuelles seulement).

- [ ] **Step 1: Suite complète**

Run: `npm test && npm run check && npm run build` → Expected : tous les tests PASS, 0 erreur de typage, build OK dans `dist/`.

- [ ] **Step 2: Build statique servi**

Run: `npx vite preview` → l'app fonctionne depuis `dist/` (polices chargées, icônes chargées, exports OK).

- [ ] **Step 3: Vérification slicer / laser (manuelle, par l'utilisateur)**

- Exporter « Lexie » en 3MF → ouvrir dans Bambu Studio ou PrusaSlicer : 2 objets `base` et `lettres` (le slicer propose de les charger comme un objet multi-pièces → accepter), aucun avertissement « non-manifold », lettres posées dans la poche de 0,6 mm.
- Exporter en laser → ouvrir `base.svg` et `lettres.svg` dans LightBurn / xTool Creative Space / Inkscape : dimensions en mm correctes (identiques à l'aperçu), tracés fermés.

- [ ] **Step 4: Commit éventuel**

```bash
git add -A
git commit -m "fix: address issues found in final verification"
```
(seulement s'il y a eu des corrections)
