import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { build3mf } from './threemf';
import type { Mesh } from '../mesh/extrude';

const tri: Mesh = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3] };

describe('build3mf', () => {
  it('produces a valid 3MF package as one parent object with two components', () => {
    const files = unzipSync(build3mf([
      { name: 'base', color: '#c8b496', mesh: tri },
      { name: 'lettres', color: '#ffffff', mesh: tri },
    ]));
    expect(Object.keys(files).sort()).toEqual(['3D/3dmodel.model', 'Metadata/model_settings.config', '[Content_Types].xml', '_rels/.rels']);
    const model = strFromU8(files['3D/3dmodel.model']);
    expect(model).toContain('unit="millimeter"');
    expect(model.match(/<object /g)).toHaveLength(3);
    expect(model).toContain('name="base"');
    expect(model).toContain('name="lettres"');
    expect(model.match(/<vertex /g)).toHaveLength(8);
    expect(model.match(/<triangle /g)).toHaveLength(8);
    expect(model.match(/<components>/g)).toHaveLength(1);
    expect(model.match(/<component /g)).toHaveLength(2);
    expect(model).toContain('<component objectid="2"/>');
    expect(model).toContain('<component objectid="3"/>');
    expect(model.match(/<item /g)).toEqual(['<item ']);
    expect(model).toContain('<item objectid="4"/>');
    expect(model).not.toContain('<item objectid="2"/>');
    expect(model).not.toContain('<item objectid="3"/>');
    for (const blk of model.match(/<object [^>]*pid="1"[\s\S]*?<\/object>/g)!) {
      const nv = (blk.match(/<vertex /g) ?? []).length;
      for (const m of blk.matchAll(/v[123]="(\d+)"/g)) expect(Number(m[1])).toBeLessThan(nv);
    }
    expect(model).toContain('displaycolor="#C8B496FF"');
    expect(strFromU8(files['_rels/.rels'])).toContain('Target="/3D/3dmodel.model"');
  });

  it('assigns one extruder per part (default index+1) in Metadata/model_settings.config', () => {
    const files = unzipSync(build3mf([
      { name: 'base', color: '#c8b496', mesh: tri },
      { name: 'lettres', color: '#ffffff', mesh: tri },
    ], 'Matthieu'));
    const cfg = strFromU8(files['Metadata/model_settings.config']);
    expect(cfg).toContain('<object id="4">');
    expect(cfg).toContain('<metadata key="name" value="Matthieu"/>');
    expect(cfg).toMatch(/<part id="2" subtype="normal_part">\s*<metadata key="name" value="base"\/>\s*<metadata key="extruder" value="1"\/>/);
    expect(cfg).toMatch(/<part id="3" subtype="normal_part">\s*<metadata key="name" value="lettres"\/>\s*<metadata key="extruder" value="2"\/>/);
  });

  it('honours an explicit extruder', () => {
    const files = unzipSync(build3mf([{ name: 'a', color: '#000000', mesh: tri, extruder: 3 }]));
    expect(strFromU8(files['Metadata/model_settings.config'])).toContain('<metadata key="extruder" value="3"/>');
  });
});
