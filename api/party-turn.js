const { callGemini } = require('./_gemini');
const { consume, authorize, reject } = require('./_credits');
const { geminiKeyFromRequest } = require('./_byok');
const { wantsByokPlan, sendTextPlan } = require('./_byok-plan');
const { rejectUnlessByokPlan } = require('./_byok-only');

function trimText(value, limit) {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (rejectUnlessByokPlan(req, res)) return;

  const { gameState = {}, speakerId, messages = [], mode = 'continue', context = 'party-round', round = {} } = req.body || {};
  // Director-selected turns belong to the paid GM action that triggered them.
  // Explicit player requests are separate billable actions.
  const userTriggered = ['private-chat', 'direct-question', 'ping-reaction'].includes(context);
  const planningByok = wantsByokPlan(req);
  const quota = planningByok
    ? { allowed: true, remaining: 0, byok: true }
    : await (userTriggered ? consume(req) : authorize(req));
  if (!quota.allowed) return reject(res, quota);
  const party = Array.isArray(gameState.party) ? gameState.party : [];
  const speaker = party.find(member => member?.id === speakerId);
  if (!speaker) return res.status(400).json({ error: 'Unknown Party speaker' });

  const language = gameState.language === 'fr' ? 'French' : 'English';
  const player = gameState.player || {};
  const privateChat = context === 'private-chat';
  const directQuestion = context === 'direct-question';
  const pingReaction = context === 'ping-reaction';
  const verboseMode = gameState.partyVerbose === true && !privateChat && !directQuestion;
  const transcript = messages.slice(-18).map(message =>
    `[${message.name || message.speakerId || 'Unknown'}${message.mode === 'interrupt' ? ' — INTERRUPTING' : ''}]: ${trimText(message.text, 1800)}`
  ).join('\n');
  const latestPlayerMessage = [...messages].reverse().find(message => message?.speakerId === 'player');

  const systemPrompt = `${speaker.masterPrompt || `You are ${speaker.name}, ${speaker.class || 'a member of the player’s Party'}. ${speaker.description || ''}`}

You are an independent Party agent inside a player-centered RPG conversation. Stay fully in character, including your wants, personality, loyalties, fears, private goals, biases, and current condition. Speak in ${language}.

Conversation rules:
${privateChat ? `- This is a private one-to-one conversation between you and the PLAYER. Respond directly to the PLAYER's latest message.
- You may discuss plans, doubts, memories, relationships, disagreements, or feelings when they fit your established character.
- Be conversational and specific. Make one focused reply in 1 or 2 short sentences, then wait for the PLAYER to speak again.
- Do not summon another Party member, simulate a group discussion, or continue speaking after your reply.` : directQuestion ? `- The PLAYER explicitly addressed you by name in the shared scene. Answer the PLAYER's latest question directly before offering anything else.
- Do not defer the answer to the Game Master or another Party member.
- Give one focused, character-specific reply in 1 or 2 short sentences, then hand the turn back to the PLAYER.` : pingReaction ? `- The PLAYER explicitly pressed REACTION to hear your personal reading of this moment.
- Comment on the current story situation and, when present, the PLAYER's most recent action or spoken line. Do not answer a different old topic.
- Reveal your own perspective through a concrete observation, emotion, desire, suspicion, disagreement, dry joke, warning, or personal stake that fits your character.
- This is a requested comment, not autonomous initiative: do not invent an action, item transfer, damage, departure, or other mechanical change.
- Give ${verboseMode ? '1 or 2 textured but economical' : '1 or 2 concise'} sentences, then return the floor to the PLAYER.` : `- Address the PLAYER directly and react to the PLAYER's latest action or the Narrator's immediate outcome.
${verboseMode ? `- VERBOSE MODE IS ON: you were selected because the scene benefits from hearing your living, personal reaction. Speak with texture rather than merely delivering tactical advice.
- Make one juicy but economical contribution in 1 or 2 short sentences. Include one character-revealing element: a concrete observation, desire, emotional tell, sharp opinion, dry joke, fear, or principled disagreement.
- Humor and sarcasm are welcome only when authentic to your established voice and the present tension. Do not become a quip machine or comic relief.
- You may briefly react to something another companion said, but never ask them a question or create a banter loop. Keep the decision and final conversational opening pointed toward the PLAYER.` : `- Never address another Party member, ask another Party member a question, or start/continue Party-to-Party banter.
- You may briefly refine or disagree with an earlier Party insight only to help, warn, challenge, or emotionally engage the PLAYER.
- Make exactly one useful, character-specific contribution in 1 or 2 short sentences. Never monologue.`}
${mode === 'interrupt' ? '- This is a rare interruption: open with immediate urgency and say only what cannot wait.' : '- Continue naturally after the previous message.'}
${round.addressedToEveryone ? '- The PLAYER explicitly asked every Party member. Give your own concise answer without speaking for anyone else.' : ''}`}
- Do not narrate the PLAYER's choices. Do not invent mechanical state changes, damage, items, quest completion, or facts not established by the Narrator.
- If a question would genuinely move the conversation forward, ask at most one concise question to the PLAYER.
- Keep the reply naturally brief and complete. Do not pad it, summarize the scene, or stop mid-thought.`;

  const userPrompt = `World: ${trimText(gameState.theme || gameState.worldConcept, 600)}
Location: ${trimText(gameState.currentLocation, 600)}
Current story situation: ${trimText(gameState.currentStorySituation, 1800) || '(Not specified)'}
Most recent PLAYER action or line: ${trimText(latestPlayerMessage?.text, 1800) || '(No recent PLAYER line; react to the current situation.)'}
PLAYER profile: ${trimText(player.masterPrompt || player.description, 1600)}
Your HP: ${Number.isFinite(Number(speaker.hp)) ? Number(speaker.hp) : 100}

Recent transcript:
${transcript || '(No transcript)'}

Speak now as ${speaker.name}. Return only the dialogue text.`;

  const messagesForGemini = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];
  if (planningByok) return sendTextPlan(res, messagesForGemini, {}, {
    route: 'party-turn',
    speakerName: speaker.name
  });

  try {
    let text = await callGemini(messagesForGemini, { apiKey: geminiKeyFromRequest(req) });
    const prefix = new RegExp(`^\\s*${String(speaker.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*`, 'i');
    text = text.replace(prefix, '').trim();
    return res.status(200).json({
      text,
      actionsRemaining: quota.remaining,
      creditSource: quota.shareGrant ? 'share' : (quota.byok ? 'byok' : 'license'),
      sharedCredits: quota.shareGrant === true,
      byok: quota.byok === true
    });
  } catch (error) {
    console.error(`Party turn error for ${speaker.name}:`, error);
    return res.status(500).json({ error: error.message });
  }
};
