const log = require('./log');
// Turns raw quiz answers into a skin profile.
// - With GEMINI_API_KEY set: Google Gemini reads the answers and returns a
//   dynamic, reasoned classification (skin type, dosha, ingredients, rationale).
// - Without a key (or if the AI call fails): a deterministic rule-based
//   classifier is used so the app always works.

const SKIN_TYPES = ['oily', 'normal', 'dry', 'combination'];
const DOSHAS = ['vata', 'pitta', 'kapha'];

const DOSHA_GUIDE = {
  vata: { lookFor: ['Hydrating oils', 'Almond', 'Shatavari', 'Hyaluronic acid'], avoid: ['Harsh foaming washes', 'Over-exfoliating'] },
  pitta: { lookFor: ['Aloe', 'Sandalwood', 'Rose', 'Liquorice'], avoid: ['Hot water', 'Strong acids', 'Heavy fragrance'] },
  kapha: { lookFor: ['Neem', 'Turmeric', 'Clay', 'Niacinamide'], avoid: ['Heavy occlusive creams', 'Skipping exfoliation'] },
};

// ---- Rule-based fallback (mirrors the prototype's logic) ----
function ruleBasedClassify(answers) {
  const skinVotes = {}, doshaVotes = {};
  let concern = null;
  answers.forEach((a, i) => {
    if (a.skin) skinVotes[a.skin] = (skinVotes[a.skin] || 0) + (i === 0 ? 2 : 1);
    if (a.dosha) doshaVotes[a.dosha] = (doshaVotes[a.dosha] || 0) + 1;
    if (a.doshaHint) doshaVotes[a.doshaHint] = (doshaVotes[a.doshaHint] || 0) + 0.5;
    if (a.concern) concern = a.concern;
  });
  const skinType = Object.keys(skinVotes).sort((x, y) => skinVotes[y] - skinVotes[x])[0] || 'normal';
  const dosha = Object.keys(doshaVotes).sort((x, y) => doshaVotes[y] - doshaVotes[x])[0] || 'vata';
  const g = DOSHA_GUIDE[dosha];
  return {
    skinType, dosha, concern,
    lookFor: g.lookFor, avoid: g.avoid,
    rationale: `Based on your answers, your skin reads as ${skinType} with a ${dosha} tendency.`,
    source: 'rules',
  };
}

// ---- Gemini (dynamic) ----
// GEMINI_MODEL can list several models, comma-separated: each is tried in turn (8s each).
// Lite models are plenty for this classification and answer in ~1–3s.
const GEMINI_MODELS = (process.env.GEMINI_MODEL || 'gemini-flash-lite-latest,gemini-3.5-flash-lite')
  .split(',').map((m) => m.trim()).filter(Boolean);
const PER_MODEL_TIMEOUT_MS = 8000;

async function geminiClassify(answers, modelName) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
  });

  const prompt = `You are an Ayurvedic skincare assistant. A user took a quiz.
Classify them from their answers. Consider skin signals AND dosha signals
(Vata = air/dry, Pitta = fire/sensitive, Kapha = earth/oily), plus any cultural/
spice answers as light, fun context only.

Return ONLY a JSON object with exactly these keys:
{
  "skinType": one of ${JSON.stringify(SKIN_TYPES)},
  "dosha": one of ${JSON.stringify(DOSHAS)},
  "concern": a short string or null,
  "lookFor": array of 3-4 Ayurvedic ingredients to use,
  "avoid": array of 2-3 things to go easy on,
  "rationale": 1-2 friendly sentences explaining the result in plain language
}

The user's answers (each item is one question's chosen option):
${JSON.stringify(answers, null, 2)}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const parsed = JSON.parse(text);

  // Validate / clamp so a bad response can never break the app.
  if (!SKIN_TYPES.includes(parsed.skinType)) parsed.skinType = 'normal';
  if (!DOSHAS.includes(parsed.dosha)) parsed.dosha = 'vata';
  if (!Array.isArray(parsed.lookFor) || !parsed.lookFor.length) parsed.lookFor = DOSHA_GUIDE[parsed.dosha].lookFor;
  if (!Array.isArray(parsed.avoid) || !parsed.avoid.length) parsed.avoid = DOSHA_GUIDE[parsed.dosha].avoid;
  parsed.source = 'gemini';
  return parsed;
}

// Answers come from the browser and go into the AI prompt, so keep only known keys with short values.
const ANSWER_KEYS = ['t', 's', 'skin', 'dosha', 'doshaHint', 'concern', 'culture', 'spice'];
function cleanAnswers(answers) {
  if (!Array.isArray(answers)) return [];
  return answers.slice(0, 20).filter((a) => a && typeof a === 'object').map((a) => {
    const out = {};
    for (const k of ANSWER_KEYS) if (typeof a[k] === 'string') out[k] = a[k].slice(0, 120);
    return out;
  });
}

async function classifyQuiz(rawAnswers) {
  const answers = cleanAnswers(rawAnswers);
  const extras = {
    culture: (answers.find((a) => a.culture) || {}).culture || null,
    spice: (answers.find((a) => a.spice) || {}).spice || null,
  };
  return { ...(await classifyCore(answers)), ...extras };
}

async function classifyCore(answers) {
  if (process.env.GEMINI_API_KEY) {
    // Try each model in turn; if all are slow or unavailable (e.g. Google's "high demand" 503s),
    // the rule-based classifier answers so the quiz always works.
    for (const modelName of GEMINI_MODELS) {
      try {
        const result = await Promise.race([
          geminiClassify(answers, modelName),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${PER_MODEL_TIMEOUT_MS / 1000}s`)), PER_MODEL_TIMEOUT_MS).unref()),
        ]);
        return { ...result, model: modelName };
      } catch (e) {
        log.warn('ai: model failed, trying the next', { model: modelName, error: e.message.replace(/^.*?\]: /, '').slice(0, 160) });
      }
    }
    log.warn('ai: all Gemini models failed — using the rule-based classifier');
  }
  return ruleBasedClassify(answers);
}

module.exports = { classifyQuiz };
