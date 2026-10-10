import { describe, it, expect } from 'vitest';
import { fileBaseName } from './filename';

describe('fileBaseName', () => {
  it('slugifies', () => {
    expect(fileBaseName('Léa & Zoé !')).toBe('lea-zoe');
    expect(fileBaseName('   ')).toBe('porte-cles');
  });
});
