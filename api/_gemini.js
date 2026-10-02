const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3.6-flash';
const GEMINI_GENERATE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function parseJsonObject(text) {
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (_) {
      return null;
    }
  }
}

function textFromGemini(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map(part => typeof part?.text === 'string' ? part.text : '').join('').trim();
}

function geminiContents(messages) {
  const content = (Array.isArray(messages) ? messages : [])
    .filter(message => message && message.role !== 'system' && typeof message.content === 'string' && message.content.trim())
    .map(message => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }]
    }));
  // Gemini 3.6 does not accept a non-empty model turn as the final content.
  while (content.at(-1)?.role === 'model') content.pop();
  return content;
}

async function callGemini(messages, options = {}) {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const systemInstruction = (Array.isArray(messages) ? messages : [])
    .filter(message => message?.role === 'system' && typeof message.content === 'string')
    .map(message => message.content.trim())
    .filter(Boolean)
    .join('\n\n');
  const contents = geminiContents(messages);
  if (!contents.length) throw new Error('Gemini requires a user message');

  const response = await fetch(`${GEMINI_GENERATE_URL}/${encodeURIComponent(options.model || GEMINI_TEXT_MODEL)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
      contents,
      generationConfig: {
        ...(options.json ? { responseMimeType: 'application/json' } : {}),
        maxOutputTokens: options.maxOutputTokens || 12000,
        thinkingConfig: { thinkingLevel: options.thinkingLevel || 'low' }
      }
    })
  });

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    data = null;
  }
  if (!response.ok) {
    const detail = data?.error?.message || raw || `HTTP ${response.status}`;
    throw new Error(`Gemini text generation failed: ${detail}`);
  }

  const text = textFromGemini(data);
  if (!text) throw new Error(`Gemini returned an empty response${data?.promptFeedback?.blockReason ? ` (${data.promptFeedback.blockReason})` : ''}`);
  if (!options.json) return text;
  const parsed = parseJsonObject(text);
  if (!parsed) throw new Error('Gemini returned invalid JSON');
  return parsed;
}

module.exports = { GEMINI_TEXT_MODEL, callGemini, parseJsonObject };
