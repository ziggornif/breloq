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

  it('sanitize clamps numbers into their bounds and drops non-finite ones', () => {
    const p = sanitize({ outlineWidth: -3, fontSize: Infinity, letterSpacing: -2 });
    expect(p.outlineWidth).toBe(0.5);
    expect(p.fontSize).toBe(DEFAULT_PARAMS.fontSize);
    expect(p.letterSpacing).toBe(-2); // négatif autorisé dans ses bornes
  });

  it('sanitize clamps numbers above their upper bound', () => {
    expect(sanitize({ fontSize: 1e12 }).fontSize).toBe(200);
    expect(sanitize({ holeMargin: 1e15 }).holeMargin).toBe(15);
  });

  it('sanitize keeps a negative holeOffset', () => {
    expect(sanitize({ holeOffset: -5 }).holeOffset).toBe(-5);
  });

  it('sanitize truncates text to 40 code points', () => {
    const t = sanitize({ text: '❤'.repeat(50) }).text;
    expect(Array.from(t)).toHaveLength(40);
    expect(t).toBe('❤'.repeat(40));
  });

  it('sanitize rejects bad colors', () => {
    expect(sanitize({ baseColor: 'red' }).baseColor).toBe(DEFAULT_PARAMS.baseColor);
    expect(sanitize({ baseColor: '#00ff00' }).baseColor).toBe('#00ff00');
  });

  it('sanitize leaves DEFAULT_PARAMS unchanged', () => {
    expect(sanitize(DEFAULT_PARAMS)).toEqual(DEFAULT_PARAMS);
  });

  it('round-trips through encode/decode', () => {
    const p = { ...DEFAULT_PARAMS, text: 'Léa ❤', fontSize: 22 };
    expect(decodeParams(encodeParams(p))).toEqual(p);
  });

  it('decode returns null on garbage', () => {
    expect(decodeParams('%%%not-base64')).toBeNull();
  });
});
