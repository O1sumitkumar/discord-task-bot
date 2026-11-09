import type { PollData } from 'discord.js';

// Limits published by Discord for the poll object. The API rejects anything
// outside these, so we check here and give a readable reason instead.
export const MAX_QUESTION_LENGTH = 300;
export const MAX_ANSWER_LENGTH = 55;
export const MAX_ANSWERS = 10;
export const MIN_ANSWERS = 2;
export const MAX_DURATION_HOURS = 768; // 32 days
export const DEFAULT_DURATION_HOURS = 168; // 7 days

export interface BuildPollInput {
  question: string;
  answers: readonly (string | null)[];
  allowMultiselect?: boolean;
  durationHours?: number;
}

export type BuildPollResult = { ok: true; poll: PollData } | { ok: false; error: string };

/**
 * Turn raw slash-command input into a PollData object, or explain why it can't.
 *
 * Answers arrive as separate command options rather than one delimited string,
 * so nothing here splits text apart. That is deliberate: an answer containing a
 * comma, a dash or an apostrophe is just text, and cannot break the poll.
 */
export function buildPoll(input: BuildPollInput): BuildPollResult {
  const question = input.question.trim();
  if (!question) {
    return { ok: false, error: 'The question cannot be empty.' };
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return {
      ok: false,
      error: `The question is ${question.length} characters. Discord allows ${MAX_QUESTION_LENGTH}.`,
    };
  }

  const answers = input.answers
    .map((answer) => answer?.trim() ?? '')
    .filter((answer) => answer.length > 0);

  if (answers.length < MIN_ANSWERS) {
    return { ok: false, error: `A poll needs at least ${MIN_ANSWERS} answers.` };
  }
  if (answers.length > MAX_ANSWERS) {
    return { ok: false, error: `A poll allows at most ${MAX_ANSWERS} answers.` };
  }

  const tooLong = answers.find((answer) => answer.length > MAX_ANSWER_LENGTH);
  if (tooLong) {
    return {
      ok: false,
      error: `"${tooLong}" is ${tooLong.length} characters. Discord allows ${MAX_ANSWER_LENGTH} per answer.`,
    };
  }

  const duplicate = findDuplicate(answers);
  if (duplicate) {
    return { ok: false, error: `"${duplicate}" appears twice. Every answer must be different.` };
  }

  const durationHours = input.durationHours ?? DEFAULT_DURATION_HOURS;
  if (!Number.isInteger(durationHours) || durationHours < 1) {
    return { ok: false, error: 'The duration must be a whole number of hours, at least 1.' };
  }
  if (durationHours > MAX_DURATION_HOURS) {
    return {
      ok: false,
      error: `The duration must be ${MAX_DURATION_HOURS} hours (32 days) or fewer.`,
    };
  }

  return {
    ok: true,
    poll: {
      question: { text: question },
      answers: answers.map((text) => ({ text })),
      duration: durationHours,
      allowMultiselect: input.allowMultiselect ?? true,
    },
  };
}

function findDuplicate(answers: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const answer of answers) {
    const key = answer.toLowerCase();
    if (seen.has(key)) {
      return answer;
    }
    seen.add(key);
  }
  return null;
}
