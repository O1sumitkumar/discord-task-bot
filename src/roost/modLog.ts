export interface LoggableChannel {
  send: (message: string) => Promise<unknown>;
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
    await channel.send(message);
  } catch (error) {
    console.error('[mod-log] failed to send, falling back to console:', message, error);
  }
}
