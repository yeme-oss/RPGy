// api/voice.js
const { ElevenLabsClient } = require("@elevenlabs/elevenlabs-js");
const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

function padDescription(desc) {
  return desc.length >= 20 ? desc : desc + ", distinctive character voice for a fantasy role-playing game.";
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { voiceDescription, voiceName } = req.body || {};
  if (!voiceDescription) return res.status(400).json({ error: 'voiceDescription required' });
  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(501).json({ error: 'elevenlabs_not_configured', message: 'Voices and music are optional: set ELEVENLABS_API_KEY to enable them.' });
  }

  try {
    // 1. Check if voice already exists
    const response = await client.voices.getAll();
    const voices = response.voices || response; 
    if (Array.isArray(voices) && voiceName) {
        const match = voices.find(v => v.name === voiceName);
        if (match) {
            console.log("DEBUG API/VOICE: Reusing existing voice:", voiceName, match.voice_id);
            return res.status(200).json({ voiceId: match.voice_id });
        }
    }

    // 2. Try to create, or fallback to random existing voice if limit is reached
    try {
        const description = padDescription(voiceDescription);
        const designResp = await client.textToVoice.design({
          voiceDescription: description,
          modelId: "eleven_multilingual_ttv_v2",
          autoGenerateText: true
        });

        const generatedVoiceId = designResp?.previews?.[0]?.generatedVoiceId;
        if (!generatedVoiceId) throw new Error('No voice previews returned');

        const created = await client.textToVoice.create({
          voiceName: voiceName || `NPC-${Date.now()}`,
          voiceDescription: description,
          generatedVoiceId
        });
        
        return res.status(200).json({ voiceId: created?.voice_id || created?.voiceId });
    } catch (err) {
        console.warn("Creation failed, picking random voice as fallback:", err.message);
        const randomVoice = Array.isArray(voices) && voices.length > 0 
            ? voices[Math.floor(Math.random() * voices.length)] 
            : null;
            
        if (randomVoice) {
            return res.status(200).json({ voiceId: randomVoice.voice_id });
        } else {
            throw new Error("Could not create voice and no fallback voices available.");
        }
    }
  } catch (err) {
    if ([401, 402, 403].includes(err?.statusCode)) {
      console.warn('ElevenLabs unavailable (%s): %s', err.statusCode, err.message.split('\n')[0]);
      return res.status(501).json({ error: 'elevenlabs_not_configured', message: 'Your ElevenLabs key was refused (check its permissions and credits).' });
    }
    console.error("Voice error:", err);
    res.status(500).json({ error: 'Failed to manage voice', detail: err.message });
  }
};
