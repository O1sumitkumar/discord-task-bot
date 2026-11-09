import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import { loadConfig } from './config';
import { data as taskCommand } from './commands/task';
import { data as eventCommand } from './commands/event';
import { data as pollCommand } from './commands/poll';

// override: true so this repo's .env wins over anything already exported by the
// shell. A global DISCORD_TOKEN in ~/.zshrc (Perch's) otherwise shadows it
// silently, and the bot authenticates as the wrong application.
dotenv.config({ override: true });

async function main() {
  const config = loadConfig();
  const rest = new REST().setToken(config.discordToken);
  const commands = [taskCommand.toJSON(), eventCommand.toJSON(), pollCommand.toJSON()];

  await rest.put(Routes.applicationGuildCommands(config.discordClientId, config.guildId), {
    body: commands,
  });

  console.log(`Registered ${commands.length} commands to guild ${config.guildId}.`);
}

main().catch((error) => {
  console.error('Failed to register commands:', error);
  process.exit(1);
});
