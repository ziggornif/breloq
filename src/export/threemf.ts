import { strToU8, zipSync } from 'fflate';
import type { Mesh } from '../mesh/extrude';
import bambuProject from './bambu-p1s-project.json';

export interface ThreeMfObject {
  name: string;
  color: string;
  mesh: Mesh;
  /** Extrudeur/filament (1-based) lu par Bambu Studio / OrcaSlicer ; défaut : index + 1. */
  extruder?: number;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
  <Default Extension="config" ContentType="text/xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const f = (v: number) => String(+v.toFixed(4));

/** Metadata/model_settings.config : affectation d'extrudeur par pièce (Bambu Studio / OrcaSlicer ; ignoré par les autres). */
function modelSettings(objects: ThreeMfObject[], parentId: number, name: string): string {
  const parts = objects.map((o, k) => `    <part id="${k + 2}" subtype="normal_part">
      <metadata key="name" value="${esc(o.name)}"/>
      <metadata key="extruder" value="${o.extruder ?? k + 1}"/>
    </part>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="${parentId}">
    <metadata key="name" value="${esc(name)}"/>
    <metadata key="extruder" value="${objects[0]?.extruder ?? 1}"/>
${parts.join('\n')}
  </object>
</config>
`;
}

/**
 * Metadata/project_settings.config : Bambu Studio ouvre le projet avec l'imprimante P1S 0.4 et 2× Bambu PLA Basic,
 * colorés comme les objets. Gabarit exporté de Bambu Studio 02.07.01.57 (2 filaments) ; ignoré par PrusaSlicer.
 */
const bambuProjectSettings = (objects: ThreeMfObject[]) =>
  JSON.stringify({ ...bambuProject, filament_colour: objects.map((o) => `${o.color.toUpperCase()}FF`) }, null, 2);

/** Centre du plateau de l'imprimante du gabarit Bambu (P1S : 256 × 256 mm). */
const PLATE_CENTER = 128;

/** Translation du build item qui centre l'emprise XY de tous les maillages sur le plateau. */
function centerTransform(objects: ThreeMfObject[]): string {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const o of objects) {
    const P = o.mesh.positions;
    for (let i = 0; i < P.length; i += 3) {
      if (P[i] < minX) minX = P[i];
      if (P[i] > maxX) maxX = P[i];
      if (P[i + 1] < minY) minY = P[i + 1];
      if (P[i + 1] > maxY) maxY = P[i + 1];
    }
  }
  if (minX === Infinity) return '1 0 0 0 1 0 0 0 1 0 0 0';
  return `1 0 0 0 1 0 0 0 1 ${f(PLATE_CENTER - (minX + maxX) / 2)} ${f(PLATE_CENTER - (minY + maxY) / 2)} 0`;
}

export function build3mf(objects: ThreeMfObject[], name = 'porte-cles'): Uint8Array {
  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="fr-FR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n<metadata name="Application">BambuStudio-02.07.01.57</metadata>\n<resources>\n<basematerials id="1">');
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
  const parentId = objects.length + 2;
  parts.push(`<object id="${parentId}" type="model" name="${esc(name)}"><components>`);
  objects.forEach((_, k) => parts.push(`<component objectid="${k + 2}"/>`));
  parts.push('</components></object>\n');
  parts.push(`</resources>\n<build><item objectid="${parentId}" transform="${centerTransform(objects)}"/>`);
  parts.push('</build>\n</model>\n');

  const bambu = objects.length === 2; // le gabarit Bambu décrit exactement 2 filaments
  return zipSync({
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    '_rels/.rels': strToU8(RELS),
    '3D/3dmodel.model': strToU8(parts.join('')),
    'Metadata/model_settings.config': strToU8(modelSettings(objects, parentId, name)),
    ...(bambu ? { 'Metadata/project_settings.config': strToU8(bambuProjectSettings(objects)) } : {}),
  });
}
