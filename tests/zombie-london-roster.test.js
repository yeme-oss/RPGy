const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ZombieLondon = require('../js/zombieLondon');

test('Zombie London ships a complete player and two-agent party', () => {
    assert.equal(ZombieLondon.WORLD_ID, 'zombie-london');
    assert.equal(ZombieLondon.isZombieLondon('Zombie London'), true);
    assert.match(ZombieLondon.OPENING_SCENE_PROMPT, /Rowan Mercer/);
    assert.match(ZombieLondon.OPENING_SCENE_PROMPT, /Dr Evelyn Shaw/);
    assert.match(ZombieLondon.OPENING_SCENE_PROMPT, /Malik Okafor/);
    assert.match(ZombieLondon.OPENING_SCENE_PROMPT, /red-haired white woman/);
    assert.ok(ZombieLondon.BRIEFING.length > 70);
    assert.match(ZombieLondon.OPENING_STORY.dialogue, /\bneed\b/i);
    assert.match(ZombieLondon.OPENING_STORY.dialogue, /\bwant\b/i);

    const roster = ZombieLondon.createRoster();
    assert.equal(roster.player.id, 'player');
    assert.equal(roster.player.name, 'Rowan Mercer');
    assert.equal(roster.party.length, 2);
    assert.deepEqual(roster.party.map(member => member.name), ['Dr Evelyn Shaw', 'Malik Okafor']);

    for (const unit of [roster.player, ...roster.party]) {
        assert.ok(unit.hp > 0);
        assert.ok(unit.maxHp >= unit.hp);
        assert.ok(unit.description.length > 80);
        assert.ok(unit.masterPrompt.length > 300);
        assert.match(unit.portrait, /^\/assets\/zombie-london\/.+\.jpg$/);
        const portraitPath = path.join(__dirname, '..', unit.portrait.replace(/^\//, ''));
        assert.equal(fs.existsSync(portraitPath), true, `${unit.name} portrait is missing`);
        assert.ok(fs.statSync(portraitPath).size > 50_000, `${unit.name} portrait is unexpectedly small`);
    }
});

test('createRoster returns a fresh editable copy', () => {
    const first = ZombieLondon.createRoster();
    first.player.name = 'Changed locally';
    first.party[0].hp = 1;

    const second = ZombieLondon.createRoster();
    assert.equal(second.player.name, 'Rowan Mercer');
    assert.equal(second.party[0].hp, 86);
});
