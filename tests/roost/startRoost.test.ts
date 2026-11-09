import { describe, it, expect, vi } from 'vitest';
import { startRoost } from '../../src/roost/startRoost';

describe('startRoost', () => {
  it('returns true when the Roost login succeeds', async () => {
    const report = vi.fn();

    await expect(startRoost(() => Promise.resolve('token-ok'), report)).resolves.toBe(true);
    expect(report).not.toHaveBeenCalled();
  });

  it('reports a failed login and resolves false instead of throwing', async () => {
    const report = vi.fn();
    const failure = new Error('Used disallowed intents');

    await expect(startRoost(() => Promise.reject(failure), report)).resolves.toBe(false);
    expect(report).toHaveBeenCalledWith(expect.stringContaining('Task Bot keeps running'), failure);
  });

  it('also catches a login function that throws before returning a promise', async () => {
    const report = vi.fn();

    await expect(
      startRoost(() => {
        throw new Error('bad token format');
      }, report)
    ).resolves.toBe(false);
    expect(report).toHaveBeenCalledOnce();
  });
});
