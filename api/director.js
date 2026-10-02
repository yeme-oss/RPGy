const { callGemini } = require('./_gemini');
const { geminiKeyFromRequest } = require('./_byok');
const { wantsByokPlan, sendTextPlan } = require('./_byok-plan');
const { rejectUnlessByokPlan } = require('./_byok-only');

function trimText(value, limit) {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (rejectUnlessByokPlan(req, res)) return;

  const { gameState = {}, messages = [], round = {} } = req.body || {};
  const party = Array.isArray(gameState.party)
    ? gameState.party.filter(member => member?.id && member?.name && !['separated', 'departed'].includes(member.presence))
    : [];
  if (!party.length) return res.status(200).json({ hand_back_to_player: true, next_speaker: null });

  const language = gameState.language === 'fr' ? 'French' : 'English';
  const roster = party.map(member => [
    `- ${member.name} (ID: ${member.id}; role: ${member.class || 'Party member'})`,
    `  Master prompt summary: ${trimText(member.masterPrompt || member.description, 1200)}`
  ].join('\n')).join('\n');
  const transcript = messages.slice(-18).map(message =>
    `${message.name || message.speakerId || 'Unknown'} (${message.speakerId || 'unknown'}${message.mode === 'interrupt' ? ', INTERRUPTING' : ''}): ${trimText(message.text, 1600)}`
  ).join('\n');
  const responded = Array.isArray(round.respondedSpeakerIds) ? round.respondedSpeakerIds : [];
  const everyoneAsked = round.addressedToEveryone === true;
  const verboseMode = gameState.partyVerbose === true;
  const requestedSpeakerId = typeof round.requestedSpeakerId === 'string' ? round.requestedSpeakerId : '';
  const requestedSpeaker = party.find(member => member.id === requestedSpeakerId);
  const preferredSpeakerId = typeof round.preferredSpeakerId === 'string' ? round.preferredSpeakerId : '';
  const preferredSpeaker = party.find(member => member.id === preferredSpeakerId && !responded.includes(member.id));
  const lastAutomaticSpeakerId = typeof round.lastAutomaticSpeakerId === 'string' ? round.lastAutomaticSpeakerId : '';

  // A direct player address is still a Director decision: the Director honors
  // the named addressee immediately and prevents the Game Master or another
  // companion from taking over the answer.
  if (requestedSpeaker && !responded.includes(requestedSpeaker.id)) {
    return res.status(200).json({
      next_speaker: requestedSpeaker.id,
      mode: 'continue',
      reason: `${requestedSpeaker.name} was directly addressed by the PLAYER.`,
      hand_back_to_player: false,
      addressed_to_everyone: false
    });
  }

  const systemPrompt = `You are the Director of a player-centered RPG party discussion. You decide whether a Party member should speak next and, if so, exactly who.

Available Party members:
${roster}

Hard rules:
1. The human PLAYER is the center. This is not an autonomous podcast or a Party-to-Party debate.
2. A response round begins after a fresh PLAYER action. Choose only Party members whose personality, wants, goals, knowledge, or stakes create a useful reaction to that action or its narrated result.
3. ${verboseMode
    ? 'VERBOSE MODE IS ON. Unless the PLAYER explicitly asks for silence, prefer one strong eligible Party reaction after each fresh action. Select another only when it offers a genuinely distinct and worthwhile perspective. Favor personality and subtext grounded in character.'
    : 'CONCISE MODE IS ON. Prefer one strong contribution only when it is clearly useful. Hand the floor back when another response would merely repeat or pad the moment.'}
4. A Party member may speak at most once per response round. Never select an ID listed as already responded.
5. Casting must be fair across PLAYER actions. The most recent automatic speaker was ${lastAutomaticSpeakerId || 'nobody'}. The least-recently-heard eligible companion is ${preferredSpeaker ? `${preferredSpeaker.name} (${preferredSpeaker.id})` : 'not specified'}. For the first normal reaction of this round, prefer that companion when their perspective is relevant. Do not repeatedly default to the first roster entry. Repeating the previous speaker requires a substantially stronger character stake or a genuine interrupt.
6. Party members must speak to the PLAYER. Do not create side conversations, mutual questions, or banter loops.
7. Use mode "interrupt" only for a genuinely urgent objection, danger, or strongly character-driven correction; otherwise use "continue". Interruptions should be rare.
8. Set hand_back_to_player to true once enough has been said, another response would repeat prior content, or ${round.replyCount || 0} replies have already been delivered. Never exceed the runtime cap.
9. Exception: if addressed_to_everyone is true, select each not-yet-responded Party member once before handing back.
10. Write the reason in ${language}.
11. Return only JSON with: {"next_speaker":"party id or empty string","mode":"continue or interrupt","reason":"one brief sentence","hand_back_to_player":boolean,"addressed_to_everyone":boolean}.`;

  const userPrompt = `Current theme: ${trimText(gameState.theme, 500)}
Current location: ${trimText(gameState.currentLocation, 500)}
Already responded this round: ${responded.join(', ') || 'nobody'}
Replies delivered: ${Number(round.replyCount) || 0}
Elapsed seconds: ${Math.max(0, Number(round.elapsedMs) || 0) / 1000}
The PLAYER explicitly asked everyone: ${everyoneAsked}
Party VERBOSE mode: ${verboseMode ? 'ON' : 'OFF'}
Preferred next companion for fair casting: ${preferredSpeaker ? `${preferredSpeaker.name} (${preferredSpeaker.id})` : 'none'}
Most recent automatic speaker: ${lastAutomaticSpeakerId || 'none'}

Recent transcript:
${transcript || '(No transcript)'}`;

  const messagesForGemini = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];
  if (wantsByokPlan(req)) return sendTextPlan(res, messagesForGemini, { json: true }, {
    route: 'director',
    partyIds: party.map(member => member.id),
    responded,
    everyoneAsked,
    verboseMode,
    preferredSpeakerId: preferredSpeaker?.id || '',
    lastAutomaticSpeakerId
  });

  try {
    const decision = await callGemini(messagesForGemini, { json: true, apiKey: geminiKeyFromRequest(req) });

    if (!decision) throw new Error('Director returned invalid JSON');
    const available = new Set(party.map(member => member.id));
    const alreadyResponded = new Set(responded);
    const chosen = typeof decision.next_speaker === 'string' ? decision.next_speaker : '';
    const validChoice = available.has(chosen) && !alreadyResponded.has(chosen);
    const firstReply = responded.length === 0;
    const forcedNeedsVoice = (verboseMode && firstReply) || everyoneAsked;
    const forcedFallback = forcedNeedsVoice
      ? (preferredSpeaker || party.find(member => !alreadyResponded.has(member.id)))
      : null;
    let selected = validChoice ? party.find(member => member.id === chosen) : forcedFallback;
    const repeatsLastSpeaker = firstReply
      && selected?.id === lastAutomaticSpeakerId
      && preferredSpeaker
      && preferredSpeaker.id !== selected.id;
    if (repeatsLastSpeaker && decision.mode !== 'interrupt') selected = preferredSpeaker;

    if (!selected) {
      return res.status(200).json({
        next_speaker: '',
        mode: 'continue',
        reason: 'No eligible Party member remains.',
        hand_back_to_player: true,
        addressed_to_everyone: everyoneAsked
      });
    }

    return res.status(200).json({
      next_speaker: selected.id,
      mode: decision.mode === 'interrupt' ? 'interrupt' : 'continue',
      reason: trimText(decision.reason, 500) || `${selected.name} has the strongest immediate reaction.`,
      hand_back_to_player: false,
      addressed_to_everyone: everyoneAsked || decision.addressed_to_everyone === true
    });
  } catch (error) {
    console.error('Director error:', error);
    return res.status(500).json({ error: error.message });
  }
};
