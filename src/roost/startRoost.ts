// The Task Bot and Roost share one process. A rejected promise with no handler
// ends a Node process, so an unguarded Roost login failure (a bad token, or
// Discord refusing the Server Members intent) took the Task Bot down too. That
// happened on 2026-11-09 and cost about six minutes of Task Bot downtime.
// This keeps a Roost failure inside Roost: it is logged, and the process lives.

export type Report = (message: string, error: unknown) => void;

export async function startRoost(login: () => Promise<unknown>, report: Report): Promise<boolean> {
  try {
    await login();
    return true;
  } catch (error) {
    report('[roost] login failed — Roost is off; the Task Bot keeps running.', error);
    return false;
  }
}
