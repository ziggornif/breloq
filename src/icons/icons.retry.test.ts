import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.doUnmock('./icons.json');
  vi.resetModules();
});

describe('loadIcons', () => {
  it('retries after a failed load instead of caching the rejection', async () => {
    vi.resetModules();
    vi.doMock('./icons.json', () => {
      throw new Error('réseau');
    });
    const { loadIcons } = await import('./icons');
    await expect(loadIcons()).rejects.toThrow();

    vi.doMock('./icons.json', () => ({ default: [{ name: 'a-fill', category: 'Others', path: 'M0 0' }] }));
    await expect(loadIcons()).resolves.toHaveLength(1);
  });
});
