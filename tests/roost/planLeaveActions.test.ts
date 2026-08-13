import { describe, it, expect } from 'vitest';
import { planLeaveActions } from '../../src/roost/planLeaveActions';

const allowlist = ['builder', 'connector', 'voice'];

describe('planLeaveActions', () => {
  it('keeps only allowlisted roles', () => {
    const result = planLeaveActions(['builder', 'crew', 'neighbor'], allowlist);
    expect(result).toEqual(['builder']);
  });

  it('returns an empty array when the member holds no allowlisted role', () => {
    const result = planLeaveActions(['crew', 'neighbor'], allowlist);
    expect(result).toEqual([]);
  });

  it('returns an empty array for a member with no roles', () => {
    const result = planLeaveActions([], allowlist);
    expect(result).toEqual([]);
  });
});
