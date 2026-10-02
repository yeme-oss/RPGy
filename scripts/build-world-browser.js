// scripts/build-world-browser.js
// Pre-renders the world browser grid into worlds_finale.html.
// Run once, and again whenever worlds.json changes or new images are added.
// Usage: node scripts/build-world-browser.js

const fs = require("fs");
const path = require("path");

const worlds = JSON.parse(fs.readFileSync(path.join(__dirname, "../worlds.json"), "utf8"));
const PresetRosters = require("../js/presetRosters");

function dangerColor(d) {
  return d >= 8 ? "text-red-400" : d >= 5 ? "text-yellow-400" : "text-green-400";
}

function dangerBarColor(d) {
  return d >= 8 ? "bg-red-500" : d >= 5 ? "bg-yellow-500" : "bg-green-500";
}

function dangerBar(level) {
  const filled = Math.round(level / 2);
  const color = dangerBarColor(level);
  return Array.from({ length: 5 }, (_, i) =>
    `<div class="h-1 flex-1 rounded-sm ${i < filled ? color : "bg-gray-700"}"></div>`
  ).join("");
}

function worldCard(world) {
  const { id, en, fr, genre, dangerosity, aesthetics, tags } = world;
  const mood = aesthetics?.mood ?? "";
  const topTags = (tags || []).slice(0, 3);
  const dColor = dangerColor(dangerosity);
  const visualStyle = PresetRosters.styleFor(id);
  const styleTag = visualStyle === "cartoon"
    ? '<span class="text-xs bg-blue-900 text-blue-200 px-1 rounded">CARTOON</span>'
    : '<span class="text-xs bg-red-900 text-red-200 px-1 rounded">PHOTOREALISTIC</span>';

  const attr = (s) => s.replace(/"/g, "&quot;");

  return `<div class="overlay-box p-3 rounded hover:border-blue-500 cursor-pointer flex flex-col gap-1"
  data-concept="${attr(en.title)}" data-world-id="${id}"
  data-title-en="${attr(en.title)}" data-title-fr="${attr(fr.title)}"
  data-desc-en="${attr(en.desc)}" data-desc-fr="${attr(fr.desc)}">
  <div class="h-32 mb-1 rounded overflow-hidden bg-gray-800 flex items-center justify-center relative">
    <img src="/world/${id}.png" alt="${attr(en.title)}" class="w-full h-full object-cover" onerror="this.parentElement.innerHTML='<span class=&quot;text-xs text-gray-500&quot;>${id}</span>'">
    ${genre ? `<span class="absolute top-1 left-1 text-xs bg-black bg-opacity-70 text-blue-300 px-1 rounded">${genre}</span>` : ""}
  </div>
  <h3 class="font-bold text-sm leading-tight"></h3>
  <p class="text-xs text-gray-400 leading-tight"></p>
  <div>
    <div class="flex justify-between text-xs text-gray-500">
      <span>${mood}</span>
      <span class="${dColor}">⚠ ${dangerosity}/10</span>
    </div>
    <div class="flex gap-0.5 mt-1">${dangerBar(dangerosity)}</div>
  </div>
  <div class="flex flex-wrap gap-1 mt-1">${styleTag}${topTags.map(t => `<span class="text-xs bg-gray-800 text-gray-400 px-1 rounded">${t}</span>`).join("")}</div>
</div>`;
}

function customCard() {
  const bar = Array.from({ length: 5 }, () => `<div class="h-1 flex-1 rounded-sm bg-blue-700"></div>`).join("");
  const tags = ["custom", "any genre", "your rules"].map(t => `<span class="text-xs bg-gray-800 text-gray-400 px-1 rounded">${t}</span>`).join("");
  return `<div class="overlay-box p-3 rounded hover:border-blue-500 cursor-pointer flex flex-col gap-1 border-2 border-dashed border-blue-700"
  data-custom="true"
  data-title-en="CUSTOM" data-title-fr="PERSONNALISÉ">
  <div class="h-32 mb-1 rounded bg-gray-900 flex items-center justify-center">
    <span class="text-4xl text-blue-500">✦</span>
  </div>
  <h3 class="font-bold text-sm text-blue-400"></h3>
  <div>
    <div class="flex justify-between text-xs text-gray-500">
      <span>limitless</span>
      <span class="text-blue-400">∞</span>
    </div>
    <div class="flex gap-0.5 mt-1">${bar}</div>
  </div>
  <div class="flex flex-wrap gap-1 mt-1">${tags}</div>
</div>`;
}

const cards = worlds.map(worldCard).join("\n");
const html = `${cards}\n${customCard()}`;

const out = path.join(__dirname, "../worlds_finale.html");
fs.writeFileSync(out, html, "utf8");
console.log(`worlds_finale.html written — ${worlds.length + 1} cards (${Buffer.byteLength(html, "utf8")} bytes)`);
