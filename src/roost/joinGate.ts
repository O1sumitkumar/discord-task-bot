// The join gate. A new member gets no access on join: they land in #welcome and
// click one button to get Neighbor. Bots that scrape an invite and join rarely
// click it, and a click is a cheap, visible signal a real person is there.
// Pure decisions only — the Discord side lives in client.ts.

export const JOIN_BUTTON_ID = 'roost:join';
export const JOIN_BUTTON_LABEL = "I'm in";
export const JOIN_PROMPT =
  'Welcome in. Tap the button below to open up the rest of the server. ' +
  'It gives you the Neighbor role, which is where everyone starts.';

export type JoinClickDecision = 'grant' | 'already-in';

export function decideJoinClick(currentRoleIds: string[], neighborId: string): JoinClickDecision {
  return currentRoleIds.includes(neighborId) ? 'already-in' : 'grant';
}

export interface PostedMessage {
  authorId: string;
  componentCustomIds: string[];
}

/**
 * True when Roost's own join prompt is already in the channel. Matching on the
 * author as well as the button id means a copied message cannot stand in for it.
 */
export function hasJoinPrompt(messages: PostedMessage[], botUserId: string): boolean {
  return messages.some(
    (message) => message.authorId === botUserId && message.componentCustomIds.includes(JOIN_BUTTON_ID)
  );
}

export interface MemberSummary {
  isBot: boolean;
  roleIds: string[];
}

/** People still waiting in #welcome: humans without Neighbor. */
export function countWaiting(members: MemberSummary[], neighborId: string): number {
  return members.filter((member) => !member.isBot && !member.roleIds.includes(neighborId)).length;
}
