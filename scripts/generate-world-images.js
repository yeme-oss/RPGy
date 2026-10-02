// Generates one image per world in worlds.json and saves it to /world/{id}.png.
// Usage: GEMINI_API_KEY=your_key node scripts/generate-world-images.js
// Optional: node scripts/generate-world-images.js --start 10 --end 20

const fs = require('fs');
const path = require('path');
const { GEMINI_IMAGE_MODEL, generateGeminiImage } = require('../api/_gemini-image');

if (!process.env.GEMINI_API_KEY) {
  console.error('ERROR: GEMINI_API_KEY environment variable not set.');
  process.exit(1);
}

const worlds = JSON.parse(fs.readFileSync(path.join(__dirname, '../worlds.json'), 'utf8'));
const outputDir = path.join(__dirname, '../world');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

const args = process.argv.slice(2);
const startIdx = args.includes('--start') ? parseInt(args[args.indexOf('--start') + 1], 10) : 1;
const endIdx = args.includes('--end') ? parseInt(args[args.indexOf('--end') + 1], 10) : worlds.length;

async function generateImage(world) {
  const destPath = path.join(outputDir, `${world.id}.png`);
  if (fs.existsSync(destPath)) {
    console.log(`[${world.id}] Already exists - skipping. (delete to regenerate)`);
    return;
  }

  console.log(`[${world.id}] Generating: ${world.en.title}`);
  try {
    const image = await generateGeminiImage(world.imagePrompt, {
      aspectRatio: '16:9',
      mimeType: 'image/png'
    });
    fs.writeFileSync(destPath, Buffer.from(image.data, 'base64'));
    console.log(`[${world.id}] Saved -> world/${world.id}.png`);
  } catch (error) {
    console.error(`[${world.id}] FAILED: ${error.message}`);
  }
}

async function main() {
  const toGenerate = worlds.filter(world => world.id >= startIdx && world.id <= endIdx);
  console.log(`Generating images for worlds ${startIdx}-${endIdx} (${toGenerate.length} total)`);
  console.log(`Using model: ${GEMINI_IMAGE_MODEL}\n`);

  for (const world of toGenerate) {
    await generateImage(world);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\nDone! All images saved to /world/');
}

main();
