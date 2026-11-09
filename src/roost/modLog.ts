export interface LogPayload {
  content: string;
  allowedMentions: { parse: never[] };
}

export interface LoggableChannel {
  send: (payload: LogPayload) => Promise<unknown>;
}

export async function logToModLog(
  channel: LoggableChannel | null | undefined,
  message: string
): Promise<void> {
  if (!channel) {
    console.error('[mod-log]', message);
    return;
  }

  try {
    // Mod-log lines quote member text (join answers), so they must never ping:
    // no @everyone, no role, no user notification. Mentions still render.
    await channel.send({ content: message, allowedMentions: { parse: [] } });
  } catch (error) {
    console.error('[mod-log] failed to send, falling back to console:', message, error);
  }
}
