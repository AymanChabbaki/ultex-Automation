const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT =
  'You moderate comments on a public Facebook Page. Read the comment and ' +
  'decide whether it should be removed for being hate speech, harassment, ' +
  'spam, scams, or otherwise toxic. Respond with exactly one word: DELETE ' +
  'or KEEP. Do not explain your reasoning.';

/**
 * Returns true if the comment should be deleted.
 * Fails closed (KEEP) on any ambiguous or unparseable model output,
 * since the action here is destructive and irreversible.
 */
async function shouldDelete(text) {
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: 0,
    max_tokens: 5,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
  });

  const verdict = response.choices[0]?.message?.content?.trim().toUpperCase();
  return verdict === 'DELETE';
}

module.exports = { shouldDelete };
