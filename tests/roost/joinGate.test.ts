import { describe, it, expect } from 'vitest';
import {
  JOIN_BUTTON_ID,
  JOIN_BUTTON_LABEL,
  JOIN_FAILED_REPLY,
  JOIN_PROMPT,
  buildJoinFailedLog,
  countWaiting,
  decideJoinClick,
  planJoinPrompt,
} from '../../src/roost/joinGate';

const neighborId = 'neighbor';

describe('decideJoinClick', () => {
  it('grants Neighbor to a member who does not have it', () => {
    expect(decideJoinClick(['builder'], neighborId)).toBe('grant');
  });

  it('reports already-in for a member who has Neighbor', () => {
    expect(decideJoinClick([neighborId], neighborId)).toBe('already-in');
  });
});

describe('planJoinPrompt', () => {
  const botId = 'roost';
  const current = {
    id: 'm1',
    authorId: botId,
    content: JOIN_PROMPT,
    buttons: [{ customId: JOIN_BUTTON_ID, label: JOIN_BUTTON_LABEL }],
  };

  it('does nothing when the current prompt is already posted', () => {
    expect(planJoinPrompt([current], botId)).toEqual({ action: 'none' });
  });

  it('posts a prompt when none exists', () => {
    expect(planJoinPrompt([], botId)).toEqual({ action: 'post' });
  });

  it('edits the existing prompt when its wording is out of date', () => {
    const old = { ...current, content: 'Welcome in. Tap the button below.' };
    expect(planJoinPrompt([old], botId)).toEqual({ action: 'edit', messageId: 'm1' });
  });

  it('edits the existing prompt when only the button label changed', () => {
    const old = { ...current, buttons: [{ customId: JOIN_BUTTON_ID, label: "I'm in" }] };
    expect(planJoinPrompt([old], botId)).toEqual({ action: 'edit', messageId: 'm1' });
  });

  it('ignores a message with the same button id from someone else', () => {
    expect(planJoinPrompt([{ ...current, authorId: 'impostor' }], botId)).toEqual({ action: 'post' });
  });

  it('ignores Roost messages that carry no join button', () => {
    expect(planJoinPrompt([{ ...current, buttons: [] }], botId)).toEqual({ action: 'post' });
  });
});

describe('the join prompt', () => {
  it('asks people to agree to the community guidelines', () => {
    expect(JOIN_PROMPT).toMatch(/guidelines/i);
    expect(JOIN_BUTTON_LABEL).toMatch(/agree/i);
  });

  it('fits Discord limits: 2000 characters for content, 80 for a button label', () => {
    expect(JOIN_PROMPT.length).toBeLessThanOrEqual(2000);
    expect(JOIN_BUTTON_LABEL.length).toBeLessThanOrEqual(80);
  });
});

describe('countWaiting', () => {
  it('counts humans without Neighbor and skips bots', () => {
    const members = [
      { isBot: false, roleIds: [] },
      { isBot: false, roleIds: ['builder'] },
      { isBot: false, roleIds: [neighborId] },
      { isBot: true, roleIds: [] },
    ];

    expect(countWaiting(members, neighborId)).toBe(2);
  });
});

describe('when the join button fails', () => {
  // Neighbor comes only from the button, because the click is the guidelines
  // agreement. A failure must never tell anyone to add the role by hand.
  const log = buildJoinFailedLog('123', 'DiscordAPIError: Missing Permissions');

  it('tells Crew not to add Neighbor by hand', () => {
    expect(log).toMatch(/do not add neighbor by hand/i);
    expect(log).not.toMatch(/^(?!.*do not).*add neighbor by hand/im);
  });

  it('names the member and the error so the button can be fixed', () => {
    expect(log).toContain('<@123>');
    expect(log).toContain('Missing Permissions');
  });

  it('tells the member to try again, not that someone will let them in', () => {
    expect(JOIN_FAILED_REPLY).toMatch(/try again/i);
    expect(JOIN_FAILED_REPLY).not.toMatch(/sort it out|let you in by hand/i);
  });
});
