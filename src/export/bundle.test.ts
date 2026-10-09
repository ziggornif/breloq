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
