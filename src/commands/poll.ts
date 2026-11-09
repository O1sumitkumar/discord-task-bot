import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { buildPoll, MAX_ANSWERS, DEFAULT_DURATION_HOURS, MAX_DURATION_HOURS } from '../lib/poll';

const ANSWER_OPTION_NAMES = Array.from({ length: MAX_ANSWERS }, (_, index) => `option${index + 1}`);

const builder = new SlashCommandBuilder()
  .setName('poll')
  .setDescription('Post a poll to this channel')
  .addStringOption((opt) =>
    opt.setName('question').setDescription('What are you asking?').setRequired(true)
  );

// option1 and option2 are required — a poll with one answer is not a poll.
// option3 onward are optional, so the same command handles 2 answers or 10.
ANSWER_OPTION_NAMES.forEach((name, index) => {
  builder.addStringOption((opt) =>
    opt
      .setName(name)
      .setDescription(`Answer ${index + 1}`)
      .setRequired(index < 2)
  );
});

builder
  .addBooleanOption((opt) =>
    opt.setName('multiselect').setDescription('Let people pick more than one answer (default: yes)')
  )
  .addIntegerOption((opt) =>
    opt
      .setName('hours')
      .setDescription(`How long the poll stays open (default: ${DEFAULT_DURATION_HOURS})`)
      .setMinValue(1)
      .setMaxValue(MAX_DURATION_HOURS)
  );

export const data = builder;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const result = buildPoll({
    question: interaction.options.getString('question', true),
    answers: ANSWER_OPTION_NAMES.map((name) => interaction.options.getString(name)),
    allowMultiselect: interaction.options.getBoolean('multiselect') ?? undefined,
    durationHours: interaction.options.getInteger('hours') ?? undefined,
  });

  if (!result.ok) {
    await interaction.reply({ content: result.error, ephemeral: true });
    return;
  }

  try {
    await interaction.reply({ poll: result.poll });
  } catch (error) {
    console.error('Failed to post poll', error);
    await interaction.reply({
      content: 'Something went wrong posting that poll. Check the bot can send messages here.',
      ephemeral: true,
    });
  }
}
