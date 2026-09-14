// Dungeon Coursers Breeding Calculator
// Because doing genetics by hand is suffering

// Ye olde tab switcheroo — now delegated to the app shell (app.js), which owns
// the top-nav routing. Kept as a thin shim so the engine's own callers
// (fillParents, fillChimeraCalculator) don't need to know how navigation works.
function switchTab(tabName) {
    if (window.AppShell && window.AppShell.switchTab) {
        window.AppShell.switchTab(tabName);
    }
}

// Privacy-first usage counter: sends the event name and nothing else — no
// properties, no genotypes, no input. Counts how often a tool is actually used
// (and where people hit friction), not just that its tab was opened.
// No-op when PostHog is absent (ad-blocker, Do Not Track, blanked key).
function trackUse(name) {
    if (window.posthog && window.posthog.capture) window.posthog.capture(name);
}

// The stable: where all your precious pixel ponies live
let horseCollection = [];

// --- Seam for the app shell (app.js) ---------------------------------------
// app.js owns persistence (localStorage) and the collection UI; the engine
// stays the source of truth for genetics. These let the shell read/replace the
// working collection without the engine caring where the data came from.
window.getCollection = function () { return horseCollection; };
window.applyCollection = function (arr) {
    horseCollection = Array.isArray(arr) ? arr.slice() : [];
    const cs = document.getElementById('collectionStatus');
    if (cs) cs.style.display = horseCollection.length ? 'block' : 'none';
    const hc = document.getElementById('horseCount');
    if (hc) hc.textContent = horseCollection.length;
    return horseCollection;
};

// Convince the browser to eat a spreadsheet
document.addEventListener('DOMContentLoaded', function() {
    const csvInput = document.getElementById('csvUpload');
    if (csvInput) {
        csvInput.addEventListener('change', handleCSVUpload);
    }

    // Press Escape to flee the modal like a coward fleeing the final boss
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeSearchModal();
    });
    const modalOverlay = document.getElementById('searchModal');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', function(e) {
            if (e.target === modalOverlay) closeSearchModal();
        });
    }
});

function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        parseCSV(text);
    };
    reader.readAsText(file);
}

// Pure parse: text in, structured horses out. No globals, no DOM — so the
// import wizard (app.js) can preview & validate before anything is committed.
// Returns { headerDetected, horses: [...] } where each horse also carries the
// source row number for error reporting.
window.parseHorsesCSV = function (text) {
    const lines = text.split('\n');
    const firstLineValues = parseCSVLine(lines[0] || '');
    const firstLineLower = firstLineValues.map(v => v.trim().toLowerCase());

    // Detect whether this CSV was lovingly hand-crafted or catapulted at us from the ramparts
    const knownHeaders = ['genotype', 'temperament', 'name', 'id', 'variant'];
    const hasHeaders = firstLineLower.some(h => knownHeaders.includes(h));

    let headers;
    let startLine;
    if (hasHeaders) {
        headers = firstLineLower;
        startLine = 1;
    } else {
        // No headers? Bold move. We'll wing it like a courser jumping a bottomless chasm.
        headers = ['id', 'name', 'genotype', 'temperament', 'variant'];
        startLine = 0;
    }

    const horses = [];
    const skipped = []; // rows with content but no genotype — surfaced, not dropped
    for (let i = startLine; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const values = parseCSVLine(lines[i]);
        const horse = {};
        headers.forEach((header, index) => {
            horse[header] = values[index] ? values[index].trim() : '';
        });

        // A genotype is the one field a horse can't do without. Keep everything
        // that has one (even with a blank temperament — that's flagged in the
        // preview, not silently discarded). Genotype-less rows go to `skipped`
        // so the wizard can tell the user instead of them just vanishing.
        if (horse.genotype) {
            horses.push({
                id: horse.id || horse.name || `Horse ${i}`,
                name: horse.name || `Horse ${i}`,
                genotype: horse.genotype,
                temperament: horse.temperament || '',
                variant: horse.variant || '',
                _row: i + 1
            });
        } else {
            skipped.push({ row: i + 1, raw: lines[i].trim() });
        }
    }
    return { headerDetected: hasHeaders, horses, skipped };
};

function parseCSV(text) {
    const { horses } = window.parseHorsesCSV(text);
    horseCollection = horses;

    if (window.AppShell && window.AppShell.onCollectionChanged) {
        // Let the shell merge/persist and refresh the collection UI.
        window.AppShell.onCollectionChanged(horseCollection, { persist: true, replace: true });
    } else {
        const cs = document.getElementById('collectionStatus');
        if (cs) cs.style.display = 'block';
        const hc = document.getElementById('horseCount');
        if (hc) hc.textContent = horseCollection.length;
    }

    console.log(`Loaded ${horseCollection.length} horses:`, horseCollection);
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    
    return result.map(val => val.replace(/^"|"$/g, ''));
}

// The sacred scrolls of coat color — transcribed at 3am by candlelight, errors are lore-accurate
const COAT_COLORS = {
    'EE_AA': 'Bay', 'Ee_AA': 'Bay', 'EE_Aa': 'Bay', 'Ee_Aa': 'Bay',
    'EE_aa': 'Black', 'Ee_aa': 'Black',
    'ee_AA': 'Chestnut', 'ee_Aa': 'Chestnut', 'ee_aa': 'Chestnut'
};

// The VIP lounge — coats so fancy they got their own titles at the royal naming ceremony
const SPECIAL_COAT_NAMES = {
    // One scoop of Cream — entry-level bougie
    'Bay_Cream': 'Buckskin',
    'Black_Cream': 'Smoky Black',
    'Chestnut_Cream': 'Palomino',

    // Double Cream — for when your horse demands to speak to the stable manager
    'Bay_Double Cream': 'Perlino',
    'Black_Double Cream': 'Smoky Cream',
    'Chestnut_Double Cream': 'Cremello',

    // Tapestry — congratulations, your horse is a medieval interior decoration
    'Bay_Tapestry': 'Madder',
    'Black_Tapestry': 'Woad',
    'Chestnut_Tapestry': 'Weld',

    // Pearl — looted from a dungeon oyster on floor 47, probably
    'Bay_Pearl': 'Bay Pearl',
    'Black_Pearl': 'Black Pearl',
    'Chestnut_Pearl': 'Gold Pearl',

    // Champagne dilutions — pop the cork, your horse is celebrating
    'Bay_Champagne': 'Amber Champagne',
    'Black_Champagne': 'Classic Champagne',
    'Chestnut_Champagne': 'Gold Champagne',

    // Ether dilutions — your horse is literally fading into the ethereal plane
    'Bay_Ether': 'Ombre Ether',
    'Black_Ether': 'Classic Ether',
    'Chestnut_Ether': 'Cold Ether',

    // Cream Pearl — the Cream fancy names carry through when Pearl tags along
    'Bay_Cream Pearl': 'Buckskin Pearl',
    'Black_Cream Pearl': 'Smoky Black Pearl',
    'Chestnut_Cream Pearl': 'Palomino Pearl',

    // Tapestry + Cream — a wall hanging dipped in artisanal buttercream
    'Bay_Tapestry Cream': 'Madder Buckskin',
    'Black_Tapestry Cream': 'Woad Smoky Black',
    'Chestnut_Tapestry Cream': 'Weld Palomino',

    // Tapestry Ether — a ghostly wall hanging, very haunted chic
    'Bay_Tapestry Ether': 'Madder Ether',
    'Black_Tapestry Ether': 'Woad Ether',
    'Chestnut_Tapestry Ether': 'Weld Ether',

    // Pearl Ether — iridescent AND translucent, show-off
    'Bay_Pearl Ether': 'Bay Pearl Ether',
    'Black_Pearl Ether': 'Black Pearl Ether',
    'Chestnut_Pearl Ether': 'Gold Pearl Ether',

    // Pearl Champagne — sparkly AND bubbly, the life of the dungeon party
    'Bay_Pearl Champagne': 'Bay Pearl Champagne',
    'Black_Pearl Champagne': 'Black Pearl Champagne',
    'Chestnut_Pearl Champagne': 'Gold Pearl Champagne',

    // Cream Champagne — your horse orders the most expensive drink at every tavern
    // Double Cream (CrCr) uses the same name, just presents paler
    'Bay_Cream Champagne': 'Amber Cream Champagne',
    'Black_Cream Champagne': 'Classic Cream Champagne',
    'Chestnut_Cream Champagne': 'Gold Cream Champagne',
    // Double Cream Champagne: likewise, two Creams with any Champagne. Legendary.
    'Bay_Double Cream Champagne': 'Perlino Champagne',
    'Black_Double Cream Champagne': 'Smoky Cream Champagne',
    'Chestnut_Double Cream Champagne': 'Cremello Champagne',
    // Nacre: two Pearl genes lighting up the carried Ether in a Cher pair.
    // resolveTraits and the chimera engine label that combination 'Nacre'.
    'Bay_Nacre': 'Cerulean Bay Nacre',
    'Black_Nacre': 'Saffron Black Nacre',
    'Chestnut_Nacre': 'Rose Gold Nacre',

    // Cream Ether — fancy AND barely corporeal, the ultimate flex
    // Double Cream (CrCr) uses the same name, just presents paler
    'Bay_Cream Ether': 'Ombre Cream Ether',
    'Black_Cream Ether': 'Classic Cream Ether',
    'Chestnut_Cream Ether': 'Cold Cream Ether',
    // Ash Ether: the second Cream gene used to be invisible here. Legendary.
    'Bay_Double Cream Ether': 'Ombre Ash Ether',
    'Black_Double Cream Ether': 'Classic Ash Ether',
    'Chestnut_Double Cream Ether': 'Cold Ash Ether',

    // Tapestry Champagne — woven AND fizzy, the sommelier's tapestry
    'Bay_Tapestry Champagne': 'Madder Champagne',
    'Black_Tapestry Champagne': 'Woad Champagne',
    'Chestnut_Tapestry Champagne': 'Weld Champagne',

    // Cream Pearl Champagne (triple dilution) — this horse has THREE trust funds
    'Bay_Cream Pearl Champagne': 'Amber Cream Pearl Champagne',
    'Black_Cream Pearl Champagne': 'Classic Cream Pearl Champagne',
    'Chestnut_Cream Pearl Champagne': 'Gold Cream Pearl Champagne',

    // Cream Pearl Ether (triple dilution) — so diluted it's basically a rumor of a horse
    'Bay_Cream Pearl Ether': 'Ombre Cream Pearl Ether',
    'Black_Cream Pearl Ether': 'Classic Cream Pearl Ether',
    'Chestnut_Cream Pearl Ether': 'Cold Cream Pearl Ether',

    // Tapestry Cream Ether (triple dilution) — a ghost woven into a fancy throw blanket
    'Bay_Tapestry Cream Ether': 'Madder Cream Ether',
    'Black_Tapestry Cream Ether': 'Woad Cream Ether',
    'Chestnut_Tapestry Cream Ether': 'Weld Cream Ether',

    // Tapestry Pearl (double dilution) — a pearlescent tapestry, very museum gift shop
    'Bay_Tapestry Pearl': 'Tyrian Pearl',
    'Black_Tapestry Pearl': 'Phthalo Pearl',
    'Chestnut_Tapestry Pearl': 'Ochre Pearl',

    // Tapestry Pearl Champagne (triple dilution) — we've gone full boss-drop territory
    'Bay_Tapestry Pearl Champagne': 'Tyrian Pearl Champagne',
    'Black_Tapestry Pearl Champagne': 'Phthalo Pearl Champagne',
    'Chestnut_Tapestry Pearl Champagne': 'Ochre Pearl Champagne',

    // Tapestry Pearl Ether (triple dilution) — if this horse was any more diluted it would evaporate
    'Bay_Tapestry Pearl Ether': 'Tyrian Pearl Ether',
    'Black_Tapestry Pearl Ether': 'Phthalo Pearl Ether',
    'Chestnut_Tapestry Pearl Ether': 'Ochre Pearl Ether',

    // Tapestry Cream Champagne (triple dilution) — peak horse aristocracy achieved
    'Bay_Tapestry Cream Champagne': 'Madder Cream Champagne',
    'Black_Tapestry Cream Champagne': 'Woad Cream Champagne',
    'Chestnut_Tapestry Cream Champagne': 'Weld Cream Champagne'
};

const DILUTION_NAMES = {
    // Locus 1: Cr, Tp, prl — three dilutions crammed into one locus like adventurers in a tavern booth
    'nCr': 'Cream', 'Cr': 'Cream', 'CrCr': 'Double Cream',
    'nTp': 'Tapestry', 'Tp': 'Tapestry', 'TpTp': 'Tapestry',
    'prlprl': 'Pearl',
    'Crprl': 'Cream Pearl',
    'TpCr': 'Tapestry Cream',
    'Tpprl': 'Tapestry Pearl',

    // Locus 2: Ch, er — roommates who don't get along; Ch always hogs the spotlight
    'nCh': 'Champagne', 'Ch': 'Champagne', 'ChCh': 'Champagne',
    'erer': 'Ether',
    'Cher': 'Champagne'
};

const MODIFIER_NAMES = {
    'nD': 'Dun', 'DD': 'Dun',
    'nP': 'Pangare', 'PP': 'Pangare',
    'nSty': 'Sooty', 'StySty': 'Sooty',
    'nG': 'Gray', 'GG': 'Gray',
    'nf': 'Flaxen', 'ff': 'Flaxen',
    'nZ': 'Silver', 'ZZ': 'Silver',
    'nLu': 'Illuminated', 'LuLu': 'Illuminated',
    'nsp': 'Sepulchered', 'spsp': 'Sepulchered',
    'Lusp': 'Illuminated Sepulchered',
    'nTd': 'Tabard', 'TdTd': 'Tabard',
    'nGl': 'Gilt', 'GlGl': 'Gilt',
    'nV': 'Vellum', 'VV': 'Vellum',
    'nOp': 'Opal', 'OpOp': 'Opal',
    'nPr': 'Prism', 'PrPr': 'Prism',
    'PrOp': 'Prism Opal',
    'nsf': 'Starfield', 'sfsf': 'Starfield',
    'nlr': 'Lacquer', 'lrlr': 'Lacquer',
    // Pitch shares Gray's locus: Gray whitens with age, Pitch blackens, and a
    // horse carrying both settles somewhere in the middle.
    'nPt': 'Pitch', 'PtPt': 'Pitch',
    'GPt': 'Gray Pitch', 'PtG': 'Gray Pitch',
    // Ingot recolours every white marking one metallic colour. Dominant.
    'nIn': 'Ingot', 'InIn': 'Ingot',
    // Mithril is a recessive gloss over the whole coat: it needs both copies.
    'nmt': 'Carrying Mithril', 'mtmt': 'Mithril',
    // Damascus shares Dun's locus and only shows when paired WITH Dun (DmD), so
    // a horse holding Dm without a D carries it silently, however many copies.
    'nDm': 'Carries Damascus', 'DmDm': 'Carries Damascus',
    'DmD': 'Damascus Dun', 'DDm': 'Damascus Dun'
};

// Traits that swagger in BEFORE the coat color, like heralds announcing the king
const TRAITS_BEFORE_COAT = [
    'Dominant White', 'Crowned', 'Flaxen', 'Carrying Flaxen', 'Pangare',
    'Sooty', 'Gray', 'Pitch', 'Silver', 'Illuminated', 'Gilt', 'Opal', 'Prism',
    'Starfield', 'Carrying Starfield', 'Vellum', 'Lacquer', 'Carrying Lacquer'
];

// Traits that trail AFTER the coat color like a horse's entourage
const TRAITS_AFTER_COAT = [
    'Dun', 'Tabard', 'Cuirass', 'Sepulchered', 'Carrying Sepulchered',
    // White markings tag along at the back like they missed the group photo
    'Tobiano', 'Overo', 'Splash', 'Roan', 'Sabino', 'Blanket', 'Snowcap',
    'Varnish Roan', 'Leopard', 'Fewspot', 'Snowflake', 'Ossuary',
    'Shroud', 'Filigree', 'Carrying Filigree', 'Harlequin', 'Rabicano', 'False Leopard',
    'Girdle', 'Collar', 'Apron', 'Greaves', 'Blanched',
    // KIT compound phenotypes — when one white pattern wasn't dramatic enough
    'Tobiano Roan', 'Tobiano Sabino', 'Tobiano Dominant White',
    'Roan Sabino', 'Roan Dominant White', 'Sabino Dominant White',
    // B/Fl compound — the buddy-cop duo of markings
    'Blanched False Leopard',
    // Gi/Co compound — accessorized from both ends
    'Girdle Collar',
    // Gr/Ap compound
    'Greaves Apron',
    // Modifiers that read after the coat
    'Ingot', 'Damascus', 'Mithril',
    // Carrier traits — the "I swear it's in my bloodline" genes
    'Carries Ether', 'Carries Patn', 'Carries Pearl', 'Carries Damascus', 'Carrying Mithril'
];

const WHITE_MARKING_NAMES = {
    'nSpl': 'Splash', 'SplSpl': 'Splash',
    'nRn': 'Roan', 'RnRn': 'Roan',
    'nT': 'Tobiano', 'TT': 'Tobiano',
    'nCu': 'Cuirass', 'CuCu': 'Cuirass', 'CuCw': 'Cuirass Crowned',
    'nCw': 'Crowned', 'CwCw': 'Crowned',
    'nO': 'Overo', 'OO': 'Overo',
    'nSb': 'Sabino', 'SbSb': 'Sabino',
    'nGi': 'Girdle', 'GiGi': 'Girdle',
    'nCo': 'Collar', 'CoCo': 'Collar', 'GiCo': 'Girdle Collar', 'CoGi': 'Girdle Collar',
    'nB': 'Blanched', 'BB': 'Blanched', 'BFl': 'Blanched False Leopard', 'FlB': 'Blanched False Leopard',
    'nW': 'Dominant White', 'WW': 'Dominant White',
    'nRb': 'Rabicano', 'RbRb': 'Rabicano',
    'nFl': 'False Leopard', 'FlFl': 'False Leopard',
    'nHq': 'Harlequin', 'HqHq': 'Harlequin',
    'nSh': 'Shroud', 'ShSh': 'Shroud',
    'nfe': 'Filigree', 'fefe': 'Filigree',
    'nOs': 'Ossuary', 'OsOs': 'Ossuary',
    // Gr/Ap locus: Greaves up the front of the legs, Apron under the belly
    'nAp': 'Apron', 'ApAp': 'Apron',
    'nGr': 'Greaves', 'GrGr': 'Greaves', 'GrAp': 'Greaves Apron', 'ApGr': 'Greaves Apron',
    // KIT locus compounds (both orderings, because alleles can't agree who goes first)
    'TRn': 'Tobiano Roan', 'RnT': 'Tobiano Roan',
    'TSb': 'Tobiano Sabino', 'SbT': 'Tobiano Sabino',
    'TW': 'Tobiano Dominant White', 'WT': 'Tobiano Dominant White',
    'RnSb': 'Roan Sabino', 'SbRn': 'Roan Sabino',
    'RnW': 'Roan Dominant White', 'WRn': 'Roan Dominant White',
    'SbW': 'Sabino Dominant White', 'WSb': 'Sabino Dominant White'
};

// Gene tokens people write by hand that mean a canonical allele pair. `patn`
// is the leopard pattern gene written bare; it means one copy, i.e. `npatn`.
// Normalising here (not just in the phenotype namer) means breeding, lethal
// checks and validation all agree on the same allele pair.
const GENE_TOKEN_ALIASES = { 'patn': 'npatn' };
function normalizeGeneToken(tok) {
    return Object.prototype.hasOwnProperty.call(GENE_TOKEN_ALIASES, tok) ? GENE_TOKEN_ALIASES[tok] : tok;
}

function parseGenotype(genoString) {
    const parts = genoString.trim().split('+');
    const genes = parts[0].trim().split(/\s+/).filter(Boolean).map(normalizeGeneToken);
    // Everything after the first + is anomalies. Accept both separators so
    // "+ A, B" and "+ A + B" both parse instead of quietly dropping the rest.
    let anomalies = parts.length > 1
        ? parts.slice(1).join(',').split(',').map(a => a.trim()).filter(Boolean)
        : [];
    // Stained Glass and Ore were merged into one trait, called "Stained Glass"
    // going forward. Older coursers may still list "Ore" (or both), so normalise
    // any "Ore" to "Stained Glass" and de-duplicate.
    anomalies = anomalies.map(a => a.toLowerCase() === 'ore' ? 'Stained Glass' : a);
    anomalies = anomalies.filter((a, i) => anomalies.indexOf(a) === i);

    return { genes, anomalies };
}

// ---------------------------------------------------------------------------
// Token validation. parseGenotype silently drops any token it doesn't know, so
// an unrecognised token quietly changes the horse with no warning. This checks
// tokens (after alias normalisation) against the SAME name tables the engine
// reads from, so "known" can never drift from "actually does something".
// ---------------------------------------------------------------------------
const KNOWN_GENE_TOKENS = new Set([
    ...Object.keys(DILUTION_NAMES),
    ...Object.keys(MODIFIER_NAMES),
    ...Object.keys(WHITE_MARKING_NAMES),
    // Leopard complex + the two recessive carriers the engine reads by hand;
    // these don't live in any name table.
    'nLp', 'LpLp', 'npatn', 'patnpatn', 'nprl', 'ner'
]);

// A base-coat allele pair at the E or A locus (Ee, EE, ee, Aa, aa, ...).
function isBaseCoatToken(tok) {
    return /^[Ee]{1,2}$/.test(tok) || /^[Aa]{1,2}$/.test(tok);
}

function isKnownGeneToken(tok) {
    return isBaseCoatToken(tok) || KNOWN_GENE_TOKENS.has(tok);
}

// Report anything in a genotype the engine would silently ignore.
// Returns { unknownGenes: [...], unknownAnomalies: [...] }.
function findUnknownTokens(genoString) {
    const s = (genoString || '').trim();
    if (!s) return { unknownGenes: [], unknownAnomalies: [] };
    const parts = s.split('+');
    const geneTokens = parts[0].trim().split(/\s+/).filter(Boolean).map(normalizeGeneToken);
    // Everything after the first + is anomalies, separated by commas or pluses.
    const anomalyTokens = parts.slice(1).join(',').split(',').map(a => a.trim()).filter(Boolean);

    const knownAnoms = new Set(
        ALL_ANOMALIES.map(a => a.toLowerCase()).concat('ore', FREE_MARKINGS.map(m => m.toLowerCase()))
    );
    return {
        unknownGenes: geneTokens.filter(t => !isKnownGeneToken(t)),
        unknownAnomalies: anomalyTokens.filter(t => !knownAnoms.has(t.toLowerCase()))
    };
}

// Canonical variants and temperaments, with lenient normalisers. Imports run
// values through these so a typo like "Herald" is caught and shown, instead of
// being silently kept (CSV) or silently swapped to Standard (bookmarklet).
const KNOWN_VARIANTS = ['Standard', 'Heraldic', 'Puck', 'Cavedweller', 'Restored'];
const KNOWN_TEMPERAMENTS = ['Choleric', 'Melancholic', 'Phlegmatic', 'Sanguine'];

function normalizeVariant(v) {
    const s = (v || '').trim().toLowerCase();
    return KNOWN_VARIANTS.find(k => k.toLowerCase() === s) || 'Standard';
}
// Blank counts as "known" (it just defaults to Standard); only a non-empty
// value the list doesn't contain is unrecognised.
function isKnownVariant(v) {
    const s = (v || '').trim().toLowerCase();
    return s === '' || KNOWN_VARIANTS.some(k => k.toLowerCase() === s);
}
function normalizeTemperament(v) {
    const s = (v || '').trim().toLowerCase();
    return KNOWN_TEMPERAMENTS.find(k => k.toLowerCase() === s) || '';
}
function isKnownTemperament(v) {
    const s = (v || '').trim().toLowerCase();
    return s === '' || KNOWN_TEMPERAMENTS.some(k => k.toLowerCase() === s);
}

function isLethalWhite(genes) {
    const hasOO = genes.includes('OO');
    const hasOsOs = genes.includes('OsOs');
    const hasWW = genes.includes('WW');
    const hasOveroOssuary = genes.includes('nO') && genes.includes('nOs');
    return hasOO || hasOsOs || hasWW || hasOveroOssuary;
}

// The single source of truth. Both the phenotype namer (genotypeToPhenotype)
// and the plain-English translator (genotypeToPlainEnglish) read their trait
// data from HERE, so the two can never quietly drift out of sync. Returns
// structured data: { lethal, baseCoat, dilutions, coatColor, allTraits, anomalies }.
function resolveTraits(genoString) {
    const { genes, anomalies } = parseGenotype(genoString);

    // OO, OsOs, WW, or nO+nOs = dead foal, sorry
    if (isLethalWhite(genes)) {
        return { lethal: true, baseCoat: '', dilutions: [], coatColor: '', allTraits: [], anomalies };
    }

    let baseCoat = '';
    let dilutions = [];
    const allTraits = []; // The growing pile of everything this horse decided to be

    // Find base coat — the foundation upon which all genetic chaos is built
    const eGene = genes.find(g => g.match(/^[Ee][Ee]?$/));
    const aGene = genes.find(g => g.match(/^[Aa][Aa]?$/));

    if (eGene && aGene) {
        const key = `${eGene}_${aGene}`;
        baseCoat = COAT_COLORS[key] || 'Unknown';
    }

    // Grab dilutions from both loci — double-fisting fancy genes
    // Locus 1: the Cream/Tapestry/Pearl apartment — Locus 2: the Champagne/Ether flat

    const locus1Gene = genes.find(g => /Cr|Tp|prl/.test(g) && !/(Ch|er)/.test(g));
    const locus2Gene = genes.find(g => /Ch|er/.test(g) && !/(Cr|Tp|prl)/.test(g));

    // Nacre: two Pearl genes light up the carried Ether in a Cher pair, so the
    // Ether names the coat instead of being listed as carried. Plain Champagne
    // (nCh, ChCh) with prlprl is still Pearl Champagne.
    const isNacre = locus1Gene === 'prlprl' && locus2Gene === 'Cher';
    if (isNacre) {
        dilutions.push('Nacre');
    } else {
        if (locus1Gene && DILUTION_NAMES[locus1Gene]) dilutions.push(DILUTION_NAMES[locus1Gene]);
        if (locus2Gene && DILUTION_NAMES[locus2Gene]) dilutions.push(DILUTION_NAMES[locus2Gene]);
    }

    // Pearl is recessive too — a single nprl only CARRIES it (you need prlprl, or it
    // riding along in a compound like Crprl/Tpprl, to actually show Pearl).
    if (locus1Gene === 'nprl') {
        allTraits.push('Carries Pearl');
    }

    // Ether is recessive — lurking in the shadows until it gets a matching copy, very dungeon energy
    if (!isNacre && (locus2Gene === 'ner' || locus2Gene === 'Cher')) {
        allTraits.push('Carries Ether');
    }

    // Assemble the coat's full title, like a fantasy character's increasingly absurd name
    let coatColor = baseCoat;
    if (dilutions.length > 0) {
        const dilutionStr = dilutions.join(' ');
        const specialKey = `${baseCoat}_${dilutionStr}`;
        if (SPECIAL_COAT_NAMES[specialKey]) {
            coatColor = SPECIAL_COAT_NAMES[specialKey];
        } else {
            coatColor += ' ' + dilutionStr;
        }
    }

    // White markings — untangling compound genes like a bard untangling a lute string
    genes.forEach(gene => {
        if (WHITE_MARKING_NAMES[gene]) {
            // nfe = "I have Filigree at home" (carrier only); fefe = the real deal
            if (gene === 'nfe') {
                allTraits.push('Carrying Filigree');
            // Compound locus genes — divorce court, splitting shared-locus couples
            } else if (gene === 'CuCw') {
                allTraits.push('Cuirass');
                allTraits.push('Crowned');
            } else if (gene === 'BFl' || gene === 'FlB') {
                allTraits.push('Blanched');
                allTraits.push('False Leopard');
            } else if (gene === 'TRn' || gene === 'RnT') {
                allTraits.push('Tobiano');
                allTraits.push('Roan');
            } else if (gene === 'TSb' || gene === 'SbT') {
                allTraits.push('Tobiano');
                allTraits.push('Sabino');
            } else if (gene === 'TW' || gene === 'WT') {
                allTraits.push('Tobiano');
                allTraits.push('Dominant White');
            } else if (gene === 'RnSb' || gene === 'SbRn') {
                allTraits.push('Roan');
                allTraits.push('Sabino');
            } else if (gene === 'RnW' || gene === 'WRn') {
                allTraits.push('Roan');
                allTraits.push('Dominant White');
            } else if (gene === 'SbW' || gene === 'WSb') {
                allTraits.push('Sabino');
                allTraits.push('Dominant White');
            } else if (gene === 'GiCo' || gene === 'CoGi') {
                allTraits.push('Girdle');
                allTraits.push('Collar');
            } else if (gene === 'GrAp' || gene === 'ApGr') {
                allTraits.push('Greaves');
                allTraits.push('Apron');
            } else {
                allTraits.push(WHITE_MARKING_NAMES[gene]);
            }
        }
    });

    // Leopard Complex — Lp and patn team up to decide just how spotty this horse gets
    const lpGene = genes.find(g => g === 'nLp' || g === 'LpLp');
    const patnGene = genes.find(g => g === 'npatn' || g === 'patnpatn');
    if (lpGene) {
        const isHomozygousLp = lpGene === 'LpLp';
        const patnStatus = patnGene ? (patnGene === 'patnpatn' ? 'homozygous' : 'heterozygous') : 'none';
        let leopardPattern = '';
        if (isHomozygousLp && patnStatus === 'homozygous') leopardPattern = 'Fewspot';
        else if (isHomozygousLp && patnStatus === 'heterozygous') leopardPattern = 'Snowcap';
        else if (isHomozygousLp && patnStatus === 'none') leopardPattern = 'Varnish Roan';
        else if (!isHomozygousLp && patnStatus === 'homozygous') leopardPattern = 'Leopard';
        else if (!isHomozygousLp && patnStatus === 'heterozygous') leopardPattern = 'Blanket';
        else if (!isHomozygousLp && patnStatus === 'none') leopardPattern = 'Snowflake';
        if (leopardPattern) allTraits.push(leopardPattern);
    } else if (patnGene) {
        // patn without Lp is just vibes — all potential, no spots
        allTraits.push('Carries Patn');
    }

    // Modifiers — the spice rack of horse genetics; compounds get split, carriers get outed
    genes.forEach(gene => {
        if (MODIFIER_NAMES[gene]) {
            // Compound genes get broken up — you can't sit together anymore
            if (gene === 'PrOp') {
                allTraits.push('Prism');
                allTraits.push('Opal');
            } else if (gene === 'Lusp') {
                allTraits.push('Illuminated');
                allTraits.push('Carrying Sepulchered');
            } else if (gene === 'GPt' || gene === 'PtG') {
                allTraits.push('Gray');
                allTraits.push('Pitch');
            } else if (gene === 'DmD' || gene === 'DDm') {
                allTraits.push('Damascus');
                allTraits.push('Dun');
            } else if (gene === 'nf') {
                allTraits.push('Carrying Flaxen');
            } else if (gene === 'nsp') {
                allTraits.push('Carrying Sepulchered');
            } else if (gene === 'nsf') {
                allTraits.push('Carrying Starfield');
            } else if (gene === 'nlr') {
                allTraits.push('Carrying Lacquer');
            } else {
                allTraits.push(MODIFIER_NAMES[gene]);
            }
        }
    });

    return { lethal: false, baseCoat, dilutions, coatColor, allTraits, anomalies };
}

// Thin formatter over resolveTraits — turns the structured trait data into the
// terse phenotype name the rest of the app has always shown.
function genotypeToPhenotype(genoString) {
    const { lethal, coatColor, allTraits, anomalies } = resolveTraits(genoString);

    if (lethal) {
        return 'LETHAL WHITE - This foal would not survive.';
    }

    // Sort traits into their proper positions — phenotype formatting is an ancient and sacred art
    const traitsBeforeCoat = allTraits.filter(trait => TRAITS_BEFORE_COAT.includes(trait));
    const traitsAfterCoat = allTraits.filter(trait => TRAITS_AFTER_COAT.includes(trait));

    // Assemble the final phenotype string like a quest reward description
    const phenotypeParts = [];
    if (traitsBeforeCoat.length > 0) phenotypeParts.push(traitsBeforeCoat.join(' '));
    phenotypeParts.push(coatColor);
    if (traitsAfterCoat.length > 0) phenotypeParts.push(traitsAfterCoat.join(' '));

    let phenotype = phenotypeParts.join(' ');

    // Tack on anomalies with "with" because even horses need accessories
    if (anomalies.length > 0) {
        phenotype += ' with ' + anomalies.join(', ');
    }

    return phenotype.trim();
}

// ============================================================================
// PLAIN-ENGLISH TRANSLATOR
// ----------------------------------------------------------------------------
// Turns a genotype into a paragraph describing what the horse actually LOOKS
// like, in the app's usual snarky register. Everything here reads from
// resolveTraits(), so a horse's description can never disagree with its
// phenotype name.
//
// Every description here is drawn from the official Trait Index and the
// real-world genetics the traits are based on.
// ============================================================================

// Base body colour — the canvas everything else paints onto.
const COAT_BODY = {
    'Bay': "underneath it all it's a bay: a reddish-brown body with a black mane, tail and lower legs",
    'Black': "underneath it all it's a true black: dark from nose to hoof, no red anywhere",
    'Chestnut': "underneath it all it's a chestnut: red-brown all over, with a mane and tail in the same reddish range, and no black points anywhere"
};

// The total coat colour, keyed by the fancy coat NAME (coatColor). Read first,
// before the base-and-dilution breakdown, so the description leads with what the
// whole horse actually looks like. Plain base coats (Bay/Black/Chestnut) aren't
// here — COAT_BODY already describes those in full. The Tapestry dyes are Madder
// red, Woad blue and Weld yellow; with pearl they shift to Tyrian purple, Phthalo
// green and Ochre orange.
const COAT_DESC = {
    // Cream
    'Buckskin': "It's a golden tan body with black points, mane and tail.",
    'Smoky Black': "It's a dark, smoky near-black — cream barely reads on a black base.",
    'Palomino': "It's a gold body with a near-white mane and tail.",
    // Double Cream
    'Perlino': "It's a pale cream coat with faintly rusty points, pink skin and blue eyes.",
    'Smoky Cream': "It's a pale, smoky cream with pink skin and blue eyes.",
    'Cremello': "It's an almost-white cream to ivory, with pink skin and blue eyes.",
    // Tapestry
    'Madder': "It's a deep blood red, the colour of madder dye.",
    'Woad': "It's a deep, saturated blue, the colour of woad dye.",
    'Weld': "It's a bright, saturated yellow, the colour of weld dye.",
    // Pearl
    'Bay Pearl': "It's a warm gold-to-caramel brown with a soft, shiny sheen.",
    'Black Pearl': "It's an even, warm grayish brown with a soft sheen.",
    'Gold Pearl': "It's a shiny, warm gold-to-caramel.",
    // Champagne
    'Amber Champagne': "It's a warm golden tan with darker points and champagne's metallic sheen.",
    'Classic Champagne': "It's a warm taupe-brown with a metallic sheen over freckled skin.",
    'Gold Champagne': "It's a bright gold with a metallic sheen.",
    // Ether
    'Ombre Ether': "It's a muted, desaturated reddish brown body with muted charcoal gray stockings blending into it, matched on all four legs, and the mane and tail the stocking colour. Ether's sheen fades in in bands: pale silvery gray along the topline, muted purple or blue on the belly, muzzle and upper legs, and it may cover the stockings. Gray skin, eyes and hooves.",
    'Classic Ether': "It's a muted charcoal gray, even across the body, with Ether's sheen fading into it in bands: pale silvery gray along the topline, muted purple or blue on the belly, muzzle and upper legs. Gray skin, eyes and hooves.",
    'Cold Ether': "It's a muted, desaturated reddish brown, even across the body, with Ether's sheen fading into it in bands: pale silvery gray along the topline, muted purple or blue on the belly, muzzle and upper legs. Gray skin, eyes and hooves.",
    // Cream Pearl
    'Buckskin Pearl': "It's a pale, luminous gold with a caramel sheen and dark points.",
    'Smoky Black Pearl': "It's a soft, smoky brown with a pearly sheen.",
    'Palomino Pearl': "It's a pale, luminous gold with a pearly sheen.",
    // Tapestry Cream
    'Madder Buckskin': "It's a softened, lighter madder red over a golden buckskin.",
    'Woad Smoky Black': "It's a deep woad blue darkened over a smoky black.",
    'Weld Palomino': "It's a bright weld yellow lightened over a golden palomino.",
    // Tapestry Ether
    'Madder Ether': "It's a muted red body with gray stockings blending smoothly into it, darker than the coat and matched on all four legs, and the mane and tail the stocking colour. Ether's sheen fades into it in bands: silvery peach along the topline, red or purple on the belly, muzzle and upper legs, visibly different from the coat and free to cover part of the stockings. Gray or black skin and hooves, and the eyes the coat colour.",
    'Woad Ether': "It's a muted blue, even across the body, mane and tail to match, with Ether's sheen fading into it in bands: silvery blue along the topline, purple or blue on the belly, muzzle and upper legs, visibly different from the coat. Gray skin and hooves, and the eyes the coat colour.",
    'Weld Ether': "It's a muted yellow, even across the body, mane and tail to match, with Ether's sheen fading into it in bands: silver along the topline, muted purple or blue on the belly, muzzle and upper legs. Gray skin and hooves, and the eyes the coat colour.",
    // Pearl Ether
    'Bay Pearl Ether': "It's an apricot body with muted brown stockings, darker than the body and matched on all four legs, and the mane and tail the stocking colour. Ether's sheen fades into it in bands: warm pale gray or cream along the topline, muted purple or pink on the belly, muzzle and upper legs, and it may cover the stockings. Cream skin and hooves, gray eyes.",
    'Black Pearl Ether': "It's a muted brown, even across the body, mane and tail to match, with Ether's sheen fading into it in bands: warm pale gray or cream along the topline, muted purple or pink on the belly, muzzle and upper legs. Cream skin and hooves, gray eyes.",
    'Gold Pearl Ether': "It's an apricot, even across the body, mane and tail to match, with Ether's sheen fading into it in bands: warm pale gray or cream along the topline, muted purple or pink on the belly, muzzle and upper legs. Cream skin and hooves, gray eyes.",
    // Pearl Champagne
    'Bay Pearl Champagne': "It's a warm caramel gold with both pearl's sheen and champagne's metallic glow.",
    'Black Pearl Champagne': "It's a warm grayish taupe with a doubled pearl-and-champagne sheen.",
    'Gold Pearl Champagne': "It's a luminous gold with a pearl-and-champagne sheen.",
    // Cream Champagne
    'Amber Cream Champagne': "It's a pale gold with darker points and a metallic sheen.",
    'Classic Cream Champagne': "It's a pale taupe with a metallic sheen.",
    'Gold Cream Champagne': "It's a pale, bright gold with a metallic sheen.",
    // Cream Ether
    'Ombre Cream Ether': "It's a muted, desaturated golden brown body with muted charcoal gray stockings, darker than the coat and matched on all four legs, and the mane and tail the stocking colour. Ether's sheen fades into it in bands: pale silvery gray along the topline, muted purple to blue on the belly, muzzle and upper legs. Gray skin, eyes and hooves.",
    'Classic Cream Ether': "It's a muted charcoal gray, even across the body, with Ether's sheen fading into it in bands: pale silvery gray along the topline, muted purple to blue on the belly, muzzle and upper legs. Gray skin, eyes and hooves.",
    'Cold Cream Ether': "It's a muted, desaturated golden brown, even across the body, with a white or pale cream mane and tail. Ether's sheen fades into it in bands: pale silvery gray along the topline, muted purple to blue on the belly, muzzle and upper legs. Gray skin, eyes and hooves.",

    // Ash Ether (CrCr erer)
    'Cold Ash Ether': "It's a pale, cool gray, even across the body, with Ether's sheen fading into it in bands: silver along the topline, muted purple or blue on the belly, muzzle and upper legs. Cream skin and hooves, gray or blue eyes.",
    'Ombre Ash Ether': "It's a pale, cool gray body with cool gray stockings, darker than the body and matched on all four legs, and the mane and tail the stocking colour. Ether's sheen fades in in bands: silver along the topline, muted purple or blue on the belly, muzzle and upper legs. Cream skin and hooves, gray or blue eyes.",
    'Classic Ash Ether': "It's a cool gray, even across the body, with Ether's sheen fading into it in bands: silver along the topline, muted purple or blue on the belly, muzzle and upper legs. Cream skin and hooves, gray or blue eyes.",

    // Double Cream Champagne (CrCr with Champagne)
    'Cremello Champagne': "It's a gray-white, even across the whole body, with the mane and tail to match. Cream skin and hooves, blue eyes.",
    'Perlino Champagne': "It's a gray-white body with light gray stockings blending smoothly into it, matched on all four legs, and the mane and tail the stocking colour. Cream skin and hooves, blue eyes.",
    'Smoky Cream Champagne': "It's a light gray with little to no variation over the coat, mane and tail to match. Cream skin and hooves, blue eyes.",

    // Nacre (prlprl Cher)
    'Rose Gold Nacre': "It's a warm tan or brown, even across the body, with Nacre's sheen bursting from the chest and cheeks and fading into the coat: pastel pink or orange at the centre, pink or orange further out. Cream skin with gray speckles, cream hooves, gray eyes.",
    'Cerulean Bay Nacre': "It's a warm tan or brown body with warm brown stockings blending into it, matched on all four legs, and the mane and tail the stocking colour. Nacre's sheen bursts from the chest and cheeks and fades into the coat: pastel blue or purple at the centre, blue or purple further out, and it may cover the stockings. Cream skin with gray speckles, cream hooves, gray eyes.",
    'Saffron Black Nacre': "It's a warm brown, even across the body, with Nacre's sheen bursting from the chest and cheeks and fading into the coat: light golden yellow at the centre, yellow or orange further out. Cream skin with gray speckles, cream hooves, gray eyes.",
    // Tapestry Champagne
    'Madder Champagne': "It's a madder red lifted by champagne's metallic sheen.",
    'Woad Champagne': "It's a woad blue with a champagne metallic sheen.",
    'Weld Champagne': "It's a weld yellow with a champagne metallic sheen.",
    // Cream Pearl Champagne (triple)
    'Amber Cream Pearl Champagne': "It's a pale, luminous gold with darker points and a triple pearl-and-champagne sheen.",
    'Classic Cream Pearl Champagne': "It's a pale taupe-brown with a luminous pearl-and-champagne sheen.",
    'Gold Cream Pearl Champagne': "It's a pale, luminous gold with a pearl-and-champagne sheen.",
    // Cream Pearl Ether (triple)
    'Ombre Cream Pearl Ether': "It's a cream body with muted warm brown stockings, darker than the coat and matched on all four legs, and the mane and tail the stocking colour. Ether's sheen fades into it in bands: pale silvery gray along the topline, muted purple to blue on the belly, muzzle and upper legs. Cream skin, gray eyes and gray hooves.",
    'Classic Cream Pearl Ether': "It's a muted warm brown, even across the body, mane and tail to match. Ether's sheen fades into it in bands: pale silvery gray along the topline, muted purple to blue on the belly, muzzle and upper legs. Cream skin, gray eyes and gray hooves.",
    'Cold Cream Pearl Ether': "It's a cream, even across the body, with a white mane and tail. Ether's sheen fades into it in bands: pale silvery gray along the topline, muted purple to blue on the belly, muzzle and upper legs. Cream skin, gray eyes and gray hooves.",
    // Tapestry Cream Ether (triple)
    'Madder Cream Ether': "It's a lightened, muted red body with dark reddish-brown or black stockings blending smoothly into it, visibly darker than the coat and matched on all four legs, and the mane and tail the stocking colour. Ether's sheen fades into it in bands: pinkish silver along the topline, muted purple or blue on the belly, muzzle and upper legs, free to cover part of the stockings. Cream skin and hooves, and the eyes the coat colour.",
    'Woad Cream Ether': "It's a lightened, muted blue, even across the body, mane and tail to match. Ether's sheen fades into it in bands: bluish silver along the topline, muted purple or blue on the belly, muzzle and upper legs. Cream skin and hooves, and the eyes the coat colour.",
    'Weld Cream Ether': "It's a lightened, muted yellow, even across the body, with a yellowish white mane and tail. Ether's sheen fades into it in bands: yellowish silver along the topline, lighter than the coat, and muted pink or orange on the belly, muzzle and upper legs. Cream skin and hooves, and the eyes the coat colour.",
    // Tapestry Pearl (double) — pearl shifts the dye hue
    'Tyrian Pearl': "It's a rich Tyrian purple with a pearly sheen (madder red shifted by pearl).",
    'Phthalo Pearl': "It's a deep phthalo blue-green with a pearly sheen (woad blue shifted by pearl).",
    'Ochre Pearl': "It's a warm ochre orange with a pearly sheen (weld yellow shifted by pearl).",
    // Tapestry Pearl Champagne (triple)
    'Tyrian Pearl Champagne': "It's a Tyrian purple with a doubled pearl-and-champagne sheen.",
    'Phthalo Pearl Champagne': "It's a phthalo blue-green with a pearl-and-champagne sheen.",
    'Ochre Pearl Champagne': "It's an ochre orange with a pearl-and-champagne sheen.",
    // Tapestry Pearl Ether (triple)
    'Tyrian Pearl Ether': "It's a somewhat muted purple body with dark purple or black stockings blending smoothly into it, darker than the coat and matched on all four legs, and the mane and tail the stocking colour. Ether's sheen fades into it in bands: bluish silver along the topline, lighter than the coat, and purple or blue on the belly, muzzle and upper legs, free to cover part of the stockings. Cream skin, gray hooves, and the eyes the coat colour.",
    'Phthalo Pearl Ether': "It's a somewhat muted green, even across the body, mane and tail to match. Ether's sheen fades into it in bands: greenish silver along the topline, lighter than the coat, and purple or blue on the belly, muzzle and upper legs. Cream skin, gray hooves, and the eyes the coat colour.",
    'Ochre Pearl Ether': "It's a somewhat muted orange, even across the body, mane and tail to match. Ether's sheen fades into it in bands: peachy silver along the topline, lighter than the coat, and muted pinky purple or blue on the belly, muzzle and upper legs. Cream skin, gray hooves, and the eyes the coat colour.",
    // Tapestry Cream Champagne (triple)
    'Madder Cream Champagne': "It's a madder red softened by cream and lifted by a champagne sheen. Pink pony club.",
    'Woad Cream Champagne': "It's a woad blue softened by cream with a champagne sheen.",
    'Weld Cream Champagne': "It's a weld yellow softened by cream with a champagne sheen.",
};

// What each dilution actually does to the body. Keyed to the exact strings
// resolveTraits pushes into `dilutions` (including compound entries).
const DILUTION_DESC = {
    'Cream': "A single dose of cream washes the red out to a warm golden tan, but leaves any black points alone.",
    'Double Cream': "Two doses of cream take it almost all the way out. The coat goes pale cream to ivory, the skin pinkish, the eyes blue.",
    'Champagne': "Champagne lightens the coat to a warm golden or grayish brown, with peachy or lavender undertones. The skin turns pinkish-gray and often freckled, the eyes gold or green.",
    'Ether': "Ether is Dungeon Coursers' own dilution, the magical counterpart to Champagne. It desaturates and lightens the base coat, then lays a sheen over it in bands that fade gradually into the coat: a desaturated, silvery sheen along the topline and a hue-shifted one, muted purple or blue, on the belly, legs and muzzle. Skin, eyes and hooves go gray.",
    'Pearl': "Pearl (double dose) turns the coat a shiny, warm gold-to-caramel brown, or a warm grayish brown on a black base. The tone stays even, the skin pink, the eyes gray or green.",
    'Cream Pearl': "Cream and pearl together push the coat pale and luminous, a soft warm gold with pearl's shiny caramel sheen.",
    'Nacre': "Nacre is two Pearl genes lighting up the carried Ether in a Champagne and Ether pair. The coat itself stays a warm tan or brown, and a colourful sheen spreads from the chest across the barrel and forelegs and from the eyes down the cheeks, lighter at the source, darker further out, then fading evenly into the coat.",
    'Tapestry': "Tapestry is Dungeon Coursers' own dilution. It paints the base coat one of three bold, saturated dyes: Madder red on a bay, Weld yellow on a chestnut, and Woad blue on a black. Stack another dilution on top and those shift, in places, into oranges, greens and purples.",
    'Tapestry Cream': "Tapestry dyes the coat one of its three bold hues (Madder red, Weld yellow or Woad blue), and a dose of cream then softens and lightens it.",
    'Tapestry Pearl': "Tapestry dyes the coat one of its three bold hues, and pearl pushes it further into the oranges, greens and purples: Madder red to Tyrian purple, Weld yellow to Ochre orange, Woad blue to Phthalo green.",
};

// Modifiers — the shading, sooting, greying and stranger DC treatments.
const MODIFIER_DESC = {
    'Dun': "Dun pales the body and stamps on primitive marks: a dark dorsal stripe down the spine, and often barring on the legs.",
    'Pangare': "Pangare lightens the coat on the underside of the body and the extremities, always the same hue as the coat and never fully white, uniform in colour with smooth edges that make no patterns. At its least it covers the belly, chest and muzzle; at its most the belly, legs, chest, groin, underside of the neck and around the face, plus the mane and tail, going near white so long as it stays distinguishable from white markings. Coverage is roughly even on all four legs. It may be hidden on an undiluted black, and on Cremello or Perlino.",
    'Sooty': "Sooty darkens the coat along the topline and neck in the same hue, uniform in colour, its edges smooth and either crisp, gradual or both, never making patterns or shapes. At its least it covers a stretch of topline about the size of the horse's head; at its most the topline, the top half of the face, the neck, the top half of the barrel and the tops of the legs. It may darken the mane and tail to match, and on a bay-based coat it may take the colour of the stockings. It is not visible on an undiluted black, on Smoky Black, or on a black coat lightened only by its markings.",
    'Gray': "Gray is progressive: the horse is born its base colour and then steadily silvers out with age, eventually toward white.",
    'Pitch': "Pitch is progressive like Gray but runs the other way: the horse is born its base colour and steadily blackens with age, fading smoothly into the coat, mane and tail with no hard edges. Dapples and tiny flea bites of base colour showing through are fine. With Gray as well, the two meet in a true mid gray instead of whitening or darkening.",
    'Flaxen': "Flaxen lightens the mane and tail to blonde or near-white while the body keeps its colour (only really visible on a red base).",
    'Silver': "Silver dilutes black pigment specifically: a chocolate body with a flaxen-to-silver mane and tail, and no effect on red.",
    'Illuminated': "Illuminated pales the skin and hooves to a uniform, washed-out light colour, whatever the coat is doing. The coat itself is left alone.",
    'Sepulchered': "Sepulchered darkens the skin and hooves to a uniform black or gray, whatever the coat is doing, and leaves the coat colour untouched. It covers the whole horse and may ignore white markings, so the skin beneath them can stay dark too. Alongside Gilt it goes far darker than Gilt's usual range, as far as a metallic black. Recessive, so it needs both copies: one copy, or Lusp, only carries it.",
    'Tabard': "Tabard splits the coat into a gradient, lightening one half and darkening the other, often stamped with a mirrored pair of heraldic symbols reflected across the centre. Always symmetrical left-to-right.",
    'Gilt': "Gilt turns the hooves metallic, whether gold, silver, copper, bronze or brass, and tints the skin to match. It's a skin-and-hoof trait, not a coat one.",
    'Vellum': "Vellum drops the opacity of the horse's white markings, making them semi-transparent and see-through (Roan, Blanched and False Leopard shrug it off).",
    'Opal': "Opal scatters colourful pastel flecks across all of the horse's white markings, sharp-edged or blurred.",
    'Prism': "Prism recolours the horse's Pangare or Sooty into any distinguishable colour, never white, and may carry several colours blended evenly together with no hard edges or patterns. It takes one or the other, never both on the same horse, and covers whichever it takes completely rather than in part. It also lets Pangare or Sooty show on an undiluted black, including the black stockings of a bay-based coat. With neither Pangare nor Sooty in the genotype it stays unseen.",
    'Starfield': "Starfield turns all of the horse's white markings into a night sky, black or dark blue or a blend of the two, optionally with little round spots of the original colour showing through.",
    'Ingot': "Ingot turns every one of the horse's white markings a single metallic colour, the same one across the whole horse, optionally with a metallic shine. Where a marking reaches the mane or tail, that goes metallic too. It leaves skin, eyes and hooves alone, and sits below Starfield and Opal, so those show over the top of it. It counts as a metallic trait, so Lacquer can recolour it. With no white marking or Free White to land on it stays in the genotype, unseen.",
    'Mithril': "Mithril is a glossy, reflective shine over the whole coat, mane and tail, evenly. It changes no colours: the horse's own coat and traits stay clearly visible underneath. Skin, eyes and hooves are untouched. It is recessive, so it needs both copies to show.",
    'Damascus': "Damascus lets Dun's primitive marks escape their usual limits, branching into irregular streaks, swirls, webbing or blotches over up to a quarter of the coat. It is always the same colour as the other Dun marks, always grows out of one of them, and its edges may be crisp or blended. It never maps and never makes deliberate-looking shapes or repeating stripes.",
    'Lacquer': "Lacquer shifts the horse's metallic traits (Gilt, Ingot, Kintsugi and Swarf) outside their usual metallic range into any unnatural colour. It can recolour every metallic trait or only some of them, give each its own colour, and carry several colours at once, blending them evenly where they meet on one trait, with no hard edges or patterns and the trait's own boundaries still clear. It covers a trait completely or not at all, can be hidden entirely, and never matches the coat. It sits above Illuminated and Sepulchered and can override them on Gilt skin and hooves, and Signet is unaffected. Recessive, so it needs both copies to show.",
};

// White patterns and markings.
const MARKING_DESC = {
    'Tobiano': "Tobiano throws big, rounded patches of white that cross the spine, usually with white legs and a mostly dark head.",
    'Overo': "Overo (frame) carves horizontal blocks of white along the sides that don't cross the back, with a dark topline and often a bald face.",
    'Splash': "Splash looks like the horse was dipped in white paint from below: white legs, a white belly, and a broad white face, all with clean crisp edges.",
    'Roan': "Roan mixes white hairs evenly through the body while the head and legs stay solid, giving a frosted, silvered look over the base colour.",
    'Sabino': "Sabino adds ragged, roaned white: tall stockings, a blazed face, jagged belly spots and flecking, all with soft, lacy edges.",
    'Rabicano': "Rabicano frosts white rib-like markings near the flanks, without touching the rest much.",
    'Dominant White': "Dominant White covers most or all of the coat in white, spreading up from the horse's underside so some base colour may linger along the topline, with roaned, grainy edges like Sabino.",
    'Cuirass': "Cuirass is a solid, symmetrical white breastplate across the upper chest and part of the shoulders, like armour. It never touches the mane, crosses the topline, or reaches the belly.",
    'Crowned': "Crowned sets symmetrical white on the head, either a single marking or a tidy arrangement of simple stripes, spots and splotches.",
    'Girdle': "Girdle wraps a single, even band of white all the way around the barrel, with crisp, smooth edges.",
    'Collar': "Collar wraps a single, even band of white all the way around the neck, with crisp, smooth edges.",
    'Apron': "Apron is a single connected patch of opaque white along the underside: part of the chest and belly at its smallest, the whole underbelly, throat and underside of the head at its largest. Crisp, smooth edges, no holes, and pink skin beneath.",
    'Greaves': "Greaves runs a strip of white up the front of the legs, always in a matching pair on both front or both back legs, never wrapping fully round the leg. Crisp edges, pink skin beneath, and cream hooves where the white reaches them.",
    'Blanched': "Blanched lightens the coat on the face and legs, the inverse of Roan, blending gradually from a subtle paling to bold white.",
    'False Leopard': "False Leopard lightens the barrel, shoulders, chest and hindquarters like Roan, but with round spots 'cut out' of it. Think leopard-style spotting without the real leopard complex.",
    'Harlequin': "Harlequin scatters opaque white diamonds that radiate out in rings from a single point, usually the poll or croup.",
    'Shroud': "Shroud drapes symmetrical white down from the spine, anywhere from poll to tail, but never reaches more than halfway down the neck or barrel.",
    'Filigree': "Filigree traces elegant white swirls that branch out of the horse's other white markings. It always attaches to existing white, never floating free.",
    'Ossuary': "Ossuary is a stark, opaque white in skeletal shapes, a strange cousin to Overo, spreading from the barrel out to the legs and edges of the body. The face is often bald or 'skull-like'.",
};

// Leopard complex — the appaloosa-family spotting patterns.
const LEOPARD_DESC = {
    'Snowflake': "Snowflake (single Lp, no pattern gene) scatters white flecks and spots over the dark coat, like a light snowfall that thickens with age.",
    'Blanket': "Blanket lays a patch of white, usually over the hips and rump, often carrying dark leopard spots within it.",
    'Snowcap': "Snowcap is a solid patch of white over the croup and hindquarters, maybe with a few spots and speckles at its edges.",
    'Leopard': "Leopard covers the body in white with the base coat showing through as round spots head to tail, busier and spottier than a Fewspot.",
    'Fewspot': "Fewspot is a near-white horse that has 'spotted out', an almost solid white coat with only a handful of faint spots left.",
    'Varnish Roan': "Varnish Roan is the leopard complex's roaning: a mottled mix of light and dark that spreads over the body, with darker 'varnish marks' over the bony bits.",
};

// Hidden carriers — genes the horse quietly carries but doesn't visibly show.
const CARRIER_DESC = {
    'Carries Pearl': "pearl (one copy, invisible until it's paired with another pearl or a cream)",
    'Carries Ether': "ether (one copy, hidden)",
    'Carrying Filigree': "filigree (one copy, hidden)",
    'Carries Patn': "a leopard pattern gene (patn) with no Lp to switch it on, so it's silent for now",
    'Carrying Flaxen': "flaxen (one copy, hidden)",
    'Carrying Sepulchered': "sepulchered (one copy, hidden)",
    'Carrying Starfield': "starfield (one copy, hidden)",
    'Carrying Lacquer': "lacquer (one copy, hidden)",
    'Carrying Mithril': "mithril (one copy, hidden)",
    'Carries Damascus': "damascus with no Dun at the other side of the locus to switch it on, so it stays invisible"
};

// Anomalies — the rare 'with ...' extras tacked onto a genotype, drawn from the
// Trait Index.
const ANOMALY_DESC = {
    'Bend-or Spots': "Bend-or Spots scatter dark smudges across the coat, random patches a shade or two darker than the base.",
    'Birdcatcher Spots': "Birdcatcher Spots are small, random white flecks that can come and go over the horse's life.",
    'Brindle': "Brindle lays faint vertical striping down the body, like a brindle dog wearing a horse costume.",
    'Chimera': "Chimera gives it a patch that grew from a second genotype, so part of the horse is visibly a different colour.",
    'Geode': "Geode is an eye anomaly: the sclera (the white of the eye) is recoloured to a single unnatural colour, sometimes with a reshaped pupil.",
    'Stained Glass': "Stained Glass recolours the iris and/or pupil to shades unnatural for the horse, sometimes metallic, sometimes split into heterochromia (it also covers the old 'Ore' trait).",
    'Ore': "Ore is an old name for a recoloured iris and/or pupil, now folded into Stained Glass.", // legacy alias, normalised to Stained Glass upstream
    'Kintsugi': "Kintsugi traces metallic borders and 'cracks' onto the horse's white markings in a single colour, like they were mended with gold.",
    'Swarf': "Swarf scatters metallic flecks and glitter across the coat, spreading from the topline and hooves, never dense enough to hide the base colour.",
    'Vitiligo': "Vitiligo spreads irregular patches of lost pigment, pale untinted white, usually starting on the face, elbows and groin, sometimes streaking the mane and tail as it grows over the horse's life.",
    'Oracle': "Oracle is an eye anomaly: a black or white film drawn evenly over the whole eyeball, anywhere from faint and translucent to fully opaque.",
    'Signet': "Signet recolours the hooves to a colour unnatural for the horse, in vertical top-to-bottom sections, but never metallic.",
    'Pennant': "Pennant recolours the mane and tail to any colour, or several, from a few streaks to the whole thing (each strand one colour root to tip).",
    'Pastiche': "Pastiche reshapes the horse's Chimera and/or Somatic markings into deliberate, symmetrical forms like stripes, skulls and emblems.",
    'Fresco': "Fresco softens the crisp edges of the horse's Chimera and/or Somatic markings, letting them go low-opacity, blurred, smoky or streaky.",
    'Lantern': "Lantern is an eye anomaly: a coloured glow coming from and around the eye, brighter than the eye itself, sometimes with a glowing bright pupil.",
    // Free marking rather than an anomaly, but it's written after the `+` like
    // one, so it's described here alongside them.
    'Somatic': "Somatic hides one of the horse's own traits inside irregular patches, up to a quarter of the body, so that area shows what the horse would look like without it (or with a different E/A base). It only ever takes away — it can't add a trait the horse doesn't have. See the Somatic tab for what this one could switch off.",
};

// Pennant is normally one colour per strand, root to tip — but with Flaxen,
// Silver or Pangare in the coat, a single strand can now run through several
// colours root to tip. Described from the horse's own traits, not as a rule.
function describePennant(allTraits) {
    const strandMods = ['Flaxen', 'Silver', 'Pangare'].filter(m => (allTraits || []).includes(m));
    if (!strandMods.length) return ANOMALY_DESC['Pennant'];
    return "Pennant recolours the mane and tail to any colour, or several, from a few streaks to the whole thing. And with " +
        joinList(strandMods) + " in the coat, a single strand can run through multiple colours root to tip.";
}

// Variants — the four breed variants. These are a whole different physique the
// colours above are painted onto, not a colour filter.
const VARIANT_DESC = {
    'Heraldic': "On top of all that, it's a **Heraldic**, the nobility's old favourite. Regal carriage, cloven hooves for grip, and coat, mane and tail growth patterns that show off the muscle.",
    'Puck': "On top of all that, it's a **Puck**, a fey-touched courser bred from archers' mounts. Long ears, a curly protective coat, a braying voice and a mischievous streak.",
    'Cavedweller': "On top of all that, it's a **Cavedweller**, descended from coursers buried with the kingdom. Generations in magical dark have left it hairless and eyeless, navigating by sound and taste.",
    'Restored': "On top of all that, it's a **Restored**, a courser whose memory was nearly devoured and then painstakingly mended by the Archivist, held together with binding, leatherwork and aberrant magic. Alive, but forever changed.",
};

// The leopard-pattern names, so the translator knows which allTraits entries are
// leopard spotting versus ordinary markings.
const LEOPARD_PATTERN_NAMES = Object.keys(LEOPARD_DESC);

// a vs an, for the odd spot where we need an article in front of a colour.
function articleFor(word) {
    return /^[aeiou]/i.test((word || '').trim()) ? 'an' : 'a';
}

// Oxford-comma list join: ['a'] -> 'a'; ['a','b'] -> 'a and b';
// ['a','b','c'] -> 'a, b, and c'.
function joinList(items) {
    const list = (items || []).filter(Boolean);
    if (list.length === 0) return '';
    if (list.length === 1) return list[0];
    if (list.length === 2) return list[0] + ' and ' + list[1];
    return list.slice(0, -1).join(', ') + ', and ' + list[list.length - 1];
}

// Assemble the plain-English paragraph, in visual order:
//   body colour (base + dilutions) -> shading/modifiers -> white/markings
//   -> leopard spotting -> anomalies -> variant -> hidden carriers.
// Returns text with the coat name wrapped in **bold**. `variant` is optional.
function genotypeToPlainEnglish(genoString, variant) {
    if (!genoString || !genoString.trim()) {
        return "Give me a genotype and I'll tell you what the horse actually looks like. Right now you've given me nothing, which describes a lot of things but not a horse.";
    }

    const t = resolveTraits(genoString);

    if (t.lethal) {
        return "Oof. This one's a **lethal white**. Two copies of the wrong white genes (OO, OsOs, WW, or Overo stacked with Ossuary) and the foal doesn't survive to be a colour at all. There's no horse here to describe, just a hard lesson in why you don't double up on those. Sorry.";
    }

    const { baseCoat, dilutions, coatColor, allTraits, anomalies } = t;

    // Bucket the loose traits by what section of the paragraph they belong in.
    const modifiers = allTraits.filter(x => MODIFIER_DESC[x]);
    const markings  = allTraits.filter(x => MARKING_DESC[x]);
    const leopard   = allTraits.filter(x => LEOPARD_DESC[x]);
    const carriers  = allTraits.filter(x => CARRIER_DESC[x]);

    const paras = [];

    // 1. Body colour — name the coat, say what colour the whole thing is, then
    //    explain the base and each dilution underneath it.
    // "a Black" reads as a colour rather than a horse, so the coat name always
    // has Courser after it. The article still comes off the coat name, which is
    // the word that follows it.
    let body = `You're looking at ${articleFor(coatColor)} **${coatColor}** Courser.`;
    if (COAT_DESC[coatColor]) body += ' ' + COAT_DESC[coatColor];
    const baseDesc = COAT_BODY[baseCoat];
    if (baseDesc) body += ' ' + baseDesc.charAt(0).toUpperCase() + baseDesc.slice(1) + '.';
    dilutions.forEach(d => { if (DILUTION_DESC[d]) body += ' ' + DILUTION_DESC[d]; });
    paras.push(body);

    // 2. Shading / modifiers.
    if (modifiers.length) {
        paras.push(modifiers.map(m => MODIFIER_DESC[m]).join(' '));
    }

    // 3. White / markings.
    if (markings.length) {
        paras.push(markings.map(m => MARKING_DESC[m]).join(' '));
    }

    // 4. Leopard spotting.
    if (leopard.length) {
        paras.push(leopard.map(l => LEOPARD_DESC[l]).join(' '));
    }

    // 5. Anomalies — the weird 'with ...' extras. Each names its own trait, so
    //    they read as separate sentences rather than one comma-run list. Pennant
    //    depends on the rest of the horse, so it's described dynamically.
    if (anomalies.length) {
        const descs = anomalies.map(a => {
            if (a === 'Pennant') return describePennant(allTraits);
            return ANOMALY_DESC[a] || `${a} is an anomaly I don't have notes on yet.`;
        });
        paras.push(descs.join(' '));
    }

    // 6. Variant — a whole-horse skin over everything above.
    if (variant && variant !== 'Standard' && VARIANT_DESC[variant]) {
        paras.push(VARIANT_DESC[variant]);
    }

    // 7. Hidden carriers — genes it quietly totes but doesn't show.
    if (carriers.length) {
        paras.push('Hiding in the bloodline, not visible on the horse: it carries ' +
            joinList(carriers.map(c => CARRIER_DESC[c])) + '.');
    }

    return paras.join('\n\n');
}

// --- Translate tab UI handlers ---------------------------------------------

// Escape HTML, then promote **bold** to <strong> and blank lines to paragraph
// breaks. Deliberately tiny — the translator's text is the only input.
function renderTranslateMarkup(text) {
    const esc = String(text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc
        .split(/\n\n+/)
        .map(p => '<p>' + p.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>') + '</p>')
        .join('');
}

// Refresh the "pick from your collection" dropdown on the Translate tab.
// Called on tab show and whenever the collection changes (e.g. CSV upload).
function populateTranslateCollectionSelect() {
    const sel = document.getElementById('translateFromColl');
    if (!sel) return;
    const collection = (window.getCollection && window.getCollection()) || [];
    const cur = sel.value;
    sel.innerHTML = '<option value="">Pick from collection…</option>' +
        collection.map((h, i) =>
            `<option value="${i}">${(h.name || 'Unnamed').replace(/</g, '&lt;')} (${(h.temperament || '—').replace(/</g, '&lt;')})</option>`
        ).join('');
    if (cur && Number(cur) < collection.length) sel.value = cur;
    const row = document.getElementById('translateSourceRow');
    if (row) row.style.display = collection.length ? '' : 'none';
}

// Drop a chosen collection horse into the genotype box + variant picker.
function fillTranslateFromCollection(idx) {
    const collection = (window.getCollection && window.getCollection()) || [];
    const h = collection[Number(idx)];
    if (!h) return;
    const ta = document.getElementById('translateGeno');
    if (ta) ta.value = h.genotype || '';
    const varSel = document.getElementById('translateVariant');
    if (varSel) varSel.value = h.variant && h.variant !== 'Standard' ? h.variant : '';
}

// Run the translator and paint the result card.
function translateGenotype() {
    const ta = document.getElementById('translateGeno');
    const varSel = document.getElementById('translateVariant');
    const out = document.getElementById('translateResult');
    if (!out) return;

    const geno = ta ? ta.value.trim() : '';
    const variant = varSel ? varSel.value : '';

    if (!geno) {
        out.style.display = 'block';
        out.innerHTML = renderTranslateMarkup(
            "You haven't given me a genotype yet. Paste one in, or pick a horse from your collection, and I'll tell you what it looks like."
        );
        return;
    }

    trackUse('translate_run');
    const prose = genotypeToPlainEnglish(geno, variant);
    const pheno = genotypeToPhenotype(geno);

    // Warn about anything the engine ignored, so a typo can't silently change
    // the horse (e.g. `patn` should be `npatn`).
    const { unknownGenes, unknownAnomalies } = findUnknownTokens(geno);
    let warnHtml = '';
    if (unknownGenes.length || unknownAnomalies.length) {
        trackUse('translate_unknown_tokens');
        const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const bits = [];
        if (unknownGenes.length) bits.push((unknownGenes.length === 1 ? 'gene' : 'genes') + ' ' + unknownGenes.map(g => `<code>${esc(g)}</code>`).join(', '));
        if (unknownAnomalies.length) bits.push((unknownAnomalies.length === 1 ? 'anomaly' : 'anomalies') + ' ' + unknownAnomalies.map(a => `<code>${esc(a)}</code>`).join(', '));
        warnHtml =
            `<div class="translate-warn"><strong>Heads up:</strong> I didn't recognise ${bits.join(' and ')}, ` +
            `so ${unknownGenes.length + unknownAnomalies.length === 1 ? 'it was' : 'they were'} left out of the description below. ` +
            `Check the spelling (one copy is usually written like <code>nLp</code>, two like <code>LpLp</code>).</div>`;
    }

    out.style.display = 'block';
    out.innerHTML =
        warnHtml +
        `<div class="translate-pheno"><span class="translate-pheno-label">Short version:</span> ${String(pheno).replace(/</g, '&lt;')}</div>` +
        `<div class="translate-prose">${renderTranslateMarkup(prose)}</div>`;
    out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ============================================================================
// DESIGN LAYERS — the visual hierarchy
// ----------------------------------------------------------------------------
// Lays a horse's traits out in the official stacking order, so a designer can
// paint from the base coat up. Each column is an ordered list of layers (top of
// the list covers the layers below it). Rows with several traits sit on the same
// level; `group` rows are the categorised buckets from the reference chart.
// Trait names match what resolveTraits/parseGenotype produce. A few chart items
// the engine doesn't model yet (Free White, Dapple, Somatic) simply never match.
// ============================================================================

const LAYER_COLORS_MARKINGS = [
    // Mithril is the template's Metallic Traits layer on Overlay over the whole
    // design, so it sits above everything.
    { traits: ['Mithril'] },
    { traits: ['Chimera', 'Vitiligo'], join: ' & ' },
    { traits: ['Lacquer'] },
    { traits: ['Swarf', 'Kintsugi'] },
    { traits: ['Gray', 'Pitch'] },
    { group: 'White Modifiers', traits: ['Opal', 'Starfield', 'Vellum'] },
    // Ingot recolours the white markings, so it sits over them but under Opal
    // and Starfield, which show through on top of it.
    { traits: ['Ingot'] },
    { group: 'White Markings', traits: ['Ossuary', 'Filigree', 'Shroud', 'Harlequin', 'Fewspot', 'Varnish Roan', 'Snowcap', 'Rabicano', 'Leopard', 'False Leopard', 'Blanched', 'Dominant White', 'Sabino', 'Overo', 'Collar', 'Cuirass', 'Crowned', 'Blanket', 'Girdle', 'Apron', 'Greaves', 'Tobiano', 'Splash', 'Snowflake', 'Roan', 'Free White'] },
    { group: 'Coat Anomalies', traits: ['Bend-or Spots', 'Birdcatcher Spots', 'Brindle'] },
    { traits: ['Prism'] },
    { group: 'Mane/Tail Modifiers', traits: ['Silver', 'Flaxen', 'Pangare'] },
    { group: 'Coat Modifiers', traits: ['Tabard', 'Damascus', 'Dun', 'Sooty', 'Dapple'] },
    { traits: ['Pennant'] },
    { base: true }
];

const LAYER_EYES = [
    { traits: ['Chimera'] },
    { traits: ['Lantern'] },
    { traits: ['Oracle'] },
    { traits: ['Stained Glass'] },
    { traits: ['Geode'] },
    { base: true }
];

const LAYER_SKIN_HOOF = [
    { traits: ['Chimera', 'Vitiligo'], join: ' & ' },
    { traits: ['Signet'] },
    { traits: ['Lacquer'] },
    { traits: ['Gilt', 'Illuminated', 'Sepulchered'] },
    { whiteMarkings: true },
    { base: true }
];

// Every trait that lives in the White Markings bucket, for the "White Markings"
// reference line in the Skin & Hoof column.
const WHITE_MARKING_LAYER_SET = new Set(LAYER_COLORS_MARKINGS.find(r => r.group === 'White Markings').traits);

// Trait Index page IDs (dungeon-coursers.com/world/traits?id=N), so each layer
// links to its official trait page. Base coats: only the ones with their own
// page are here (the fancier coats share a dilution's page and aren't 1:1).
const TRAIT_PAGE_BASE = 'https://dungeon-coursers.com/world/traits?id=';
const TRAIT_PAGE_IDS = {
    // Base coats with their own page
    'Bay': 1, 'Black': 2, 'Chestnut': 3,
    // The coat overhaul folded the single-dilution coats into one page per trait
    'Palomino': 112, 'Smoky Black': 112, 'Buckskin': 112, 'Weld': 113, 'Woad': 113, 'Madder': 113,
    // Coat overhaul Legendary coats, one page per trait
    'Cremello Champagne': 102, 'Perlino Champagne': 102, 'Smoky Cream Champagne': 102,
    'Cold Ash Ether': 103, 'Ombre Ash Ether': 103, 'Classic Ash Ether': 103,
    'Rose Gold Nacre': 104, 'Cerulean Bay Nacre': 104, 'Saffron Black Nacre': 104,
    // White markings
    'Cuirass': 29, 'Harlequin': 30, 'Blanched': 31, 'Filigree': 32, 'Free White': 33, 'Crowned': 34, 'Splash': 35, 'Roan': 36, 'Tobiano': 37, 'Snowflake': 38, 'Overo': 39, 'Blanket': 40, 'Leopard': 41, 'Snowcap': 42, 'Varnish Roan': 43, 'Fewspot': 44, 'Sabino': 45, 'Dominant White': 46, 'Rabicano': 47, 'False Leopard': 48, 'Shroud': 79, 'Ossuary': 80, 'Girdle': 91, 'Collar': 92, 'Apron': 99, 'Greaves': 100,
    // Modifiers
    'Dun': 49, 'Pangare': 50, 'Sooty': 51, 'Gray': 52, 'Tabard': 53, 'Opal': 54, 'Flaxen': 55, 'Silver': 56, 'Illuminated': 57, 'Gilt': 58, 'Prism': 88, 'Sepulchered': 89, 'Vellum': 90, 'Starfield': 94, 'Lacquer': 97, 'Pitch': 101, 'Damascus': 114, 'Mithril': 115, 'Ingot': 116,
    // Anomalies
    'Bend-or Spots': 59, 'Birdcatcher Spots': 60, 'Brindle': 61, 'Chimera': 62, 'Geode': 63, 'Ore': 64, 'Stained Glass': 65, 'Kintsugi': 66, 'Swarf': 67, 'Vitiligo': 68, 'Oracle': 74, 'Signet': 75, 'Pennant': 76, 'Pastiche': 77, 'Fresco': 87, 'Lantern': 95,
    // Free markings the engine doesn't model but may name
    'Somatic': 69, 'Dapple': 86
};

// The specific fancy coats (Tyrian Pearl, Perlino, Amber Champagne, ...) don't
// each get a trait page; they share the page for their dilution. Map that
// dilution string to its page so a coat like Tyrian Pearl links to Tapestry
// Pearl (which shows all three of its colours). Double Cream + X shares the
// plain Cream + X page.
const DILUTION_PAGE_ID = {
    'Double Cream': 11, 'Pearl': 12, 'Champagne': 10, 'Ether': 19, 'Nacre': 104,
    'Cream Pearl': 15, 'Tapestry Cream': 13, 'Tapestry Ether': 21, 'Pearl Ether': 22,
    'Pearl Champagne': 16, 'Cream Champagne': 14, 'Double Cream Champagne': 102,
    'Cream Ether': 20, 'Double Cream Ether': 103, 'Tapestry Champagne': 17,
    'Cream Pearl Champagne': 23, 'Cream Pearl Ether': 24, 'Tapestry Cream Ether': 25,
    'Tapestry Pearl': 18, 'Tapestry Pearl Champagne': 26, 'Tapestry Pearl Ether': 27,
    'Tapestry Cream Champagne': 28
};

// Build coat name -> trait page id: a coat with its own page (Buckskin, Madder,
// ...) keeps it; every other coat falls back to its dilution's page.
const COAT_PAGE_IDS = {};
Object.keys(SPECIAL_COAT_NAMES).forEach(key => {
    const name = SPECIAL_COAT_NAMES[key];
    if (COAT_PAGE_IDS[name]) return;
    if (TRAIT_PAGE_IDS[name]) { COAT_PAGE_IDS[name] = TRAIT_PAGE_IDS[name]; return; }
    const dilStr = key.slice(key.indexOf('_') + 1);
    if (DILUTION_PAGE_ID[dilStr]) COAT_PAGE_IDS[name] = DILUTION_PAGE_ID[dilStr];
});

// Escape a trait or coat name, and wrap it in a link to its trait page when one
// exists (trait pages first, then the coat-to-dilution fallback).
function traitLink(name) {
    const esc = String(name).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const id = TRAIT_PAGE_IDS[name] || COAT_PAGE_IDS[name];
    if (!id) return esc;
    return `<a class="layer-link" href="${TRAIT_PAGE_BASE}${id}" target="_blank" rel="noopener noreferrer">${esc}</a>`;
}

// Filter one column definition down to the layers THIS horse actually has.
function buildLayerColumn(def, has, coatColor, hasWhiteMarking) {
    const rows = [];
    def.forEach(entry => {
        if (entry.base) { rows.push({ base: true, coat: coatColor }); return; }
        if (entry.whiteMarkings) { if (hasWhiteMarking) rows.push({ items: ['White Markings'], ref: true }); return; }
        const present = entry.traits.filter(t => has.has(t));
        if (!present.length) return;
        if (entry.group) rows.push({ group: entry.group, items: present });
        else rows.push({ items: present, join: entry.join || ', ' });
    });
    return rows;
}

// Resolve a genotype into the three visual-hierarchy columns, keeping only the
// layers this horse has (plus the base coat, which every horse has).
function genotypeToLayers(genoString, variant) {
    const t = resolveTraits(genoString);
    if (t.lethal) return { lethal: true };

    const { coatColor, allTraits, anomalies } = t;
    // Visible traits only — hidden carriers ('Carries Pearl', 'Carrying Flaxen'
    // and friends) aren't painted on the horse, so they don't belong in a layer.
    const has = new Set([
        ...allTraits.filter(x => !/^Carr(ies|ying) /.test(x)),
        ...anomalies
    ]);
    const hasWhiteMarking = [...has].some(x => WHITE_MARKING_LAYER_SET.has(x));

    return {
        lethal: false,
        coatColor,
        variant: variant && variant !== 'Standard' ? variant : '',
        columns: [
            { title: 'Colors & Markings', rows: buildLayerColumn(LAYER_COLORS_MARKINGS, has, coatColor, hasWhiteMarking) },
            { title: 'Eye Colors', rows: buildLayerColumn(LAYER_EYES, has, coatColor, hasWhiteMarking) },
            { title: 'Skin & Hoof Colors', rows: buildLayerColumn(LAYER_SKIN_HOOF, has, coatColor, hasWhiteMarking) }
        ],
        // The Somatic note is only worth showing when a shaping anomaly is present.
        somatic: has.has('Fresco') || has.has('Pastiche')
    };
}

// --- Layers tab UI handlers -------------------------------------------------

function populateLayersCollectionSelect() {
    const sel = document.getElementById('layersFromColl');
    if (!sel) return;
    const collection = (window.getCollection && window.getCollection()) || [];
    const cur = sel.value;
    sel.innerHTML = '<option value="">Pick from collection…</option>' +
        collection.map((h, i) =>
            `<option value="${i}">${(h.name || 'Unnamed').replace(/</g, '&lt;')} (${(h.temperament || '—').replace(/</g, '&lt;')})</option>`
        ).join('');
    if (cur && Number(cur) < collection.length) sel.value = cur;
    const row = document.getElementById('layersSourceRow');
    if (row) row.style.display = collection.length ? '' : 'none';
}

function fillLayersFromCollection(idx) {
    const collection = (window.getCollection && window.getCollection()) || [];
    const h = collection[Number(idx)];
    if (!h) return;
    const ta = document.getElementById('layersGeno');
    if (ta) ta.value = h.genotype || '';
    const varSel = document.getElementById('layersVariant');
    if (varSel) varSel.value = h.variant && h.variant !== 'Standard' ? h.variant : '';
}

// Render one column's rows top-to-bottom (top covers the layers below).
function renderLayerColumn(col) {
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rowsHtml = col.rows.map(r => {
        if (r.base) {
            return `<li class="layer-base"><span class="layer-base-tag">Base Coat Color</span> ${traitLink(r.coat || '')}</li>`;
        }
        if (r.group) {
            return `<li class="layer-group"><span class="layer-group-label">${esc(r.group)}</span>` +
                `<ul>` + r.items.map(i => `<li>${traitLink(i)}</li>`).join('') + `</ul></li>`;
        }
        if (r.ref) return `<li class="layer-ref">${esc(r.items.join(r.join || ', '))}</li>`;
        return `<li>${r.items.map(traitLink).join(r.join || ', ')}</li>`;
    }).join('');
    return `<div class="layer-col"><div class="layer-col-head">${esc(col.title)}</div><ul class="layer-list">${rowsHtml}</ul></div>`;
}

function showLayers() {
    const ta = document.getElementById('layersGeno');
    const varSel = document.getElementById('layersVariant');
    const out = document.getElementById('layersResult');
    if (!out) return;

    const geno = ta ? ta.value.trim() : '';
    const variant = varSel ? varSel.value : '';

    if (!geno) {
        out.style.display = 'block';
        out.innerHTML = '<p class="layers-empty">Paste a genotype, or pick a horse from your collection, and I\'ll lay its traits out in paint order.</p>';
        return;
    }

    trackUse('layers_run');
    const data = genotypeToLayers(geno, variant);
    out.style.display = 'block';

    if (data.lethal) {
        out.innerHTML = '<p class="layers-empty">This genotype is a lethal white, so there\'s no horse to lay out. Check the Translate tab for why.</p>';
        return;
    }

    // Warn about tokens the engine ignored, same as Translate, so a typo can't
    // quietly drop a layer.
    const { unknownGenes, unknownAnomalies } = findUnknownTokens(geno);
    let warnHtml = '';
    if (unknownGenes.length || unknownAnomalies.length) {
        trackUse('layers_unknown_tokens');
        const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const stray = unknownGenes.concat(unknownAnomalies);
        warnHtml = `<div class="translate-warn"><strong>Heads up:</strong> I didn't recognise ${stray.map(s => `<code>${esc(s)}</code>`).join(', ')}, so ${stray.length === 1 ? 'it was' : 'they were'} left out.</div>`;
    }

    const coatLine = `<p class="layers-coat">Painting <strong>${String(data.coatColor).replace(/</g, '&lt;')}</strong>${data.variant ? ' (' + String(data.variant).replace(/</g, '&lt;') + ')' : ''}, top layer covers the ones below. Work up from the base.</p>`;
    const cols = data.columns.map(renderLayerColumn).join('');
    const somatic = data.somatic
        ? '<p class="layers-note">Somatic-shaping anomaly present (Fresco/Pastiche): a Somatic marking sits on whichever layer it affects, so its place shifts with the gene it targets.</p>'
        : '';

    out.innerHTML = warnHtml + coatLine + `<div class="layer-cols">${cols}</div>` + somatic;
    out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function getGeneAlleles(gene) {
    // Crack a gene open like a dungeon chest to see what alleles are inside
    if (gene === 'EE' || gene === 'Ee' || gene === 'ee') {
        return gene.split('');
    }
    if (gene === 'AA' || gene === 'Aa' || gene === 'aa') {
        return gene.split('');
    }
    
    // n-prefix = heterozygous — one fancy allele, one normie
    if (gene.startsWith('n')) {
        return ['n', gene.substring(1)];
    }
    
    // Compound dilutions — two different dilutions sharing a locus like feuding roommates
    if (gene.includes('Cr') && gene.includes('prl')) {
        return ['Cr', 'prl'];  // Crprl
    }
    if (gene.includes('Tp') && gene.includes('prl')) {
        return ['Tp', 'prl'];  // Tpprl
    }
    if (gene.includes('Tp') && gene.includes('Cr')) {
        return ['Tp', 'Cr'];  // TpCr
    }

    // Ch and er have their own apartment (separate from the Cr/Tp/prl flat)
    if (gene.includes('Ch') && gene.includes('er')) {
        return ['Ch', 'er'];  // Cher
    }

    // Homozygous versions — when you bring TWO of the same allele to the party
    if (gene === 'CrCr') return ['Cr', 'Cr'];
    if (gene === 'TpTp') return ['Tp', 'Tp'];
    if (gene === 'prlprl') return ['prl', 'prl'];
    if (gene === 'erer') return ['er', 'er'];
    if (gene === 'ChCh') return ['Ch', 'Ch'];
    if (gene === 'DD') return ['D', 'D'];
    if (gene === 'TT') return ['T', 'T'];
    if (gene === 'GG') return ['G', 'G'];
    if (gene === 'RnRn') return ['Rn', 'Rn'];
    if (gene === 'LpLp') return ['Lp', 'Lp'];
    if (gene === 'ff') return ['f', 'f'];
    if (gene === 'spsp') return ['sp', 'sp'];
    if (gene === 'sfsf') return ['sf', 'sf'];
    if (gene === 'fefe') return ['fe', 'fe'];
    if (gene === 'lrlr') return ['lr', 'lr'];
    // White marking homozygous — spotty AND committed to it
    if (gene === 'OO') return ['O', 'O'];
    if (gene === 'SplSpl') return ['Spl', 'Spl'];
    if (gene === 'SbSb') return ['Sb', 'Sb'];
    if (gene === 'GiGi') return ['Gi', 'Gi'];
    if (gene === 'CoCo') return ['Co', 'Co'];
    if (gene === 'BB') return ['B', 'B'];
    if (gene === 'WW') return ['W', 'W'];
    if (gene === 'RbRb') return ['Rb', 'Rb'];
    if (gene === 'FlFl') return ['Fl', 'Fl'];
    if (gene === 'HqHq') return ['Hq', 'Hq'];
    if (gene === 'ShSh') return ['Sh', 'Sh'];
    if (gene === 'OsOs') return ['Os', 'Os'];
    if (gene === 'CuCu') return ['Cu', 'Cu'];
    if (gene === 'CwCw') return ['Cw', 'Cw'];
    
    // Modifier homozygous — double the modifier, double the drama
    if (gene === 'PP') return ['P', 'P'];
    if (gene === 'StySty') return ['Sty', 'Sty'];
    if (gene === 'GlGl') return ['Gl', 'Gl'];
    if (gene === 'ZZ') return ['Z', 'Z'];
    if (gene === 'TdTd') return ['Td', 'Td'];
    if (gene === 'VV') return ['V', 'V'];
    // Shared locus homozygous — twins in the same bunk bed
    if (gene === 'LuLu') return ['Lu', 'Lu'];
    if (gene === 'PrPr') return ['Pr', 'Pr'];
    if (gene === 'OpOp') return ['Op', 'Op'];
    // Compound heterozygous genes — the odd couples of the genetic world
    if (gene === 'PtPt') return ['Pt', 'Pt'];
    if (gene === 'InIn') return ['In', 'In'];
    if (gene === 'mtmt') return ['mt', 'mt'];
    if (gene === 'DmDm') return ['Dm', 'Dm'];
    if (gene === 'DmD' || gene === 'DDm') return ['Dm', 'D'];
    if (gene === 'ApAp') return ['Ap', 'Ap'];
    if (gene === 'GrGr') return ['Gr', 'Gr'];
    if (gene === 'GPt' || gene === 'PtG') return ['G', 'Pt'];
    if (gene === 'GrAp' || gene === 'ApGr') return ['Gr', 'Ap'];
    if (gene === 'Lusp') return ['Lu', 'sp'];
    if (gene === 'PrOp') return ['Pr', 'Op'];
    if (gene === 'CuCw') return ['Cu', 'Cw'];
    if (gene === 'BFl' || gene === 'FlB') return ['B', 'Fl'];
    if (gene === 'GiCo' || gene === 'CoGi') return ['Gi', 'Co'];
    // KIT locus compounds — the most crowded locus in all of horse genetics
    if (gene === 'TRn' || gene === 'RnT') return ['T', 'Rn'];
    if (gene === 'TSb' || gene === 'SbT') return ['T', 'Sb'];
    if (gene === 'TW' || gene === 'WT') return ['T', 'W'];
    if (gene === 'RnSb' || gene === 'SbRn') return ['Rn', 'Sb'];
    if (gene === 'RnW' || gene === 'WRn') return ['Rn', 'W'];
    if (gene === 'SbW' || gene === 'WSb') return ['Sb', 'W'];

    // Complex patterns — patn does its own weird thing
    if (gene === 'patnpatn') return ['patn', 'patn'];
    if (gene === 'patn') return ['patn'];

    return [gene];
}

function inheritGene(parent1Gene, parent2Gene, probability = 0.5) {
    const alleles1 = getGeneAlleles(parent1Gene);
    const alleles2 = getGeneAlleles(parent2Gene);
    
    // Randomly yoink one allele from each parent — Mendel's coin flip of destiny
    const from1 = alleles1[Math.random() < 0.5 ? 0 : Math.min(1, alleles1.length - 1)];
    const from2 = alleles2[Math.random() < 0.5 ? 0 : Math.min(1, alleles2.length - 1)];
    
    return combineAlleles(from1, from2);
}

function combineAlleles(allele1, allele2) {
    // Smash two alleles together like a genetic blacksmith forging a gene on an anvil
    if (allele1 === allele2) {
        // Homozygous — they're the same picture
        if (allele1 === 'E' || allele1 === 'e') return allele1 + allele1;
        if (allele1 === 'A' || allele1 === 'a') return allele1 + allele1;
        if (allele1 === 'Cr') return 'CrCr';
        if (allele1 === 'Tp') return 'TpTp';
        if (allele1 === 'prl') return 'prlprl';
        if (allele1 === 'er') return 'erer';
        if (allele1 === 'Ch') return 'ChCh';
        if (allele1 === 'D') return 'DD';
        if (allele1 === 'T') return 'TT';
        if (allele1 === 'G') return 'GG';
        if (allele1 === 'Rn') return 'RnRn';
        if (allele1 === 'Lp') return 'LpLp';
        if (allele1 === 'f') return 'ff';
        if (allele1 === 'sp') return 'spsp';
        if (allele1 === 'sf') return 'sfsf';
        if (allele1 === 'fe') return 'fefe';
        if (allele1 === 'lr') return 'lrlr';
        if (allele1 === 'patn') return 'patnpatn';
        // White marking homozygous — double trouble edition
        if (allele1 === 'O') return 'OO';
        if (allele1 === 'Spl') return 'SplSpl';
        if (allele1 === 'Sb') return 'SbSb';
        if (allele1 === 'Gi') return 'GiGi';
        if (allele1 === 'Co') return 'CoCo';
        if (allele1 === 'B') return 'BB';
        if (allele1 === 'W') return 'WW';
        if (allele1 === 'Rb') return 'RbRb';
        if (allele1 === 'Fl') return 'FlFl';
        if (allele1 === 'Hq') return 'HqHq';
        if (allele1 === 'Sh') return 'ShSh';
        if (allele1 === 'Os') return 'OsOs';
        if (allele1 === 'Cu') return 'CuCu';
        if (allele1 === 'Cw') return 'CwCw';
        if (allele1 === 'P') return 'PP';
        if (allele1 === 'Sty') return 'StySty';
        if (allele1 === 'Gl') return 'GlGl';
        if (allele1 === 'Z') return 'ZZ';
        if (allele1 === 'Td') return 'TdTd';
        if (allele1 === 'V') return 'VV';
        if (allele1 === 'Lu') return 'LuLu';
        if (allele1 === 'Pr') return 'PrPr';
        if (allele1 === 'Op') return 'OpOp';
        if (allele1 === 'Pt') return 'PtPt';
        if (allele1 === 'In') return 'InIn';
        if (allele1 === 'mt') return 'mtmt';
        if (allele1 === 'Dm') return 'DmDm';
        if (allele1 === 'Ap') return 'ApAp';
        if (allele1 === 'Gr') return 'GrGr';

        return allele1 + allele1;
    }
    
    // Heterozygous — one of each, the genetic equivalent of ordering one of everything
    if ((allele1 === 'E' && allele2 === 'e') || (allele1 === 'e' && allele2 === 'E')) return 'Ee';
    if ((allele1 === 'A' && allele2 === 'a') || (allele1 === 'a' && allele2 === 'A')) return 'Aa';
    
    // Dilution combinations — mixing potions at the locus-level alchemy table
    if ((allele1 === 'Cr' && allele2 === 'prl') || (allele1 === 'prl' && allele2 === 'Cr')) return 'Crprl';
    if ((allele1 === 'Tp' && allele2 === 'prl') || (allele1 === 'prl' && allele2 === 'Tp')) return 'Tpprl';
    if ((allele1 === 'Tp' && allele2 === 'Cr') || (allele1 === 'Cr' && allele2 === 'Tp')) return 'TpCr';

    // Ch/er — they have their own locus and frankly prefer it that way
    if ((allele1 === 'Ch' && allele2 === 'er') || (allele1 === 'er' && allele2 === 'Ch')) return 'Cher';

    // Shared locus compounds — genetic roommate pairings that somehow work out
    if ((allele1 === 'B' && allele2 === 'Fl') || (allele1 === 'Fl' && allele2 === 'B')) return 'BFl';
    if ((allele1 === 'Cu' && allele2 === 'Cw') || (allele1 === 'Cw' && allele2 === 'Cu')) return 'CuCw';
    if ((allele1 === 'Gi' && allele2 === 'Co') || (allele1 === 'Co' && allele2 === 'Gi')) return 'GiCo';
    if ((allele1 === 'Lu' && allele2 === 'sp') || (allele1 === 'sp' && allele2 === 'Lu')) return 'Lusp';
    if ((allele1 === 'Pr' && allele2 === 'Op') || (allele1 === 'Op' && allele2 === 'Pr')) return 'PrOp';
    if ((allele1 === 'G' && allele2 === 'Pt') || (allele1 === 'Pt' && allele2 === 'G')) return 'GPt';
    if ((allele1 === 'Dm' && allele2 === 'D') || (allele1 === 'D' && allele2 === 'Dm')) return 'DmD';
    if ((allele1 === 'Gr' && allele2 === 'Ap') || (allele1 === 'Ap' && allele2 === 'Gr')) return 'GrAp';
    // KIT locus — four alleles crammed into one locus like clowns in a tiny carriage
    if ((allele1 === 'T' && allele2 === 'Rn') || (allele1 === 'Rn' && allele2 === 'T')) return 'TRn';
    if ((allele1 === 'T' && allele2 === 'Sb') || (allele1 === 'Sb' && allele2 === 'T')) return 'TSb';
    if ((allele1 === 'T' && allele2 === 'W') || (allele1 === 'W' && allele2 === 'T')) return 'TW';
    if ((allele1 === 'Rn' && allele2 === 'Sb') || (allele1 === 'Sb' && allele2 === 'Rn')) return 'RnSb';
    if ((allele1 === 'Rn' && allele2 === 'W') || (allele1 === 'W' && allele2 === 'Rn')) return 'RnW';
    if ((allele1 === 'Sb' && allele2 === 'W') || (allele1 === 'W' && allele2 === 'Sb')) return 'SbW';

    // For n + allele — one normal, one mutant, the classic odd couple
    if (allele1 === 'n') return 'n' + allele2;
    if (allele2 === 'n') return 'n' + allele1;
    
    // Shrug emoji — just mash 'em together and hope for the best
    return allele1 + allele2;
}

function inheritBaseCoat(parent1Genes, parent2Genes) {
    // Gregor Mendel did not die for us to skip this step
    const p1E = parent1Genes.find(g => g.match(/^[Ee][Ee]?$/));
    const p1A = parent1Genes.find(g => g.match(/^[Aa][Aa]?$/));
    const p2E = parent2Genes.find(g => g.match(/^[Ee][Ee]?$/));
    const p2A = parent2Genes.find(g => g.match(/^[Aa][Aa]?$/));

    const eGene = inheritGene(p1E || 'Ee', p2E || 'Ee');
    const aGene = inheritGene(p1A || 'Aa', p2A || 'Aa');

    return [eGene, aGene];
}

function generateFoal(parent1, parent2, variation) {
    const p1 = parseGenotype(parent1.genotype);
    const p2 = parseGenotype(parent2.genotype);

    const foalGenes = [];
    const foalAnomalies = [];

    // Base coat — rolling the Punnett square dice in Mendel's honor
    const [eGene, aGene] = inheritBaseCoat(p1.genes, p2.genes);
    foalGenes.push(eGene, aGene);

    // Helper to rummage through a parent's genetic saddlebag
    function findGene(genes, pattern) {
        return genes.find(g => {
            if (typeof pattern === 'string') {
                return g.includes(pattern);
            }
            return pattern.test(g);
        });
    }

    // Dilutions — two separate loci doing their own thing, like parallel dungeon corridors
    const p1Dilution1 = findGene(p1.genes, /Cr|Tp|prl/);
    const p2Dilution1 = findGene(p2.genes, /Cr|Tp|prl/);

    if (p1Dilution1 || p2Dilution1) {
        const dilutionGene = inheritGene(p1Dilution1 || 'nn', p2Dilution1 || 'nn');
        if (dilutionGene !== 'nn' && dilutionGene !== 'n') {
            foalGenes.push(dilutionGene);
        }
    }

    // Ch/er locus — the Champagne and Ether wing of the genetics dungeon
    const p1ChEr = findGene(p1.genes, /Ch|er/);
    const p2ChEr = findGene(p2.genes, /Ch|er/);

    if (p1ChEr || p2ChEr) {
        const chErGene = inheritGene(p1ChEr || 'nn', p2ChEr || 'nn');
        if (chErGene !== 'nn' && chErGene !== 'n') {
            foalGenes.push(chErGene);
        }
    }

    // Leopard complex — Lp and patn live on different floors but text each other constantly
    const p1Lp = findGene(p1.genes, 'Lp');
    const p2Lp = findGene(p2.genes, 'Lp');
    const p1patn = findGene(p1.genes, 'patn');
    const p2patn = findGene(p2.genes, 'patn');

    if (p1Lp || p2Lp) {
        const lpGene = inheritGene(p1Lp || 'nn', p2Lp || 'nn');
        if (lpGene !== 'nn' && lpGene !== 'n') {
            foalGenes.push(lpGene);
        }
    }

    if (p1patn || p2patn) {
        const patnGene = inheritGene(p1patn || 'nn', p2patn || 'nn');
        if (patnGene !== 'nn' && patnGene !== 'n') {
            foalGenes.push(patnGene);
        }
    }

    // White markings — shared loci travel in pairs like dungeon party members
    // KIT locus: T, Rn, Sb, W (max 2 per horse — there's only so much room at this inn)
    const kitPattern = /^(nT|TT|nRn|RnRn|nSb|SbSb|nW|WW|TRn|RnT|TSb|SbT|TW|WT|RnSb|SbRn|RnW|WRn|SbW|WSb)$/;
    const p1Kit = findGene(p1.genes, kitPattern);
    const p2Kit = findGene(p2.genes, kitPattern);
    if (p1Kit || p2Kit) {
        const inherited = inheritGene(p1Kit || 'nn', p2Kit || 'nn');
        if (inherited !== 'nn' && inherited !== 'n' && !foalGenes.includes(inherited)) {
            foalGenes.push(inherited);
        }
    }

    // B/Fl locus — Blanched and False Leopard sharing a bunk
    const bFlPattern = /^(nB|BB|nFl|FlFl|BFl|FlB)$/;
    const p1BFl = findGene(p1.genes, bFlPattern);
    const p2BFl = findGene(p2.genes, bFlPattern);
    if (p1BFl || p2BFl) {
        const inherited = inheritGene(p1BFl || 'nn', p2BFl || 'nn');
        if (inherited !== 'nn' && inherited !== 'n' && !foalGenes.includes(inherited)) {
            foalGenes.push(inherited);
        }
    }

    // Cu/Cw locus — Cuirass and Crowned, the armor-and-tiara power couple
    const cuCwPattern = /^(nCu|CuCu|nCw|CwCw|CuCw)$/;
    const p1CuCw = findGene(p1.genes, cuCwPattern);
    const p2CuCw = findGene(p2.genes, cuCwPattern);
    if (p1CuCw || p2CuCw) {
        const inherited = inheritGene(p1CuCw || 'nn', p2CuCw || 'nn');
        if (inherited !== 'nn' && inherited !== 'n' && !foalGenes.includes(inherited)) {
            foalGenes.push(inherited);
        }
    }

    // Gi/Co locus — belt meets necklace, equine fashion week
    const giCoPattern = /^(nGi|GiGi|nCo|CoCo|GiCo|CoGi)$/;
    const p1GiCo = findGene(p1.genes, giCoPattern);
    const p2GiCo = findGene(p2.genes, giCoPattern);
    if (p1GiCo || p2GiCo) {
        const inherited = inheritGene(p1GiCo || 'nn', p2GiCo || 'nn');
        if (inherited !== 'nn' && inherited !== 'n' && !foalGenes.includes(inherited)) {
            foalGenes.push(inherited);
        }
    }

    // Gr/Ap locus: Greaves and Apron share an address, so a parent passes one or the other
    const grApPattern = /^(nGr|GrGr|nAp|ApAp|GrAp|ApGr)$/;
    const p1GrAp = findGene(p1.genes, grApPattern);
    const p2GrAp = findGene(p2.genes, grApPattern);
    if (p1GrAp || p2GrAp) {
        const inherited = inheritGene(p1GrAp || 'nn', p2GrAp || 'nn');
        if (inherited !== 'nn' && inherited !== 'n' && !foalGenes.includes(inherited)) {
            foalGenes.push(inherited);
        }
    }

    // These markings each get their own private suite — solo locus vibes
    const independentMarkings = ['O', 'Spl', 'Rb', 'Hq', 'Sh', 'Os'];
    independentMarkings.forEach(name => {
        const p1Gene = findGene(p1.genes, new RegExp(`^(n${name}|${name}${name})$`));
        const p2Gene = findGene(p2.genes, new RegExp(`^(n${name}|${name}${name})$`));

        if (p1Gene || p2Gene) {
            const inherited = inheritGene(p1Gene || 'nn', p2Gene || 'nn');
            if (inherited !== 'nn' && inherited !== 'n' && !foalGenes.includes(inherited)) {
                foalGenes.push(inherited);
            }
        }
    });

    // Modifiers — the seasoning on this genetic stew, shared loci served first
    // Lu/sp locus — Illuminated and Sepulchered, light vs dark in one address
    const luSpPattern = /^(nLu|LuLu|nsp|spsp|Lusp)$/;
    const p1LuSp = findGene(p1.genes, luSpPattern);
    const p2LuSp = findGene(p2.genes, luSpPattern);
    if (p1LuSp || p2LuSp) {
        const inherited = inheritGene(p1LuSp || 'nn', p2LuSp || 'nn');
        if (inherited !== 'nn' && inherited !== 'n' && !foalGenes.includes(inherited)) {
            foalGenes.push(inherited);
        }
    }

    // Pr/Op locus — Prism and Opal, the sparkle twins
    const prOpPattern = /^(nPr|PrPr|nOp|OpOp|PrOp)$/;
    const p1PrOp = findGene(p1.genes, prOpPattern);
    const p2PrOp = findGene(p2.genes, prOpPattern);
    if (p1PrOp || p2PrOp) {
        const inherited = inheritGene(p1PrOp || 'nn', p2PrOp || 'nn');
        if (inherited !== 'nn' && inherited !== 'n' && !foalGenes.includes(inherited)) {
            foalGenes.push(inherited);
        }
    }

    // G/Pt locus: Gray whitens, Pitch blackens, and they sit at the same address
    const gPtPattern = /^(nG|GG|nPt|PtPt|GPt|PtG)$/;
    const p1GPt = findGene(p1.genes, gPtPattern);
    const p2GPt = findGene(p2.genes, gPtPattern);
    if (p1GPt || p2GPt) {
        const inherited = inheritGene(p1GPt || 'nn', p2GPt || 'nn');
        if (inherited !== 'nn' && inherited !== 'n' && !foalGenes.includes(inherited)) {
            foalGenes.push(inherited);
        }
    }

    // D/Dm locus: Dun and Damascus share an address, and Damascus only shows
    // when the other side carries Dun, so a foal needs one from each parent.
    const dDmPattern = /^(nD|DD|nDm|DmDm|DmD|DDm)$/;
    const p1DDm = findGene(p1.genes, dDmPattern);
    const p2DDm = findGene(p2.genes, dDmPattern);
    if (p1DDm || p2DDm) {
        const inherited = inheritGene(p1DDm || 'nn', p2DDm || 'nn');
        if (inherited !== 'nn' && inherited !== 'n' && !foalGenes.includes(inherited)) {
            foalGenes.push(inherited);
        }
    }

    // These modifiers each live alone — independent loci for independent genes
    const independentModifiers = [
        { pattern: /^(nP|PP)$/, name: 'P' },
        { pattern: /^(nIn|InIn)$/, name: 'In' },
        { pattern: /^(nmt|mtmt)$/, name: 'mt' },
        { pattern: /^(nSty|StySty)$/, name: 'Sty' },
        { pattern: /^(nf|ff)$/, name: 'f' },
        { pattern: /^(nZ|ZZ)$/, name: 'Z' },
        { pattern: /^(nTd|TdTd)$/, name: 'Td' },
        { pattern: /^(nGl|GlGl)$/, name: 'Gl' },
        { pattern: /^(nV|VV)$/, name: 'V' },
        { pattern: /^(nsf|sfsf)$/, name: 'sf' },
        { pattern: /^(nfe|fefe)$/, name: 'fe' },
        { pattern: /^(nlr|lrlr)$/, name: 'lr' }
    ];

    independentModifiers.forEach(({ pattern, name }) => {
        const p1Gene = findGene(p1.genes, pattern);
        const p2Gene = findGene(p2.genes, pattern);

        if (p1Gene || p2Gene) {
            const inherited = inheritGene(p1Gene || 'nn', p2Gene || 'nn');
            if (inherited !== 'nn' && inherited !== 'n' && !foalGenes.includes(inherited)) {
                foalGenes.push(inherited);
            }
        }
    });
    
    // Anomalies — 25% chance each, like finding a weird mushroom in the dungeon
    [...p1.anomalies, ...p2.anomalies].forEach(anomaly => {
        if (Math.random() < 0.25) {
            if (!foalAnomalies.includes(anomaly)) {
                foalAnomalies.push(anomaly);
            }
        }
    });
    
    // 5% chance of a wild anomaly appearing — nature's loot box
    if (Math.random() < 0.05) {
        const randomAnomalies = ['Bend-or Spots', 'Birdcatcher Spots', 'Brindle', 'Chimera',
                                'Geode', 'Stained Glass', 'Kintsugi', 'Swarf', 'Vitiligo',
                                'Oracle', 'Signet', 'Pennant', 'Pastiche', 'Fresco', 'Lantern'];
        const random = randomAnomalies[Math.floor(Math.random() * randomAnomalies.length)];
        if (!foalAnomalies.includes(random)) {
            foalAnomalies.push(random);
        }
    }
    
    // Variant inheritance — will the foal be a special edition? The RNG gods decide
    const p1V = parent1.variant && parent1.variant !== 'Standard' ? parent1.variant : '';
    const p2V = parent2.variant && parent2.variant !== 'Standard' ? parent2.variant : '';
    let variant = '';
    if (p1V && p1V === p2V) {
        // Both parents share the same variant — guaranteed inheritance, finally something easy
        variant = p1V;
    } else {
        // Each non-Standard parent rolls the dice independently — 25% odds, no pressure
        const variantCandidates = [];
        if (p1V && Math.random() < 0.25) variantCandidates.push(p1V);
        if (p2V && Math.random() < 0.25) variantCandidates.push(p2V);
        if (variantCandidates.length > 0) {
            variant = variantCandidates[Math.floor(Math.random() * variantCandidates.length)];
        }
    }
    // No spontaneous variants: a foal can only inherit a variant a parent actually
    // carries (25% each). The 5% random roll is for ANOMALIES, not variants.

    // Temperament — foals are contractually obligated to be nothing like their parents (relatable)
    const temperaments = ['Choleric', 'Melancholic', 'Phlegmatic', 'Sanguine'];
    const availableTemps = temperaments.filter(t => t !== parent1.temperament && t !== parent2.temperament);
    const temperament = availableTemps[Math.floor(Math.random() * availableTemps.length)];
    
    return {
        genotype: foalGenes.join(' ') + (foalAnomalies.length > 0 ? ' + ' + foalAnomalies.join(', ') : ''),
        temperament: temperament,
        variant: variant || 'Standard'
    };
}

function generateFoals() {
    const parent1 = {
        genotype: document.getElementById('parent1Geno').value.trim(),
        temperament: document.getElementById('parent1Temp').value,
        variant: document.getElementById('parent1Variant').value || 'Standard'
    };
    
    const parent2 = {
        genotype: document.getElementById('parent2Geno').value.trim(),
        temperament: document.getElementById('parent2Temp').value,
        variant: document.getElementById('parent2Variant').value || 'Standard'
    };
    
    const errorMsg = document.getElementById('errorMessage');
    errorMsg.style.display = 'none';
    
    // Validation — you WILL fill out the form correctly or so help me
    if (!parent1.genotype || !parent2.genotype) {
        errorMsg.textContent = 'Please enter genotypes for both parents!';
        errorMsg.style.display = 'block';
        return;
    }
    
    if (!parent1.temperament || !parent2.temperament) {
        errorMsg.textContent = 'Please select temperaments for both parents!';
        errorMsg.style.display = 'block';
        return;
    }
    
    if (parent1.temperament === parent2.temperament) {
        // Handbook: two horses with the same Temperament can never breed, no bypass.
        errorMsg.textContent = `These two can't breed: both are ${parent1.temperament}. Parents must have different temperaments.`;
        errorMsg.style.display = 'block';
        if (window.AppShell && window.AppShell.toast) {
            window.AppShell.toast(`Both parents are ${parent1.temperament} — they can't breed.`, 'error');
        }
        trackUse('breeding_blocked_same_temperament');
        return;
    }

    // Non-blocking: warn if either parent's genotype carries tokens the engine
    // will ignore, so a typo doesn't quietly skew the foals (getGeneAlleles
    // would otherwise treat an unknown gene as a single always-inherited allele).
    const u1 = findUnknownTokens(parent1.genotype);
    const u2 = findUnknownTokens(parent2.genotype);
    const stray = [...new Set([...u1.unknownGenes, ...u1.unknownAnomalies, ...u2.unknownGenes, ...u2.unknownAnomalies])];
    if (stray.length) {
        if (window.AppShell && window.AppShell.toast) {
            window.AppShell.toast('Ignoring unrecognised token(s): ' + stray.join(', ') + '. Check for a typo.', 'error');
        }
        trackUse('foal_unknown_tokens');
    }

    // Every breeding has a 5% chance of twins (handbook): two separate foals,
    // each with their own set of possibilities.
    const litters = [makeLitter(parent1, parent2)];
    if (Math.random() < 0.05) litters.push(makeLitter(parent1, parent2));

    displayFoals(litters);
    displayFoalPossibilities(parent1, parent2);
    trackUse('foal_generated');
}

// "Every possible foal" — the full Mendelian spread this pairing can produce,
// listed like the Chimera breakdown. Reuses the chimera possibility engine
// (parents only; the foal arg just folds in a foal's own anomalies).
function displayFoalPossibilities(parent1, parent2) {
    const host = document.getElementById('foalPossibilities');
    if (!host) return;

    const poss = generateChimeraPossibilities('', parent1.genotype, parent2.genotype);

    // Foal-specific extras the chimera view doesn't cover:
    const temperaments = ['Choleric', 'Melancholic', 'Phlegmatic', 'Sanguine']
        .filter(t => t !== parent1.temperament && t !== parent2.temperament);
    const variants = ['Standard'];
    [parent1.variant, parent2.variant].forEach(v => {
        if (v && v !== 'Standard' && !variants.includes(v)) variants.push(v);
    });

    const rows = [];
    const addRow = (label, arr) => {
        if (!arr || arr.length === 0) return;
        rows.push(`<div class="poss-row"><span class="poss-label">${label} (${arr.length})</span><span class="poss-vals">${arr.join(', ')}</span></div>`);
    };

    addRow('Coats', poss.fullCoatNames);
    addRow('White markings', poss.whiteMarkings);
    addRow('Modifiers', poss.modifiers);

    // The chimera engine strips Chimera from its anomaly list on purpose (a
    // Chimera patch can't itself be Chimera), which is right for that tab but
    // wrong here: a parent's Chimera is inherited like any other anomaly. So
    // this row reads the parents directly rather than the filtered set.
    const inherited = Array.from(new Set([
        ...parseGenotype(parent1.genotype).anomalies,
        ...parseGenotype(parent2.genotype).anomalies
    ])).sort();
    const anomalyVals = inherited.length
        ? `${inherited.join(', ')} <span class="poss-note">(25% each from a parent, plus a 5% chance of a random one)</span>`
        : `<span class="poss-note">5% chance of a random anomaly</span>`;
    const anomalyLabel = inherited.length ? `Anomalies (${inherited.length})` : 'Anomalies';
    rows.push(`<div class="poss-row"><span class="poss-label">${anomalyLabel}</span><span class="poss-vals">${anomalyVals}</span></div>`);

    addRow('Temperaments', temperaments);
    addRow('Variants', variants);

    host.innerHTML = `
        <h3 class="poss-title">Every possible foal</h3>
        <p class="subtitle" style="text-align:center; margin-bottom:14px;">Any mix of the traits below. Each foal above is one random roll from these.</p>
        <div class="poss-list">${rows.join('')}</div>
    `;
}

// One foal's worth of possibilities (4 equally-likely outcomes).
function makeLitter(parent1, parent2) {
    const foals = [];
    for (let i = 0; i < 4; i++) foals.push(generateFoal(parent1, parent2, i));
    return foals;
}

function buildFoalCard(foal, index, parent1Geno, parent2Geno) {
        const card = document.createElement('div');
        card.className = 'foal-card';

        const rarityScore = calculateRarity(foal.genotype);
        const rarityClass = getRarityClass(rarityScore);
        const phenotype = genotypeToPhenotype(foal.genotype);

        // Check if this foal decided to be extra and roll Chimera
        const hasChimera = foal.genotype.toLowerCase().includes('chimera');

        let chimeraSection = '';
        if (hasChimera) {
            const chimeraPossibilities = generateChimeraPossibilities(foal.genotype, parent1Geno, parent2Geno);

            const totalOptions = chimeraPossibilities.baseCoats.length +
                                chimeraPossibilities.dilutions.length +
                                chimeraPossibilities.whiteMarkings.length +
                                chimeraPossibilities.modifiers.length +
                                chimeraPossibilities.anomalies.length;

            const locusInfo = chimeraPossibilities.locusInfo;
            const mandatoryBadge = '<span style="background: #a02b2b; color: #e0b4b4; font-size: 0.7em; padding: 1px 5px; margin-left: 6px; font-weight: 600; letter-spacing: 0.03em;">MANDATORY</span>';
            const optionalBadge = '<span style="background: #ececee; color: #8a8f98; font-size: 0.7em; padding: 1px 5px; margin-left: 6px; font-weight: 600; letter-spacing: 0.03em;">OPTIONAL</span>';

            // Build marking locus breakdown — a family tree within a family tree, we need to go deeper
            let markingLocusHtml = '';
            if (locusInfo.markingLoci.length > 0) {
                markingLocusHtml = locusInfo.markingLoci.map(locus => {
                    const badge = locus.mandatory ? mandatoryBadge : optionalBadge;
                    return `<div style="margin-top: 4px; padding-left: 8px; border-left: 2px solid ${locus.mandatory ? '#a02b2b' : '#ececee'};">
                        <span style="color: #7d6a86; font-size: 0.75em; font-weight: 600;">${locus.name}${badge}</span>
                        <div style="color: #6f6877; font-size: 0.8em;">${locus.traits.join(', ')}</div>
                    </div>`;
                }).join('');
            }

            chimeraSection = `
                <div style="margin-top: 15px; padding-top: 15px; border-top: 2px solid #dcd8de;">
                    <strong style="color: #8a4fc0; display: block; margin-bottom: 10px;">🎨 Chimera Possibilities:</strong>
                    <div style="background: #f7f5f3; padding: 12px; margin-bottom: 10px; border-left: 3px solid #8a4fc0;">
                        ${chimeraPossibilities.baseCoats.length > 0 ? `
                            <div style="margin-bottom: 8px;">
                                <strong style="color: #5d4b60; font-size: 0.85em;">Base Coats (${chimeraPossibilities.baseCoats.length})${mandatoryBadge}</strong>
                                <div style="color: #6f6877; font-size: 0.8em; margin-top: 4px;">${chimeraPossibilities.baseCoats.join(', ')}</div>
                            </div>
                        ` : ''}
                        ${chimeraPossibilities.dilutions.length > 0 ? `
                            <div style="margin-bottom: 8px;">
                                <strong style="color: #3f74b8; font-size: 0.85em;">Dilutions (${chimeraPossibilities.dilutions.length})${locusInfo.dilutionMandatory ? mandatoryBadge : optionalBadge}</strong>
                                ${locusInfo.dilutionLociNotes.length > 0 ? `<div style="color: #8a8f98; font-size: 0.7em; margin-top: 2px; font-style: italic;">Guaranteed: ${locusInfo.dilutionLociNotes.join(', ')}</div>` : ''}
                                <div style="color: #6f6877; font-size: 0.8em; margin-top: 4px;">${chimeraPossibilities.dilutions.join(', ')}</div>
                            </div>
                        ` : ''}
                        ${chimeraPossibilities.whiteMarkings.length > 0 ? `
                            <div style="margin-bottom: 8px;">
                                <strong style="color: #8a4fc0; font-size: 0.85em;">Markings (${chimeraPossibilities.whiteMarkings.length})</strong>
                                ${markingLocusHtml}
                            </div>
                        ` : ''}
                        ${chimeraPossibilities.modifiers.length > 0 ? `
                            <div style="margin-bottom: 8px;">
                                <strong style="color: #5f8a3f; font-size: 0.85em;">Modifiers (${chimeraPossibilities.modifiers.length})${optionalBadge}</strong>
                                <div style="color: #6f6877; font-size: 0.8em; margin-top: 4px;">${chimeraPossibilities.modifiers.join(', ')}</div>
                            </div>
                        ` : ''}
                        ${chimeraPossibilities.anomalies.length > 0 ? `
                            <div>
                                <strong style="color: #c8902e; font-size: 0.85em;">Anomalies (${chimeraPossibilities.anomalies.length})${optionalBadge}</strong>
                                <div style="color: #6f6877; font-size: 0.8em; margin-top: 4px;">${chimeraPossibilities.anomalies.join(', ')}</div>
                            </div>
                        ` : ''}
                    </div>
                    <button onclick='fillChimeraCalculator("${foal.genotype.replace(/'/g, "&#39;")}", "${parent1Geno.replace(/'/g, "&#39;")}", "${parent2Geno.replace(/'/g, "&#39;")}")'
                            style="margin-top: 10px; padding: 8px 12px; background: var(--dc-mauve); color: #fff; border: 1px solid var(--dc-mauve); border-radius: var(--radius-sm); cursor: pointer; font-family: var(--font-stamp); text-transform: uppercase; letter-spacing: var(--tracking-stamp); font-weight: 600; width: 100%; font-size: 0.85em;">
                        View Full Chimera Breakdown
                    </button>
                </div>
            `;
        }

        card.innerHTML = `
            <h3>Foal Option ${index + 1}</h3>
            <div class="foal-detail">
                <strong>Variant:</strong>
                <span>${foal.variant}</span>
            </div>
            <div class="foal-detail">
                <strong>Temperament:</strong>
                <span>${foal.temperament}</span>
            </div>
            <div class="foal-detail">
                <strong>Phenotype:</strong>
                <span>${phenotype}</span>
            </div>
            <div class="foal-detail">
                <strong>Genotype:</strong>
                <span class="geno-copy" data-geno="${foal.genotype.replace(/"/g, '&quot;')}" title="Click to copy genotype">${foal.genotype} <span class="copy-hint">⧉</span></span>
            </div>
            <span class="rarity-badge ${rarityClass}">Rarity: ${rarityScore}</span>
            ${chimeraSection}
        `;

        return card;
}

function displayFoals(litters) {
    const resultsContainer = document.getElementById('resultsContainer');
    const resultsGrid = document.getElementById('resultsGrid');
    const resultsTitle = resultsContainer.querySelector('.results-title');

    resultsGrid.innerHTML = '';

    // Grab parent genotypes in case any foal has the audacity to be a Chimera
    const parent1Geno = document.getElementById('parent1Geno').value.trim();
    const parent2Geno = document.getElementById('parent2Geno').value.trim();

    const twins = litters.length > 1;
    if (resultsTitle) resultsTitle.textContent = twins ? 'Twins! Two foals 🐴🐴' : 'The possible foals';
    // For twins we stack two labelled sections; for one foal we use the grid directly.
    resultsGrid.style.display = twins ? 'block' : '';

    if (twins) {
        litters.forEach((foals, li) => {
            const section = document.createElement('div');
            const heading = document.createElement('h3');
            heading.className = 'twin-heading';
            heading.textContent = 'Twin ' + (li + 1);
            section.appendChild(heading);
            const grid = document.createElement('div');
            grid.className = 'results-grid';
            foals.forEach((foal, index) => grid.appendChild(buildFoalCard(foal, index, parent1Geno, parent2Geno)));
            section.appendChild(grid);
            resultsGrid.appendChild(section);
        });
    } else {
        litters[0].forEach((foal, index) => resultsGrid.appendChild(buildFoalCard(foal, index, parent1Geno, parent2Geno)));
    }

    resultsContainer.style.display = 'block';
    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Rarity weights, aligned with the official Dungeon Coursers trait index.
// common = 0 (left out), uncommon = 10, rare = 25, epic = 50, legendary = 100.
const TIER_UNCOMMON = 10, TIER_RARE = 25, TIER_EPIC = 50, TIER_LEGENDARY = 100;

// Per-gene tier for markings, modifiers and carriers, keyed by the exact gene
// token (matched against the parsed genes, not the raw string, so nf can't be
// mistaken for nfe). Coats and the leopard complex depend on combinations
// across loci, so they're scored separately below.
const GENE_RARITY = {
    // --- Markings --- (Splash, Roan, Tobiano, Snowflake, Apron, Greaves are common = 0)
    'nCu': TIER_UNCOMMON, 'CuCu': TIER_UNCOMMON, 'CuCw': TIER_UNCOMMON,
    'nCw': TIER_UNCOMMON, 'CwCw': TIER_UNCOMMON,
    'nO': TIER_UNCOMMON, 'OO': TIER_UNCOMMON,
    'nSb': TIER_UNCOMMON, 'SbSb': TIER_UNCOMMON,
    'nGi': TIER_UNCOMMON, 'GiGi': TIER_UNCOMMON,
    'nCo': TIER_UNCOMMON, 'CoCo': TIER_UNCOMMON, 'GiCo': TIER_UNCOMMON, 'CoGi': TIER_UNCOMMON,
    'nB': TIER_RARE, 'BB': TIER_RARE,
    'nW': TIER_RARE, 'WW': TIER_RARE,
    'nRb': TIER_RARE, 'RbRb': TIER_RARE,
    'nFl': TIER_RARE, 'FlFl': TIER_RARE, 'BFl': TIER_RARE, 'FlB': TIER_RARE,
    'nHq': TIER_EPIC, 'HqHq': TIER_EPIC,
    'nSh': TIER_EPIC, 'ShSh': TIER_EPIC,
    'fefe': TIER_LEGENDARY,
    'nOs': TIER_LEGENDARY, 'OsOs': TIER_LEGENDARY,
    // KIT compounds — scored by the rarest pattern in the pair
    'TSb': TIER_UNCOMMON, 'SbT': TIER_UNCOMMON,
    'RnSb': TIER_UNCOMMON, 'SbRn': TIER_UNCOMMON,
    'TW': TIER_RARE, 'WT': TIER_RARE,
    'RnW': TIER_RARE, 'WRn': TIER_RARE,
    'SbW': TIER_RARE, 'WSb': TIER_RARE,
    // --- Modifiers --- (Dun, Pangare, Sooty, Gray are common = 0)
    'nPt': TIER_RARE, 'PtPt': TIER_RARE, 'GPt': TIER_RARE, 'PtG': TIER_RARE,
    'nDm': TIER_UNCOMMON, 'DmDm': TIER_UNCOMMON, 'DmD': TIER_UNCOMMON, 'DDm': TIER_UNCOMMON,
    'nmt': TIER_EPIC, 'mtmt': TIER_EPIC,
    'nIn': TIER_LEGENDARY, 'InIn': TIER_LEGENDARY,
    'ff': TIER_UNCOMMON,
    'nZ': TIER_UNCOMMON, 'ZZ': TIER_UNCOMMON,
    'nLu': TIER_UNCOMMON, 'LuLu': TIER_UNCOMMON, 'Lusp': TIER_UNCOMMON,
    'spsp': TIER_UNCOMMON,
    'nTd': TIER_RARE, 'TdTd': TIER_RARE,
    'nGl': TIER_RARE, 'GlGl': TIER_RARE,
    'nV': TIER_RARE, 'VV': TIER_RARE,
    'nOp': TIER_EPIC, 'OpOp': TIER_EPIC,
    'lrlr': TIER_EPIC,
    'nPr': TIER_LEGENDARY, 'PrPr': TIER_LEGENDARY, 'PrOp': TIER_LEGENDARY,
    'sfsf': TIER_LEGENDARY,
    // --- Carriers --- (Carries Flaxen, Patn, Sepulchered are common = 0)
    'ner': TIER_UNCOMMON, 'Cher': TIER_UNCOMMON,
    'nprl': TIER_UNCOMMON,
    'nlr': TIER_RARE,
    'nfe': TIER_EPIC,
    'nsf': TIER_EPIC
};

// Locus-1 dilutions (Cream/Tapestry/Pearl) by how fancy they are on their own.
const L1_SINGLE = ['nCr', 'Cr', 'nTp', 'Tp', 'TpTp'];        // alone = uncommon
const L1_RARE = ['CrCr', 'prlprl', 'TpCr'];                  // alone = rare
const L1_EPIC = ['Crprl', 'Tpprl'];                          // alone = epic
const L1_LEGENDARY = ['Crprl', 'TpCr', 'Tpprl'];             // + a locus-2 dilution = legendary
const L2_DILUTIONS = ['nCh', 'Ch', 'ChCh', 'erer', 'Cher'];  // Champagne / Ether, rare on their own

// Score the coat (dilution combination) as a single tier.
function coatRarity(genes) {
    const l1 = genes.find(g => L1_SINGLE.includes(g) || L1_RARE.includes(g) || L1_EPIC.includes(g));
    const l2 = genes.find(g => L2_DILUTIONS.includes(g));
    if (!l1 && !l2) return 0;
    // Two Cream genes with Champagne or Ether (Double Cream Champagne, Ash
    // Ether) and two Pearl genes with a Cher pair (Nacre) were invisible
    // interactions until the coat overhaul made them Legendary coats.
    if (l1 === 'CrCr' && l2) return TIER_LEGENDARY;
    if (l1 === 'prlprl' && l2 === 'Cher') return TIER_LEGENDARY;
    if (l1 && L1_LEGENDARY.includes(l1) && l2) return TIER_LEGENDARY;
    if (l1 && l2) return TIER_EPIC;                 // two dilutions across both loci
    if (l1 && L1_EPIC.includes(l1)) return TIER_EPIC;
    if (l1 && L1_RARE.includes(l1)) return TIER_RARE;
    if (l2) return TIER_RARE;                       // Champagne or Ether on its own
    return TIER_UNCOMMON;                            // single Cream or single Tapestry
}

// Score the leopard complex (Lp + patn), which spans two loci.
function leopardRarity(genes) {
    const hasLp = genes.includes('nLp') || genes.includes('LpLp');
    if (!hasLp) return 0;
    const homLp = genes.includes('LpLp');
    const patn = genes.includes('patnpatn') ? 'hom' : (genes.includes('npatn') ? 'het' : 'none');
    if (homLp && patn === 'hom') return TIER_EPIC;   // Fewspot
    if (homLp && patn === 'het') return TIER_RARE;   // Snowcap
    if (homLp && patn === 'none') return TIER_RARE;  // Varnish Roan
    if (!homLp && patn === 'hom') return TIER_RARE;  // Leopard
    if (!homLp && patn === 'het') return TIER_UNCOMMON; // Blanket
    return 0;                                        // Snowflake (nLp alone) = common
}

function calculateRarity(genotype) {
    const { genes } = parseGenotype(genotype);
    let score = coatRarity(genes) + leopardRarity(genes);
    genes.forEach(g => { if (GENE_RARITY[g]) score += GENE_RARITY[g]; });
    return score;
}

function getRarityClass(score) {
    if (score >= 100) return 'legendary';
    if (score >= 50) return 'epic';
    if (score >= 25) return 'rare';
    if (score >= 10) return 'uncommon';
    return 'common';
}

// Custom Scroll Generator — the gacha machine of horse genetics, sorted by how jealous you'll make people
const RARITY_GENES = {
    legendary: {
        coatColors: [
            // Triple dilutions — three flavors of fancy stacked like a genetics parfait
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'Tpprl', 'erer'] },  // Tyrian Pearl Ether
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'Tpprl', 'erer'] }, // Phthalo Pearl Ether
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'Tpprl', 'erer'] }, // Ochre Pearl Ether
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'Tpprl', 'nCh'] }, // Tyrian Pearl Champagne
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'Tpprl', 'nCh'] }, // Phthalo Pearl Champagne
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'Tpprl', 'nCh'] }, // Ochre Pearl Champagne
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'Crprl', 'erer'] }, // Ombre Cream Pearl Ether
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'Crprl', 'erer'] }, // Classic Cream Pearl Ether
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'Crprl', 'erer'] }, // Cold Cream Pearl Ether
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'Crprl', 'nCh'] }, // Amber Cream Pearl Champagne
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'Crprl', 'nCh'] }, // Classic Cream Pearl Champagne
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'Crprl', 'nCh'] }, // Gold Cream Pearl Champagne
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'TpCr', 'erer'] }, // Madder Cream Ether
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'TpCr', 'erer'] }, // Woad Cream Ether
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'TpCr', 'erer'] }, // Weld Cream Ether
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'TpCr', 'nCh'] }, // Madder Cream Champagne
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'TpCr', 'nCh'] }, // Woad Cream Champagne
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'TpCr', 'nCh'] }, // Weld Cream Champagne
            // Coat overhaul: formerly invisible interactions, now Legendary coats
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'CrCr', 'nCh'] }, // Perlino Champagne
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'CrCr', 'nCh'] }, // Smoky Cream Champagne
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'CrCr', 'nCh'] }, // Cremello Champagne
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'CrCr', 'erer'] }, // Ombre Ash Ether
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'CrCr', 'erer'] }, // Classic Ash Ether
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'CrCr', 'erer'] }, // Cold Ash Ether
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'prlprl', 'Cher'] }, // Cerulean Bay Nacre
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'prlprl', 'Cher'] }, // Saffron Black Nacre
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'prlprl', 'Cher'] } // Rose Gold Nacre
        ],
        markings: ['fefe', 'nOs'],
        modifiers: ['nPr', 'sfsf', 'nIn']
    },
    epic: {
        coatColors: [
            // Two dilutions across both loci — fancy enough to need reservations
            // Cream Champagne (Cr + Ch) — expensive tastes
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'nCr', 'nCh'] }, // Amber Cream Champagne
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'nCr', 'nCh'] }, // Classic Cream Champagne
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'nCr', 'nCh'] }, // Gold Cream Champagne
            // Cream Pearl (Crprl) — two different dilutions forced to share a locus
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'Crprl'] }, // Buckskin Pearl
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'Crprl'] }, // Smoky Black Pearl
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'Crprl'] }, // Palomino Pearl
            // Pearl Champagne (prlprl + Ch) — shimmery AND bubbly at the gala
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'prlprl', 'nCh'] }, // Bay Pearl Champagne
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'prlprl', 'nCh'] }, // Black Pearl Champagne
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'prlprl', 'nCh'] }, // Gold Pearl Champagne
            // Tapestry Champagne (Tp + Ch) — a woven wall hanging at a fancy party
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'nTp', 'nCh'] }, // Madder Champagne
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'nTp', 'nCh'] }, // Woad Champagne
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'nTp', 'nCh'] }, // Weld Champagne
            // Tapestry Pearl (Tpprl) — medieval handicraft meets oyster treasure
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'Tpprl'] }, // Tyrian Pearl
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'Tpprl'] }, // Phthalo Pearl
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'Tpprl'] }, // Ochre Pearl
            // Cream Ether (Cr + erer) — half ghost, half cream puff
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'nCr', 'erer'] }, // Ombre Cream Ether
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'nCr', 'erer'] }, // Classic Cream Ether
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'nCr', 'erer'] }, // Cold Cream Ether
            // Tapestry Ether (Tp + erer) — a spectral tapestry you can almost see through
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'nTp', 'erer'] }, // Madder Ether
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'nTp', 'erer'] }, // Woad Ether
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'nTp', 'erer'] }, // Weld Ether
            // Pearl Ether (prlprl + erer) — iridescent ghost horse, peak aesthetic
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'prlprl', 'erer'] }, // Bay Pearl Ether
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'prlprl', 'erer'] }, // Black Pearl Ether
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'prlprl', 'erer'] } // Gold Pearl Ether
        ],
        markings: ['nHq', 'LpLp patnpatn', 'nSh'],
        modifiers: ['nOp', 'lrlr', 'mtmt']
    },
    rare: {
        coatColors: [
            // Champagne (nCh) — pop!
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'nCh'] }, // Amber Champagne
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'nCh'] }, // Classic Champagne
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'nCh'] }, // Gold Champagne
            // Double Cream (CrCr) — so creamy it's practically a dessert
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'CrCr'] }, // Perlino
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'CrCr'] }, // Smoky Cream
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'CrCr'] }, // Cremello
            // Pearl (prlprl) — recessive treasure, worth the wait
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'prlprl'] }, // Bay Pearl
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'prlprl'] }, // Black Pearl
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'prlprl'] }, // Gold Pearl
            // Tapestry Cream (TpCr) — tapestry meets cream filling, the eclair of genes
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'TpCr'] }, // Madder Buckskin
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'TpCr'] }, // Woad Smoky Black
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'TpCr'] }, // Weld Palomino
            // Ether (erer) — finally visible after lurking recessively for generations
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'erer'] }, // Ombre Ether
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'erer'] }, // Classic Ether
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'erer'] } // Cold Ether
        ],
        markings: ['nB', 'nLp patnpatn', 'LpLp patn', 'LpLp', 'nW', 'nRb', 'nFl'],
        modifiers: ['nTd', 'nGl', 'nV', 'nPt']
    },
    uncommon: {
        coatColors: [
            // Cream (nCr) — just a hint of dilution, like adding milk to dungeon coffee
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'nCr'] }, // Buckskin
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'nCr'] }, // Smoky Black
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'nCr'] }, // Palomino
            // Tapestry (nTp) — one dose of woven-wall-hanging energy
            { baseCoat: 'Bay', genes: ['Ee', 'AA', 'nTp'] }, // Madder
            { baseCoat: 'Black', genes: ['Ee', 'aa', 'nTp'] }, // Woad
            { baseCoat: 'Chestnut', genes: ['ee', 'AA', 'nTp'] } // Weld
        ],
        markings: ['nCu', 'nCw', 'nO', 'nLp patn', 'nSb', 'nGi', 'nCo'],
        modifiers: ['nf', 'nZ', 'nLu', 'nsp', 'DmD']
    },
    common: {
        coatColors: [
            { baseCoat: 'Bay', genes: ['Ee', 'AA'] },
            { baseCoat: 'Black', genes: ['Ee', 'aa'] },
            { baseCoat: 'Chestnut', genes: ['ee', 'AA'] }
        ],
        markings: ['nSpl', 'nRn', 'nT', 'nLp', 'nAp', 'nGr'],
        modifiers: ['nD', 'nP', 'nSty', 'nG']
    }
};

const TEMPERAMENTS = ['Choleric', 'Melancholic', 'Phlegmatic', 'Sanguine'];
const VARIANTS = ['Standard', 'Heraldic', 'Puck', 'Cavedweller', 'Restored'];
const ALL_ANOMALIES = [
    'Bend-or Spots', 'Birdcatcher Spots', 'Brindle', 'Chimera',
    'Geode', 'Stained Glass', 'Kintsugi', 'Swarf', 'Vitiligo',
    'Oracle', 'Signet', 'Pennant', 'Pastiche', 'Fresco', 'Lantern'
];

// Free markings: written in the genotype after the `+` like an anomaly, but any
// player can add one to any horse for nothing. They're deliberately NOT in
// ALL_ANOMALIES — that list is the random-roll pool, and a free marking is
// never rolled, inherited or scored for rarity. This list exists so the parser
// stops flagging a perfectly valid `+ Somatic` as an unknown token.
// (Dapple belongs here too, once its rules are confirmed.)
const FREE_MARKINGS = ['Somatic'];

function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function generateCustomScroll(rarity) {
    const rarityKey = rarity.toLowerCase();
    const rarityData = RARITY_GENES[rarityKey];

    if (!rarityData) {
        alert('Invalid rarity level!');
        return null;
    }

    // Build the menu of coats available at this rarity tier (no substitutions)
    let availableCoatColors = [...rarityData.coatColors];

    // Collect markings/modifiers from this tier and below — you can always slum it
    const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    const rarityIndex = rarityOrder.indexOf(rarityKey);

    let availableMarkings = [];
    let availableModifiers = [];

    for (let i = 0; i <= rarityIndex; i++) {
        const currentRarity = rarityOrder[i];
        availableMarkings = availableMarkings.concat(RARITY_GENES[currentRarity].markings);
        availableModifiers = availableModifiers.concat(RARITY_GENES[currentRarity].modifiers);
    }

    // Conjure forth a horse from the scroll's arcane randomness
    const genes = [];

    // 1. Spin the coat color wheel of fortune
    const selectedCoat = getRandomElement(availableCoatColors);
    genes.push(...selectedCoat.genes);

    // 2. Blindly reach into the trait grab-bag — what do we get??
    const allTraits = [...availableMarkings, ...availableModifiers];
    if (allTraits.length > 0) {
        const selectedTrait = getRandomElement(allTraits);
        // Handle multi-gene traits — some come as a package deal, like Fewspot's "LpLp patnpatn"
        if (selectedTrait.includes(' ')) {
            selectedTrait.split(' ').forEach(g => genes.push(g));
        } else {
            genes.push(selectedTrait);
        }
    }

    // 3. 10% chance the scroll throws in a bonus anomaly — dealer's choice
    const anomalies = [];
    if (Math.random() < 0.10) {
        anomalies.push(getRandomElement(ALL_ANOMALIES));
    }

    // 4. 5% chance the scroll goes "surprise! you're special now"
    let variant = 'Standard';
    if (Math.random() < 0.05) {
        const nonStandardVariants = VARIANTS.filter(v => v !== 'Standard');
        variant = getRandomElement(nonStandardVariants);
    }

    // 5. Random temperament — the horse's personality is non-negotiable
    const temperament = getRandomElement(TEMPERAMENTS);

    // Stitch the genotype string together like a scroll inscription
    let genotype = genes.join(' ');
    if (anomalies.length > 0) {
        genotype += ' + ' + anomalies.join(', ');
    }

    return {
        genotype: genotype,
        temperament: temperament,
        variant: variant,
        rarity: rarity
    };
}

function displayCustomScrollResult() {
    const raritySelect = document.getElementById('scrollRarity');
    const rarity = raritySelect.value;

    const result = generateCustomScroll(rarity);
    if (!result) return;

    const resultDiv = document.getElementById('scrollResult');
    const phenotype = genotypeToPhenotype(result.genotype);
    const rarityScore = calculateRarity(result.genotype);
    const rarityClass = getRarityClass(rarityScore);

    resultDiv.innerHTML = `
        <div class="scroll-result-card">
            <h3>Your ${rarity} Custom Scroll Creation</h3>
            <div class="result-section">
                <h4>Phenotype:</h4>
                <p class="phenotype">${phenotype}</p>
            </div>
            <div class="result-section">
                <h4>Genotype:</h4>
                <p class="geno">${result.genotype}</p>
            </div>
            <div class="result-section">
                <h4>Stats:</h4>
                <p><strong>Temperament:</strong> ${result.temperament}</p>
                <p><strong>Variant:</strong> ${result.variant}</p>
                <span class="rarity-badge ${rarityClass}">Rarity: ${rarityScore}</span>
            </div>
            <button onclick="displayCustomScrollResult()"
                    style="margin-top: 15px; padding: 10px 20px; background: #dcd8de; color: #5d4b60; border: 2px solid #5d4b60; cursor: pointer; font-weight: 600;">
                Generate Another
            </button>
        </div>
    `;

    resultDiv.style.display = 'block';
    resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    trackUse('scroll_generated');
}

// Breeding Search — the matchmaking service for your pixel horses, swipe right on genetics
function searchBreeding() {
    const query = document.getElementById('breedingQuery').value.toLowerCase().trim();
    const resultsDiv = document.getElementById('searchResults');
    const resultsContent = document.getElementById('searchResultsContent');
    
    if (!query) {
        if (window.AppShell) window.AppShell.toast('Type a breeding question first, like "How can I make Amber Champagne?"', 'error');
        else alert('Please enter a breeding question!');
        return;
    }

    if (horseCollection.length === 0) {
        if (window.AppShell) window.AppShell.toast('Your stable is empty. Add or import horses in the Collection tab first.', 'error');
        else alert('Please upload your horse collection CSV first!');
        return;
    }
    
    resultsContent.innerHTML = '';
    trackUse('search_run');

    // Decode the breeder's desperate plea into actual searchable traits
    const targetTraits = extractTraitsFromQuery(query);

    if (targetTraits.length === 0) {
        resultsContent.innerHTML = '<p style="color: #6f6877;">Could not identify specific traits in your query. Try asking like: "How can I make Amber Champagne?" or "Who can breed for fewspot?"</p>';
        resultsDiv.style.display = 'block';
        // Friction: the search didn't understand what they asked for.
        trackUse('search_no_traits');
        return;
    }

    // Send the matchmaking algorithm into the collection to find compatible pairs
    const matches = findBreedingMatches(targetTraits);

    if (matches.length === 0) {
        trackUse('search_no_matches');
        resultsContent.innerHTML = `<p style="color: #6f6877;">No breeding pairs found in your collection that can produce: <strong style="color: #5d4b60;">${targetTraits.join(', ')}</strong></p>`;
    } else {
        // Stash these matches for the grand reveal in the modal
        lastSearchMatches = matches;
        lastSearchTraits = targetTraits;

        resultsContent.innerHTML = `
            <p style="color: #6f6877; margin-bottom: 15px;">Found <strong style="color: #5d4b60;">${matches.length}</strong> possible breeding pair(s) for: <strong style="color: #5d4b60;">${targetTraits.join(', ')}</strong></p>
            <button onclick="openSearchModal()"
                    style="padding: 12px 24px; background: var(--dc-mauve); color: #fff; border: 1px solid var(--dc-mauve); border-radius: var(--radius-sm); cursor: pointer; font-family: var(--font-stamp); text-transform: uppercase; letter-spacing: var(--tracking-stamp); font-size: 0.9em; letter-spacing: 1px; transition: all 0.2s;">
                View All Results
            </button>
        `;
    }

    resultsDiv.style.display = 'block';
    resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Phase 4: remember this query so the shell can show recent searches.
    if (window.AppShell && window.AppShell.recordQuery) {
        window.AppShell.recordQuery(query, matches.length);
    }
}

let lastSearchMatches = [];
let lastSearchTraits = [];
const RESULTS_PER_PAGE = 10;
let currentModalPage = 0;

function openSearchModal() {
    currentModalPage = 0;
    renderModalPage();
    document.getElementById('searchModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeSearchModal() {
    document.getElementById('searchModal').classList.remove('active');
    document.body.style.overflow = '';
}

function renderModalPage() {
    const modalBody = document.getElementById('modalBody');
    const modalPagination = document.getElementById('modalPagination');
    const totalPages = Math.ceil(lastSearchMatches.length / RESULTS_PER_PAGE);
    const start = currentModalPage * RESULTS_PER_PAGE;
    const end = Math.min(start + RESULTS_PER_PAGE, lastSearchMatches.length);
    const pageMatches = lastSearchMatches.slice(start, end);

    document.getElementById('modalTitle').textContent =
        `Results for: ${lastSearchTraits.join(', ')} (${lastSearchMatches.length} pairs)`;

    modalBody.innerHTML = '';
    pageMatches.forEach(match => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.style.cursor = 'pointer';
        const p1Pheno = genotypeToPhenotype(match.parent1.genotype);
        const p2Pheno = genotypeToPhenotype(match.parent2.genotype);
        item.innerHTML = `
            <h4>${match.parent1.name} &times; ${match.parent2.name}</h4>
            <p><strong>Parent 1:</strong> ${match.parent1.id} - ${match.parent1.temperament}</p>
            <p style="color: #5d4b60; font-size: 0.85em; margin: 4px 0;">${p1Pheno}</p>
            <span class="geno">${match.parent1.genotype}</span>
            <p><strong>Parent 2:</strong> ${match.parent2.id} - ${match.parent2.temperament}</p>
            <p style="color: #5d4b60; font-size: 0.85em; margin: 4px 0;">${p2Pheno}</p>
            <span class="geno">${match.parent2.genotype}</span>
            <p style="margin-top: 10px;"><strong style="color: #5d4b60;">Match Score:</strong> ${match.score} | <strong style="color: #5d4b60;">Probability:</strong> ${match.probability}</p>
        `;
        item.addEventListener('click', function() {
            fillParents(match.parent1, match.parent2);
            closeSearchModal();
        });
        modalBody.appendChild(item);
    });

    // Teleport the scroll back to the top — no one likes starting mid-page
    document.getElementById('searchModal').scrollTop = 0;

    // Pagination — because even dungeon scrolls have page numbers
    modalPagination.innerHTML = `
        <button onclick="changeModalPage(-1)" ${currentModalPage === 0 ? 'disabled' : ''}>Prev</button>
        <span class="page-info">Page ${currentModalPage + 1} of ${totalPages}</span>
        <button onclick="changeModalPage(1)" ${currentModalPage >= totalPages - 1 ? 'disabled' : ''}>Next</button>
    `;
}

function changeModalPage(delta) {
    const totalPages = Math.ceil(lastSearchMatches.length / RESULTS_PER_PAGE);
    currentModalPage = Math.max(0, Math.min(currentModalPage + delta, totalPages - 1));
    renderModalPage();
}

function extractTraitsFromQuery(query) {
    const traits = [];
    let workingQuery = query;

    // Carrier sleuthing — "carries X" / "carrying X" / "carrier of X" finds pairs whose foals
    // can carry a recessive without expressing it (great for stacking nfe → fefe down the line)
    // The names here must be the exact ones the translator prints, so a phrase copied
    // off a translated genotype searches for the same trait it described.
    const carrierMap = {
        'filigree': 'Carrying Filigree',
        'pearl': 'Carries Pearl',
        'ether': 'Carries Ether',
        'flaxen': 'Carrying Flaxen',
        'starfield': 'Carrying Starfield',
        'lacquer': 'Carrying Lacquer',
        'sepulchered': 'Carrying Sepulchered',
        'patn': 'Carries Patn',
        'mithril': 'Carrying Mithril',
        'damascus': 'Carries Damascus'
    };
    const carrierPattern = /(?:carries|carrier(?:\s+of)?|carrying)\s+(filigree|pearl|ether|flaxen|starfield|lacquer|sepulchered|patn|mithril|damascus)/g;
    let cMatch;
    while ((cMatch = carrierPattern.exec(query)) !== null) {
        const carrierTrait = carrierMap[cMatch[1]];
        if (carrierTrait && !traits.includes(carrierTrait)) traits.push(carrierTrait);
    }
    // Strip carrier phrases so the normal trait detector below doesn't double-count "pearl" etc.
    workingQuery = workingQuery.replace(carrierPattern, ' ');

    // Coat colors — ordered longest-first so "Amber Cream Pearl Champagne" doesn't just match "Bay"
    // One coat per query, we're not greedy
    // Format: [what you typed, what we actually meant]
    // Recognized coat names, built straight from the coat tables so every real
    // coat (including the legendary multi-dilutions) is matched as a full name
    // instead of collapsing to a generic dilution. Longest names first.
    const _coatNames = Object.values(SPECIAL_COAT_NAMES);
    const coatColors = [...new Set(_coatNames)]
        .sort((a, b) => b.length - a.length)
        .map(n => [n.toLowerCase(), n]);
    // Then the families, longest first, so "cream pearl ether" beats "cream ether"
    // and both beat the bare generics below.
    Object.keys(COAT_FAMILIES)
        .sort((a, b) => b.length - a.length)
        .forEach(f => coatColors.push([f.toLowerCase(), f]));
    // Bare bases last among the coats: "bay cream ether" is a Cream Ether, not a Bay.
    ['Bay', 'Black', 'Chestnut'].forEach(b => coatColors.push([b.toLowerCase(), b]));
    // Aliases + generic dilution fallbacks (after the full names, so a specific
    // coat always wins over a bare "champagne" / "cream" / etc.).
    [['amber champ', 'Amber Champagne'], ['gold champ', 'Gold Champagne'], ['pearl cream', 'Cream Pearl'],
     ['tapestry pearl', 'Tapestry Pearl'], ['tapestry cream', 'Tapestry Cream'], ['cream pearl', 'Cream Pearl'],
     ['champagne', 'Champagne'], ['cream', 'Cream'], ['pearl', 'Pearl'], ['ether', 'Ether'], ['tapestry', 'Tapestry']
    ].forEach(e => coatColors.push(e));

    // Match the fanciest coat color first, then stop — greedy matching in reverse
    for (const [term, trait] of coatColors) {
        if (workingQuery.includes(term)) {
            traits.push(trait);
            break;
        }
    }

    // White markings — check the long names first or "false leopard" becomes just "leopard" and we cry
    // Multi-word traits get priority so partial matches don't ambush us
    if (workingQuery.includes('false leopard')) traits.push('False Leopard');
    if (workingQuery.includes('dominant white')) traits.push('Dominant White');
    if (workingQuery.includes('varnish roan') || workingQuery.includes('varnish')) traits.push('Varnish Roan');

    // Leopard Complex patterns — the spot spectrum, from "just a sprinkle" to "WHERE IS THE HORSE"
    if (workingQuery.includes('fewspot')) traits.push('Fewspot');
    if (workingQuery.includes('snowcap')) traits.push('Snowcap');
    if (workingQuery.includes('leopard') && !workingQuery.includes('false leopard')) traits.push('Leopard');
    if (workingQuery.includes('blanket')) traits.push('Blanket');
    if (workingQuery.includes('snowflake')) traits.push('Snowflake');

    // Other white markings — carefully dodging the "varnish roan" vs "roan" trap
    if (workingQuery.includes('tobiano')) traits.push('Tobiano');
    if (workingQuery.includes('overo')) traits.push('Overo');
    if (workingQuery.includes('splash')) traits.push('Splash');
    if (workingQuery.includes('roan') && !workingQuery.includes('varnish')) traits.push('Roan');
    if (workingQuery.includes('sabino')) traits.push('Sabino');
    if (workingQuery.includes('shroud')) traits.push('Shroud');
    if (workingQuery.includes('ossuary')) traits.push('Ossuary');
    if (workingQuery.includes('filigree')) traits.push('Filigree');
    if (workingQuery.includes('harlequin')) traits.push('Harlequin');
    if (workingQuery.includes('rabicano')) traits.push('Rabicano');

    // Modifiers — the garnish on top of your genetic masterpiece
    if (workingQuery.includes('starfield')) traits.push('Starfield');
    if (workingQuery.includes('gilt')) traits.push('Gilt');
    if (workingQuery.includes('tabard')) traits.push('Tabard');
    if (workingQuery.includes('opal')) traits.push('Opal');
    if (workingQuery.includes('prism')) traits.push('Prism');
    if (workingQuery.includes('gray') || workingQuery.includes('grey')) traits.push('Gray');
    if (workingQuery.includes('dun')) traits.push('Dun');
    if (workingQuery.includes('illuminated')) traits.push('Illuminated');
    if (workingQuery.includes('sepulchered')) traits.push('Sepulchered');
    if (workingQuery.includes('lacquer')) traits.push('Lacquer');
    if (workingQuery.includes('flaxen')) traits.push('Flaxen');
    if (workingQuery.includes('vellum')) traits.push('Vellum');
    if (workingQuery.includes('silver')) traits.push('Silver');
    if (workingQuery.includes('pangare')) traits.push('Pangare');
    if (workingQuery.includes('sooty')) traits.push('Sooty');
    if (workingQuery.includes('blanched')) traits.push('Blanched');
    if (workingQuery.includes('pitch')) traits.push('Pitch');
    if (workingQuery.includes('ingot')) traits.push('Ingot');
    if (workingQuery.includes('mithril')) traits.push('Mithril');
    if (workingQuery.includes('damascus')) traits.push('Damascus');
    if (workingQuery.includes('apron')) traits.push('Apron');
    if (workingQuery.includes('greaves')) traits.push('Greaves');
    if (workingQuery.includes('collar')) traits.push('Collar');
    if (workingQuery.includes('girdle')) traits.push('Girdle');
    if (workingQuery.includes('cuirass')) traits.push('Cuirass');
    if (workingQuery.includes('crowned')) traits.push('Crowned');

    return traits;
}

function findBreedingMatches(targetTraits) {
    const matches = [];
    
    for (let i = 0; i < horseCollection.length; i++) {
        for (let j = i + 1; j < horseCollection.length; j++) {
            const parent1 = horseCollection[i];
            const parent2 = horseCollection[j];
            
            // Check temperament compatibility — same vibes can't breed, those are the rules
            if (parent1.temperament === parent2.temperament) continue;
            
            // Check if this pair's genetics can actually conjure the desired foal
            const score = calculateMatchScore(parent1, parent2, targetTraits);
            
            if (score > 0) {
                matches.push({
                    parent1: parent1,
                    parent2: parent2,
                    score: score,
                    probability: estimateProbability(parent1, parent2, targetTraits)
                });
            }
        }
    }
    
    // Sort by score — best matchmakers first, like a leaderboard of love
    matches.sort((a, b) => b.score - a.score);
    
    return matches;
}

function canProduceCompoundDilution(p1Geno, p2Geno, dilution1, dilution2) {
    // Cr, Tp, and prl all share one locus — it's a studio apartment for three dilutions
    // A parent with Tpprl can toss either Tp OR prl to the foal (not both, that's not how loci work)
    // To get a compound foal (e.g. Crprl), you need BOTH parents to contribute different pieces
    // P1 = Crprl, P2 = nn → foal gets nCr or nprl (sorry, no compound for you)
    // P1 = Crprl, P2 = nCr → foal CAN get Crprl (P1 passes prl, P2 passes Cr, chef's kiss)

    const compound = dilution1 + dilution2;
    const reverseCompound = dilution2 + dilution1;

    // Figure out what dilution alleles each parent can actually yeet to their offspring
    // Hetero (nCr), homo (CrCr), or compound (Crprl) — each lets them pass different things
    // Compounds are sneaky: Crprl means the parent can pass Cr OR prl but never both at once

    function canPassDilution(geno, dilution) {
        const d = dilution.toLowerCase();
        // Has it as a standalone gene (hetero or homo)
        if (geno.includes('n' + d) || geno.includes(' ' + d + ' ') || geno.includes(d + d)) {
            return true;
        }
        // Or maybe it's hiding inside a compound — "Tpprl" contains both "Tp" and "prl" like a genetic Trojan horse
        if (geno.includes(d)) {
            return true;
        }
        return false;
    }

    const p1Can1 = canPassDilution(p1Geno, dilution1);
    const p1Can2 = canPassDilution(p1Geno, dilution2);
    const p2Can1 = canPassDilution(p2Geno, dilution1);
    const p2Can2 = canPassDilution(p2Geno, dilution2);

    // Check if either parent already has the compound — the easy path
    const p1HasCompound = p1Geno.includes(compound) || p1Geno.includes(reverseCompound);
    const p2HasCompound = p2Geno.includes(compound) || p2Geno.includes(reverseCompound);

    // If both parents have the compound, it's basically guaranteed — high five
    if (p1HasCompound && p2HasCompound) {
        return true;
    }

    // If one parent has the compound, the OTHER parent just needs to bring one matching piece
    // Like assembling IKEA furniture: P1 brings the shelves (Cr or prl), P2 brings a bracket (Cr or n)
    // Some assembly required, results may vary
    if (p1HasCompound) {
        return p2Can1 || p2Can2;
    }

    if (p2HasCompound) {
        return p1Can1 || p1Can2;
    }

    // Neither has the compound — each parent must bring a different piece to the potluck
    // P1 brings nCr, P2 brings nprl → together they can cook up Crprl
    return (p1Can1 && p2Can2) || (p1Can2 && p2Can1);
}

// Map fancy coat names to their base colour, built straight from the coat tables
// so the search can verify a pair can actually make the required base (e.g. Woad
// is black-based, Madder bay, Weld chestnut).
const COAT_NAME_BASE = { 'bay': 'bay', 'black': 'black', 'chestnut': 'chestnut' };
(function () {
    const baseOf = { Bay: 'bay', Black: 'black', Chestnut: 'chestnut' };
    for (const key in SPECIAL_COAT_NAMES) {
        const base = baseOf[key.split('_')[0]];
        if (base) COAT_NAME_BASE[SPECIAL_COAT_NAMES[key].toLowerCase()] = base;
    }
})();

// Every canonical coat name (lowercased). The search treats these as exact
// coats and defers to the genetics engine to decide if a pair can make them.
const CANONICAL_COATS = new Set(
    ['bay', 'black', 'chestnut'].concat(Object.values(SPECIAL_COAT_NAMES).map(n => n.toLowerCase()))
);

// Coat families: the trait-page name for a dilution combination, and the three
// base-specific coats under it. Built from the coat keys ('Bay_Cream Ether'
// names the family and its member), so a query like "cream ether" can mean any
// of Ombre, Classic or Cold Cream Ether instead of collapsing to plain Cream.
// Single-dilution families (Cream, Ether, ...) are left out on purpose: a bare
// "ether" keeps its broad meaning of any coat with Ether in it.
const COAT_FAMILIES = {};
Object.keys(SPECIAL_COAT_NAMES).forEach(key => {
    const family = key.slice(key.indexOf('_') + 1);
    if (['Cream', 'Tapestry', 'Pearl', 'Champagne', 'Ether'].includes(family)) return;
    (COAT_FAMILIES[family] = COAT_FAMILIES[family] || []).push(SPECIAL_COAT_NAMES[key]);
});
// The trait page calls CrCr erer 'Ash Ether'; the engine's key still says Double Cream Ether.
COAT_FAMILIES['Ash Ether'] = COAT_FAMILIES['Double Cream Ether'];

// Which base (if any) a coat-name query requires. Longest match wins.
function requiredBaseFromName(traitLower) {
    let best = null, bestLen = 0;
    for (const name in COAT_NAME_BASE) {
        if (name.length > bestLen && traitLower.indexOf(name) > -1) { best = COAT_NAME_BASE[name]; bestLen = name.length; }
    }
    return best;
}

// Can this pair produce a given base? bay = E_ A_, black = E_ aa, chestnut = ee.
function canMakeBase(parent1, parent2, baseType) {
    const p1 = parent1.genotype, p2 = parent2.genotype;
    const hasE = /\bEE\b|\bEe\b/.test(p1) || /\bEE\b|\bEe\b/.test(p2);
    if (baseType === 'chestnut') return /\bee\b|\bEe\b/.test(p1) && /\bee\b|\bEe\b/.test(p2);
    if (baseType === 'black') return hasE && /\baa\b|\bAa\b/.test(p1) && /\baa\b|\bAa\b/.test(p2);
    if (baseType === 'bay') return hasE && (/\bAA\b|\bAa\b/.test(p1) || /\bAA\b|\bAa\b/.test(p2));
    return true;
}

function calculateMatchScore(parent1, parent2, targetTraits) {
    const p1Geno = parent1.genotype.toLowerCase();
    const p2Geno = parent2.genotype.toLowerCase();
    const combinedGeno = (p1Geno + ' ' + p2Geno);

    // Track which traits this pair can actually produce — no false advertising
    let traitsScores = [];
    let _pairCoats = null; // lazily-computed set of coats this pair can actually make

    // Does either parent carry this allele at all, in any spelling? This reads
    // the pair through getGeneAlleles, the same way breeding does, so a
    // homozygous pair (GiGi) or a shared-locus compound (GiCo, TRn, BFl) counts
    // exactly as the carrier spelling (nGi) does. The old per-trait regexes
    // mostly checked the carrier spelling alone, so a pair that could plainly
    // produce a trait scored zero for it and never appeared in the results.
    const pairAlleles = new Set();
    [parent1, parent2].forEach(p => parseGenotype(p.genotype || '').genes.forEach(g => {
        getGeneAlleles(g).forEach(a => { if (a !== 'n') pairAlleles.add(a); });
    }));
    const pairCarries = (allele) => pairAlleles.has(allele);

    targetTraits.forEach(trait => {
        const traitLower = trait.toLowerCase();

        // Exact coat names defer to the genetics engine (the validated source of
        // truth): the pair matches only if it can really produce that coat. This
        // covers base colour AND the exact dilution profile in one shot.
        if (CANONICAL_COATS.has(traitLower)) {
            if (!_pairCoats) {
                _pairCoats = new Set(generateChimeraPossibilities('', parent1.genotype, parent2.genotype)
                    .fullCoatNames.map(c => c.toLowerCase()));
            }
            if (_pairCoats.has(traitLower)) {
                const words = traitLower.split(/\s+/).length;
                traitsScores.push(Math.min(150, 60 + 20 * words)); // rarer (longer) coats rank higher
            }
            return;
        }

        // A coat family ("cream ether", "nacre") matches when the pair can make
        // any coat in it, judged by the same engine as the exact names above.
        if (COAT_FAMILIES[trait]) {
            if (!_pairCoats) {
                _pairCoats = new Set(generateChimeraPossibilities('', parent1.genotype, parent2.genotype)
                    .fullCoatNames.map(c => c.toLowerCase()));
            }
            if (COAT_FAMILIES[trait].some(name => _pairCoats.has(name.toLowerCase()))) {
                const words = trait.split(/\s+/).length;
                traitsScores.push(Math.min(150, 60 + 20 * words));
            }
            return;
        }

        // For any remaining base-named generic, the pair must be able to make the base.
        const _baseReq = requiredBaseFromName(traitLower);
        const genBaseOK = !_baseReq || canMakeBase(parent1, parent2, _baseReq);
        if (!genBaseOK) return;

        // The great trait treasure hunt — does this pair have the genes or are we just dreaming?
        // Starting with the rarest combos first because we're ambitious like that

        // Carrier traits — only ONE parent needs the recessive allele for a carrier foal,
        // so these are way easier than expressed (homozygous) versions.
        // Must be checked BEFORE the expressed cases or the substring checks below would steal them.
        // One branch covers every carrier, whatever it is called. The allele is read
        // off the carrier's own gene token, so a compound that hides it still counts:
        // Crprl carries prl, Cher carries er, Lusp carries sp, TRn carries Rn. It also
        // means a carrier added to the trait tables is scored here without new code.
        const _carrierAllele = recipeCarrierAllele(trait);
        if (_carrierAllele) {
            if (pairCarries(_carrierAllele)) traitsScores.push(60);
        } else if (traitLower.includes('cream pearl ether') || traitLower === 'ombre cream pearl ether' ||
            traitLower === 'classic cream pearl ether' || traitLower === 'cold cream pearl ether') {
            // Need Crprl + erer — both parents must carry er, or the ether stays hidden
            const hasCreamPearl = canProduceCompoundDilution(p1Geno, p2Geno, 'cr', 'prl');
            const etherPat = /\berer\b|\bner\b|\bcher\b/;
            const p1HasEther = etherPat.test(p1Geno);
            const p2HasEther = etherPat.test(p2Geno);
            const canMakeErer = p1HasEther && p2HasEther;
            if (hasCreamPearl && canMakeErer && genBaseOK) traitsScores.push(150);
        } else if (traitLower.includes('cream pearl champagne')) {
            // Need Crprl + Ch — cream, pearl, AND champagne? This horse is going to prom
            const hasCreamPearl = canProduceCompoundDilution(p1Geno, p2Geno, 'cr', 'prl');
            const hasChampagne = /\bnch\b|\bchch\b|\bcher\b|\bch\b/.test(combinedGeno);
            if (hasCreamPearl && hasChampagne && genBaseOK) traitsScores.push(150);
        } else if (traitLower.includes('tapestry pearl ether') || traitLower === 'tyrian pearl ether' ||
                   traitLower === 'phthalo pearl ether' || traitLower === 'ochre pearl ether') {
            // Need Tpprl + erer — tapestry pearl ether, a name longer than most quest descriptions
            const hasTapestryPearl = canProduceCompoundDilution(p1Geno, p2Geno, 'tp', 'prl');
            const etherPat = /\berer\b|\bner\b|\bcher\b/;
            const p1HasEther = etherPat.test(p1Geno);
            const p2HasEther = etherPat.test(p2Geno);
            const canMakeErer = p1HasEther && p2HasEther;
            if (hasTapestryPearl && canMakeErer && genBaseOK) traitsScores.push(150);
        } else if (traitLower.includes('tapestry pearl champagne') || traitLower === 'tyrian pearl champagne' ||
                   traitLower === 'phthalo pearl champagne' || traitLower === 'ochre pearl champagne') {
            // Need Tpprl + Ch — good news: Ch is on a separate locus so it can sneak in independently
            const hasTapestryPearl = canProduceCompoundDilution(p1Geno, p2Geno, 'tp', 'prl');
            // One parent brings the tapestry-pearl combo, someone brings champagne, everyone's happy
            const p1HasCh = /\bnch\b|\bchch\b|\bcher\b|\bch\b/.test(p1Geno);
            const p2HasCh = /\bnch\b|\bchch\b|\bcher\b|\bch\b/.test(p2Geno);
            if (hasTapestryPearl && (p1HasCh || p2HasCh) && genBaseOK) traitsScores.push(150);
        } else if (traitLower.includes('tapestry cream ether') || traitLower === 'madder cream ether' ||
                   traitLower === 'woad cream ether' || traitLower === 'weld cream ether') {
            // Need TpCr + erer — both parents must carry er or no ethereal tapestry cream for you
            const hasTapestryCream = canProduceCompoundDilution(p1Geno, p2Geno, 'tp', 'cr');
            const etherPat = /\berer\b|\bner\b|\bcher\b/;
            const p1HasEther = etherPat.test(p1Geno);
            const p2HasEther = etherPat.test(p2Geno);
            const canMakeErer = p1HasEther && p2HasEther;
            if (hasTapestryCream && canMakeErer && genBaseOK) traitsScores.push(150);
        } else if (traitLower.includes('tapestry cream champagne') || traitLower === 'madder cream champagne' ||
                   traitLower === 'woad cream champagne' || traitLower === 'weld cream champagne') {
            // Need TpCr + Ch — tapestry cream champagne, this horse is basically a dessert wine
            const hasTapestryCream = canProduceCompoundDilution(p1Geno, p2Geno, 'tp', 'cr');
            const hasChampagne = /\bnch\b|\bchch\b|\bcher\b|\bch\b/.test(combinedGeno);
            if (hasTapestryCream && hasChampagne && genBaseOK) traitsScores.push(150);
        } else if (traitLower.includes('pearl ether') && !traitLower.includes('cream') && !traitLower.includes('tapestry')) {
            // Need prlprl + erer — double recessive combo, both parents must carry the goods
            const p1HasPearl = p1Geno.includes('prl');
            const p2HasPearl = p2Geno.includes('prl');
            const etherPat = /\berer\b|\bner\b|\bcher\b/;
            const p1HasEther = etherPat.test(p1Geno);
            const p2HasEther = etherPat.test(p2Geno);
            if (p1HasPearl && p2HasPearl && p1HasEther && p2HasEther) traitsScores.push(120);
        } else if (traitLower.includes('cream pearl') && !traitLower.includes('ether') && !traitLower.includes('champagne')) {
            // Need Crprl — cream and pearl forced to share, classic locus drama
            if (canProduceCompoundDilution(p1Geno, p2Geno, 'cr', 'prl')) traitsScores.push(100);
        } else if ((traitLower.includes('tapestry pearl') ||
                    traitLower === 'tyrian pearl' ||
                    traitLower === 'phthalo pearl' ||
                    traitLower === 'ochre pearl') &&
                   !traitLower.includes('ether') && !traitLower.includes('champagne')) {
            // Need Tpprl — tapestry and pearl, another odd-couple compound
            // Tyrian/Phthalo/Ochre Pearl are just Tapestry Pearl with specific bases (Bay/Black/Chestnut)
            if (canProduceCompoundDilution(p1Geno, p2Geno, 'tp', 'prl')) {
                let baseOK = true;
                if (traitLower === 'tyrian pearl') {
                    const hasE = /\bEE\b|\bEe\b/.test(parent1.genotype) || /\bEE\b|\bEe\b/.test(parent2.genotype);
                    const hasA = /\bAA\b|\bAa\b/.test(parent1.genotype) || /\bAA\b|\bAa\b/.test(parent2.genotype);
                    baseOK = hasE && hasA;
                } else if (traitLower === 'phthalo pearl') {
                    const hasE = /\bEE\b|\bEe\b/.test(parent1.genotype) || /\bEE\b|\bEe\b/.test(parent2.genotype);
                    const p1HasSmallA = /\baa\b|\bAa\b/.test(parent1.genotype);
                    const p2HasSmallA = /\baa\b|\bAa\b/.test(parent2.genotype);
                    baseOK = hasE && p1HasSmallA && p2HasSmallA;
                } else if (traitLower === 'ochre pearl') {
                    const p1Hase = /\bee\b|\bEe\b/.test(parent1.genotype);
                    const p2Hase = /\bee\b|\bEe\b/.test(parent2.genotype);
                    baseOK = p1Hase && p2Hase;
                }
                if (baseOK) traitsScores.push(100);
            }
        } else if (traitLower === 'bay pearl' || traitLower === 'black pearl' || traitLower === 'gold pearl') {
            // Single Pearl + specific base — both parents must pass prl, plus the right E/A combo
            const prlPat = /\bnprl\b|\bprlprl\b|\btpprl\b|\bcrprl\b/;
            const p1HasPrl = prlPat.test(p1Geno);
            const p2HasPrl = prlPat.test(p2Geno);
            let baseOK = false;
            if (traitLower === 'bay pearl') {
                const hasE = /\bEE\b|\bEe\b/.test(parent1.genotype) || /\bEE\b|\bEe\b/.test(parent2.genotype);
                const hasA = /\bAA\b|\bAa\b/.test(parent1.genotype) || /\bAA\b|\bAa\b/.test(parent2.genotype);
                baseOK = hasE && hasA;
            } else if (traitLower === 'black pearl') {
                const hasE = /\bEE\b|\bEe\b/.test(parent1.genotype) || /\bEE\b|\bEe\b/.test(parent2.genotype);
                const p1HasSmallA = /\baa\b|\bAa\b/.test(parent1.genotype);
                const p2HasSmallA = /\baa\b|\bAa\b/.test(parent2.genotype);
                baseOK = hasE && p1HasSmallA && p2HasSmallA;
            } else { // gold pearl = chestnut + pearl
                const p1Hase = /\bee\b|\bEe\b/.test(parent1.genotype);
                const p2Hase = /\bee\b|\bEe\b/.test(parent2.genotype);
                baseOK = p1Hase && p2Hase;
            }
            if (p1HasPrl && p2HasPrl && baseOK) traitsScores.push(100);
        } else if (traitLower === 'madder ether' || traitLower === 'woad ether' || traitLower === 'weld ether') {
            // Tapestry + erer + base coat — the previous logic forgot the ether part entirely
            const hasTp = /\bntp\b|\btptp\b|\btpcr\b|\btpprl\b/.test(combinedGeno);
            const etherPat = /\berer\b|\bner\b|\bcher\b/;
            const canMakeErer = etherPat.test(p1Geno) && etherPat.test(p2Geno);
            let baseOK = false;
            if (traitLower === 'madder ether') {
                const hasE = /\bEE\b|\bEe\b/.test(parent1.genotype) || /\bEE\b|\bEe\b/.test(parent2.genotype);
                const hasA = /\bAA\b|\bAa\b/.test(parent1.genotype) || /\bAA\b|\bAa\b/.test(parent2.genotype);
                baseOK = hasE && hasA;
            } else if (traitLower === 'woad ether') {
                const hasE = /\bEE\b|\bEe\b/.test(parent1.genotype) || /\bEE\b|\bEe\b/.test(parent2.genotype);
                const p1HasSmallA = /\baa\b|\bAa\b/.test(parent1.genotype);
                const p2HasSmallA = /\baa\b|\bAa\b/.test(parent2.genotype);
                baseOK = hasE && p1HasSmallA && p2HasSmallA;
            } else { // weld ether = chestnut tapestry + ether
                const p1Hase = /\bee\b|\bEe\b/.test(parent1.genotype);
                const p2Hase = /\bee\b|\bEe\b/.test(parent2.genotype);
                baseOK = p1Hase && p2Hase;
            }
            if (hasTp && canMakeErer && baseOK) traitsScores.push(120);
        } else if (traitLower === 'ombre ether' || traitLower === 'bay ether' ||
                   traitLower === 'classic ether' || traitLower === 'black ether' ||
                   traitLower === 'cold ether' || traitLower === 'gold ether' ||
                   traitLower === 'chestnut ether') {
            // Single Ether + specific base — both parents must carry er, plus the right E/A combo
            const etherPat = /\berer\b|\bner\b|\bcher\b/;
            const canMakeErer = etherPat.test(p1Geno) && etherPat.test(p2Geno);
            let baseOK = false;
            if (traitLower === 'ombre ether' || traitLower === 'bay ether') {
                const hasE = /\bEE\b|\bEe\b/.test(parent1.genotype) || /\bEE\b|\bEe\b/.test(parent2.genotype);
                const hasA = /\bAA\b|\bAa\b/.test(parent1.genotype) || /\bAA\b|\bAa\b/.test(parent2.genotype);
                baseOK = hasE && hasA;
            } else if (traitLower === 'classic ether' || traitLower === 'black ether') {
                const hasE = /\bEE\b|\bEe\b/.test(parent1.genotype) || /\bEE\b|\bEe\b/.test(parent2.genotype);
                const p1HasSmallA = /\baa\b|\bAa\b/.test(parent1.genotype);
                const p2HasSmallA = /\baa\b|\bAa\b/.test(parent2.genotype);
                baseOK = hasE && p1HasSmallA && p2HasSmallA;
            } else { // cold/gold/chestnut ether = chestnut + ether
                const p1Hase = /\bee\b|\bEe\b/.test(parent1.genotype);
                const p2Hase = /\bee\b|\bEe\b/.test(parent2.genotype);
                baseOK = p1Hase && p2Hase;
            }
            if (canMakeErer && baseOK) traitsScores.push(80);
        } else if (traitLower.includes('woad')) {
            if (combinedGeno.includes('tp') && (combinedGeno.includes('e') && combinedGeno.includes('aa'))) traitsScores.push(100);
        } else if (traitLower.includes('madder')) {
            if (combinedGeno.includes('tp') && (combinedGeno.includes('e') && combinedGeno.includes('a'))) traitsScores.push(100);
        } else if (traitLower.includes('weld')) {
            if (combinedGeno.includes('tp') && combinedGeno.includes('ee')) traitsScores.push(100);
        } else if (traitLower.includes('buckskin')) {
            if (combinedGeno.includes('cr') && (combinedGeno.includes('e') && combinedGeno.includes('a'))) traitsScores.push(100);
        } else if (traitLower.includes('smoky black')) {
            if (combinedGeno.includes('cr') && (combinedGeno.includes('e') && combinedGeno.includes('aa'))) traitsScores.push(100);
        } else if (traitLower.includes('palomino')) {
            if (combinedGeno.includes('cr') && combinedGeno.includes('ee')) traitsScores.push(100);
        } else if (traitLower.includes('perlino')) {
            if (combinedGeno.includes('crcr') && (combinedGeno.includes('e') && combinedGeno.includes('a'))) traitsScores.push(100);
        } else if (traitLower.includes('smoky cream')) {
            if (combinedGeno.includes('crcr') && (combinedGeno.includes('e') && combinedGeno.includes('aa'))) traitsScores.push(100);
        } else if (traitLower.includes('cremello')) {
            if (combinedGeno.includes('crcr') && combinedGeno.includes('ee')) traitsScores.push(100);
        } else if (traitLower.includes('amber champagne')) {
            if (/\bnch\b|\bchch\b|\bcher\b|\bch\b/.test(combinedGeno) && (combinedGeno.includes('e') && combinedGeno.includes('a'))) traitsScores.push(100);
        } else if (traitLower.includes('fewspot')) {
            // Need LpLp patnpatn — BOTH parents must bring Lp AND patn or no fewspot for you
            const p1HasLp = p1Geno.includes('lp');
            const p2HasLp = p2Geno.includes('lp');
            const p1HasPatn = p1Geno.includes('patn');
            const p2HasPatn = p2Geno.includes('patn');
            if (p1HasLp && p2HasLp && p1HasPatn && p2HasPatn) traitsScores.push(100);
        } else if (traitLower.includes('snowcap')) {
            // Need LpLp npatn — two Lp carriers and at least one patn, like assembling an adventuring party
            const p1HasLp = p1Geno.includes('lp');
            const p2HasLp = p2Geno.includes('lp');
            const p1HasPatn = p1Geno.includes('patn');
            const p2HasPatn = p2Geno.includes('patn');
            if (p1HasLp && p2HasLp && (p1HasPatn || p2HasPatn)) traitsScores.push(100);
        } else if (traitLower.includes('varnish roan')) {
            // Need LpLp, no patn — both parents have Lp but no pattern gene, yielding the slow fade
            const p1HasLp = p1Geno.includes('lp');
            const p2HasLp = p2Geno.includes('lp');
            if (p1HasLp && p2HasLp && !combinedGeno.includes('patn')) traitsScores.push(100);
        } else if (traitLower.includes('leopard') && traitLower !== 'false leopard') {
            // False Leopard is a KIT-family marking on its own locus (Fl), not the
            // Leopard complex, and has its own branch further down.
            // Need nLp patnpatn — at least one Lp carrier, both parents packing patn
            const hasLp = combinedGeno.includes('lp');
            const p1HasPatn = p1Geno.includes('patn');
            const p2HasPatn = p2Geno.includes('patn');
            if (hasLp && p1HasPatn && p2HasPatn) traitsScores.push(100);
        } else if (traitLower.includes('blanket')) {
            // Need nLp npatn — at least one Lp and one patn somewhere in the family
            const hasLp = combinedGeno.includes('lp');
            const hasPatn = combinedGeno.includes('patn');
            if (hasLp && hasPatn) traitsScores.push(100);
        } else if (traitLower.includes('snowflake')) {
            // Need nLp, no patn — just Lp doing its thing solo, sprinkling snowflakes
            const hasLp = combinedGeno.includes('lp');
            if (hasLp && !combinedGeno.includes('patn')) traitsScores.push(100);
        } else if (traitLower.includes('starfield')) {
            // Need sfsf — both parents must carry sf, stars don't align themselves
            const sfPattern = /\bsfsf\b|\bnsf\b/;
            const p1HasSf = sfPattern.test(p1Geno);
            const p2HasSf = sfPattern.test(p2Geno);
            if (p1HasSf && p2HasSf) traitsScores.push(100);
        } else if (traitLower.includes('sepulchered')) {
            // Need spsp — both parents carry sp; careful not to confuse nSpl (Splash) with nsp
            const spPattern = /\bspsp\b|\bnsp\b|\blusp\b/;
            const p1HasSp = spPattern.test(p1Geno);
            const p2HasSp = spPattern.test(p2Geno);
            if (p1HasSp && p2HasSp) traitsScores.push(100);
        } else if (traitLower.includes('lacquer')) {
            // Need lrlr — both parents carry lr, the lacquer doesn't apply itself
            const lrPattern = /\blrlr\b|\bnlr\b/;
            const p1HasLr = lrPattern.test(p1Geno);
            const p2HasLr = lrPattern.test(p2Geno);
            if (p1HasLr && p2HasLr) traitsScores.push(100);
        } else if (traitLower.includes('flaxen')) {
            // Need ff — both parents carry f; regex must dodge nfe (Filigree) and nfl (False Leopard)
            const fPattern = /\bff\b|\bnf\b/;
            const p1HasF = fPattern.test(p1Geno);
            const p2HasF = fPattern.test(p2Geno);
            if (p1HasF && p2HasF) traitsScores.push(100);
        } else if (traitLower.includes('ether')) {
            // Need erer — recessive ether requires both parents to carry the ghost gene
            const etherPattern = /\berer\b|\bner\b|\bcher\b/;
            const p1HasEther = etherPattern.test(p1Geno);
            const p2HasEther = etherPattern.test(p2Geno);
            if (p1HasEther && p2HasEther) traitsScores.push(80);
            else if (p1HasEther || p2HasEther) traitsScores.push(40);
        } else if (traitLower.includes('champagne')) {
            // Champagne is dominant — just one parent needs to bring the bubbly
            const hasCh = /\bnch\b|\bchch\b|\bcher\b|\bch\b/.test(combinedGeno);
            if (hasCh) traitsScores.push(80);
        } else if (traitLower === 'tapestry') {
            // Dominant — one parent with Tp and you've got yourself a tapestry
            const tpPattern = /\bntp\b|\btptp\b|\btpcr\b|\btpprl\b/;
            if (tpPattern.test(combinedGeno)) traitsScores.push(80);
        } else if (traitLower === 'cream') {
            // Dominant — at least one Cr in the mix and cream happens
            const crPattern = /\bncr\b|\bcrcr\b|\btpcr\b|\bcrprl\b/;
            if (crPattern.test(combinedGeno)) traitsScores.push(80);
        } else if (traitLower === 'pearl') {
            // Recessive — pearl hides until BOTH parents admit they've been carrying it
            const prlPattern = /\bnprl\b|\bprlprl\b|\btpprl\b|\bcrprl\b/;
            const p1HasPrl = prlPattern.test(p1Geno);
            const p2HasPrl = prlPattern.test(p2Geno);
            if (p1HasPrl && p2HasPrl) traitsScores.push(80);
            else if (p1HasPrl || p2HasPrl) traitsScores.push(40);
        } else if (traitLower === 'tapestry cream') {
            // Need TpCr compound — two dilutions, one locus, zero chill
            if (canProduceCompoundDilution(p1Geno, p2Geno, 'tp', 'cr')) traitsScores.push(100);
        } else if (traitLower === 'chestnut') {
            // Need ee — both parents must secretly carry a lowercase e, the ginger gene of horses
            const p1HasE = /\bee\b/.test(p1Geno) || /^ee\b/i.test(p1Geno.trim()) || /\bEe\b/.test(parent1.genotype);
            const p2HasE = /\bee\b/.test(p2Geno) || /^ee\b/i.test(p2Geno.trim()) || /\bEe\b/.test(parent2.genotype);
            if (p1HasE && p2HasE) traitsScores.push(80);
        } else if (traitLower === 'bay') {
            // Need E_ A_ — the classic bay combo, at least one E and one A between them
            const hasE = /\bEe\b|\bEE\b/i.test(parent1.genotype) || /\bEe\b|\bEE\b/i.test(parent2.genotype);
            const hasA = /\bAa\b|\bAA\b|\bAa\b/i.test(parent1.genotype) || /\bAa\b|\bAA\b/i.test(parent2.genotype);
            if (hasE && hasA) traitsScores.push(80);
        } else if (traitLower === 'black') {
            // Need E_ aa — black requires E for extension but aa to banish agouti to the shadow realm
            const hasE = /\bEe\b|\bEE\b/i.test(parent1.genotype) || /\bEe\b|\bEE\b/i.test(parent2.genotype);
            const p1HasSmallA = /\baa\b|\bAa\b/.test(parent1.genotype);
            const p2HasSmallA = /\baa\b|\bAa\b/.test(parent2.genotype);
            if (hasE && p1HasSmallA && p2HasSmallA) traitsScores.push(80);
        } else if (traitLower.includes('filigree')) {
            // Need fefe — filigree is recessive and demands both parents carry fe
            const fePattern = /\bfefe\b|\bnfe\b/;
            const p1HasFe = fePattern.test(p1Geno);
            const p2HasFe = fePattern.test(p2Geno);
            if (p1HasFe && p2HasFe) traitsScores.push(100);
        } else if (traitLower.includes('ossuary')) {
            if (/\bnos\b/.test(combinedGeno)) traitsScores.push(100);
        } else if (traitLower.includes('shroud')) {
            if (pairCarries('Sh')) traitsScores.push(80);
        } else if (traitLower === 'roan') {
            if (pairCarries('Rn')) traitsScores.push(80);
        } else if (traitLower === 'gray' || traitLower === 'grey') {
            if (pairCarries('G')) traitsScores.push(80);
        } else if (traitLower === 'pitch') {
            if (pairCarries('Pt')) traitsScores.push(80);
        } else if (traitLower === 'ingot') {
            if (pairCarries('In')) traitsScores.push(80);
        } else if (traitLower === 'mithril') {
            if (pairCarries('mt')) traitsScores.push(80);
        } else if (traitLower === 'damascus') {
            // Damascus only shows beside Dun, so the pair needs both alleles.
            if (pairCarries('Dm') && pairCarries('D')) traitsScores.push(80);
        } else if (traitLower === 'tobiano') {
            if (pairCarries('T')) traitsScores.push(80);
        } else if (traitLower === 'overo') {
            if (pairCarries('O')) traitsScores.push(80);
        } else if (traitLower === 'sabino') {
            if (pairCarries('Sb')) traitsScores.push(80);
        } else if (traitLower === 'splash') {
            if (pairCarries('Spl')) traitsScores.push(80);
        } else if (traitLower === 'dun') {
            if (pairCarries('D')) traitsScores.push(80);
        } else if (traitLower === 'silver') {
            if (pairCarries('Z')) traitsScores.push(80);
        } else if (traitLower === 'vellum') {
            if (pairCarries('V')) traitsScores.push(80);
        } else if (traitLower === 'illuminated') {
            if (pairCarries('Lu')) traitsScores.push(80);
        } else if (traitLower === 'tabard') {
            if (pairCarries('Td')) traitsScores.push(80);
        } else if (traitLower === 'gilt') {
            if (pairCarries('Gl')) traitsScores.push(80);
        } else if (traitLower === 'prism') {
            // Dominant — Pr shows with one copy; PrOp shares the locus with Opal
            if (pairCarries('Pr')) traitsScores.push(80);
        } else if (traitLower === 'opal') {
            // Dominant — Op shows with one copy; PrOp shares the locus with Prism
            if (pairCarries('Op')) traitsScores.push(80);
        } else if (traitLower === 'harlequin') {
            // Dominant — Hq shows with one copy (nHq or HqHq)
            if (pairCarries('Hq')) traitsScores.push(80);
        } else if (traitLower === 'blanched') {
            if (pairCarries('B')) traitsScores.push(80);
        } else if (traitLower === 'dominant white') {
            if (pairCarries('W')) traitsScores.push(80);
        } else if (traitLower === 'rabicano') {
            if (pairCarries('Rb')) traitsScores.push(80);
        } else if (traitLower === 'false leopard') {
            if (pairCarries('Fl')) traitsScores.push(80);
        } else if (traitLower === 'collar') {
            if (pairCarries('Co')) traitsScores.push(80);
        } else if (traitLower === 'girdle') {
            if (pairCarries('Gi')) traitsScores.push(80);
        } else if (traitLower === 'apron') {
            if (pairCarries('Ap')) traitsScores.push(80);
        } else if (traitLower === 'greaves') {
            if (pairCarries('Gr')) traitsScores.push(80);
        } else if (traitLower === 'cuirass') {
            if (pairCarries('Cu')) traitsScores.push(80);
        } else if (traitLower === 'crowned') {
            if (pairCarries('Cw')) traitsScores.push(80);
        } else if (traitLower === 'pangare') {
            if (pairCarries('P')) traitsScores.push(80);
        } else if (traitLower === 'sooty') {
            if (pairCarries('Sty')) traitsScores.push(80);
        }
    });

    // Only count it if ALL desired traits can coexist in one foal — no Frankenstein genetics
    if (traitsScores.length === targetTraits.length) {
        return traitsScores.reduce((sum, s) => sum + s, 0);
    }
    return 0; // Can't make all those traits in one foal — even dungeon magic has limits
}

function estimateProbability(parent1, parent2, targetTraits) {
    // Probability estimation — this is vibes-based math, not a peer-reviewed paper
    const p1Geno = parent1.genotype.toLowerCase();
    const p2Geno = parent2.genotype.toLowerCase();
    
    let hasAllGenes = true;
    targetTraits.forEach(trait => {
        const traitKey = trait.toLowerCase().substring(0, 3);
        if (!p1Geno.includes(traitKey) && !p2Geno.includes(traitKey)) {
            hasAllGenes = false;
        }
    });
    
    if (!hasAllGenes) return 'Low (~5-10%)';
    
    const genesInBoth = targetTraits.filter(trait => {
        const key = trait.toLowerCase().substring(0, 3);
        return p1Geno.includes(key) && p2Geno.includes(key);
    }).length;
    
    if (genesInBoth === targetTraits.length) return 'High (~40-60%)';
    if (genesInBoth > 0) return 'Medium (~20-35%)';
    return 'Low (~10-20%)';
}

function fillParents(parent1, parent2) {
    // Yeet the user over to the Foal Generator tab with pre-filled parents
    switchTab('foals');

    document.getElementById('parent1Name').value = parent1.name || '';
    document.getElementById('parent1Geno').value = parent1.genotype;
    document.getElementById('parent1Temp').value = parent1.temperament;
    document.getElementById('parent1Variant').value = parent1.variant || 'Standard';

    document.getElementById('parent2Name').value = parent2.name || '';
    document.getElementById('parent2Geno').value = parent2.genotype;
    document.getElementById('parent2Temp').value = parent2.temperament;
    document.getElementById('parent2Variant').value = parent2.variant || 'Standard';

    // Scroll down so the user actually sees what we just filled in
    const pc = document.querySelector('#area-calculator .parents-container');
    if (pc) pc.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Chimera Functionality — for when your horse is literally two horses in a trenchcoat

// Check if a parent can pass a boring normal (n) allele at a given locus
function canPassNAtLocus(genes, locusPattern) {
    const gene = genes.find(g => locusPattern.test(g));
    if (!gene) return true; // no gene at this locus = nn, guaranteed normie allele
    return getGeneAlleles(gene).includes('n');
}

function generateChimeraPossibilities(foalGenotype, parent1Genotype, parent2Genotype) {
    const foal = parseGenotype(foalGenotype);
    const p1 = parseGenotype(parent1Genotype);
    const p2 = parseGenotype(parent2Genotype);

    const allParentAnomalies = [...p1.anomalies, ...p2.anomalies];

    // Interrogate each parent about what Extension and Agouti alleles they're hiding
    const p1EAlleles = new Set();
    const p2EAlleles = new Set();
    const p1AAlleles = new Set();
    const p2AAlleles = new Set();

    p1.genes.forEach(gene => {
        if (gene.match(/^[Ee][Ee]?$/)) getGeneAlleles(gene).forEach(a => p1EAlleles.add(a));
        if (gene.match(/^[Aa][Aa]?$/)) getGeneAlleles(gene).forEach(a => p1AAlleles.add(a));
    });
    p2.genes.forEach(gene => {
        if (gene.match(/^[Ee][Ee]?$/)) getGeneAlleles(gene).forEach(a => p2EAlleles.add(a));
        if (gene.match(/^[Aa][Aa]?$/)) getGeneAlleles(gene).forEach(a => p2AAlleles.add(a));
    });

    // Default to wildtype if no gene found — assume basic until proven fancy
    if (p1EAlleles.size === 0) p1EAlleles.add('E');
    if (p2EAlleles.size === 0) p2EAlleles.add('E');
    if (p1AAlleles.size === 0) p1AAlleles.add('A');
    if (p2AAlleles.size === 0) p2AAlleles.add('A');

    // Generate all possible base coats — Mendelian combinatorics go brrrrr
    const baseCoats = new Set();
    p1EAlleles.forEach(e1 => {
        p2EAlleles.forEach(e2 => {
            p1AAlleles.forEach(a1 => {
                p2AAlleles.forEach(a2 => {
                    const eGene = combineAlleles(e1, e2);
                    const aGene = combineAlleles(a1, a2);
                    const baseCoatKey = `${eGene}_${aGene}`;
                    const baseCoatName = COAT_COLORS[baseCoatKey];
                    if (baseCoatName) {
                        baseCoats.add(baseCoatName);
                    }
                });
            });
        });
    });

    // Dilutions — tracking what each parent can ACTUALLY pass, no more wishful thinking
    // Real Mendelian outcomes only, we're scientists now (at 3am, but still)
    const dilutionNames = new Set();

    const p1Locus1 = new Set();
    const p2Locus1 = new Set();
    const p1Locus2 = new Set();
    const p2Locus2 = new Set();

    const locus1Pattern = /^(nCr|CrCr|nTp|TpTp|nprl|prlprl|Crprl|Tpprl|TpCr)$/;
    const locus2Pattern = /^(nCh|ChCh|ner|erer|Cher)$/;

    p1.genes.forEach(gene => {
        if (locus1Pattern.test(gene)) getGeneAlleles(gene).forEach(a => p1Locus1.add(a));
        if (locus2Pattern.test(gene)) getGeneAlleles(gene).forEach(a => p1Locus2.add(a));
    });
    p2.genes.forEach(gene => {
        if (locus1Pattern.test(gene)) getGeneAlleles(gene).forEach(a => p2Locus1.add(a));
        if (locus2Pattern.test(gene)) getGeneAlleles(gene).forEach(a => p2Locus2.add(a));
    });

    // No gene on a locus = wildtype (n) — the genetic equivalent of "I didn't bring anything"
    if (p1Locus1.size === 0) p1Locus1.add('n');
    if (p2Locus1.size === 0) p2Locus1.add('n');
    if (p1Locus2.size === 0) p1Locus2.add('n');
    if (p2Locus2.size === 0) p2Locus2.add('n');

    // Generate actual possible genotypes — one allele from each parent, as Mendel intended
    const locus1Phenotypes = new Set();
    const locus2Phenotypes = new Set();
    const locus2Genos = new Set();   // Nacre needs to know Cher from nCh/ChCh
    let locus1CanBeEmpty = false;
    let locus2CanBeEmpty = false;

    p1Locus1.forEach(a1 => {
        p2Locus1.forEach(a2 => {
            const geno = combineAlleles(a1, a2);
            if (DILUTION_NAMES[geno]) locus1Phenotypes.add(DILUTION_NAMES[geno]);
            else locus1CanBeEmpty = true; // nn = invisible dilution, it's just vibes
        });
    });
    p1Locus2.forEach(a1 => {
        p2Locus2.forEach(a2 => {
            const geno = combineAlleles(a1, a2);
            locus2Genos.add(geno);
            if (DILUTION_NAMES[geno]) locus2Phenotypes.add(DILUTION_NAMES[geno]);
            else locus2CanBeEmpty = true; // nn or ner — dilution machine broke at this locus
        });
    });

    // Combine across both loci — mix and match like a dungeon buffet, 'none' is also a valid choice
    const l1Array = Array.from(locus1Phenotypes);
    const l2Array = Array.from(locus2Phenotypes);
    if (locus1CanBeEmpty || l1Array.length === 0) l1Array.push('none');
    if (locus2CanBeEmpty || l2Array.length === 0) l2Array.push('none');

    // Also include the "no dilution at all" option — undiluted base coats deserve love too
    const dilutionCombos = []; // every possible dilution outcome, including "nothing at all"
    l1Array.forEach(l1 => {
        l2Array.forEach(l2 => {
            if (l1 === 'none' && l2 === 'none') {
                dilutionCombos.push('none');
                return;
            }
            // Nacre: prlprl with a Cher pair is its own coat, while prlprl with
            // plain Champagne stays Pearl Champagne. One pairing can put both on
            // the table, so each is added on its own evidence.
            if (l1 === 'Pearl' && l2 === 'Champagne') {
                if (locus2Genos.has('nCh') || locus2Genos.has('ChCh')) { dilutionNames.add('Pearl Champagne'); dilutionCombos.push('Pearl Champagne'); }
                if (locus2Genos.has('Cher')) { dilutionNames.add('Nacre'); dilutionCombos.push('Nacre'); }
                return;
            }
            let combo;
            if (l1 === 'none') combo = l2;
            else if (l2 === 'none') combo = l1;
            else combo = l1 + ' ' + l2;
            dilutionNames.add(combo);
            dilutionCombos.push(combo);
        });
    });

    // Build full coat names — every base × every dilution, the combinatorial explosion of fabulousness
    const fullCoatNames = new Set();
    baseCoats.forEach(base => {
        dilutionCombos.forEach(dil => {
            if (dil === 'none') {
                fullCoatNames.add(base);
            } else {
                const key = base + '_' + dil;
                const special = SPECIAL_COAT_NAMES[key];
                fullCoatNames.add(special || (dil + ' ' + base));
            }
        });
    });

    // ── Modifiers & White Markings — now with REAL Mendelian math, not just hopes and prayers ──
    // Track which alleles each parent can pass at every locus like a suspicious customs agent
    const modifiers = new Set();
    const whiteMarkings = new Set();

    // Helper: shake down a parent for all alleles they could pass at a given locus
    function getParentLocusAlleles(parentGenes, locusPattern) {
        const gene = parentGenes.find(g => locusPattern.test(g));
        if (!gene) return ['n'];  // nothing here, move along — passes wildtype
        return getGeneAlleles(gene);
    }

    // Helper: smash parents' alleles together at a locus and see what sticks
    function possibleGenotypes(p1Genes, p2Genes, locusPattern) {
        const p1A = getParentLocusAlleles(p1Genes, locusPattern);
        const p2A = getParentLocusAlleles(p2Genes, locusPattern);
        const results = new Set();
        p1A.forEach(a1 => {
            p2A.forEach(a2 => {
                results.add(combineAlleles(a1, a2));
            });
        });
        return results;
    }

    // ── Individual modifier loci — each a simple binary: "got the mutation" or "boring" ──
    const simpleModifierLoci = [
        { pattern: /^(nP|PP)$/, allele: 'P', name: 'Pangare' },
        { pattern: /^(nSty|StySty)$/, allele: 'Sty', name: 'Sooty' },
        { pattern: /^(nZ|ZZ)$/, allele: 'Z', name: 'Silver' },
        { pattern: /^(nTd|TdTd)$/, allele: 'Td', name: 'Tabard' },
        { pattern: /^(nGl|GlGl)$/, allele: 'Gl', name: 'Gilt' },
        { pattern: /^(nIn|InIn)$/, allele: 'In', name: 'Ingot' },
        { pattern: /^(nV|VV)$/, allele: 'V', name: 'Vellum' },
    ];

    simpleModifierLoci.forEach(locus => {
        const genotypes = possibleGenotypes(p1.genes, p2.genes, locus.pattern);
        genotypes.forEach(g => {
            // Dominant: even one mutant allele means this trait shows up to the party
            if (g !== 'nn') modifiers.add(locus.name);
        });
    });

    // ── Recessive modifier loci — must have TWO copies to show, one copy = secret agent ──
    const recessiveModifierLoci = [
        { pattern: /^(nf|ff)$/, allele: 'f', expressed: 'Flaxen', carrier: 'Carrying Flaxen' },
        { pattern: /^(nsf|sfsf)$/, allele: 'sf', expressed: 'Starfield', carrier: 'Carrying Starfield' },
        { pattern: /^(nmt|mtmt)$/, allele: 'mt', expressed: 'Mithril', carrier: 'Carrying Mithril' },
        { pattern: /^(nlr|lrlr)$/, allele: 'lr', expressed: 'Lacquer', carrier: 'Carrying Lacquer' },
    ];

    recessiveModifierLoci.forEach(locus => {
        const genotypes = possibleGenotypes(p1.genes, p2.genes, locus.pattern);
        genotypes.forEach(g => {
            if (g === locus.allele + locus.allele) modifiers.add(locus.expressed);
            else if (g === 'n' + locus.allele) modifiers.add(locus.carrier);
        });
    });

    // ── Lu/sp shared locus — Illuminated (dominant) vs Sepulchered (recessive), eternal rivals ──
    const luSpPattern = /^(nLu|LuLu|nsp|spsp|Lusp)$/;
    const luSpGenotypes = possibleGenotypes(p1.genes, p2.genes, luSpPattern);
    luSpGenotypes.forEach(g => {
        if (g === 'nn') return;
        const alleles = getGeneAlleles(g);
        if (alleles.includes('Lu')) modifiers.add('Illuminated');
        if (g === 'spsp') modifiers.add('Sepulchered');
        else if (alleles.includes('sp') && !alleles.includes('Lu')) modifiers.add('Carrying Sepulchered');
        // Lusp: Lu dominates (Illuminated shows), sp skulks in the shadows (carried)
        if (g === 'Lusp') modifiers.add('Carrying Sepulchered');
    });

    // D/Dm shared locus: Dun shows on its own, Damascus only beside it, so a
    // horse holding Dm without a D carries it unseen.
    const dDmPattern = /^(nD|DD|nDm|DmDm|DmD|DDm)$/;
    possibleGenotypes(p1.genes, p2.genes, dDmPattern).forEach(g => {
        if (g === 'nn') return;
        const alleles = getGeneAlleles(g);
        if (alleles.includes('D')) modifiers.add('Dun');
        if (alleles.includes('Dm')) modifiers.add(alleles.includes('D') ? 'Damascus' : 'Carries Damascus');
    });

    // G/Pt shared locus: Gray whitens, Pitch blackens, both dominant, and a horse
    // carrying both goes a true mid gray.
    const gPtPattern = /^(nG|GG|nPt|PtPt|GPt|PtG)$/;
    const gPtGenotypes = possibleGenotypes(p1.genes, p2.genes, gPtPattern);
    gPtGenotypes.forEach(g => {
        if (g === 'nn') return;
        const alleles = getGeneAlleles(g);
        if (alleles.includes('G')) modifiers.add('Gray');
        if (alleles.includes('Pt')) modifiers.add('Pitch');
    });

    // ── Pr/Op shared locus — both dominant, both sparkly, best friends forever ──
    const prOpPattern = /^(nPr|PrPr|nOp|OpOp|PrOp)$/;
    const prOpGenotypes = possibleGenotypes(p1.genes, p2.genes, prOpPattern);
    prOpGenotypes.forEach(g => {
        if (g === 'nn') return;
        const alleles = getGeneAlleles(g);
        if (alleles.includes('Pr')) modifiers.add('Prism');
        if (alleles.includes('Op')) modifiers.add('Opal');
    });

    // ── Filigree (fe locus) — recessive and delicate, like a lace doily that plays hard to get ──
    const fePattern = /^(nfe|fefe)$/;
    const feGenotypes = possibleGenotypes(p1.genes, p2.genes, fePattern);
    feGenotypes.forEach(g => {
        if (g === 'fefe') whiteMarkings.add('Filigree');
        else if (g === 'nfe') whiteMarkings.add('Carrying Filigree');
    });

    // ── KIT locus — T, Rn, Sb, W all crammed in here like knights in a phone booth ──
    const kitPattern = /^(nT|TT|nRn|RnRn|nSb|SbSb|nW|WW|TRn|RnT|TSb|SbT|TW|WT|RnSb|SbRn|RnW|WRn|SbW|WSb)$/;
    const kitAlleleNames = { 'T': 'Tobiano', 'Rn': 'Roan', 'Sb': 'Sabino', 'W': 'Dominant White' };
    const kitGenotypes = possibleGenotypes(p1.genes, p2.genes, kitPattern);
    kitGenotypes.forEach(g => {
        if (g === 'nn') return;
        const alleles = getGeneAlleles(g);
        alleles.forEach(a => { if (kitAlleleNames[a]) whiteMarkings.add(kitAlleleNames[a]); });
    });

    // ── B/Fl shared locus — Blanched and False Leopard, the buddy system ──
    const bFlPattern = /^(nB|BB|nFl|FlFl|BFl|FlB)$/;
    const bFlAlleleNames = { 'B': 'Blanched', 'Fl': 'False Leopard' };
    const bFlGenotypes = possibleGenotypes(p1.genes, p2.genes, bFlPattern);
    bFlGenotypes.forEach(g => {
        if (g === 'nn') return;
        const alleles = getGeneAlleles(g);
        alleles.forEach(a => { if (bFlAlleleNames[a]) whiteMarkings.add(bFlAlleleNames[a]); });
    });

    // ── Cu/Cw shared locus — Cuirass and Crowned, the armor set ──
    const cuCwPattern = /^(nCu|CuCu|nCw|CwCw|CuCw)$/;
    const cuCwAlleleNames = { 'Cu': 'Cuirass', 'Cw': 'Crowned' };
    const cuCwGenotypes = possibleGenotypes(p1.genes, p2.genes, cuCwPattern);
    cuCwGenotypes.forEach(g => {
        if (g === 'nn') return;
        const alleles = getGeneAlleles(g);
        alleles.forEach(a => { if (cuCwAlleleNames[a]) whiteMarkings.add(cuCwAlleleNames[a]); });
    });

    // ── Gi/Co shared locus — Girdle and Collar, the accessories department ──
    const giCoPattern = /^(nGi|GiGi|nCo|CoCo|GiCo|CoGi)$/;
    const giCoAlleleNames = { 'Gi': 'Girdle', 'Co': 'Collar' };
    const giCoGenotypes = possibleGenotypes(p1.genes, p2.genes, giCoPattern);
    giCoGenotypes.forEach(g => {
        if (g === 'nn') return;
        const alleles = getGeneAlleles(g);
        alleles.forEach(a => { if (giCoAlleleNames[a]) whiteMarkings.add(giCoAlleleNames[a]); });
    });

    // Gr/Ap shared locus: Greaves and Apron
    const grApPattern = /^(nGr|GrGr|nAp|ApAp|GrAp|ApGr)$/;
    const grApAlleleNames = { 'Gr': 'Greaves', 'Ap': 'Apron' };
    const grApGenotypes = possibleGenotypes(p1.genes, p2.genes, grApPattern);
    grApGenotypes.forEach(g => {
        if (g === 'nn') return;
        const alleles = getGeneAlleles(g);
        alleles.forEach(a => { if (grApAlleleNames[a]) whiteMarkings.add(grApAlleleNames[a]); });
    });

    // Compute valid combinations for shared loci from actual possible genotypes
    const locusCombos = {};
    [
        { key: 'kit', genotypes: kitGenotypes },
        { key: 'bFl', genotypes: bFlGenotypes },
        { key: 'cuCw', genotypes: cuCwGenotypes },
        { key: 'giCo', genotypes: giCoGenotypes },
        { key: 'grAp', genotypes: grApGenotypes },
    ].forEach(({ key, genotypes }) => {
        const comboSet = new Set();
        genotypes.forEach(g => {
            if (g !== 'nn' && WHITE_MARKING_NAMES[g]) comboSet.add(WHITE_MARKING_NAMES[g]);
        });
        if (comboSet.size > 0) locusCombos[key] = Array.from(comboSet).sort();
    });

    // ── Solo white marking loci — these genes each have their own room, no roommates ──
    const simpleMarkingLoci = [
        { pattern: /^(nO|OO)$/, name: 'Overo' },
        { pattern: /^(nSpl|SplSpl)$/, name: 'Splash' },
        { pattern: /^(nRb|RbRb)$/, name: 'Rabicano' },
        { pattern: /^(nHq|HqHq)$/, name: 'Harlequin' },
        { pattern: /^(nSh|ShSh)$/, name: 'Shroud' },
        { pattern: /^(nOs|OsOs)$/, name: 'Ossuary' },
    ];

    simpleMarkingLoci.forEach(locus => {
        const genotypes = possibleGenotypes(p1.genes, p2.genes, locus.pattern);
        genotypes.forEach(g => {
            if (g !== 'nn') whiteMarkings.add(locus.name);
        });
    });

    // ── Leopard Complex — where Lp and patn combine to determine your horse's spot density ──
    const lpPattern = /^(nLp|LpLp)$/;
    const patnPattern = /^(npatn|patnpatn)$/;
    const lpGenotypes = possibleGenotypes(p1.genes, p2.genes, lpPattern);
    const patnGenotypes = possibleGenotypes(p1.genes, p2.genes, patnPattern);

    const canMakeHetLp = lpGenotypes.has('nLp') || lpGenotypes.has('LpLp');
    const canMakeHomLp = lpGenotypes.has('LpLp');
    const canMakeHetPatn = patnGenotypes.has('npatn') || patnGenotypes.has('patnpatn');
    const canMakeHomPatn = patnGenotypes.has('patnpatn');

    if (canMakeHetLp) {
        whiteMarkings.add('Snowflake');              // nLp, no patn
        if (canMakeHetPatn) whiteMarkings.add('Blanket');   // nLp + npatn
        if (canMakeHomPatn) whiteMarkings.add('Leopard');   // nLp + patnpatn
    }
    if (canMakeHomLp) {
        whiteMarkings.add('Varnish Roan');           // LpLp, no patn
        if (canMakeHetPatn) whiteMarkings.add('Snowcap');   // LpLp + npatn
        if (canMakeHomPatn) whiteMarkings.add('Fewspot');   // LpLp + patnpatn
    }

    // Collect anomalies from parents AND foal (excluding Chimera itself, that's the whole point)
    // Even spontaneous anomalies count — the chimera patch is basically a blank canvas of chaos
    const anomalies = new Set([...allParentAnomalies, ...foal.anomalies].filter(a => a !== 'Chimera'));

    // ── Mandatory vs Optional — figuring out which traits MUST appear vs which are just suggestions ──
    // Dominant: mandatory when a parent literally cannot pass wildtype (you're getting this trait, deal with it)
    // Recessive: mandatory only if NEITHER parent can pass n (both locked in)

    const locusPatterns = {
        kit: /^(nT|TT|nRn|RnRn|nSb|SbSb|nW|WW|TRn|RnT|TSb|SbT|TW|WT|RnSb|SbRn|RnW|WRn|SbW|WSb)$/,
        bFl: /^(nB|BB|nFl|FlFl|BFl|FlB)$/,
        cuCw: /^(nCu|CuCu|nCw|CwCw|CuCw)$/,
        giCo: /^(nGi|GiGi|nCo|CoCo|GiCo|CoGi)$/,
        grAp: /^(nGr|GrGr|nAp|ApAp|GrAp|ApGr)$/,
        lp: /^(nLp|LpLp)$/,
        O: /^(nO|OO)$/,
        Spl: /^(nSpl|SplSpl)$/,
        Rb: /^(nRb|RbRb)$/,
        Hq: /^(nHq|HqHq)$/,
        Sh: /^(nSh|ShSh)$/,
        Os: /^(nOs|OsOs)$/,
        fe: /^(nfe|fefe)$/,
    };

    // Marking locus groups — defining who's mandatory and who's just visiting
    const markingLocusDefs = [
        { key: 'kit', name: 'KIT', traits: ['Tobiano', 'Roan', 'Sabino', 'Dominant White'], dominant: true },
        { key: 'bFl', name: 'B/Fl', traits: ['Blanched', 'False Leopard', 'Blanched False Leopard'], dominant: true },
        { key: 'cuCw', name: 'Cu/Cw', traits: ['Cuirass', 'Crowned'], dominant: true },
        { key: 'giCo', name: 'Gi/Co', traits: ['Girdle', 'Collar'], dominant: true },
        { key: 'grAp', name: 'Gr/Ap', traits: ['Greaves', 'Apron'], dominant: true },
        { key: 'lp', name: 'Leopard Complex', traits: ['Snowflake', 'Blanket', 'Leopard', 'Varnish Roan', 'Snowcap', 'Fewspot', 'Carries Patn'], dominant: true },
        { key: 'O', name: 'Overo', traits: ['Overo'], dominant: true },
        { key: 'Spl', name: 'Splash', traits: ['Splash'], dominant: true },
        { key: 'Rb', name: 'Rabicano', traits: ['Rabicano'], dominant: true },
        { key: 'Hq', name: 'Harlequin', traits: ['Harlequin'], dominant: true },
        { key: 'Sh', name: 'Shroud', traits: ['Shroud'], dominant: true },
        { key: 'Os', name: 'Ossuary', traits: ['Ossuary'], dominant: true },
        { key: 'fe', name: 'Filigree', traits: ['Filigree', 'Carrying Filigree'], dominant: false },
    ];

    const markingLoci = [];
    markingLocusDefs.forEach(def => {
        const presentTraits = def.traits.filter(t => whiteMarkings.has(t));
        if (presentTraits.length === 0) return;
        const p1CanPassN = canPassNAtLocus(p1.genes, locusPatterns[def.key]);
        const p2CanPassN = canPassNAtLocus(p2.genes, locusPatterns[def.key]);
        const mandatory = def.dominant
            ? (!p1CanPassN || !p2CanPassN)   // dominant: if either parent MUST pass a mutant, it's showing up
            : (!p1CanPassN && !p2CanPassN);  // recessive: both parents stuck — this trait is inevitable
        markingLoci.push({ name: def.name, traits: presentTraits, mandatory, combos: locusCombos[def.key] || null });
    });

    // Dilution mandatory info — reusing our earlier work because we're efficient like that
    const dilutionMandatory = !locus1CanBeEmpty || !locus2CanBeEmpty;
    const dilutionLociNotes = [];
    if (!locus1CanBeEmpty) dilutionLociNotes.push('Cream/Tapestry/Pearl locus');
    if (!locus2CanBeEmpty) dilutionLociNotes.push('Champagne/Ether locus');

    return {
        baseCoats: Array.from(baseCoats).sort(),
        dilutions: Array.from(dilutionNames).sort(),
        fullCoatNames: Array.from(fullCoatNames).sort(),
        whiteMarkings: Array.from(whiteMarkings).sort(),
        modifiers: Array.from(modifiers).sort(),
        anomalies: Array.from(anomalies).sort(),
        locusInfo: {
            dilutionMandatory,
            dilutionLociNotes,
            locus1Phenotypes: Array.from(locus1Phenotypes).sort(),
            locus2Phenotypes: Array.from(locus2Phenotypes).sort(),
            locus1CanBeEmpty,
            locus2CanBeEmpty,
            markingLoci,
            anyMarkingMandatory: markingLoci.some(l => l.mandatory),
        }
    };
}

function fillChimeraCalculator(foalGeno, parent1Geno, parent2Geno) {
    // Teleport to the Chimera Calculator tab — adventure awaits
    switchTab('chimera');

    // Coming from a bred foal: this is the lineaged (from-parents) case.
    const fm = document.querySelector('input[name="chimeraMode"][value="foal"]');
    if (fm) { fm.checked = true; fm.dispatchEvent(new Event('change')); }

    document.getElementById('chimeraFoalGeno').value = foalGeno;
    document.getElementById('chimeraParent1Geno').value = parent1Geno;
    document.getElementById('chimeraParent2Geno').value = parent2Geno;

    // Fire away — no time for hesitation, calculate immediately
    calculateChimera();
}

function calculateChimera() {
    const mode = (document.querySelector('input[name="chimeraMode"]:checked') || {}).value || 'foal';
    const foalGeno = document.getElementById('chimeraFoalGeno').value.trim();

    // Creation (no parents): the patch is the horse's own genotype with genes
    // removed and/or the base colour (e/a) changed. No new traits.
    if (mode === 'creation') {
        if (!foalGeno) {
            if (window.AppShell) window.AppShell.toast("Enter the Creation's genotype.", 'error');
            else alert('Please enter the Creation genotype!');
            return;
        }
        displayCreationChimera(foalGeno, generateCreationChimeraPossibilities(foalGeno));
        trackUse('chimera_calculated');
        return;
    }

    const parent1Geno = document.getElementById('chimeraParent1Geno').value.trim();
    const parent2Geno = document.getElementById('chimeraParent2Geno').value.trim();

    if (!foalGeno || !parent1Geno || !parent2Geno) {
        if (window.AppShell) window.AppShell.toast('Enter genotypes for the foal and both parents.', 'error');
        else alert('Please enter genotypes for the foal and both parents!');
        return;
    }

    const possibilities = generateChimeraPossibilities(foalGeno, parent1Geno, parent2Geno);

    displayChimeraPossibilities(foalGeno, possibilities);
    trackUse('chimera_calculated');
}

// A Creation's Chimera patch: any base colour (e/a changes freely), plus any
// subset of the horse's OWN visible traits. Nothing new can appear.
//
// This deliberately does NOT go through generateChimeraPossibilities. That
// engine breeds two parents, so handing it the Creation as both "parents"
// crossed the horse with itself and invented homozygous outcomes it doesn't
// have: nCr came back as Double Cream, Tpprl as Pearl, Cher as Ether, a Blanket
// as Fewspot, and carriers like nfe as full Filigree — every one of them a trait
// the Creation doesn't show, which is exactly what the panel promises can't
// happen. A Creation's patch is a subset of what the horse already is, and
// that's what resolveTraits gives us directly.
function generateCreationChimeraPossibilities(creationGeno) {
    const t = resolveTraits(creationGeno);
    const { genes, anomalies } = parseGenotype(creationGeno);

    // Visible traits only — a carrier isn't painted on the horse, so the patch
    // can't show it either.
    const visible = t.lethal ? [] : t.allTraits.filter(x => !/^Carr(ies|ying) /.test(x));
    const whiteMarkings = visible.filter(x => MARKING_DESC[x] || LEOPARD_DESC[x]);
    const modifiers = visible.filter(x => MODIFIER_DESC[x]);

    // At each dilution locus the patch either keeps this horse's own dilution or
    // drops it. Same locus split resolveTraits uses, so a locus that only
    // carries something recessive (nprl, ner) correctly offers nothing.
    const locus1Gene = genes.find(g => /Cr|Tp|prl/.test(g) && !/(Ch|er)/.test(g));
    const locus2Gene = genes.find(g => /Ch|er/.test(g) && !/(Cr|Tp|prl)/.test(g));
    const l1 = !t.lethal && DILUTION_NAMES[locus1Gene] ? [DILUTION_NAMES[locus1Gene], 'none'] : ['none'];
    const l2 = !t.lethal && DILUTION_NAMES[locus2Gene] ? [DILUTION_NAMES[locus2Gene], 'none'] : ['none'];

    const allBases = ['Bay', 'Black', 'Chestnut'];
    const dilCombos = [];
    l1.forEach(a => l2.forEach(b => {
        if (a === 'none' && b === 'none') { dilCombos.push('none'); return; }
        dilCombos.push(a === 'none' ? b : (b === 'none' ? a : a + ' ' + b));
    }));
    const fullCoatNames = new Set();
    allBases.forEach(bs => dilCombos.forEach(dil => {
        if (dil === 'none') fullCoatNames.add(bs);
        else fullCoatNames.add(SPECIAL_COAT_NAMES[bs + '_' + dil] || (dil + ' ' + bs));
    }));

    return {
        isCreation: true,
        baseCoats: allBases,
        fullCoatNames: Array.from(fullCoatNames).sort(),
        dilutions: t.lethal ? [] : t.dilutions.slice(),
        whiteMarkings,
        modifiers,
        // Chimera itself isn't a patch trait, and Somatic never interacts with
        // Chimera at all, so neither belongs in the list.
        anomalies: anomalies.filter(a => a !== 'Chimera' && !FREE_MARKINGS.includes(a))
    };
}

function displayCreationChimera(creationGeno, poss) {
    const resultsContainer = document.getElementById('chimeraResultsContainer');
    const resultsContent = document.getElementById('chimeraResultsContent');
    resultsContent.innerHTML = '';

    const pheno = genotypeToPhenotype(creationGeno);
    const card = (title, color, items, note) => {
        if (!items || !items.length) return '';
        return `<div style="background:#fff;padding:18px;border:1px solid #dcd8de;border-left:4px solid ${color};border-radius:5px;">
            <h5 style="color:${color};margin-bottom:10px;font-size:1em;font-weight:600;">${title} (${items.length})</h5>
            ${note ? `<div style="color:#8a8f98;font-size:0.8em;margin-bottom:10px;font-style:italic;">${note}</div>` : ''}
            <ul style="list-style:none;padding:0;margin:0;">${items.map(i => `<li style="padding:7px;margin-bottom:5px;background:#f7f5f3;border-left:3px solid ${color};color:#2d2833;">${i}</li>`).join('')}</ul>
        </div>`;
    };

    resultsContent.innerHTML = `
        <div style="background:#fff;border:2px solid #5d4b60;border-radius:5px;padding:18px;margin-bottom:18px;">
            <h4 style="color:#5d4b60;margin-bottom:8px;">Main Coat (Non-Chimera Areas)</h4>
            <div style="margin-bottom:8px;"><strong style="color:#6f6877;">Phenotype:</strong> <span style="color:#5d4b60;">${pheno}</span></div>
            <div><strong style="color:#6f6877;">Genotype:</strong> <span style="font-family:'Courier New',monospace;background:#f7f5f3;padding:6px;border:1px solid #dcd8de;">${creationGeno}</span></div>
        </div>
        <div style="background:#fff;border-left:4px solid #8a4fc0;padding:14px;margin-bottom:18px;color:#6f6877;">
            <strong style="color:#8a4fc0;">Creation Chimera.</strong> The patch can be <strong>any base colour</strong> (the e/a base changes freely), with or without any of this horse's own traits. It <strong>cannot</strong> show anything the Creation doesn't already have.
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px;">
            ${card('Possible patch coats', '#5d4b60', poss.fullCoatNames, "Any base colour, with or without this horse's dilutions.")}
            ${card('White markings (optional)', '#8a4fc0', poss.whiteMarkings, 'Keep any, or drop them.')}
            ${card('Modifiers (optional)', '#687f3f', poss.modifiers, 'Keep any, or drop them.')}
            ${card('Anomalies (optional)', '#c8902e', poss.anomalies, 'Only ones this horse already has.')}
        </div>
    `;

    resultsContainer.style.display = 'block';
    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function displayChimeraPossibilities(foalGenotype, possibilities) {
    const resultsContainer = document.getElementById('chimeraResultsContainer');
    const resultsContent = document.getElementById('chimeraResultsContent');

    resultsContent.innerHTML = '';

    // Display the foal's "main character" coat — the non-chimera areas
    const foalPhenotype = genotypeToPhenotype(foalGenotype);

    const mainCoatDiv = document.createElement('div');
    mainCoatDiv.style.cssText = 'background: #ffffff; border: 2px solid #5d4b60; padding: 20px; margin-bottom: 20px;';
    mainCoatDiv.innerHTML = `
        <h4 style="color: #5d4b60; margin-bottom: 10px; font-size: 1.1em;">Main Coat (Non-Chimera Areas)</h4>
        <div style="margin-bottom: 10px;">
            <strong style="color: #6f6877;">Phenotype:</strong>
            <span style="color: #5d4b60; display: block; margin-top: 5px;">${foalPhenotype}</span>
        </div>
        <div>
            <strong style="color: #6f6877;">Genotype:</strong>
            <span style="color: #5d4b60; font-family: 'Courier New', monospace; display: block; margin-top: 5px; background: #f7f5f3; padding: 8px; border: 1px solid #dcd8de;">${foalGenotype}</span>
        </div>
    `;
    resultsContent.appendChild(mainCoatDiv);

    // Dramatic header for the chimera possibilities section
    const chimeraHeader = document.createElement('h4');
    chimeraHeader.style.cssText = 'color: #5d4b60; margin-bottom: 15px; font-size: 1.1em;';
    chimeraHeader.textContent = 'Chimera Patch Possibilities';
    resultsContent.appendChild(chimeraHeader);

    const infoBox = document.createElement('div');
    infoBox.style.cssText = 'background: #ffffff; border-left: 4px solid #8a4fc0; padding: 15px; margin-bottom: 20px; color: #6f6877; font-style: italic;';
    infoBox.textContent = 'The Chimera patch can display any combination of the traits listed below from both parents.';
    resultsContent.appendChild(infoBox);

    // Badge helpers — little labels that scream MANDATORY or whisper optional
    const mandatoryBadgeHtml = '<span style="background: #a02b2b; color: #e0b4b4; font-size: 0.75em; padding: 2px 6px; margin-left: 8px; font-weight: 600; letter-spacing: 0.03em;">MANDATORY</span>';
    const optionalBadgeHtml = '<span style="background: #ececee; color: #8a8f98; font-size: 0.75em; padding: 2px 6px; margin-left: 8px; font-weight: 600; letter-spacing: 0.03em;">OPTIONAL</span>';

    const locusInfo = possibilities.locusInfo;

    // Create a grid — organizing chaos into neat little boxes
    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;';

    // Coats — the full menu of possible chimera patch colors, all properly named
    if (possibilities.fullCoatNames.length > 0) {
        const coatCard = document.createElement('div');
        coatCard.style.cssText = 'background: #ffffff; padding: 20px; border: 2px solid #dcd8de; border-left: 4px solid #5d4b60;';
        const pickNote = possibilities.fullCoatNames.length > 1
            ? '<div style="color: #8a8f98; font-size: 0.8em; margin-bottom: 10px; font-style: italic;">The chimera patch will display exactly 1 of these coats.</div>'
            : '';
        coatCard.innerHTML = `
            <h5 style="color: #5d4b60; margin-bottom: 15px; font-size: 1em; font-weight: 600;">Coats (${possibilities.fullCoatNames.length})${mandatoryBadgeHtml}</h5>
            ${pickNote}
            <ul style="list-style: none; padding: 0; margin: 0;">
                ${possibilities.fullCoatNames.map(coat => `
                    <li style="padding: 8px; margin-bottom: 6px; background: #f7f5f3; border-left: 3px solid #5d4b60; color: #5d4b60;">
                        ${coat}
                    </li>
                `).join('')}
            </ul>
        `;
        grid.appendChild(coatCard);
    }

    // White Markings — grouped by locus because genetics is all about who lives where
    if (possibilities.whiteMarkings.length > 0) {
        const markingsCard = document.createElement('div');
        markingsCard.style.cssText = 'background: #ffffff; padding: 20px; border: 2px solid #dcd8de; border-left: 4px solid #8a4fc0;';

        let markingsHtml = `<h5 style="color: #8a4fc0; margin-bottom: 15px; font-size: 1em; font-weight: 600;">Markings (${possibilities.whiteMarkings.length})</h5>`;

        if (locusInfo.markingLoci.length > 0) {
            markingsHtml += locusInfo.markingLoci.map(locus => {
                const badge = locus.mandatory ? mandatoryBadgeHtml : optionalBadgeHtml;
                const borderColor = locus.mandatory ? '#a02b2b' : '#8a4fc0';
                let pickNote = '';
                let locusWarning = '';
                if (locus.combos) {
                    // Shared locus: show valid combinations computed from parent genotypes
                    pickNote = '<span style="color: #8a8f98; font-size: 0.8em; font-style: italic; margin-left: 6px;">(choose one combination)</span>';
                    if (locus.name === 'KIT' && locus.combos.some(c => c.includes('Dominant White'))) {
                        locusWarning = '<div style="color: #b23a3a; font-size: 0.8em; margin-top: 4px; margin-bottom: 4px;">WW (double Dominant White) is lethal.</div>';
                    }
                } else if (locus.traits.length > 1) {
                    if (locus.name === 'Leopard Complex') {
                        pickNote = '<span style="color: #8a8f98; font-size: 0.8em; font-style: italic; margin-left: 6px;">(pick 1)</span>';
                    } else if (locus.traits.length > 2) {
                        pickNote = '<span style="color: #8a8f98; font-size: 0.8em; font-style: italic; margin-left: 6px;">(pick up to 2)</span>';
                    } else {
                        pickNote = '<span style="color: #8a8f98; font-size: 0.8em; font-style: italic; margin-left: 6px;">(pick 1 or 2)</span>';
                    }
                }

                // Lethal white warnings
                const hasOveroLocus = locusInfo.markingLoci.some(l => l.name === 'Overo');
                const hasOssuaryLocus = locusInfo.markingLoci.some(l => l.name === 'Ossuary');
                if (locus.name === 'Overo') {
                    locusWarning += '<div style="color: #b23a3a; font-size: 0.8em; margin-top: 4px; margin-bottom: 4px;">OO (homozygous Overo) is lethal.</div>';
                    if (hasOssuaryLocus) {
                        locusWarning += '<div style="color: #b23a3a; font-size: 0.8em; margin-bottom: 4px;">Overo + Ossuary (nO nOs) is also lethal.</div>';
                    }
                }
                if (locus.name === 'Ossuary') {
                    locusWarning += '<div style="color: #b23a3a; font-size: 0.8em; margin-top: 4px; margin-bottom: 4px;">OsOs (homozygous Ossuary) is lethal.</div>';
                    if (hasOveroLocus) {
                        locusWarning += '<div style="color: #b23a3a; font-size: 0.8em; margin-bottom: 4px;">Overo + Ossuary (nO nOs) is also lethal.</div>';
                    }
                }
                const displayItems = locus.combos || locus.traits;
                return `
                    <div style="margin-bottom: 12px;">
                        <div style="color: #7d6a86; font-size: 0.85em; font-weight: 600; margin-bottom: 6px;">${locus.name}${badge}${pickNote}</div>
                        ${locusWarning}
                        <ul style="list-style: none; padding: 0; margin: 0;">
                            ${displayItems.map(item => `
                                <li style="padding: 8px; margin-bottom: 4px; background: #f7f5f3; border-left: 3px solid ${borderColor}; color: #5d4b60;">
                                    ${item}
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                `;
            }).join('');
        }

        markingsCard.innerHTML = markingsHtml;
        grid.appendChild(markingsCard);
    }

    // Modifiers — the seasoning on the chimera's alternate-reality coat
    if (possibilities.modifiers.length > 0) {
        const modifiersCard = document.createElement('div');
        modifiersCard.style.cssText = 'background: #ffffff; padding: 20px; border: 2px solid #dcd8de; border-left: 4px solid #5f8a3f;';
        modifiersCard.innerHTML = `
            <h5 style="color: #5f8a3f; margin-bottom: 15px; font-size: 1em; font-weight: 600;">Modifiers (${possibilities.modifiers.length})${optionalBadgeHtml}</h5>
            <ul style="list-style: none; padding: 0; margin: 0;">
                ${possibilities.modifiers.map(modifier => `
                    <li style="padding: 8px; margin-bottom: 6px; background: #f7f5f3; border-left: 3px solid #5f8a3f; color: #5d4b60;">
                        ${modifier}
                    </li>
                `).join('')}
            </ul>
        `;
        grid.appendChild(modifiersCard);
    }

    // Anomalies — the weird bonus features the chimera patch might inherit
    if (possibilities.anomalies.length > 0) {
        const anomaliesCard = document.createElement('div');
        anomaliesCard.style.cssText = 'background: #ffffff; padding: 20px; border: 2px solid #dcd8de; border-left: 4px solid #c8902e;';
        anomaliesCard.innerHTML = `
            <h5 style="color: #c8902e; margin-bottom: 15px; font-size: 1em; font-weight: 600;">Anomalies (${possibilities.anomalies.length})${optionalBadgeHtml}</h5>
            <ul style="list-style: none; padding: 0; margin: 0;">
                ${possibilities.anomalies.map(anomaly => `
                    <li style="padding: 8px; margin-bottom: 6px; background: #f7f5f3; border-left: 3px solid #c8902e; color: #5d4b60;">
                        ${anomaly}
                    </li>
                `).join('')}
            </ul>
        `;
        grid.appendChild(anomaliesCard);
    }

    resultsContent.appendChild(grid);

    // "Roll for me" button — for when you can't decide and want the dice gods to choose
    const rollSection = document.createElement('div');
    rollSection.style.cssText = 'margin-top: 25px; text-align: center;';
    rollSection.innerHTML = `
        <button class="generate-btn" style="max-width: 400px; margin: 0 auto 20px;" onclick="rollChimeraPatch()">Roll a Chimera Patch for Me</button>
        <div id="chimeraRollResult" style="display: none;"></div>
    `;
    resultsContent.appendChild(rollSection);

    // Stash possibilities on the window like hiding loot under a floorboard
    window._chimeraPossibilities = possibilities;

    resultsContainer.style.display = 'block';
    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function rollChimeraPatch() {
    const p = window._chimeraPossibilities;
    if (!p) return;

    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    const traits = [];

    // Coat: pick exactly 1 — the chimera patch can only BE one coat at a time, even if it wants more
    if (p.fullCoatNames.length > 0) {
        traits.push(pick(p.fullCoatNames));
    }

    // Markings: respect the sacred locus rules or face the wrath of genetics
    const singlePickLoci = ['Leopard Complex'];
    const locusInfo = p.locusInfo;

    // Track our picks for the lethal-white safety check — we're not monsters
    let pickedOvero = false;
    let pickedOssuary = false;

    if (locusInfo.markingLoci.length > 0) {
        locusInfo.markingLoci.forEach(locus => {
            if (locus.combos) {
                // Shared locus: pick one valid combination
                if (locus.mandatory || Math.random() < 0.5) {
                    traits.push(pick(locus.combos));
                }
            } else {
                const maxPicks = singlePickLoci.includes(locus.name) ? 1 : Math.min(2, locus.traits.length);

                if (locus.mandatory) {
                    // Mandatory: must pick at least 1, no wiggling out of this one
                    const count = 1 + (maxPicks > 1 && Math.random() < 0.3 ? 1 : 0);
                    const shuffled = [...locus.traits].sort(() => Math.random() - 0.5);
                    for (let i = 0; i < Math.min(count, shuffled.length); i++) {
                        traits.push(shuffled[i]);
                        if (shuffled[i] === 'Overo') pickedOvero = true;
                        if (shuffled[i] === 'Ossuary') pickedOssuary = true;
                    }
                } else {
                    // Optional: 50% coin flip — the chimera patch might skip this entirely
                    if (Math.random() < 0.5) {
                        const count = 1 + (maxPicks > 1 && Math.random() < 0.3 ? 1 : 0);
                        const shuffled = [...locus.traits].sort(() => Math.random() - 0.5);
                        for (let i = 0; i < Math.min(count, shuffled.length); i++) {
                            traits.push(shuffled[i]);
                            if (shuffled[i] === 'Overo') pickedOvero = true;
                            if (shuffled[i] === 'Ossuary') pickedOssuary = true;
                        }
                    }
                }
            }
        });
    }

    // Lethal white re-roll — Overo + Ossuary together is a death sentence, so we veto that combo
    if (pickedOvero && pickedOssuary) {
        // Drop one at random — sorry little guy, you're the sacrificial trait
        const dropOvero = Math.random() < 0.5;
        const idx = traits.indexOf(dropOvero ? 'Overo' : 'Ossuary');
        if (idx !== -1) traits.splice(idx, 1);
    }

    // Modifiers: each rolls a 40% chance independently — the modifier lottery
    if (p.modifiers.length > 0) {
        p.modifiers.forEach(mod => {
            if (Math.random() < 0.4) {
                traits.push(mod);
            }
        });
    }

    // Anomalies: 30% each — a little less likely than modifiers, gotta keep 'em special
    if (p.anomalies.length > 0) {
        p.anomalies.forEach(anomaly => {
            if (Math.random() < 0.3) {
                traits.push(anomaly);
            }
        });
    }

    // Drumroll please... reveal the chimera patch!
    const resultDiv = document.getElementById('chimeraRollResult');
    const coat = traits.shift(); // first item is always the coat
    const extras = traits.length > 0 ? traits.join(', ') : 'No additional traits';

    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `
        <div style="background: #ffffff; border: 2px solid #8a4fc0; padding: 20px; text-align: left; box-shadow: 0 0 20px rgba(138, 79, 192, 0.3);">
            <h4 style="color: #8a4fc0; margin-bottom: 15px; font-size: 1.1em; text-align: center; font-family: 'Pirata One', serif; font-weight: 400;">Rolled Chimera Patch</h4>
            <div style="margin-bottom: 10px;">
                <strong style="color: #6f6877; font-size: 0.9em;">Coat:</strong>
                <span style="color: #5d4b60; display: block; margin-top: 5px; background: #f7f5f3; padding: 10px; border: 1px solid #dcd8de; font-size: 1.1em;">${coat}</span>
            </div>
            <div>
                <strong style="color: #6f6877; font-size: 0.9em;">Traits:</strong>
                <span style="color: #5d4b60; display: block; margin-top: 5px; background: #f7f5f3; padding: 10px; border: 1px solid #dcd8de;">${extras}</span>
            </div>
        </div>
    `;
    resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ============================================================================
// SOMATIC CALCULATOR
// ----------------------------------------------------------------------------
// Somatic is a free marking, not an anomaly — any horse can take it, and it
// costs nothing. It hides ONE of the horse's own traits inside an irregular
// patch, so unlike Chimera it never needs the parents: everything the patch can
// show is already sitting in this horse's genotype.
//
// The engine works at gene-token level. Switching a trait off rewrites (or
// drops) the token carrying it, then the patch is named by running the
// rewritten gene list back through resolveTraits(). Naming the patch with the
// same function that names the horse means the two can never disagree.
//
// That rewritten gene list is a scratch value for naming the patch and NOTHING
// else. Somatic does not remove a gene: the horse keeps it, still passes it to
// foals, and still writes it in its genotype — the gene just isn't expressed
// inside the patch. So the rewritten list must never be shown as a genotype.
//
// Rules this encodes, from the Trait Index entry for Somatic:
//   - exactly one trait at a time, and never a trait AND a base-colour change
//   - the WHOLE trait goes, not one allele (Fewspot can't be knocked down to
//     Leopard), with Double Cream -> Cream the single documented exception
//   - anomalies aren't attached to genes, so Somatic can never touch them
//   - Somatic only takes away; it can't add a trait or create white markings
// ============================================================================

// What one gene token becomes when Somatic switches one of its traits off.
// `becomes: null` means the token goes entirely. Tokens carrying two traits at
// a shared locus (TRn = Tobiano + Roan) get one entry per trait, each leaving
// the other behind — that's still switching off a whole trait, not splitting
// one trait's alleles.
const SOMATIC_SWITCH_OFF = {
    // --- Dilutions, locus 1 (Cr / Tp / prl) ---
    'Cr':     [{ trait: 'Cream', becomes: null }],
    'nCr':    [{ trait: 'Cream', becomes: null }],
    // The one documented exception to "the whole trait goes": Double Cream and
    // Cream are separate base coats in the index, so one Cr switches off and
    // the patch keeps the other.
    'CrCr':   [{ trait: 'Double Cream', becomes: 'nCr' }],
    'Tp':     [{ trait: 'Tapestry', becomes: null }],
    'nTp':    [{ trait: 'Tapestry', becomes: null }],
    'TpTp':   [{ trait: 'Tapestry', becomes: null }],
    'prlprl': [{ trait: 'Pearl', becomes: null }],
    'Crprl':  [{ trait: 'Cream', becomes: 'nprl' }, { trait: 'Pearl', becomes: 'nCr' }],
    'TpCr':   [{ trait: 'Tapestry', becomes: 'nCr' }, { trait: 'Cream', becomes: 'nTp' }],
    'Tpprl':  [{ trait: 'Tapestry', becomes: 'nprl' }, { trait: 'Pearl', becomes: 'nTp' }],

    // --- Dilutions, locus 2 (Ch / er) ---
    'Ch':     [{ trait: 'Champagne', becomes: null }],
    'nCh':    [{ trait: 'Champagne', becomes: null }],
    'ChCh':   [{ trait: 'Champagne', becomes: null }],
    'erer':   [{ trait: 'Ether', becomes: null }],
    // Cher shows Champagne and carries Ether. Switch the Champagne off and the
    // carrier stays behind, still showing nothing.
    'Cher':   [{ trait: 'Champagne', becomes: 'ner' }],

    // --- Modifiers ---
    'nD':     [{ trait: 'Dun', becomes: null }],
    'DD':     [{ trait: 'Dun', becomes: null }],
    'nP':     [{ trait: 'Pangare', becomes: null }],
    'PP':     [{ trait: 'Pangare', becomes: null }],
    'nSty':   [{ trait: 'Sooty', becomes: null }],
    'StySty': [{ trait: 'Sooty', becomes: null }],
    'nG':     [{ trait: 'Gray', becomes: null }],
    'GG':     [{ trait: 'Gray', becomes: null }],
    'nIn':    [{ trait: 'Ingot', becomes: null }],
    'InIn':   [{ trait: 'Ingot', becomes: null }],
    'mtmt':   [{ trait: 'Mithril', becomes: null }],
    'DmD':    [{ trait: 'Damascus', becomes: 'nD' }, { trait: 'Dun', becomes: 'nDm' }],
    'DDm':    [{ trait: 'Damascus', becomes: 'nD' }, { trait: 'Dun', becomes: 'nDm' }],
    'nPt':    [{ trait: 'Pitch', becomes: null }],
    'PtPt':   [{ trait: 'Pitch', becomes: null }],
    'GPt':    [{ trait: 'Gray', becomes: 'nPt' }, { trait: 'Pitch', becomes: 'nG' }],
    'PtG':    [{ trait: 'Gray', becomes: 'nPt' }, { trait: 'Pitch', becomes: 'nG' }],
    'ff':     [{ trait: 'Flaxen', becomes: null }],
    'nZ':     [{ trait: 'Silver', becomes: null }],
    'ZZ':     [{ trait: 'Silver', becomes: null }],
    'nLu':    [{ trait: 'Illuminated', becomes: null }],
    'LuLu':   [{ trait: 'Illuminated', becomes: null }],
    'spsp':   [{ trait: 'Sepulchered', becomes: null }],
    'Lusp':   [{ trait: 'Illuminated', becomes: 'nsp' }],
    'nTd':    [{ trait: 'Tabard', becomes: null }],
    'TdTd':   [{ trait: 'Tabard', becomes: null }],
    'nGl':    [{ trait: 'Gilt', becomes: null }],
    'GlGl':   [{ trait: 'Gilt', becomes: null }],
    'nV':     [{ trait: 'Vellum', becomes: null }],
    'VV':     [{ trait: 'Vellum', becomes: null }],
    'nOp':    [{ trait: 'Opal', becomes: null }],
    'OpOp':   [{ trait: 'Opal', becomes: null }],
    'nPr':    [{ trait: 'Prism', becomes: null }],
    'PrPr':   [{ trait: 'Prism', becomes: null }],
    'PrOp':   [{ trait: 'Prism', becomes: 'nOp' }, { trait: 'Opal', becomes: 'nPr' }],
    'sfsf':   [{ trait: 'Starfield', becomes: null }],
    'lrlr':   [{ trait: 'Lacquer', becomes: null }],

    // --- White markings ---
    'nSpl':   [{ trait: 'Splash', becomes: null }],
    'SplSpl': [{ trait: 'Splash', becomes: null }],
    'nRn':    [{ trait: 'Roan', becomes: null }],
    'RnRn':   [{ trait: 'Roan', becomes: null }],
    'nT':     [{ trait: 'Tobiano', becomes: null }],
    'TT':     [{ trait: 'Tobiano', becomes: null }],
    'nCu':    [{ trait: 'Cuirass', becomes: null }],
    'CuCu':   [{ trait: 'Cuirass', becomes: null }],
    'CuCw':   [{ trait: 'Cuirass', becomes: 'nCw' }, { trait: 'Crowned', becomes: 'nCu' }],
    'nCw':    [{ trait: 'Crowned', becomes: null }],
    'CwCw':   [{ trait: 'Crowned', becomes: null }],
    'nO':     [{ trait: 'Overo', becomes: null }],
    'OO':     [{ trait: 'Overo', becomes: null }],
    'nSb':    [{ trait: 'Sabino', becomes: null }],
    'SbSb':   [{ trait: 'Sabino', becomes: null }],
    'nGi':    [{ trait: 'Girdle', becomes: null }],
    'GiGi':   [{ trait: 'Girdle', becomes: null }],
    'nCo':    [{ trait: 'Collar', becomes: null }],
    'CoCo':   [{ trait: 'Collar', becomes: null }],
    'GiCo':   [{ trait: 'Girdle', becomes: 'nCo' }, { trait: 'Collar', becomes: 'nGi' }],
    'CoGi':   [{ trait: 'Girdle', becomes: 'nCo' }, { trait: 'Collar', becomes: 'nGi' }],
    'nAp':    [{ trait: 'Apron', becomes: null }],
    'ApAp':   [{ trait: 'Apron', becomes: null }],
    'nGr':    [{ trait: 'Greaves', becomes: null }],
    'GrGr':   [{ trait: 'Greaves', becomes: null }],
    'GrAp':   [{ trait: 'Greaves', becomes: 'nAp' }, { trait: 'Apron', becomes: 'nGr' }],
    'ApGr':   [{ trait: 'Greaves', becomes: 'nAp' }, { trait: 'Apron', becomes: 'nGr' }],
    'nB':     [{ trait: 'Blanched', becomes: null }],
    'BB':     [{ trait: 'Blanched', becomes: null }],
    'BFl':    [{ trait: 'Blanched', becomes: 'nFl' }, { trait: 'False Leopard', becomes: 'nB' }],
    'FlB':    [{ trait: 'Blanched', becomes: 'nFl' }, { trait: 'False Leopard', becomes: 'nB' }],
    'nW':     [{ trait: 'Dominant White', becomes: null }],
    'WW':     [{ trait: 'Dominant White', becomes: null }],
    'nRb':    [{ trait: 'Rabicano', becomes: null }],
    'RbRb':   [{ trait: 'Rabicano', becomes: null }],
    'nFl':    [{ trait: 'False Leopard', becomes: null }],
    'FlFl':   [{ trait: 'False Leopard', becomes: null }],
    'nHq':    [{ trait: 'Harlequin', becomes: null }],
    'HqHq':   [{ trait: 'Harlequin', becomes: null }],
    'nSh':    [{ trait: 'Shroud', becomes: null }],
    'ShSh':   [{ trait: 'Shroud', becomes: null }],
    'fefe':   [{ trait: 'Filigree', becomes: null }],
    'nOs':    [{ trait: 'Ossuary', becomes: null }],
    'OsOs':   [{ trait: 'Ossuary', becomes: null }],
    // KIT compounds, both orderings
    'TRn':    [{ trait: 'Tobiano', becomes: 'nRn' }, { trait: 'Roan', becomes: 'nT' }],
    'RnT':    [{ trait: 'Tobiano', becomes: 'nRn' }, { trait: 'Roan', becomes: 'nT' }],
    'TSb':    [{ trait: 'Tobiano', becomes: 'nSb' }, { trait: 'Sabino', becomes: 'nT' }],
    'SbT':    [{ trait: 'Tobiano', becomes: 'nSb' }, { trait: 'Sabino', becomes: 'nT' }],
    'TW':     [{ trait: 'Tobiano', becomes: 'nW' }, { trait: 'Dominant White', becomes: 'nT' }],
    'WT':     [{ trait: 'Tobiano', becomes: 'nW' }, { trait: 'Dominant White', becomes: 'nT' }],
    'RnSb':   [{ trait: 'Roan', becomes: 'nSb' }, { trait: 'Sabino', becomes: 'nRn' }],
    'SbRn':   [{ trait: 'Roan', becomes: 'nSb' }, { trait: 'Sabino', becomes: 'nRn' }],
    'RnW':    [{ trait: 'Roan', becomes: 'nW' }, { trait: 'Dominant White', becomes: 'nRn' }],
    'WRn':    [{ trait: 'Roan', becomes: 'nW' }, { trait: 'Dominant White', becomes: 'nRn' }],
    'SbW':    [{ trait: 'Sabino', becomes: 'nW' }, { trait: 'Dominant White', becomes: 'nSb' }],
    'WSb':    [{ trait: 'Sabino', becomes: 'nW' }, { trait: 'Dominant White', becomes: 'nSb' }]
};

// A canonical allele pair for each base coat, for the "different E/A genes"
// option. Only these three bases exist, so a base swap is at most two choices.
const SOMATIC_BASE_GENES = {
    'Bay': ['EE', 'AA'],
    'Black': ['EE', 'aa'],
    'Chestnut': ['ee', 'aa']
};

// Illuminated and Gilt recolour skin and hooves as well as coat, and the
// handbook lets Somatic switch off just those parts without touching the coat
// colour. Same one-trait budget, different reach.
const SOMATIC_SURFACE_TRAITS = ['Illuminated', 'Gilt'];

// Name what the patch looks like from a scratch gene list, dropping blanks left
// by switched-off tokens. This is a naming device, not the horse's genotype.
// Anomalies are deliberately left off — Somatic can't touch them, so they ride
// along unchanged and don't belong in the patch's name.
function somaticGenesToPhenotype(genes) {
    const t = resolveTraits(genes.filter(Boolean).join(' '));
    if (t.lethal) return 'Lethal white';
    // Hidden carriers are left out too. They're not painted on the horse, and
    // Somatic doesn't change what a horse carries, so listing them against a
    // patch would imply exactly the thing that isn't happening.
    const visible = t.allTraits.filter(x => !/^Carr(ies|ying) /.test(x));
    const before = visible.filter(x => TRAITS_BEFORE_COAT.includes(x)).join(' ');
    const after = visible.filter(x => TRAITS_AFTER_COAT.includes(x)).join(' ');
    return [before, t.coatColor, after].filter(Boolean).join(' ').trim();
}

// Every Somatic a horse could wear. Own genotype only: no parents, ever.
function generateSomaticPossibilities(genoString) {
    const raw = (genoString || '').trim();
    const resolved = resolveTraits(raw);
    if (resolved.lethal) return { lethal: true };

    const { genes, anomalies } = parseGenotype(raw);
    // The horse minus its anomalies, so patch and horse are compared like for
    // like (anomalies are unaffected either way).
    const unaffected = somaticGenesToPhenotype(genes);

    const traitOptions = [];

    genes.forEach((token, i) => {
        const entries = SOMATIC_SWITCH_OFF[token];
        if (!entries) return;
        entries.forEach(entry => {
            const patchGenes = genes.slice();
            patchGenes[i] = entry.becomes;
            const phenotype = somaticGenesToPhenotype(patchGenes);
            // A switch-off that reads identically isn't a Somatic — the marking
            // has to show a colour change to exist at all.
            if (phenotype === unaffected) return;
            traitOptions.push({
                trait: entry.trait,
                gene: token,
                patchGenes: patchGenes.filter(Boolean).join(' '),
                phenotype
            });
        });
    });

    // Leopard complex is one trait spread over two genes (Lp + patn), and the
    // handbook is explicit that the whole pattern goes: you can't drop an Lp
    // off Fewspot to be left with Leopard.
    const lpIdx = genes.findIndex(g => g === 'nLp' || g === 'LpLp');
    if (lpIdx !== -1) {
        const leopardTrait = resolved.allTraits.find(t => LEOPARD_PATTERN_NAMES.includes(t));
        const patchGenes = genes.filter(g => !/^(nLp|LpLp|npatn|patnpatn)$/.test(g));
        const phenotype = somaticGenesToPhenotype(patchGenes);
        if (leopardTrait && phenotype !== unaffected) {
            traitOptions.push({
                trait: leopardTrait,
                gene: genes.filter(g => /^(nLp|LpLp|npatn|patnpatn)$/.test(g)).join(' '),
                patchGenes: patchGenes.join(' '),
                phenotype,
                note: 'Leopard Complex is one trait across two genes, so Lp and patn both switch off together.'
            });
        }
    }

    // Or, instead of any of that, the patch reads a different E/A base. The
    // dilutions and everything else stay exactly as they are.
    const baseOptions = [];
    Object.keys(SOMATIC_BASE_GENES).forEach(baseName => {
        if (baseName === resolved.baseCoat) return;
        const [eGene, aGene] = SOMATIC_BASE_GENES[baseName];
        const patchGenes = genes
            .map(g => (/^[Ee]{1,2}$/.test(g) ? eGene : /^[Aa]{1,2}$/.test(g) ? aGene : g));
        const phenotype = somaticGenesToPhenotype(patchGenes);
        if (phenotype === unaffected) return;
        baseOptions.push({ trait: baseName, patchGenes: patchGenes.join(' '), phenotype });
    });

    // Skin/hoof-only switch-offs, which leave the coat colour alone entirely.
    const visible = new Set(resolved.allTraits);
    const surfaceOptions = SOMATIC_SURFACE_TRAITS
        .filter(t => visible.has(t))
        .map(t => ({ trait: t }));

    return {
        lethal: false,
        coatColor: resolved.coatColor,
        // Somatic itself is a free marking, not something Somatic can't touch,
        // so it doesn't belong in the "untouchable anomalies" note.
        anomalies: anomalies.filter(a => !FREE_MARKINGS.includes(a)),
        unaffected,
        traitOptions,
        baseOptions,
        surfaceOptions,
        // Interaction notes worth surfacing, but only for horses that have the
        // trait in question — nobody needs the Shroud rule on a horse with no
        // Shroud. Gene traits are matched against the resolved traits and
        // anomalies against the anomaly list, so a stray token written on the
        // wrong side of the `+` can't conjure up a rule.
        interactions: SOMATIC_INTERACTIONS.filter(x => ALL_ANOMALIES.includes(x.trait)
            ? anomalies.includes(x.trait)
            : visible.has(x.trait))
    };
}

// Trait-specific rules from the Somatic entry. Shown only when the horse
// actually has the trait, so the panel stays short and relevant.
const SOMATIC_INTERACTIONS = [
    { trait: 'Chimera', text: 'Somatic and Chimera never interact. The Somatic marking may not overlap or touch the Chimera patch, and the two together still cannot put more than three base colours on the horse.' },
    { trait: 'Pastiche', text: 'Pastiche extends Somatic: with it, the marking may be symmetrical, uniform or deliberate — stripes, skulls, patterns, symbols. Without it, none of those shapes are allowed.' },
    { trait: 'Fresco', text: 'Fresco softens Somatic: with it, the edges may blur, gradient or change opacity. Without it, borders must stay crisp or jagged (mapping is fine either way).' },
    { trait: 'Harlequin', text: 'Somatic can be used to fill the spaces between touching Harlequin diamonds.' },
    { trait: 'Shroud', text: 'Somatic can be used to fill the cutouts in a Shroud design.' },
    { trait: 'Kintsugi', text: 'Kintsugi appears on the edges of white markings affected by Somatic, where that marking is already Kintsugi-affected.' },
    { trait: 'Gilt', text: 'Gilt recolours skin and hooves as well as coat, so Somatic can switch off the Gilt skin and/or hooves on their own, without touching the coat colour.' },
    { trait: 'Illuminated', text: 'Illuminated recolours skin and hooves as well as coat, so Somatic can switch off the Illuminated skin and/or hooves on their own, without touching the coat colour.' }
];

// --- Somatic tab UI handlers ------------------------------------------------

function populateSomaticCollectionSelect() {
    const sel = document.getElementById('somaticFromColl');
    if (!sel) return;
    const collection = (window.getCollection && window.getCollection()) || [];
    const cur = sel.value;
    sel.innerHTML = '<option value="">Pick from collection…</option>' +
        collection.map((h, i) =>
            `<option value="${i}">${(h.name || 'Unnamed').replace(/</g, '&lt;')} (${(h.temperament || '—').replace(/</g, '&lt;')})</option>`
        ).join('');
    if (cur && Number(cur) < collection.length) sel.value = cur;
    const row = document.getElementById('somaticSourceRow');
    if (row) row.style.display = collection.length ? '' : 'none';
}

function fillSomaticFromCollection(idx) {
    const collection = (window.getCollection && window.getCollection()) || [];
    const h = collection[Number(idx)];
    if (!h) return;
    const ta = document.getElementById('somaticGeno');
    if (ta) ta.value = h.genotype || '';
}

// One row: the trait the patch hides, and what the horse reads as inside it.
function renderSomaticOption(opt) {
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const note = opt.note ? `<p class="somatic-opt-note">${esc(opt.note)}</p>` : '';
    // Deliberately no genotype here. Somatic doesn't remove a gene, it stops one
    // being expressed inside the patch, so there is no second genotype to show —
    // printing the rewritten gene list would suggest the horse's own genotype
    // changes, which it never does.
    return `<li class="somatic-opt">
        <div class="somatic-opt-head">${traitLink(opt.trait)}</div>
        <div class="somatic-opt-body"><strong>${esc(opt.phenotype)}</strong></div>
        ${note}
    </li>`;
}

function showSomatic() {
    const ta = document.getElementById('somaticGeno');
    const out = document.getElementById('somaticResult');
    if (!out) return;

    const geno = ta ? ta.value.trim() : '';
    out.style.display = 'block';

    if (!geno) {
        out.innerHTML = '<p class="somatic-empty">Paste a genotype, or pick a horse from your collection, and I\'ll show you every Somatic it could wear.</p>';
        return;
    }

    trackUse('somatic_run');
    const data = generateSomaticPossibilities(geno);

    if (data.lethal) {
        out.innerHTML = '<p class="somatic-empty">This genotype is a lethal white, so there\'s no horse to mark. Check the Translate tab for why.</p>';
        return;
    }

    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Unknown tokens get the same warning Translate and Layers give, so a typo
    // can't quietly drop an option from the list. "Somatic" itself is a known
    // free marking, so pasting a genotype that already has it is fine.
    const { unknownGenes, unknownAnomalies } = findUnknownTokens(geno);
    let warnHtml = '';
    if (unknownGenes.length || unknownAnomalies.length) {
        trackUse('somatic_unknown_tokens');
        const stray = unknownGenes.concat(unknownAnomalies);
        warnHtml = `<div class="translate-warn"><strong>Heads up:</strong> I didn't recognise ${stray.map(s => `<code>${esc(s)}</code>`).join(', ')}, so ${stray.length === 1 ? 'it was' : 'they were'} left out.</div>`;
    }

    const total = data.traitOptions.length + data.baseOptions.length;
    if (!total) {
        out.innerHTML = warnHtml + `<p class="somatic-empty">Unmarked, this horse reads <strong>${esc(data.unaffected)}</strong>, and it has nothing Somatic can hide and nowhere for its base colour to go.</p>`;
        return;
    }

    // The patch is an AREA, not a switch on the whole horse. Everything below is
    // "what you'd see inside the patch", which is the framing the whole tab
    // hangs on, so it goes in one line at the top rather than on every card.
    const head = `<p class="somatic-coat">This horse reads <strong>${esc(data.unaffected)}</strong>. ` +
        `A Somatic patch covers up to a quarter of it and hides <em>one</em> trait in that area. ` +
        `Pick one of the ${total} below — inside the patch, the horse would read:</p>`;

    const sections = [];

    if (data.traitOptions.length) {
        sections.push(`<div class="somatic-group">
            <h3 class="somatic-group-head">Hide a trait</h3>
            <ul class="somatic-list">${data.traitOptions.map(renderSomaticOption).join('')}</ul>
        </div>`);
    }

    if (data.baseOptions.length) {
        sections.push(`<div class="somatic-group">
            <h3 class="somatic-group-head">Or show a different base colour</h3>
            <ul class="somatic-list">${data.baseOptions.map(renderSomaticOption).join('')}</ul>
        </div>`);
    }

    if (data.surfaceOptions.length) {
        sections.push(`<p class="somatic-group-blurb"><strong>Or skin and hooves only:</strong> ${data.surfaceOptions.map(o => traitLink(o.trait)).join(' and ')} recolour${data.surfaceOptions.length === 1 ? 's' : ''} those too, so the patch can hide them there and leave the coat alone.</p>`);
    }

    // Everything below is reference: true for every Somatic, or a rule you can't
    // act on until you're drawing. Folded away so the options stay the page.
    const anomalyRule = data.anomalies.length
        ? `<li>Anomalies aren't attached to genes, so Somatic can't touch ${joinList(data.anomalies.map(a => `<strong>${esc(a)}</strong>`))}.</li>`
        : '';
    const rules = `<details class="somatic-details">
        <summary>Rules for drawing it${data.interactions.length ? ` (${data.interactions.length} specific to this horse)` : ''}</summary>
        <ul class="somatic-rules">
            ${data.interactions.map(x => `<li><strong>${esc(x.trait)}:</strong> ${esc(x.text)}</li>`).join('')}
            ${anomalyRule}
            <li>Covers <strong>up to a quarter</strong> of the horse, in one or several patches.</li>
            <li>Irregular blotches, strips or splatters — it must not read as any other marking, and must not be symmetrical, uniform or deliberate (without Pastiche).</li>
            <li>Crisp, clear outlines or jagged, speckled edges. Mapping is fine; blurring, gradients and altered opacity are not (without Fresco).</li>
            <li>Mane, tail, eyes and hooves change only where the patch touches them, and the patch must show a visible strip of changed coat colour at that edge.</li>
            <li>Skin changes across the patch, and follows the hidden trait if that trait recolours skin.</li>
            <li>No more than <strong>three base colours</strong> on the horse, counting everything.</li>
            <li>It can hide, never add: Somatic cannot create white markings or give the horse a trait it doesn't have.</li>
            <li><strong>The genotype doesn't change.</strong> Somatic switches a trait off inside the patch, it doesn't remove the gene — the horse still carries it, still passes it to foals, and still writes it in its genotype.</li>
        </ul>
    </details>`;

    out.innerHTML = warnHtml + head + sections.join('') + rules;
    out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ===========================================================================
// Recipe — the Foal Generator run backwards
// ---------------------------------------------------------------------------
// Given a foal you want, work out what its parents would have to be.
//
// generateFoal treats every locus on its own: getGeneAlleles cracks each parent
// gene into two alleles, one is taken at random from each side, and
// combineAlleles fuses them. Nothing crosses between loci. So the inverse
// decomposes the same way — for a target allele pair {X, Y} at one locus:
//
//     one parent must carry X, the other must carry Y.
//
// That's the whole rule, which makes this an exact calculation over ~25 loci
// rather than a search over parent genotypes.
// ===========================================================================

// Every allele pair the engine knows, read from the same tables it breeds from
// so the recipe can't drift away from what generateFoal actually does.
const RECIPE_TOKENS = [
    ...Object.keys(DILUTION_NAMES),
    ...Object.keys(MODIFIER_NAMES),
    ...Object.keys(WHITE_MARKING_NAMES),
    'nLp', 'LpLp', 'npatn', 'patnpatn', 'nprl', 'ner',
    'EE', 'Ee', 'ee', 'AA', 'Aa', 'aa'
]
    .filter(tok => getGeneAlleles(tok).length === 2)
    // The name tables list compounds under both orderings (TRn and RnT are one
    // pair), so keep only the spelling combineAlleles itself produces.
    .filter(tok => combineAlleles(getGeneAlleles(tok)[0], getGeneAlleles(tok)[1]) === tok);

// Homozygous pairs that kill the foal, so a parent can never be one of these
// and an allele here can only ever be passed by a carrier — at 50%, never 100%.
const RECIPE_LETHAL_HOM = ['O', 'Os', 'W'];

// The 5% wild anomaly roll picks from this list, so these can turn up in a foal
// neither parent carries. Kept in step with generateFoal.
const RECIPE_WILD_ANOMALIES = ['Bend-or Spots', 'Birdcatcher Spots', 'Brindle', 'Chimera',
    'Geode', 'Stained Glass', 'Kintsugi', 'Swarf', 'Vitiligo',
    'Oracle', 'Signet', 'Pennant', 'Pastiche', 'Fresco', 'Lantern'];

// Which alleles share a locus, worked out by co-occurrence rather than hardcoded:
// if any known pair holds both (Crprl proves Cr and prl are roommates), they sit
// at one locus and a parent can only ever pass one of them.
const RECIPE_LOCUS_OF = (function () {
    const up = {};
    const add = (a) => { if (!(a in up)) up[a] = a; };
    const find = (a) => { while (up[a] !== a) { up[a] = up[up[a]]; a = up[a]; } return a; };
    const union = (a, b) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) up[ra] = rb; };

    RECIPE_TOKENS.forEach((tok) => {
        const alleles = getGeneAlleles(tok).filter(a => a !== 'n');
        alleles.forEach(add);
        for (let i = 1; i < alleles.length; i++) union(alleles[0], alleles[i]);
    });

    const out = {};
    Object.keys(up).forEach(a => { out[a] = find(a); });
    return out;
})();

// Every pair a parent could sit at a given locus, so the recipe can list real
// alternatives ("Cr comes from any of nCr, CrCr, Crprl, TpCr") instead of only
// naming the ideal one.
const RECIPE_LOCUS_TOKENS = (function () {
    const byLocus = {};
    RECIPE_TOKENS.forEach((tok) => {
        const real = getGeneAlleles(tok).filter(a => a !== 'n');
        if (!real.length) return;
        const locus = RECIPE_LOCUS_OF[real[0]];
        byLocus[locus] = byLocus[locus] || [];
        if (byLocus[locus].indexOf(tok) === -1) byLocus[locus].push(tok);
    });
    return byLocus;
})();

// Pairs at this locus that can pass the given allele, best (most reliable) first.
function recipeCarriersOf(allele) {
    const locus = RECIPE_LOCUS_OF[allele];
    const pairs = RECIPE_LOCUS_TOKENS[locus] || [];
    return pairs
        .filter(tok => getGeneAlleles(tok).indexOf(allele) !== -1)
        .filter(tok => !recipeIsLethalPair(tok))
        .sort((a, b) => recipePassChance(b, allele) - recipePassChance(a, allele));
}

function recipeIsLethalPair(tok) {
    const alleles = getGeneAlleles(tok);
    return alleles[0] === alleles[1] && RECIPE_LETHAL_HOM.indexOf(alleles[0]) !== -1;
}

// How often a parent sitting at this pair hands the allele down: both copies is
// every time, one copy is half the time.
function recipePassChance(tok, allele) {
    const alleles = getGeneAlleles(tok);
    return alleles.filter(a => a === allele).length / 2;
}

// The best a parent can do for one allele. Two copies where that's survivable,
// one copy where doubling up would be lethal white.
function recipeBestCarrier(allele) {
    if (allele === 'n') return null;           // "carries nothing here" — see below
    const carriers = recipeCarriersOf(allele);
    return carriers.length ? carriers[0] : null;
}

// Work out the two parents for one target pair. Returns the role each parent
// plays, the ideal pair for it, and the odds that ideal pair delivers.
function recipeForToken(token) {
    const alleles = getGeneAlleles(token);
    if (alleles.length !== 2) return null;     // unknown token; flagged separately

    const [x, y] = alleles;
    const locus = RECIPE_LOCUS_OF[x === 'n' ? y : x];

    function side(allele) {
        if (allele === 'n') {
            // "Passes nothing at this locus" — a parent with no pair here at all
            // is clean every time, so this side is free.
            return { allele: 'n', ideal: null, chance: 1, carriers: [] };
        }
        const ideal = recipeBestCarrier(allele);
        return {
            allele,
            ideal,
            chance: ideal ? recipePassChance(ideal, allele) : 0,
            carriers: recipeCarriersOf(allele)
        };
    }

    const a = side(x);
    const b = side(y);

    return {
        token,
        locus,
        label: recipeTokenLabel(token),
        a, b,
        // Each parent hands down its side independently, so the pair's odds are
        // just the two multiplied.
        chance: a.chance * b.chance,
        cappedBy: [x, y].filter(al => RECIPE_LETHAL_HOM.indexOf(al) !== -1)
    };
}

// The trait name the engine already uses for a pair, so Recipe never invents
// its own vocabulary.
function recipeTokenLabel(token) {
    if (DILUTION_NAMES[token]) return DILUTION_NAMES[token];
    if (MODIFIER_NAMES[token]) return MODIFIER_NAMES[token];
    if (WHITE_MARKING_NAMES[token]) return WHITE_MARKING_NAMES[token];
    if (token === 'nLp') return 'Carries Leopard';
    if (token === 'LpLp') return 'Leopard complex';
    if (token === 'npatn' || token === 'patnpatn') return 'Carries Patn';
    if (token === 'nprl') return 'Carries Pearl';
    if (token === 'ner') return 'Carries Ether';
    if (/^[Ee]{2}$/.test(token) || /^[Aa]{2}$/.test(token)) return 'Base coat';
    return token;
}

// Name a single allele. Base coat alleles have no pair name of their own, so
// "nE" would be nonsense on screen.
function recipeAlleleLabel(allele) {
    if (/^[EeAa]$/.test(allele)) return 'base coat ' + allele;
    return recipeTokenLabel('n' + allele);
}

// Odds a specific anomaly shows up when both parents carry it: each parent
// passes it 25% of the time, and the 5% wild roll can also land on it.
function recipeAnomalyChance(name) {
    const fromParents = 1 - Math.pow(0.75, 2);
    const wild = RECIPE_WILD_ANOMALIES.indexOf(name) !== -1 ? 0.05 / RECIPE_WILD_ANOMALIES.length : 0;
    return fromParents + (1 - fromParents) * wild;
}

function computeRecipe(genoString) {
    const parsed = parseGenotype(genoString);
    const result = {
        loci: [], anomalies: [], free: [],
        parent1: [], parent2: [],
        geneChance: 1, blocked: null, notes: []
    };

    // A foal you can't have is not a foal you can plan for.
    if (isLethalWhite(parsed.genes)) {
        result.blocked = 'This genotype is a lethal white, so there is no foal to breed for. ' +
            'Two copies of Overo, Ossuary or Dominant White is fatal, and so is one Overo alongside one Ossuary.';
        return result;
    }

    const hasE = parsed.genes.some(g => /^[Ee]{2}$/.test(g));
    const hasA = parsed.genes.some(g => /^[Aa]{2}$/.test(g));
    if (!hasE || !hasA) {
        result.notes.push('Every foal is born with a base coat, so add ' +
            (!hasE && !hasA ? 'an E and an A pair' : !hasE ? 'an E pair' : 'an A pair') +
            ' to the target (like Ee Aa) or the recipe can only cover part of the horse.');
    }

    // One entry per locus in the target. A token the engine doesn't know still
    // splits into two alleles (nZZZ looks like n + ZZZ), so it has to be dropped
    // here as well or it would drag the odds to zero after being reported as
    // left out.
    parsed.genes.forEach((token) => {
        if (!isKnownGeneToken(token)) return;
        const entry = recipeForToken(token);
        if (!entry) return;
        result.loci.push(entry);
        result.geneChance *= entry.chance;
    });

    // Spread the load: whichever parent is carrying less so far takes the next
    // side. Any split works — the rule is only that the two sides go to
    // different parents — but an even one is far easier to actually find.
    result.loci.forEach((entry) => {
        // A side asking for nothing costs a parent nothing, so only the sides
        // that need a real pair count towards the balance.
        const aNeeds = entry.a.ideal ? 1 : 0;
        const bNeeds = entry.b.ideal ? 1 : 0;
        const p1Lighter = result.parent1.length <= result.parent2.length;
        const flip = aNeeds === bNeeds
            ? result.parent1.length > result.parent2.length
            : (aNeeds > bNeeds ? !p1Lighter : p1Lighter);

        entry.p1 = flip ? entry.b : entry.a;
        entry.p2 = flip ? entry.a : entry.b;
        if (entry.p1.ideal) result.parent1.push(entry.p1.ideal);
        if (entry.p2.ideal) result.parent2.push(entry.p2.ideal);
    });

    parsed.anomalies.forEach((name) => {
        if (FREE_MARKINGS.indexOf(name) !== -1) {
            result.free.push(name);
            return;
        }
        result.anomalies.push({ name: name, chance: recipeAnomalyChance(name) });
    });

    return result;
}

function recipePercent(p) {
    if (p >= 1) return '100%';
    if (p <= 0) return 'never';
    const pct = p * 100;
    return (pct < 1 ? pct.toFixed(2) : pct < 10 ? pct.toFixed(1) : Math.round(pct)) + '%';
}

// "1 in 8" reads better than "12.5%" when you're planning breedings.
function recipeOneIn(p) {
    if (p >= 1 || p <= 0) return '';
    const n = 1 / p;
    return 'about 1 foal in ' + (n < 10 ? (Math.round(n * 10) / 10) : Math.round(n));
}

function showRecipe() {
    const ta = document.getElementById('recipeGeno');
    const out = document.getElementById('recipeResult');
    if (!out) return;

    const geno = ta ? ta.value.trim() : '';
    out.style.display = 'block';

    if (!geno) {
        out.innerHTML = '<p class="recipe-empty">Paste the foal you want and I\'ll work out what its parents would have to be.</p>';
        return;
    }

    trackUse('recipe_run');
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Plain English in: build the genotype it means, and always say what was built.
    let readHtml = '';
    let target = geno;
    if (!recipeLooksLikeGenotype(geno)) {
        trackUse('recipe_english');
        const built = recipeFromEnglish(geno);
        if (built.choices) {
            const rest = built.choices.rest.join(' ');
            const buttons = built.choices.members.map(m =>
                `<button type="button" class="dc-btn outline auto recipe-pick-btn" onclick="recipePickCoat(${JSON.stringify(m).replace(/"/g, '&quot;')}, ${JSON.stringify(rest).replace(/"/g, '&quot;')})">${esc(m)}</button>`
            ).join('');
            out.innerHTML = `<p class="recipe-lead"><strong>${esc(built.choices.family)}</strong> comes in three, one per base. Which one?</p>
                <div class="recipe-pick">${buttons}</div>
                <p class="recipe-read">Or type it in directly, with the base: <code>${esc('bay ' + built.choices.family.toLowerCase() + (rest ? ' ' + rest.toLowerCase() : ''))}</code>.</p>`;
            out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }
        if (!built.genotype) {
            out.innerHTML = `<p class="recipe-empty">${esc(built.note)} Try something like <code>cerulean bay nacre with tobiano</code>, or paste a genotype.</p>`;
            return;
        }
        target = built.genotype;
        const dropped = built.dropped.length
            ? ` <span class="recipe-read-drop">Left out: ${built.dropped.map(esc).join('; ')}.</span>`
            : '';
        readHtml = `<p class="recipe-read">I read that as <code>${esc(target)}</code>. Not quite it? Edit the box and run again.${dropped}</p>`;
    }
    const data = computeRecipe(target);

    // Same unknown-token warning Translate, Layers and Somatic give, so a typo
    // can't quietly drop a trait out of the recipe.
    const { unknownGenes, unknownAnomalies } = findUnknownTokens(target);
    let warnHtml = '';
    if (unknownGenes.length || unknownAnomalies.length) {
        trackUse('recipe_unknown_tokens');
        const stray = unknownGenes.concat(unknownAnomalies);
        warnHtml = `<div class="translate-warn"><strong>Heads up:</strong> I didn't recognise ${stray.map(s => `<code>${esc(s)}</code>`).join(', ')}, so ${stray.length === 1 ? 'it was' : 'they were'} left out of the recipe.</div>`;
    }

    if (data.blocked) {
        trackUse('recipe_blocked');
        out.innerHTML = warnHtml + `<div class="recipe-blocked"><strong>No recipe for this one.</strong> ${esc(data.blocked)}</div>`;
        out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
    }

    if (!data.loci.length) {
        out.innerHTML = warnHtml + '<p class="recipe-empty">There are no genes in that target for me to work backwards from. Try something like <code>Ee Aa nCr</code>.</p>';
        return;
    }

    const looks = genotypeToPhenotype(target);
    const p1 = data.parent1.join(' ') || 'no genes at all';
    const p2 = data.parent2.join(' ') || 'no genes at all';
    // What each ideal parent actually is, in words, so you know what to look for.
    const reads = g => g && g !== 'no genes at all' ? `<div class="recipe-parent-reads">${esc(genotypeToPhenotype(g))}</div>` : '';

    const head = `<p class="recipe-lead">To breed <strong>${esc(looks)}</strong>, you need two parents who between them can hand down every pair below. ` +
        `Each parent gives one allele per locus, so the two sides of every pair have to come from <em>different</em> parents.</p>`;

    // The headline pair: what to aim for, and what it's worth. A roll gives two
    // foal options and only one of them has to match, so the per roll number is
    // the one worth leading with.
    const plan = computeRecipePlan(data);
    const odds = plan.perFoal >= 1
        ? `<span class="recipe-odds-good">Every foal option</span> from this pair matches the target.`
        : plan.perFoal <= 0
            ? `<span class="recipe-odds-mid">No pairing</span> can produce this.`
            : `<span class="recipe-odds-mid">${recipePercent(plan.perRoll)}</span> of breeding rolls give you at least one matching foal option, ` +
              `since a roll offers two and only one has to match. Per option it's ${recipePercent(plan.perFoal)}, ${recipeOneIn(plan.perFoal)}.`;

    const pair = `<div class="recipe-pair">
            <div class="recipe-parent">
                <div class="recipe-parent-head">Parent A</div>
                <code class="recipe-geno">${esc(p1)}</code>${reads(p1)}
            </div>
            <div class="recipe-parent">
                <div class="recipe-parent-head">Parent B</div>
                <code class="recipe-geno">${esc(p2)}</code>${reads(p2)}
            </div>
        </div>
        <p class="recipe-odds">${odds}</p>
        <p class="recipe-strict">Those two carry <strong>nothing else</strong>. Any extra gene either parent has can land in the foal too, and then it isn't this exact genotype any more. Their temperaments only need to differ from each other.</p>`;

    // Per-locus breakdown: the requirement, and every pair that satisfies it.
    const rows = data.loci.map((e) => {
        const sideText = (s) => s.allele === 'n'
            ? '<span class="recipe-none">nothing at this locus</span>'
            : `<code>${esc(s.ideal)}</code>`;
        const alts = (s) => {
            if (s.allele === 'n') return 'any horse with no pair here';
            const others = s.carriers.filter(t => t !== s.ideal);
            if (!others.length) return `only <code>${esc(s.ideal)}</code> carries it`;
            return 'or ' + others.map(t => `<code>${esc(t)}</code>`).join(', ') + ' at lower odds';
        };
        const capNote = e.cappedBy.length
            ? `<p class="recipe-cap">Two copies of ${e.cappedBy.map(a => esc(recipeTokenLabel('n' + a))).join(' and ')} is lethal white, so a parent can only ever carry one. This pair can never be better than ${recipePercent(e.chance)}.</p>`
            : '';
        return `<li class="recipe-row">
                <div class="recipe-row-head"><code>${esc(e.token)}</code> <span class="recipe-row-label">${esc(e.label)}</span> <span class="recipe-row-odds">${recipePercent(e.chance)}</span></div>
                <div class="recipe-row-body">
                    <div><span class="recipe-side">A</span> ${sideText(e.p1)} <span class="recipe-alt">(${alts(e.p1)})</span></div>
                    <div><span class="recipe-side">B</span> ${sideText(e.p2)} <span class="recipe-alt">(${alts(e.p2)})</span></div>
                </div>
                ${capNote}
            </li>`;
    }).join('');

    const lociBlock = `<h3 class="recipe-head">Locus by locus</h3><ul class="recipe-list">${rows}</ul>`;

    // The cheapest way to stop gambling, costed in listed resale value so the
    // two routes can be compared.
    let planBlock = '';
    if (plan.freeAlready) {
        planBlock = `<div class="recipe-plan"><h3 class="recipe-head">Items needed</h3>
            <p class="recipe-plan-free"><strong>None.</strong> These two parents throw the target on every foal option, so there is nothing worth spending on.</p></div>`;
    } else {
        const rootItems = plan.roots.map(r =>
            `<li><strong>${esc(r.item.name)}</strong> <span class="recipe-coin">${r.item.coin} coin</span><br>
                <span class="recipe-plan-why">Force <code>${esc(r.allele)}</code> (${esc(r.trait)}) from Parent ${esc(r.parent)}. ${esc(r.item.note)}.</span></li>`
        ).join('') + plan.anomalyRoots.map(a =>
            `<li><strong>${esc(a.item.name)}</strong> <span class="recipe-coin">${a.item.coin} coin</span><br>
                <span class="recipe-plan-why">Force ${esc(a.name)} from a parent that has it. Only one per breeding.</span></li>`
        ).join('');

        const tomeItem = `<li><strong>${esc(RECIPE_ITEMS.tome.name)}</strong> <span class="recipe-coin">${RECIPE_ITEMS.tome.coin} coin</span><br>
                <span class="recipe-plan-why">Picks every gene and anomaly at once. Blocks all other add-ons, cannot roll twins, and cannot choose temperament.</span></li>`;

        const chosen = plan.useTome
            ? `<ul class="recipe-plan-list">${tomeItem}</ul>`
            : `<ul class="recipe-plan-list">${rootItems}</ul>`;

        const alt = plan.useTome
            ? (plan.guaranteedByRoots
                ? `<p class="recipe-plan-alt">Roots would come to ${plan.rootCoin} coin for ${plan.itemCount} item${plan.itemCount === 1 ? '' : 's'}, so the Tome is cheaper here.</p>`
                : `<p class="recipe-plan-alt">${plan.notes.map(esc).join(' ')} The Tome is the only route that forces all of them.</p>`)
            : `<p class="recipe-plan-alt">A Tome of Imperfect Creation would also do it in one item, but costs ${RECIPE_ITEMS.tome.coin} coin against ${plan.rootCoin} here.</p>`;

        const gamble = plan.perFoal > 0
            ? `<p class="recipe-plan-gamble">Or spend nothing: ${recipePercent(plan.perRoll)} of rolls already give you a match, and a Bunch of Grapes (${RECIPE_ITEMS.grapes.coin} coin) adds a third option to take that to ${recipePercent(plan.perRollGrapes)}.</p>`
            : '';

        planBlock = `<div class="recipe-plan"><h3 class="recipe-head">Cheapest way to guarantee it</h3>
            <p class="recipe-plan-total"><strong>${plan.cheapestCoin} coin</strong> in Breeding Roll Add-Ons.</p>
            ${chosen}${alt}${gamble}</div>`;
    }

    // Anomalies and free markings can't be planned the way genes can.
    let extras = '';
    if (data.anomalies.length) {
        const items = data.anomalies.map(a =>
            `<li><strong>${esc(a.name)}</strong>, best case <strong>${recipePercent(a.chance)}</strong>, and only if <em>both</em> parents already have it.</li>`
        ).join('');
        extras += `<div class="recipe-extras"><h3 class="recipe-head">Anomalies aren't inherited like genes</h3>
            <p class="recipe-extras-blurb">Each parent's anomaly has a flat 25% chance of passing, so no pairing can promise one. There's also a 5% roll that can add a wild anomaly neither parent carries.</p>
            <ul class="recipe-extras-list">${items}</ul></div>`;
    }
    if (data.free.length) {
        extras += `<div class="recipe-extras"><h3 class="recipe-head">Free markings</h3>
            <p class="recipe-extras-blurb">${data.free.map(esc).join(' and ')} costs nothing and any horse can wear it, so there's no breeding to do. See the Somatic tab.</p></div>`;
    }

    const notes = data.notes.length
        ? `<div class="recipe-note">${data.notes.map(n => `<p>${esc(n)}</p>`).join('')}</div>`
        : '';

    const how = `<details class="recipe-details">
        <summary>How this is worked out</summary>
        <ul class="recipe-rules">
            <li>A foal takes <strong>one allele from each parent</strong> at every locus, so a pair like <code>nCr</code> means one parent handed over <code>Cr</code> and the other handed over nothing.</li>
            <li>A parent with <strong>two copies</strong> passes that allele every time; with <strong>one copy</strong>, half the time. That's why the ideal parents above are doubled up wherever it's survivable.</li>
            <li>Some alleles <strong>share a locus</strong> and a parent can only pass one of them: Cream, Tapestry and Pearl sit together, as do Tobiano, Roan, Sabino and Dominant White.</li>
            <li><strong>Overo, Ossuary and Dominant White can't be doubled</strong>, because two copies is lethal white, so anything needing one is capped at 50% per parent.</li>
            <li>Temperament runs backwards: a foal's temperament is one <strong>neither parent has</strong>, so two parents rule out two of the four. A <strong>Mushroom Skewer</strong> overrides that and lets you pick. Variants pass at 25% each, unless both parents share one, which is guaranteed.</li>
            <li>A breeding roll gives <strong>two foal options</strong> and only one has to match, which is why the headline odds are better than the per option odds. A <strong>Bunch of Grapes</strong> adds a third.</li>
            <li>Roots choose one allele from one parent and force it to pass on every option, split by rarity: <strong>Cave Root</strong> for Common through Rare, <strong>Strong Root</strong> for Epic and Legendary. Both can also force an allele <strong>not</strong> to pass, which is how you use a parent carrying something extra without it leaking into the foal.</li>
            <li>Coin figures are listed <strong>resale values</strong>, used as a stand in so two plans can be compared. What you actually pay depends on where the item came from.</li>
        </ul>
    </details>`;

    // Which of your own horses could actually stand in each role.
    const collection = (typeof window !== 'undefined' && window.getCollection) ? window.getCollection() : [];
    const stable = computeRecipeStable(data, collection);
    let stableBlock = '';

    if (!stable.size) {
        stableBlock = `<div class="recipe-stable"><h3 class="recipe-head">From your stable</h3>
            <p class="recipe-stable-empty">Your stable is empty, so there is nothing to match against yet. Import your coursers in the <strong>Collection</strong> tab and this will fill in with the pairs you can actually field.</p></div>`;
    } else if (stable.pairs.length) {
        const rows = stable.pairs.map((p) => {
            const cost = p.coin === 0
                ? '<span class="recipe-fit-free">no items needed</span>'
                : `<span class="recipe-fit-coin">${p.coin} coin</span> in roots`;
            const odds = p.chance >= 1
                ? 'every foal option matches'
                : `${recipePercent(recipeChanceInRoll(p.chance, RECIPE_OPTIONS_PER_ROLL))} of rolls without items`;
            const itemList = p.items.length
                ? `<ul class="recipe-fit-items">${p.items.map(it =>
                    `<li>${esc(it.item.name)}, ${it.mode === 'force' ? 'force' : 'block'} <code>${esc(it.allele)}</code> (${esc(it.trait)}) <span class="recipe-coin">${it.item.coin} coin</span></li>`).join('')}</ul>`
                : '';
            return `<li class="recipe-fit">
                    <div class="recipe-fit-head">
                        <strong>${esc(p.a.name || p.a.id || 'Unnamed')}</strong> <span class="recipe-fit-temp">${esc(p.a.temperament || '?')}</span>
                        <span class="recipe-fit-x">with</span>
                        <strong>${esc(p.b.name || p.b.id || 'Unnamed')}</strong> <span class="recipe-fit-temp">${esc(p.b.temperament || '?')}</span>
                    </div>
                    <div class="recipe-fit-meta">${cost}, ${odds}</div>
                    ${itemList}
                </li>`;
        }).join('');
        stableBlock = `<div class="recipe-stable"><h3 class="recipe-head">From your stable</h3>
            <p class="recipe-stable-blurb">Pairs from your ${stable.size} coursers that can supply every allele the target needs, cheapest first. A root can force an allele a horse carries but never create one, so anything listed here is genuinely reachable.</p>
            <ul class="recipe-fit-list">${rows}</ul></div>`;
    } else if (stable.nearMisses.length) {
        const rows = stable.nearMisses.map(m =>
            `<li><strong>${esc(m.horse.name || m.horse.id || 'Unnamed')}</strong> <span class="recipe-fit-temp">${esc(m.horse.temperament || '?')}</span>
                <span class="recipe-fit-miss">could be Parent ${esc(m.side)} but carries no ${m.missing.map(a => `<code>${esc(a)}</code> (${esc(recipeAlleleLabel(a))})`).join(' or ')}</span></li>`
        ).join('');
        stableBlock = `<div class="recipe-stable"><h3 class="recipe-head">From your stable</h3>
            <p class="recipe-stable-blurb">No pair in your ${stable.size} coursers can cover this target on its own. These come closest, and what each one is missing is what you would need to bring in.</p>
            <ul class="recipe-near-list">${rows}</ul></div>`;
    } else {
        stableBlock = `<div class="recipe-stable"><h3 class="recipe-head">From your stable</h3>
            <p class="recipe-stable-blurb">Nothing in your ${stable.size} coursers carries enough of this target to build it. Roots can force an allele a horse already has, but they cannot add one, so this needs a horse from outside your stable.</p></div>`;
    }

    // An Unusual Root can only force an anomaly a parent already carries.
    if (stable.size && stable.anomalyCarriers.length) {
        const lines = stable.anomalyCarriers.map(a => a.count
            ? `<li><strong>${esc(a.name)}</strong>: ${a.carriers.map(h => esc(h.name || h.id)).join(', ')}${a.count > a.carriers.length ? ' and ' + (a.count - a.carriers.length) + ' more' : ''}</li>`
            : `<li><strong>${esc(a.name)}</strong>: none of your coursers have it, so it cannot be forced with an Unusual Root.</li>`
        ).join('');
        stableBlock += `<div class="recipe-stable"><h3 class="recipe-head">Who carries the anomaly</h3>
            <ul class="recipe-near-list">${lines}</ul></div>`;
    }

    out.innerHTML = readHtml + warnHtml + head + pair + notes + planBlock + stableBlock + lociBlock + extras + how;
    out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ===========================================================================
// Recipe: Breeding Roll Add-Ons
// ---------------------------------------------------------------------------
// Items can force a locus that chance alone cannot. The roots pick one allele
// from one parent and make it pass (or not pass) on every foal option, and they
// split by rarity: Cave Root covers Common through Rare, Strong Root covers
// Epic and Legendary. Anomalies need an Unusual Root, and only one of those may
// be used per breeding.
//
// Coin figures are the listed resale values, used here as a stand in for cost
// so two plans can be compared. What you actually pay depends on where you got
// the item.
// ===========================================================================

const RECIPE_ITEMS = {
    caveRoot:    { name: 'Cave Root', coin: 50, note: 'Common to Rare allele' },
    strongRoot:  { name: 'Strong Root', coin: 75, note: 'Epic or Legendary allele' },
    unusualRoot: { name: 'Unusual Root', coin: 75, note: 'one Anomaly, one per breeding' },
    grapes:      { name: 'Bunch of Grapes', coin: 150, note: 'adds a third foal option' },
    tome:        { name: 'Tome of Imperfect Creation', coin: 500, note: 'every gene and anomaly at once' }
};

// A breeding roll gives two foal options, three with a Bunch of Grapes, and it
// counts as a win if any one of them matches.
const RECIPE_OPTIONS_PER_ROLL = 2;
const RECIPE_OPTIONS_WITH_GRAPES = 3;

// Rarity is stored per allele pair, so look the allele up in both the carrier
// and the doubled spelling before falling back to Common.
function recipeAlleleRarity(allele) {
    if (Object.prototype.hasOwnProperty.call(GENE_RARITY, 'n' + allele)) return GENE_RARITY['n' + allele];
    if (Object.prototype.hasOwnProperty.call(GENE_RARITY, allele + allele)) return GENE_RARITY[allele + allele];
    return 0;
}

// Cave Root and Strong Root partition the rarity range between them.
function recipeRootFor(allele) {
    return recipeAlleleRarity(allele) >= TIER_EPIC ? 'strongRoot' : 'caveRoot';
}

// Chance that at least one option out of n matches, given a per foal chance.
function recipeChanceInRoll(perFoal, options) {
    if (perFoal >= 1) return 1;
    if (perFoal <= 0) return 0;
    return 1 - Math.pow(1 - perFoal, options);
}

// Work out the cheapest way to land the target, and what it costs to leave it
// to chance instead.
function computeRecipePlan(recipe) {
    const plan = { roots: [], rootCoin: 0, anomalyRoots: [], guaranteedByRoots: true, notes: [] };

    // Any side of a locus the ideal parent cannot pass every time needs a root.
    // With ideal parents that only happens where doubling up would be lethal
    // white, so these are the Overo, Ossuary and Dominant White cases.
    recipe.loci.forEach((entry) => {
        [entry.p1, entry.p2].forEach((side, i) => {
            if (!side || side.allele === 'n' || side.chance >= 1) return;
            const key = recipeRootFor(side.allele);
            plan.roots.push({
                item: RECIPE_ITEMS[key],
                allele: side.allele,
                parent: i === 0 ? 'A' : 'B',
                trait: recipeAlleleLabel(side.allele),
                token: entry.token
            });
            plan.rootCoin += RECIPE_ITEMS[key].coin;
        });
    });

    // Only one Unusual Root per breeding, so a target wanting two anomalies
    // cannot be fully forced by roots at all.
    if (recipe.anomalies.length === 1) {
        plan.anomalyRoots.push({ item: RECIPE_ITEMS.unusualRoot, name: recipe.anomalies[0].name });
        plan.rootCoin += RECIPE_ITEMS.unusualRoot.coin;
    } else if (recipe.anomalies.length > 1) {
        plan.guaranteedByRoots = false;
        plan.notes.push('Only one Unusual Root can be used per breeding, so ' +
            recipe.anomalies.length + ' anomalies cannot all be forced with roots.');
    }

    // The Tome does every gene and anomaly in one go, but it locks out every
    // other add-on and cannot pick temperament.
    plan.tomeCoin = RECIPE_ITEMS.tome.coin;

    const rootsWork = plan.guaranteedByRoots;
    plan.cheapestCoin = rootsWork ? Math.min(plan.rootCoin, plan.tomeCoin) : plan.tomeCoin;
    plan.useTome = !rootsWork || plan.rootCoin > plan.tomeCoin;
    plan.itemCount = plan.roots.length + plan.anomalyRoots.length;
    plan.freeAlready = rootsWork && plan.rootCoin === 0;

    // What the same pairing is worth with no items at all.
    plan.perFoal = recipe.geneChance * recipe.anomalies.reduce((acc, a) => acc * a.chance, 1);
    plan.perRoll = recipeChanceInRoll(plan.perFoal, RECIPE_OPTIONS_PER_ROLL);
    plan.perRollGrapes = recipeChanceInRoll(plan.perFoal, RECIPE_OPTIONS_WITH_GRAPES);

    return plan;
}

// ===========================================================================
// Recipe: matching against your own stable
// ---------------------------------------------------------------------------
// The ideal parents are a description, not a shopping list, so the useful
// question is which horses you already own could play each side.
//
// A root can force an allele a parent carries, but it can never invent one, so
// carrying every allele the role needs is the hard line between "usable" and
// "no". Everything past that line is money: a single copy where two were wanted
// costs a root to force, and anything the horse carries that the target does
// not want costs a root to block. Ranking by that coin total is what makes
// "close" a real answer instead of a vague one.
// ===========================================================================

function recipeLocusOfToken(token) {
    const real = getGeneAlleles(token).filter(a => a !== 'n');
    return real.length ? RECIPE_LOCUS_OF[real[0]] : null;
}

// locus -> the pair this horse sits at
function recipeHorseLoci(genoString) {
    const out = {};
    parseGenotype(genoString || '').genes.forEach((token) => {
        if (!isKnownGeneToken(token)) return;
        const locus = recipeLocusOfToken(token);
        if (locus) out[locus] = token;
    });
    return out;
}

// What one horse would cost to stand in a given role.
function recipeEvaluateHorse(horse, roleReq) {
    const mine = recipeHorseLoci(horse.genotype);
    const res = { horse, feasible: true, missing: [], items: [], coin: 0, chance: 1, blocks: 0, forces: 0 };

    // Every locus the role asks for, plus every locus this horse carries that
    // the target never mentioned (those can leak into the foal).
    const loci = {};
    Object.keys(roleReq).forEach(l => { loci[l] = roleReq[l]; });
    Object.keys(mine).forEach(l => { if (!(l in loci)) loci[l] = 'n'; });

    Object.keys(loci).forEach((locus) => {
        const want = loci[locus];
        const token = mine[locus];

        if (want === 'n') {
            // Must hand down nothing here. No pair at this locus is already clean.
            if (!token) return;
            const alleles = getGeneAlleles(token);
            const nCount = alleles.filter(a => a === 'n').length;
            const stray = alleles.find(a => a !== 'n');
            const key = recipeRootFor(stray);
            res.items.push({
                item: RECIPE_ITEMS[key], mode: 'block', allele: stray,
                trait: recipeAlleleLabel(stray), token
            });
            res.coin += RECIPE_ITEMS[key].coin;
            res.blocks++;
            res.chance *= nCount / 2;      // 0 if homozygous, so only a root saves it
            return;
        }

        // Must hand down this allele, and no item can create one it lacks.
        if (!token) { res.feasible = false; res.missing.push(want); return; }
        const copies = getGeneAlleles(token).filter(a => a === want).length;
        if (!copies) { res.feasible = false; res.missing.push(want); return; }
        res.chance *= copies / 2;
        if (copies < 2) {
            const key = recipeRootFor(want);
            res.items.push({
                item: RECIPE_ITEMS[key], mode: 'force', allele: want,
                trait: recipeAlleleLabel(want), token
            });
            res.coin += RECIPE_ITEMS[key].coin;
            res.forces++;
        }
    });

    return res;
}

// Rank the pairings your stable can actually field.
function computeRecipeStable(recipe, collection) {
    const out = { pairs: [], nearMisses: [], size: (collection || []).length, anomalyCarriers: [] };
    if (!out.size || !recipe.loci.length) return out;

    // The two sides, as locus -> required allele.
    const reqA = {}, reqB = {};
    recipe.loci.forEach((e) => {
        const locus = e.locus;
        if (e.p1) reqA[locus] = e.p1.allele;
        if (e.p2) reqB[locus] = e.p2.allele;
    });

    const asA = collection.map(h => recipeEvaluateHorse(h, reqA));
    const asB = collection.map(h => recipeEvaluateHorse(h, reqB));

    // Parents still have to be two different horses with different temperaments.
    for (let i = 0; i < collection.length; i++) {
        for (let j = 0; j < collection.length; j++) {
            if (i === j) continue;
            const a = asA[i], b = asB[j];
            if (!a.feasible || !b.feasible) continue;
            const t1 = (collection[i].temperament || '').trim();
            const t2 = (collection[j].temperament || '').trim();
            if (t1 && t2 && t1 === t2) continue;
            const coin = a.coin + b.coin;
            const chance = a.chance * b.chance;
            out.pairs.push({
                a: collection[i], b: collection[j], evalA: a, evalB: b,
                coin, chance,
                items: a.items.concat(b.items),
                key: [collection[i].id || collection[i].name, collection[j].id || collection[j].name].join('|')
            });
        }
    }

    // Cheapest first, then whichever needs the least luck.
    out.pairs.sort((x, y) => (x.coin - y.coin) || (y.chance - x.chance));

    // Drop mirrored duplicates of the same two horses.
    const seen = {};
    out.pairs = out.pairs.filter((p) => {
        const k = [p.a.id || p.a.name, p.b.id || p.b.name].sort().join('|');
        if (seen[k]) return false;
        seen[k] = true;
        return true;
    }).slice(0, 5);

    // Horses that would work but for one or two alleles they simply lack.
    if (!out.pairs.length) {
        const best = {};
        collection.forEach((h, i) => {
            [['A', asA[i]], ['B', asB[i]]].forEach(([side, ev]) => {
                if (ev.feasible || !ev.missing.length || ev.missing.length > 2) return;
                const k = (h.id || h.name) + side;
                best[k] = { horse: h, side, missing: ev.missing };
            });
        });
        out.nearMisses = Object.keys(best).map(k => best[k])
            .sort((x, y) => x.missing.length - y.missing.length).slice(0, 6);
    }

    // An Unusual Root can only force an anomaly a parent already has.
    recipe.anomalies.forEach((an) => {
        const carriers = collection.filter(h => parseGenotype(h.genotype || '').anomalies.indexOf(an.name) !== -1);
        out.anomalyCarriers.push({ name: an.name, carriers: carriers.slice(0, 4), count: carriers.length });
    });

    return out;
}


// ===========================================================================
// Recipe: plain English in
// ---------------------------------------------------------------------------
// "a cerulean bay nacre with tobiano" is turned into the genotype it means,
// using the same parser Smart Search reads, so the two tools share one
// vocabulary. The genotype it builds is always shown back, because a quiet
// assumption is worse than a visible one.
// ===========================================================================

// Every named coat, mapped back to a genotype through the scroll pools, which
// already hold a canonical row for each. Engine-backed, so it can't drift.
const RECIPE_COAT_GENES = (function () {
    const out = {};
    Object.keys(RARITY_GENES).forEach(tier => RARITY_GENES[tier].coatColors.forEach(row => {
        const name = resolveTraits(row.genes.join(' ')).coatColor;
        if (!(name in out)) out[name] = row.genes.slice();
    }));
    return out;
})();

// Family name -> its three base-specific coats, single-dilution families included
// (Smart Search leaves those out on purpose; here a bare "cream" needs a pick).
const RECIPE_FAMILY_MEMBERS = (function () {
    const out = {};
    Object.keys(SPECIAL_COAT_NAMES).forEach(key => {
        const family = key.slice(key.indexOf('_') + 1);
        (out[family] = out[family] || []).push(SPECIAL_COAT_NAMES[key]);
    });
    out['Ash Ether'] = out['Double Cream Ether'];
    return out;
})();

const RECIPE_BASE_GENES = { 'Bay': ['Ee', 'AA'], 'Black': ['Ee', 'aa'], 'Chestnut': ['ee', 'AA'] };

// Trait name -> the pair that expresses it. Dominant traits take the carrier
// spelling (one copy shows); recessives need both copies; the leopard complex
// spans two loci; "Carries X" is the single hidden copy.
const RECIPE_TRAIT_GENES = (function () {
    const out = {};
    [WHITE_MARKING_NAMES, MODIFIER_NAMES].forEach(table => Object.keys(table).forEach(tok => {
        if (tok.startsWith('n') && !(table[tok] in out)) out[table[tok]] = [tok];
    }));
    Object.assign(out, {
        'Flaxen': ['ff'], 'Starfield': ['sfsf'], 'Lacquer': ['lrlr'], 'Filigree': ['fefe'], 'Sepulchered': ['spsp'],
        'Snowflake': ['nLp'], 'Blanket': ['nLp', 'npatn'], 'Leopard': ['nLp', 'patnpatn'],
        'Varnish Roan': ['LpLp'], 'Snowcap': ['LpLp', 'npatn'], 'Fewspot': ['LpLp', 'patnpatn'],
        'Carries Ether': ['ner'], 'Carries Pearl': ['nprl'], 'Carries Patn': ['npatn'],
        'Carrying Filigree': ['nfe'], 'Carrying Flaxen': ['nf'], 'Carrying Starfield': ['nsf'],
        'Carrying Lacquer': ['nlr'], 'Carrying Sepulchered': ['nsp'],
        // Mithril is recessive; Damascus needs a Dun opposite it to show at all.
        'Mithril': ['mtmt'], 'Carrying Mithril': ['nmt'],
        'Damascus': ['DmD'], 'Carries Damascus': ['nDm']
    });
    // The trait index says "carrying" for some and "carries" for others. Accept both
    // spellings of every carrier so a name typed either way still builds a genotype.
    Object.keys(out).forEach(name => {
        const alias = name.startsWith('Carrying ') ? name.replace('Carrying ', 'Carries ')
            : name.startsWith('Carries ') ? name.replace('Carries ', 'Carrying ') : null;
        if (alias && !(alias in out)) out[alias] = out[name];
    });
    return out;
})();

// The allele a carrier trait needs, read off the carrier's own gene token. Returns
// null for anything that is not a single-token carrier, which is how the search
// scorer tells a carrier apart from an expressed trait.
function recipeCarrierAllele(traitName) {
    if (!/^carr(?:ies|ying)\s/i.test(traitName)) return null;
    const key = Object.keys(RECIPE_TRAIT_GENES).find(k => k.toLowerCase() === traitName.toLowerCase());
    const toks = key ? RECIPE_TRAIT_GENES[key] : null;
    if (!toks || toks.length !== 1) return null;
    const real = getGeneAlleles(toks[0]).filter(a => a !== 'n');
    return real.length === 1 ? real[0] : null;
}

// Is this input a genotype (Ee Aa nCr ...) or a sentence? Real gene tokens are
// two characters or more (a lone "a" is an English article, not the A locus),
// and they should make up at least half the words.
function recipeLooksLikeGenotype(text) {
    const genes = parseGenotype(text).genes;
    const known = genes.filter(g => g.length >= 2 && isKnownGeneToken(g));
    return known.length > 0 && known.length * 2 >= genes.length;
}

// Build a target genotype from a sentence. Returns:
//   { genotype, coat, traits, choices, dropped, note }
// choices is set (and genotype empty) when a family was named without a base,
// so the caller can offer the three coats.
function recipeFromEnglish(text) {
    const lower = text.toLowerCase();
    // The parser expects lowercase (Smart Search lowercases before calling it);
    // typed as 'Saffron Black Nacre' it matched nothing and fell back to 'black'.
    const found = extractTraitsFromQuery(lower);
    const res = { genotype: '', coat: null, traits: [], choices: null, dropped: [], note: '' };

    // The parser hands back at most one coat-ish thing; work out which kind.
    const coatish = found.find(t => RECIPE_COAT_GENES[t] || RECIPE_FAMILY_MEMBERS[t] || RECIPE_BASE_GENES[t]);
    const others = found.filter(t => t !== coatish);
    const baseWord = (lower.match(/\b(bay|black|chestnut)\b/) || [])[1];
    const baseName = baseWord ? baseWord[0].toUpperCase() + baseWord.slice(1) : null;

    let genes = [];
    if (coatish && RECIPE_COAT_GENES[coatish]) {
        res.coat = coatish;
        genes = RECIPE_COAT_GENES[coatish].slice();
    } else if (coatish && RECIPE_FAMILY_MEMBERS[coatish]) {
        // A family: settle it with a base word if one was given, else offer the three.
        const members = RECIPE_FAMILY_MEMBERS[coatish];
        const pick = baseName && members.find(m => RECIPE_COAT_GENES[m] && RECIPE_COAT_GENES[m].join(' ').startsWith(RECIPE_BASE_GENES[baseName].join(' ')));
        if (pick) {
            res.coat = pick;
            genes = RECIPE_COAT_GENES[pick].slice();
        } else {
            res.choices = { family: coatish, members: members.slice(), rest: others.slice() };
            res.traits = others;
            return res;
        }
    } else if (coatish && RECIPE_BASE_GENES[coatish]) {
        res.coat = coatish;
        genes = RECIPE_BASE_GENES[coatish].slice();
    } else if (baseName) {
        res.coat = baseName;
        genes = RECIPE_BASE_GENES[baseName].slice();
    }

    // Markings and modifiers. Two on one locus fuse (Girdle + Collar is GiCo);
    // a third has nowhere to sit, so it is reported rather than silently lost.
    const byLocus = {};
    others.forEach(trait => {
        const toks = RECIPE_TRAIT_GENES[trait];
        if (!toks) { res.dropped.push(trait); return; }
        res.traits.push(trait);
        toks.forEach(tok => {
            const real = getGeneAlleles(tok).filter(a => a !== 'n');
            const locus = real.length ? RECIPE_LOCUS_OF[real[0]] : tok;
            if (!byLocus[locus]) { byLocus[locus] = tok; return; }
            const have = getGeneAlleles(byLocus[locus]).filter(a => a !== 'n');
            const want = real;
            // Damascus and Dun both land on DmD, which is Dun as well, so
            // whichever is asked for second must not read as a clash: if what is
            // already there covers the new trait, leave it; if the new trait
            // covers what is there, it takes over.
            if (want.every(a => have.includes(a))) return;
            if (have.every(a => want.includes(a))) { byLocus[locus] = tok; return; }
            if (have.length === 1 && want.length === 1 && have[0] !== want[0]) {
                byLocus[locus] = combineAlleles(have[0], want[0]);
            } else if (byLocus[locus] !== tok) {
                res.dropped.push(trait + ' (no room at that locus with ' + recipeTokenLabel(byLocus[locus]) + ')');
            }
        });
    });
    genes = genes.concat(Object.keys(byLocus).map(l => byLocus[l]));

    // Anomalies and free markings, which the parser does not read.
    const extras = ALL_ANOMALIES.concat(FREE_MARKINGS).filter(a => lower.includes(a.toLowerCase()));

    res.genotype = genes.join(' ') + (extras.length ? ' + ' + extras.join(', ') : '');
    if (!genes.length) res.note = 'I could not find a coat, a base colour or any trait I know in that.';
    return res;
}

// A coat button under a family prompt: fill the box with the chosen coat plus
// whatever else was asked for, and run.
function recipePickCoat(name, rest) {
    const ta = document.getElementById('recipeGeno');
    if (!ta) return;
    ta.value = (name + ' ' + (rest || '')).trim();
    showRecipe();
}
