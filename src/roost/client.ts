import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type Guild,
  type GuildTextBasedChannel,
  type PermissionResolvable,
} from 'discord.js';
import type { Database } from 'better-sqlite3';
import type { Config } from '../config';
import { onMemberJoin } from './onMemberJoin';
import { onMemberLeave } from './onMemberLeave';
import { logToModLog } from './modLog';
import { buildWelcomeMessage } from './welcome';
import {
  JOIN_BUTTON_ID,
  JOIN_BUTTON_LABEL,
  JOIN_FAILED_REPLY,
  JOIN_PROMPT,
  buildJoinFailedLog,
  countWaiting,
  decideJoinClick,
  planJoinPrompt,
} from './joinGate';

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

interface Channels {
  welcomeChannel: GuildTextBasedChannel;
  modLogChannel: GuildTextBasedChannel;
  introductionsChannel: GuildTextBasedChannel;
}

async function fetchTextChannel(
  guild: Guild,
  id: string,
  key: string
): Promise<GuildTextBasedChannel | null> {
  const channel = await guild.channels.fetch(id);
  if (!channel || !channel.isTextBased()) {
    console.error(`[roost] self-check failed: ${key} does not resolve to a text channel`);
    return null;
  }
  return channel;
}

function canUse(
  guild: Guild,
  channel: GuildTextBasedChannel,
  needed: PermissionResolvable[],
  key: string
): boolean {
  const me = guild.members.me;
  const missing = needed.filter((perm) => !channel.permissionsFor(me!)?.has(perm));
  if (missing.length > 0) {
    // #welcome denies Send Messages to @everyone, so Roost needs its own channel
    // permission there. This names the gap instead of failing on the first post.
    console.error(`[roost] self-check failed: missing permissions in ${key}`);
    return false;
  }
  return true;
}

async function runSelfCheck(
  guild: Guild,
  config: Config
): Promise<({ ok: true } & Channels) | { ok: false }> {
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

  const welcomeChannel = await fetchTextChannel(guild, config.welcomeChannelId, 'WELCOME_CHANNEL_ID');
  const modLogChannel = await fetchTextChannel(guild, config.modLogChannelId, 'MOD_LOG_CHANNEL_ID');
  const introductionsChannel = await fetchTextChannel(
    guild,
    config.introductionsChannelId,
    'INTRODUCTIONS_CHANNEL_ID'
  );
  if (!welcomeChannel || !modLogChannel || !introductionsChannel) {
    return { ok: false };
  }

  const view = PermissionFlagsBits.ViewChannel;
  const send = PermissionFlagsBits.SendMessages;
  const history = PermissionFlagsBits.ReadMessageHistory;
  if (
    !canUse(guild, welcomeChannel, [view, send, history], '#welcome') ||
    !canUse(guild, introductionsChannel, [view, send], '#introductions') ||
    !canUse(guild, modLogChannel, [view, send], '#mod-log')
  ) {
    return { ok: false };
  }

  return { ok: true, welcomeChannel, modLogChannel, introductionsChannel };
}

/**
 * Keep exactly one join prompt in #welcome, with the current wording. On boot,
 * look through recent messages for Roost's own prompt: post one if it is
 * missing, edit it if the wording changed, and otherwise leave it alone.
 */
async function ensureJoinPrompt(channel: GuildTextBasedChannel, botUserId: string): Promise<void> {
  const recent = await channel.messages.fetch({ limit: 50 });
  const posted = recent.map((message) => ({
    id: message.id,
    authorId: message.author.id,
    content: message.content,
    buttons: message.components.flatMap((row) =>
      'components' in row
        ? row.components.flatMap((component) =>
            'customId' in component && typeof component.customId === 'string'
              ? [{ customId: component.customId, label: 'label' in component ? (component.label ?? null) : null }]
              : []
          )
        : []
    ),
  }));

  const plan = planJoinPrompt(posted, botUserId);
  if (plan.action === 'none') return;

  const button = new ButtonBuilder()
    .setCustomId(JOIN_BUTTON_ID)
    .setLabel(JOIN_BUTTON_LABEL)
    .setStyle(ButtonStyle.Primary);
  const payload = {
    content: JOIN_PROMPT,
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
  };

  if (plan.action === 'edit') {
    await recent.get(plan.messageId)!.edit(payload);
  } else {
    await channel.send(payload);
  }
}

async function handleJoinClick(
  interaction: ButtonInteraction,
  config: Config,
  channels: Channels
): Promise<void> {
  const member = await interaction.guild!.members.fetch(interaction.user.id);
  const decision = decideJoinClick([...member.roles.cache.keys()], config.neighborRoleId);

  if (decision === 'already-in') {
    await interaction.reply({
      content: "You're already in. Welcome back.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await member.roles.add(config.neighborRoleId);
  } catch (error) {
    await interaction.reply({
      content: JOIN_FAILED_REPLY,
      flags: MessageFlags.Ephemeral,
    });
    await logToModLog(channels.modLogChannel, buildJoinFailedLog(member.id, error));
    return;
  }

  await interaction.reply({
    content: `You're in. Head to <#${channels.introductionsChannel.id}> and tell us who you are.`,
    flags: MessageFlags.Ephemeral,
  });

  try {
    await channels.introductionsChannel.send(buildWelcomeMessage(member.id));
  } catch (error) {
    await logToModLog(channels.modLogChannel, `Failed to greet <@${member.id}>: ${error}`);
  }

  await logToModLog(channels.modLogChannel, `Let in: <@${member.id}> agreed to the community guidelines and clicked the join button.`);
}

async function reportWaiting(
  guild: Guild,
  config: Config,
  modLogChannel: GuildTextBasedChannel
): Promise<void> {
  // The August design swept the member list on boot and granted Neighbor to
  // anyone missing it, to cover joins missed while Roost was offline. With the
  // join button that sweep would let every waiting account in, bots included,
  // the first time Roost started. Missed joins need nothing now: the button
  // stays in #welcome, so the sweep only reports who is still waiting.
  const members = await guild.members.fetch();
  const waiting = countWaiting(
    members.map((member) => ({ isBot: member.user.bot, roleIds: [...member.roles.cache.keys()] })),
    config.neighborRoleId
  );

  if (waiting > 0) {
    await logToModLog(modLogChannel, `Startup: ${waiting} member(s) waiting at the #welcome button.`);
  }
}

export function createRoostClient(db: Database, config: Config): Client {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  client.on('error', (error) => console.error('[roost] client error', error));

  client.once('ready', async () => {
    console.log(`[roost] Logged in as ${client.user?.tag}`);

    try {
      const guild = await client.guilds.fetch(config.guildId);
      const check = await runSelfCheck(guild, config);
      if (!check.ok) {
        console.error('[roost] self-check failed — handlers NOT armed. Roost will not let anyone in.');
        return;
      }

      const allowlist = await resolveAllowlistIds(guild);
      await ensureJoinPrompt(check.welcomeChannel, client.user!.id);

      client.on('guildMemberAdd', (member) => {
        onMemberJoin(member, {
          db,
          neighborId: config.neighborRoleId,
          allowlist,
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

      client.on('interactionCreate', (interaction) => {
        if (!interaction.isButton() || interaction.customId !== JOIN_BUTTON_ID) return;
        if (interaction.guildId !== config.guildId) return;
        handleJoinClick(interaction, config, check).catch((error) =>
          console.error('[roost] join click failed', error)
        );
      });

      await reportWaiting(guild, config, check.modLogChannel);

      console.log('[roost] self-check passed — handlers armed');
    } catch (error) {
      console.error('[roost] startup failed unexpectedly — handlers NOT armed', error);
    }
  });

  return client;
}
