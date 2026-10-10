import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { build3mf } from './threemf';
import type { Mesh } from '../mesh/extrude';

const tri: Mesh = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3] };

describe('build3mf', () => {
  it('centers the object on the P1S plate (256 × 256 mm) through the build item transform', () => {
    // emprise x ∈ [0, 100], y ∈ [-30, 0] (Y retourné) → centre (50, -15)
    const box = (x0: number, y0: number, x1: number, y1: number): Mesh => ({
      positions: [x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 3], indices: [0, 1, 2, 0, 2, 3],
    });
    const model = strFromU8(unzipSync(build3mf([
      { name: 'base', color: '#c8b496', mesh: box(0, -30, 100, 0) },
      { name: 'lettres', color: '#ffffff', mesh: box(10, -20, 90, -10) },
    ]))['3D/3dmodel.model']);
    expect(model).toContain('<item objectid="4" transform="1 0 0 0 1 0 0 0 1 78 143 0"/>');
  });

  it('produces a valid 3MF package as one parent object with two components', () => {
    const files = unzipSync(build3mf([
      { name: 'base', color: '#c8b496', mesh: tri },
      { name: 'lettres', color: '#ffffff', mesh: tri },
    ]));
    expect(Object.keys(files).sort()).toEqual(['3D/3dmodel.model', 'Metadata/model_settings.config', 'Metadata/project_settings.config', '[Content_Types].xml', '_rels/.rels']);
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
    expect(model).toMatch(/<item objectid="4" transform="[^"]*"\/>/);
    expect(model).not.toContain('<item objectid="2"');
    expect(model).not.toContain('<item objectid="3"');
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

  it('defaults to Bambu PLA Basic on a P1S 0.4 with the objects colors as filament colors', () => {
    const files = unzipSync(build3mf([
      { name: 'base', color: '#ff8800', mesh: tri },
      { name: 'lettres', color: '#112233', mesh: tri },
    ]));
    const ps = JSON.parse(strFromU8(files['Metadata/project_settings.config']));
    expect(ps.from).toBe('project');
    expect(ps.printer_settings_id).toBe('Bambu Lab P1S 0.4 nozzle');
    expect(ps.filament_settings_id).toEqual(Array(2).fill('Bambu PLA Basic @BBL P1S 0.4 nozzle'));
    expect(ps.filament_ids).toEqual(['GFA00', 'GFA00']);
    expect(ps.filament_colour).toEqual(['#FF8800FF', '#112233FF']);
    // Bambu Studio n'honore project_settings que pour ses propres fichiers
    expect(strFromU8(files['3D/3dmodel.model'])).toMatch(/<metadata name="Application">BambuStudio-[\d.]+<\/metadata>/);
  });
});
