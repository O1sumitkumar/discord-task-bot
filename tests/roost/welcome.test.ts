import { describe, it, expect } from 'vitest';
import { buildWelcomeMessage } from '../../src/roost/welcome';

describe('buildWelcomeMessage', () => {
  it('mentions the joining member', () => {
    const message = buildWelcomeMessage('user-1');
    expect(message).toContain('<@user-1>');
  });

  it('mentions PhilaCon Valley', () => {
    const message = buildWelcomeMessage('user-1');
    expect(message).toContain('PhilaCon Valley');
  });
});
