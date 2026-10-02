Here is the comprehensive design document. You can save this text exactly as \`GEMINI.md\`. 

When you are ready to start building, you can feed this document into any AI coder (like myself, Gemini, or Claude) and say: \*"Read GEMINI.md and generate the HTML/Tailwind index file,"\* or \*"Read GEMINI.md and write the JavaScript for the Vercel API route."\* It contains everything needed to write the code.

\*\*\*

\# NodeRPG Engine (Master Design & Architecture Document)

---

\`\`\`markdown  
\# AI-Powered RPG Generator Engine  
\*\*File:\*\* \`GEMINI.md\` (Master Design & Architecture Document)  
\*\*Goal:\*\* A theme-agnostic, infinitely generated text-RPG engine where an LLM (Grok) acts as a dynamic Game Master (GM), strictly returning structured JSON to drive hard-coded JavaScript UI and mechanics.

\#\# 1\. Technology Stack  
\*   \*\*Frontend:\*\* HTML5, Vanilla JavaScript, Tailwind CSS (for rapid, theme-agnostic layout).  
\*   \*\*Backend / API:\*\* Vercel Serverless Functions (Node.js) to securely hold the Grok API key and handle AI calls to avoid CORS and security leaks.  
\*   \*\*AI Model:\*\* Grok (uncensored, capable of gritty RPG elements).

\#\# 2\. Core Architecture: The State & Payload  
The game relies on a strict separation of narrative and math. The AI writes the story, but the JavaScript Engine holds the absolute "Truth" (HP, Inventory, Map) in a \`gameState\` object.

\*\*The Master Game State Object:\*\*  
\`\`\`javascript  
let gameState \= {  
    theme: "", // e.g., "Cyberpunk", "Fantasy"  
    gmStyle: "theatrical", // neutral | theatrical | gritty  
    uiLabels: { currency: "", locations: "", npcs: "" },  
    player: {  
        name: "",  
        hp: 100,  
        karma: 0,  
        equipped: \[\], // Gear dictates progression (no abstract EXP)  
        inventory: \[\]  
    },  
    party: \[  
        // { name: "Elara", class: "Rogue", relationship: 50, equipped: "Dagger" }  
    \],  
    knownLocations: \[\],  
    currentLocation: "",  
    activeQuests: \[\],  
    turnCounter: 0  
};  
\`\`\`

\#\# 3\. The Game Phases

\#\#\# Phase 1: Initialization (The Wizard)  
1\. \*\*Master Prompt:\*\* Player enters a single prompt describing the world/character (e.g., "Gritty Steampunk London, I am a detective...").  
2\. \*\*AI Generation:\*\* Engine sends this to Grok to generate the \`gameState\` JSON (currency names, starting gear, main quest).  
3\. \*\*Wizard UI:\*\* The JSON populates an editable HTML form. The player can adjust their name, gear, or goal before clicking \*\*\[ENTER WORLD\]\*\*.

\#\#\# Phase 2: The Main Game Loop  
When the player submits an action via the text box, or clicks a UI button:  
1\. JS shows a loading spinner.  
2\. JS bundles \`gameState\`, \`storySoFar\` (Memory), and the \`playerInput\` into a prompt.  
3\. Vercel backend sends to Grok.  
4\. Grok returns a strictly formatted JSON object:  
\`\`\`json  
{  
  "narrative": "Story text goes here. Interjections from Party members go here.",  
  "hp\_change": \-10,  
  "karma\_change": \-5,  
  "inventory\_changes": \["+Iron Key", "-5 Gold"\],  
  "new\_locations\_unlocked": \["The Sunken Warrens"\],  
  "quest\_updates": \["Find the smuggler: Complete"\]  
}  
\`\`\`  
5\. JS intercepts this JSON, runs \`Regex Sanitizer\` (to prevent crashes if AI hallucinates markdown), and updates the UI (HP bars, adding new map buttons, printing narrative).

\#\# 4\. Key Mechanics

\*   \*\*Procedural Spider-Web Map:\*\* The game starts with 1 location. Based on dialogue/exploration, Grok populates \`"new\_locations\_unlocked"\`. The JS dynamically generates new Tailwind buttons in the Left Navigation Panel.  
\*   \*\*Karma-Morphing World:\*\* The player's Karma score is secretly passed to Grok on every prompt. High karma generates bright, lawful encounters. Low karma (-50+) forces Grok to generate black markets, corrupt NPCs, and ruthless scenarios.  
\*   \*\*Bioware-Style Party:\*\* Companions are tracked in the \`gameState\`. The system prompt instructs Grok to autonomously make companions interject during dialogue based on their hard-coded personality traits, shifting their relationship score.  
\*   \*\*Fail-Forward (No Death):\*\* If JS calculates \`Player HP \<= 0\`, it intercepts the normal loop. It triggers a hidden "Defeat Prompt" forcing Grok to generate a narrative where the player is captured, robbed, or rescued, updating their location and penalizing inventory, rather than a "Game Over."  
\*   \*\*GM Personalities:\*\* The UI contains a toggle (Neutral/Theatrical/Gritty) that injects a specific behavioral string into the master prompt, altering Grok's prose and strictness.

\#\# 5\. Memory Management (Rolling Summary)  
To prevent API token limits and amnesia:  
\*   JS tracks \`turnCounter\`.  
\*   Every 8 turns, JS triggers an asynchronous, background Vercel function.  
\*   The function feeds Grok the current \`storySoFar\` string \+ the last 8 message logs.  
\*   Grok compresses this into a new, single-paragraph \`storySoFar\`.  
\*   This prevents the context window from bloating while retaining plot continuity.

\#\# 6\. Persistence: The Export/Download System  
Because there is no database, the game uses native browser blobs to save/load.  
\*   \*\*\[SAVE GAME\] Button:\*\* Triggers a JS function that stringifies \`gameState\`, \`storySoFar\`, and \`recentMessages\`. It creates a \`Blob\` and forces the browser to download a \`.json\` file (e.g., \`Steampunk\_Arthur\_Save.json\`).  
\*   \*\*\[LOAD GAME\] Button:\*\* Opens an \`\<input type="file"\>\`. JS reads the uploaded JSON, overwrites local variables, and triggers \`refreshUI()\` to restore the session. (Allows for shareable world seeds).

\#\# 7\. UI Layout Structure (Tailwind Skeleton)  
\*   \*\*Top Bar:\*\* Title, HP/Karma Vitals, \[SAVE/LOAD\] Buttons, GM Style Toggle, Settings.  
\*   \*\*Left Panel (25% w):\*\* Dynamic list of discovered \`knownLocations\`. (Clicking sends auto-prompt: "Player travels to \[X\]").  
\*   \*\*Center Panel (50% w):\*\* Narrative output box (\`overflow-y-auto\`) and the player text input field pinned to the bottom.  
\*   \*\*Right Panel (25% w):\*\* Toggleable tabs between \`Nearby Entities\` (generated dynamically per location) and \`Party\` (stats and dialogue buttons for recruited companions), plus the \`Quest Log\`.

\#\# 8\. Development: Crucial JavaScript Failsafes (Continued)  
\*   \*\*JSON Regex Sanitizer:\*\* The engine \*must\* wrap \`JSON.parse()\` in a \`try/catch\`. In the \`catch\`, a Regex function must extract text strictly between the first \`{\` and the last \`}\`. If parsing fails entirely, it must return a fallback JSON object with 0 stat changes and a generic narrative string ("The world shimmers strangely...") to prevent the UI from freezing and allow the player to try their action again.

\#\# 9\. API Prompt Blueprint  
When constructing the payload for the Vercel backend, the system prompt must strictly define the JSON schema so the AI doesn't break the game.

\*\*The Base System Prompt injected into every turn:\*\*  
\> "You are an AI Game Master running a text RPG.   
\> Theme: ${gameState.theme}.   
\> GM Style: ${currentStyle} (Refer to GM Personalities).  
\> The player is currently at: ${gameState.currentLocation}.  
\> Story context: ${storySoFar}.  
\>   
\> You MUST respond ONLY with a valid, parsable JSON object. Do not include conversational text outside the JSON. Do not use markdown code blocks like \`\`\`json.   
\>   
\> Use this EXACT schema:  
\> {  
\>   "narrative": "String (Describe the outcome of the player's action, environmental details, and NPC/Party interjections. Max 2 paragraphs.)",  
\>   "hp\_change": Integer (Negative for damage taken, positive for healing. 0 if none),  
\>   "karma\_change": Integer (0 if no moral shift),  
\>   "inventory\_changes": Array of Strings (e.g. \["+Iron Key", "-10 Credits"\]. Empty array if none),  
\>   "new\_locations\_unlocked": Array of Strings (Names of newly discovered map areas. Empty array if none),  
\>   "quest\_updates": Array of Strings (Details of quest progress made. Empty array if none)  
\> }"

