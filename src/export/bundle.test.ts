import { describe, it, expect } from 'vitest';
import { fileBaseName } from './bundle';

describe('bundle', () => {
  it('fileBaseName slugifies', () => {
    expect(fileBaseName('Léa & Zoé !')).toBe('lea-zoe');
    expect(fileBaseName('   ')).toBe('porte-cles');
  });
});
