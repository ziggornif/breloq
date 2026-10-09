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

/**
 * Fermeture vue par un slicer, qui soude les sommets par position :
 * chaque arête orientée est compensée par autant d'arêtes opposées.
 */
export function isClosedByPosition(m: Mesh): boolean {
  const P = m.positions;
  const key = (i: number) => `${P[3 * i]},${P[3 * i + 1]},${P[3 * i + 2]}`;
  const edges = new Map<string, number>();
  for (let i = 0; i < m.indices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const e = `${key(m.indices[i + k])}>${key(m.indices[i + ((k + 1) % 3)])}`;
      edges.set(e, (edges.get(e) ?? 0) + 1);
    }
  }
  for (const [e, n] of edges) {
    const [a, b] = e.split('>');
    if (edges.get(`${b}>${a}`) !== n) return false;
  }
  return true;
}
