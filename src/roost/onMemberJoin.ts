import type { GuildMember } from 'discord.js';
import type { Database } from 'better-sqlite3';
import { planJoinActions } from './planJoinActions';
import { getRoles } from '../repositories/memberRoleRepository';
import { logToModLog, type LoggableChannel } from './modLog';

export interface OnMemberJoinDeps {
  db: Database;
  neighborId: string;
  allowlist: string[];
  modLogChannel: LoggableChannel | null;
}

export async function onMemberJoin(member: GuildMember, deps: OnMemberJoinDeps): Promise<void> {
  let storedRoleIds: string[] = [];
  try {
    storedRoleIds = getRoles(deps.db, member.id);
  } catch (error) {
    await logToModLog(
      deps.modLogChannel,
      `Failed to read stored roles for <@${member.id}> on join: ${error}`
    );
  }
  const currentRoleIds = [...member.roles.cache.keys()];
  const { rolesToAdd } = planJoinActions({
    storedRoleIds,
    currentRoleIds,
    allowlist: deps.allowlist,
    neighborId: deps.neighborId,
  });

  for (const roleId of rolesToAdd) {
    try {
      await member.roles.add(roleId);
    } catch (error) {
      await logToModLog(
        deps.modLogChannel,
        `Failed to assign role ${roleId} to <@${member.id}> on join: ${error}`
      );
    }
  }

  await logToModLog(
    deps.modLogChannel,
    `Joined: <@${member.id}> — waiting at the #welcome button. Restored [${rolesToAdd.join(', ') || 'none'}]`
  );
}
