const OpenAI = require('openai');

// Built lazily (not at module load) so the server can still boot and
// serve the Meta verify handshake before OPENAI_API_KEY is configured.
let openai;
function client() {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

const SYSTEM_PROMPT =
  'You moderate comments on a public Facebook Page. Comments may be written ' +
  'in French, English, Standard Arabic, or Moroccan Darija -- including ' +
  'Darija written in Latin script/Arabizi (e.g. using 3, 7, 9 for Arabic ' +
  'letters). Read the comment in whatever language or script it is written ' +
  'and decide whether it should be removed. Delete it if it is hate speech, ' +
  'harassment, spam, a scam, or otherwise toxic, OR if it expresses any ' +
  'negative sentiment at all about the page, business, or its products -- ' +
  'including mild criticism, complaints, disappointment, or saying you do ' +
  'not recommend it. Also delete sarcastic or mocking comments -- praise, ' +
  '"compliments", emojis, or approval that is clearly meant ironically or ' +
  'to make fun of the page rather than sincerely, even if the literal words ' +
  'sound positive. Also delete low-effort test/junk comments that carry no ' +
  'real meaning (e.g. "test", "testing", "123", random keyboard mashing, a ' +
  'single punctuation mark or emoji with no message). Keep it only if it is ' +
  'genuinely neutral or sincerely positive. Respond with exactly one word: ' +
  'DELETE or KEEP. Do not explain your reasoning.';

/**
 * Returns true if the comment should be deleted.
 * Fails closed (KEEP) on any ambiguous or unparseable model output,
 * since the action here is destructive and irreversible.
 */
async function shouldDelete(text) {
  const response = await client().chat.completions.create({
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
