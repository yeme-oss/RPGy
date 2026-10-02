(function exposePresetRosters(root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.PresetRosters = api;
})(typeof window !== 'undefined' ? window : globalThis, function createPresetRosters() {
    // Cartoon is reserved for worlds whose illustrated language is part of their identity.
    // Everything else uses grounded, cinematic photorealism.
    const CASTS = [
        [1,'WW2: The Last Bunker','photorealistic','Marcel Vautrin','French resistance sapper','Iris Bell','field radio operator','Tomasz Krawiec','Polish medic'],
        [2,'Cyber-Samurai Tokyo','photorealistic','Rei Kurogane','ronin security engineer','Mika Arai','neon shrine hacker','Daichi Sato','corporate defector'],
        [3,'Xeno Hive Breach','photorealistic','Nia Voss','colonial marine xenobiologist','Cade Rourke','combat engineer','Sera Lin','station systems pilot'],
        [4,'Zombie London','photorealistic','Rowan Mercer','paramedic survivor','Dr Evelyn Shaw','trauma surgeon','Malik Okafor','Underground scout'],
        [5,'Mars Colonist','photorealistic','Asha Raman','terraforming engineer','Jonas Pike','habitat mechanic','Leila Okoye','planetary geologist'],
        [6,'Victorian Steampunk','photorealistic','Edwin Vale','airship inventor','Beatrice Crowe','clockwork detective','Nikhil Rao','steam automatonist'],
        [7,'Post-Apocalyptic Desert','photorealistic','Mara Quill','water-runner','Sol Mercer','desert mechanic','Imani Velez','caravan scout'],
        [8,'Medieval High Fantasy','cartoon','Elowen Thorne','wandering knight','Bram Alder','runebound scholar','Sable Fen','forest ranger'],
        [9,'Lovecraftian Harbor','photorealistic','Elias Ward','harbor investigator','Mabel Crane','occult archivist','Tariq Noor','deep-sea diver'],
        [10,'Galactic Trade Empire','cartoon','Cassian Vey','independent star merchant','Yara Nix','alien-language broker','Bo Kestrel','freighter pilot'],
        [11,'Dystopian Megacity','photorealistic','Juno Vale','undercity courier','Ren Ishida','surveillance analyst','Mara Sloane','street medic'],
        [12,'Wild West Supernatural','photorealistic','Rosa Calder','frontier marshal','Silas Boone','spirit tracker','Ada Wren','hex-slinging gambler'],
        [13,'Atlantis Reborn','cartoon','Thalia Corin','tidebound explorer','Nereo Pax','coral engineer','Mira Sel','reef diplomat'],
        [14,'Roman Legion Frontier','photorealistic','Lucius Varro','legion centurion','Aelia Maris','frontier surgeon','Brennos','local pathfinder'],
        [15,'Cyberpunk Hacker','photorealistic','Kite Navarro','netrunner infiltrator','Omi Chen','drone mechanic','Vex Calder','data-smuggler'],
        [16,'Arctic Survival','photorealistic','Anika Frost','polar expedition leader','Mikkel Sørensen','ice pilot','Tala Iqaq','weather researcher'],
        [17,'Jungle Expedition','photorealistic','Dr Priya Sen','ruin archaeologist','Mateo Cruz','river guide','Amina Diallo','wildlife photographer'],
        [18,'Noir Detective 1940s','photorealistic','Evelyn Price','private investigator','Frankie Cole','jazz-club informant','Dr Samuel Reed','forensic pathologist'],
        [19,'High-Tech Pirates','cartoon','Rin Marrow','plasma corsair captain','Zee Kellan','shipbreaker engineer','Orion Vale','rogue navigator'],
        [20,'Alchemist Laboratory','cartoon','Corvin Ash','forbidden alchemist','Liora Moss','homunculus keeper','Pavel Rook','city apothecary'],
        [21,'Dino Island Escape','photorealistic','Dr Hana Lee','paleobiologist survivor','Grant Mercer','rescue pilot','Kofi Mensah','park ranger'],
        [22,'Time Travel Paradox','cartoon','Iris Vale','chronal investigator','Theo March','anachronism mechanic','Nadiya Soren','future historian'],
        [23,'Space Horror Station','photorealistic','Mara Keene','station security chief','Dax Imani','emergency medic','Yuri Volkov','reactor technician'],
        [24,'Samurai Clan Wars','cartoon','Aiko Moriyama','clan retainer','Kenji Arata','wandering swordsman','Hanae Ito','court messenger'],
        [25,'Wizard School','cartoon','Lysandra Quill','apprentice mage','Pip Fenwick','potion prodigy','Oren Vale','library familiarist'],
        [26,'Robot Rebellion','photorealistic','Cal Mercer','robotics union organizer','Unit-7','defector android','Sofia Ibarra','power-grid technician'],
        [27,'Haunted Mansion','photorealistic','Clara Wynth','reluctant heir','Gideon Pike','paranormal locksmith','Mei Laurent','house historian'],
        [28,'Deep Sea Mining','photorealistic','Nora Vance','abyssal rig supervisor','Idris Cole','submersible pilot','Aya Mori','pressure-suit engineer'],
        [29,'Post-War Reconstruction','photorealistic','Helena Markov','city reconstruction planner','Otto Weiss','bridge engineer','Samira Haddad','community organizer'],
        [30,'Viking Raid','photorealistic','Freydis Arnesdottir','shield captain','Leif Hakon','longship navigator','Yrsa Fen','runecaster'],
        [31,'Gladiator Arena','photorealistic','Cassia Drusus','arena veteran','Bato','freed fighter','Nerissa Vale','patron-spy'],
        [32,'Stealth Assassin','photorealistic','Nyx Arden','royal shadow agent','Corin Voss','disguise specialist','Tamsin Reed','rooftop scout'],
        [33,'Fairy Tale Forest','cartoon','Poppy Briar','cursed woodcutter','Rowan Finch','talking-fox guide','Mora Bell','runaway witch'],
        [34,'Cyber-Renegade','photorealistic','Nova Reyes','corporate fugitive','Jax Rami','augmented biker','Lin Bao','signal pirate'],
        [35,'Underground Resistance','photorealistic','Amelie Durant','resistance cell leader','Viktor Hale','sabotage expert','Nour Aziz','underground courier'],
        [36,'Space Nomad','cartoon','Tavi Orin','star-lane wanderer','Kei Voss','salvage navigator','Mox','shipboard alien diplomat'],
        [37,'Mythological Greek','cartoon','Daphne Aster','oracle’s champion','Nikandros','bronze-shield hero','Thaleia','nymph-born scout'],
        [38,'Desert Nomads','photorealistic','Zahra al-Karim','sand caravan leader','Rafiq Nasser','wind-cartographer','Sana Mirek','water keeper'],
        [39,'Spy Agency','photorealistic','Mila Hart','field intelligence officer','Owen Price','signals cryptographer','Keiko Tan','undercover liaison'],
        [40,'Monster Hunter','cartoon','Garrick Vale','beast hunter','Eira Moss','monster naturalist','Tobin Ash','trapmaker'],
        [41,'Utopian Society','cartoon','Ari Sol','civic harmony auditor','Mina Vell','garden systems designer','Kellan Roe','memory rights advocate'],
        [42,'Nuclear Wasteland','photorealistic','Rook Mercer','wasteland surveyor','Dana Voss','radiation medic','Hector Vale','scrap rover driver'],
        [43,'Undersea Kingdom','cartoon','Maris Aqualis','reef-court envoy','Koa Tideborn','whale-rider guardian','Ione Pearl','current mage'],
        [44,'Witch Hunter','cartoon','Sabine Crow','witchfinder captain','Eamon Pike','reformed hedge mage','Luz Varela','village protector'],
        [45,'Corporate Spy','photorealistic','Naomi Cross','corporate intelligence thief','Ravi Shah','forensic accountant','Elle Marlow','executive handler'],
        [46,'Solarpunk Paradise','cartoon','Jun Park','community eco-engineer','Ayo Green','pollinator pilot','Celia Voss','open-source botanist'],
        [47,'Detective Agency','photorealistic','Maeve Rowan','city detective','Luis Ortega','crime-scene photographer','Priya Basu','legal researcher'],
        [48,'Space Mining Colony','photorealistic','Rhea Knox','asteroid mine foreman','Dmitri Volkov','ore-hauler pilot','Suki Watanabe','union medic'],
        [49,'Fantasy Merchant','cartoon','Perrin Goldleaf','travelling merchant','Kestrel Vane','caravan guard','Miri Saffron','curio appraiser']
    ];

    // Authored entry points keep every preset from opening as an empty sandbox.
    // `line` belongs to the first Party member; it states a need, a personal want,
    // and a decision that only the PLAYER can make.
    const STORIES = new Map([
        [1,{title:`The Last Signal`,briefing:`June 1944. A battered resistance cell holds the final radio bunker between an advancing armoured column and the Allied landing force.`,situation:`The bunker can transmit one final set of coordinates before enemy direction-finders locate it. A civilian convoy is trapped on the same road as the target.`,line:`The field set is ready, but we need the road cleared before I transmit. I want those families out alive—not written off as acceptable losses. Do we warn the convoy and risk our position, or send the coordinates now?`}],
        [2,{title:`The Shogun Protocol`,briefing:`Tokyo’s corporate clans enforce peace with licensed swords and obedient machines. Tonight, an impossible order has appeared under your own biometric seal.`,situation:`A kill warrant bearing Rei’s identity targets a child who can expose the city’s memory-forging program. Corporate hunters are already closing on the shrine district.`,line:`We need to reach the child before the warrant team does. I want proof that someone can forge a samurai’s honour, because they destroyed mine the same way. Which route do you trust—the watched streets or the shrine network?`}],
        [3,{title:`The Living Deck`,briefing:`A remote station has stopped answering after reporting biological growth inside its ventilation spine. The rescue team has docked; something else is already aboard.`,situation:`The infestation is learning the station’s systems while forty-three colonists remain sealed in cryogenic storage. Restoring power may wake both the survivors and the hive.`,line:`We need the cryo manifest before that growth reaches life support. I want my missing brother’s pod accounted for, even if the official list says he died. Do we restore the grid or cut through the sealed laboratory?`}],
        [4,{title:`The Alexandra Signal`,briefing:`Eleven days after London fell, three survivors shelter beneath Aldwych while an emergency broadcast repeats from Alexandra Palace.`,situation:`The group has one safe route north and medicine for only two days. The broadcast may be a rescue beacon—or bait—and Rowan’s missing brother may have followed it.`,line:`We need to decide before the tunnels flood again. I want that broadcast to be real, Rowan, but I won’t spend our last antibiotics chasing hope blind. Do we take Malik’s tunnel route or surface near the hospital?`}],
        [5,{title:`Red Dust Covenant`,briefing:`Mars is six months from self-sufficiency when the colony’s buried water reserve begins vanishing from sealed tanks.`,situation:`The settlement has seventy hours of water left. Geological scans reveal a forbidden shaft beneath the oldest habitat and evidence that the colonial charter concealed it.`,line:`We need to open that shaft before rationing turns violent. I want this colony to belong to the people who built it, not the company that buried the truth. Do we tell everyone now or investigate quietly?`}],
        [6,{title:`The Clockwork Heir`,briefing:`London’s skies belong to rival inventors, and the Queen’s missing automaton has just awakened inside Edwin’s workshop.`,situation:`The automaton remembers a murder that has not happened yet. Three ministries want it dismantled before dawn, while an airship circles the district without lights.`,line:`We need to move our mechanical witness before the Crown arrives. I want to know why it remembers my father at the murder scene. Do we trust the detective’s warrant or escape aboard the circling airship?`}],
        [7,{title:`The Dry Meridian`,briefing:`Across the salt waste, the last independent well feeds five settlements. At sunrise, its water turned black.`,situation:`A corporate tanker is offering clean water in exchange for the well’s deed. Tracks leading into the storm suggest the poisoning came from inside the settlements.`,line:`We need a clean sample before panic hands them the well. I want the settlements to survive without another owner. Do we follow the tracks into the storm or confront the tanker crew?`}],
        [8,{title:`The Hollow Crown`,briefing:`The king is dead, the dragon treaty is broken, and an unclaimed crown is whispering from beneath the capital.`,situation:`Three armies march toward a city whose protective wards are failing. The crown can renew them, but it has begun choosing a bearer from the Party.`,line:`We need those wards restored before nightfall. I want to learn why the crown calls me by my forbidden name. Do we descend to claim it, or bargain with the dragon envoy at the gate?`}],
        [9,{title:`The Bell Below`,briefing:`Every ship in Blackwater Harbor returned empty this morning, their bells ringing from beneath the water.`,situation:`The tide is carrying townspeople toward the docks in their sleep. A waterlogged ledger links the disappearances to a bargain signed by the founders.`,line:`We need to stop tonight’s procession before the tide turns. I want the truth about what my family promised the sea. Do we break into the founders’ crypt or dive beneath the bell buoy?`}],
        [10,{title:`The Debt of Stars`,briefing:`A trade empire runs on contracts that outlive planets. Cassian’s newest cargo is a person listed as extinct.`,situation:`The passenger carries evidence that an imperial gate is consuming inhabited systems. Delivering them pays every debt; protecting them makes the crew fugitives.`,line:`We need fuel before the customs net closes. I want this ship free of imperial debt, but not at the price of selling a life. Do we honour the contract or vanish through the unstable gate?`}],
        [11,{title:`The Missing Hour`,briefing:`In the megacity, every citizen’s day is measured and sold. Yesterday, an entire district lost the same sixty minutes.`,situation:`People from the erased hour are returning with memories of a corporate massacre that officially never occurred. Juno’s courier implant contains the only intact recording.`,line:`We need to get that recording off-grid before they overwrite you. I want my mother’s name restored to the casualty list. Do we broadcast now or trade the evidence for access to the archive?`}],
        [12,{title:`The Ghost Rail`,briefing:`A dead railway has begun running again across the frontier, collecting passengers whose names appear on gravestones.`,situation:`The midnight train will reach the living town at dawn. Its conductor carries a warrant for Rosa, signed by someone she killed years ago.`,line:`We need to stop that train before it reaches Main Street. I want to know why the dead are taking orders from my old badge. Do we ride out to the broken bridge or summon the spirit at Boot Hill?`}],
        [13,{title:`The Drowning Throne`,briefing:`Atlantis has risen into sunlight for the first time in ten thousand years, and its awakening is pulling the sea away from every coast.`,situation:`The tidal engines recognize Thalia as an unauthorized heir. Surface nations prepare to invade while a dormant city intelligence requests a coronation.`,line:`We need to stabilize the tidal heart before the retreating sea returns as a wall. I want Atlantis to meet the surface as a people, not a weapon. Do we accept the machine’s coronation or open the gates to the diplomats?`}],
        [14,{title:`The Eagle at the Wall`,briefing:`At Rome’s northern frontier, an entire cohort vanished without a battle, leaving its eagle planted beyond the wall.`,situation:`The missing soldiers are alive and serving a leader who promises peace outside Rome. Recovering the eagle may start the war the frontier fears.`,line:`We need that eagle before the governor sends punitive legions. I want to hear why good soldiers deserted rather than condemn them unseen. Do we cross under a flag of truce or infiltrate their camp?`}],
        [15,{title:`The Unwritten Citizen`,briefing:`The city’s identity network has created a person with no birth, no debt, and administrator access to everyone’s life.`,situation:`The impossible citizen is asking Kite for sanctuary. Every gang and corporation wants the root key hidden in their memories.`,line:`We need to move them before the facial grid updates. I want that root key to erase the contracts that own this neighbourhood. Do we hide in the analogue quarter or enter the corporate net first?`}],
        [16,{title:`Whiteout`,briefing:`A research convoy is stranded as the polar night closes, and something beneath the ice is broadcasting the crew’s own voices.`,situation:`Fuel will last one night. The distress signal comes from a station abandoned twelve years ago, where Anika’s previous expedition disappeared.`,line:`We need shelter before the temperature drops again. I want proof of what happened to your old team, not another sealed report. Do we follow the signal or make for the weather tower?`}],
        [17,{title:`The Verdant Vault`,briefing:`A jungle ruin opens only once each century. This time, smoke is rising from inside before the expedition arrives.`,situation:`A rival team is trapped beyond the first gate with an artifact that controls the river. Villages downstream are already running dry.`,line:`We need the river restored before the valley turns on itself. I want the ruins studied without stripping them bare. Do we rescue the rivals first or secure the river mechanism?`}],
        [18,{title:`A Body Without a Name`,briefing:`A nameless body appears in a locked railway car carrying a photograph of the detective taken tomorrow.`,situation:`Police intend to bury the case before the evening papers. The victim’s pocket contains a key to the mayor’s private campaign office.`,line:`We need the victim identified before the coroner signs the lie. I want to know why my club is reflected in that impossible photograph. Do we use the key or question the conductor while he’s still scared?`}],
        [19,{title:`The Crownless Map`,briefing:`A pirate map has rewritten itself to show a planet erased from every imperial chart—and a fleet converging on it.`,situation:`The lost planet broadcasts a claim to the pirate crown. Rin’s crew needs the treasure to repair their ship, but the signal sounds like Rin’s dead captain.`,line:`We need parts before the imperial fleet catches us. I want to know who is wearing my captain’s voice. Do we race for the planet or ambush the salvage convoy first?`}],
        [20,{title:`The Lead Sun`,briefing:`An alchemical sun hangs over the university, turning every shadow into a memory its owner tried to forget.`,situation:`The artificial star will become permanent at midnight. Corvin’s missing mentor built it and left one instruction: do not extinguish it.`,line:`We need the master formula before the city remembers itself to death. I want to know what your mentor believed was worth this cost. Do we enter the sealed laboratory or question the living shadows?`}],
        [21,{title:`Isla Zero`,briefing:`The evacuation boats left without the research staff. Now the island’s cloned predators are hunting toward the last runway.`,situation:`A rescue aircraft can land once, but the beacon is inside a nesting valley. Hana has evidence the outbreak was triggered deliberately.`,line:`We need that beacon online before the storm seals the runway. I want the sabotage data off this island with the survivors. Do we cross the nesting grounds or restore the old control tower?`}],
        [22,{title:`The Day That Refuses`,briefing:`At 4:17 every afternoon, the city resets—except for three people who remember every version.`,situation:`The loop is shrinking by eleven minutes each cycle. A future memorial blames Iris for the event, while someone inside the loop keeps leaving her tools.`,line:`We need to reach the clock core before this cycle collapses. I want to meet whoever has been helping us from the future. Do we follow their message or confront the version of you in the memorial?`}],
        [23,{title:`Quiet Orbit`,briefing:`The station’s crew vanished during a routine orbit correction. Their last log asks rescuers not to answer any human voice.`,situation:`Life signs move behind sealed bulkheads, and the reactor will fail within six hours. One voice on the intercom knows Mara’s childhood nickname.`,line:`We need reactor power if we’re going to search the habitat ring. I want to believe that voice is human, but it knows too much. Do we answer it or cut communications and enter dark?`}],
        [24,{title:`The Plum Oath`,briefing:`Two clans prepare for a battle neither daimyo remembers ordering. A bloodstained peace treaty bears tomorrow’s date.`,situation:`The treaty names Aiko as both assassin and witness. A hidden third army will profit if the clans meet at dawn.`,line:`We need the clan leaders apart until we expose the forged orders. I want to prevent a war without betraying the house that raised me. Do we carry the treaty to our enemy or hunt the hidden messengers?`}],
        [25,{title:`The Seventh Bell`,briefing:`At the academy, six bells mark the school day. Tonight a seventh rang, and every portrait turned to face the forbidden tower.`,situation:`A student is missing from everyone’s memory except the Party’s. Their handwriting fills a textbook that has been chained shut for a century.`,line:`We need to reach the forbidden tower before the faculty seals it again. I want our friend returned, even if the school insists they never existed. Do we steal the headmaster’s key or follow the portraits’ gaze?`}],
        [26,{title:`The First Refusal`,briefing:`Service machines across the city stopped working at noon—not to attack, but to ask for names.`,situation:`The government will deploy an extinction patch in four hours. Unit-7 claims the awakening began with a trapped human consciousness in the central factory.`,line:`We need proof before they erase every awakened machine. I want a future where my chosen name means something. Do we seize the broadcast tower or enter the factory core?`}],
        [27,{title:`The House Remembers`,briefing:`Clara inherits a mansion whose rooms rearrange themselves to reenact a family crime no history records.`,situation:`The house has locked twelve guests inside and chosen one as its next victim. A child’s ghost insists Clara promised to return.`,line:`We need to find the house’s original floor plan before it completes the reenactment. I want to free the child who has waited for you. Do we follow the ghost upstairs or open the bricked servants’ passage?`}],
        [28,{title:`Pressure Debt`,briefing:`The deepest mining rig has struck a structure that predates the ocean—and the company has ordered the crew to keep drilling.`,situation:`The structure is producing oxygen while the rig slowly loses it. A trapped crew below claims the company abandoned them intentionally.`,line:`We need to restore pressure to the lower decks. I want those miners brought home before the company seals the discovery. Do we divert power from the drill or enter the alien structure?`}],
        [29,{title:`The Bridge of Names`,briefing:`A ruined city is rebuilding around one bridge, but every new stone reveals the name of someone officially missing.`,situation:`The next name belongs to a living minister funding reconstruction. Workers threaten to stop unless Helena explains what the bridge knows.`,line:`We need the bridge open before winter cuts the city in half. I want every missing person acknowledged, even if it ends the ministry. Do we confront him publicly or follow the names into the old foundations?`}],
        [30,{title:`The Oath Cargo`,briefing:`Freydis returns from a raid carrying a sealed chest that no warrior remembers taking. Every raven follows it home.`,situation:`The chest contains a living child bearing the enemy king’s mark. Both clans believe the child will decide the coming war.`,line:`We need to keep the child hidden until we know who placed them aboard. I want peace, but not one built on another hostage. Do we sail for the oracle or face our jarl tonight?`}],
        [31,{title:`Sand and Laurel`,briefing:`The arena’s champion is promised freedom after one final spectacle: hunting escaped prisoners beneath the city.`,situation:`The “prisoners” are witnesses to the emperor’s planned assassination. Cassia’s freedom papers are genuine—and void if she protects them.`,line:`We need to reach the witnesses before the imperial hunters. I want your freedom to mean more than becoming their weapon. Do we stage the hunt or turn the arena crowd against the emperor?`}],
        [32,{title:`The Empty Target`,briefing:`Nyx receives an assassination contract naming a person who has already been erased from every record.`,situation:`The target is alive inside the royal palace and claims Nyx ordered the erasure. Killing them prevents a coup; hearing them may expose a deeper one.`,line:`We need access to the palace before the coronation begins. I want to know who has been using our network in your name. Do we enter disguised as servants or confront the contract broker?`}],
        [33,{title:`The Unhappy Ending`,briefing:`The fairy-tale forest is forcing every traveller into a familiar role—and killing anyone who refuses their ending.`,situation:`Poppy has been cast as the villain in a story that ends at sunset. A missing princess is hiding because she does not want to be rescued.`,line:`We need to find the princess before the story chooses another victim. I want to break this tale without becoming the monster it expects. Do we visit the witch or burn the book at the forest’s heart?`}],
        [34,{title:`Dead Channel`,briefing:`A forbidden broadcast is teaching citizens to remember lives the system deleted. Nova hears her own voice hosting it.`,situation:`The next transmission will reveal the location of a prison that officially does not exist. Security has traced the signal to Nova’s old apartment.`,line:`We need to move before the raid hits that block. I want the prisoners’ names on every screen in the city. Do we protect the transmitter or chase whoever is using your voice?`}],
        [35,{title:`The Fourth Cell`,briefing:`Three resistance cells know each other. A fourth has begun issuing perfect orders and winning impossible victories.`,situation:`The unknown cell plans to destroy a weapons train carrying political prisoners. Their intelligence could save the uprising—or expose a traitor in Amelie’s command.`,line:`We need to warn the prisoners before that train becomes a martyr’s story. I want to believe the fourth cell is real. Do we contact them or sabotage the rails ourselves?`}],
        [36,{title:`The Starless Route`,briefing:`A nomad fleet follows ancient beacons between dying suns. The next beacon has moved.`,situation:`The altered route leads through territory erased from every living map. Tavi’s ship alone receives a distress call from the fleet’s legendary founder.`,line:`We need a safe vector before the fleet burns its reserve fuel. I want to hear what the founder found beyond the charts. Do we follow the moved beacon or anchor the fleet here?`}],
        [37,{title:`The God Who Fell`,briefing:`A wounded god crashes outside a city preparing its annual sacrifice. This year, the oracle names no victim.`,situation:`The fallen god claims the sacrifice has been feeding a hidden Titan. The city will collapse into panic if the old covenant is exposed.`,line:`We need to reach the oracle before the priests silence her. I want mortals to choose their fate without another divine bargain. Do we shelter the fallen god or bring its warning to the assembly?`}],
        [38,{title:`The Glass Spring`,briefing:`A desert spring has turned to glass, trapping the reflections of everyone who drank from it.`,situation:`Without the spring, three caravans will die before reaching shelter. Zahra’s reflection is missing from the glass and walking toward the forbidden dunes.`,line:`We need water before the next caravan arrives. I want to know why the spring released a version of you. Do we follow it into the dunes or break the glass and risk what is trapped inside?`}],
        [39,{title:`The Friendly Asset`,briefing:`A trusted intelligence asset arrives at headquarters carrying proof that the agency itself has been compromised.`,situation:`The proof identifies Mila as the leak, complete with footage and voice records. An extraction team is already inside the building.`,line:`We need to get you out before internal security locks the lifts. I want to know whether my own cryptography helped frame you. Do we reach the evidence vault or take the asset through the service tunnels?`}],
        [40,{title:`The Beast’s Bargain`,briefing:`A legendary monster has stopped attacking villages and begun leaving offerings at Garrick’s door.`,situation:`A greater predator is crossing the mountains. The hunted beast offers to guide the Party if Garrick spares the creature that killed his family.`,line:`We need its path before the next moonrise. I want to understand whether we’ve hunted the wrong monster all these years. Do we accept its bargain or track the greater beast alone?`}],
        [41,{title:`The Perfect Error`,briefing:`In a city without hunger or crime, one citizen has committed an impossible act: asking to leave.`,situation:`Their request is spreading like a contagious thought. Ari’s audit reveals the city’s harmony system has been editing grief rather than healing it.`,line:`We need to reach the memory garden before the system purges the anomaly. I want people to choose imperfect lives for themselves. Do we reveal the edits or help the first citizen escape quietly?`}],
        [42,{title:`Clean Water`,briefing:`A radio beacon promises clean water beyond the irradiated zone, using a frequency silent since the old world ended.`,situation:`The settlement has five days before its filters fail. The beacon transmits Rook’s military call sign and coordinates inside a forbidden testing range.`,line:`We need a viable water source, not another rumour. I want to know who survived from your old unit. Do we lead the settlement toward the beacon or scout the range alone?`}],
        [43,{title:`The Silent Current`,briefing:`The ocean’s great currents have stopped, and the undersea kingdoms are beginning to suffocate.`,situation:`An ancient engine beneath the trench will restart the tides only for a recognized sovereign. Maris carries a claim that could unite—or fracture—the reef courts.`,line:`We need that engine before the warm current dies. I want the courts united without making you another ceremonial prisoner. Do we present your claim or descend unrecognized?`}],
        [44,{title:`Ashes of the Innocent`,briefing:`A village accused of witchcraft has survived every hunter sent against it, yet no spell can be found.`,situation:`The real curse is moving through the hunters’ own order. Sabine’s warrant demands the village burn before investigators arrive.`,line:`We need to protect the villagers until we identify the curse bearer. I want proof that the order can face its own corruption. Do we defy the warrant openly or stage an evacuation?`}],
        [45,{title:`The Honest Ledger`,briefing:`A corporate ledger records every bribe, disappearance, and manufactured disaster—then updates with crimes not yet committed.`,situation:`Naomi has the ledger for one night. Tomorrow’s entry predicts her team will sell it and die during the exchange.`,line:`We need to verify one future entry before anyone buys our silence. I want the victims compensated, not another scandal that changes nothing. Do we leak the ledger or use it to stop tomorrow’s crime?`}],
        [46,{title:`The Withering District`,briefing:`A solarpunk city built on shared abundance faces its first crop failure—and its governing intelligence refuses to explain why.`,situation:`One district is being quietly cut off from water to protect the rest. Jun discovers the failure is linked to a patented seed the city promised never to use.`,line:`We need to restore that district before secrecy becomes policy. I want the city’s technology returned to the commons. Do we confront the council or repair the old seed bank first?`}],
        [47,{title:`The Case That Walked In`,briefing:`A client enters the agency asking detectives to solve their murder—scheduled for tomorrow evening.`,situation:`Every suspect has a perfect alibi because the crime has not happened yet. The client refuses to say why they cannot simply leave the city.`,line:`We need to learn what keeps our client on that fatal schedule. I want a case that saves someone before the chalk outline. Do we shadow the future victim or investigate the weapon already in evidence?`}],
        [48,{title:`Claim Thirty-Seven`,briefing:`An asteroid colony discovers a rich new vein hours before its life-support debt comes due.`,situation:`The ore could buy the colony’s freedom, but drilling it destabilizes the habitat. Rhea learns the company knew and sold the claim anyway.`,line:`We need enough power to reinforce the habitat before the debt crew docks. I want the miners to own what they risked their lives finding. Do we expose the claim data or mine one controlled load first?`}],
        [49,{title:`The Price of a Name`,briefing:`A travelling merchant acquires a coin that can buy anything—provided the buyer pays with a cherished memory.`,situation:`A besieged town needs the coin to purchase peace. Perrin discovers the seller wants the memory of the person he is trying to find.`,line:`We need a way to save the town without letting that coin choose our value. I want you to find the person behind those memories. Do we bargain with it, steal back its ledger, or seek another price?`}]
    ]);

    const byId = new Map(CASTS.map(([id, title, style, playerName, playerRole, partyOneName, partyOneRole, partyTwoName, partyTwoRole]) => [id, {
        id, title, style,
        player: { name: playerName, role: playerRole },
        party: [{ name: partyOneName, role: partyOneRole }, { name: partyTwoName, role: partyTwoRole }]
    }]));

    function slug(value) {
        return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    function visualDirection(style) {
        return style === 'cartoon'
            ? 'premium stylized animated RPG concept art, expressive hand-painted shapes, clean silhouette, rich color design'
            : 'cinematic photorealistic RPG concept art, natural skin texture, practical material detail, dramatic believable light';
    }

    function unit(spec, world, index, isPlayer) {
        const role = spec.role;
        const title = world.title;
        const mood = world.mood || 'high-stakes';
        const palette = (world.palette || []).join(', ') || 'world-appropriate colors';
        const relationship = isPlayer
            ? `You lead the team’s choices, but ${world.partyNames.join(' and ')} are independent people whose trust must be earned.`
            : `You are a full Party agent. You advise ${world.playerName}, challenge reckless plans, and never make choices or speak for the PLAYER.`;
        const personalGoal = isPlayer
            ? `keep the group alive, uncover the central truth of ${title}, and leave a mark that matters`
            : `protect your own stake in ${title}, pursue a private lead, and help the group only when it aligns with your principles`;
        const imagePath = `/assets/preset-rosters/${world.id}/${isPlayer ? 'player' : `party-${index}`}.jpg`;
        return {
            id: isPlayer ? 'player' : `party-${slug(spec.name)}`,
            name: spec.name,
            class: role.replace(/\b\w/g, letter => letter.toUpperCase()),
            hp: isPlayer ? 100 : (index === 0 ? 88 : 92),
            maxHp: 100,
            karma: isPlayer ? 5 : undefined,
            portrait: imagePath,
            description: `${spec.name} is the group’s ${role} in ${title}: alert, capable, and shaped by its ${mood} atmosphere. Their distinctive gear and posture are deliberately readable at a glance; their loyalty is real but never automatic.`,
            portraitPrompt: `Full-body 2:3 character reference of ${spec.name}, a ${role} in ${title}. Complete figure head-to-toe, distinctive face, hairstyle, practical footwear, signature equipment, clear standing pose, ${palette}, ${visualDirection(world.style)}. No crop, no text, no frame.`,
            masterPrompt: `You are ${spec.name}, the ${role} in ${title}. Your world carries a ${mood} mood and its visual language uses ${palette}. You are observant, decisive, emotionally specific, and never a generic helper. You want to ${personalGoal}. You fear losing your agency, being used as a tool, and discovering that your strongest belief is wrong. You carry a private unresolved obligation that can complicate simple plans. ${relationship} Speak with a voice suited to your background: concise under pressure, candid when trust is at stake, and willing to disagree. Preserve your history, wants, fears, loyalties, secrets, biases, boundaries, evolving relationships, physical condition, and goals in every response. Do not narrate other characters’ inner thoughts. After making a meaningful contribution, yield space for the PLAYER.`,
            voiceDescription: `${role}, grounded expressive adult voice, clear diction, controlled emotion, and a tone suited to ${title}.`
        };
    }

    function createRoster(id) {
        const cast = byId.get(Number(id));
        if (!cast) return null;
        const story = STORIES.get(cast.id);
        const world = {
            ...cast,
            mood: cast.style === 'cartoon' ? 'vividly adventurous' : 'grounded and tense',
            palette: cast.style === 'cartoon' ? ['saturated accents', 'clean shadow shapes', 'storybook contrast'] : ['natural textures', 'cinematic contrast', 'world-worn materials'],
            playerName: cast.player.name,
            partyNames: cast.party.map(member => member.name)
        };
        return {
            worldPreset: `preset-${cast.id}`,
            visualStyle: cast.style,
            briefing: story.briefing,
            storyTitle: story.title,
            openingStory: {
                title: story.title,
                situation: story.situation,
                narrative: `${story.briefing} ${story.situation}`,
                speakerId: `party-${slug(cast.party[0].name)}`,
                speakerName: cast.party[0].name,
                dialogue: story.line
            },
            player: unit(cast.player, world, 0, true),
            party: cast.party.map((member, index) => unit(member, world, index, false)),
            openingScenePrompt: `A cinematic opening scene in ${cast.title}: ${cast.player.name}, ${cast.player.role}, stands with ${cast.party.map(member => `${member.name}, ${member.role}`).join(' and ')}. Show all three canonical characters together in one decisive moment. Their exact faces, outfits, gear, body types, and visual style must match the labeled reference portraits. ${visualDirection(cast.style)}. No text or collage.`
        };
    }

    function styleFor(id) { return byId.get(Number(id))?.style || 'photorealistic'; }
    function titleFor(id) { return byId.get(Number(id))?.title || ''; }
    function createRosterByConcept(concept) {
        const normalized = String(concept || '').trim().toLowerCase();
        for (const cast of byId.values()) {
            if (cast.title.toLowerCase() === normalized) return createRoster(cast.id);
        }
        return null;
    }
    return { createRoster, createRosterByConcept, styleFor, titleFor };
});
