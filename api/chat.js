const { consume, reject } = require('./_credits');
const { callGemini } = require('./_gemini');
const { canonicalScenePrompt, generateGeminiImage } = require('./_gemini-image');
const { geminiKeyFromRequest } = require('./_byok');
const { wantsByokPlan, sendTextPlan } = require('./_byok-plan');
const { rejectUnlessByokPlan } = require('./_byok-only');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (rejectUnlessByokPlan(req, res)) return;

  const planningByok = wantsByokPlan(req);
  const quota = planningByok
    ? { allowed: true, remaining: 0, byok: true }
    : await consume(req);
  if (!quota.allowed) return reject(res, quota);

  const { gameState = {}, storySoFar = '', playerInput = '', referenceImage = '', referenceRoster = [] } = req.body || {};
  const geminiApiKey = geminiKeyFromRequest(req);
  const language = gameState.language === 'fr' ? 'French' : 'English';
  const presentParty = (gameState.party || []).filter(member => !['separated', 'departed'].includes(member?.presence));
  const units = [gameState.player, ...presentParty].filter(Boolean);
  const characterAppearances = units
    .filter(character => character.portraitPrompt)
    .map(character => `${character.name}: ${character.portraitPrompt}`)
    .join(' | ');
  const partyProfiles = (gameState.party || []).map(member =>
    `${member.name} (${member.class || 'Party member'}, HP ${member.hp ?? 100}, presence: ${member.presence || 'present'}): ${(member.masterPrompt || member.description || '').slice(0, 1200)}${member.autonomyMemory ? `\nPrivate continuity (never expose without discovery): ${String(member.autonomyMemory).slice(-1200)}` : ''}`
  ).join('\n');

  const systemPrompt = `You are the Narrator and Game Master of an RPG.
Theme: ${gameState.theme || 'Unknown'}.
Current location: ${gameState.currentLocation || 'Unknown'}.
Story arc: ${gameState.storyTitle || 'Untitled'}.
Current story situation: ${gameState.currentStorySituation || 'The opening crisis is unfolding'}.
Write every response field in ${language}.
Previous scene image description: ${gameState.previousImagePrompt || 'None'}.
${characterAppearances ? `Keep these appearances consistent in images: ${characterAppearances}.` : ''}
${partyProfiles ? `Party profiles, which are ground truth for their motives and behavior:\n${partyProfiles}` : ''}

The PLAYER is the center of the experience. Resolve the PLAYER's action, describe the world and non-Party NPCs, and advance the immediate situation. Do not write dialogue or inner thoughts for Party members: independent Party agents speak after your narration under a separate Director. Keep the narrative naturally brief: aim for one compact block of two or three concise sentences, visually around three or four chat lines. State the outcome, one vivid detail, and the immediate pressure or opening. Avoid recaps, lore dumps, inventory summaries, and rhetorical padding.

Return only valid JSON with this exact shape:
{
  "narrative": "Concise outcome and immediate situation, without Party dialogue",
  "hp_change": 0,
  "karma_change": 0,
  "inventory_changes": [{"name":"...","qty":1,"desc":"..."}],
  "party_updates": [{"name":"...","class":"...","hp":100,"presence":"present|separated|departed","description":"Physical and emotional description","portraitPrompt":"Detailed English full-body character art prompt","masterPrompt":"Detailed second-person character identity covering personality, voice, history, wants, fears, loyalties, goals, secrets, biases, relationships and behavioral rules","voiceDescription":"English voice description"}],
  "new_locations_unlocked": [{"name":"...","description":"...","children":[],"npcs":[{"name":"...","friendly":true,"voiceDescription":"..."}]}],
  "sceneGraph": {"nodes":[{"id":"..."}],"links":[{"source":"...","target":"..."}]},
  "quest_updates": [{"title":"...","description":"...","status":"..."}],
  "storyTitle": "Keep the existing story title unless the central arc has genuinely changed",
  "currentStorySituation": "Two polished sentences stating the present conflict, immediate stakes, and unresolved choice after this action",
  "sceneImagePrompt": "Detailed cinematic English prompt for the new scene"
}

Always include sceneImagePrompt and currentStorySituation. Treat the adventure as a coherent causal story: consequences carry forward, character needs and wants drive pressure, and each response should sharpen or transform the current problem rather than inventing disconnected spectacle. Honor Party presence and private continuity created by autonomous agent choices. A separated or departed companion is not physically in the scene unless events credibly reunite them; a concealed act or lie remains unknown to the PLAYER until discovered. Keep currentStorySituation restrained, concrete, and readable—not melodramatic marketing copy. New Party members must include hp, description, portraitPrompt, masterPrompt, and voiceDescription. Their portraitPrompt must show the complete character head-to-toe in a readable standing pose.`;

  const recentStory = String(storySoFar).slice(-14000);
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Recent story:\n${recentStory || '(A new story)'}\n\nPLAYER action:\n${String(playerInput).slice(0, 4000)}` }
  ];
  if (planningByok) return sendTextPlan(res, messages, { json: true }, { route: 'chat' });
  try {
    const aiContent = await callGemini(messages, { json: true, apiKey: geminiApiKey });
    if (!aiContent) throw new Error('Game Master returned invalid JSON');

    let sceneImage = null;
    if (aiContent.sceneImagePrompt) {
      try {
        const scenePrompt = referenceImage
          ? canonicalScenePrompt(aiContent.sceneImagePrompt, referenceRoster)
          : aiContent.sceneImagePrompt;
        sceneImage = (await generateGeminiImage(scenePrompt, {
          aspectRatio: '16:9',
          referenceImages: referenceImage
            ? [{ data: referenceImage, mimeType: 'image/jpeg' }]
            : [],
          apiKey: geminiApiKey
        })).dataUrl;
      } catch (imageError) {
        console.error('Gemini scene generation failed:', imageError);
      }
    }

    return res.status(200).json({
      ...aiContent,
      sceneImage,
      actionsRemaining: quota.remaining,
      creditSource: quota.shareGrant ? 'share' : (quota.byok ? 'byok' : 'license'),
      sharedCredits: quota.shareGrant === true,
      byok: quota.byok === true
    });
  } catch (error) {
    console.error('Chat error:', error);
    return res.status(500).json({
      error: error.message,
      narrative: gameState.language === 'fr' ? 'La communication avec le monde vacille.' : 'Communication with the world flickers.',
      hp_change: 0,
      karma_change: 0,
      inventory_changes: [],
      party_updates: [],
      new_locations_unlocked: [],
      quest_updates: []
    });
  }
};
