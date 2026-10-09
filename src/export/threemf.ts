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

export function build3mf(objects: ThreeMfObject[], name = 'porte-cles'): Uint8Array {
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
  const parentId = objects.length + 2;
  parts.push(`<object id="${parentId}" type="model" name="${esc(name)}"><components>`);
  objects.forEach((_, k) => parts.push(`<component objectid="${k + 2}"/>`));
  parts.push('</components></object>\n');
  parts.push(`</resources>\n<build><item objectid="${parentId}"/>`);
  parts.push('</build>\n</model>\n');

  return zipSync({
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    '_rels/.rels': strToU8(RELS),
    '3D/3dmodel.model': strToU8(parts.join('')),
  });
}
