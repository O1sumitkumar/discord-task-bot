import type { GuildMember } from 'discord.js';
import type { Database } from 'better-sqlite3';
import { planLeaveActions } from './planLeaveActions';
import { saveRoles } from '../repositories/memberRoleRepository';
import { logToModLog, type LoggableChannel } from './modLog';

export interface OnMemberLeaveDeps {
  db: Database;
  allowlist: string[];
  modLogChannel: LoggableChannel | null;
}

export async function onMemberLeave(member: GuildMember, deps: OnMemberLeaveDeps): Promise<void> {
  const currentRoleIds = [...member.roles.cache.keys()];
  const rolesToStore = planLeaveActions(currentRoleIds, deps.allowlist);

  let saveFailed = false;
  try {
    // Always write, even when rolesToStore is empty — see
    // docs/superpowers/specs/2026-08-12-roost-membership-bot-design.md, "On leave".
    // Skipping the write on an empty list leaves a stale, wrong snapshot in place.
    saveRoles(deps.db, member.id, rolesToStore);
  } catch (error) {
    saveFailed = true;
    await logToModLog(
      deps.modLogChannel,
      `Failed to save role snapshot for <@${member.id}> on leave: ${error}`
    );
  }

  if (!saveFailed) {
    await logToModLog(
      deps.modLogChannel,
      `Left: <@${member.id}> — stored [${rolesToStore.join(', ') || 'none'}]`
    );
  }
}
