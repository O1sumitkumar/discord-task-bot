export function planLeaveActions(currentRoleIds: string[], allowlist: string[]): string[] {
  return currentRoleIds.filter((roleId) => allowlist.includes(roleId));
}
