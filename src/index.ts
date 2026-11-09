import { Client, GatewayIntentBits, Collection, ChatInputCommandInteraction } from 'discord.js';
import type { Database } from 'better-sqlite3';
import dotenv from 'dotenv';
import { loadConfig } from './config';
import { initDb } from './db';
import * as taskCommand from './commands/task';
import * as eventCommand from './commands/event';
import * as pollCommand from './commands/poll';
import { startReminderJob } from './reminderJob';
import { createRoostClient } from './roost/client';
import { startRoost } from './roost/startRoost';

// override: true so this repo's .env wins over anything already exported by the
// shell. A global DISCORD_TOKEN in ~/.zshrc (Perch's) otherwise shadows it
// silently, and the bot authenticates as the wrong application.
dotenv.config({ override: true });

const config = loadConfig();
const db = initDb(config.dbPath);

interface Command {
  data: { name: string };
  execute: (interaction: ChatInputCommandInteraction, db: Database) => Promise<void>;
}

const commands = new Collection<string, Command>();
commands.set(taskCommand.data.name, {
  data: taskCommand.data,
  execute: (interaction, db) => taskCommand.execute(interaction, db),
});
commands.set(eventCommand.data.name, {
  data: eventCommand.data,
  execute: (interaction) => eventCommand.execute(interaction),
});
commands.set(pollCommand.data.name, {
  data: pollCommand.data,
  execute: (interaction) => pollCommand.execute(interaction),
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`Logged in as ${client.user?.tag}`);
  startReminderJob(client, db, config.tasksChannelId);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, db);
  } catch (error) {
    console.error(`Error executing /${interaction.commandName}`, error);
    const errorReply = { content: 'Something went wrong running that command.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorReply);
    } else {
      await interaction.reply(errorReply);
    }
  }
});

client.login(config.discordToken);

const roostClient = createRoostClient(db, config);
void startRoost(() => roostClient.login(config.roostToken), console.error);
