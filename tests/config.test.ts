import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('throws when required variables are missing', () => {
    expect(() => loadConfig({})).toThrow(/Missing required environment variables/);
  });

  it('throws listing only the missing variables', () => {
    expect(() =>
      loadConfig({
        DISCORD_TOKEN: 'x',
        GUILD_ID: 'y',
        ROOST_TOKEN: 'r',
        ROOST_CLIENT_ID: 'r',
        WELCOME_CHANNEL_ID: 'r',
        MOD_LOG_CHANNEL_ID: 'r',
        NEIGHBOR_ROLE_ID: 'r',
        INTRODUCTIONS_CHANNEL_ID: 'r',
      } as NodeJS.ProcessEnv)
    ).toThrow(/DISCORD_CLIENT_ID, TASKS_CHANNEL_ID, DB_PATH/);
  });

  it('returns a populated config when all variables are present', () => {
    const config = loadConfig({
      DISCORD_TOKEN: 'token',
      DISCORD_CLIENT_ID: 'client',
      GUILD_ID: 'guild',
      TASKS_CHANNEL_ID: 'channel',
      DB_PATH: './data/tasks.db',
      ROOST_TOKEN: 'roost-token',
      ROOST_CLIENT_ID: 'roost-client',
      WELCOME_CHANNEL_ID: 'welcome-channel',
      MOD_LOG_CHANNEL_ID: 'mod-log-channel',
      NEIGHBOR_ROLE_ID: 'neighbor-role',
      INTRODUCTIONS_CHANNEL_ID: 'introductions-channel',
    } as NodeJS.ProcessEnv);

    expect(config).toEqual({
      discordToken: 'token',
      discordClientId: 'client',
      guildId: 'guild',
      tasksChannelId: 'channel',
      dbPath: './data/tasks.db',
      roostToken: 'roost-token',
      roostClientId: 'roost-client',
      welcomeChannelId: 'welcome-channel',
      modLogChannelId: 'mod-log-channel',
      neighborRoleId: 'neighbor-role',
      introductionsChannelId: 'introductions-channel',
    });
  });

  it('returns Roost fields when all variables are present', () => {
    const config = loadConfig({
      DISCORD_TOKEN: 'token',
      DISCORD_CLIENT_ID: 'client',
      GUILD_ID: 'guild',
      TASKS_CHANNEL_ID: 'channel',
      DB_PATH: './data/tasks.db',
      ROOST_TOKEN: 'roost-token',
      ROOST_CLIENT_ID: 'roost-client',
      WELCOME_CHANNEL_ID: 'welcome-channel',
      MOD_LOG_CHANNEL_ID: 'mod-log-channel',
      NEIGHBOR_ROLE_ID: 'neighbor-role',
      INTRODUCTIONS_CHANNEL_ID: 'introductions-channel',
    } as NodeJS.ProcessEnv);

    expect(config.roostToken).toBe('roost-token');
    expect(config.roostClientId).toBe('roost-client');
    expect(config.welcomeChannelId).toBe('welcome-channel');
    expect(config.modLogChannelId).toBe('mod-log-channel');
    expect(config.neighborRoleId).toBe('neighbor-role');
    expect(config.introductionsChannelId).toBe('introductions-channel');
  });
});
