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

/** Épaisseur d'une planche de contreplaqué découpée au laser (mm). */
export const LASER_SHEET_THICKNESS = 3;

/** Aperçu laser : base pleine (sans poche) 0→t, lettres collées dessus t→2t. */
export function buildLaserMeshes(g: KeychainGeometry, thickness = LASER_SHEET_THICKNESS): { base: Mesh; letters: Mesh } {
  return { base: extrude(g.base, 0, thickness), letters: extrude(g.letters, thickness, 2 * thickness) };
}
