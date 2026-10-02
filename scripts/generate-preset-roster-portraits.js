// Generates the canonical full-body Player + Party portraits for a range of preset worlds.
// Usage: node scripts/generate-preset-roster-portraits.js 1 5
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const PresetRosters = require('../js/presetRosters');

const start = Number(process.argv[2] || 1);
const end = Number(process.argv[3] || start);
const wrapper = process.env.IMAGE_WRAPPER; // path to your image-generation script (PowerShell wrapper)
const assetRoot = path.join(__dirname, '..', 'assets', 'preset-rosters');

if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > 49 || end < start) {
    throw new Error('Use an inclusive preset-world range between 1 and 49.');
}
if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set.');

for (let id = start; id <= end; id++) {
    // Zombie London owns its curated portraits in assets/zombie-london.
    if (id === 4) {
        console.log(`[${id}/49] Zombie London: retained its authored Player and Party references.`);
        continue;
    }
    const roster = PresetRosters.createRoster(id);
    const units = [roster.player, ...roster.party];
    for (const unit of units) {
        const relativePath = unit.portrait.replace(/^\//, '');
        const outputPath = path.join(__dirname, '..', relativePath);
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 50_000) continue;
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        execFileSync('powershell.exe', [
            '-ExecutionPolicy', 'Bypass', '-File', wrapper,
            '-Prompt', unit.portraitPrompt,
            '-OutputPath', outputPath,
            '-AspectRatio', '2:3'
        ], { stdio: 'inherit', env: process.env });
    }
    console.log(`[${id}/49] ${roster.worldPreset}: Player + 2 Party reference portraits complete.`);
}
