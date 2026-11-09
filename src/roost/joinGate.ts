// The join gate. A new member gets no access on join: they land in #welcome and
// click one button to get Neighbor. Bots that scrape an invite and join rarely
// click it, and a click is a cheap, visible signal a real person is there.
// Pure decisions only — the Discord side lives in client.ts.

export const JOIN_BUTTON_ID = 'roost:join';
// The button is also the community-guidelines agreement: one tap means the
// person agreed and is in. The click is logged in #mod-log with a timestamp.
export const JOIN_BUTTON_LABEL = 'I agree, let me in';
export const JOIN_PROMPT =
  'Before you come in, read how we treat each other above. Our full community guidelines ' +
  'live in the Community Handbook: <https://github.com/philaconvalley/community-handbook>\n\n' +
  'Tap the button to agree to them and open up the rest of the server. ' +
  'It gives you the Neighbor role, which is where everyone starts.';

// If granting Neighbor fails, nobody adds it by hand: the click is the
// guidelines agreement, so the button is the only way in. Crew fixes the button.
export const JOIN_FAILED_REPLY =
  "Something went wrong with the button. We've been told and will fix it. Please try again later.";

export function buildJoinFailedLog(memberId: string, error: unknown): string {
  return (
    `Join button failed for <@${memberId}>: ${error}. ` +
    'Do not add Neighbor by hand; the button is how people agree to the guidelines. ' +
    'Tell Waskar so the button gets fixed.'
  );
}

export type JoinClickDecision = 'grant' | 'already-in';

export function decideJoinClick(currentRoleIds: string[], neighborId: string): JoinClickDecision {
  return currentRoleIds.includes(neighborId) ? 'already-in' : 'grant';
}

export interface PostedMessage {
  id: string;
  authorId: string;
  content: string;
  buttons: { customId: string; label: string | null }[];
}

export type JoinPromptPlan = { action: 'none' } | { action: 'post' } | { action: 'edit'; messageId: string };

/**
 * Decide what to do with the join prompt in #welcome on startup. Roost keeps
 * exactly one: it posts one if none exists, and edits its own when the wording
 * or button label changed, so a copy change never stacks a second button.
 * Matching on the author as well as the button id means a copied message
 * cannot stand in for Roost's.
 */
export function planJoinPrompt(messages: PostedMessage[], botUserId: string): JoinPromptPlan {
  const existing = messages.find(
    (message) =>
      message.authorId === botUserId && message.buttons.some((button) => button.customId === JOIN_BUTTON_ID)
  );
  if (!existing) return { action: 'post' };

  const label = existing.buttons.find((button) => button.customId === JOIN_BUTTON_ID)?.label;
  if (existing.content === JOIN_PROMPT && label === JOIN_BUTTON_LABEL) return { action: 'none' };
  return { action: 'edit', messageId: existing.id };
}

export interface MemberSummary {
  isBot: boolean;
  roleIds: string[];
}

/** People still waiting in #welcome: humans without Neighbor. */
export function countWaiting(members: MemberSummary[], neighborId: string): number {
  return members.filter((member) => !member.isBot && !member.roleIds.includes(neighborId)).length;
}
