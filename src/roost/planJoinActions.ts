export interface PlanJoinActionsInput {
  storedRoleIds: string[];
  currentRoleIds: string[];
  allowlist: string[];
  neighborId: string;
}

export interface PlanJoinActionsResult {
  rolesToAdd: string[];
}

export function planJoinActions(input: PlanJoinActionsInput): PlanJoinActionsResult {
  // Neighbor is never granted on join. The join button in #welcome is the only
  // way to get it, so a bot that joins with a scraped invite stays at the door.
  // Allowlisted roles (Builder, Connector, Voice) still restore on rejoin: they
  // carry no channel access on their own, so restoring them opens nothing.
  const rolesToAdd = new Set<string>();

  for (const roleId of input.storedRoleIds) {
    if (roleId === input.neighborId) continue;
    if (input.allowlist.includes(roleId) && !input.currentRoleIds.includes(roleId)) {
      rolesToAdd.add(roleId);
    }
  }

  return { rolesToAdd: Array.from(rolesToAdd) };
}
