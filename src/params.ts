import { normalizeIconId } from './icons/iconify';

export type HolePosition = 'left' | 'right' | 'top';
export type Mode = 'laser' | 'print3d';

export interface KeychainParams {
  text: string;
  fontId: string;
  fontSize: number;
  textWeight: number;
  letterSpacing: number;
  outlineWidth: number;
  iconEnabled: boolean;
  iconName: string;
  iconSize: number;
  iconGap: number;
  holeEnabled: boolean;
  holePosition: HolePosition;
  holeOffset: number;
  holeDiameter: number;
  holeMargin: number;
  mode: Mode;
  baseThickness: number;
  reliefHeight: number;
  pocketDepth: number;
  clearance: number;
  baseColor: string;
  lettersColor: string;
}

export const DEFAULT_PARAMS: KeychainParams = {
  text: 'Lexie',
  fontId: 'pacifico',
  fontSize: 30,
  textWeight: 0,
  letterSpacing: 0.3,
  outlineWidth: 3,
  iconEnabled: false,
  iconName: 'ri:emotion-laugh-fill',
  iconSize: 20,
  iconGap: 2,
  holeEnabled: true,
  holePosition: 'left',
  holeOffset: 0,
  holeDiameter: 4,
  holeMargin: 2.5,
  mode: 'laser',
  baseThickness: 3,
  reliefHeight: 1.5,
  pocketDepth: 0.6,
  clearance: 0.15,
  baseColor: '#c8b496',
  lettersColor: '#ffffff',
};

const ENUMS: Partial<Record<keyof KeychainParams, readonly string[]>> = {
  holePosition: ['left', 'right', 'top'],
  mode: ['laser', 'print3d'],
};
const BOUNDS: Partial<Record<keyof KeychainParams, readonly [number, number]>> = {
  fontSize: [5, 200],
  textWeight: [0, 5],
  letterSpacing: [-10, 20],
  outlineWidth: [0.5, 15],
  iconSize: [3, 100],
  iconGap: [0, 30],
  holeOffset: [-200, 200],
  holeDiameter: [1, 20],
  holeMargin: [0.5, 15],
  baseThickness: [0.6, 20],
  reliefHeight: [0.2, 20],
  pocketDepth: [0, 10],
  clearance: [0, 1],
};
const TEXT_MAX_CHARS = 40;
const COLOR = /^#[0-9a-f]{6}$/i;

export function sanitize(raw: unknown): KeychainParams {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_PARAMS } as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_PARAMS) as (keyof KeychainParams)[]) {
    const def = DEFAULT_PARAMS[key];
    const v = src[key];
    if (typeof v !== typeof def) continue;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) continue;
      const bounds = BOUNDS[key];
      out[key] = bounds ? Math.min(bounds[1], Math.max(bounds[0], v)) : v;
    } else if (typeof v === 'string') {
      const allowed = ENUMS[key];
      if (allowed && !allowed.includes(v)) continue;
      if (key.endsWith('Color') && !COLOR.test(v)) continue;
      if (key === 'iconName') {
        const id = normalizeIconId(v);
        if (id) out[key] = id;
        continue;
      }
      out[key] = key === 'text' ? Array.from(v).slice(0, TEXT_MAX_CHARS).join('') : v;
    } else {
      out[key] = v;
    }
  }
  return out as unknown as KeychainParams;
}

export function encodeParams(p: KeychainParams): string {
  const bytes = new TextEncoder().encode(JSON.stringify(p));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeParams(s: string): KeychainParams | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return sanitize(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}
