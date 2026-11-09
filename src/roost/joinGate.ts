// The join gate. A new member gets no access on join: they land in #welcome and
// click one button to get Neighbor. Bots that scrape an invite and join rarely
// click it, and a click is a cheap, visible signal a real person is there.
// Pure decisions only — the Discord side lives in client.ts.

export const JOIN_BUTTON_ID = 'roost:join';
// The button is also the community-guidelines agreement: one tap means the
// person agreed and is in. The click is logged in #mod-log with a timestamp.
export const JOIN_BUTTON_LABEL = 'I agree, let me in';
export const JOIN_PROMPT =
  'Tap the button to agree to our community guidelines above. ' +
  "We'll ask one quick question, what brought you here, and then you're in. " +
  'You get the Neighbor role, which is where everyone starts.\n\n' +
  'Crew reads your answer. Nobody else sees it.';

// The button opens a one-question form. A one-click button is easy to script;
// a short written answer is not, and it gives Crew a real first word from each
// new member. A real answer lets the person in at once: nobody waits on Crew,
// and nobody adds Neighbor by hand.
export const JOIN_MODAL_ID = 'roost:join-modal';
export const JOIN_ANSWER_ID = 'roost:join-answer';
export const JOIN_MODAL_TITLE = 'Before you come in';
export const JOIN_QUESTION_LABEL = 'What brought you to PhilaCon Valley?';
export const JOIN_QUESTION_PLACEHOLDER = 'An event, a friend, a search. A sentence or two is plenty.';
export const JOIN_ANSWER_MIN = 10;
export const JOIN_ANSWER_MAX = 300;
export const JOIN_RETRY_REPLY =
  'Tell us a little more, in a sentence or two. Tap the button to try again.';

export type JoinAnswerCheck = { ok: true; answer: string } | { ok: false };

export function checkJoinAnswer(raw: string): JoinAnswerCheck {
  const answer = raw.trim();
  if (answer.length < JOIN_ANSWER_MIN) return { ok: false };
  if (answer.split(/\s+/).length < 2) return { ok: false };
  if (new Set(answer.replace(/\s/g, '').toLowerCase()).size < 3) return { ok: false };
  return { ok: true, answer };
}

export function buildLetInLog(memberId: string, answer: string): string {
  const oneLine = answer.replace(/\s+/g, ' ').trim();
  return (
    `Let in: <@${memberId}> agreed to the community guidelines and answered ` +
    `"What brought you here?"\n> ${oneLine}`
  );
}

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
