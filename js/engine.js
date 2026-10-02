const RPGY_GEMINI_BYOK_STORAGE = 'noderpg_gemini_byok_key';
const RPGY_BYOK_ONLY_MODE = true;
const RPGY_GEMINI_API_ROUTES = new Set(['/api/init', '/api/chat', '/api/director', '/api/party-turn', '/api/portrait', '/api/dialogue', '/api/ask']);
const GEMINI_BYOK_IMAGE_MODEL = 'gemini-3.1-flash-lite-image';
const GEMINI_BYOK_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const rpgyNativeFetch = window.fetch.bind(window);
let activeGeminiByokKey = localStorage.getItem(RPGY_GEMINI_BYOK_STORAGE) || '';
let activeShareId = String(new URLSearchParams(window.location.search).get('share') || '').trim();
let creditState = { billingEnabled: false, licenseStatus: 'checking', licenseValid: false, remaining: null, limit: 0, checkoutUrl: '', byok: Boolean(activeGeminiByokKey), shared: false };
let shareGiftSelected = false;
let shareGiftEligible = false;

function byokImageResponse(status, payload) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

function findByokGeneratedImage(value) {
    if (!value || typeof value !== 'object') return null;
    if (value.output_image?.data) return value.output_image;
    if (value.type === 'image' && value.data) return value;
    if (Array.isArray(value)) {
        for (const item of value) {
            const image = findByokGeneratedImage(item);
            if (image) return image;
        }
        return null;
    }
    for (const child of Object.values(value)) {
        const image = findByokGeneratedImage(child);
        if (image) return image;
    }
    return null;
}

function byokScenePrompt(prompt, roster) {
    const names = Array.isArray(roster) ? roster.filter(Boolean).slice(0, 12).join(', ') : '';
    return `${String(prompt || '').slice(0, 5000)}\n\nCreate a single cinematic 16:9 RPG scene containing every character listed in the attached reference roster exactly once${names ? `: ${names}` : ''}. The attached labeled reference sheet is the sole canonical source for casting. Copy each referenced person faithfully: exact face, apparent age, skin tone, hair, complete wardrobe, footwear, equipment, color palette, body proportions, and silhouette. Do not add Party members who are not in the roster. No typography, captions, signs, labels, interface, borders, watermarks, collage, split screen, duplicate characters, or invented lookalikes.`;
}

async function directByokPortrait(requestBody) {
    const { portraitPrompt, bannerPrompt, scenePrompt, referenceImage, referenceRoster = [] } = requestBody || {};
    let prompt = '';
    let aspectRatio = '2:3';
    const input = [];
    if (bannerPrompt) {
        aspectRatio = '16:9';
        prompt = `Cinematic 16:9 RPG world key art for a world-selection hero banner. Strong readable composition, atmospheric depth, one clear focal point, premium game concept art, no text, no title, no logo, no interface. ${String(bannerPrompt).slice(0, 5000)}`;
    } else if (scenePrompt) {
        aspectRatio = '16:9';
        const hasReferenceSheet = typeof referenceImage === 'string' && referenceImage.length > 0;
        prompt = hasReferenceSheet
            ? byokScenePrompt(scenePrompt, referenceRoster)
            : `Cinematic 16:9 RPG scene, premium game concept art, coherent environment, strong focal action, no text, no interface. ${String(scenePrompt).slice(0, 5000)}`;
        if (hasReferenceSheet) input.push({ type: 'image', mime_type: 'image/jpeg', data: referenceImage.replace(/^data:[^;]+;base64,/, '') });
    } else if (portraitPrompt) {
        prompt = `Full-body RPG character concept art. Show the complete figure from head to toe, centered in a natural standing pose, with hands, feet, clothing and equipment visible. No crop, no frame, no text. ${String(portraitPrompt).slice(0, 5000)}`;
    } else {
        return byokImageResponse(400, { error: 'portraitPrompt, bannerPrompt, or scenePrompt required' });
    }

    try {
        // BYOK is deliberately browser -> Google. The key is never attached to
        // an RPGy request, never stored in a save, and never handled by Vercel.
        const response = await rpgyNativeFetch(GEMINI_BYOK_INTERACTIONS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': activeGeminiByokKey },
            body: JSON.stringify({
                model: GEMINI_BYOK_IMAGE_MODEL,
                input: [{ type: 'text', text: prompt }, ...input],
                response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: aspectRatio, image_size: '1K' }
            })
        });
        const raw = await response.text();
        let data;
        try { data = JSON.parse(raw); } catch (_) { data = null; }
        if (!response.ok) return byokImageResponse(response.status, { error: data?.error?.message || raw || `Gemini image request failed (${response.status})` });
        const image = findByokGeneratedImage(data);
        if (!image?.data) return byokImageResponse(502, { error: 'Gemini returned no generated image' });
        const dataUrl = `data:${image.mime_type || image.mimeType || 'image/jpeg'};base64,${image.data}`;
        return byokImageResponse(200, bannerPrompt ? { heroBanner: dataUrl, byok: true } : scenePrompt ? { sceneImage: dataUrl, byok: true } : { portrait: dataUrl, byok: true });
    } catch (error) {
        return byokImageResponse(503, { error: error.message || 'Could not reach Gemini from this browser' });
    }
}

function byokJson(text) {
    const raw = String(text || '').trim();
    try { return JSON.parse(raw); } catch (_) {}
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Gemini returned invalid JSON');
    return JSON.parse(match[0]);
}

async function directByokText(system, user, options = {}) {
    const response = await rpgyNativeFetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': activeGeminiByokKey },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: {
                ...(options.json ? { responseMimeType: 'application/json' } : {}),
                maxOutputTokens: options.maxOutputTokens || 5000,
                thinkingConfig: { thinkingLevel: 'low' }
            }
        })
    });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch (_) { data = null; }
    if (!response.ok) throw new Error(data?.error?.message || raw || `Gemini text request failed (${response.status})`);
    const text = data?.candidates?.[0]?.content?.parts?.map(part => part?.text || '').join('').trim();
    if (!text) throw new Error('Gemini returned an empty response');
    return options.json ? byokJson(text) : text;
}

function directWorldSchema(expand) {
    return expand
        ? `Return only JSON with title, genre, tone, visualStyle (exactly photorealistic or cartoon), setting, premise, themes, heroBannerPrompt, openingCrisis, stakes, firstChoice, playerName, playerRole, playerDescription, playerDrive, playerPortraitPrompt, partyName, partyRole, partyDescription, partyDrive, partyPortraitPrompt, party2Name, party2Role, party2Description, party2Drive, party2PortraitPrompt, gmStyle, boundaries. Fill every field. Image prompts are English; other prose is in the requested language.`
        : `Return only JSON with: theme, currentLocation, knownLocations (array), player ({id,name,class,hp,karma,equipped,inventory,description,portraitPrompt,masterPrompt}), party (exactly two objects with id,name,class,hp,description,portraitPrompt,masterPrompt,voiceDescription), activeQuests (array), openingStory ({title,situation,narrative,speakerName,dialogue}), sceneImagePrompt, musicPrompt. Every Player and Party prompt must be detailed enough to create a complete head-to-toe reference portrait. Both Party members need distinct goals, secrets, voices, and independent motives.`;
}

async function directByokApi(path, payload) {
    const state = payload?.gameState || {};
    const language = state.language === 'fr' || payload?.language === 'fr' ? 'French' : 'English';
    if (path === '/api/init') {
        const expanding = payload?.mode === 'expand';
        const source = expanding ? payload.masterPrompt : payload.concept;
        const result = await directByokText(
            `You are the senior creative director of a player-centered RPG. Write in ${language}. Build a coherent playable story, not passive lore. The opening crisis must create a concrete urgent choice. The human Player always retains agency. ${directWorldSchema(expanding)}`,
            String(source || '').slice(0, 12000), { json: true, maxOutputTokens: 10000 }
        );
        return expanding ? { blueprint: result, byok: true } : { ...result, byok: true };
    }
    if (path === '/api/director') {
        const party = (state.party || []).filter(member => member?.id && !['separated', 'departed'].includes(member.presence));
        const replied = new Set(payload?.round?.respondedSpeakerIds || []);
        const available = party.filter(member => !replied.has(member.id));
        if (!available.length) return { hand_back_to_player: true, next_speaker: '' };
        const recent = (payload?.messages || []).slice(-12).map(m => `${m.name || m.speakerId}: ${m.text}`).join('\n');
        const result = await directByokText(
            `You are the Director of a player-centered RPG discussion. Select at most one eligible Party member to give a useful reaction to the Player, then return the floor. Never create a Party-to-Party conversation. Return only JSON: {"next_speaker":"one eligible id or empty","mode":"continue or interrupt","reason":"brief","hand_back_to_player":boolean}. Eligible: ${available.map(m => `${m.id} (${m.name}: ${(m.masterPrompt || m.description || '').slice(0, 400)})`).join('; ')}.`,
            `Current situation: ${state.currentStorySituation || ''}\nRecent transcript:\n${recent}`, { json: true, maxOutputTokens: 800 }
        );
        if (!available.some(m => m.id === result.next_speaker)) return { hand_back_to_player: true, next_speaker: '' };
        return { ...result, hand_back_to_player: result.hand_back_to_player === true ? true : false, byok: true };
    }
    if (path === '/api/party-turn') {
        const speaker = (state.party || []).find(member => member?.id === payload.speakerId);
        if (!speaker) throw new Error('Unknown Party speaker');
        const transcript = (payload.messages || []).slice(-14).map(m => `${m.name || m.speakerId}: ${m.text}`).join('\n');
        const text = await directByokText(
            `${speaker.masterPrompt || `You are ${speaker.name}, a Party member.`}\nYou are an independent Party agent in a player-centered RPG. Speak in ${language}. Reply directly to the Player in 1–4 concise, vivid sentences. Reveal a real opinion, need, fear, observation, dry joke, or disagreement when fitting. Never decide the Player's action, narrate mechanical changes, or start a Party-to-Party dialogue. Return only dialogue text.`,
            `World: ${state.theme || ''}\nLocation: ${state.currentLocation || ''}\nCurrent story situation: ${state.currentStorySituation || ''}\nRecent transcript:\n${transcript}`, { maxOutputTokens: 1000 }
        );
        return { text: text.replace(new RegExp(`^\\s*${String(speaker.name).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*:\\s*`, 'i'), ''), byok: true };
    }
    if (path === '/api/chat') {
        const profiles = (state.party || []).map(m => `${m.name}: ${(m.masterPrompt || m.description || '').slice(0, 1000)}`).join('\n');
        const result = await directByokText(
            `You are the Narrator and Game Master of a player-centered RPG. Write all response fields in ${language}. Resolve the Player action in at most two short paragraphs; do not write dialogue for Party members. Honor continuity and give the Player a meaningful next choice. Return only JSON with narrative, hp_change (number), karma_change (number), inventory_changes (array), party_updates (array), new_locations_unlocked (array), quest_updates (array), storyTitle, currentStorySituation (two polished concrete sentences), sceneImagePrompt (detailed English cinematic prompt). Party ground truth:\n${profiles}`,
            `Theme: ${state.theme || ''}\nLocation: ${state.currentLocation || ''}\nSituation: ${state.currentStorySituation || ''}\nRecent story: ${String(payload.storySoFar || '').slice(-12000)}\nPlayer action: ${String(payload.playerInput || '').slice(0, 4000)}`, { json: true, maxOutputTokens: 5000 }
        );
        // A model may return an incomplete optional update object. Do not let a
        // missing name/title break the local game-state merge.
        result.inventory_changes = Array.isArray(result.inventory_changes) ? result.inventory_changes.filter(item => item && typeof item.name === 'string' && item.name.trim()) : [];
        result.party_updates = Array.isArray(result.party_updates) ? result.party_updates.filter(member => member && typeof member.name === 'string' && member.name.trim()) : [];
        result.new_locations_unlocked = Array.isArray(result.new_locations_unlocked) ? result.new_locations_unlocked.filter(location => location && typeof location.name === 'string' && location.name.trim()) : [];
        result.quest_updates = Array.isArray(result.quest_updates) ? result.quest_updates.filter(quest => quest && typeof quest.title === 'string' && quest.title.trim()) : [];
        result.sceneImagePrompt = typeof result.sceneImagePrompt === 'string' && result.sceneImagePrompt.trim()
            ? result.sceneImagePrompt
            : `The immediate aftermath of this Player action in ${state.theme || 'an RPG world'}: ${String(result.narrative || state.currentStorySituation || '').slice(0, 1600)}`;
        // The UI renders this exact post-narration prompt asynchronously. Do
        // not hold the player's turn hostage while an image is being made.
        result.sceneImage = null;
        return { ...result, byok: true };
    }
    if (path === '/api/dialogue') {
        const names = (payload.npcs || []).map(n => n.name).join(', ');
        const result = await directByokText(`Extract only spoken NPC dialogue from an RPG narrative. Known NPCs: ${names}. Return only JSON: {"utterances":[{"name":"NPC name","text":"spoken line"}]}.`, String(payload.narrative || ''), { json: true, maxOutputTokens: 1800 });
        return { utterances: Array.isArray(result.utterances) ? result.utterances : [], byok: true };
    }
    if (path === '/api/ask') {
        const answer = await directByokText(`${payload.masterPrompt || `You are ${payload.name}.`} Answer the Player directly, briefly, and fully in character.`, String(payload.question || ''), { maxOutputTokens: 800 });
        return { answer, byok: true };
    }
    throw new Error('Unsupported BYOK route');
}

function directByokApiResponse(path, body) {
    return directByokApi(path, body).then(data => byokImageResponse(200, data)).catch(error => byokImageResponse(503, { error: error.message || 'Could not reach Gemini from this browser' }));
}

async function executeByokTextPlan(plan) {
    const messages = Array.isArray(plan?.messages) ? plan.messages : [];
    const systemInstruction = messages
        .filter(message => message?.role === 'system' && typeof message.content === 'string')
        .map(message => message.content.trim())
        .filter(Boolean)
        .join('\n\n');
    const contents = messages
        .filter(message => message && message.role !== 'system' && typeof message.content === 'string' && message.content.trim())
        .map(message => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }]
        }));
    while (contents.at(-1)?.role === 'model') contents.pop();
    if (!contents.length) throw new Error('Gemini requires a user message');

    const options = plan.options || {};
    const response = await rpgyNativeFetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': activeGeminiByokKey },
        body: JSON.stringify({
            ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
            contents,
            generationConfig: {
                ...(options.json ? { responseMimeType: 'application/json' } : {}),
                maxOutputTokens: options.maxOutputTokens || 12000,
                thinkingConfig: { thinkingLevel: options.thinkingLevel || 'low' }
            }
        })
    });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch (_) { data = null; }
    if (!response.ok) throw new Error(data?.error?.message || raw || `Gemini text request failed (${response.status})`);
    const text = data?.candidates?.[0]?.content?.parts?.map(part => part?.text || '').join('').trim();
    if (!text) throw new Error('Gemini returned an empty response');
    return options.json ? byokJson(text) : text;
}

function normalizePlannedInit(result, payload, meta) {
    if (meta.mode === 'expand') {
        const keys = ['title', 'genre', 'tone', 'visualStyle', 'setting', 'premise', 'themes', 'heroBannerPrompt', 'openingCrisis', 'stakes', 'firstChoice', 'playerName', 'playerRole', 'playerDescription', 'playerDrive', 'playerPortraitPrompt', 'partyName', 'partyRole', 'partyDescription', 'partyDrive', 'partyPortraitPrompt', 'party2Name', 'party2Role', 'party2Description', 'party2Drive', 'party2PortraitPrompt', 'gmStyle', 'boundaries'];
        const blueprint = Object.fromEntries(keys.map(key => [key, String(result?.[key] || '').trim()]));
        blueprint.visualStyle = blueprint.visualStyle.toLowerCase() === 'cartoon' ? 'cartoon' : 'photorealistic';
        return { blueprint, byok: true };
    }
    const generated = result && typeof result === 'object' ? result : {};
    generated.player = normalizeUnit(generated.player, 0, true);
    const party = Array.isArray(generated.party) ? generated.party : (Array.isArray(generated.party_updates) ? generated.party_updates : []);
    generated.party = [0, 1].map(index => normalizeUnit(party[index], index, false));
    const opening = generated.openingStory && typeof generated.openingStory === 'object' ? generated.openingStory : {};
    generated.openingStory = {
        title: opening.title || (meta.language === 'French' ? 'Le premier enjeu' : 'The First Turning Point'),
        situation: opening.situation || (meta.language === 'French' ? 'Une crise immédiate force le groupe à choisir ce qu’il protège en premier.' : 'An immediate crisis forces the group to decide what it will protect first.'),
        narrative: opening.narrative || (meta.language === 'French' ? 'Le monde est déjà en mouvement, et ses conséquences atteignent le groupe.' : 'The world is already moving, and its consequences have reached the group.'),
        speakerName: opening.speakerName || generated.party[0].name,
        dialogue: opening.dialogue || (meta.language === 'French' ? 'Nous devons agir. Par où commençons-nous ?' : 'We need to act. Where do we begin?')
    };
    generated.previousImagePrompt = generated.sceneImagePrompt;
    generated.sceneImage = null;
    generated.byok = true;
    return generated;
}

function normalizePlannedDirector(result, meta) {
    const available = new Set(meta.partyIds || []);
    const responded = new Set(meta.responded || []);
    const chosen = typeof result?.next_speaker === 'string' ? result.next_speaker : '';
    const validChoice = available.has(chosen) && !responded.has(chosen);
    const preferred = available.has(meta.preferredSpeakerId) && !responded.has(meta.preferredSpeakerId)
        ? meta.preferredSpeakerId
        : '';
    const forcedNeedsVoice = (meta.verboseMode && responded.size === 0) || meta.everyoneAsked === true;
    const fallback = forcedNeedsVoice ? (preferred || [...available].find(id => !responded.has(id))) : '';
    let selected = validChoice ? chosen : fallback;
    const repeatsLastSpeaker = responded.size === 0
        && selected === meta.lastAutomaticSpeakerId
        && preferred
        && preferred !== selected;
    if (repeatsLastSpeaker && result?.mode !== 'interrupt') selected = preferred;
    if (!selected) return {
        next_speaker: '', mode: 'continue', reason: 'No eligible Party member remains.',
        hand_back_to_player: true, addressed_to_everyone: meta.everyoneAsked === true, byok: true
    };
    return {
        next_speaker: selected,
        mode: result?.mode === 'interrupt' ? 'interrupt' : 'continue',
        reason: String(result?.reason || 'A companion has a relevant reaction.').slice(0, 500),
        hand_back_to_player: false,
        addressed_to_everyone: meta.everyoneAsked === true || result?.addressed_to_everyone === true,
        byok: true
    };
}

async function finalizePlannedByok(path, payload, plan, generated) {
    const meta = plan.meta || {};
    if (path === '/api/init') return normalizePlannedInit(generated, payload, meta);
    if (path === '/api/director') return normalizePlannedDirector(generated, meta);
    if (path === '/api/party-turn') {
        const escaped = String(meta.speakerName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return { text: String(generated || '').replace(new RegExp(`^\\s*${escaped}\\s*:\\s*`, 'i'), '').trim(), byok: true };
    }
    if (path === '/api/dialogue') return { utterances: Array.isArray(generated?.utterances) ? generated.utterances : [], byok: true };
    if (path === '/api/ask') return { answer: String(generated || '').trim(), byok: true };
    if (path === '/api/chat') {
        const result = generated && typeof generated === 'object' ? generated : {};
        result.inventory_changes = Array.isArray(result.inventory_changes) ? result.inventory_changes.filter(item => item && typeof item.name === 'string' && item.name.trim()) : [];
        result.party_updates = Array.isArray(result.party_updates) ? result.party_updates.filter(member => member && typeof member.name === 'string' && member.name.trim()) : [];
        result.new_locations_unlocked = Array.isArray(result.new_locations_unlocked) ? result.new_locations_unlocked.filter(location => location && typeof location.name === 'string' && location.name.trim()) : [];
        result.quest_updates = Array.isArray(result.quest_updates) ? result.quest_updates.filter(quest => quest && typeof quest.title === 'string' && quest.title.trim()) : [];
        if (result.sceneImagePrompt) {
            const imageResponse = await directByokPortrait({
                scenePrompt: result.sceneImagePrompt,
                referenceImage: payload.referenceImage,
                referenceRoster: payload.referenceRoster
            });
            const imageData = await imageResponse.json();
            if (imageResponse.ok) result.sceneImage = imageData.sceneImage;
            else console.error('BYOK scene generation failed:', imageData?.error || imageResponse.status);
        }
        return { ...result, byok: true };
    }
    return generated;
}

async function plannedByokApiResponse(path, payload) {
    try {
        // Prompt planning never needs image bytes. Keep them in the browser so
        // a reference sheet is uploaded exactly once: browser -> Gemini.
        const planningPayload = { ...(payload || {}) };
        delete planningPayload.referenceImage;
        delete planningPayload.referenceRoster;
        delete planningPayload.imageURL;
        const planResponse = await rpgyNativeFetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-RPGY-BYOK-Plan': '1' },
            body: JSON.stringify(planningPayload)
        });
        const planPayload = await planResponse.json();
        if (!planResponse.ok) return byokImageResponse(planResponse.status, planPayload);
        if (!planPayload.byokPlan) return byokImageResponse(200, planPayload);
        const generated = await executeByokTextPlan(planPayload.byokPlan);
        const finalPayload = await finalizePlannedByok(path, payload, planPayload.byokPlan, generated);
        return byokImageResponse(200, finalPayload);
    } catch (error) {
        return byokImageResponse(503, { error: error.message || 'Could not reach Gemini from this browser' });
    }
}

// The Gemini key stays in this browser. It never enters gameState, exported saves,
// image prompts, share links or third-party browser requests.
window.fetch = function rpgyFetch(input, init = {}) {
    const target = new URL(typeof input === 'string' ? input : input.url, window.location.href);
    if (target.origin !== window.location.origin || !target.pathname.startsWith('/api/')) return rpgyNativeFetch(input, init);
    const initOperation = target.pathname === '/api/init' ? target.searchParams.get('operation') : '';
    const isPublicInitOperation = initOperation === 'share' || initOperation === 'presence';
    if (activeGeminiByokKey && target.pathname === '/api/portrait' && String(init.method || 'GET').toUpperCase() === 'POST') {
        try { return directByokPortrait(JSON.parse(init.body || '{}')); }
        catch (_) { return Promise.resolve(byokImageResponse(400, { error: 'Invalid image request' })); }
    }
    if (activeGeminiByokKey && !isPublicInitOperation && RPGY_GEMINI_API_ROUTES.has(target.pathname) && String(init.method || 'GET').toUpperCase() === 'POST') {
        try { return plannedByokApiResponse(target.pathname, JSON.parse(init.body || '{}')); }
        catch (_) { return Promise.resolve(byokImageResponse(400, { error: 'Invalid BYOK request' })); }
    }
    if (RPGY_BYOK_ONLY_MODE && !activeGeminiByokKey && !isPublicInitOperation && RPGY_GEMINI_API_ROUTES.has(target.pathname) && String(init.method || 'GET').toUpperCase() === 'POST') {
        showLicenseModal('This action requires your own Gemini API Key.');
        return Promise.resolve(byokImageResponse(402, {
            error: 'byok_required',
            message: 'This action requires your own Gemini API Key.',
            byokOnly: true,
            billingEnabled: false,
            actionsRemaining: 0
        }));
    }
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    if (activeShareId) headers.set('X-RPGY-Share-ID', activeShareId);
    return rpgyNativeFetch(input, { ...init, headers });
};

let storedLang = localStorage.getItem('noderpg_lang');
if (!storedLang || (storedLang !== 'en' && storedLang !== 'fr')) {
    storedLang = 'en';
    localStorage.setItem('noderpg_lang', 'en');
}
let gameState = { language: storedLang };
let partyVerbosePreference = false;
let storySoFar = "";
let activeTab = 'quests';
let worldsBrowserHTML = null;
let partyDiscussionVersion = 0;
let partyDiscussionController = null;
let partyDiscussionActive = false;
let gmRequestInFlight = false;
let selectedUnitProfile = null;
let activeCompanionChatIndex = null;
let companionChatRequestInFlight = false;
let companionChatError = '';
let sceneReferenceCache = { key: '', value: null };
const RPGY_PRESENCE_SESSION_STORAGE = 'rpgy_presence_session_id';
const RPGY_PRESENCE_INTERVAL_MS = 30000;
let presenceSyncInFlight = false;
let presenceReportedActive = false;
const PARTY_REPLY_LIMIT = 3;
const PARTY_ROUND_TIME_LIMIT_MS = 25000;
const SCENE_RENDER_VERSION = 3;
let partyReactionInFlight = false;
let soundSettings = {
    music: false,
    dialogue: false
};

let musicState = {
    promptInFlight: null,
    promptLoaded: null,
    blobUrl: null
};

function rpgPresenceSessionId() {
    try {
        let id = sessionStorage.getItem(RPGY_PRESENCE_SESSION_STORAGE);
        if (!id) {
            id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            sessionStorage.setItem(RPGY_PRESENCE_SESSION_STORAGE, id);
        }
        return id;
    } catch (_) {
        return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
}

function isRpgSessionPlaying() {
    const worldBrowser = document.getElementById('world-browser');
    const constructor = document.getElementById('constructor-view');
    const construction = document.getElementById('world-construction');
    return Boolean(gameState?.player)
        && worldBrowser?.classList.contains('hidden')
        && constructor?.classList.contains('hidden')
        && construction?.classList.contains('hidden');
}

function renderRpgPresence(count) {
    const value = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
    const target = document.getElementById('landing-presence-count');
    if (target) target.textContent = String(value);
}

async function syncRpgPresence() {
    if (presenceSyncInFlight) return;
    presenceSyncInFlight = true;
    const active = isRpgSessionPlaying();
    try {
        const response = await rpgyNativeFetch('/api/init?operation=presence', active || presenceReportedActive ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: rpgPresenceSessionId(), active })
        } : { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (response.ok) renderRpgPresence(data.count);
        presenceReportedActive = active;
    } catch (_) {
        renderRpgPresence(0);
    } finally {
        presenceSyncInFlight = false;
    }
}

function startRpgPresenceCounter() {
    void syncRpgPresence();
    window.setInterval(syncRpgPresence, RPGY_PRESENCE_INTERVAL_MS);
    window.addEventListener('pagehide', () => {
        if (!presenceReportedActive || !navigator.sendBeacon) return;
        const payload = new Blob([JSON.stringify({ sessionId: rpgPresenceSessionId(), active: false })], { type: 'application/json' });
        navigator.sendBeacon('/api/init?operation=presence', payload);
    });
}

function setMusicStatus(text) {
    const el = document.getElementById('music-status');
    if (el) el.textContent = text || '';
}

function stopMusic() {
    const audio = document.getElementById('music-audio');
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
    }
}

async function fetchWorldMusic(prompt) {
    if (!prompt || musicState.promptInFlight === prompt) return;
    if (musicState.promptLoaded === prompt && musicState.blobUrl) {
        playLoadedMusic();
        return;
    }
    musicState.promptInFlight = prompt;
    setMusicStatus('generating…');
    try {
        const res = await fetch('/api/music', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, musicLengthMs: 120000 })
        });
        if (!res.ok) throw new Error(`Music API ${res.status}`);
        const blob = await res.blob();

        // Stale check — a newer world may have been started while we waited
        if (gameState.musicPrompt !== prompt) {
            setMusicStatus('');
            return;
        }

        if (musicState.blobUrl) URL.revokeObjectURL(musicState.blobUrl);
        musicState.blobUrl = URL.createObjectURL(blob);
        musicState.promptLoaded = prompt;

        const dlBtn = document.getElementById('btn-download-music');
        if (dlBtn) dlBtn.disabled = false;
        setMusicStatus('');

        if (soundSettings.music) playLoadedMusic();
    } catch (e) {
        console.error('Music fetch failed:', e);
        setMusicStatus('error');
    } finally {
        if (musicState.promptInFlight === prompt) musicState.promptInFlight = null;
    }
}

function playLoadedMusic() {
    const audio = document.getElementById('music-audio');
    if (!audio || !musicState.blobUrl) return;
    if (audio.src !== musicState.blobUrl) audio.src = musicState.blobUrl;
    audio.loop = true;
    audio.play().catch(e => console.warn('Music autoplay blocked:', e));
}

function handleMusicPrompt(prompt) {
    if (!prompt) return;
    const isNewWorld = gameState.musicPrompt !== prompt;
    gameState.musicPrompt = prompt;
    if (isNewWorld) {
        // Drop any previously-loaded music — new world means new track
        if (musicState.blobUrl) URL.revokeObjectURL(musicState.blobUrl);
        musicState.blobUrl = null;
        musicState.promptLoaded = null;
        const dlBtn = document.getElementById('btn-download-music');
        if (dlBtn) dlBtn.disabled = true;
    }
    if (soundSettings.music) fetchWorldMusic(prompt);
}

function downloadMusic() {
    if (!musicState.blobUrl) return;
    const a = document.createElement('a');
    a.href = musicState.blobUrl;
    a.download = `music_${Date.now()}.mp3`;
    a.click();
}

// ---------------- NPC voices + dialogue ----------------

function autoSave() {
    try {
        localStorage.setItem('noderpg_save', JSON.stringify({ gameState, storySoFar }));
        return true;
    } catch (error) {
        // Preserve unit sheets and their avatars first. A generated background is
        // recoverable and can be omitted when the browser's local quota is tight.
        try {
            const compactState = {
                ...gameState,
                sceneImage: null,
                discussion: {
                    ...(gameState.discussion || {}),
                    messages: (gameState.discussion?.messages || []).slice(-30)
                }
            };
            localStorage.setItem('noderpg_save', JSON.stringify({ gameState: compactState, storySoFar }));
            console.warn('Local save compacted because browser storage was full.', error);
            return true;
        } catch (compactError) {
            console.error('Local save failed:', compactError);
            return false;
        }
    }
}

function unitIdFromName(name, index) {
    const slug = String(name || `member-${index + 1}`)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || `member-${index + 1}`;
    return `party-${slug}-${index + 1}`;
}

function defaultMasterPrompt(unit, isPlayer) {
    const role = isPlayer ? 'the PLAYER' : `a ${unit.class || 'companion'} in the PLAYER's Party`;
    return `You are ${unit.name || (isPlayer ? 'the PLAYER' : 'a Party member')}, ${role}. ${unit.description || ''} Preserve this character's established personality, history, wants, fears, loyalties, goals, secrets, biases, relationships, boundaries, voice, and evolving emotional state. Never flatten the character into a generic helper.`;
}

function normalizeUnit(unit, index = 0, isPlayer = false) {
    const normalized = unit && typeof unit === 'object' ? unit : {};
    normalized.id = isPlayer ? 'player' : (normalized.id || unitIdFromName(normalized.name, index));
    normalized.name = normalized.name || (isPlayer ? 'Player' : `Party member ${index + 1}`);
    normalized.class = normalized.class || (isPlayer ? 'Player character' : 'Companion');
    normalized.hp = Number.isFinite(Number(normalized.hp)) ? Number(normalized.hp) : 100;
    normalized.maxHp = Number.isFinite(Number(normalized.maxHp)) && Number(normalized.maxHp) > 0
        ? Number(normalized.maxHp)
        : Math.max(100, normalized.hp);
    if (isPlayer) normalized.karma = Number.isFinite(Number(normalized.karma)) ? Number(normalized.karma) : 0;
    normalized.description = normalized.description || '';
    normalized.portraitPrompt = normalized.portraitPrompt || normalized.description || `${normalized.name}, full-body RPG character`;
    normalized.masterPrompt = normalized.masterPrompt || defaultMasterPrompt(normalized, isPlayer);
    if (!isPlayer) {
        normalized.presence = ['present', 'separated', 'departed'].includes(normalized.presence) ? normalized.presence : 'present';
        if (!Array.isArray(normalized.inventory)) normalized.inventory = [];
        normalized.autonomyMemory = typeof normalized.autonomyMemory === 'string' ? normalized.autonomyMemory : '';
    }
    return normalized;
}

function applyZombieLondonPreset(concept, force = false) {
    const presetApi = window.ZombieLondon;
    if (!presetApi || !presetApi.isZombieLondon(concept)) return false;
    if (!force && gameState.worldPreset === presetApi.WORLD_ID) {
        gameState.briefing ||= presetApi.BRIEFING;
        gameState.storyTitle ||= presetApi.OPENING_STORY.title;
        gameState.openingStory ||= { ...presetApi.OPENING_STORY };
        gameState.currentStorySituation ||= presetApi.OPENING_STORY.situation;
        return false;
    }

    const roster = presetApi.createRoster();
    gameState.player = roster.player;
    gameState.party = roster.party;
    gameState.worldPreset = presetApi.WORLD_ID;
    gameState.worldConcept = 'Zombie London';
    gameState.briefing = presetApi.BRIEFING;
    gameState.storyTitle = presetApi.OPENING_STORY.title;
    gameState.openingStory = { ...presetApi.OPENING_STORY };
    return true;
}

function applyWorldPreset(concept, force = false) {
    if (window.ZombieLondon?.isZombieLondon(concept)) return applyZombieLondonPreset(concept, force);
    const roster = window.PresetRosters?.createRosterByConcept(concept);
    if (!roster) return false;
    if (!force && gameState.worldPreset === roster.worldPreset) {
        gameState.briefing ||= roster.briefing;
        gameState.storyTitle ||= roster.storyTitle;
        gameState.openingStory ||= { ...roster.openingStory };
        gameState.currentStorySituation ||= roster.openingStory.situation;
        return false;
    }
    gameState.player = roster.player;
    gameState.party = roster.party;
    gameState.worldPreset = roster.worldPreset;
    gameState.visualStyle = roster.visualStyle;
    gameState.openingScenePrompt = roster.openingScenePrompt;
    gameState.briefing = roster.briefing;
    gameState.storyTitle = roster.storyTitle;
    gameState.openingStory = { ...roster.openingStory };
    gameState.worldConcept = concept;
    return true;
}

function hardcodedWorldBriefing(concept) {
    if (window.ZombieLondon?.isZombieLondon(concept)) return window.ZombieLondon.BRIEFING;
    return window.PresetRosters?.createRosterByConcept(concept)?.briefing
        || (pendingCustomBlueprint
            ? `${pendingCustomBlueprint.title || 'A new reality'} — ${pendingCustomBlueprint.premise || pendingCustomBlueprint.openingCrisis || pendingCustomBlueprint.setting || 'an original world shaped around the Player.'}`
            : '')
        || `A new world is taking shape around a central conflict. Its people already have urgent needs, private wants, and consequences waiting for the first decision.`;
}

let constructionStatusTimer = null;
let constructionStageTimers = [];
let constructionStep = 0;
let worldConstructionRun = 0;
let pendingCustomBlueprint = null;
let activeCustomWorldId = null;
const WORLD_CONSTRUCTOR_DRAFT_KEY = 'noderpg_world_constructor_draft';
const CUSTOM_WORLDS_KEY = 'noderpg_custom_worlds';
const CONSTRUCTOR_IMAGE_KEYS = ['heroBanner', 'playerPortrait', 'partyPortrait', 'party2Portrait'];

function worldConstructorFields() {
    return [...document.querySelectorAll('[data-world-field]')];
}

function readWorldConstructorDraft() {
    const draft = {
        masterPrompt: document.getElementById('world-master-prompt')?.value.trim() || '',
        customWorldId: activeCustomWorldId
    };
    worldConstructorFields().forEach(field => {
        draft[field.dataset.worldField] = field.value.trim();
    });
    CONSTRUCTOR_IMAGE_KEYS.forEach(key => {
        const image = document.querySelector(`[data-constructor-image="${key}"] img`);
        if (image?.src?.startsWith('data:image/')) draft[key] = image.src;
    });
    return draft;
}

function setWorldConstructorImage(key, dataUrl = '') {
    const forge = document.querySelector(`[data-constructor-image="${key}"]`);
    const preview = forge?.querySelector('.constructor-image-preview');
    const image = preview?.querySelector('img');
    if (!preview || !image) return;
    if (dataUrl?.startsWith('data:image/')) {
        image.src = dataUrl;
        preview.classList.add('has-image');
    } else {
        image.removeAttribute('src');
        preview.classList.remove('has-image');
    }
}

function updateWorldConstructorCompletion() {
    const fields = worldConstructorFields();
    const shaped = fields.filter(field => field.value.trim()).length;
    const counter = document.getElementById('constructor-completion');
    if (counter) counter.textContent = `${shaped} / ${fields.length} fields shaped`;
}

function persistWorldConstructorDraft() {
    try {
        localStorage.setItem(WORLD_CONSTRUCTOR_DRAFT_KEY, JSON.stringify(readWorldConstructorDraft()));
    } catch (error) {
        console.warn('Could not save the World Constructor draft:', error);
    }
    updateWorldConstructorCompletion();
}

function populateWorldConstructor(draft, animate = false) {
    if (!draft || typeof draft !== 'object') return;
    if (draft.customWorldId !== undefined) activeCustomWorldId = draft.customWorldId || null;
    const master = document.getElementById('world-master-prompt');
    if (master && typeof draft.masterPrompt === 'string') master.value = draft.masterPrompt;
    worldConstructorFields().forEach(field => {
        const value = draft[field.dataset.worldField];
        if (value === undefined || value === null) return;
        field.value = String(value);
        if (animate) {
            field.classList.remove('is-ai-filled');
            void field.offsetWidth;
            field.classList.add('is-ai-filled');
        }
    });
    CONSTRUCTOR_IMAGE_KEYS.forEach(key => {
        if (draft[key]) setWorldConstructorImage(key, draft[key]);
    });
    persistWorldConstructorDraft();
}

function restoreWorldConstructorDraft() {
    try {
        const saved = localStorage.getItem(WORLD_CONSTRUCTOR_DRAFT_KEY);
        if (saved) populateWorldConstructor(JSON.parse(saved));
        else updateWorldConstructorCompletion();
    } catch (error) {
        console.warn('Could not restore the World Constructor draft:', error);
        updateWorldConstructorCompletion();
    }
}

function resetWorldConstructorDraft() {
    activeCustomWorldId = null;
    const master = document.getElementById('world-master-prompt');
    if (master) master.value = '';
    worldConstructorFields().forEach(field => {
        field.value = field.tagName === 'SELECT' ? 'photorealistic' : '';
        field.classList.remove('is-ai-filled');
    });
    CONSTRUCTOR_IMAGE_KEYS.forEach(key => setWorldConstructorImage(key));
    localStorage.removeItem(WORLD_CONSTRUCTOR_DRAFT_KEY);
    const status = document.getElementById('constructor-draft-status');
    if (status) {
        status.textContent = 'Draft cleared. The foundry is ready for a new directive.';
        status.classList.remove('is-error');
    }
    updateWorldConstructorCompletion();
    master?.focus();
}

function compileWorldConstructorConcept(draft = readWorldConstructorDraft()) {
    const entries = [
        ['WORLD TITLE', draft.title],
        ['GENRE', draft.genre],
        ['TONE', draft.tone],
        ['VISUAL STYLE', draft.visualStyle],
        ['SETTING AND ERA', draft.setting],
        ['CORE PREMISE', draft.premise],
        ['THEMES AND MOTIFS', draft.themes],
        ['WORLD HERO BANNER PROMPT', draft.heroBannerPrompt],
        ['OPENING CRISIS', draft.openingCrisis],
        ['STAKES', draft.stakes],
        ['FIRST MEANINGFUL CHOICE', draft.firstChoice],
        ['PLAYER NAME', draft.playerName],
        ['PLAYER ROLE', draft.playerRole],
        ['PLAYER IDENTITY', draft.playerDescription],
        ['PLAYER WANTS, FEARS, AND GOALS', draft.playerDrive],
        ['PLAYER FULL-BODY REFERENCE PROMPT', draft.playerPortraitPrompt],
        ['PARTY MEMBER NAME', draft.partyName],
        ['PARTY MEMBER ROLE', draft.partyRole],
        ['PARTY MEMBER IDENTITY', draft.partyDescription],
        ['PARTY MEMBER PRIVATE AGENDA', draft.partyDrive],
        ['PARTY MEMBER FULL-BODY REFERENCE PROMPT', draft.partyPortraitPrompt],
        ['SECOND PARTY MEMBER NAME', draft.party2Name],
        ['SECOND PARTY MEMBER ROLE', draft.party2Role],
        ['SECOND PARTY MEMBER IDENTITY', draft.party2Description],
        ['SECOND PARTY MEMBER PRIVATE AGENDA', draft.party2Drive],
        ['SECOND PARTY MEMBER FULL-BODY REFERENCE PROMPT', draft.party2PortraitPrompt],
        ['GAME MASTER STYLE', draft.gmStyle],
        ['BOUNDARIES AND EXCLUSIONS', draft.boundaries]
    ].filter(([, value]) => String(value || '').trim());
    const details = entries.map(([label, value]) => `${label}: ${String(value).trim()}`).join('\n');
    return [
        'Create an original RPG world from this authoritative creative blueprint.',
        draft.masterPrompt ? `MASTER PROMPT:\n${draft.masterPrompt}` : '',
        details ? `\nEDITED WORLD BLUEPRINT:\n${details}` : ''
    ].filter(Boolean).join('\n\n').trim();
}

function customWorldOpeningScenePrompt(blueprint) {
    if (!blueprint || typeof blueprint !== 'object') return '';
    const style = blueprint.visualStyle === 'cartoon'
        ? 'premium illustrated cartoon art'
        : 'cinematic photorealism';
    return [
        `Cinematic opening scene for ${blueprint.title || 'an original RPG world'}.`,
        blueprint.setting ? `Environment and era: ${blueprint.setting}.` : '',
        blueprint.openingCrisis ? `Immediate visible event: ${blueprint.openingCrisis}.` : '',
        blueprint.tone ? `Mood: ${blueprint.tone}.` : '',
        `Visual treatment: ${style}.`,
        'Show a decisive physical moment in the environment, with no written language or interface elements.'
    ].filter(Boolean).join(' ');
}

function safeScenePromptForCurrentWorld(prompt) {
    const raw = String(prompt || '').trim();
    const blueprintLeak = /(?:EDITED WORLD BLUEPRINT|MASTER PROMPT:|PLAYER (?:ROLE|IDENTITY|WANTS)|PARTY MEMBER (?:ROLE|IDENTITY|PRIVATE)|FULL-BODY REFERENCE PROMPT|BOUNDARIES AND EXCLUSIONS)/i.test(raw);
    if (gameState?.customWorldBlueprint && blueprintLeak) {
        return customWorldOpeningScenePrompt(gameState.customWorldBlueprint);
    }
    return raw;
}

function compactConstructorImage(dataUrl, kind) {
    return new Promise(resolve => {
        const source = new Image();
        source.onload = () => {
            const portrait = kind !== 'heroBanner';
            const maxWidth = portrait ? 512 : 960;
            const maxHeight = portrait ? 768 : 540;
            const scale = Math.min(1, maxWidth / source.naturalWidth, maxHeight / source.naturalHeight);
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
            canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', .8));
        };
        source.onerror = () => resolve(dataUrl);
        source.src = dataUrl;
    });
}

function constructorImagePrompt(kind, draft) {
    const style = draft.visualStyle === 'cartoon' ? 'premium illustrated cartoon concept art' : 'cinematic photorealism';
    const worldContext = `${draft.title || 'Original RPG world'}; ${draft.setting || ''}; ${draft.tone || ''}; ${style}.`;
    if (kind === 'heroBanner') {
        return draft.heroBannerPrompt || `${worldContext} ${draft.premise || ''} ${draft.openingCrisis || ''} Cinematic 16:9 world-selection hero banner, atmospheric depth, strong focal composition, no title, no text, no logo.`;
    }
    const character = kind === 'playerPortrait'
        ? `${draft.playerName || 'The Player'}, ${draft.playerRole || ''}. ${draft.playerDescription || ''}. ${draft.playerPortraitPrompt || ''}`
        : kind === 'partyPortrait'
            ? `${draft.partyName || 'First companion'}, ${draft.partyRole || ''}. ${draft.partyDescription || ''}. ${draft.partyPortraitPrompt || ''}`
            : `${draft.party2Name || 'Second companion'}, ${draft.party2Role || ''}. ${draft.party2Description || ''}. ${draft.party2PortraitPrompt || ''}`;
    return `${character} World context: ${worldContext} Complete full body visible head-to-toe, centered natural standing pose, hands and feet visible, readable face, practical equipment, clean 2:3 character reference composition, no crop, no frame, no text.`;
}

async function generateWorldConstructorImage(kind, button) {
    if (!requireGeminiByok('Generating world artwork requires your own Gemini API Key.')) return;
    const forge = button.closest('[data-constructor-image]');
    const status = forge?.querySelector('small[role="status"]');
    const draft = readWorldConstructorDraft();
    const prompt = constructorImagePrompt(kind, draft);
    if (prompt.length < 60) return;
    button.disabled = true;
    if (status) {
        status.textContent = kind === 'heroBanner' ? 'Composing the world hero...' : 'Casting the full-body reference...';
        status.classList.remove('is-error');
    }
    try {
        const response = await fetch('/api/portrait', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(kind === 'heroBanner' ? { bannerPrompt: prompt, chargeCredit: true } : { portraitPrompt: prompt, chargeCredit: true })
        });
        const data = await response.json();
        if (!response.ok) {
            if ([402, 503].includes(response.status)) {
                applyCreditPayload(data);
                showLicenseModal(data.message || 'A Gemini API key is required.');
            }
            throw new Error(data.message || data.error || `Image service returned ${response.status}`);
        }
        if (typeof data.actionsRemaining === 'number') updateActionsRemaining(data.actionsRemaining, data.creditSource);
        const rawImage = kind === 'heroBanner' ? data.heroBanner : data.portrait;
        if (!rawImage) throw new Error('The image service returned no image');
        const compactImage = await compactConstructorImage(rawImage, kind);
        setWorldConstructorImage(kind, compactImage);
        persistWorldConstructorDraft();
        if (status) status.textContent = 'Reference locked into this world draft.';
    } catch (error) {
        if (status) {
            status.textContent = `Generation failed: ${error.message}`;
            status.classList.add('is-error');
        }
    } finally {
        button.disabled = false;
    }
}

function customWorldArchive() {
    try {
        const worlds = JSON.parse(localStorage.getItem(CUSTOM_WORLDS_KEY) || '[]');
        return Array.isArray(worlds) ? worlds : [];
    } catch (_) {
        return [];
    }
}

function restoreMissingCustomPortraits() {
    if (!gameState?.customWorldId && !gameState?.customWorldBlueprint) return 0;
    const archived = gameState.customWorldId
        ? customWorldArchive().find(world => world.id === gameState.customWorldId)?.blueprint
        : null;
    let draft = null;
    try {
        draft = JSON.parse(localStorage.getItem(WORLD_CONSTRUCTOR_DRAFT_KEY) || 'null');
    } catch (_) {}
    const sources = [gameState.customWorldBlueprint, archived, draft].filter(Boolean);
    const mappings = [
        [gameState.player, 'playerPortrait'],
        [gameState.party?.[0], 'partyPortrait'],
        [gameState.party?.[1], 'party2Portrait']
    ];
    let restored = 0;
    for (const [unit, key] of mappings) {
        if (!unit || unit.portrait) continue;
        const portrait = sources.map(source => source?.[key]).find(Boolean);
        if (portrait) {
            unit.portrait = portrait;
            restored += 1;
        }
    }
    if (restored) sceneReferenceCache = { key: '', value: null };
    return restored;
}

async function repairMissingUnitPortraits() {
    restoreMissingCustomPortraits();
    const units = [gameState?.player, ...(gameState?.party || [])]
        .filter(unit => unit?.name && unit?.portraitPrompt && !unit.portrait);
    if (!units.length) return 0;
    const results = await Promise.all(units.map(async unit => {
        try {
            const response = await fetch('/api/portrait', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ portraitPrompt: unit.portraitPrompt })
            });
            const data = await responseJson(response);
            if (!response.ok || !data.portrait) return false;
            unit.portrait = data.portrait;
            return true;
        } catch (error) {
            console.error(`Could not restore ${unit.name}'s portrait:`, error);
            return false;
        }
    }));
    const repaired = results.filter(Boolean).length;
    if (repaired) {
        sceneReferenceCache = { key: '', value: null };
        updateUI();
        autoSave();
    }
    return repaired;
}

function saveCustomWorldToArchive(draft) {
    const worlds = customWorldArchive();
    const id = activeCustomWorldId || `custom-${Date.now()}-${String(draft.title || 'world').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)}`;
    activeCustomWorldId = id;
    const record = {
        id,
        title: draft.title || 'Untitled Custom World',
        genre: draft.genre || 'Custom RPG',
        premise: draft.premise || draft.setting || 'A world of your own design.',
        visualStyle: draft.visualStyle || 'photorealistic',
        heroBanner: draft.heroBanner || '',
        blueprint: { ...draft, customWorldId: id },
        updatedAt: Date.now()
    };
    const next = [record, ...worlds.filter(world => world.id !== id)].slice(0, 8);
    try {
        localStorage.setItem(CUSTOM_WORLDS_KEY, JSON.stringify(next));
        localStorage.setItem(WORLD_CONSTRUCTOR_DRAFT_KEY, JSON.stringify(record.blueprint));
    } catch (error) {
        console.warn('Custom world archive reached local storage capacity:', error);
    }
    return record;
}

function launchArchivedCustomWorld(id) {
    const record = customWorldArchive().find(world => world.id === id);
    if (!record?.blueprint) return;
    if (!requireGeminiByok('Opening this world requires your own Gemini API Key.')) return;
    CONSTRUCTOR_IMAGE_KEYS.forEach(key => setWorldConstructorImage(key));
    activeCustomWorldId = id;
    populateWorldConstructor({ ...record.blueprint, customWorldId: id });
    pendingCustomBlueprint = readWorldConstructorDraft();
    document.getElementById('world-browser')?.classList.add('hidden');
    document.getElementById('btn-enter')?.click();
}

async function draftWorldConstructorFromMasterPrompt() {
    if (!requireGeminiByok('Drafting a world requires your own Gemini API Key.')) return;
    const masterPrompt = document.getElementById('world-master-prompt')?.value.trim() || '';
    const button = document.getElementById('btn-draft-world');
    const status = document.getElementById('constructor-draft-status');
    if (masterPrompt.length < 20) {
        if (status) {
            status.textContent = 'Give the Director a little more to work with—at least one clear sentence.';
            status.classList.add('is-error');
        }
        document.getElementById('world-master-prompt')?.focus();
        return;
    }
    if (button) button.disabled = true;
    if (status) {
        status.textContent = 'The Director is extracting the world, story, Player, and Party architecture...';
        status.classList.remove('is-error');
    }
    try {
        const response = await fetch('/api/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'expand', masterPrompt, language: gameState.language })
        });
        const data = await response.json();
        if ([402, 503].includes(response.status)) {
            applyCreditPayload(data);
            showLicenseModal(data.message || 'A Gemini API key is required.');
        }
        if (!response.ok) throw new Error(data.error || data.detail || `Director returned ${response.status}`);
        if (typeof data.actionsRemaining === 'number') updateActionsRemaining(data.actionsRemaining, data.creditSource);
        CONSTRUCTOR_IMAGE_KEYS.forEach(key => setWorldConstructorImage(key));
        populateWorldConstructor({ ...data.blueprint, masterPrompt }, true);
        if (status) status.textContent = 'World architecture drafted. Every field remains yours to revise.';
    } catch (error) {
        if (status) {
            status.textContent = `The draft could not be completed: ${error.message}`;
            status.classList.add('is-error');
        }
    } finally {
        if (button) button.disabled = false;
    }
}

function openWorldConstructor() {
    pendingCustomBlueprint = null;
    document.getElementById('world-browser')?.classList.add('hidden');
    document.getElementById('constructor-view')?.classList.remove('hidden');
    restoreWorldConstructorDraft();
    setTimeout(() => document.getElementById('world-master-prompt')?.focus(), 0);
    if (!activeGeminiByokKey) {
        showLicenseModal('Creating your own world requires a Gemini API Key. The complete form is ready underneath.');
    }
}

function invalidateWorldConstruction() {
    worldConstructionRun += 1;
    const enterButton = document.getElementById('btn-enter');
    if (enterButton) enterButton.disabled = false;
}

function constructionPresetDetails(concept) {
    if (window.ZombieLondon?.isZombieLondon(concept)) {
        const roster = window.ZombieLondon.createRoster();
        return {
            ...roster,
            briefing: window.ZombieLondon.BRIEFING,
            storyTitle: window.ZombieLondon.OPENING_STORY?.title,
            visualStyle: 'photorealistic'
        };
    }
    const preset = window.PresetRosters?.createRosterByConcept(concept);
    if (preset) return preset;
    if (!pendingCustomBlueprint) return null;
    return {
        player: { name: pendingCustomBlueprint.playerName || 'the Player' },
        party: [pendingCustomBlueprint.partyName, pendingCustomBlueprint.party2Name].filter(Boolean).map(name => ({ name })),
        visualStyle: pendingCustomBlueprint.visualStyle || 'photorealistic',
        storyTitle: pendingCustomBlueprint.title || 'an original conflict',
        briefing: pendingCustomBlueprint.premise || pendingCustomBlueprint.setting || ''
    };
}

function setConstructionStep(nextStep, statusText) {
    if (nextStep < constructionStep) return;
    constructionStep = nextStep;
    document.querySelectorAll('[data-construction-step]').forEach((item, index) => {
        item.classList.toggle('is-complete', index < nextStep || nextStep >= 4);
        item.classList.toggle('is-active', index === nextStep && nextStep < 4);
    });
    const progress = document.getElementById('construction-progress-bar');
    if (progress) progress.style.width = `${nextStep >= 4 ? 100 : [8, 34, 59, 82][nextStep]}%`;
    if (statusText) {
        const status = document.getElementById('construction-status');
        if (status) status.textContent = statusText;
    }
}

function clearConstructionTimers() {
    if (constructionStatusTimer) clearInterval(constructionStatusTimer);
    constructionStatusTimer = null;
    constructionStageTimers.forEach(clearTimeout);
    constructionStageTimers = [];
}

function beginWorldConstruction(concept, briefing) {
    clearConstructionTimers();
    constructionStep = 0;
    const isFrench = gameState.language === 'fr';
    const details = constructionPresetDetails(concept);
    const displayWorldName = pendingCustomBlueprint?.title || concept;
    const partyNames = details?.party?.map(member => member.name).filter(Boolean) || [];
    const castNames = [details?.player?.name, ...partyNames].filter(Boolean);
    const visualStyle = details?.visualStyle === 'cartoon'
        ? (isFrench ? 'illustré' : 'illustrated')
        : (isFrench ? 'photoréaliste' : 'photorealistic');
    const storyTitle = details?.storyTitle || (isFrench ? 'un conflit original' : 'an original conflict');

    document.body.classList.add('is-constructing-world');
    document.getElementById('full-screen-img')?.classList.add('hidden');
    document.getElementById('survivor-roster')?.classList.add('hidden');
    document.getElementById('current-story-panel')?.classList.add('hidden');
    document.querySelectorAll('#talk-modal, #companion-chat-modal, #quests-modal, #inventory-modal, #party-modal, #license-modal').forEach(modal => modal.classList.add('hidden'));
    document.getElementById('music-audio')?.pause();
    document.getElementById('dialogue-audio')?.pause();

    const overlay = document.getElementById('world-construction');
    const heading = document.getElementById('construction-heading');
    const briefingEl = document.getElementById('construction-briefing');
    const returnButton = document.getElementById('construction-return');
    const live = overlay?.querySelector('.construction-live');
    if (overlay) overlay.classList.remove('hidden', 'is-error');
    if (returnButton) returnButton.classList.add('hidden');
    if (live) live.classList.remove('is-error');
    if (heading) heading.textContent = isFrench ? `Construction de ${displayWorldName}.` : `Building ${displayWorldName}.`;
    if (briefingEl) briefingEl.textContent = briefing;

    const worldLabel = document.getElementById('construction-world-label');
    const worldDetail = document.getElementById('construction-world-detail');
    const castLabel = document.getElementById('construction-cast-label');
    const castDetail = document.getElementById('construction-cast-detail');
    const storyLabel = document.getElementById('construction-story-label');
    const storyDetail = document.getElementById('construction-story-detail');
    const sceneLabel = document.getElementById('construction-scene-label');
    const sceneDetail = document.getElementById('construction-scene-detail');

    if (worldLabel) worldLabel.textContent = isFrench ? `Définition de ${displayWorldName}` : `Defining ${displayWorldName}`;
    if (worldDetail) worldDetail.textContent = isFrench
        ? `Établissement de ses règles, de son atmosphère, de ses factions et de ses dangers dans un style ${visualStyle}.`
        : `Establishing its rules, atmosphere, factions, and immediate dangers in a ${visualStyle} visual language.`;
    if (castLabel) castLabel.textContent = isFrench ? 'Donner une volonté à l’équipe' : 'Giving the Party a will of its own';
    if (castDetail) castDetail.textContent = castNames.length
        ? (isFrench
            ? `${castNames.join(', ')} reçoivent leurs souvenirs, besoins, peurs, loyautés et objectifs privés.`
            : `${castNames.join(', ')} are receiving memories, needs, fears, loyalties, and private goals.`)
        : (isFrench
            ? 'Création du Joueur et de compagnons autonomes avec leurs propres désirs et contradictions.'
            : 'Creating the Player and autonomous companions with desires and contradictions of their own.');
    if (storyLabel) storyLabel.textContent = isFrench ? `Mise en mouvement de « ${storyTitle} »` : `Setting “${storyTitle}” in motion`;
    if (storyDetail) storyDetail.textContent = isFrench
        ? 'Préparation d’une crise déjà active, de besoins immédiats et d’une première voix qui entraînera le Joueur dans l’histoire.'
        : 'Preparing an active crisis, immediate needs, and the first voice that will pull the Player into the story.';
    if (sceneLabel) sceneLabel.textContent = isFrench ? 'Composition de la scène d’ouverture' : 'Composing the opening scene';
    if (sceneDetail) sceneDetail.textContent = castNames.length
        ? (isFrench
            ? `Mise en scène ${visualStyle} de ${castNames.join(', ')} à partir de leurs portraits de référence canoniques.`
            : `Staging a ${visualStyle} scene around ${castNames.join(', ')}, using their canonical reference portraits.`)
        : (isFrench
            ? `Composition d’une scène ${visualStyle} cohérente avec la nouvelle réalité et ses personnages.`
            : `Composing a ${visualStyle} opening image consistent with the new reality and its characters.`);

    const statusMessages = isFrench ? [
        'Écriture des lois, des tensions et des conséquences de ce monde...',
        'Définition de ce que chaque compagnon veut — et de ce qu’il refuse de perdre...',
        'Recherche du moment précis où cette histoire a besoin du Joueur...'
    ] : [
        'Writing the laws, tensions, and consequences of this world...',
        'Defining what every companion wants—and what they refuse to lose...',
        'Finding the precise moment when this story needs the Player...'
    ];
    let messageIndex = 0;
    setConstructionStep(0, statusMessages[0]);
    constructionStatusTimer = setInterval(() => {
        messageIndex = (messageIndex + 1) % statusMessages.length;
        const status = document.getElementById('construction-status');
        if (status && constructionStep < 3) status.textContent = statusMessages[messageIndex];
    }, 2800);
    constructionStageTimers = [
        setTimeout(() => setConstructionStep(1, statusMessages[1]), 2400),
        setTimeout(() => setConstructionStep(2, statusMessages[2]), 5200)
    ];
}

function finishWorldConstruction() {
    clearConstructionTimers();
    const isFrench = gameState.language === 'fr';
    setConstructionStep(4, isFrench ? 'Réalité stabilisée. L’histoire commence.' : 'Reality stabilized. The story begins.');
    document.body.classList.remove('is-constructing-world');
    document.getElementById('world-construction')?.classList.add('hidden');
}

function failWorldConstruction(message) {
    clearConstructionTimers();
    const isFrench = gameState.language === 'fr';
    const overlay = document.getElementById('world-construction');
    const heading = document.getElementById('construction-heading');
    const status = document.getElementById('construction-status');
    const live = overlay?.querySelector('.construction-live');
    if (overlay) overlay.classList.add('is-error');
    if (heading) heading.textContent = isFrench ? 'La réalité ne s’est pas stabilisée.' : 'Reality failed to stabilize.';
    if (status) status.textContent = message || (isFrench ? 'La construction peut être relancée depuis les archives.' : 'Construction can be attempted again from the world archive.');
    if (live) live.classList.add('is-error');
    document.getElementById('construction-return')?.classList.remove('hidden');
}

function renderCurrentStorySituation() {
    const panel = document.getElementById('current-story-panel');
    const title = document.getElementById('current-story-title');
    const text = document.getElementById('current-story-text');
    if (!panel || !title || !text) return;
    const situation = String(gameState.currentStorySituation || '').trim();
    if (!gameState.player || !situation) {
        panel.classList.add('hidden');
        return;
    }
    title.textContent = gameState.storyTitle || (gameState.language === 'fr' ? 'Situation actuelle' : 'Current Situation');
    text.textContent = situation;
    panel.querySelector('div').textContent = gameState.language === 'fr' ? 'Histoire en cours' : 'Current Story';
    panel.classList.remove('hidden');
}

function openingStoryHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\n/g, '<br>');
}

function introduceOpeningStory(generatedOpening, t) {
    const opening = gameState.openingStory || generatedOpening || {};
    const start = t.startNarrative
        .replace('{name}', gameState.player.name)
        .replace('{location}', gameState.currentLocation);
    const narrative = String(opening.narrative || `${gameState.briefing || ''} ${opening.situation || ''}`).trim();
    const speaker = gameState.party.find(member => member.name === opening.speakerName) || gameState.party[0];
    const dialogue = String(opening.dialogue || (speaker
        ? `We need to understand what is happening here before it chooses for us. I want us to decide what we stand for. What do we do first?`
        : '')).trim();

    gameState.storyTitle = opening.title || gameState.storyTitle || (gameState.language === 'fr' ? 'Le premier enjeu' : 'The First Turning Point');
    gameState.currentStorySituation = String(opening.situation || narrative || start).trim();
    storySoFar = [start, narrative, speaker && dialogue ? `${speaker.name}: ${dialogue}` : ''].filter(Boolean).join('\n\n');

    const narrativeEl = document.getElementById('narrative');
    if (narrativeEl) {
        narrativeEl.innerHTML = `<div>
            <p class="mb-3">${openingStoryHtml(`${start}\n\n${narrative}`)}</p>
            ${speaker && dialogue ? `<div class="border-l-2 border-yellow-500 pl-3 py-2 bg-yellow-950/30 rounded-r"><div class="text-xs font-bold uppercase tracking-wider text-yellow-300 mb-1">${openingStoryHtml(speaker.name)}</div><p class="text-gray-100">${openingStoryHtml(dialogue)}</p></div>` : ''}
        </div>`;
    }
    recordDiscussionMessage({ speakerId: 'narrator', name: gameState.language === 'fr' ? 'Narrateur' : 'Narrator', text: narrative || start, mode: 'narration' });
    if (speaker && dialogue) {
        noteAutomaticPartySpeaker(speaker.id);
        recordDiscussionMessage({ speakerId: speaker.id, name: speaker.name, text: dialogue, mode: 'party' });
    }
    renderCurrentStorySituation();
}

function ensureGameStateShape() {
    if (!gameState || typeof gameState !== 'object') gameState = { language: storedLang };
    applyWorldPreset(gameState.worldConcept || gameState.theme, false);
    if (gameState.player) gameState.player = normalizeUnit(gameState.player, 0, true);
    if (!Array.isArray(gameState.party)) gameState.party = [];
    gameState.party = gameState.party.map((member, index) => normalizeUnit(member, index, false));
    if (!gameState.discussion || typeof gameState.discussion !== 'object') {
        gameState.discussion = { messages: [], awaitingPlayer: true };
    }
    if (!Array.isArray(gameState.discussion.messages)) gameState.discussion.messages = [];
    if (!Array.isArray(gameState.discussion.autoSpeakerHistory)) {
        const partyIds = new Set(gameState.party.map(member => member.id));
        gameState.discussion.autoSpeakerHistory = gameState.discussion.messages
            .filter(message => partyIds.has(message?.speakerId) && ['party', 'continue', 'interrupt'].includes(message?.mode))
            .map(message => message.speakerId)
            .slice(-24);
    }
    gameState.discussion.awaitingPlayer = gameState.discussion.awaitingPlayer !== false;
    gameState.turnCounter = Number.isFinite(Number(gameState.turnCounter)) ? Number(gameState.turnCounter) : 0;
    if (!gameState.privateChats || typeof gameState.privateChats !== 'object' || Array.isArray(gameState.privateChats)) {
        gameState.privateChats = {};
    }
    if (typeof gameState.partyVerbose !== 'boolean') gameState.partyVerbose = partyVerbosePreference;
}

function discussionMessages() {
    ensureGameStateShape();
    return gameState.discussion.messages;
}

function noteAutomaticPartySpeaker(speakerId) {
    ensureGameStateShape();
    if (!speakerId) return;
    gameState.discussion.autoSpeakerHistory.push(speakerId);
    if (gameState.discussion.autoSpeakerHistory.length > 24) {
        gameState.discussion.autoSpeakerHistory.splice(0, gameState.discussion.autoSpeakerHistory.length - 24);
    }
}

function automaticSpeakerPreference(excludedIds = []) {
    ensureGameStateShape();
    const excluded = new Set(excludedIds);
    const history = gameState.discussion.autoSpeakerHistory;
    const eligible = gameState.party.filter(member =>
        member?.id && !excluded.has(member.id) && !['separated', 'departed'].includes(member.presence)
    );
    eligible.sort((left, right) => history.lastIndexOf(left.id) - history.lastIndexOf(right.id));
    return {
        preferredSpeakerId: eligible[0]?.id || '',
        lastAutomaticSpeakerId: history.at(-1) || ''
    };
}

function recordDiscussionMessage(message) {
    const messages = discussionMessages();
    messages.push({ ...message, timestamp: Date.now() });
    if (messages.length > 80) messages.splice(0, messages.length - 80);
    autoSave();
}

let dialogueQueue = [];
let dialoguePlaying = false;
let dialogueRunId = 0;

function ensureVoicesContainer() {
    if (!gameState.voices) gameState.voices = {};
    return gameState.voices;
}

function* walkAllNpcs() {
    const seen = new Set();
    for (const m of (gameState.party || [])) {
        if (m?.name && !seen.has(m.name)) { seen.add(m.name); yield m; }
    }
    function* walkLocs(locs) {
        for (const loc of (locs || [])) {
            for (const n of (loc.npcs || [])) {
                if (n?.name && !seen.has(n.name)) { seen.add(n.name); yield n; }
            }
            yield* walkLocs(loc.children);
        }
    }
    yield* walkLocs(gameState.knownLocations);
}

async function ensureVoiceFor(npc) {
    if (!npc?.voiceDescription) return;
    const voices = ensureVoicesContainer();
    const entry = voices[npc.name];
    if (entry && (entry.status === 'ready' || entry.status === 'creating')) return;
    voices[npc.name] = { description: npc.voiceDescription, voiceId: null, status: 'creating' };
    try {
        const res = await fetch('/api/voice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voiceDescription: npc.voiceDescription, voiceName: npc.name })
        });
        const body = await res.json();
        if (!res.ok) {
            throw new Error(`voice api ${res.status}: ${body.error || JSON.stringify(body)}`);
        }
        
        const voiceId = body.voiceId || body.voice_id;
        if (!voiceId) {
            console.error("DEBUG: Voice API response:", body);
            throw new Error('no voiceId returned');
        }
        
        voices[npc.name] = { description: npc.voiceDescription, voiceId, status: 'ready' };
        autoSave();
    } catch (e) {
        console.error(`Voice creation failed for ${npc.name}:`, e);
        voices[npc.name] = { description: npc.voiceDescription, voiceId: null, status: 'error' };
    }
}

function processNewNpcs() {
    for (const npc of walkAllNpcs()) ensureVoiceFor(npc);
}

function cancelDialogue() {
    dialogueRunId++;
    dialogueQueue.forEach(u => { try { URL.revokeObjectURL(u.url); } catch (_) {} });
    dialogueQueue = [];
    dialoguePlaying = false;
    const audio = document.getElementById('dialogue-audio');
    if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
    }
}

function playNextDialogue() {
    const audio = document.getElementById('dialogue-audio');
    if (!audio) return;
    const next = dialogueQueue.shift();
    if (!next) { dialoguePlaying = false; return; }
    dialoguePlaying = true;
    audio.src = next.url;
    audio.onended = () => {
        URL.revokeObjectURL(next.url);
        playNextDialogue();
    };
    audio.play().catch(e => {
        console.warn('Dialogue autoplay blocked:', e);
        URL.revokeObjectURL(next.url);
        playNextDialogue();
    });
}

async function processNarrativeDialogue(narrative) {
    if (!soundSettings.dialogue || !narrative) return;
    cancelDialogue();
    const runId = ++dialogueRunId;

    const voices = ensureVoicesContainer();
    const readyNpcs = [];
    for (const npc of walkAllNpcs()) {
        const v = voices[npc.name];
        if (v?.status === 'ready' && v.voiceId) {
            readyNpcs.push({ name: npc.name, voiceDescription: npc.voiceDescription });
        }
    }
    if (!readyNpcs.length) return;

    let utterances = [];
    try {
        const res = await fetch('/api/dialogue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ narrative, npcs: readyNpcs, language: gameState.language })
        });
        if (!res.ok) throw new Error(`dialogue api ${res.status}`);
        const data = await res.json();
        utterances = data.utterances || [];
    } catch (e) {
        console.error('Dialogue extraction failed:', e);
        return;
    }

    if (runId !== dialogueRunId) return;

    for (const utt of utterances) {
        if (runId !== dialogueRunId) return;
        const v = voices[utt.name];
        if (!v?.voiceId || !utt.text) continue;
        try {
            const res = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voiceId: v.voiceId, text: utt.text })
            });
            if (!res.ok) throw new Error(`tts api ${res.status}`);
            const blob = await res.blob();
            if (runId !== dialogueRunId) return;
            const url = URL.createObjectURL(blob);
            dialogueQueue.push({ url, name: utt.name });
            if (!dialoguePlaying) playNextDialogue();
        } catch (e) {
            console.error(`TTS failed for ${utt.name}:`, e);
        }
    }
}

// Updates the key badge (there is no balance: RPGy is free, the player's own Gemini key pays Google).
function updateActionsRemaining(n, creditSource = '') {
    const el = document.getElementById('actions-remaining');
    if (!el || typeof n !== 'number') return;
    if (creditSource) {
        creditState.shared = creditSource === 'share';
        if (creditSource === 'license' && n > 0) creditState.licenseValid = true;
        if (creditSource === 'share') creditState.licenseValid = n > 0;
    }
    creditState.remaining = n;
    if (creditState.shared && n <= 0) creditState.licenseValid = false;
    el.textContent = creditState.byok ? 'GEMINI KEY ACTIVE' : 'GEMINI KEY NEEDED';
    el.classList.toggle('hidden', false);
    el.classList.toggle('is-locked', !creditState.byok);
    renderLicenseWallet();
}

function renderLicenseWallet() {
    const btn = document.getElementById('btn-license');
    const landingBadge = document.getElementById('landing-byok-badge');
    const byokInput = document.getElementById('byok-gemini-input');
    const byokRemember = document.getElementById('byok-remember');
    const byokStatus = document.getElementById('byok-status');
    const badgeText = creditState.byok ? 'GEMINI KEY ACTIVE' : 'UNLOCK WITH YOUR GEMINI API KEY';
    if (btn) {
        btn.textContent = badgeText;
        btn.classList.toggle('is-active', creditState.byok);
    }
    if (landingBadge) {
        landingBadge.textContent = badgeText;
        landingBadge.classList.toggle('is-active', creditState.byok);
    }
    if (byokInput) byokInput.value = '';
    if (byokRemember) byokRemember.checked = activeGeminiByokKey
        ? localStorage.getItem(RPGY_GEMINI_BYOK_STORAGE) === activeGeminiByokKey
        : true;
    if (byokStatus) byokStatus.textContent = activeGeminiByokKey ? 'BYOK active: Gemini requests run directly from this browser.' : '';
}

function applyCreditPayload(data) {
    if (!data || typeof data !== 'object') return;
    creditState = {
        ...creditState,
        billingEnabled: typeof data.billingEnabled === 'boolean' ? data.billingEnabled : creditState.billingEnabled,
        licenseStatus: data.licenseStatus || data.error || creditState.licenseStatus,
        // `/api/quota` explicitly tells us whether this stored key is valid.
        // Do not infer validity merely from a numeric zero balance: an exhausted
        // key is authenticated but must present the UNLOCK purchase flow.
        licenseValid: typeof data.licenseValid === 'boolean'
            ? data.licenseValid
            : (data.billingEnabled === true && !data.error && typeof data.actionsRemaining === 'number'
                ? true
                : creditState.licenseValid),
        remaining: typeof data.actionsRemaining === 'number' ? data.actionsRemaining : creditState.remaining,
        limit: typeof data.limit === 'number' ? data.limit : creditState.limit,
        checkoutUrl: data.checkoutUrl || creditState.checkoutUrl,
        shared: data.creditSource
            ? data.creditSource === 'share'
            : (typeof data.sharedCredits === 'boolean' ? data.sharedCredits : creditState.shared)
    };
    if (data.byok === true) creditState.byok = true;
    updateActionsRemaining(typeof creditState.remaining === 'number' ? creditState.remaining : 0);
}

async function refreshCreditStatus() {
    const headers = new Headers();
    if (activeShareId) headers.set('X-RPGY-Share-ID', activeShareId);
    const response = await rpgyNativeFetch(`/api/quota?wallet_check=${Date.now()}`, { headers, cache: 'no-store' });
    const data = await response.json();
    applyCreditPayload(data);
    return data;
}

function showLicenseModal(message = '') {
    const status = document.getElementById('license-status');
    if (status) status.textContent = message || 'Unlock RPGy with your own Gemini API Key to continue.';
    renderLicenseWallet();
    document.getElementById('license-modal')?.classList.remove('hidden');
    setTimeout(() => document.getElementById('byok-gemini-input')?.focus(), 0);
}

function requireGeminiByok(message = '') {
    if (activeGeminiByokKey) return true;
    showLicenseModal(message || 'This requires your own Gemini API Key.');
    return false;
}

function activateByokGeminiKey() {
    const input = document.getElementById('byok-gemini-input');
    const remember = document.getElementById('byok-remember')?.checked === true;
    const status = document.getElementById('byok-status');
    const candidate = String(input?.value || '').trim();
    if (candidate.length < 20) {
        if (status) status.textContent = 'Enter a valid Gemini API key.';
        return;
    }
    activeGeminiByokKey = candidate;
    creditState.byok = true;
    if (remember) localStorage.setItem(RPGY_GEMINI_BYOK_STORAGE, candidate);
    else localStorage.removeItem(RPGY_GEMINI_BYOK_STORAGE);
    if (input) input.value = '';
    if (status) status.textContent = 'BYOK active. Text and images go directly from this browser to Gemini; RPGy never receives the key.';
    updateActionsRemaining(creditState.remaining ?? 0);
    setTimeout(() => document.getElementById('license-modal')?.classList.add('hidden'), 450);
}

const translations = {
    en: {
        newWorld: "NEW WORLD",
        save: "SAVE",
        load: "LOAD",
        share: "COPY SHARE LINK",
        constructorHeader: "World Constructor",
        constructorDesc: "Describe the experience once, let the Director draft its architecture, then refine every detail before reality is built.",
        createWorld: "CREATE WORLD",
        wizardPlaceholder: "Enter world concept...",
        sectors: "Known Sectors",
        map: "Local Map",
        initializing: "Initializing...",
        constructing: "Constructing reality...",
        inputPlaceholder: "Enter command or action...",
        welcome: "Welcome, Stranger. The city awaits your input.",
        hpLabel: "HP",
        quests: "Quests",
        inventory: "Inventory",
        party: "Party",
        startNarrative: "You are {name}, starting your journey in {location}."
    },
    fr: {
        newWorld: "NOUVEAU MONDE",
        save: "SAUVEGARDER",
        load: "CHARGER",
        share: "COPIER LE LIEN",
        constructorHeader: "Constructeur de Monde",
        constructorDesc: "Décrivez votre monde et votre personnage pour commencer un nouveau voyage.",
        createWorld: "CRÃ‰ER LE MONDE",
        wizardPlaceholder: "Entrez le concept du monde...",
        sectors: "Secteurs Connus",
        map: "Carte Locale",
        initializing: "Initialisation...",
        constructing: "Construction de la réalité...",
        inputPlaceholder: "Entrez une commande ou action...",
        welcome: "Bienvenue, Étranger. La ville attend votre entrée.",
        hpLabel: "PV",
        quests: "Quêtes",
        inventory: "Inventaire",
        party: "Équipe",
        startNarrative: "Vous êtes {name}, et commencez votre voyage dans {location}."
    }
};

function updateUILabels() {
    const t = translations[gameState.language];
    console.log("DEBUG: Updating UI to language:", gameState.language, "with translations:", t);
    
    const elements = {
        'btn-new-world': 'newWorld',
        'btn-save': 'save',
        'btn-load': 'load',
        'btn-share': 'share',
        'hp-label': 'hpLabel',
        'input': 'inputPlaceholder',
        'wizard-input': 'wizardPlaceholder'
    };

    for (const [id, key] of Object.entries(elements)) {
        const el = document.getElementById(id);
        if (el) {
            if (id.includes('input') || id.includes('wizard')) el.placeholder = t[key];
            else el.innerText = t[key];
        }
    }

    const constructorHeader = document.querySelector('#constructor-view h2');
    if (constructorHeader) constructorHeader.innerText = t.constructorHeader;
    const constructorDesc = document.querySelector('#constructor-view p');
    if (constructorDesc) constructorDesc.innerText = t.constructorDesc;
    const createWorldLabel = document.querySelector('#btn-enter span');
    if (createWorldLabel) createWorldLabel.innerText = t.createWorld;
    
    const headers = document.querySelectorAll('.sidebar-header');
    if (headers.length >= 2) {
        headers[0].innerText = t.sectors;
        headers[1].innerText = t.map;
    }
    
    const mapTitle = document.getElementById('map-title');
    if (mapTitle) mapTitle.innerText = gameState.currentLocation || "";
    
    const actionBarBtns = document.querySelectorAll('#action-bar button');
    if (actionBarBtns.length >= 3) {
        actionBarBtns[0].innerText = t.quests;
        actionBarBtns[1].innerText = t.inventory;
        actionBarBtns[2].innerText = t.party;
    }

    const questsModalHeader = document.querySelector('#quests-modal h2');
    if (questsModalHeader) questsModalHeader.innerText = t.quests;

    const inventoryModalHeader = document.querySelector('#inventory-modal h2');
    if (inventoryModalHeader) inventoryModalHeader.innerText = t.inventory;

    const partyModalHeader = document.getElementById('party-modal-title');
    if (partyModalHeader && !selectedUnitProfile) partyModalHeader.innerText = gameState.language === 'fr' ? 'Joueur & \u00c9quipe' : 'Player & Party';
    const partyHelp = document.getElementById('party-help');
    if (partyHelp) partyHelp.innerText = gameState.language === 'fr'
        ? 'Chaque unit\u00e9 a sa propre identit\u00e9. Les changements sont sauvegard\u00e9s localement et inclus dans SAUVEGARDER.'
        : 'Every unit has an independent identity. Changes save locally and are included in SAVE.';
    const questLogTitle = document.getElementById('quest-log-title');
    if (questLogTitle) questLogTitle.innerText = gameState.language === 'fr' ? 'JOURNAL DE QUÊTES' : 'QUEST LOG';
    const takeTurn = document.getElementById('take-turn-btn');
    if (takeTurn) takeTurn.innerText = gameState.language === 'fr' ? '\u270b PRENDRE LA PAROLE' : '\u270b TAKE MY TURN';
    const discussionStatus = document.getElementById('discussion-status');
    if (discussionStatus && !partyDiscussionActive) discussionStatus.innerText = gameState.language === 'fr' ? '\u00c0 vous de jouer' : 'Your move';
    const presenceLabel = document.getElementById('landing-presence-label');
    if (presenceLabel) presenceLabel.innerText = gameState.language === 'fr' ? 'JOUEURS ACTIFS :' : 'CURRENTLY PLAYING:';
    
    console.log("DEBUG: UI labels updated.");
}

window.setLanguage = function(lang) {
    gameState.language = lang;
    localStorage.setItem('noderpg_lang', lang);
    updateLanguageUI();
    updateUILabels();
    renderVisibleRoster();
    const partyModal = document.getElementById('party-modal');
    if (partyModal && !partyModal.classList.contains('hidden')) populateModal('party-modal');
    const companionChatModal = document.getElementById('companion-chat-modal');
    if (companionChatModal && !companionChatModal.classList.contains('hidden')) renderCompanionChatModal();
    const shareModal = document.getElementById('share-modal');
    if (shareModal && !shareModal.classList.contains('hidden')) updateShareModalLanguage();
}

function updateLanguageUI() {
    const enBtn = document.getElementById('lang-en');
    const frBtn = document.getElementById('lang-fr');
    if (enBtn) enBtn.classList.toggle('lang-active', gameState.language === 'en');
    if (frBtn) frBtn.classList.toggle('lang-active', gameState.language === 'fr');
}

window.addEventListener('DOMContentLoaded', async () => {
    // 1. Language Initialization: URL param -> localStorage -> Default 'en'
    const urlParams = new URLSearchParams(window.location.search);
    const langParam = urlParams.get('lang');
    if (langParam === 'en' || langParam === 'fr') {
        gameState.language = langParam;
        localStorage.setItem('noderpg_lang', langParam);
    } else {
        gameState.language = localStorage.getItem('noderpg_lang') || 'en';
    }

    updateLanguageUI();
    updateUILabels();

    // A share URL always wins over this browser's private autosave. The remote
    // object is immutable; loading it creates an ordinary local continuation.
    let sharedSnapshotLoaded = false;
    const shareId = String(urlParams.get('share') || '').trim();
    activeShareId = shareId;
    if (shareId) {
        try {
            const response = await fetch(`/api/init?operation=share&id=${encodeURIComponent(shareId)}`, { cache: 'force-cache' });
            const envelope = await response.json().catch(() => ({}));
            if (!response.ok || !envelope.save) throw new Error(envelope.error || 'Shared game not found.');
            restoreSaveSnapshot(envelope.save, { shared: true });
            sharedSnapshotLoaded = true;
        } catch (error) {
            console.error('Shared game load failed:', error);
            const worldBrowser = document.getElementById('world-browser');
            if (worldBrowser) worldBrowser.classList.remove('hidden');
        }
    }

    // Bring-your-own-key: nothing to look up, just show the key badge.
    updateActionsRemaining(0);

    // 2. Kick off the world grid render immediately so first-launch users see populated cards ASAP.
    //    #world-browser is visible by default in HTML — we only hide it when a save resumes below.
    renderWorldBrowser();

    // 3. Auto-resume game if save exists, otherwise stay on the NEW WORLD page (already visible).
    const savedGame = localStorage.getItem('noderpg_save');
    if (savedGame && !sharedSnapshotLoaded) {
        try {
            const data = JSON.parse(savedGame);
            gameState = data.gameState || { language: 'en' };
            if (!gameState.language) gameState.language = 'en';
            storySoFar = data.storySoFar || '';
            ensureGameStateShape();
            restoreMissingCustomPortraits();
            gameState.discussion.awaitingPlayer = true;

            document.getElementById('world-browser').classList.add('hidden');
            document.getElementById('constructor-view').classList.add('hidden');
            document.getElementById('narrative').innerHTML = '';
            appendToNarrative(`<p class="mb-2">${parseMarkdown(storySoFar)}</p>`);

            updateUI();
            const mapTitle = document.getElementById('map-title');
            if (mapTitle) mapTitle.innerText = gameState.currentLocation;
            if (gameState.sceneImage && !savedSceneNeedsSanitization()) {
                displaySceneImage(gameState.sceneImage);
            }
            void repairMissingUnitPortraits().then(() => refreshUnsafeSavedScene());
            void refreshZombieLondonReferenceSceneIfStale();
            updateSidebar();
            updateUILabels();
            if (gameState.musicPrompt && soundSettings.music) {
                fetchWorldMusic(gameState.musicPrompt);
            }
            processNewNpcs();
        } catch (e) {
            console.error("Failed to parse saved game:", e);
            // Parse failed — leave world-browser visible (already is) so user can pick a new world.
        }
    }
    
    // Sound toggles
    const musicToggle = document.getElementById('toggle-music');
    const dialogueToggle = document.getElementById('toggle-dialogue');
    const downloadBtn = document.getElementById('btn-download-music');
    if (musicToggle) {
        musicToggle.checked = soundSettings.music;
        musicToggle.addEventListener('change', (e) => {
            soundSettings.music = e.target.checked;
            localStorage.setItem('noderpg_music', e.target.checked ? '1' : '0');
            if (e.target.checked) {
                if (musicState.blobUrl) playLoadedMusic();
                else if (gameState.musicPrompt) handleMusicPrompt(gameState.musicPrompt);
            } else {
                stopMusic();
            }
        });
    }
    if (dialogueToggle) {
        dialogueToggle.checked = soundSettings.dialogue;
        dialogueToggle.addEventListener('change', (e) => {
            soundSettings.dialogue = e.target.checked;
            localStorage.setItem('noderpg_dialogue', e.target.checked ? '1' : '0');
            if (!e.target.checked) cancelDialogue();
        });
    }
    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadMusic);
    }

    const partyContent = document.getElementById('party-content');
    if (partyContent) {
        partyContent.addEventListener('change', event => {
            const field = event.target.closest('[data-unit-field]');
            if (!field) return;
            const unit = getEditableUnit(field.dataset.unitKind, field.dataset.unitIndex);
            if (!unit) return;
            unit[field.dataset.unitField] = ['hp', 'maxHp'].includes(field.dataset.unitField)
                ? (Number.isFinite(Number(field.value)) ? Number(field.value) : unit[field.dataset.unitField])
                : field.value;
            autoSave();
            updateUI();
        });
        partyContent.addEventListener('click', event => {
            const button = event.target.closest('[data-unit-action="regenerate-portrait"]');
            if (button) regenerateUnitPortrait(button);
        });
    }

    const survivorRoster = document.getElementById('survivor-roster-list');
    if (survivorRoster) {
        survivorRoster.addEventListener('click', event => {
            const reactionButton = event.target.closest('[data-party-reaction]');
            if (reactionButton) {
                if (!requireGeminiByok('Party reactions require your own Gemini API Key.')) return;
                pingPartyReaction(reactionButton.dataset.unitIndex);
                return;
            }
            const chatButton = event.target.closest('[data-party-chat]');
            if (chatButton) {
                if (!requireGeminiByok('Party chat requires your own Gemini API Key.')) return;
                openCompanionChat(chatButton.dataset.unitIndex);
                return;
            }
            const card = event.target.closest('[data-roster-unit]');
            if (!card) return;
            openUnitProfile(card.dataset.unitKind, card.dataset.unitIndex);
        });
    }

    const companionChatForm = document.getElementById('companion-chat-form');
    if (companionChatForm) companionChatForm.addEventListener('submit', sendCompanionChatMessage);

    const takeTurnBtn = document.getElementById('take-turn-btn');
    if (takeTurnBtn) takeTurnBtn.addEventListener('click', () => interruptPartyDiscussion(true));

    // Setup Listeners
    const btnSave = document.getElementById('btn-save');
    if (btnSave) btnSave.addEventListener('click', saveGame);

    const btnShare = document.getElementById('btn-share');
    if (btnShare) btnShare.addEventListener('click', copyShareLink);
    document.getElementById('share-copy-button')?.addEventListener('click', publishShareLink);
    document.getElementById('share-url-output')?.addEventListener('click', event => event.currentTarget.select());
    
    const btnLoad = document.getElementById('btn-load');
    if (btnLoad) {
        btnLoad.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.onchange = loadGame;
            input.click();
        });
    }

    document.getElementById('btn-license')?.addEventListener('click', () => showLicenseModal());
    document.getElementById('landing-byok-badge')?.addEventListener('click', () => showLicenseModal());
    document.getElementById('byok-activate')?.addEventListener('click', activateByokGeminiKey);
    document.getElementById('byok-gemini-input')?.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        activateByokGeminiKey();
    });
    document.getElementById('byok-clear')?.addEventListener('click', () => {
        activeGeminiByokKey = '';
        creditState.byok = false;
        localStorage.removeItem(RPGY_GEMINI_BYOK_STORAGE);
        updateActionsRemaining(creditState.remaining ?? 0);
        const status = document.getElementById('byok-status');
        if (status) status.textContent = 'BYOK key cleared from this browser.';
    });

    restoreWorldConstructorDraft();
    startRpgPresenceCounter();
});

function _dangerBar(level) {
    const filled = Math.round(level / 2);
    const color = level >= 8 ? 'bg-red-500' : level >= 5 ? 'bg-yellow-500' : 'bg-green-500';
    return Array.from({ length: 5 }, (_, i) =>
        `<div class="h-1 flex-1 rounded-sm ${i < filled ? color : 'bg-gray-700'}"></div>`
    ).join('');
}

function _buildWorldCard(world, id, meta) {
    const attr = s => String(s).replace(/"/g, '&quot;');
    const en = world.en || world; const fr = world.fr || world;
    const genre = meta.genre || '';
    const mood = meta.aesthetics?.mood || '';
    const danger = meta.dangerosity ?? null;
    const tags = (meta.tags || []).slice(0, 3);
    const visualStyle = window.PresetRosters?.styleFor(id) || 'photorealistic';
    const styleTag = visualStyle === 'cartoon'
        ? '<span class="text-xs bg-blue-900 text-blue-200 px-1 rounded">CARTOON</span>'
        : '<span class="text-xs bg-red-900 text-red-200 px-1 rounded">PHOTOREALISTIC</span>';
    const dColor = danger >= 8 ? 'text-red-400' : danger >= 5 ? 'text-yellow-400' : 'text-green-400';
    return `<div class="overlay-box p-3 rounded hover:border-blue-500 cursor-pointer flex flex-col gap-1"
  data-concept="${attr(en.title)}" data-world-id="${id}" data-title-en="${attr(en.title)}" data-title-fr="${attr(fr.title)}"
  data-desc-en="${attr(en.desc)}" data-desc-fr="${attr(fr.desc)}">
  <div class="h-32 mb-1 rounded overflow-hidden bg-gray-800 flex items-center justify-center relative">
    <img src="/world/${id}.png" alt="${attr(en.title)}" class="w-full h-full object-cover"
         onerror="this.parentElement.innerHTML='<span class=&quot;text-xs text-gray-500&quot;>${id}</span>'">
    ${genre ? `<span class="absolute top-1 left-1 text-xs bg-black bg-opacity-70 text-blue-300 px-1 rounded">${genre}</span>` : ''}
  </div>
  <h3 class="font-bold text-sm leading-tight"></h3>
  <p class="text-xs text-gray-400 leading-tight"></p>
  ${danger !== null ? `<div>
    <div class="flex justify-between text-xs text-gray-500"><span>${mood}</span><span class="${dColor}">⚠ ${danger}/10</span></div>
    <div class="flex gap-0.5 mt-1">${_dangerBar(danger)}</div>
  </div>` : ''}
  <div class="flex flex-wrap gap-1 mt-1">${styleTag}${tags.map(t => `<span class="text-xs bg-gray-800 text-gray-400 px-1 rounded">${t}</span>`).join('')}</div>
</div>`;
}

function _buildCustomCard() {
    const bar = Array.from({ length: 5 }, () => `<div class="h-1 flex-1 rounded-sm bg-blue-700"></div>`).join('');
    return `<div class="overlay-box p-3 rounded hover:border-blue-500 cursor-pointer flex flex-col gap-1 border-2 border-dashed border-blue-700"
  data-custom="true" data-title-en="CUSTOM" data-title-fr="PERSONNALISÉ">
  <div class="h-32 mb-1 rounded bg-gray-900 flex items-center justify-center"><span class="text-4xl text-blue-500">✦</span></div>
  <h3 class="font-bold text-sm text-blue-400"></h3>
  <div><div class="flex justify-between text-xs text-gray-500"><span>limitless</span><span class="text-blue-400">∞</span></div>
  <div class="flex gap-0.5 mt-1">${bar}</div></div>
  <div class="flex flex-wrap gap-1 mt-1">${['custom','any genre','your rules'].map(t => `<span class="text-xs bg-gray-800 text-gray-400 px-1 rounded">${t}</span>`).join('')}</div>
</div>`;
}

function _buildArchivedCustomWorldCard(world) {
    const title = escapeUnitHtml(world.title || 'Untitled Custom World');
    const genre = escapeUnitHtml(world.genre || 'Custom RPG');
    const premise = escapeUnitHtml(world.premise || 'A world of your own design.');
    const styleTag = world.visualStyle === 'cartoon'
        ? '<span class="text-xs bg-blue-900 text-blue-200 px-1 rounded">CARTOON</span>'
        : '<span class="text-xs bg-red-900 text-red-200 px-1 rounded">PHOTOREALISTIC</span>';
    const hero = String(world.heroBanner || '').startsWith('data:image/')
        ? `<img src="${world.heroBanner}" alt="${title}" class="w-full h-full object-cover">`
        : '<div class="w-full h-full bg-gradient-to-br from-blue-950 via-slate-900 to-cyan-950"></div>';
    return `<div class="overlay-box rpg-custom-world-card p-3 rounded hover:border-blue-500 cursor-pointer flex flex-col gap-1" data-saved-custom-world="${escapeUnitHtml(world.id)}">
        <div class="h-32 mb-1 rounded overflow-hidden bg-gray-800 flex items-center justify-center relative">${hero}<span class="absolute bottom-1 left-1 text-xs bg-black bg-opacity-70 text-blue-200 px-1 rounded">${genre}</span></div>
        <h3 class="font-bold text-sm leading-tight">${title}</h3>
        <p class="text-xs text-gray-400 leading-tight">${premise}</p>
        <div class="flex flex-wrap gap-1 mt-1">${styleTag}<span class="text-xs bg-gray-800 text-gray-400 px-1 rounded">editable</span><span class="text-xs bg-gray-800 text-gray-400 px-1 rounded">2 companions</span></div>
    </div>`;
}

async function _buildWorldBrowserHTML() {
    // 1. Try the pre-built cache file (fastest)
    try {
        const res = await fetch('/worlds_finale.html');
        if (res.ok) {
            const text = await res.text();
            if (text.includes('data-concept')) return text;
        }
    } catch (_) {}

    // 2. Fallback: generate from worldThemes + worlds.json
    let metas = [];
    try {
        const r = await fetch('/worlds.json');
        if (r.ok) metas = await r.json();
    } catch (_) {}

    const cards = worldThemes.map((world, i) => {
        const meta = metas.find(m => m.id === i + 1) || {};
        return _buildWorldCard(world, i + 1, meta);
    }).join('\n');

    return cards + '\n' + _buildCustomCard();
}

async function renderWorldBrowser() {
    const grid = document.getElementById('world-grid');
    if (!grid) return;

    if (!worldsBrowserHTML) {
        worldsBrowserHTML = await _buildWorldBrowserHTML();
    }

    grid.innerHTML = worldsBrowserHTML;

    const archivedWorlds = customWorldArchive();
    const createCard = grid.querySelector('[data-custom]');
    if (createCard && archivedWorlds.length) {
        createCard.insertAdjacentHTML('beforebegin', archivedWorlds.map(_buildArchivedCustomWorldCard).join(''));
    }

    const langKey = gameState.language === 'fr' ? 'Fr' : 'En';
    grid.querySelectorAll('[data-title-en]').forEach(card => {
        const h3 = card.querySelector('h3');
        const p  = card.querySelector('p');
        if (h3) h3.textContent = card.dataset['title' + langKey];
        if (p)  p.textContent  = card.dataset['desc'  + langKey];
    });

    grid.querySelectorAll('[data-concept]').forEach(card => {
        card.addEventListener('click', () => initiateWorld(card.dataset.concept));
    });
    grid.querySelectorAll('[data-saved-custom-world]').forEach(card => {
        card.addEventListener('click', () => launchArchivedCustomWorld(card.dataset.savedCustomWorld));
    });

    document.querySelectorAll('[data-feature-concept]').forEach(card => {
        card.onclick = () => initiateWorld(card.dataset.featureConcept);
    });

    const exploreButton = document.getElementById('landing-explore');
    if (exploreButton) exploreButton.onclick = () => document.getElementById('world-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const continueButton = document.getElementById('landing-continue');
    if (continueButton) {
        continueButton.classList.toggle('hidden', !gameState.player);
        continueButton.onclick = () => {
            if (!requireGeminiByok('Continuing this story requires your own Gemini API Key.')) return;
            document.getElementById('world-browser')?.classList.add('hidden');
            updateUI();
        };
    }

    const customCard = grid.querySelector('[data-custom]');
    if (customCard) {
        customCard.addEventListener('click', openWorldConstructor);
    }
}

function initiateWorld(concept) {
    const btnEnter = document.getElementById('btn-enter');
    const wizardInput = document.getElementById('wizard-input');
    if (!btnEnter || !wizardInput || !concept) return;
    if (!requireGeminiByok('Entering this world requires your own Gemini API Key.')) return;

    // A previous construction can still own the disabled state after the player
    // returns to the archive. Invalidate it before handing this preset to the
    // shared constructor; otherwise HTMLElement.click() is silently discarded.
    if (btnEnter.disabled) invalidateWorldConstruction();
    pendingCustomBlueprint = null;
    btnEnter.dataset.presetConcept = concept;
    wizardInput.value = concept;
    btnEnter.click();
}

function showFrontPage() {
    invalidateWorldConstruction();
    clearConstructionTimers();
    document.body.classList.remove('is-constructing-world');
    document.getElementById('world-construction')?.classList.add('hidden');
    const wb = document.getElementById('world-browser');
    const roster = document.getElementById('survivor-roster');
    if (roster) roster.classList.add('hidden');
    document.getElementById('constructor-view')?.classList.add('hidden');
    if (wb) {
        wb.classList.remove('hidden');
        wb.scrollTop = 0;
        renderWorldBrowser();
    }
    void syncRpgPresence();
}

document.getElementById('btn-home')?.addEventListener('click', showFrontPage);
document.getElementById('btn-new-world')?.addEventListener('click', showFrontPage);
document.getElementById('construction-return')?.addEventListener('click', showFrontPage);
document.getElementById('party-verbose-toggle')?.addEventListener('click', togglePartyVerbose);
document.getElementById('constructor-close')?.addEventListener('click', showFrontPage);
document.getElementById('btn-draft-world')?.addEventListener('click', draftWorldConstructorFromMasterPrompt);
document.getElementById('btn-reset-world')?.addEventListener('click', resetWorldConstructorDraft);

const worldConstructorForm = document.getElementById('world-constructor-form');
worldConstructorForm?.addEventListener('input', event => {
    if (event.target.matches('#world-master-prompt, [data-world-field]')) persistWorldConstructorDraft();
});
worldConstructorForm?.addEventListener('click', event => {
    const button = event.target.closest('[data-generate-constructor-image]');
    if (button) generateWorldConstructorImage(button.dataset.generateConstructorImage, button);
});
worldConstructorForm?.addEventListener('submit', event => {
    event.preventDefault();
    document.getElementById('btn-enter')?.click();
});

document.getElementById('btn-create-own')?.addEventListener('click', openWorldConstructor);

window.openPartyRoster = function() {
    selectedUnitProfile = null;
    openModal('party-modal');
}

window.openUnitProfile = function(kind, index) {
    selectedUnitProfile = { kind, index: Number(index) || 0 };
    openModal('party-modal');
}

window.openModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        populateModal(modalId);
    }
}

const RPGY_MODAL_IDS = [
    'talk-modal',
    'companion-chat-modal',
    'quests-modal',
    'inventory-modal',
    'party-modal',
    'license-modal',
    'share-modal'
];

window.closeModal = function(event) {
    const clickedModal = event?.target?.closest?.('[id$="-modal"]');
    if (clickedModal && RPGY_MODAL_IDS.includes(clickedModal.id)) {
        clickedModal.classList.add('hidden');
        return;
    }
    RPGY_MODAL_IDS.forEach(id => document.getElementById(id)?.classList.add('hidden'));
}

function populateModal(modalId) {
    const contentDiv = document.getElementById(modalId.replace('-modal', '-content'));
    if (!contentDiv) return;

    if (modalId === 'quests-modal') {
        contentDiv.innerHTML = gameState.activeQuests.map(q => `
            <div class="bg-gray-800 p-4 rounded mb-4 border-l-4 border-blue-500">
                <h4 class="font-bold text-blue-300 text-lg">${q.title}</h4>
                <p class="text-gray-400 text-sm mt-1 italic">${q.description}</p>
                <span class="inline-block mt-2 text-xs uppercase tracking-wider text-green-500">${q.status || 'Active'}</span>
            </div>
        `).join('');
    } else if (modalId === 'inventory-modal') {
        contentDiv.innerHTML = gameState.inventory.map(item => `
            <div class="bg-gray-800 p-3 rounded mb-2 text-sm">${item.name} <span class="text-gray-500 text-xs">x${item.qty}</span></div>
        `).join('');
    } else if (modalId === 'party-modal') {
        ensureGameStateShape();
        const title = document.getElementById('party-modal-title');
        const help = document.getElementById('party-help');
        const viewAll = document.getElementById('party-view-all-btn');

        if (selectedUnitProfile) {
            const unit = getEditableUnit(selectedUnitProfile.kind, selectedUnitProfile.index);
            if (unit) {
                const isPlayer = selectedUnitProfile.kind === 'player';
                contentDiv.innerHTML = unitEditorCard(unit, isPlayer, selectedUnitProfile.index);
                if (title) title.textContent = `${unit.name} \u00b7 AI Information`;
                if (help) help.textContent = gameState.language === 'fr'
                    ? 'Identit\u00e9, sant\u00e9, description et prompt ma\u00eetre de cet agent. Chaque modification est sauvegard\u00e9e localement.'
                    : 'This agent\'s identity, health, description, and master prompt. Every change saves locally.';
                if (viewAll) {
                    viewAll.textContent = gameState.language === 'fr' ? 'VOIR TOUT' : 'VIEW ALL';
                    viewAll.classList.remove('hidden');
                }
                return;
            }
            selectedUnitProfile = null;
        }

        if (title) title.textContent = gameState.language === 'fr' ? 'Joueur & \u00c9quipe' : 'Player & Party';
        if (help) help.textContent = gameState.language === 'fr'
            ? 'Chaque unit\u00e9 a sa propre identit\u00e9. Les changements sont sauvegard\u00e9s localement et inclus dans SAUVEGARDER.'
            : 'Every unit has an independent identity. Changes save locally and are included in SAVE.';
        if (viewAll) viewAll.classList.add('hidden');
        const playerCard = gameState.player ? unitEditorCard(gameState.player, true, 0) : '';
        const partyCards = gameState.party.map((member, index) => unitEditorCard(member, false, index)).join('');
        const emptyParty = gameState.party.length === 0
            ? `<div class="col-span-full text-center text-gray-500 text-sm py-4">${gameState.language === 'fr' ? 'Aucun compagnon recrut\u00e9 pour le moment.' : 'No companions recruited yet.'}</div>`
            : '';
        contentDiv.innerHTML = playerCard + partyCards + emptyParty;
    }
}

function parseMarkdown(text) {
    return text
        .replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold text-blue-400 mt-2">$1</h3>')
        .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold text-blue-500 mt-3">$1</h2>')
        .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
        .replace(/\*(.*)\*/gim, '<em>$1</em>')
        .replace(/^- (.*$)/gim, '<li class="ml-4 list-disc">$1</li>')
        .replace(/\n/gim, '<br>');
}

function appendToNarrative(html) {
    const narrativeDiv = document.getElementById('narrative');
    const newEntry = document.createElement('div');
    newEntry.innerHTML = html;
    narrativeDiv.prepend(newEntry);
    return newEntry;
}

function displaySceneImage(imageUrl) {
    const imgElement = document.getElementById('full-screen-img');
    imgElement.alt = '';
    imgElement.onerror = () => {
        imgElement.removeAttribute('src');
        imgElement.classList.add('hidden');
    };
    if (imageUrl) {
        imgElement.src = imageUrl;
        imgElement.classList.remove('hidden');
    } else {
        imgElement.classList.add('hidden');
    }
}

function loadSceneReferenceImage(source) {
    return new Promise(resolve => {
        if (!source || typeof source !== 'string') return resolve(null);
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        try {
            const url = new URL(source, window.location.href);
            if (url.origin !== window.location.origin && !source.startsWith('data:')) image.crossOrigin = 'anonymous';
        } catch (_) {}
        image.src = source;
    });
}

function drawReferenceImageContain(ctx, image, x, y, width, height) {
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

async function buildPlayerPartyReferenceSheet() {
    ensureGameStateShape();
    const presentParty = (gameState.party || []).filter(member => !['separated', 'departed'].includes(member.presence));
    const units = [gameState.player, ...presentParty]
        .filter(unit => unit?.name && unit?.portrait)
        .slice(0, 8);
    if (!units.length) return null;

    const key = units.map(unit => {
        const portrait = String(unit.portrait);
        return `${unit.id}:${unit.name}:${portrait.length}:${portrait.slice(-48)}`;
    }).join('|');
    if (sceneReferenceCache.key === key && sceneReferenceCache.value) return sceneReferenceCache.value;

    const images = await Promise.all(units.map(unit => loadSceneReferenceImage(unit.portrait)));
    const referencedUnits = units.filter((_unit, index) => images[index]);
    const referencedImages = images.filter(Boolean);
    if (!referencedUnits.length) return null;

    const columns = referencedUnits.length <= 4 ? referencedUnits.length : Math.ceil(Math.sqrt(referencedUnits.length));
    const rows = Math.ceil(referencedUnits.length / columns);
    // Match Quatuor's high-fidelity reference sheet: generous cells and light
    // separation help Gemini distinguish identity from each portrait's scenery.
    const sheetWidth = referencedUnits.length <= 4 ? 1600 : 1200;
    const sheetHeight = referencedUnits.length <= 4 ? 1000 : 1200;
    const outer = 42;
    const gap = 22;
    const cellWidth = (sheetWidth - outer * 2 - gap * (columns - 1)) / columns;
    const cellHeight = (sheetHeight - outer * 2 - gap * (rows - 1)) / rows;
    const canvas = document.createElement('canvas');
    canvas.width = sheetWidth;
    canvas.height = sheetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const gradient = ctx.createLinearGradient(0, 0, sheetWidth, sheetHeight);
    gradient.addColorStop(0, '#e4f3ff');
    gradient.addColorStop(0.58, '#f8e5eb');
    gradient.addColorStop(1, '#ffe5d2');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, sheetWidth, sheetHeight);

    referencedUnits.forEach((unit, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = outer + column * (cellWidth + gap);
        const y = outer + row * (cellHeight + gap);
        const labelHeight = Math.max(70, cellHeight * 0.14);
        const inset = 14;
        const imageX = x + inset;
        const imageY = y + inset;
        const imageWidth = cellWidth - inset * 2;
        const imageHeight = cellHeight - labelHeight - inset * 1.5;

        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillRect(x, y, cellWidth, cellHeight);
        ctx.fillStyle = '#eef7fd';
        ctx.fillRect(imageX, imageY, imageWidth, imageHeight);
        drawReferenceImageContain(ctx, referencedImages[index], imageX, imageY, imageWidth, imageHeight);
        ctx.fillStyle = '#24364b';
        ctx.font = `700 ${Math.max(24, Math.min(38, cellWidth * 0.075))}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(unit.name, x + cellWidth / 2, y + cellHeight - labelHeight / 2, cellWidth - 24);
    });

    const value = {
        image: canvas.toDataURL('image/jpeg', 0.9).split(',')[1],
        roster: referencedUnits.map(unit => unit.name),
        fingerprint: key
    };
    sceneReferenceCache = { key, value };
    return value;
}

async function generateReferenceAwareScene(prompt) {
    if (!prompt) return null;
    prompt = safeScenePromptForCurrentWorld(prompt);
    const reference = await buildPlayerPartyReferenceSheet();
    if (!reference) {
        // BYOK can still make a coherent post-narration scene when a legacy
        // save has no usable portrait sheet yet.
        if (!activeGeminiByokKey) return null;
        const response = await fetch('/api/portrait', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scenePrompt: prompt })
        });
        const data = await responseJson(response);
        return data.sceneImage || null;
    }
    const isZombieLondon = gameState.worldPreset === window.ZombieLondon?.WORLD_ID;
    const absentNames = (gameState.party || [])
        .filter(member => ['separated', 'departed'].includes(member.presence))
        .map(member => member.name)
        .filter(Boolean);
    const castingOverride = isZombieLondon
        ? `\n\nCanonical Zombie London casting override: use ONLY the currently present people in the attached reference sheet (${reference.roster.join(', ')}). The attached faces, bodies, clothes, and equipment override any contradictory wording.${absentNames.length ? ` ${absentNames.join(', ')} ${absentNames.length === 1 ? 'is' : 'are'} AWAY and must not appear anywhere in this scene, even if mentioned earlier in the prompt.` : ''}`
        : `\n\nPhysical-presence override: show ONLY the currently present people in the attached reference sheet (${reference.roster.join(', ')}).${absentNames.length ? ` The following Party members are AWAY or LEFT and must not appear: ${absentNames.join(', ')}. Ignore any earlier prompt wording that includes them.` : ''}`;
    const response = await fetch('/api/portrait', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            scenePrompt: `${prompt}${castingOverride}`,
            referenceImage: reference.image,
            referenceRoster: reference.roster
        })
    });
    const data = await responseJson(response);
    if (data.sceneImage) {
        gameState.sceneReferenceFingerprint = reference.fingerprint;
        gameState.sceneRenderVersion = SCENE_RENDER_VERSION;
    }
    return data.sceneImage || null;
}

async function renderActionSceneInBackground(prompt) {
    if (!prompt) return;
    try {
        const sceneImage = await generateReferenceAwareScene(prompt);
        if (!sceneImage) return;
        gameState.sceneImage = sceneImage;
        gameState.previousImagePrompt = prompt;
        gameState.sceneRenderVersion = SCENE_RENDER_VERSION;
        displaySceneImage(sceneImage);
        autoSave();
    } catch (error) {
        // Narrative and player control must remain available if the optional
        // visual layer is temporarily unavailable.
        console.error('Background scene render failed:', error);
    }
}

function savedSceneNeedsSanitization() {
    if (!gameState?.sceneImage || Number(gameState.sceneRenderVersion || 0) >= SCENE_RENDER_VERSION) return false;
    const prompt = String(gameState.previousImagePrompt || gameState.openingScenePrompt || '');
    const customWorld = Boolean(gameState.customWorldId || gameState.customWorldBlueprint);
    const promptLeakRisk = /(?:EDITED WORLD BLUEPRINT|MASTER PROMPT:|PLAYER FULL-BODY REFERENCE PROMPT|PARTY MEMBER FULL-BODY REFERENCE PROMPT|BOUNDARIES AND EXCLUSIONS)/i.test(prompt);
    return customWorld || promptLeakRisk;
}

async function refreshUnsafeSavedScene() {
    if (!savedSceneNeedsSanitization()) return;
    const prompt = safeScenePromptForCurrentWorld(gameState.previousImagePrompt || gameState.openingScenePrompt);
    gameState.sceneImage = null;
    displaySceneImage(null);
    autoSave();
    if (!prompt) return;
    setDiscussionStatus(gameState.language === 'fr' ? 'Nettoyage et recomposition de la scène...' : 'Cleaning and restaging the scene...', false);
    try {
        const sceneImage = await generateReferenceAwareScene(prompt);
        if (!sceneImage) return;
        gameState.sceneImage = sceneImage;
        gameState.previousImagePrompt = prompt;
        displaySceneImage(sceneImage);
        autoSave();
    } catch (error) {
        console.error('Could not replace a scene containing leaked prompt text:', error);
    } finally {
        setDiscussionStatus(gameState.language === 'fr' ? 'À vous de jouer' : 'Your move', false);
    }
}

let presenceSceneVersion = 0;
async function restageSceneForPresenceChange() {
    const version = ++presenceSceneVersion;
    sceneReferenceCache = { key: '', value: null };
    gameState.sceneImage = null;
    gameState.sceneReferenceFingerprint = '';
    displaySceneImage(null);
    autoSave();

    const prompt = gameState.previousImagePrompt || gameState.openingScenePrompt;
    if (!prompt) return;
    setDiscussionStatus(
        gameState.language === 'fr' ? 'Recomposition de la scène avec les personnages présents...' : 'Restaging the scene with present characters only...',
        false
    );
    try {
        const sceneImage = await generateReferenceAwareScene(prompt);
        if (!sceneImage || version !== presenceSceneVersion) return;
        gameState.sceneImage = sceneImage;
        displaySceneImage(sceneImage);
        autoSave();
    } catch (error) {
        console.error('Could not restage the scene after a Party presence change:', error);
    } finally {
        if (version === presenceSceneVersion) {
            setDiscussionStatus(gameState.language === 'fr' ? 'L’équipe attend votre réaction.' : 'The Party is waiting for your reaction.', false);
        }
    }
}

async function refreshZombieLondonReferenceSceneIfStale() {
    if (gameState.worldPreset !== window.ZombieLondon?.WORLD_ID) return;
    try {
        const reference = await buildPlayerPartyReferenceSheet();
        if (!reference || (gameState.sceneImage && gameState.sceneReferenceFingerprint === reference.fingerprint)) return;
        const prompt = gameState.previousImagePrompt || window.ZombieLondon.OPENING_SCENE_PROMPT;
        setDiscussionStatus(gameState.language === 'fr' ? 'Actualisation des personnages de r\u00e9f\u00e9rence...' : 'Refreshing canonical character references...', false);
        const sceneImage = await generateReferenceAwareScene(prompt);
        if (!sceneImage) return;
        gameState.sceneImage = sceneImage;
        displaySceneImage(sceneImage);
        autoSave();
    } catch (error) {
        console.error('Could not refresh the saved Zombie London reference scene:', error);
    } finally {
        setDiscussionStatus(gameState.language === 'fr' ? '\u00c0 vous de jouer' : 'Your move', false);
    }
}


const btnEnter = document.getElementById('btn-enter');
if (btnEnter) {
    btnEnter.addEventListener('click', async () => {
        if (!requireGeminiByok('Creating a world requires your own Gemini API Key.')) return;
        const presetConcept = btnEnter.dataset.presetConcept || '';
        delete btnEnter.dataset.presetConcept;
        if (presetConcept) {
            pendingCustomBlueprint = null;
        } else {
            pendingCustomBlueprint = readWorldConstructorDraft();
            persistWorldConstructorDraft();
        }
        const concept = presetConcept || compileWorldConstructorConcept(pendingCustomBlueprint);
        if (!concept || (!presetConcept && concept.length < 45)) {
            pendingCustomBlueprint = null;
            document.getElementById('constructor-draft-status').textContent = 'Describe your world in the Master Prompt or shape a few fields before creating it.';
            document.getElementById('constructor-draft-status').classList.add('is-error');
            document.getElementById('world-master-prompt')?.focus();
            return;
        }
        if (!presetConcept) {
            const archived = saveCustomWorldToArchive(pendingCustomBlueprint);
            pendingCustomBlueprint = { ...pendingCustomBlueprint, customWorldId: archived.id };
        }
        const wizardInput = document.getElementById('wizard-input');
        if (wizardInput) wizardInput.value = concept;
        const constructionRun = ++worldConstructionRun;
        document.getElementById('world-browser')?.classList.add('hidden');
        
        const t = translations[gameState.language] || translations['en'];

        const cv = document.getElementById('constructor-view');
        if (cv) cv.classList.add('hidden');
        const currentStoryPanel = document.getElementById('current-story-panel');
        if (currentStoryPanel) currentStoryPanel.classList.add('hidden');
        const briefing = hardcodedWorldBriefing(concept);
        beginWorldConstruction(concept, briefing);
        btnEnter.disabled = true;

        try {
            const response = await fetch('/api/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    concept,
                    language: gameState.language,
                    deferSceneImage: true,
                    deferPortraits: Boolean(pendingCustomBlueprint?.playerPortrait && pendingCustomBlueprint?.partyPortrait && pendingCustomBlueprint?.party2Portrait)
                })
            });
            const data = await response.json();
            if (constructionRun !== worldConstructionRun) return;

            if ([402, 503].includes(response.status)) {
                applyCreditPayload(data);
                showLicenseModal(data.message || 'A Gemini API key is required.');
                failWorldConstruction(gameState.language === 'fr'
                    ? 'Une clef série valide est requise pour construire ce monde.'
                    : 'A Gemini API key is required to construct this world.');
                return;
            }
            if (!response.ok) throw new Error(data.error || `World service returned ${response.status}`);
            if (typeof data.actionsRemaining === 'number') updateActionsRemaining(data.actionsRemaining, data.creditSource);

            gameState = {
                ...data, gmStyle: pendingCustomBlueprint?.gmStyle || "theatrical",
                worldConcept: concept,
                uiLabels: { currency: "Credits", locations: "Sectors", npcs: "Contacts" },
                party: Array.isArray(data.party) && data.party.length
                    ? data.party
                    : (Array.isArray(data.party_updates) ? data.party_updates : []),
                activeQuests: Array.isArray(data.activeQuests) ? data.activeQuests : [],
                inventory: Array.isArray(data.inventory) ? data.inventory : [],
                turnCounter: 0,
                partyVerbose: false,
                discussion: { messages: [], awaitingPlayer: true }
            };
            if (pendingCustomBlueprint) {
                if (pendingCustomBlueprint.playerPortrait && gameState.player) gameState.player.portrait = pendingCustomBlueprint.playerPortrait;
                if (pendingCustomBlueprint.partyPortrait && gameState.party[0]) gameState.party[0].portrait = pendingCustomBlueprint.partyPortrait;
                if (pendingCustomBlueprint.party2Portrait && gameState.party[1]) gameState.party[1].portrait = pendingCustomBlueprint.party2Portrait;
                gameState.heroBanner = pendingCustomBlueprint.heroBanner || null;
                gameState.customWorldId = pendingCustomBlueprint.customWorldId || null;
                gameState.customWorldBlueprint = { ...pendingCustomBlueprint };
            }
            applyWorldPreset(concept, true);
            ensureGameStateShape();
            await repairMissingUnitPortraits();
            const sidebarContent = document.getElementById('sidebar-content');
            if (sidebarContent) sidebarContent.innerHTML = '';

            introduceOpeningStory(data.openingStory, t);
            updateUI();

            let sceneImage = data.sceneImage || null;
            const sceneImagePrompt = pendingCustomBlueprint
                ? customWorldOpeningScenePrompt(pendingCustomBlueprint)
                : gameState.worldPreset === window.ZombieLondon?.WORLD_ID
                    ? window.ZombieLondon.OPENING_SCENE_PROMPT
                    : (gameState.openingScenePrompt || data.sceneImagePrompt);
            setConstructionStep(3, gameState.language === 'fr'
                ? 'Mise en scène des portraits de référence dans la nouvelle réalité...'
                : 'Staging the canonical character references inside the new reality...');
            if (sceneImagePrompt) {
                setDiscussionStatus(gameState.language === 'fr' ? 'Mise en sc\u00e8ne des personnages de r\u00e9f\u00e9rence...' : 'Staging the canonical character references...', false);
                try {
                    sceneImage = await generateReferenceAwareScene(sceneImagePrompt) || sceneImage;
                } catch (sceneError) {
                    console.error('Initial reference-aware scene failed:', sceneError);
                }
            }
            if (constructionRun !== worldConstructionRun) return;
            gameState.sceneImage = sceneImage;
            gameState.previousImagePrompt = sceneImagePrompt || data.previousImagePrompt;
            
            const mapTitle = document.getElementById('map-title');
            if (mapTitle) mapTitle.innerText = gameState.currentLocation;
            displaySceneImage(sceneImage);
            setDiscussionStatus(gameState.language === 'fr' ? '\u00c0 vous de jouer' : 'Your move', false);
            handleMusicPrompt(data.musicPrompt);
            updateSidebar();
            processNewNpcs();
            autoSave();
            finishWorldConstruction();

        } catch (e) {
            if (constructionRun !== worldConstructionRun) return;
            failWorldConstruction(gameState.language === 'fr'
                ? `Échec de la construction : ${e.message}`
                : `World construction failed: ${e.message}`);
        } finally {
            if (constructionRun === worldConstructionRun) btnEnter.disabled = false;
        }
    });
}

function updateUI() {
    renderVisibleRoster();
    renderCurrentStorySituation();
    if (!gameState.player) return;
    const hpEl = document.getElementById('hp');
    if (hpEl) hpEl.innerText = `${gameState.player.hp} / ${gameState.player.maxHp}`;
    const karmaEl = document.getElementById('karma');
    if (karmaEl) karmaEl.innerText = gameState.player.karma;
    
    const locList = document.getElementById('locations');
    if (locList) {
        locList.innerHTML = '';
        
        function renderLocation(loc) {
            if (!loc || !loc.name) return '';
            const children = (loc.children && loc.children.length > 0) ? loc.children.map(renderLocation).join('') : '';
            const npcs = (loc.npcs && loc.npcs.length > 0) ? loc.npcs.map(npc => `
                <div class="ml-4 npc-item ${npc.friendly ? 'text-green-500' : 'text-red-500'}">• ${npc.name}</div>
            `).join('') : '';
                
            return `
                <div class="ml-2 mb-3">
                    <button class="text-blue-400 hover:underline sector-item" title="${loc.description || 'No specific thoughts on this place yet.'}">${loc.name}</button>
                    ${children}
                    ${npcs}
                </div>
            `;
        }
        
        gameState.knownLocations.forEach(loc => {
            locList.innerHTML += renderLocation(loc);
        });
    }
    updateZonePanel();
}

window.playTalkVideo = async function(imageURL, name) {
    const partyModal = document.getElementById('party-modal');
    if (partyModal) partyModal.classList.add('hidden');

    openModal('talk-modal');
    const talkContent = document.getElementById('talk-content');
    
    // Find the NPC state for voice/name
    const npc = gameState.party.find(p => p.name === name);
    const voiceId = gameState.voices?.[name]?.voiceId;

    talkContent.innerHTML = `
        <div id="video-container" class="w-full text-center"></div>
        <div id="npc-response" class="mt-4 p-4 bg-gray-900 rounded border border-gray-700 w-full text-sm text-gray-300 hidden"></div>
        <div class="mt-4 w-full">
            <input type="text" id="npc-input" class="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white" placeholder="Ask ${name} something...">
            <button id="ask-btn" class="mt-2 w-full py-2 bg-blue-700 rounded hover:bg-blue-600">ASK</button>
        </div>
        <div id="status-indicator" class="mt-2 text-xs text-gray-500"></div>
        <button onclick="closeModal()" class="mt-4 px-4 py-2 bg-gray-700 rounded hover:bg-gray-600">Exit</button>
    `;

    document.getElementById('ask-btn').onclick = async () => {
        const input = document.getElementById('npc-input');
        const status = document.getElementById('status-indicator');
        const q = input.value;
        if (!q) return;
        
        status.innerText = "Generating animated response...";
        input.value = '';
        
        try {
            const res = await fetch('/api/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, question: q, voiceId, imageURL, masterPrompt: npc?.masterPrompt })
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || 'Server error');
            
            const respBox = document.getElementById('npc-response');
            respBox.innerText = data.answer;
            respBox.classList.remove('hidden');
            status.innerText = "Response ready.";

            // Video remains an optional server feature, so a text-only reply is
            // still a successful answer when no video URL is returned.
            const vidContainer = document.getElementById('video-container');
            if (data.videoURL) {
                vidContainer.innerHTML = `<video src="${data.videoURL}" controls autoplay class="w-full rounded shadow-lg border border-blue-900"></video>`;
            }

        } catch (e) {
            status.innerText = "Error: " + e.message;
        }
    };

    // Initial video load
    const vidContainer = document.getElementById('video-container');
    vidContainer.innerHTML = `<img src="${imageURL}" class="w-64 h-64 rounded mb-4 object-cover mx-auto">
                              <p class="text-gray-400">Generating initial greeting...</p>`;
    
    try {
        const res = await fetch('/api/talk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageURL, text: "Lorem ipsum. Lorem ipsum. Lorem ipsum." })
        });
        const { videoURL } = await res.json();
        vidContainer.innerHTML = `<video src="${videoURL}" controls autoplay class="w-full rounded shadow-lg border border-blue-900"></video>`;
    } catch (e) {
        vidContainer.innerHTML = `<p class="text-red-500">Video failed.</p>`;
    }
}

function partyMemberCard(member, isPlayer = false) {
    const portrait = member.portrait
        ? `<img src="${member.portrait}" width="128" height="128" class="rounded object-cover flex-shrink-0" style="width:128px;height:128px;">`
        : `<div class="rounded bg-gray-700 flex items-center justify-center flex-shrink-0 text-gray-500 text-xs" style="width:128px;height:128px;">?</div>`;

    const label = isPlayer
        ? `<span class="text-xs bg-blue-900 text-blue-300 px-1 rounded">PLAYER</span>`
        : `<span class="text-xs bg-gray-700 text-gray-400 px-1 rounded">${member.class || 'Member'}</span>`;

    const stats = isPlayer
        ? `<p class="text-xs text-gray-400 mt-1">❤ ${member.hp} &nbsp;·&nbsp; Karma ${member.karma}</p>`
        : '';
    
    const talkBtn = (!isPlayer && member.portrait) 
        ? `<button onclick="playTalkVideo('${member.portrait}', '${member.name}')" class="mt-2 px-2 py-1 bg-blue-700 text-white text-xs rounded hover:bg-blue-600">TALK</button>`
        : '';

    return `
        <div class="bg-gray-800 rounded mb-3 p-3 flex gap-3 ${isPlayer ? 'border border-blue-800' : ''}">
            ${portrait}
            <div class="flex flex-col justify-start overflow-hidden">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-bold text-yellow-400 text-sm">${member.name}</span>
                    ${label}
                </div>
                ${stats}
                <p class="text-xs text-gray-400 mt-1 leading-snug">${member.description || ''}</p>
                ${talkBtn}
            </div>
        </div>`;
}

function escapeUnitHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function updatePartyVerboseToggle() {
    const toggle = document.getElementById('party-verbose-toggle');
    const state = document.getElementById('party-verbose-state');
    if (!toggle) return;
    const enabled = gameState?.partyVerbose === true;
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.setAttribute('aria-label', gameState?.language === 'fr'
        ? `Détail des réponses de l’équipe : ${enabled ? 'verbeux' : 'concis'}`
        : `Party response detail: ${enabled ? 'verbose' : 'concise'}`);
    toggle.title = enabled
        ? (gameState?.language === 'fr'
            ? 'Les réponses et réactions sollicitées des compagnons seront plus riches.'
            : 'Party replies and requested reactions will be richer and more expressive.')
        : (gameState?.language === 'fr'
            ? 'Garder les réponses et réactions des compagnons concises.'
            : 'Keep Party replies and requested reactions concise.');
    if (state) state.textContent = enabled ? 'ON' : 'OFF';
}

function togglePartyVerbose() {
    ensureGameStateShape();
    gameState.partyVerbose = !gameState.partyVerbose;
    partyVerbosePreference = gameState.partyVerbose;
    updatePartyVerboseToggle();
    setDiscussionStatus(
        gameState.language === 'fr'
            ? (gameState.partyVerbose ? 'MODE VERBOSE — réponses plus riches.' : 'Mode concis — réponses plus brèves.')
            : (gameState.partyVerbose ? 'VERBOSE MODE — richer Party responses.' : 'Concise mode — shorter Party responses.'),
        false
    );
    autoSave();
}

function renderVisibleRoster() {
    const panel = document.getElementById('survivor-roster');
    const list = document.getElementById('survivor-roster-list');
    if (!panel || !list) return;
    updatePartyVerboseToggle();
    if (!gameState?.player) {
        panel.classList.add('hidden');
        list.innerHTML = '';
        return;
    }

    ensureGameStateShape();
    const units = [
        { unit: gameState.player, kind: 'player', index: 0 },
        ...gameState.party.map((unit, index) => ({ unit, kind: 'party', index }))
    ];
    const isZombieLondon = gameState.worldPreset === window.ZombieLondon?.WORLD_ID;
    const kicker = document.querySelector('.survivor-roster-kicker');
    const title = document.getElementById('survivor-roster-title');
    if (kicker) kicker.textContent = isZombieLondon ? 'ZOMBIE LONDON' : String(gameState.worldConcept || gameState.theme || 'ACTIVE WORLD').toUpperCase();
    if (title) title.textContent = isZombieLondon
        ? (gameState.language === 'fr' ? 'LES SURVIVANTS' : 'THE SURVIVORS')
        : (gameState.language === 'fr' ? 'JOUEUR & \u00c9QUIPE' : 'PLAYER & PARTY');

    list.innerHTML = units.map(({ unit, kind, index }) => {
        const maxHp = Math.max(1, Number(unit.maxHp) || 100);
        const hp = Number.isFinite(Number(unit.hp)) ? Number(unit.hp) : maxHp;
        const healthPercent = Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100)));
        const healthState = healthPercent <= 30 ? 'critical' : healthPercent <= 65 ? 'wounded' : 'healthy';
        const portrait = unit.portrait
            ? `<img class="survivor-card-portrait" src="${escapeUnitHtml(unit.portrait)}" alt="Full-body portrait of ${escapeUnitHtml(unit.name)}">`
            : '<div class="survivor-card-placeholder" aria-hidden="true">?</div>';
        const presenceLabel = unit.presence === 'departed'
            ? (gameState.language === 'fr' ? 'PARTI' : 'LEFT')
            : unit.presence === 'separated'
                ? (gameState.language === 'fr' ? 'AILLEURS' : 'AWAY')
                : '';
        const badge = kind === 'player'
            ? (gameState.language === 'fr' ? 'JOUEUR' : 'PLAYER')
            : `${gameState.language === 'fr' ? '\u00c9QUIPE' : 'PARTY'}${presenceLabel ? ` · ${presenceLabel}` : ''}`;
        const hpLabel = gameState.language === 'fr' ? 'SANT\u00c9' : 'HEALTH';
        const aiLabel = gameState.language === 'fr' ? 'VOIR LES INFORMATIONS IA' : 'VIEW AI INFORMATION';
        const chatLabel = gameState.language === 'fr' ? 'DISCUTER' : 'CHAT';
        const reactionLabel = 'REACTION';
        const chatControl = kind === 'party' && unit.presence === 'present'
            ? `<div class="survivor-card-actions">
                <button type="button" class="survivor-reaction-button" data-party-reaction data-unit-index="${index}" aria-label="${reactionLabel}: ${escapeUnitHtml(unit.name)}" ${partyReactionInFlight ? 'disabled' : ''}>${reactionLabel}</button>
                <button type="button" class="survivor-chat-button" data-party-chat data-unit-index="${index}" aria-label="${chatLabel}: ${escapeUnitHtml(unit.name)}">${chatLabel}</button>
            </div>`
            : '<span class="survivor-chat-spacer" aria-hidden="true"></span>';

        return `<div class="survivor-card-shell" data-unit-kind="${kind}" data-presence="${escapeUnitHtml(unit.presence || 'present')}">
            <button type="button" class="survivor-card" data-roster-unit data-unit-kind="${kind}" data-presence="${escapeUnitHtml(unit.presence || 'present')}" data-unit-index="${index}" aria-label="${aiLabel}: ${escapeUnitHtml(unit.name)}">
                ${portrait}
                <span class="survivor-card-badge">${badge}</span>
                <span class="survivor-card-content">
                    <span class="survivor-card-name">${escapeUnitHtml(unit.name)}</span>
                    <span class="survivor-card-role">${escapeUnitHtml(unit.class)}</span>
                    <span class="survivor-health-row"><span>${hpLabel}</span><span>${escapeUnitHtml(hp)} / ${escapeUnitHtml(maxHp)} HP</span></span>
                    <span class="survivor-health-track"><span class="survivor-health-fill" data-health="${healthState}" style="width:${healthPercent}%"></span></span>
                    <span class="survivor-card-ai">${aiLabel} &rarr;</span>
                </span>
            </button>
            ${chatControl}
        </div>`;
    }).join('');
    panel.classList.remove('hidden');
}

function companionChatHistory(member) {
    ensureGameStateShape();
    if (!member?.id) return [];
    if (!Array.isArray(gameState.privateChats[member.id])) gameState.privateChats[member.id] = [];
    return gameState.privateChats[member.id];
}

function renderCompanionChatModal() {
    const member = gameState.party?.[activeCompanionChatIndex];
    const content = document.getElementById('companion-chat-content');
    if (!member || !content) return;

    const portrait = document.getElementById('companion-chat-portrait');
    const name = document.getElementById('companion-chat-name');
    const role = document.getElementById('companion-chat-role');
    const kicker = document.getElementById('companion-chat-kicker');
    const input = document.getElementById('companion-chat-input');
    const send = document.getElementById('companion-chat-send');
    const status = document.getElementById('companion-chat-status');
    const history = companionChatHistory(member);

    if (portrait) {
        portrait.src = member.portrait || '';
        portrait.alt = member.portrait ? `${member.name} portrait` : '';
        portrait.classList.toggle('hidden', !member.portrait);
    }
    if (name) name.textContent = member.name;
    if (role) role.textContent = `${member.class || 'Party member'} \u00b7 ${member.hp} / ${member.maxHp} HP`;
    if (kicker) kicker.textContent = gameState.language === 'fr' ? 'CONVERSATION PRIV\u00c9E' : 'PRIVATE PARTY CHANNEL';
    if (input) {
        input.placeholder = gameState.language === 'fr' ? `Parler \u00e0 ${member.name}...` : `Talk to ${member.name}...`;
        input.disabled = companionChatRequestInFlight;
    }
    if (send) {
        send.textContent = gameState.language === 'fr' ? 'ENVOYER' : 'SEND';
        send.disabled = companionChatRequestInFlight;
    }
    if (status) status.textContent = companionChatRequestInFlight
        ? (gameState.language === 'fr' ? `${member.name} r\u00e9fl\u00e9chit...` : `${member.name} is thinking...`)
        : companionChatError;

    if (!history.length) {
        content.innerHTML = `<div class="companion-chat-empty">${gameState.language === 'fr'
            ? `${escapeUnitHtml(member.name)} attend que vous commenciez. Cette conversation restera br\u00e8ve, priv\u00e9e et centr\u00e9e sur vos choix.`
            : `${escapeUnitHtml(member.name)} is waiting for you to begin. This conversation stays focused, private, and centered on your choices.`}</div>`;
    } else {
        content.innerHTML = history.map(message => {
            const isPlayer = message.speakerId === 'player' || message.role === 'player';
            return `<div class="companion-chat-message ${isPlayer ? 'player' : 'companion'}">
                <div class="companion-chat-speaker">${escapeUnitHtml(message.name || (isPlayer ? gameState.player.name : member.name))}</div>
                <div class="companion-chat-bubble">${parseMarkdown(escapeUnitHtml(message.text || ''))}</div>
            </div>`;
        }).join('');
    }
    content.scrollTop = content.scrollHeight;
}

window.openCompanionChat = function(index) {
    ensureGameStateShape();
    const parsedIndex = Number(index);
    if (!Number.isInteger(parsedIndex) || !gameState.party[parsedIndex]) return;
    activeCompanionChatIndex = parsedIndex;
    companionChatRequestInFlight = false;
    companionChatError = '';
    renderCompanionChatModal();
    document.getElementById('companion-chat-modal')?.classList.remove('hidden');
    document.getElementById('companion-chat-input')?.focus();
}

async function sendCompanionChatMessage(event) {
    event?.preventDefault();
    if (companionChatRequestInFlight) return;
    const member = gameState.party?.[activeCompanionChatIndex];
    const input = document.getElementById('companion-chat-input');
    const text = String(input?.value || '').trim();
    if (!member || !text) return;

    const history = companionChatHistory(member);
    history.push({ speakerId: 'player', role: 'player', name: gameState.player.name || 'Player', text, timestamp: Date.now() });
    if (history.length > 60) history.splice(0, history.length - 60);
    input.value = '';
    companionChatRequestInFlight = true;
    companionChatError = '';
    autoSave();
    renderCompanionChatModal();

    try {
        const response = await fetch('/api/party-turn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                gameState: stripPortraits(gameState),
                speakerId: member.id,
                messages: history.slice(-24),
                mode: 'continue',
                context: 'private-chat',
                round: { addressedToEveryone: false, replyCount: 0 }
            })
        });
        const reply = await responseJson(response);
        const replyText = String(reply.text || '').trim();
        if (!replyText) throw new Error('Empty companion response');
        history.push({ speakerId: member.id, role: 'companion', name: member.name, text: replyText, timestamp: Date.now() });
        if (history.length > 60) history.splice(0, history.length - 60);
        autoSave();
    } catch (error) {
        console.error(`Private chat failed for ${member.name}:`, error);
        companionChatError = gameState.language === 'fr'
            ? 'Impossible de r\u00e9pondre pour le moment. R\u00e9essayez.'
            : 'Unable to answer right now. Please try again.';
    } finally {
        companionChatRequestInFlight = false;
        renderCompanionChatModal();
        document.getElementById('companion-chat-input')?.focus();
    }
}

async function pingPartyReaction(index) {
    ensureGameStateShape();
    const member = gameState.party?.[Number(index)];
    if (!member || member.presence !== 'present' || partyReactionInFlight) return;
    if (gmRequestInFlight) {
        setDiscussionStatus(gameState.language === 'fr'
            ? 'Attendez que le Maître du Jeu termine cette action.'
            : 'Wait for the Game Master to finish resolving this action.', false);
        return;
    }

    interruptPartyDiscussion(false);
    const version = ++partyDiscussionVersion;
    const controller = new AbortController();
    partyDiscussionController = controller;
    partyDiscussionActive = true;
    partyReactionInFlight = true;
    gameState.discussion.awaitingPlayer = false;
    renderVisibleRoster();
    setDiscussionStatus(
        gameState.language === 'fr' ? `${member.name} réagit à la situation...` : `${member.name} is reacting to the situation...`,
        true
    );

    try {
        const reply = await responseJson(await fetch('/api/party-turn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
                gameState: stripPortraits(gameState),
                speakerId: member.id,
                messages: discussionMessages().slice(-24),
                mode: 'continue',
                context: 'ping-reaction',
                round: { addressedToEveryone: false, replyCount: 0 }
            })
        }));
        if (!partyDiscussionActive || version !== partyDiscussionVersion) return;
        const text = String(reply.text || '').trim();
        if (!text) throw new Error(`${member.name} returned an empty reaction.`);
        recordDiscussionMessage({ speakerId: member.id, name: member.name, text, mode: 'ping-reaction' });
        storySoFar += `\n${member.name}: ${text}`;
        appendPartyDiscussionMessage(member, text, 'reaction');
        autoSave();
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error(`Situation reaction failed for ${member.name}:`, error);
            appendToNarrative(`<p class="text-red-400">${escapeUnitHtml(member.name)} ${gameState.language === 'fr' ? 'ne parvient pas à réagir pour le moment.' : 'cannot react right now.'}</p>`);
        }
    } finally {
        const stillCurrent = version === partyDiscussionVersion;
        if (stillCurrent) {
            partyDiscussionController = null;
            partyDiscussionActive = false;
            gameState.discussion.awaitingPlayer = true;
        }
        partyReactionInFlight = false;
        renderVisibleRoster();
        if (stillCurrent) {
            setDiscussionStatus(gameState.language === 'fr' ? 'À vous de jouer' : 'Your move', false);
            autoSave();
            document.getElementById('input')?.focus();
        }
    }
}

function unitEditorCard(member, isPlayer = false, index = 0) {
    const kind = isPlayer ? 'player' : 'party';
    const title = isPlayer ? 'PLAYER' : 'PARTY';
    const portrait = member.portrait
        ? `<img src="${escapeUnitHtml(member.portrait)}" alt="Full-body avatar of ${escapeUnitHtml(member.name)}">`
        : `<div class="unit-avatar-placeholder"><div class="text-4xl mb-2">?</div><div>${gameState.language === 'fr' ? 'Avatar en pied' : 'Full-body avatar'}</div></div>`;
    const fieldAttrs = `data-unit-kind="${kind}" data-unit-index="${index}"`;

    return `<article class="unit-frame rounded-lg" data-unit-kind="${kind}">
        <div class="unit-avatar-stage">
            ${portrait}
            <button type="button" class="unit-avatar-action" data-unit-action="regenerate-portrait" ${fieldAttrs}>
                ${gameState.language === 'fr' ? 'G\u00c9N\u00c9RER L\u2019AVATAR' : 'GENERATE AVATAR'}
            </button>
        </div>
        <div class="unit-sheet">
            <div class="flex items-center justify-between gap-3">
                <span class="text-xs font-bold tracking-widest ${isPlayer ? 'text-yellow-300' : 'text-blue-300'}">${title}</span>
                <span class="text-xs text-gray-500">ID: ${escapeUnitHtml(member.id)}</span>
            </div>
            <div class="grid grid-cols-4 gap-2">
                <label class="col-span-2"><span class="unit-field-label">${gameState.language === 'fr' ? 'Nom' : 'Name'}</span>
                    <input class="unit-input" type="text" value="${escapeUnitHtml(member.name)}" data-unit-field="name" ${fieldAttrs}>
                </label>
                <label><span class="unit-field-label">HP</span>
                    <input class="unit-input" type="number" value="${escapeUnitHtml(member.hp)}" data-unit-field="hp" ${fieldAttrs}>
                </label>
                <label><span class="unit-field-label">MAX HP</span>
                    <input class="unit-input" type="number" min="1" value="${escapeUnitHtml(member.maxHp)}" data-unit-field="maxHp" ${fieldAttrs}>
                </label>
            </div>
            <label><span class="unit-field-label">${gameState.language === 'fr' ? 'R\u00f4le / Classe' : 'Role / Class'}</span>
                <input class="unit-input" type="text" value="${escapeUnitHtml(member.class)}" data-unit-field="class" ${fieldAttrs}>
            </label>
            <label><span class="unit-field-label">${gameState.language === 'fr' ? 'Description textuelle' : 'Text description'}</span>
                <textarea class="unit-textarea" rows="3" data-unit-field="description" ${fieldAttrs}>${escapeUnitHtml(member.description)}</textarea>
            </label>
            <label><span class="unit-field-label">${gameState.language === 'fr' ? 'Master prompt : personnalit\u00e9, d\u00e9sirs, peurs, buts et nuances' : 'Master prompt: personality, wants, fears, goals & intricacies'}</span>
                <textarea class="unit-textarea unit-master-prompt" data-unit-field="masterPrompt" ${fieldAttrs}>${escapeUnitHtml(member.masterPrompt)}</textarea>
            </label>
            <details class="text-xs text-gray-500">
                <summary class="cursor-pointer hover:text-gray-300">${gameState.language === 'fr' ? 'Prompt visuel complet' : 'Full-body visual prompt'}</summary>
                <textarea class="unit-textarea mt-2" rows="4" data-unit-field="portraitPrompt" ${fieldAttrs}>${escapeUnitHtml(member.portraitPrompt)}</textarea>
            </details>
        </div>
    </article>`;
}

function getEditableUnit(kind, index) {
    ensureGameStateShape();
    return kind === 'player' ? gameState.player : gameState.party[Number(index)];
}

async function regenerateUnitPortrait(button) {
    const unit = getEditableUnit(button.dataset.unitKind, button.dataset.unitIndex);
    if (!unit || !unit.portraitPrompt) return;
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = gameState.language === 'fr' ? 'G\u00c9N\u00c9RATION...' : 'GENERATING...';
    try {
        const response = await fetch('/api/portrait', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ portraitPrompt: unit.portraitPrompt, chargeCredit: true })
        });
        const data = await response.json();
        if (!response.ok || !data.portrait) {
            if ([402, 503].includes(response.status)) {
                applyCreditPayload(data);
                showLicenseModal(data.message || 'A Gemini API key is required.');
            }
            throw new Error(data.message || data.error || 'Portrait generation failed');
        }
        if (typeof data.actionsRemaining === 'number') updateActionsRemaining(data.actionsRemaining, data.creditSource);
        unit.portrait = data.portrait;
        autoSave();
        renderVisibleRoster();
        populateModal('party-modal');
    } catch (error) {
        console.error('Unit portrait generation failed:', error);
        button.textContent = gameState.language === 'fr' ? 'ERREUR - R\u00c9ESSAYER' : 'ERROR - RETRY';
        button.disabled = false;
        return;
    }
    button.textContent = originalLabel;
    button.disabled = false;
}

function updateSidebar() {
    const sidebar = document.getElementById('sidebar-content');
    if (!sidebar) return;
    const quests = gameState.activeQuests || [];
    if (!quests.length) {
        sidebar.innerHTML = `<p class="text-right text-xs text-yellow-700 italic">No active quests.</p>`;
        return;
    }
    sidebar.innerHTML = quests.map(q => {
        const statusColor = q.status === 'Completed' ? '#4ade80' : q.status === 'Failed' ? '#f87171' : '#fbbf24';
        return `<div class="mb-5 text-right">
            <div style="color:#fcd34d; font-size:0.8rem; font-weight:700; letter-spacing:0.05em; text-shadow:0 0 6px rgba(252,211,77,0.4);">${q.title}</div>
            <div style="color:#d1d5db; font-size:0.7rem; margin-top:2px; line-height:1.4;">${q.description}</div>
            <div style="color:${statusColor}; font-size:0.65rem; margin-top:3px; letter-spacing:0.08em; text-transform:uppercase;">${q.status || 'Active'}</div>
        </div>`;
    }).join('');
}

function updateZonePanel() {
    const panel = document.getElementById('zone-panel');
    if (!panel || !gameState.knownLocations?.length) return;

    function renderZone(loc, depth) {
        const pad = depth * 10;
        const npcs = (loc.npcs || []).map(npc =>
            `<div style="padding-left:${pad + 8}px; color:${npc.friendly ? '#4ade8088' : '#f8717188'}; font-size:0.6rem; line-height:1.6;">· ${npc.name}</div>`
        ).join('');
        const children = (loc.children || []).map(c => renderZone(c, depth + 1)).join('');
        return `<div style="padding-left:${pad}px; margin-bottom:2px;">
            <span style="color:#9ca3af; font-size:0.65rem; line-height:1.6;">${loc.name}</span>
            ${npcs}${children}
        </div>`;
    }

    panel.innerHTML = gameState.knownLocations.map(loc => renderZone(loc, 0)).join('');
}

function stripPortraits(gs) {
    const strip = ({ portrait, ...rest }) => rest;
    const { sceneImage, privateChats, ...safeState } = gs;
    return {
        ...safeState,
        player: gs.player ? strip(gs.player) : gs.player,
        party: (gs.party || []).map(strip)
    };
}

function setDiscussionStatus(text, active = false) {
    const status = document.getElementById('discussion-status');
    const takeTurn = document.getElementById('take-turn-btn');
    if (status) status.textContent = text || '';
    if (takeTurn) takeTurn.classList.toggle('hidden', !active);
}

function latestPlayerMessageText() {
    const messages = discussionMessages();
    for (let index = messages.length - 1; index >= 0; index--) {
        if (messages[index].speakerId === 'player') return messages[index].text || '';
    }
    return '';
}

function playerAddressedEveryone(text) {
    const normalized = String(text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const groupCue = /\b(everyone|everybody|all of you|you all|each of you|whole party|the party|companions|tout le monde|vous tous|chacun de vous|toute l'equipe|compagnons)\b/.test(normalized);
    const questionCue = /\?/.test(text) || /\b(opinion|thoughts|what do|what would|avis|qu'en pensez|que pensez|que feriez)\b/.test(normalized);
    return groupCue && questionCue;
}

function appendPartyDiscussionMessage(member, text, mode) {
    const modeLabel = mode === 'interrupt'
        ? (gameState.language === 'fr' ? 'INTERROMPT' : 'INTERRUPTS')
        : mode === 'reaction'
            ? (gameState.language === 'fr' ? 'RÉACTION' : 'REACTION')
            : (gameState.language === 'fr' ? '\u00c9QUIPE' : 'PARTY');
    appendToNarrative(`<div class="discussion-message ${mode === 'interrupt' ? 'interrupt' : ''}">
        <div class="discussion-speaker">${escapeUnitHtml(member.name)} \u00b7 ${modeLabel}</div>
        <div class="text-gray-100 mt-1">${parseMarkdown(escapeUnitHtml(text))}</div>
    </div>`);
}

function interruptPartyDiscussion(focusPlayer = true) {
    partyDiscussionVersion++;
    if (partyDiscussionController) partyDiscussionController.abort();
    partyDiscussionController = null;
    partyDiscussionActive = false;
    if (gameState.discussion) gameState.discussion.awaitingPlayer = true;
    setDiscussionStatus(gameState.language === 'fr' ? '\u00c0 vous de jouer' : 'Your move', false);
    autoSave();
    if (focusPlayer) document.getElementById('input')?.focus();
}

async function responseJson(response) {
    const raw = await response.text();
    let data;
    try {
        data = JSON.parse(raw);
    } catch (_) {
        throw new Error(raw || `HTTP ${response.status}`);
    }
    if (!response.ok) {
        if ([402, 503].includes(response.status)) {
            applyCreditPayload(data);
            showLicenseModal(data.message || 'A Gemini API key is required.');
        }
        throw new Error(data.message || data.error || `HTTP ${response.status}`);
    }
    if (typeof data.actionsRemaining === 'number') updateActionsRemaining(data.actionsRemaining, data.creditSource);
    return data;
}

async function runPartyDiscussionRound() {
    ensureGameStateShape();
    if (!gameState.party.length) {
        gameState.discussion.awaitingPlayer = true;
        setDiscussionStatus(gameState.language === 'fr' ? '\u00c0 vous de jouer' : 'Your move', false);
        autoSave();
        return;
    }

    const version = ++partyDiscussionVersion;
    const controller = new AbortController();
    partyDiscussionController = controller;
    partyDiscussionActive = true;
    gameState.discussion.awaitingPlayer = false;
    const respondedSpeakerIds = new Set();
    const roundStartedAt = Date.now();
    const addressedToEveryone = playerAddressedEveryone(latestPlayerMessageText());
    const hardReplyLimit = addressedToEveryone ? gameState.party.length : Math.min(PARTY_REPLY_LIMIT, gameState.party.length);

    try {
        while (partyDiscussionActive && version === partyDiscussionVersion && respondedSpeakerIds.size < hardReplyLimit) {
            const elapsedMs = Date.now() - roundStartedAt;
            if (!addressedToEveryone && respondedSpeakerIds.size > 0 && elapsedMs >= PARTY_ROUND_TIME_LIMIT_MS) break;
            const casting = automaticSpeakerPreference([...respondedSpeakerIds]);

            setDiscussionStatus(
                gameState.language === 'fr'
                    ? 'Le R\u00e9gisseur choisit qui doit parler...'
                    : 'The Director is choosing who should speak...',
                true
            );

            let decision;
            try {
                decision = await responseJson(await fetch('/api/director', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                    body: JSON.stringify({
                        gameState: stripPortraits(gameState),
                        messages: discussionMessages().slice(-18),
                        round: {
                            repliedSpeakerIds: [...respondedSpeakerIds],
                            respondedSpeakerIds: [...respondedSpeakerIds],
                            replyCount: respondedSpeakerIds.size,
                            elapsedMs,
                            addressedToEveryone,
                            preferredSpeakerId: casting.preferredSpeakerId,
                            lastAutomaticSpeakerId: casting.lastAutomaticSpeakerId
                        }
                    })
                }));
            } catch (error) {
                if (error.name === 'AbortError') return;
                console.error('Director request failed:', error);
                const fallback = gameState.party.find(member => member.id === casting.preferredSpeakerId)
                    || gameState.party.find(member => !respondedSpeakerIds.has(member.id));
                decision = respondedSpeakerIds.size === 0 && fallback
                    ? { next_speaker: fallback.id, mode: 'continue', hand_back_to_player: false }
                    : { hand_back_to_player: true };
            }

            if (decision.hand_back_to_player) break;
            const speaker = gameState.party.find(member => member.id === decision.next_speaker);
            if (!speaker || respondedSpeakerIds.has(speaker.id)) break;

            setDiscussionStatus(
                gameState.language === 'fr' ? `${speaker.name} r\u00e9fl\u00e9chit...` : `${speaker.name} is thinking...`,
                true
            );
            let replica;
            try {
                replica = await responseJson(await fetch('/api/party-turn', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                    body: JSON.stringify({
                        gameState: stripPortraits(gameState),
                        speakerId: speaker.id,
                        messages: discussionMessages().slice(-18),
                        mode: decision.mode,
                        round: { addressedToEveryone, replyCount: respondedSpeakerIds.size }
                    })
                }));
            } catch (error) {
                if (error.name === 'AbortError') return;
                console.error(`Party response failed for ${speaker.name}:`, error);
                break;
            }

            if (!partyDiscussionActive || version !== partyDiscussionVersion) return;
            const text = String(replica.text || '').trim();
            if (!text) break;
            const mode = decision.mode === 'interrupt' ? 'interrupt' : 'continue';
            respondedSpeakerIds.add(speaker.id);
            noteAutomaticPartySpeaker(speaker.id);
            recordDiscussionMessage({ speakerId: speaker.id, name: speaker.name, text, mode });
            storySoFar += `\n${speaker.name}: ${text}`;
            appendPartyDiscussionMessage(speaker, text, mode);
            autoSave();
        }
    } finally {
        if (version === partyDiscussionVersion) {
            partyDiscussionController = null;
            partyDiscussionActive = false;
            gameState.discussion.awaitingPlayer = true;
            setDiscussionStatus(
                gameState.language === 'fr' ? 'Le groupe attend votre d\u00e9cision.' : 'The Party is waiting for your decision.',
                false
            );
            autoSave();
            document.getElementById('input')?.focus();
        }
    }
}

async function runDirectPartyQuestion(member) {
    const version = ++partyDiscussionVersion;
    const controller = new AbortController();
    partyDiscussionController = controller;
    partyDiscussionActive = true;
    const thinkingEntry = appendToNarrative(`<p class="italic text-blue-300 text-sm">${escapeUnitHtml(member.name)} ${gameState.language === 'fr' ? 'r\u00e9fl\u00e9chit...' : 'is considering your question...'}</p>`);

    try {
        setDiscussionStatus(
            gameState.language === 'fr'
                ? `Le R\u00e9gisseur donne la parole \u00e0 ${member.name}...`
                : `The Director is giving ${member.name} the floor...`,
            true
        );

        let decision;
        try {
            decision = await responseJson(await fetch('/api/director', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    gameState: stripPortraits(gameState),
                    messages: discussionMessages().slice(-18),
                    round: {
                        requestedSpeakerId: member.id,
                        directQuestion: true,
                        respondedSpeakerIds: [],
                        replyCount: 0,
                        elapsedMs: 0,
                        addressedToEveryone: false
                    }
                })
            }));
        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error('Director failed to route direct Party question:', error);
            decision = { next_speaker: member.id, mode: 'continue', hand_back_to_player: false };
        }

        if (decision.hand_back_to_player || decision.next_speaker !== member.id) {
            throw new Error(`The Director did not select ${member.name}.`);
        }

        setDiscussionStatus(
            gameState.language === 'fr' ? `${member.name} r\u00e9pond...` : `${member.name} is answering...`,
            true
        );
        const reply = await responseJson(await fetch('/api/party-turn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
                gameState: stripPortraits(gameState),
                speakerId: member.id,
                messages: discussionMessages().slice(-18),
                mode: decision.mode,
                context: 'direct-question',
                round: { addressedToEveryone: false, replyCount: 0 }
            })
        }));

        if (!partyDiscussionActive || version !== partyDiscussionVersion) return;
        const text = String(reply.text || '').trim();
        if (!text) throw new Error(`${member.name} returned an empty reply.`);
        recordDiscussionMessage({ speakerId: member.id, name: member.name, text, mode: 'direct-answer' });
        storySoFar += `\n${member.name}: ${text}`;
        appendPartyDiscussionMessage(member, text, 'continue');
        autoSave();
    } finally {
        thinkingEntry.remove();
        if (version === partyDiscussionVersion) {
            partyDiscussionController = null;
            partyDiscussionActive = false;
            gameState.discussion.awaitingPlayer = true;
            setDiscussionStatus(
                gameState.language === 'fr' ? `${member.name} attend votre r\u00e9ponse.` : `${member.name} is waiting for your reply.`,
                false
            );
        }
    }
}

async function processAction(input) {
    if (!gameState.player) return alert("Please initiate the world first.");
    if (!requireGeminiByok('Taking an action requires your own Gemini API Key.')) return;
    const playerInput = String(input || '').trim();
    if (!playerInput || gmRequestInFlight) return;

    interruptPartyDiscussion(false);
    gmRequestInFlight = true;
    ensureGameStateShape();
    gameState.turnCounter += 1;
    gameState.discussion.lastAmbientTurn = null;
    const addressedPartyMember = window.DialogueRouting?.findAddressedPartyMember(playerInput, gameState.party) || null;
    gameState.discussion.awaitingPlayer = false;
    recordDiscussionMessage({ speakerId: 'player', name: gameState.player.name || 'Player', text: playerInput, mode: 'player' });
    appendToNarrative(`<p class="italic text-gray-400 my-2">&gt; ${escapeUnitHtml(playerInput)}</p>`);

    if (addressedPartyMember) {
        storySoFar += `\n> ${playerInput}`;
        try {
            await runDirectPartyQuestion(addressedPartyMember);
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(`Direct question failed for ${addressedPartyMember.name}:`, error);
                appendToNarrative(`<p class="text-red-400">${escapeUnitHtml(addressedPartyMember.name)} ${gameState.language === 'fr' ? 'ne peut pas r\u00e9pondre pour le moment.' : 'cannot answer right now.'}</p>`);
            }
            gameState.discussion.awaitingPlayer = true;
            setDiscussionStatus(gameState.language === 'fr' ? '\u00c0 vous de jouer' : 'Your move', false);
        } finally {
            gmRequestInFlight = false;
            autoSave();
        }
        return;
    }

    const thinkingEntry = appendToNarrative(`<p class="italic text-gray-600 text-sm">${gameState.language === 'fr' ? 'Le monde r\u00e9agit...' : 'The world is reacting...'}</p>`);
    setDiscussionStatus(gameState.language === 'fr' ? 'Le Ma\u00eetre du Jeu r\u00e9sout votre action...' : 'The Game Master is resolving your action...', false);
    const storyBeforeAction = storySoFar;

    try {
        let sceneReference = null;
        try {
            sceneReference = await buildPlayerPartyReferenceSheet();
        } catch (referenceError) {
            console.error('Could not build player and Party reference sheet:', referenceError);
        }
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                gameState: stripPortraits(gameState),
                storySoFar: storyBeforeAction,
                playerInput,
                referenceImage: sceneReference?.image || '',
                referenceRoster: sceneReference?.roster || []
            })
        });

        if ([402, 503].includes(response.status)) {
            const billingData = await response.json().catch(() => ({}));
            applyCreditPayload(billingData);
            showLicenseModal(billingData.message || 'A Gemini API key is required.');
            thinkingEntry.remove();
            appendToNarrative(`<p class="text-red-500">${escapeUnitHtml(billingData.message || 'A Gemini API key is required.')}</p>`);
            gameState.discussion.awaitingPlayer = true;
            return;
        }

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API Error: ${response.status} - ${errText}`);
        }

        const rawData = await response.text();
        const data = sanitizeJSON(rawData);

        if (data.sceneImage && sceneReference?.fingerprint) {
            gameState.sceneReferenceFingerprint = sceneReference.fingerprint;
        }

        if (typeof data.actionsRemaining === 'number') updateActionsRemaining(data.actionsRemaining, data.creditSource);

        thinkingEntry.remove();

        const narrative = String(data.narrative || 'The situation shifts.');
        storySoFar += `\n> ${playerInput}\n${narrative}`;
        recordDiscussionMessage({ speakerId: 'narrator', name: gameState.language === 'fr' ? 'Narrateur' : 'Narrator', text: narrative, mode: 'narration' });
        appendToNarrative(`<p class="mb-2">${parseMarkdown(narrative)}</p>`);
        applyUpdates(data);
        processNewNpcs();
        processNarrativeDialogue(narrative);
        gmRequestInFlight = false;
        void runPartyDiscussionRound();
    } catch (e) {
        console.error("Action error:", e);
        thinkingEntry.remove();
        appendToNarrative(`<p class="text-red-500">Error connecting to the GM: ${escapeUnitHtml(e.message)}</p>`);
        gameState.discussion.awaitingPlayer = true;
        setDiscussionStatus(gameState.language === 'fr' ? '\u00c0 vous de jouer' : 'Your move', false);
    } finally {
        gmRequestInFlight = false;
        autoSave();
    }
}

function sanitizeJSON(str) {
    try {
        return JSON.parse(str);
    } catch (e) {
        const match = str.match(/\{[\s\S]*\}/);
        if (match) {
            try { return JSON.parse(match[0]); } catch (err) { console.error(err); }
        }
        return {
            narrative: "Communication unstable.",
            hp_change: 0,
            karma_change: 0,
            inventory_changes: [],
            new_locations_unlocked: [],
            quest_updates: []
        };
    }
}

function applyUpdates(data) {
    ensureGameStateShape();
    const normalizedName = value => String(value || '').trim().toLowerCase();
    const presenceBefore = new Map(gameState.party.filter(member => normalizedName(member?.name)).map(member => [normalizedName(member.name), member.presence || 'present']));
    if (typeof data.currentStorySituation === 'string' && data.currentStorySituation.trim()) {
        gameState.currentStorySituation = data.currentStorySituation.trim();
    }
    if (typeof data.storyTitle === 'string' && data.storyTitle.trim()) {
        gameState.storyTitle = data.storyTitle.trim();
    }
    gameState.player.hp += Number.isFinite(Number(data.hp_change)) ? Number(data.hp_change) : 0;
    gameState.player.karma = (Number(gameState.player.karma) || 0) + (Number.isFinite(Number(data.karma_change)) ? Number(data.karma_change) : 0);
    
    if (data.new_locations_unlocked) {
        function mergeLocations(existing, incoming) {
            incoming.filter(incLoc => normalizedName(incLoc?.name)).forEach(incLoc => {
                const found = existing.find(e => normalizedName(e?.name) === normalizedName(incLoc.name));
                if (found) mergeLocations(found.children || (found.children = []), incLoc.children || []);
                else existing.push(incLoc);
            });
        }
        mergeLocations(gameState.knownLocations, data.new_locations_unlocked);
    }
    
    (data.quest_updates || []).filter(newQuest => normalizedName(newQuest?.title)).forEach(newQuest => {
        const existing = gameState.activeQuests.find(q => normalizedName(q?.title) === normalizedName(newQuest.title));
        if (existing) Object.assign(existing, newQuest);
        else gameState.activeQuests.push(newQuest);
    });
    
    // Process Party Updates first
    if (data.party_updates && Array.isArray(data.party_updates)) {
        data.party_updates.filter(newMember => normalizedName(newMember?.name)).forEach(newMember => {
            const existing = gameState.party.find(m => normalizedName(m?.name) === normalizedName(newMember.name));
            let target;
            if (existing) {
                Object.assign(existing, newMember);
                target = normalizeUnit(existing, gameState.party.indexOf(existing), false);
            } else {
                target = normalizeUnit(newMember, gameState.party.length, false);
                gameState.party.push(target);
                appendToNarrative(`<p class="text-yellow-300 font-bold">Recruited: ${newMember.name}</p>`);
            }
            
            // Generate portrait asynchronously if missing
            if (target.portraitPrompt && !target.portrait) {
                fetch('/api/portrait', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ portraitPrompt: target.portraitPrompt })
                }).then(r => r.json()).then(result => {
                    if (result.portrait) {
                        target.portrait = result.portrait;
                        // Refresh the party panel if it's open
                        const partyContent = document.getElementById('party-content');
                        if (partyContent) populateModal('party-modal');
                        autoSave();
                    }
                }).catch(e => console.error('Portrait fetch failed:', e));
            }
        });
    }

    // Process Inventory separately and explicitly
    if (data.inventory_changes && Array.isArray(data.inventory_changes)) {
        console.log("DEBUG: Processing inventory_changes:", data.inventory_changes);
        data.inventory_changes.forEach(change => {
            // SAFETY CHECK: If this looks like a companion, re-route it
            if (change.class || change.isCompanion) {
                console.log("DEBUG: Item detected as companion, re-routing to party:", change);
                const existing = gameState.party.find(m => normalizedName(m?.name) === normalizedName(change.name));
                if (!existing) {
                    gameState.party.push({ name: change.name, class: change.class || 'Companion' });
                    appendToNarrative(`<p class="text-yellow-300 font-bold">Recruited: ${change.name}</p>`);
                }
                return; // Skip inventory processing
            }

            if (change.name) {
                const item = gameState.inventory.find(i => i.name === change.name);
                if(item) {
                    item.qty += (change.qty || 1);
                    appendToNarrative(`<p class="text-blue-300">Updated: ${change.name} (x${item.qty})</p>`);
                } else {
                    const newItem = { 
                        name: change.name, 
                        qty: change.qty || 1, 
                        desc: change.desc || "A mysterious object." 
                    };
                    gameState.inventory.push(newItem);
                    appendToNarrative(`<p class="text-green-300 font-bold">Acquired: ${change.name}</p>`);
                }
            }
        });
    }

    const mapTitle = document.getElementById('map-title');
    if (mapTitle) mapTitle.innerText = gameState.currentLocation;
    
    if(data.sceneImage) {
        displaySceneImage(data.sceneImage);
        gameState.sceneImage = data.sceneImage;
        gameState.previousImagePrompt = data.sceneImagePrompt;
        gameState.sceneRenderVersion = SCENE_RENDER_VERSION;
    }

    updateSidebar();
    updateUI();
    autoSave();
    const presenceChanged = gameState.party.some(member => {
        const prior = presenceBefore.get(normalizedName(member?.name));
        return prior !== undefined && prior !== (member.presence || 'present');
    });
    if (presenceChanged) void restageSceneForPresenceChange();
}

// Helper to convert image URL to Base64
async function getBase64Image(url) {
    if (!url || url.startsWith('data:image')) return url;
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("Failed to convert image to Base64:", e);
        return url;
    }
}

document.getElementById('input').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    const value = event.target.value.trim();
    if (!value || gmRequestInFlight) return;
    event.preventDefault();
    event.target.value = '';
    processAction(value);
});

function saveGame() {
    const blob = new Blob([JSON.stringify({ gameState, storySoFar })], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NodeRPG_Save.json`;
    a.click();
}

async function writeShareUrlToClipboard(url) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        return;
    }
    const input = document.createElement('textarea');
    input.value = url;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    if (!copied) throw new Error('Clipboard access was denied.');
}

function setShareGiftChoice(wantsGift) {
    shareGiftSelected = wantsGift === true && shareGiftEligible;
    const yes = document.getElementById('share-gift-yes');
    const no = document.getElementById('share-gift-no');
    yes?.classList.toggle('is-selected', shareGiftSelected);
    no?.classList.toggle('is-selected', !shareGiftSelected);
    yes?.setAttribute('aria-pressed', String(shareGiftSelected));
    no?.setAttribute('aria-pressed', String(!shareGiftSelected));
}

function updateShareModalLanguage() {
    const fr = gameState.language === 'fr';
    const values = {
        'share-kicker': fr ? 'INSTANTANÉ IMMUABLE DE L’AVENTURE' : 'IMMUTABLE ADVENTURE SNAPSHOT',
        'share-title': fr ? 'Partager ce monde' : 'Share this world',
        'share-copy': fr ? 'Publiez la sauvegarde exacte et copiez un lien permanent.' : 'Publish the exact current save and copy a permanent link.',
        'share-gift-question': fr ? 'Le transfert de crédits est suspendu en mode BYOK.' : 'Credit gifting is paused during BYOK-only mode.',
        'share-final-note': fr ? 'L’instantané est définitif. Il ne peut être ni remplacé ni annulé.' : 'The snapshot is final. It cannot be overwritten or cancelled.',
        'share-copy-button': fr ? 'COPIER LE LIEN' : 'COPY LINK'
    };
    for (const [id, value] of Object.entries(values)) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }
    const yes = document.getElementById('share-gift-yes');
    const no = document.getElementById('share-gift-no');
    if (yes) yes.textContent = fr ? 'OUI' : 'YES';
    if (no) no.textContent = fr ? 'NON' : 'NO';
}

async function checkShareGiftEligibility() {
    const yes = document.getElementById('share-gift-yes');
    const status = document.getElementById('share-gift-status');
    shareGiftEligible = false;
    setShareGiftChoice(false);
    if (yes) yes.disabled = true;
    if (status) {
        status.classList.remove('is-ready');
        status.textContent = '';
    }
}

function copyShareLink() {
    const topButton = document.getElementById('btn-share');
    if (!gameState?.player) {
        if (topButton) topButton.textContent = gameState.language === 'fr' ? 'CHARGEZ UN MONDE' : 'LOAD A WORLD FIRST';
        setTimeout(() => updateUILabels(), 2200);
        return;
    }
    shareGiftSelected = false;
    shareGiftEligible = false;
    updateShareModalLanguage();
    setShareGiftChoice(false);
    const output = document.getElementById('share-url-output');
    if (output) {
        output.value = '';
        output.classList.add('hidden');
    }
    const copyButton = document.getElementById('share-copy-button');
    if (copyButton) copyButton.disabled = false;
    document.getElementById('share-modal')?.classList.remove('hidden');
    void checkShareGiftEligibility();
}

async function publishShareLink() {
    const button = document.getElementById('share-copy-button');
    const status = document.getElementById('share-gift-status');
    const output = document.getElementById('share-url-output');
    if (!gameState?.player) return;
    if (button) {
        button.disabled = true;
        button.textContent = gameState.language === 'fr' ? 'PUBLICATION…' : 'PUBLISHING…';
    }
    try {
        const response = await fetch('/api/init?operation=share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ save: { gameState, storySoFar } })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.id) throw new Error(data.message || data.error || `Share service returned ${response.status}`);
        const shareUrl = new URL(window.location.origin + window.location.pathname);
        shareUrl.searchParams.set('share', data.id);
        if (output) {
            output.value = shareUrl.toString();
            output.classList.remove('hidden');
        }
        let copied = true;
        try { await writeShareUrlToClipboard(shareUrl.toString()); }
        catch (_) { copied = false; }
        if (status) {
            status.classList.add('is-ready');
            status.textContent = copied ? 'Link copied.' : 'Link created. Select and copy it above.';
        }
        if (button) {
            button.textContent = copied
                ? (gameState.language === 'fr' ? 'LIEN COPIÉ ✓' : 'LINK COPIED ✓')
                : (gameState.language === 'fr' ? 'LIEN CRÉÉ' : 'LINK CREATED');
            button.title = 'Immutable snapshot published. This URL cannot be overwritten or revoked.';
        }
    } catch (error) {
        console.error('Share link creation failed:', error);
        if (status) {
            status.classList.remove('is-ready');
            status.textContent = error.message || 'Could not create the share link.';
        }
        if (button) {
            button.disabled = false;
            button.textContent = gameState.language === 'fr' ? 'RÉESSAYER' : 'TRY AGAIN';
        }
    }
}

function restoreSaveSnapshot(data, options = {}) {
    if (!data?.gameState || typeof data.gameState !== 'object') throw new Error('Invalid RPGy save data.');
    gameState = data.gameState;
    storySoFar = typeof data.storySoFar === 'string' ? data.storySoFar : '';
    ensureGameStateShape();
    restoreMissingCustomPortraits();
    gameState.discussion.awaitingPlayer = true;

    document.getElementById('world-browser')?.classList.add('hidden');
    document.getElementById('constructor-view')?.classList.add('hidden');
    const narrative = document.getElementById('narrative');
    if (narrative) {
        narrative.innerHTML = '';
        appendToNarrative(`<p class="mb-2">${parseMarkdown(storySoFar)}</p>`);
        if (options.shared) {
            appendToNarrative(`<p class="text-blue-300 text-xs tracking-wide">${gameState.language === 'fr' ? 'INSTANTANÉ PARTAGÉ CHARGÉ' : 'SHARED SNAPSHOT LOADED'}</p>`);
        }
    }

    updateUI();
    const mapTitle = document.getElementById('map-title');
    if (mapTitle) mapTitle.innerText = gameState.currentLocation;
    if (gameState.sceneImage) displaySceneImage(gameState.sceneImage);
    updateSidebar();
    updateUILabels();
    if (gameState.musicPrompt && soundSettings.music) fetchWorldMusic(gameState.musicPrompt);
    processNewNpcs();
    autoSave();

    if (!options.shared) {
        void repairMissingUnitPortraits().then(() => refreshUnsafeSavedScene());
        void refreshZombieLondonReferenceSceneIfStale();
    }
}

function loadGame(event) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            restoreSaveSnapshot(JSON.parse(e.target.result));
        } catch (error) {
            console.error('Save file load failed:', error);
        }
    };
    reader.readAsText(event.target.files[0]);
}
