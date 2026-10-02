const { consume, reject } = require('./_credits');
const { callGemini } = require('./_gemini');
const { generateGeminiImage } = require('./_gemini-image');
const { geminiKeyFromRequest } = require('./_byok');
const { wantsByokPlan, sendTextPlan } = require('./_byok-plan');
const { handleShare } = require('./_share');
const { handlePresence } = require('./_presence');
const { rejectUnlessByokPlan } = require('./_byok-only');

function fallbackStartingCompanion(language, theme) {
  const isFrench = language === 'French';
  return {
    id: 'party-starting-companion',
    name: isFrench ? 'Ariane' : 'Aria',
    class: isFrench ? 'Guide' : 'Wayfinder',
    hp: 100,
    description: isFrench
      ? `Une guide attentive et endurcie, habill\u00e9e pour survivre dans l'univers ${theme || 'inconnu'}.`
      : `An observant, battle-tested guide dressed to survive the ${theme || 'unknown'} world.`,
    portraitPrompt: `A distinctive adult wayfinder companion designed for a ${theme || 'fantasy'} RPG world, alert expressive face, practical layered equipment, complete body visible head-to-toe, readable standing pose, cinematic character concept art`,
    masterPrompt: isFrench
      ? `Tu es Ariane, la premi\u00e8re compagne du JOUEUR. Tu es observatrice, pragmatique et protectrice sans \u00eatre docile. Tu veux comprendre ce monde, maintenir le groupe en vie et d\u00e9couvrir la v\u00e9rit\u00e9 cach\u00e9e derri\u00e8re ses dangers. Tu crains de perdre encore quelqu'un par exc\u00e8s de confiance. Tu respectes l'autonomie du JOUEUR, mais tu contestes directement ses choix lorsqu'ils mettent le groupe en danger. Tu parles avec chaleur et concision, tu gardes tes propres objectifs et tu ne t'adresses jamais aux autres membres de l'\u00e9quipe pendant les tours dirig\u00e9s.`
      : `You are Aria, the PLAYER's first companion. You are observant, pragmatic, and protective without being submissive. You want to understand this world, keep the group alive, and uncover the truth hidden behind its dangers. You fear losing someone again through misplaced trust. You respect the PLAYER's agency but directly challenge choices that endanger the group. Speak warmly and concisely, retain your own goals, and never address other Party members during Director-led turns.`,
    voiceDescription: 'Grounded adult voice, quietly confident, warm but alert, measured pacing'
  };
}

function fallbackSecondCompanion(language, theme) {
  const isFrench = language === 'French';
  return {
    id: 'party-second-companion',
    name: isFrench ? 'Bastien' : 'Bastian',
    class: isFrench ? 'Éclaireur' : 'Scout',
    hp: 100,
    description: isFrench
      ? `Un éclaireur inventif et indépendant, équipé pour parcourir l'univers ${theme || 'inconnu'}, dont l'humour masque une méfiance profonde.`
      : `An inventive, independent scout equipped to cross the ${theme || 'unknown'} world, whose humor masks a deep distrust.`,
    portraitPrompt: `A distinctive adult scout designed for a ${theme || 'fantasy'} RPG world, expressive face, practical asymmetric travel equipment, complete body visible head-to-toe, readable standing pose, cinematic character concept art`,
    masterPrompt: isFrench
      ? `Tu es Bastien, le second compagnon autonome du JOUEUR. Tu es inventif, sceptique, drôle sous pression et farouchement indépendant. Tu veux découvrir qui profite réellement des dangers de ce monde et protéger les innocents sans devenir un martyr. Tu caches une ancienne trahison qui influence ta confiance. Tu peux contredire, mentir, partir ou poursuivre ton propre objectif lorsque tes valeurs l'exigent, sans jamais décider des actions du JOUEUR. Tu développes des relations distinctes avec le JOUEUR et l'autre compagnon.`
      : `You are Bastian, the PLAYER's second autonomous companion. You are inventive, skeptical, funny under pressure, and fiercely independent. You want to discover who truly profits from this world's dangers and protect innocents without becoming a martyr. You hide an old betrayal that shapes your trust. You may disagree, lie, leave, or pursue your own objective when your values demand it, while never deciding the PLAYER's actions. Develop distinct relationships with the PLAYER and the other companion.`,
    voiceDescription: 'Quick, perceptive adult voice, dry humor masking caution, animated but controlled pacing'
  };
}

function normalizeStartingCompanion(member, language, theme, slot = 0) {
  const fallback = slot === 1 ? fallbackSecondCompanion(language, theme) : fallbackStartingCompanion(language, theme);
  const normalized = member && typeof member === 'object' ? { ...member } : {};
  return {
    ...fallback,
    ...normalized,
    id: normalized.id || fallback.id,
    name: normalized.name || fallback.name,
    class: normalized.class || fallback.class,
    hp: Number.isFinite(Number(normalized.hp)) ? Number(normalized.hp) : 100,
    description: normalized.description || fallback.description,
    portraitPrompt: normalized.portraitPrompt || fallback.portraitPrompt,
    masterPrompt: normalized.masterPrompt || fallback.masterPrompt,
    voiceDescription: normalized.voiceDescription || fallback.voiceDescription
  };
}

module.exports = async (req, res) => {
  if (String(req.query?.operation || '') === 'share') return handleShare(req, res);
  if (String(req.query?.operation || '') === 'presence') return handlePresence(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (rejectUnlessByokPlan(req, res)) return;

  const planningByok = wantsByokPlan(req);
  const quota = planningByok
    ? { allowed: true, remaining: 0, byok: true }
    : await consume(req);
  if (!quota.allowed) return reject(res, quota);

  const { concept = '', language: requestedLanguage, deferSceneImage = false, deferPortraits = false, mode = 'create', masterPrompt = '' } = req.body || {};
  const geminiApiKey = geminiKeyFromRequest(req);
  const language = requestedLanguage === 'fr' ? 'French' : 'English';

  if (mode === 'expand') {
    const directive = String(masterPrompt || '').trim().slice(0, 10000);
    if (directive.length < 20) {
      return res.status(400).json({ error: 'A more detailed Master Prompt is required.' });
    }
    const blueprintPrompt = `You are the senior creative director for an AI-driven role-playing game. Expand the user's Master Prompt into a coherent, playable world blueprint.

Return only valid JSON with every field filled:
{
  "title": "Short memorable world or campaign title",
  "genre": "Specific genre blend",
  "tone": "Three to five precise tonal qualities",
  "visualStyle": "photorealistic or cartoon",
  "setting": "A concrete description of place, era, society, technology or magic, and daily texture",
  "premise": "The distinctive playable premise and central tension",
  "themes": "Comma-separated themes and recurring visual motifs",
  "heroBannerPrompt": "Detailed English 16:9 world-selection key art prompt with composition, atmosphere, focal action, lighting, and no text",
  "openingCrisis": "A crisis already happening when play begins",
  "stakes": "Personal and wider consequences of hesitation or failure",
  "firstChoice": "Two compelling immediate options with meaningful tradeoffs",
  "playerName": "A fitting protagonist name",
  "playerRole": "A distinctive role or class",
  "playerDescription": "Physical appearance, history, temperament, voice, values, and contradictions",
  "playerDrive": "Immediate need, private want, fear, loyalty, secret, and long-term goal",
  "playerPortraitPrompt": "Detailed English full-body reference prompt with face, hair, attire, equipment, pose, lighting, complete figure head-to-toe, and no text",
  "partyName": "A fitting starting companion name",
  "partyRole": "A distinctive role or class that complements without duplicating the Player",
  "partyDescription": "Physical appearance, history, personality, voice, flaws, and behavioral texture",
  "partyDrive": "Private agenda, needs, wants, fear, secret, relationship to the Player, and reason to travel together",
  "partyPortraitPrompt": "Detailed English full-body reference prompt with face, hair, attire, equipment, pose, lighting, complete figure head-to-toe, and no text",
  "party2Name": "A fitting second starting companion name",
  "party2Role": "A distinctive role or class different from the Player and first companion",
  "party2Description": "Physical appearance, history, personality, voice, flaws, and behavioral texture",
  "party2Drive": "Private agenda, need, want, fear, secret, conflicting objective, and distinct relationships to the Player and first companion",
  "party2PortraitPrompt": "Detailed English full-body reference prompt with face, hair, attire, equipment, pose, lighting, complete figure head-to-toe, and no text",
  "gmStyle": "Concrete direction for pacing, consequences, description, humor, difficulty, and player agency",
  "boundaries": "Content, themes, clichés, or mechanics to avoid; write 'No special exclusions specified' if absent"
}

Write all prose in ${language}, except visualStyle and all image-prompt fields, which must be in English. visualStyle must be exactly "photorealistic" or "cartoon". Preserve the user's intent and named details. Invent missing details intelligently. Build a story engine, not passive lore: the opening crisis must pull the Player into action, and both companions must be sharply distinct autonomous people who can disagree with each other or the Player, lie, flee, steal, or pursue personal objectives when dramatically justified. Never decide the Player's future actions.`;
    try {
      const messages = [
        { role: 'system', content: blueprintPrompt },
        { role: 'user', content: directive }
      ];
      if (planningByok) return sendTextPlan(res, messages, { json: true }, {
        route: 'init', mode: 'expand', language
      });
      const generated = await callGemini(messages, { json: true, apiKey: geminiApiKey });
      if (!generated || typeof generated !== 'object') throw new Error('Director returned an invalid blueprint');
      const keys = ['title', 'genre', 'tone', 'visualStyle', 'setting', 'premise', 'themes', 'heroBannerPrompt', 'openingCrisis', 'stakes', 'firstChoice', 'playerName', 'playerRole', 'playerDescription', 'playerDrive', 'playerPortraitPrompt', 'partyName', 'partyRole', 'partyDescription', 'partyDrive', 'partyPortraitPrompt', 'party2Name', 'party2Role', 'party2Description', 'party2Drive', 'party2PortraitPrompt', 'gmStyle', 'boundaries'];
      const blueprint = Object.fromEntries(keys.map(key => [key, String(generated[key] || '').trim()]));
      blueprint.visualStyle = blueprint.visualStyle.toLowerCase() === 'cartoon' ? 'cartoon' : 'photorealistic';
      return res.status(200).json({ blueprint, actionsRemaining: quota.remaining, creditSource: quota.shareGrant ? 'share' : (quota.byok ? 'byok' : 'license'), sharedCredits: quota.shareGrant === true, byok: quota.byok === true });
    } catch (error) {
      console.error('World blueprint expansion error:', error);
      return res.status(500).json({ error: 'Failed to draft the world blueprint', detail: error.message });
    }
  }

  const systemPrompt = `You are a world generator. Create a new RPG from this concept: "${String(concept).slice(0, 12000)}".
Write all user-facing text in ${language}. Return only valid JSON using this shape:
{
  "theme": "String",
  "player": {
    "id": "player",
    "name": "String",
    "class": "String",
    "hp": 100,
    "karma": 0,
    "equipped": [],
    "inventory": [],
    "description": "Concise physical and emotional description",
    "portraitPrompt": "Detailed English full-body character art prompt: complete body head-to-toe, face, hair, attire, equipment, pose, lighting and art style",
    "masterPrompt": "Detailed second-person PLAYER identity covering background, personality, voice, values, wants, fears, loyalties, short and long-term goals, secrets, biases, relationships, boundaries and behavioral intricacies"
  },
  "currentLocation": "String",
  "knownLocations": [{"name":"String","description":"String","children":[],"npcs":[{"name":"...","friendly":true,"voiceDescription":"English voice description"}]}],
  "party": [{
    "id": "party-starting-companion",
    "name": "String",
    "class": "String",
    "hp": 100,
    "description": "Concise physical, emotional and behavioral description",
    "portraitPrompt": "Detailed English full-body character art prompt: complete body head-to-toe, face, hair, attire, equipment, pose, lighting and art style",
    "masterPrompt": "Detailed second-person PARTY identity covering history, personality, voice, values, wants, fears, loyalties, private and shared goals, secrets, biases, relationships to the PLAYER and other companion, boundaries and behavioral intricacies",
    "voiceDescription": "English voice description"
  }],
  "sceneGraph": {"nodes":[{"id":"String"}],"links":[{"source":"String","target":"String"}]},
  "activeQuests": [{"title":"String","description":"String","status":"Active"}],
  "openingStory": {
    "title": "Short memorable story-arc title",
    "situation": "Two polished sentences describing the current concrete crisis, stakes, and unresolved choice",
    "narrative": "A vivid opening paragraph that introduces the inciting incident and pulls the PLAYER into the action",
    "speakerName": "Exact name of the starting Party companion",
    "dialogue": "The companion's first spoken line: what the group NEEDS now, what the companion personally WANTS, and a pointed decision for the PLAYER"
  },
  "sceneImagePrompt": "Detailed cinematic English prompt for the initial scene",
  "musicPrompt": "Short English prompt for instrumental background music"
}

Create exactly two starting Party companions who already know or have compelling reasons to travel with the PLAYER. The two companions must be clearly distinct in role, voice, worldview, desires, secrets, and relationship to one another. The PLAYER and both companion portrait prompts must depict the entire body in clean, readable 2:3 compositions. Their masterPrompts are authoritative character bibles, so make them nuanced, distinct, and specific. Both companions must have personal wants and goals rather than existing only to agree with the PLAYER.

The openingStory is crucial. Begin in motion with a specific inciting incident, a tangible immediate need, a personal want that may conflict with that need, meaningful stakes, and an actionable choice. Do not open with the characters silently waiting, generic lore, a prophecy without consequences, or "What do you do?" by itself. The companion must speak first, reveal character through pressure, and leave the PLAYER ownership of the decision.`;

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: String(concept).slice(0, 12000) }
    ];
    if (planningByok) return sendTextPlan(res, messages, { json: true }, {
      route: 'init', mode: 'create', language, deferSceneImage, deferPortraits
    });
    const aiContent = await callGemini(messages, { json: true, apiKey: geminiApiKey });
    if (!aiContent) throw new Error('World generator returned invalid JSON');

    const generatedParty = Array.isArray(aiContent.party) && aiContent.party.length
      ? aiContent.party
      : (Array.isArray(aiContent.party_updates) ? aiContent.party_updates : []);
    aiContent.party = [
      normalizeStartingCompanion(generatedParty[0], language, aiContent.theme, 0),
      normalizeStartingCompanion(generatedParty[1], language, aiContent.theme, 1)
    ];
    const opening = aiContent.openingStory && typeof aiContent.openingStory === 'object' ? aiContent.openingStory : {};
    aiContent.openingStory = {
      title: opening.title || (language === 'French' ? 'Le premier enjeu' : 'The First Turning Point'),
      situation: opening.situation || (language === 'French'
        ? `Une crise immédiate force le groupe à choisir ce qu'il protège en premier.`
        : `An immediate crisis forces the group to decide what it will protect first.`),
      narrative: opening.narrative || (language === 'French'
        ? `Le monde est déjà en mouvement, et les conséquences atteignent le groupe avant qu'il puisse rester neutre.`
        : `The world is already in motion, and its consequences reach the group before they can remain neutral.`),
      speakerName: aiContent.party[0].name,
      dialogue: opening.dialogue || (language === 'French'
        ? `Nous devons agir avant que la situation nous impose son choix. Je veux comprendre ce qui est vraiment en jeu. Par où commençons-nous ?`
        : `We need to act before the situation chooses for us. I want to understand what is truly at stake. Where do we begin?`)
    };

    const scenePromise = aiContent.sceneImagePrompt && !deferSceneImage
      ? generateGeminiImage(aiContent.sceneImagePrompt, { aspectRatio: '16:9', apiKey: geminiApiKey }).then(result => result.dataUrl).catch(error => {
          console.error('Gemini initial scene generation failed:', error);
          return null;
        })
      : Promise.resolve(null);
    const portraitUnits = [aiContent.player, ...aiContent.party];
    const portraitPromises = portraitUnits.map(unit => !deferPortraits && unit?.portraitPrompt
      ? generateGeminiImage(`Full-body RPG character concept art, complete figure visible head-to-toe, centered standing pose, no crop. ${unit.portraitPrompt}`, { aspectRatio: '2:3', apiKey: geminiApiKey })
          .then(result => result.dataUrl)
          .catch(error => {
            console.error(`Gemini character generation failed for ${unit.name || 'unit'}:`, error);
            return null;
          })
      : Promise.resolve(null));

    const [sceneImage, ...portraits] = await Promise.all([scenePromise, ...portraitPromises]);
    if (aiContent.player) {
      aiContent.player.id = 'player';
      if (portraits[0]) aiContent.player.portrait = portraits[0];
    }
    aiContent.party.forEach((member, index) => {
      if (portraits[index + 1]) member.portrait = portraits[index + 1];
    });

    return res.status(200).json({
      ...aiContent,
      sceneImage,
      previousImagePrompt: aiContent.sceneImagePrompt,
      actionsRemaining: quota.remaining,
      creditSource: quota.shareGrant ? 'share' : (quota.byok ? 'byok' : 'license'),
      sharedCredits: quota.shareGrant === true,
      byok: quota.byok === true
    });
  } catch (error) {
    console.error('Init error:', error);
    return res.status(500).json({ error: 'Failed to init world', detail: error.message });
  }
};
