(function exposeDialogueRouting(root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.DialogueRouting = api;
})(typeof window !== 'undefined' ? window : globalThis, function createDialogueRouting() {
    function normalize(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[’']/g, "'");
    }

    function escapeRegExp(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function aliasesFor(member) {
        const fullName = normalize(member?.name).trim();
        if (!fullName) return [];
        const parts = fullName.split(/\s+/).filter(part => part.length >= 3);
        return [...new Set([fullName, ...parts])].sort((a, b) => b.length - a.length);
    }

    function findAddressedPartyMember(text, party) {
        const normalized = normalize(text).trim();
        if (!normalized || !Array.isArray(party)) return null;

        const questionCue = normalized.includes('?') || /\b(what|why|how|where|when|who|which|can|could|would|should|do you|are you|will you|tell me|your opinion|think|penses|pensez|pourquoi|comment|ou|quand|qui|quel|peux|pouvez|devrait|dis-moi|ton avis|votre avis)\b/.test(normalized);

        for (const member of party) {
            for (const alias of aliasesFor(member)) {
                const boundary = escapeRegExp(alias).replace(/\\ /g, '\\s+');
                const mention = new RegExp(`(?:^|[\\s,;:!?@])${boundary}(?=$|[\\s,;:!?])`, 'i');
                if (!mention.test(normalized)) continue;

                const opensWithName = new RegExp(`^@?${boundary}(?=$|[\\s,;:!?])`, 'i').test(normalized);
                const explicitVerb = new RegExp(`\\b(?:ask|tell|question|parle|demande|dis)\\b[^.!?]{0,80}${boundary}`, 'i').test(normalized);
                if (questionCue || opensWithName || explicitVerb) return member;
            }
        }
        return null;
    }

    return { findAddressedPartyMember };
});
