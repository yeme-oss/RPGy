// api/music.js
// POST { prompt: "...", musicLengthMs?: number }
// Returns audio/mpeg binary
const { ElevenLabsClient } = require("@elevenlabs/elevenlabs-js");

const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, musicLengthMs } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(501).json({ error: 'elevenlabs_not_configured', message: 'Voices and music are optional: set ELEVENLABS_API_KEY to enable them.' });
  }

  try {
    console.log("DEBUG API/MUSIC: composing music for prompt:", prompt);
    const stream = await client.music.compose({
      prompt,
      musicLengthMs: typeof musicLengthMs === 'number' ? musicLengthMs : 30000
    });

    const buffer = Buffer.from(await new Response(stream).arrayBuffer());

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(buffer);
  } catch (err) {
    if ([401, 402, 403].includes(err?.statusCode)) {
      console.warn('ElevenLabs unavailable (%s): %s', err.statusCode, err.message.split('\n')[0]);
      return res.status(501).json({ error: 'elevenlabs_not_configured', message: 'Your ElevenLabs key was refused (check its permissions and credits).' });
    }
    console.error("Music generation error:", err);
    res.status(500).json({ error: 'Failed to generate music', detail: err.message });
  }
};
