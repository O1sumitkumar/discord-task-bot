import { describe, it, expect, vi, afterEach } from 'vitest';
import { logToModLog } from '../../src/roost/modLog';

describe('logToModLog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the message to the channel when the channel is reachable', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await logToModLog({ send }, 'Joined: <@user-1>');
    expect(send).toHaveBeenCalledWith({ content: 'Joined: <@user-1>', allowedMentions: { parse: [] } });
  });

  it("never pings anyone, so a member's answer cannot mention @everyone or a role", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await logToModLog({ send }, '> @everyone <@&role-1>');
    expect(send.mock.calls[0][0].allowedMentions).toEqual({ parse: [] });
  });

  it('falls back to console.error when there is no channel', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await logToModLog(null, 'Joined: <@user-1>');
    expect(errorSpy).toHaveBeenCalledWith('[mod-log]', 'Joined: <@user-1>');
  });

  it('falls back to console.error when send() throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = vi.fn().mockRejectedValue(new Error('channel gone'));
    await logToModLog({ send }, 'Joined: <@user-1>');
    expect(errorSpy).toHaveBeenCalled();
  });
});
