import { describe, it, expect } from 'vitest';
import {
  buildPoll,
  MAX_ANSWER_LENGTH,
  MAX_QUESTION_LENGTH,
  MAX_DURATION_HOURS,
  DEFAULT_DURATION_HOURS,
} from '../src/lib/poll';

const question = 'What should we build at PATCH 003?';

function expectOk(result: ReturnType<typeof buildPoll>) {
  if (!result.ok) {
    throw new Error(`Expected a poll, got error: ${result.error}`);
  }
  return result.poll;
}

describe('buildPoll', () => {
  it('builds a poll from two answers', () => {
    const poll = expectOk(buildPoll({ question, answers: ['Gaming', 'Film'] }));

    expect(poll.question.text).toBe(question);
    expect(poll.answers).toEqual([{ text: 'Gaming' }, { text: 'Film' }]);
  });

  it('drops unfilled optional answers', () => {
    const poll = expectOk(
      buildPoll({ question, answers: ['Gaming', 'Film', null, null, null] })
    );

    expect(poll.answers).toHaveLength(2);
  });

  it('keeps punctuation in an answer intact', () => {
    const answer = "AR/VR — put something in a room that isn't there";
    const poll = expectOk(buildPoll({ question, answers: [answer, 'Gaming'] }));

    expect(poll.answers[0].text).toBe(answer);
  });

  it('trims surrounding whitespace', () => {
    const poll = expectOk(buildPoll({ question: `  ${question}  `, answers: ['  Gaming  ', 'Film'] }));

    expect(poll.question.text).toBe(question);
    expect(poll.answers[0].text).toBe('Gaming');
  });

  it('allows multiselect by default', () => {
    const poll = expectOk(buildPoll({ question, answers: ['Gaming', 'Film'] }));

    expect(poll.allowMultiselect).toBe(true);
  });

  it('honours multiselect set to false', () => {
    const poll = expectOk(
      buildPoll({ question, answers: ['Gaming', 'Film'], allowMultiselect: false })
    );

    expect(poll.allowMultiselect).toBe(false);
  });

  it('defaults to a seven day duration', () => {
    const poll = expectOk(buildPoll({ question, answers: ['Gaming', 'Film'] }));

    expect(poll.duration).toBe(DEFAULT_DURATION_HOURS);
  });

  it('accepts ten answers', () => {
    const answers = Array.from({ length: 10 }, (_, index) => `Answer ${index + 1}`);
    const poll = expectOk(buildPoll({ question, answers }));

    expect(poll.answers).toHaveLength(10);
  });

  it('rejects an empty question', () => {
    const result = buildPoll({ question: '   ', answers: ['Gaming', 'Film'] });

    expect(result).toEqual({ ok: false, error: 'The question cannot be empty.' });
  });

  it('rejects a question over the Discord limit', () => {
    const result = buildPoll({ question: 'a'.repeat(MAX_QUESTION_LENGTH + 1), answers: ['A', 'B'] });

    expect(result.ok).toBe(false);
  });

  it('rejects fewer than two answers', () => {
    const result = buildPoll({ question, answers: ['Gaming', null] });

    expect(result).toEqual({ ok: false, error: 'A poll needs at least 2 answers.' });
  });

  it('rejects more than ten answers', () => {
    const answers = Array.from({ length: 11 }, (_, index) => `Answer ${index + 1}`);
    const result = buildPoll({ question, answers });

    expect(result).toEqual({ ok: false, error: 'A poll allows at most 10 answers.' });
  });

  it('rejects an answer over the Discord limit', () => {
    const result = buildPoll({ question, answers: ['a'.repeat(MAX_ANSWER_LENGTH + 1), 'Film'] });

    expect(result.ok).toBe(false);
  });

  it('rejects duplicate answers regardless of case', () => {
    const result = buildPoll({ question, answers: ['Gaming', 'gaming'] });

    expect(result).toEqual({
      ok: false,
      error: '"gaming" appears twice. Every answer must be different.',
    });
  });

  it('rejects a duration over the maximum', () => {
    const result = buildPoll({
      question,
      answers: ['Gaming', 'Film'],
      durationHours: MAX_DURATION_HOURS + 1,
    });

    expect(result.ok).toBe(false);
  });

  it('rejects a duration below one hour', () => {
    const result = buildPoll({ question, answers: ['Gaming', 'Film'], durationHours: 0 });

    expect(result.ok).toBe(false);
  });
});
