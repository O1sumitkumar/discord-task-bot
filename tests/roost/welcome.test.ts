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

  it("asks what people are into, not what they're building", () => {
    // The brand book writes for the first-timer who has not built anything
    // yet, and the hobby channels are for life outside tech. "What you're
    // building" makes that person flinch.
    const message = buildWelcomeMessage('user-1');
    expect(message).toMatch(/what you're into/i);
    expect(message).not.toMatch(/building/i);
  });
});
