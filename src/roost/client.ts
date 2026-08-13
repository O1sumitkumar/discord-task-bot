import {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  type Guild,
  type GuildTextBasedChannel,
} from 'discord.js';
import type { Database } from 'better-sqlite3';
import type { Config } from '../config';
import { onMemberJoin } from './onMemberJoin';
import { onMemberLeave } from './onMemberLeave';
import { logToModLog } from './modLog';

// Sticky roles restore only from this allowlist — never "whatever they had".
// See "Sticky roles restore from an allowlist, never from 'whatever they had'"
// in the design doc for why Crew and bot roles must never be added here.
const STICKY_ROLE_ALLOWLIST_NAMES = ['Builder', 'Connector', 'Voice'];

async function resolveAllowlistIds(guild: Guild): Promise<string[]> {
  const roles = await guild.roles.fetch();
  return roles
    .filter((role) => STICKY_ROLE_ALLOWLIST_NAMES.includes(role.name))
    .map((role) => role.id);
}

async function runSelfCheck(
  guild: Guild,
  config: Config
): Promise<{ ok: true; welcomeChannel: GuildTextBasedChannel; modLogChannel: GuildTextBasedChannel } | { ok: false }> {
  const me = guild.members.me;
  if (!me) {
    console.error('[roost] self-check failed: not a member of the guild');
    return { ok: false };
  }

  const neighborRole = await guild.roles.fetch(config.neighborRoleId);
  if (!neighborRole) {
    console.error('[roost] self-check failed: NEIGHBOR_ROLE_ID does not resolve');
    return { ok: false };
  }

  if (me.roles.highest.position <= neighborRole.position) {
    console.error('[roost] self-check failed: Roost role is not above Neighbor');
    return { ok: false };
  }

  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    console.error('[roost] self-check failed: missing Manage Roles');
    return { ok: false };
  }

  const welcomeChannel = await guild.channels.fetch(config.welcomeChannelId);
  const modLogChannel = await guild.channels.fetch(config.modLogChannelId);
  if (!welcomeChannel || !welcomeChannel.isTextBased()) {
    console.error('[roost] self-check failed: WELCOME_CHANNEL_ID does not resolve to a text channel');
    return { ok: false };
  }
  if (!modLogChannel || !modLogChannel.isTextBased()) {
    console.error('[roost] self-check failed: MOD_LOG_CHANNEL_ID does not resolve to a text channel');
    return { ok: false };
  }

  return { ok: true, welcomeChannel, modLogChannel };
}

async function reconcile(
  guild: Guild,
  db: Database,
  config: Config,
  allowlist: string[],
  modLogChannel: GuildTextBasedChannel
): Promise<void> {
  // Discord does not replay gateway events. A join missed while Roost was offline
  // (deploy, restart, crash) is gone with no retry — so on every boot we sweep the
  // full member list and fix anyone missing Neighbor. See "Reconciliation on
  // startup — required, not optional" in the design doc.
  const members = await guild.members.fetch();
  const missingNeighbor = members.filter((member) => !member.roles.cache.has(config.neighborRoleId));

  for (const member of missingNeighbor.values()) {
    await onMemberJoin(member, {
      db,
      neighborId: config.neighborRoleId,
      allowlist,
      welcomeChannel: null, // reconciliation fixes access silently; it does not re-welcome
      modLogChannel,
    });
  }

  if (missingNeighbor.size > 0) {
    await logToModLog(modLogChannel, `Reconciliation: fixed ${missingNeighbor.size} member(s) missing Neighbor`);
  }
}

export function createRoostClient(db: Database, config: Config): Client {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  client.once('ready', async () => {
    console.log(`[roost] Logged in as ${client.user?.tag}`);

    const guild = await client.guilds.fetch(config.guildId);
    const check = await runSelfCheck(guild, config);
    if (!check.ok) {
      console.error('[roost] self-check failed — handlers NOT armed. Roost will not assign roles.');
      return;
    }

    const allowlist = await resolveAllowlistIds(guild);
    await reconcile(guild, db, config, allowlist, check.modLogChannel);

    client.on('guildMemberAdd', (member) => {
      onMemberJoin(member, {
        db,
        neighborId: config.neighborRoleId,
        allowlist,
        welcomeChannel: check.welcomeChannel,
        modLogChannel: check.modLogChannel,
      }).catch((error) => console.error('[roost] onMemberJoin failed', error));
    });

    client.on('guildMemberRemove', (member) => {
      if (member.partial) return; // PartialGuildMember lacks role data; nothing to snapshot
      onMemberLeave(member, {
        db,
        allowlist,
        modLogChannel: check.modLogChannel,
      }).catch((error) => console.error('[roost] onMemberLeave failed', error));
    });

    console.log('[roost] self-check passed — handlers armed');
  });

  return client;
}
