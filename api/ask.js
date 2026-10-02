// api/ask.js
const { ElevenLabsClient } = require("@elevenlabs/elevenlabs-js");
const Replicate = require("replicate");
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
const { callGemini } = require('./_gemini');
const { geminiKeyFromRequest } = require('./_byok');
const { wantsByokPlan, sendTextPlan } = require('./_byok-plan');
const { rejectUnlessByokPlan } = require('./_byok-only');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (rejectUnlessByokPlan(req, res)) return;

  const { name, question, voiceId, imageURL, masterPrompt } = req.body;
  console.log("DEBUG API/ASK: Received payload", { name, question, hasVoiceId: !!voiceId, hasImageURL: !!imageURL });
  
  const answerMessages = [
    { role: 'system', content: `${masterPrompt || `You are ${name}.`} Answer the PLAYER directly, briefly, and fully in character. Never impersonate another Party member.` },
    { role: 'user', content: question }
  ];
  if (wantsByokPlan(req)) return sendTextPlan(res, answerMessages, { maxOutputTokens: 800 }, { route: 'ask' });

  if (!process.env.GEMINI_API_KEY || !process.env.ELEVENLABS_API_KEY) {
      console.error("DEBUG API/ASK: Missing API keys");
      return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!voiceId || !imageURL) {
      console.error("DEBUG API/ASK: Invalid input", { voiceId, imageURL });
      return res.status(400).json({ error: 'voiceId and imageURL are required' });
  }

  try {
    // 1. Get Answer from Gemini
    const answer = await callGemini(answerMessages, { maxOutputTokens: 800, apiKey: geminiKeyFromRequest(req) });

    // 2. Synthesize Audio
    const stream = await client.textToSpeech.convert(voiceId, { text: answer, modelId: "eleven_v3" });
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const audioBuffer = Buffer.concat(chunks);
    const audioBase64 = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;

    // 3. Generate Lip-Synced Video using audio
    const videoOutput = await replicate.run("prunaai/p-video", { 
        input: {
            image: imageURL,
            audio: audioBase64,
            prompt: "The character is speaking.",
            draft: true,
            resolution: "720p",
            fps: 24
        }
    });

    res.status(200).json({ 
        answer, 
        videoURL: typeof videoOutput === 'string' ? videoOutput : (videoOutput.url ? videoOutput.url() : videoOutput),
        audio: audioBase64 
    });
  } catch (err) {
    console.error("Ask NPC error:", err);
    res.status(500).json({ error: 'Failed: ' + err.message });
  }
};
