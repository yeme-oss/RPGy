// api/dialogue.js
// POST { narrative: "...", npcs: [{name, voiceDescription?}], language?: "en"|"fr" }
// Returns { utterances: [{name, text}, ...] }
// Uses Gemini to extract spoken dialogue per NPC, with inline ElevenLabs v3 audio tags.
const { callGemini } = require('./_gemini');
const { geminiKeyFromRequest } = require('./_byok');
const { wantsByokPlan, sendTextPlan } = require('./_byok-plan');
const { rejectUnlessByokPlan } = require('./_byok-only');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (rejectUnlessByokPlan(req, res)) return;

  const { narrative, npcs = [], language = 'en' } = req.body || {};
  if (!narrative) return res.status(400).json({ error: 'narrative required' });

  if (!npcs.length) return res.status(200).json({ utterances: [] });

  const npcList = npcs
    .map(n => `- ${n.name}${n.voiceDescription ? ` (${n.voiceDescription})` : ''}`)
    .join('\n');

  const systemPrompt = `You are an audio script extractor for an RPG.
Given a narrative paragraph, extract ONLY the spoken dialogue, in order of appearance, attributed to the speaking NPC.

Known NPCs:
${npcList}

Rules:
- Output language: ${language === 'fr' ? 'French' : 'English'} (match the narrative).
- Skip narration, descriptions, and internal thoughts. Only quoted or clearly-spoken lines.
- If an unnamed NPC speaks, attribute to the NPC most consistent with context, or skip if unclear.
- Insert ElevenLabs v3 inline audio tags in square brackets BEFORE relevant phrases to capture delivery, e.g. [gravelly], [whispers], [shouts], [laughs], [sighs], [nervous], [angry], [excited]. Use them when supported by the narrative; do not invent.
- Return ONLY raw JSON. No prose, no markdown.

Schema: { "utterances": [ { "name": "NPC Name", "text": "[gravelly] Get out of my way." } ] }
If nobody speaks, return: { "utterances": [] }`;

  const messagesForGemini = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: narrative }
  ];
  if (wantsByokPlan(req)) return sendTextPlan(res, messagesForGemini, { json: true, maxOutputTokens: 1800 }, { route: 'dialogue' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  try {
    const parsed = await callGemini(messagesForGemini, { json: true, maxOutputTokens: 1800, apiKey: geminiKeyFromRequest(req) });

    const utterances = Array.isArray(parsed?.utterances) ? parsed.utterances : [];
    res.status(200).json({ utterances });
  } catch (err) {
    console.error("Dialogue extraction error:", err);
    res.status(500).json({ error: 'Failed to extract dialogue', detail: err.message });
  }
};
