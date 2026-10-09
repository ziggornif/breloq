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
