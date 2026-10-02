// api/talk.js
// POST { imageURL: "...", text: "..." }
// Returns { videoURL: "..." }
const Replicate = require("replicate");
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imageURL, text } = req.body;
  if (!imageURL) return res.status(400).json({ error: 'imageURL required' });

  try {
      const input = {
          fps: 24,
          draft: true,
          image: imageURL,
          no_op: false,
          prompt: text || "Lorem ipsum. Lorem ipsum. Lorem ipsum. Lorem ipsum.",
          duration: 20,
          resolution: "720p",
          save_audio: true,
          aspect_ratio: "16:9",
          prompt_upsampling: false,
          disable_safety_filter: true
      };
    const output = await replicate.run("prunaai/p-video", { input });
    
    // output is typically a URL string or an object with a url() method depending on the client
    const videoURL = typeof output === 'string' ? output : (output.url ? output.url() : output);

    res.status(200).json({ videoURL });
  } catch (err) {
    console.error("Video generation error:", err);
    res.status(500).json({ error: 'Failed to generate video' });
  }
};
