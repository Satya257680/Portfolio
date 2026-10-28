import { describe, expect, it } from 'vitest';

describe('Portfolio server tests', () => {
  it('should confirm the test environment is working', () => {
    expect(1 + 1).toBe(2);
  });

  it('should use a supported Node.js version', () => {
    const majorVersion = Number(process.versions.node.split('.')[0]);
    expect(majorVersion).toBeGreaterThanOrEqual(18);
  });
});