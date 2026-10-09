import { describe, it, expect } from 'vitest';
import { DEFAULT_PARAMS, decodeParams, encodeParams, sanitize } from './params';

describe('params', () => {
  it('sanitize fills defaults and drops bad types', () => {
    const p = sanitize({ text: 'Zoé', fontSize: 'big', foo: 1, holePosition: 'bottom', mode: 'print3d' });
    expect(p.text).toBe('Zoé');
    expect(p.fontSize).toBe(DEFAULT_PARAMS.fontSize);
    expect(p.holePosition).toBe('left');
    expect(p.mode).toBe('print3d');
    expect('foo' in p).toBe(false);
  });

  it('sanitize clamps negatives and non-finite numbers', () => {
    const p = sanitize({ outlineWidth: -3, fontSize: Infinity, letterSpacing: -2 });
    expect(p.outlineWidth).toBe(0);
    expect(p.fontSize).toBe(DEFAULT_PARAMS.fontSize);
    expect(p.letterSpacing).toBe(-2); // seul paramètre autorisé négatif
  });

  it('sanitize rejects bad colors', () => {
    expect(sanitize({ baseColor: 'red' }).baseColor).toBe(DEFAULT_PARAMS.baseColor);
    expect(sanitize({ baseColor: '#00ff00' }).baseColor).toBe('#00ff00');
  });

  it('round-trips through encode/decode', () => {
    const p = { ...DEFAULT_PARAMS, text: 'Léa ❤', fontSize: 22 };
    expect(decodeParams(encodeParams(p))).toEqual(p);
  });

  it('decode returns null on garbage', () => {
    expect(decodeParams('%%%not-base64')).toBeNull();
  });
});
