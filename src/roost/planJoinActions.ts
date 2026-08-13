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
  const rolesToAdd = new Set<string>();

  if (!input.currentRoleIds.includes(input.neighborId)) {
    rolesToAdd.add(input.neighborId);
  }

  for (const roleId of input.storedRoleIds) {
    if (input.allowlist.includes(roleId) && !input.currentRoleIds.includes(roleId)) {
      rolesToAdd.add(roleId);
    }
  }

  return { rolesToAdd: Array.from(rolesToAdd) };
}
