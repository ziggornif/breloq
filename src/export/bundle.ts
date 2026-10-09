import { strToU8, zipSync } from 'fflate';
import type { KeychainGeometry } from '../geometry/keychain';
import { shapeToSvg } from './svg';

/** Nom de fichier sûr : minuscules ASCII, séparateurs « - ». */
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
