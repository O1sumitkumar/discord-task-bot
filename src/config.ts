export interface Config {
  discordToken: string;
  discordClientId: string;
  guildId: string;
  tasksChannelId: string;
  dbPath: string;
  roostToken: string;
  roostClientId: string;
  welcomeChannelId: string;
  modLogChannelId: string;
  neighborRoleId: string;
  introductionsChannelId: string;
}

const REQUIRED_KEYS = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'GUILD_ID',
  'TASKS_CHANNEL_ID',
  'DB_PATH',
  'ROOST_TOKEN',
  'ROOST_CLIENT_ID',
  'WELCOME_CHANNEL_ID',
  'MOD_LOG_CHANNEL_ID',
  'NEIGHBOR_ROLE_ID',
  'INTRODUCTIONS_CHANNEL_ID',
] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const missing = REQUIRED_KEYS.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    discordToken: env.DISCORD_TOKEN!,
    discordClientId: env.DISCORD_CLIENT_ID!,
    guildId: env.GUILD_ID!,
    tasksChannelId: env.TASKS_CHANNEL_ID!,
    dbPath: env.DB_PATH!,
    roostToken: env.ROOST_TOKEN!,
    roostClientId: env.ROOST_CLIENT_ID!,
    welcomeChannelId: env.WELCOME_CHANNEL_ID!,
    modLogChannelId: env.MOD_LOG_CHANNEL_ID!,
    neighborRoleId: env.NEIGHBOR_ROLE_ID!,
    introductionsChannelId: env.INTRODUCTIONS_CHANNEL_ID!,
  };
}
