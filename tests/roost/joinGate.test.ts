import { describe, it, expect } from 'vitest';
import {
  JOIN_BUTTON_ID,
  countWaiting,
  decideJoinClick,
  hasJoinPrompt,
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

describe('hasJoinPrompt', () => {
  const botId = 'roost';

  it('finds the join prompt Roost already posted', () => {
    expect(hasJoinPrompt([{ authorId: botId, componentCustomIds: [JOIN_BUTTON_ID] }], botId)).toBe(
      true
    );
  });

  it('ignores a message with the same button id from someone else', () => {
    expect(
      hasJoinPrompt([{ authorId: 'impostor', componentCustomIds: [JOIN_BUTTON_ID] }], botId)
    ).toBe(false);
  });

  it('ignores Roost messages that carry no join button', () => {
    expect(hasJoinPrompt([{ authorId: botId, componentCustomIds: [] }], botId)).toBe(false);
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
