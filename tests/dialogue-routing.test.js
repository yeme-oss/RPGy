const test = require('node:test');
const assert = require('node:assert/strict');

const { findAddressedPartyMember } = require('../js/dialogueRouting');

const party = [
    { id: 'party-evelyn-shaw', name: 'Dr Evelyn Shaw' },
    { id: 'party-malik-okafor', name: 'Malik Okafor' }
];

test('routes named Party questions to the addressed companion', () => {
    assert.equal(findAddressedPartyMember('Evelyn, are you ready to move?', party)?.id, 'party-evelyn-shaw');
    assert.equal(findAddressedPartyMember('What do you think, Malik?', party)?.id, 'party-malik-okafor');
    assert.equal(findAddressedPartyMember('Dr Shaw: tell me what is worrying you.', party)?.id, 'party-evelyn-shaw');
    assert.equal(findAddressedPartyMember("Evelyn, qu'en penses-tu ?", party)?.id, 'party-evelyn-shaw');
});

test('leaves ordinary world actions and group questions with the Game Master', () => {
    assert.equal(findAddressedPartyMember('I inspect the sealed station door.', party), null);
    assert.equal(findAddressedPartyMember('What does everyone think?', party), null);
    assert.equal(findAddressedPartyMember('I follow the route on Malik\'s map.', party), null);
});
