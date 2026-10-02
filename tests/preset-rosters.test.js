const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PresetRosters = require('../js/presetRosters');

test('all non-Zombie preset worlds ship a complete Player and two-agent Party roster', () => {
    for (let id = 1; id <= 49; id++) {
        if (id === 4) continue; // Zombie London retains its curated authored roster.
        const roster = PresetRosters.createRoster(id);
        assert.ok(roster, `missing roster for world ${id}`);
        assert.ok(['photorealistic', 'cartoon'].includes(roster.visualStyle));
        assert.ok(roster.briefing.length > 70);
        assert.ok(roster.storyTitle.length > 4);
        assert.ok(roster.openingStory.situation.length > 100);
        assert.match(roster.openingStory.dialogue, /\bneed\b/i);
        assert.match(roster.openingStory.dialogue, /\bwant\b/i);
        assert.equal(roster.party.length, 2);
        for (const unit of [roster.player, ...roster.party]) {
            assert.ok(unit.name);
            assert.ok(unit.description.length > 100);
            assert.ok(unit.portraitPrompt.length > 100);
            assert.ok(unit.masterPrompt.length > 500);
            const portraitPath = path.join(__dirname, '..', unit.portrait.replace(/^\//, ''));
            assert.equal(fs.existsSync(portraitPath), true, `${unit.name} portrait missing`);
            assert.ok(fs.statSync(portraitPath).size > 50_000, `${unit.name} portrait unexpectedly small`);
        }
    }
});
