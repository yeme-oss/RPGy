const test = require('node:test');
const assert = require('node:assert/strict');

function responseHarness() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    }
  };
}

test('Gemini image, Director, and Party-agent contracts', async () => {
  process.env.GEMINI_API_KEY = 'test-gemini-key';

  let requestedUrl = '';
  let requestedBody = null;
  global.fetch = async (url, options) => {
    requestedUrl = url;
    requestedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        steps: [{ content: [{ type: 'image', data: 'aGVsbG8=', mime_type: 'image/jpeg' }] }]
      })
    };
  };

  const { visualSceneDescription, canonicalScenePrompt, generateGeminiImage } = require('../api/_gemini-image');
  const presentOnlyPrompt = canonicalScenePrompt(
    'Rowan, Evelyn, and absent Malik stand together in the tunnel.',
    ['Rowan Mercer', 'Dr Evelyn Shaw']
  );
  assert.match(presentOnlyPrompt, /absolute physical-presence list/i);
  assert.match(presentOnlyPrompt, /do not add, imply, silhouette, or recreate any Party member who is not listed/i);
  assert.match(presentOnlyPrompt, /Rowan Mercer, Dr Evelyn Shaw/);
  const leakedBlueprint = `Create an original RPG world.\nMASTER PROMPT:\nA crimson empire.\nEDITED WORLD BLUEPRINT:\nWORLD TITLE: Crimson Signal\nTONE: Operatic and dangerous\nVISUAL STYLE: photorealistic\nSETTING AND ERA: A black throne room aboard a dreadnought.\nCORE PREMISE: A tyrant must choose between control and survival.\nOPENING CRISIS: Crimson lightning tears open the command vault.\nPLAYER FULL-BODY REFERENCE PROMPT: Dark armor covered in red letters.\nBOUNDARIES AND EXCLUSIONS: No visible text.`;
  const distilledScene = visualSceneDescription(leakedBlueprint);
  assert.match(distilledScene, /Cinematic opening scene for the RPG world "Crimson Signal"/);
  assert.match(distilledScene, /Crimson lightning tears open the command vault/);
  assert.doesNotMatch(distilledScene, /PLAYER FULL-BODY REFERENCE PROMPT|BOUNDARIES AND EXCLUSIONS|MASTER PROMPT/);
  assert.match(canonicalScenePrompt(leakedBlueprint, ['Dark Revan']), /ABSOLUTELY NO TYPOGRAPHY/);
  const flattenedBlueprint = leakedBlueprint.replace(/\n/g, ' ');
  const flattenedScene = visualSceneDescription(flattenedBlueprint);
  assert.match(flattenedScene, /Crimson Signal/);
  assert.match(flattenedScene, /black throne room/i);
  assert.doesNotMatch(flattenedScene, /Dark Revan|PLAYER ROLE|FULL-BODY REFERENCE|BOUNDARIES/);
  const image = await generateGeminiImage('A party portrait', { aspectRatio: '2:3' });
  assert.match(requestedUrl, /v1beta\/interactions$/);
  assert.equal(requestedBody.model, 'gemini-3.1-flash-lite-image');
  assert.equal(requestedBody.response_format.aspect_ratio, '2:3');
  assert.equal(requestedBody.response_format.image_size, '1K');
  assert.equal(image.dataUrl, 'data:image/jpeg;base64,aGVsbG8=');

  await generateGeminiImage('A canonical group scene', {
    aspectRatio: '16:9',
    referenceImages: [{ data: 'cmVmZXJlbmNl', mimeType: 'image/jpeg' }]
  });
  assert.equal(requestedBody.input.length, 2);
  assert.deepEqual(requestedBody.input[1], {
    type: 'image',
    mime_type: 'image/jpeg',
    data: 'cmVmZXJlbmNl'
  });

  const sceneImage = require('../api/portrait');
  const sceneRes = responseHarness();
  await sceneImage({
    method: 'POST',
    body: {
      scenePrompt: 'The survivors enter a flooded station.',
      referenceImage: 'cmVmZXJlbmNl',
      referenceRoster: ['Rowan Mercer', 'Dr Evelyn Shaw', 'Malik Okafor']
    }
  }, sceneRes);
  assert.equal(sceneRes.statusCode, 200);
  assert.match(requestedBody.input[0].text, /sole canonical source for character casting/i);
  assert.match(requestedBody.input[0].text, /ignore that conflicting detail and follow the image/i);
  assert.match(requestedBody.input[0].text, /Rowan Mercer, Dr Evelyn Shaw, Malik Okafor/);
  assert.equal(requestedBody.input[1].data, 'cmVmZXJlbmNl');

  const bannerRes = responseHarness();
  await sceneImage({ method: 'POST', body: { bannerPrompt: 'A drowned city beneath a red moon.' } }, bannerRes);
  assert.equal(bannerRes.statusCode, 200);
  assert.match(bannerRes.body.heroBanner, /^data:image\/jpeg;base64,/);
  assert.equal(requestedBody.response_format.aspect_ratio, '16:9');

  // Even if the world model omits the Party array, the initializer must return
  // two fully configured starting companions and portraits for all three units.
  global.fetch = async url => {
    if (String(url).includes('generateContent')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({
            theme: 'Clockwork wilderness',
            player: {
              name: 'Ari',
              class: 'Tinker',
              hp: 100,
              karma: 0,
              description: 'A determined inventor.',
              portraitPrompt: 'Adult clockwork inventor, full body',
              masterPrompt: 'You are Ari, driven to repair the broken sun.'
            },
            currentLocation: 'Brasswood Gate',
            knownLocations: [],
            activeQuests: [],
            sceneImagePrompt: 'A brass forest gate at dawn',
            musicPrompt: 'Clockwork strings'
          }) }] } }]
        })
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        output_image: { data: 'aGVsbG8=', mime_type: 'image/jpeg' }
      })
    };
  };

  const initWorld = require('../api/init');
  const initRes = responseHarness();
  await initWorld({
    method: 'POST',
    headers: {},
    socket: { remoteAddress: 'test' },
    body: { concept: 'Clockwork wilderness', language: 'en' }
  }, initRes);
  assert.equal(initRes.statusCode, 200);
  assert.equal(initRes.body.player.id, 'player');
  assert.match(initRes.body.player.portrait, /^data:image\/jpeg;base64,/);
  assert.equal(initRes.body.party.length, 2);
  assert.equal(initRes.body.party[0].id, 'party-starting-companion');
  assert.equal(initRes.body.party[0].hp, 100);
  assert.ok(initRes.body.party[0].description);
  assert.ok(initRes.body.party[0].masterPrompt);
  assert.match(initRes.body.party[0].portrait, /^data:image\/jpeg;base64,/);
  assert.equal(initRes.body.party[1].id, 'party-second-companion');
  assert.ok(initRes.body.party[1].masterPrompt);
  assert.match(initRes.body.party[1].portrait, /^data:image\/jpeg;base64,/);

  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        title: 'The Salt Meridian',
        genre: 'Occult nautical noir',
        tone: 'Intimate, tense, darkly funny',
        visualStyle: 'photorealistic',
        setting: 'A drowned 1920s Marseille.',
        premise: 'The dead surrender one final thought.',
        themes: 'Memory, mercy, flooded cathedrals',
        heroBannerPrompt: 'Drowned Marseille at night, cinematic 16:9, no text.',
        openingCrisis: 'A corpse names the Player before the harbor rises.',
        stakes: 'The old quarter will drown.',
        firstChoice: 'Save the witnesses or pursue the bell-ringer.',
        playerName: 'Mara Vey',
        playerRole: 'Tide-medium',
        playerDescription: 'A disgraced medium with a salt-burned coat.',
        playerDrive: 'She needs the truth and fears hearing her own last thought.',
        playerPortraitPrompt: 'Mara Vey, complete full body head-to-toe.',
        partyName: 'Luc Renard',
        partyRole: 'Police archivist',
        partyDescription: 'A skeptical archivist with immaculate gloves.',
        partyDrive: 'He hides a supernatural debt to the drowned court.',
        partyPortraitPrompt: 'Luc Renard, complete full body head-to-toe.',
        party2Name: 'Imani Vale',
        party2Role: 'Forbidden cartographer',
        party2Description: 'A sharp-eyed mapmaker with a tide-marked cloak.',
        party2Drive: 'She wants the map beneath the city and distrusts Luc.',
        party2PortraitPrompt: 'Imani Vale, complete full body head-to-toe.',
        gmStyle: 'Cinematic, grounded, consequence-led.',
        boundaries: 'Avoid chosen-one prophecies.'
      }) }] } }]
    })
  });
  const blueprintRes = responseHarness();
  await initWorld({
    method: 'POST',
    headers: {},
    socket: { remoteAddress: 'test' },
    body: { mode: 'expand', masterPrompt: 'Build a rain-soaked occult detective world in 1920s Marseille.', language: 'en' }
  }, blueprintRes);
  assert.equal(blueprintRes.statusCode, 200);
  assert.equal(Object.keys(blueprintRes.body.blueprint).length, 28);
  assert.equal(blueprintRes.body.blueprint.playerName, 'Mara Vey');
  assert.equal(blueprintRes.body.blueprint.visualStyle, 'photorealistic');

  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        next_speaker: 'party-kael-1',
        mode: 'continue',
        reason: 'Kael knows the ruins.',
        hand_back_to_player: false,
        addressed_to_everyone: false
      }) }] } }]
    })
  });

  const director = require('../api/director');
  const directorRes = responseHarness();
  await director({
    method: 'POST',
    body: {
      gameState: {
        language: 'en',
        theme: 'Fantasy',
        currentLocation: 'Ruins',
        party: [{ id: 'party-kael-1', name: 'Kael', class: 'Scout', masterPrompt: 'You are a wary scout.' }]
      },
      messages: [{ speakerId: 'player', name: 'Player', text: 'Should we enter?' }],
      round: { respondedSpeakerIds: [], replyCount: 0, elapsedMs: 0 }
    }
  }, directorRes);
  assert.equal(directorRes.statusCode, 200);
  assert.equal(directorRes.body.next_speaker, 'party-kael-1');

  const fairCastingRes = responseHarness();
  await director({
    method: 'POST',
    body: {
      gameState: {
        language: 'en',
        partyVerbose: true,
        theme: 'Fantasy',
        currentLocation: 'Ruins',
        party: [
          { id: 'party-kael-1', name: 'Kael', class: 'Scout', masterPrompt: 'You are a wary scout.' },
          { id: 'party-mira-2', name: 'Mira', class: 'Scholar', masterPrompt: 'You are an incisive occult scholar.' }
        ]
      },
      messages: [{ speakerId: 'player', name: 'Player', text: 'I touch the sealed altar.' }],
      round: {
        respondedSpeakerIds: [],
        replyCount: 0,
        elapsedMs: 0,
        preferredSpeakerId: 'party-mira-2',
        lastAutomaticSpeakerId: 'party-kael-1'
      }
    }
  }, fairCastingRes);
  assert.equal(fairCastingRes.statusCode, 200);
  assert.equal(fairCastingRes.body.next_speaker, 'party-mira-2');
  assert.equal(fairCastingRes.body.hand_back_to_player, false);

  const repeatedRes = responseHarness();
  await director({
    method: 'POST',
    body: {
      gameState: {
        language: 'en',
        party: [{ id: 'party-kael-1', name: 'Kael', class: 'Scout', masterPrompt: 'You are a wary scout.' }]
      },
      messages: [{ speakerId: 'party-kael-1', name: 'Kael', text: 'I already answered.' }],
      round: { respondedSpeakerIds: ['party-kael-1'], replyCount: 1, elapsedMs: 1000 }
    }
  }, repeatedRes);
  assert.equal(repeatedRes.statusCode, 200);
  assert.equal(repeatedRes.body.next_speaker, '');
  assert.equal(repeatedRes.body.hand_back_to_player, true);

  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        next_speaker: '',
        mode: 'continue',
        reason: 'The scene could remain quiet.',
        hand_back_to_player: true,
        addressed_to_everyone: false
      }) }] } }]
    })
  });
  const verboseDirectorRes = responseHarness();
  await director({
    method: 'POST',
    body: {
      gameState: {
        language: 'en',
        partyVerbose: true,
        currentStorySituation: 'The crypt door is open and something is moving below.',
        party: [{ id: 'party-kael-1', name: 'Kael', class: 'Scout', masterPrompt: 'You are a wary scout.' }]
      },
      messages: [{ speakerId: 'player', name: 'Player', text: 'I push open the crypt door.' }],
      round: { respondedSpeakerIds: [], replyCount: 0, elapsedMs: 0 }
    }
  }, verboseDirectorRes);
  assert.equal(verboseDirectorRes.body.next_speaker, 'party-kael-1');
  assert.equal(verboseDirectorRes.body.hand_back_to_player, false);

  const directlyAddressedRes = responseHarness();
  await director({
    method: 'POST',
    body: {
      gameState: {
        language: 'en',
        party: [{ id: 'party-kael-1', name: 'Kael', class: 'Scout', masterPrompt: 'You are a wary scout.' }]
      },
      messages: [{ speakerId: 'player', name: 'Player', text: 'Kael, should we enter?' }],
      round: { requestedSpeakerId: 'party-kael-1', directQuestion: true, respondedSpeakerIds: [], replyCount: 0 }
    }
  }, directlyAddressedRes);
  assert.equal(directlyAddressedRes.statusCode, 200);
  assert.equal(directlyAddressedRes.body.next_speaker, 'party-kael-1');
  assert.equal(directlyAddressedRes.body.hand_back_to_player, false);

  let partyRequestBody = null;
  global.fetch = async (_url, options) => {
    partyRequestBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Kael: Let me check the threshold first.' }] } }] })
    };
  };

  const partyTurn = require('../api/party-turn');
  const partyRes = responseHarness();
  await partyTurn({
    method: 'POST',
    body: {
      gameState: {
        language: 'en',
        theme: 'Fantasy',
        currentLocation: 'Ruins',
        player: { name: 'Ari', masterPrompt: 'Ari wants the relic.' },
        party: [{ id: 'party-kael-1', name: 'Kael', class: 'Scout', hp: 80, masterPrompt: 'You are a wary scout.' }]
      },
      speakerId: 'party-kael-1',
      messages: [{ speakerId: 'player', name: 'Ari', text: 'Should we enter?' }],
      mode: 'continue',
      round: { addressedToEveryone: false }
    }
  }, partyRes);
  assert.equal(partyRes.statusCode, 200);
  assert.equal(partyRes.body.text, 'Let me check the threshold first.');

  const verbosePartyRes = responseHarness();
  await partyTurn({
    method: 'POST',
    body: {
      gameState: {
        language: 'en',
        partyVerbose: true,
        theme: 'Fantasy',
        currentLocation: 'Ruins',
        player: { name: 'Ari', masterPrompt: 'Ari wants the relic.' },
        party: [{ id: 'party-kael-1', name: 'Kael', class: 'Scout', hp: 80, masterPrompt: 'You are a wary scout.' }]
      },
      speakerId: 'party-kael-1',
      messages: [{ speakerId: 'player', name: 'Ari', text: 'I push open the crypt door.' }],
      mode: 'continue',
      round: { addressedToEveryone: false }
    }
  }, verbosePartyRes);
  assert.equal(verbosePartyRes.statusCode, 200);
  assert.match(partyRequestBody.systemInstruction.parts[0].text, /VERBOSE MODE IS ON/i);
  assert.match(partyRequestBody.systemInstruction.parts[0].text, /Humor and sarcasm are welcome only when authentic/i);

  const privateChatRes = responseHarness();
  await partyTurn({
    method: 'POST',
    body: {
      gameState: {
        language: 'en',
        theme: 'Fantasy',
        currentLocation: 'Ruins',
        player: { name: 'Ari', masterPrompt: 'Ari wants the relic.' },
        party: [{ id: 'party-kael-1', name: 'Kael', class: 'Scout', hp: 80, masterPrompt: 'You are a wary scout.' }]
      },
      speakerId: 'party-kael-1',
      messages: [{ speakerId: 'player', name: 'Ari', text: 'Tell me what is worrying you.' }],
      context: 'private-chat'
    }
  }, privateChatRes);
  assert.equal(privateChatRes.statusCode, 200);
  assert.match(partyRequestBody.systemInstruction.parts[0].text, /private one-to-one conversation/i);
  assert.match(partyRequestBody.systemInstruction.parts[0].text, /wait for the PLAYER to speak again/i);

  const directQuestionRes = responseHarness();
  await partyTurn({
    method: 'POST',
    body: {
      gameState: {
        language: 'en',
        player: { name: 'Ari' },
        party: [{ id: 'party-kael-1', name: 'Kael', class: 'Scout', hp: 80, masterPrompt: 'You are a wary scout.' }]
      },
      speakerId: 'party-kael-1',
      messages: [{ speakerId: 'player', name: 'Ari', text: 'Kael, should we enter?' }],
      context: 'direct-question'
    }
  }, directQuestionRes);
  assert.equal(directQuestionRes.statusCode, 200);
  assert.match(partyRequestBody.systemInstruction.parts[0].text, /explicitly addressed you by name/i);
  assert.match(partyRequestBody.systemInstruction.parts[0].text, /Do not defer the answer to the Game Master/i);

  global.fetch = async (_url, options) => {
    partyRequestBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Kael: That hinge was recently oiled. Someone expects us.' }] } }]
      })
    };
  };
  const pingReactionRes = responseHarness();
  await partyTurn({
    method: 'POST',
    body: {
      gameState: {
        language: 'en',
        theme: 'Fantasy',
        currentLocation: 'Ruins',
        currentStorySituation: 'The crypt door is open.',
        player: { name: 'Ari', masterPrompt: 'Ari wants the relic.' },
        party: [{ id: 'party-kael-1', name: 'Kael', class: 'Scout', masterPrompt: 'You are a wary scout.' }]
      },
      speakerId: 'party-kael-1',
      context: 'ping-reaction',
      messages: [{ speakerId: 'player', name: 'Ari', text: 'I push open the crypt door.' }]
    }
  }, pingReactionRes);
  assert.equal(pingReactionRes.statusCode, 200);
  assert.equal(pingReactionRes.body.text, 'That hinge was recently oiled. Someone expects us.');
  assert.match(partyRequestBody.systemInstruction.parts[0].text, /pressed REACTION/i);
  assert.match(partyRequestBody.systemInstruction.parts[0].text, /not autonomous initiative/i);
  assert.match(partyRequestBody.contents[0].parts[0].text, /I push open the crypt door/i);

  // BYOK planning must expose the exact production prompts without making a
  // server-side Gemini call or consuming a credit.
  global.fetch = async () => { throw new Error('Gemini must not be called while planning BYOK'); };
  const plannedDirectorRes = responseHarness();
  await director({
    method: 'POST',
    headers: { 'x-rpgy-byok-plan': '1' },
    body: {
      gameState: {
        language: 'en',
        theme: 'Fantasy',
        currentLocation: 'Ruins',
        party: [{ id: 'party-kael-1', name: 'Kael', class: 'Scout', masterPrompt: 'You are a wary scout.' }]
      },
      messages: [{ speakerId: 'player', name: 'Ari', text: 'Should we enter?' }],
      round: { respondedSpeakerIds: [], replyCount: 0, elapsedMs: 0 }
    }
  }, plannedDirectorRes);
  assert.equal(plannedDirectorRes.statusCode, 200);
  assert.equal(plannedDirectorRes.body.byokPlan.kind, 'text');
  assert.match(plannedDirectorRes.body.byokPlan.messages[0].content, /player-centered RPG party discussion/i);
  assert.match(plannedDirectorRes.body.byokPlan.messages[0].content, /You are a wary scout/);

  const plannedPartyRes = responseHarness();
  await partyTurn({
    method: 'POST',
    headers: { 'x-rpgy-byok-plan': '1' },
    body: {
      gameState: {
        language: 'en',
        player: { name: 'Ari' },
        party: [{ id: 'party-kael-1', name: 'Kael', class: 'Scout', masterPrompt: 'You are a wary scout.' }]
      },
      speakerId: 'party-kael-1',
      messages: [{ speakerId: 'player', name: 'Ari', text: 'What do you see?' }],
      context: 'direct-question'
    }
  }, plannedPartyRes);
  assert.equal(plannedPartyRes.statusCode, 200);
  assert.equal(plannedPartyRes.body.byokPlan.meta.speakerName, 'Kael');
  assert.match(plannedPartyRes.body.byokPlan.messages[0].content, /You are a wary scout/);
});
