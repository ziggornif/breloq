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
