import type { GuildMember, TextBasedChannel } from 'discord.js';
import type { Database } from 'better-sqlite3';
import { planJoinActions } from './planJoinActions';
import { getRoles } from '../repositories/memberRoleRepository';
import { buildWelcomeMessage } from './welcome';
import { logToModLog, type LoggableChannel } from './modLog';

export interface OnMemberJoinDeps {
  db: Database;
  neighborId: string;
  allowlist: string[];
  welcomeChannel: TextBasedChannel | null;
  modLogChannel: LoggableChannel | null;
}

export async function onMemberJoin(member: GuildMember, deps: OnMemberJoinDeps): Promise<void> {
  const storedRoleIds = getRoles(deps.db, member.id);
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

  try {
    if (deps.welcomeChannel && 'send' in deps.welcomeChannel) {
      await deps.welcomeChannel.send(buildWelcomeMessage(member.id));
    }
  } catch (error) {
    await logToModLog(deps.modLogChannel, `Failed to post welcome for <@${member.id}>: ${error}`);
  }

  await logToModLog(
    deps.modLogChannel,
    `Joined: <@${member.id}> — assigned [${rolesToAdd.join(', ') || 'none'}]`
  );
}
