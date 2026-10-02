const { canonicalScenePrompt, generateGeminiImage } = require('./_gemini-image');
const { consume, authorize, reject } = require('./_credits');
const { geminiKeyFromRequest } = require('./_byok');
const { rejectUnlessByokPlan } = require('./_byok-only');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (rejectUnlessByokPlan(req, res)) return;

  const { portraitPrompt, bannerPrompt, scenePrompt, referenceImage, referenceRoster = [], chargeCredit = false } = req.body || {};
  const geminiApiKey = geminiKeyFromRequest(req);
  const quota = await (chargeCredit ? consume(req) : authorize(req));
  if (!quota.allowed) return reject(res, quota);

  if (bannerPrompt) {
    try {
      const prompt = `Cinematic 16:9 RPG world key art for a world-selection hero banner. Strong readable composition, atmospheric depth, one clear focal point, premium game concept art, no text, no title, no logo, no interface. ${String(bannerPrompt).slice(0, 5000)}`;
      const image = await generateGeminiImage(prompt, { aspectRatio: '16:9', apiKey: geminiApiKey });
      return res.status(200).json({ heroBanner: image.dataUrl, model: 'gemini-3.1-flash-lite-image', actionsRemaining: quota.remaining, creditSource: quota.shareGrant ? 'share' : (quota.byok ? 'byok' : 'license'), sharedCredits: quota.shareGrant === true, byok: quota.byok === true });
    } catch (error) {
      console.error('World hero generation error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  if (scenePrompt) {
    if (!referenceImage || typeof referenceImage !== 'string') {
      return res.status(400).json({ error: 'A labeled player and Party reference sheet is required' });
    }
    if (referenceImage.length > 6_000_000) return res.status(413).json({ error: 'Reference sheet is too large' });
    try {
      const image = await generateGeminiImage(canonicalScenePrompt(scenePrompt, referenceRoster), {
        aspectRatio: '16:9',
        referenceImages: [{ data: referenceImage, mimeType: 'image/jpeg' }],
        apiKey: geminiApiKey
      });
      return res.status(200).json({ sceneImage: image.dataUrl, model: 'gemini-3.1-flash-lite-image', actionsRemaining: quota.remaining, creditSource: quota.shareGrant ? 'share' : (quota.byok ? 'byok' : 'license'), sharedCredits: quota.shareGrant === true, byok: quota.byok === true });
    } catch (error) {
      console.error('Reference-aware scene generation error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  if (!portraitPrompt) return res.status(400).json({ error: 'portraitPrompt, bannerPrompt, or scenePrompt required' });

  try {
    const prompt = `Full-body RPG character concept art. Show the complete figure from head to toe, centered in a natural standing pose, with hands, feet, clothing and equipment visible. No crop, no frame, no text. ${String(portraitPrompt).slice(0, 5000)}`;
    const image = await generateGeminiImage(prompt, { aspectRatio: '2:3', apiKey: geminiApiKey });
    return res.status(200).json({ portrait: image.dataUrl, model: 'gemini-3.1-flash-lite-image', actionsRemaining: quota.remaining, creditSource: quota.shareGrant ? 'share' : (quota.byok ? 'byok' : 'license'), sharedCredits: quota.shareGrant === true, byok: quota.byok === true });
  } catch (error) {
    console.error('Portrait generation error:', error);
    return res.status(500).json({ error: error.message });
  }
};
