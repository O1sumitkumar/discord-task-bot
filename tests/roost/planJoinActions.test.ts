import { describe, it, expect } from 'vitest';
import { planJoinActions } from '../../src/roost/planJoinActions';

const allowlist = ['builder', 'connector', 'voice'];
const neighborId = 'neighbor';

describe('planJoinActions', () => {
  it('never adds Neighbor on join — the join button in #welcome is the only way in', () => {
    const result = planJoinActions({
      storedRoleIds: [],
      currentRoleIds: [],
      allowlist,
      neighborId,
    });

    expect(result.rolesToAdd).toEqual([]);
  });

  it('does not add Neighbor even when it is in the stored snapshot', () => {
    const result = planJoinActions({
      storedRoleIds: [neighborId],
      currentRoleIds: [],
      allowlist: [...allowlist, neighborId],
      neighborId,
    });

    expect(result.rolesToAdd).toEqual([]);
  });

  it('restores an allowlisted role from the snapshot', () => {
    const result = planJoinActions({
      storedRoleIds: ['builder'],
      currentRoleIds: [neighborId],
      allowlist,
      neighborId,
    });

    expect(result.rolesToAdd).toEqual(['builder']);
  });

  it('does not restore a role that is not on the allowlist', () => {
    const result = planJoinActions({
      storedRoleIds: ['crew'],
      currentRoleIds: [neighborId],
      allowlist,
      neighborId,
    });

    expect(result.rolesToAdd).toEqual([]);
  });

  it('does not re-add a stored role the member already holds', () => {
    const result = planJoinActions({
      storedRoleIds: ['builder'],
      currentRoleIds: [neighborId, 'builder'],
      allowlist,
      neighborId,
    });

    expect(result.rolesToAdd).toEqual([]);
  });

  it('includes a stored role even if it no longer exists as a live Discord role — the handler catches that failure', () => {
    const result = planJoinActions({
      storedRoleIds: ['deleted-role'],
      currentRoleIds: [neighborId],
      allowlist: ['deleted-role'],
      neighborId,
    });

    expect(result.rolesToAdd).toEqual(['deleted-role']);
  });
});
