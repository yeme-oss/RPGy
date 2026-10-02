const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-lite-image';
const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

const WORLD_BLUEPRINT_LABELS = [
  'MASTER PROMPT', 'EDITED WORLD BLUEPRINT', 'WORLD TITLE', 'GENRE', 'TONE',
  'VISUAL STYLE', 'SETTING AND ERA', 'CORE PREMISE', 'THEMES AND MOTIFS',
  'WORLD HERO BANNER PROMPT', 'OPENING CRISIS', 'STAKES',
  'FIRST MEANINGFUL CHOICE', 'PLAYER NAME', 'PLAYER ROLE', 'PLAYER IDENTITY',
  'PLAYER WANTS, FEARS, AND GOALS', 'PLAYER FULL-BODY REFERENCE PROMPT',
  'PARTY MEMBER NAME', 'PARTY MEMBER ROLE', 'PARTY MEMBER IDENTITY',
  'PARTY MEMBER PRIVATE AGENDA', 'PARTY MEMBER FULL-BODY REFERENCE PROMPT',
  'SECOND PARTY MEMBER NAME', 'SECOND PARTY MEMBER ROLE',
  'SECOND PARTY MEMBER IDENTITY', 'SECOND PARTY MEMBER PRIVATE AGENDA',
  'SECOND PARTY MEMBER FULL-BODY REFERENCE PROMPT', 'GAME MASTER STYLE',
  'BOUNDARIES AND EXCLUSIONS'
];

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BLUEPRINT_LABEL_PATTERN = WORLD_BLUEPRINT_LABELS.map(escapeRegex).join('|');

function blueprintField(raw, label) {
  const match = raw.match(new RegExp(
    `${escapeRegex(label)}\\s*:\\s*([\\s\\S]*?)(?=\\s*(?:${BLUEPRINT_LABEL_PATTERN})\\s*:|$)`,
    'i'
  ));
  if (!match) return '';
  return match[1].replace(/\s+/g, ' ').trim().slice(0, 360);
}

function visualSceneDescription(prompt) {
  const raw = String(prompt || '').trim();
  const blueprintLabels = raw.match(new RegExp(`(?:${BLUEPRINT_LABEL_PATTERN})\\s*:`, 'gi')) || [];
  const leakRisk = blueprintLabels.length >= 2
    || /(?:EDITED WORLD BLUEPRINT|MASTER PROMPT:|FULL-BODY REFERENCE PROMPT|BOUNDARIES AND EXCLUSIONS)/i.test(raw);
  if (!leakRisk) return raw.slice(0, 4200);

  const title = blueprintField(raw, 'WORLD TITLE');
  const setting = blueprintField(raw, 'SETTING AND ERA');
  const premise = blueprintField(raw, 'CORE PREMISE');
  const crisis = blueprintField(raw, 'OPENING CRISIS');
  const tone = blueprintField(raw, 'TONE');
  const style = blueprintField(raw, 'VISUAL STYLE');
  const distilled = [
    title ? `Cinematic opening scene for the RPG world "${title}".` : 'Cinematic opening scene for an original RPG world.',
    setting ? `Environment: ${setting}` : '',
    crisis ? `Immediate visible event: ${crisis}` : (premise ? `Visual premise: ${premise}` : ''),
    tone ? `Mood: ${tone}.` : '',
    style ? `Visual treatment: ${style}.` : ''
  ].filter(Boolean).join(' ');
  return distilled.slice(0, 1200);
}

function canonicalScenePrompt(prompt, roster) {
  const names = Array.isArray(roster) ? roster.filter(Boolean).slice(0, 12).join(', ') : '';
  return `${visualSceneDescription(prompt)}

Create a single cinematic 16:9 RPG scene containing every character listed in the attached reference roster exactly once${names ? `: ${names}` : ''}. The attached labeled reference sheet is the sole canonical source for character casting. This roster is also the absolute physical-presence list: do not add, imply, silhouette, or recreate any Party member who is not listed, even if the earlier scene description mentions them. Copy each referenced person faithfully: exact facial identity, gender presentation, apparent age, skin tone, hair, complete wardrobe, footwear, equipment, color palette, body proportions, and silhouette. If any character detail in the scene description conflicts with the reference sheet or roster, ignore that conflicting detail and follow the image; the roster decides who is physically present. Never replace a referenced person with a lookalike or invented actor. Place the exact referenced people naturally together inside one coherent environment appropriate to the scene. ABSOLUTELY NO TYPOGRAPHY: render no letters, words, runes, captions, labels, prompt text, interface text, signs, subtitles, borders, or watermarks anywhere in the image. Do not create a collage, split screen, contact sheet, or duplicate character.`;
}

function findGeneratedImage(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.output_image?.data) return value.output_image;
  if (value.type === 'image' && value.data) return value;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findGeneratedImage(item);
      if (found) return found;
    }
    return null;
  }

  for (const child of Object.values(value)) {
    const found = findGeneratedImage(child);
    if (found) return found;
  }
  return null;
}

async function generateGeminiImage(prompt, options = {}) {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  if (!prompt || typeof prompt !== 'string') throw new Error('An image prompt is required');

  const referenceImages = (Array.isArray(options.referenceImages) ? options.referenceImages : [])
    .slice(0, 4)
    .map(reference => {
      if (typeof reference === 'string') {
        const match = reference.match(/^data:([^;]+);base64,(.+)$/s);
        return match
          ? { type: 'image', mime_type: match[1], data: match[2] }
          : { type: 'image', mime_type: 'image/jpeg', data: reference };
      }
      if (!reference || typeof reference.data !== 'string') return null;
      return {
        type: 'image',
        mime_type: reference.mimeType || reference.mime_type || 'image/jpeg',
        data: reference.data
      };
    })
    .filter(reference => reference && reference.data.length <= 6_000_000);

  const response = await fetch(GEMINI_INTERACTIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      model: GEMINI_IMAGE_MODEL,
      input: [
        { type: 'text', text: prompt.slice(0, 6000) },
        ...referenceImages
      ],
      response_format: {
        type: 'image',
        mime_type: options.mimeType || 'image/jpeg',
        aspect_ratio: options.aspectRatio || '1:1',
        image_size: '1K'
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
    throw new Error(`Gemini image generation failed: ${detail}`);
  }

  const image = findGeneratedImage(data);
  if (!image?.data) throw new Error('Gemini returned no generated image');

  const mimeType = image.mime_type || image.mimeType || options.mimeType || 'image/jpeg';
  return {
    data: image.data,
    mimeType,
    dataUrl: `data:${mimeType};base64,${image.data}`
  };
}

module.exports = { GEMINI_IMAGE_MODEL, visualSceneDescription, canonicalScenePrompt, generateGeminiImage };
