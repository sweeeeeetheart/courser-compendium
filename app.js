/* ============================================================
   Bloodline — app shell (Phases 1–4, client-only, no accounts)
   ------------------------------------------------------------
   breeding-calculator.js stays the genetics engine & source of
   truth. This shell adds: top-nav routing + landing page,
   toasts, an offline indicator, a localStorage-backed collection
   (manager, editor, CSV import wizard + export), "From
   Collection" parent pickers, copy-to-clipboard, real-time
   genotype validation, and recent-search history.

   Exposes window.AppShell, which the engine calls into via
   small, optional hooks (so the engine never hard-depends on it).
   ============================================================ */
(function () {
  'use strict';

  // ---- storage keys --------------------------------------------------------
  const K_COLLECTION = 'bloodline.collection.v1';
  const K_QUERIES = 'bloodline.queries.v1';
  const MAX_RECENT = 8;

  const K_PENDING = 'bloodline.pending.v1';

  // Builds the import bookmarklet for a given target:
  //   'add' -> add the courser to the collection
  //   'p1' / 'p2' -> set it as Parent 1 / Parent 2 in the Foal Generator
  // It is NOT AI: it just scans the page's DOM for the "Genotype"/"Temperament"
  // rows (the same text the site's own copy button uses) and opens Bloodline.
  // Runs entirely in the user's browser; nothing is sent to DC's servers.
  function dcBookmarklet(mode) {
    const q = (mode === 'add')
      ? "'?add=1&id='+encodeURIComponent(id)+'&name='+encodeURIComponent(n)+'&geno='+encodeURIComponent(g)+'&temp='+encodeURIComponent(t)"
      : "'?" + mode + "name='+encodeURIComponent(n)+'&" + mode + "geno='+encodeURIComponent(g)+'&" + mode + "temp='+encodeURIComponent(t)";
    return `javascript:(function(){function f(l){var r=document.querySelectorAll('.row');for(var i=0;i<r.length;i++){var h=r[i].querySelector('h5');if(h&&h.textContent.trim()===l){var c=r[i].querySelector('.col-lg-8');if(c)return c.textContent.replace(/\\s+/g,' ').trim();}}return'';}var g=f('Genotype'),t=f('Temperament');var b=document.querySelector('.breadcrumb-item.active');var n=(b?b.textContent:document.title).replace(/\\s+/g,' ').trim();var id=(location.pathname.match(/(\\d+)/)||[''])[0];if(!g){alert('Bloodline: no genotype found on this page.');return;}window.open('https://ook.monster/courser-calc/'+${q},'bloodline');})();`;
  }

  // Bulk bookmarklet for a "My Characters" page: every card embeds the
  // genotype/temperament/breed in its hover tooltip, so this scrapes them all
  // at once (in the user's browser) and bulk-imports them via a URL hash.
  function dcBulkBookmarklet() {
    return `javascript:(function(){var out=[];document.querySelectorAll('.mytooltip').forEach(function(m){var d=m.querySelector('.tooltip-content');if(!d)return;var html=d.innerHTML;function fld(l){var mm=html.match(new RegExp('<b>'+l+':</b>\\\\s*([^<]*)'));return mm?mm[1].replace(/\\s+/g,' ').trim():'';}var g=fld('Genotype');if(!g)return;var t=fld('Temperament');var br=fld('Breed');var v='Standard';['Heraldic','Puck','Cavedweller','Restored'].forEach(function(x){if(br.indexOf(x)>-1)v=x;});var col=m.closest('.col-md-3')||m.parentElement;var nm='',id='';var img=col?col.querySelector('img.img-thumbnail'):null;if(img&&img.alt)nm=img.alt.replace('Thumbnail for ','').trim();var a=m.closest('a');var href=(a&&a.getAttribute('href'))||'';var pr=href.split('/character/');if(pr.length>1)id=pr[1].split(/[^0-9]/)[0];if(!nm){var ti=m.querySelector('.tooltip-item');nm=ti?ti.textContent.replace(/\\s+/g,' ').trim():(id||'courser');}out.push({id:id,name:nm,geno:g,temp:t,variant:v});});if(!out.length){alert('Bloodline: no coursers found. Open your My Characters page and try again.');return;}window.open('https://ook.monster/courser-calc/#bulk='+encodeURIComponent(JSON.stringify(out)),'bloodline');})();`;
  }

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const setVal = (sel, val) => { const el = $(sel); if (el && val != null) el.value = val; };
  const getVal = (sel) => { const el = $(sel); return el ? el.value : ''; };

  // =========================================================================
  // Persistence
  // =========================================================================
  const Store = {
    load(key, fallback) {
      try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
      catch (e) { return fallback; }
    },
    save(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); return true; }
      catch (e) { toast("Couldn't save to this browser. Its storage may be full or switched off.", 'error'); return false; }
    }
  };

  // Small homepage changelog. Add a new {date, items} entry at the top to update it.
  const CHANGELOG = [
    { date: '12 Sep 2026', items: [
      'Three new Modifiers: Ingot (nIn, Legendary) makes every white marking one metallic colour, Mithril (mtmt, Epic) is a recessive gloss over the whole coat, and Damascus (nDm, Uncommon) sits on Dun\'s locus and only shows as DmD.',
      'Every tool knows them, and Recipe reads "damascus" as the visible DmD pair, so one ideal parent brings Damascus and the other brings Dun.',
      'All 24 Ether coats rewritten from their updated pages in the index\'s sheen language, with none of the old blue-gray or ghostly wording left.',
      'Sepulchered, Sooty, Pangare and Prism rewritten from their updated pages, including Sepulchered on gray and Prism taking Pangare or Sooty but never both.',
      'Lacquer rewritten from its updated page: it recolours Gilt, Ingot, Kintsugi and Swarf, never matches the coat, and overrides Illuminated and Sepulchered on Gilt skin and hooves.',
      'Fixed: Smart Search now uses the same carrier wording Translate prints, and "carries damascus" or "carrying mithril" finds pairs instead of nothing.'
    ] },
    { date: '10 Sep 2026', items: [
      'Recipe now takes plain English. Say what you want ("a cerulean bay nacre with tobiano") and it builds the genotype, shows you what it read so you can correct it, and runs. Name a coat family without a base ("cream ether") and it offers the three coats as buttons. Each ideal parent is now also named in words, so you know what to look for.',
      'Fixed: a capitalised coat name in Recipe ("Saffron Black Nacre") was read as just its base colour; case no longer matters.',
      'New Legendary coats from the coat overhaul: Double Cream Champagne (CrCr with Champagne: Cremello, Perlino and Smoky Cream Champagne), Ash Ether (CrCr erer: Cold, Ombre and Classic Ash Ether) and Nacre (prlprl Cher: Rose Gold, Cerulean Bay and Saffron Black Nacre). Those genotypes used to name as their single-Cream or Pearl Champagne cousins.',
      'Translate describes the new coats in the index\'s sheen language, Layers links their Trait Index pages, Smart Search and Recipe know them by name, and the Scroll Generator can roll them.',
      'Ether has been redefined by the coat overhaul: it desaturates and lightens the base coat and lays a sheen over it, silvery along the topline and muted purple or blue below. Translate now describes Cold, Ombre and Classic Ether that way, and the old blue-gray and purple-pink wording is gone.',
      'Trait Index links follow the consolidated pages: Palomino, Buckskin and Smoky Black now link to the Cream page, and Weld, Madder and Woad to the Tapestry page.',
      'Fixed: Smart Search now understands coat families. "nacre" found nothing, and two-word families like "cream ether" or "pearl champagne" quietly searched for just one word of it, so a pair that could only make a Buckskin came back for "cream ether". A family now matches any of its three coats, and only those.'
    ] },
    { date: '9 Sep 2026', items: [
      'New traits: Pitch (nPt, Rare) blackens with age the way Gray whitens and shares Gray\'s locus (GPt when both); Greaves (nGr) and Apron (nAp) are Common white markings that share a locus (GrAp when both).',
      'Every tool knows the new traits: breeding, Translate, Layers, Somatic, Smart Search, Recipe and the Scroll Generator.',
      'Fixed: Smart Search only counted a trait when a parent was written the carrier way (nGi), so GiGi or shared-locus pairs like GiCo and TRn scored nothing; any spelling that carries it now counts, across twenty traits.',
      'Fixed: "false leopard" in Smart Search was read as the Leopard complex and never matched.',
      'Fixed: "Every possible foal" left Chimera out even when a parent carried it and the example foals rolled it; inherited anomalies are now listed from the parents directly. Reported by Springfoss.'
    ] },
    { date: '20 Aug 2026', items: [
      'Recipe now checks your own stable, ranking the pairs you could field cheapest first with the roots each would need; horses missing an allele outright are listed as near misses with what they lack.',
      'Recipe costs the job out in Breeding Roll Add-Ons: the cheapest roots to guarantee the foal (Cave or Strong by rarity, Unusual for an anomaly) against a Tome of Imperfect Creation, whichever is cheaper.',
      'Odds are now per breeding roll, since a roll gives two foal options and only one has to match; a Bunch of Grapes adds a third.'
    ] },
    { date: '19 Aug 2026', items: [
      'New Recipe tab, the Foal Generator backwards: paste the foal you want and get what the parents must carry, locus by locus, with the odds, and which parts can\'t be planned (anomalies, and the lethal-white caps on Overo, Ossuary and Dominant White).'
    ] },
    { date: '13 Aug 2026', items: [
      'New "Made by friends" section on the front page, starting with Rev\'s Group Horse Roller, which picks two temperament-compatible group horses and flags lethal white risk and cost.'
    ] },
    { date: '31 Jul 2026', items: [
      'New Somatic tab: paste a genotype and see every trait Somatic could hide, what the patch reads as with each one switched off, and the drawing rules.',
      'Genotype boxes now accept "+ Somatic" instead of flagging it, and Translate describes it.'
    ] },
    { date: '17 Jul 2026', items: [
      'New Layers tab: paste a genotype and its traits are laid out in the official visual hierarchy, base coat at the bottom, so you can paint in order; every trait links to its Trait Index page.',
      'Header menu sorted into Breeding and Design dropdowns.',
      'An optional one-time feedback prompt may appear; it only sends what you type.'
    ] },
    { date: '5 Jul 2026', items: [
      'Genotype boxes now read "patn" as one copy (same as "npatn"), flag any token the engine doesn\'t recognise instead of silently dropping it, and keep every anomaly after a second "+" (so "Kintsugi + Swarf" keeps both).',
      'Imports no longer silently swallow bad data: rows with no genotype show as skipped, blank temperaments are kept and flagged, and unrecognised variants or tokens are called out in the preview and in the Foal Generator.'
    ] },
    { date: '4 Jul 2026', items: [
      'New Translate tab: paste a genotype and get a plain-English description of the horse, from body colour through markings, anomalies and variant, read from the same data as the phenotype namer.'
    ] },
    { date: '16 Jun 2026', items: [
      'Smart Search now finds pairs for Prism, Opal and Harlequin, which were never scored and so returned no matches. Reported by Criri.'
    ] },
    { date: '12 Jun 2026', items: [
      'Fixed Pearl: a single copy (nprl) now reads as Carries Pearl, not an expressed coat, since Pearl only shows with two copies or in a compound.',
      'Smart Search now matches coat colours exactly against the genetics engine, so it never suggests a coat a pair can\'t make (fixes Woad and several Cream Champagne and Cream Ether coats).',
      'Chimera Calculator now handles Creations (no parents): the patch can be any base colour plus the horse\'s own traits. Requested by Ursa_Gayjor.',
      'Rarity scoring now matches the Trait Index tier by tier: the Uncommon tier was scoring as Common, the leopard complex was under-rated, and Carries Filigree/Starfield now sit at Epic.'
    ] },
    { date: '10 Jun 2026', items: [
      'Clearer front page: every tool and import option is laid out with a short description and a way in.',
      'Mass-import your whole stable: one bookmarklet on your My Characters page imports every courser at once (Collection tab).',
      'Import a single courser with a bookmarklet: add to your stable, or drop straight into a Parent slot (Collection tab).',
      'Removed offline mode (it was sometimes serving an old cached version).',
      'Foal Generator now lists every possible foal from a pairing, like the Chimera breakdown.',
      'Import your coursers from a CSV right on the homepage.',
      'Stained Glass and Ore are now one trait, Stained Glass. Older genos still read fine.'
    ] },
    { date: '6 Jun 2026', items: [
      'Breedings can roll twins (5%), shown as two foals.',
      'Same-temperament pairs no longer breed, matching the handbook.',
      'Fixed foals showing variants neither parent had.',
      'New look to match dungeon-coursers.com, with offline support and a saved collection.'
    ] }
  ];

  function renderChangelog() {
    const host = $('#changelog');
    if (!host) return;
    host.innerHTML = '<h2>What’s new</h2>' + CHANGELOG.map(g =>
      '<div class="cl-date">' + esc(g.date) + '</div><ul>' +
      g.items.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>'
    ).join('');
  }

  // The working collection lives here and is mirrored into the engine.
  let collection = [];

  function persistCollection() { Store.save(K_COLLECTION, collection); }
  function pushToEngine() { if (window.applyCollection) window.applyCollection(collection); }

  function setCollection(arr, opts) {
    opts = opts || {};
    collection = Array.isArray(arr) ? arr.slice() : [];
    pushToEngine();
    if (opts.persist !== false) persistCollection();
    renderCollection();
    populateParentPickers();
    refreshSearchGate();
  }

  // =========================================================================
  // Toasts
  // =========================================================================
  function toast(message, type, ttl) {
    const wrap = $('#toastContainer');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (type || 'success');
    el.setAttribute('role', 'status');
    el.innerHTML = `<span class="toast-msg">${esc(message)}</span><button class="toast-x" aria-label="Dismiss">&times;</button>`;
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    const kill = () => {
      el.classList.remove('in');
      setTimeout(() => el.remove(), 200);
    };
    el.querySelector('.toast-x').addEventListener('click', kill);
    setTimeout(kill, ttl || (type === 'error' ? 6000 : 4000));
  }

  // =========================================================================
  // Routing: views (landing | app) + areas within the app
  // =========================================================================
  const AREAS = {
    search: { label: 'Smart Search', crumb: 'Smart Search' },
    calculator: { label: 'Foal Generator', crumb: 'Foal Generator' },
    recipe: { label: 'Recipe', crumb: 'Recipe' },
    chimera: { label: 'Chimera Calculator', crumb: 'Chimera Calculator' },
    scroll: { label: 'Scroll Generator', crumb: 'Scroll Generator' },
    translate: { label: 'Translate', crumb: 'Translate' },
    layers: { label: 'Layers', crumb: 'Layers' },
    somatic: { label: 'Somatic', crumb: 'Somatic' },
    collection: { label: 'Collection', crumb: 'Collection' }
  };

  // =========================================================================
  // Per-tool feature flags (PostHog)
  // -------------------------------------------------------------------------
  // Each tool is gated by a PostHog feature flag, so a tool can be turned off
  // for everyone (rollout 0%) or rolled out gradually without a deploy.
  // Fails open: a tool only hides when its flag loads AND evaluates to false.
  // No PostHog (ad-blocker, Do Not Track, blanked key) or no flag -> every
  // tool stays visible.
  // =========================================================================
  const TOOL_FLAGS = {
    calculator: 'tool-foal-generator',
    recipe: 'tool-recipe',
    chimera: 'tool-chimera',
    scroll: 'tool-scroll-generator',
    translate: 'tool-translate',
    layers: 'tool-layers',
    somatic: 'tool-somatic',
    search: 'tool-smart-search',
    collection: 'tool-collection'
  };

  function toolEnabled(area) {
    const key = TOOL_FLAGS[area];
    if (!key || !window.posthog || !posthog.getFeatureFlag) return true;
    // send_event: false keeps the privacy promise — no $feature_flag_called
    // events, the only events sent stay $pageview and tool_opened.
    return posthog.getFeatureFlag(key, { send_event: false }) !== false;
  }

  function firstEnabledArea() {
    if (toolEnabled('calculator')) return 'calculator';
    const open = Object.keys(AREAS).find(toolEnabled);
    return open || 'calculator';
  }

  // Hide/show each tool's nav link and landing card to match its flag, and
  // bounce the user out if the tool they're on just got switched off.
  function applyToolFlags() {
    let activeAreaHidden = false;
    Object.keys(TOOL_FLAGS).forEach((area) => {
      const on = toolEnabled(area);
      $$('.nav-link[data-area="' + area + '"], .tool-card[data-nav="' + area + '"]')
        .forEach((el) => { el.style.display = on ? '' : 'none'; });
      const section = $('#area-' + area);
      if (!on && section && section.classList.contains('active')) activeAreaHidden = true;
    });
    // A dropdown group with every tool switched off disappears with them.
    $$('.nav-group').forEach((g) => {
      const anyVisible = $$('.nav-link[data-area]', g).some((el) => el.style.display !== 'none');
      g.style.display = anyVisible ? '' : 'none';
    });
    const inApp = $('#view-app') && $('#view-app').classList.contains('active');
    if (activeAreaHidden && inApp) showArea(firstEnabledArea());
  }

  function closeNavGroups() {
    $$('.nav-group.open').forEach(g => {
      g.classList.remove('open');
      const b = $('.nav-group-btn', g);
      if (b) b.setAttribute('aria-expanded', 'false');
    });
  }

  function showView(view) {
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showArea(area) {
    // If the markup has a section for this area but this script has never heard
    // of it, index.html is newer than the app.js running it — a stale cached
    // bundle. Falling through to firstEnabledArea() is how that surfaced as
    // "tapping Somatic opens the Foal Generator": silent, and it looks like a
    // routing bug rather than a caching one. Say what's actually wrong instead.
    if (!AREAS[area] && document.getElementById('area-' + area)) {
      toast('That tool needs a fresh copy of the page — your browser is running an older version of the app. Reload to get it.', 'error');
      return;
    }
    if (!AREAS[area] || !toolEnabled(area)) area = firstEnabledArea();
    showView('app');
    $$('.area').forEach(a => a.classList.toggle('active', a.id === 'area-' + area));
    $$('.nav-link[data-area]').forEach(l => l.classList.toggle('active', l.dataset.area === area));
    // Light up a dropdown's group button when the active tool lives inside it.
    $$('.nav-group').forEach(g => g.classList.toggle('has-active', !!$('.nav-link.active', g)));
    const crumb = $('#breadcrumbCurrent');
    if (crumb) crumb.textContent = AREAS[area].crumb;
    if (area === 'collection') renderCollection();
    if (area === 'search') { renderRecentQueries(); refreshSearchGate(); }
    if (area === 'calculator') populateParentPickers();
    if (area === 'translate' && window.populateTranslateCollectionSelect) window.populateTranslateCollectionSelect();
    if (area === 'layers' && window.populateLayersCollectionSelect) window.populateLayersCollectionSelect();
    if (area === 'somatic' && window.populateSomaticCollectionSelect) window.populateSomaticCollectionSelect();
    // Privacy-first analytics: record which tool was opened, nothing else.
    // No-op unless a PostHog key is set in index.html.
    if (window.posthog) window.posthog.capture('tool_opened', { tool: area });
  }

  // Legacy shim the engine calls (fillParents -> 'foals', fillChimera -> 'chimera')
  function switchTab(tabName) {
    const map = { foals: 'calculator', search: 'search', scroll: 'scroll', chimera: 'chimera' };
    showArea(map[tabName] || tabName);
  }

  // =========================================================================
  // Offline indicator
  // =========================================================================
  function refreshOnline() {
    const dot = $('#offlineIndicator');
    if (!dot) return;
    const off = !navigator.onLine;
    dot.classList.toggle('is-offline', off);
    dot.textContent = off ? '● Offline · from cache' : '● Online';
  }

  // =========================================================================
  // Genotype validation (lenient, real-time hint — not a hard gate)
  // =========================================================================
  function validateGenotype(str) {
    const s = (str || '').trim();
    if (!s) return { ok: false, error: 'Genotype is required.' };
    const core = s.split('+')[0];
    const hasE = /\b[Ee]{1,2}\b/.test(core);
    const hasA = /\b[Aa]{1,2}\b/.test(core);
    if (!hasE || !hasA) {
      return { ok: false, error: 'Expected a base coat: an E/e and an A/a pair (e.g. "Ee Aa…").' };
    }
    // Base coat is fine; warn (don't block) about any token the engine would
    // silently ignore, so a typo like `patn` doesn't pass as "valid".
    const unknown = (typeof findUnknownTokens === 'function')
      ? findUnknownTokens(s) : { unknownGenes: [], unknownAnomalies: [] };
    const stray = unknown.unknownGenes.concat(unknown.unknownAnomalies);
    if (stray.length) {
      return { ok: true, warning: `Not recognised (ignored): ${stray.join(', ')}. Check for a typo.` };
    }
    return { ok: true };
  }

  function wireLiveValidation(textareaSel, hintSel) {
    const ta = $(textareaSel), hint = $(hintSel);
    if (!ta || !hint) return;
    const run = () => {
      const v = validateGenotype(ta.value);
      if (!ta.value.trim()) { hint.textContent = ''; ta.classList.remove('invalid', 'valid'); return; }
      if (v.ok && v.warning) {
        hint.textContent = '⚠ ' + v.warning;
        hint.className = 'geno-hint warn';
      } else {
        hint.textContent = v.ok ? '✓ Looks like a valid genotype' : v.error;
        hint.className = 'geno-hint ' + (v.ok ? 'ok' : 'bad');
      }
      ta.classList.toggle('invalid', !v.ok);
      ta.classList.toggle('valid', v.ok && !v.warning);
    };
    ta.addEventListener('input', run);
  }

  // =========================================================================
  // Collection Manager
  // =========================================================================
  function renderCollection() {
    const host = $('#collectionList');
    if (!host) return;
    const countEl = $('#collCount');
    if (countEl) countEl.textContent = collection.length;

    const q = ($('#collSearch') && $('#collSearch').value || '').toLowerCase().trim();
    const sort = $('#collSort') && $('#collSort').value || 'name';

    let rows = collection.slice();
    if (q) {
      rows = rows.filter(h =>
        (h.name || '').toLowerCase().includes(q) ||
        (h.genotype || '').toLowerCase().includes(q) ||
        (h.temperament || '').toLowerCase().includes(q));
    }
    rows.sort((a, b) => {
      if (sort === 'id') return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
      if (sort === 'recent') return 0; // insertion order already reflects "recent"
      return String(a.name).localeCompare(String(b.name));
    });
    if (sort === 'recent') rows.reverse();

    if (!collection.length) {
      host.innerHTML = `
        <div class="empty-state">
          <p>Nothing in the stable yet.</p>
          <p class="subtitle">Bring your herd in from a spreadsheet, or add one horse by hand to get going.
            <a href="https://docs.google.com/spreadsheets/d/1WfCvxwtGRvoDcYXX9mAd5nryJpodRJ-g96eJ3yesQ9E/edit?usp=sharing" target="_blank" rel="noopener">Here's a template to start from.</a>
          </p>
        </div>`;
      return;
    }
    if (!rows.length) { host.innerHTML = `<div class="empty-state"><p>No horses match "${esc(q)}".</p></div>`; return; }

    host.innerHTML = rows.map(h => {
      const idx = collection.indexOf(h);
      const temp = (h.temperament || '').toLowerCase();
      const variant = h.variant && h.variant !== 'Standard' ? `<span class="variant-badge">${esc(h.variant)}</span>` : '';
      return `
        <div class="horse-row">
          <div class="horse-main">
            <div class="horse-name">${esc(h.name)} ${variant}</div>
            <div class="horse-meta">#${esc(h.id)} · <span class="temp-badge temp-${esc(temp)}">${esc(h.temperament)}</span></div>
            <code class="horse-geno">${esc(h.genotype)}</code>
          </div>
          <div class="horse-actions">
            <button class="icon-btn" data-edit="${idx}" title="Edit">Edit</button>
            <button class="icon-btn danger" data-del="${idx}" title="Delete">Delete</button>
          </div>
        </div>`;
    }).join('');
  }

  // =========================================================================
  // Horse Editor (slide-over)
  // =========================================================================
  let editIndex = -1;

  function openEditor(index) {
    editIndex = (typeof index === 'number') ? index : -1;
    const h = editIndex >= 0 ? collection[editIndex] : { id: '', name: '', genotype: '', temperament: '', variant: 'Standard' };
    $('#editorTitle').textContent = editIndex >= 0 ? 'Edit Horse' : 'Add Horse';
    $('#edId').value = h.id || '';
    $('#edName').value = h.name || '';
    $('#edGeno').value = h.genotype || '';
    $('#edTemp').value = h.temperament || '';
    $('#edVariant').value = h.variant || 'Standard';
    $('#edDelete').style.display = editIndex >= 0 ? 'inline-block' : 'none';
    $('#editorHint').textContent = '';
    $('#editorOverlay').classList.add('open');
    $('#edName').focus();
  }
  function closeEditor() { $('#editorOverlay').classList.remove('open'); editIndex = -1; }

  function saveEditor() {
    const name = $('#edName').value.trim();
    const geno = $('#edGeno').value.trim();
    if (!name) { $('#editorHint').textContent = 'Name is required.'; return; }
    const v = validateGenotype(geno);
    if (!v.ok) { $('#editorHint').textContent = v.error; if (window.trackUse) trackUse('editor_genotype_invalid'); return; }
    const horse = {
      id: $('#edId').value.trim() || name,
      name,
      genotype: geno,
      temperament: $('#edTemp').value || '',
      variant: $('#edVariant').value || 'Standard'
    };
    if (editIndex >= 0) { collection[editIndex] = horse; toast('Saved your changes.', 'success'); }
    else { collection.push(horse); toast('Added to your stable.', 'success'); if (window.trackUse) trackUse('horse_added'); }
    setCollection(collection);
    closeEditor();
  }

  function deleteFromEditor() {
    if (editIndex < 0) return;
    const h = collection[editIndex];
    if (!confirm(`Delete "${h.name}" from your collection? This can't be undone.`)) return;
    collection.splice(editIndex, 1);
    setCollection(collection);
    toast('Horse removed.', 'success');
    closeEditor();
  }

  // =========================================================================
  // CSV import wizard + export
  // =========================================================================
  let wizardHorses = [];

  function openWizard() {
    wizardHorses = [];
    gotoStep(1);
    $('#wizFile').value = '';
    $('#wizPreview').innerHTML = '';
    $('#wizardOverlay').classList.add('open');
  }
  function closeWizard() { $('#wizardOverlay').classList.remove('open'); }
  function gotoStep(n) {
    $$('.wiz-step').forEach(s => s.classList.toggle('active', Number(s.dataset.step) === n));
    $$('.wiz-dot').forEach(d => d.classList.toggle('active', Number(d.dataset.step) <= n));
  }

  function handleWizardFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => previewCSV(e.target.result);
    reader.readAsText(file);
  }

  // Collect everything questionable about a row, so the preview can show it
  // instead of importing it silently: bad/unrecognised genotype tokens, a
  // missing or unknown temperament, and an unknown variant.
  function rowIssues(h) {
    const out = [];
    const v = validateGenotype(h.genotype);
    if (!v.ok) out.push(v.error);
    else if (v.warning) out.push(v.warning);
    if (!h.temperament) out.push('no temperament');
    else if (typeof isKnownTemperament === 'function' && !isKnownTemperament(h.temperament)) {
      out.push(`unknown temperament "${h.temperament}"`);
    }
    if (h.variant && typeof isKnownVariant === 'function' && !isKnownVariant(h.variant)) {
      out.push(`unknown variant "${h.variant}" (imports as Standard)`);
    }
    return out;
  }

  function previewCSV(text) {
    const parsed = window.parseHorsesCSV ? window.parseHorsesCSV(text) : { horses: [], headerDetected: false, skipped: [] };
    const rows = parsed.horses;
    const skipped = parsed.skipped || [];
    let flagged = 0;
    const preview = rows.map(h => {
      const issues = rowIssues(h);
      if (issues.length) flagged++;
      return { h, issues };
    });
    wizardHorses = rows; // we still import all rows; flagged ones just noted

    $('#wizDetect').textContent = parsed.headerDetected
      ? 'Header row detected. Mapping by column name.'
      : 'No header row. Assuming order: ID, Name, Genotype, Temperament, Variant.';
    $('#wizCount').textContent = rows.length;
    $('#wizBad').textContent = flagged;
    $('#wizBadWrap').style.display = flagged ? 'block' : 'none';
    const skipWrap = $('#wizSkipWrap');
    if (skipWrap) {
      skipWrap.style.display = skipped.length ? 'block' : 'none';
      const skipEl = $('#wizSkip'); if (skipEl) skipEl.textContent = skipped.length;
    }

    $('#wizPreview').innerHTML = preview.slice(0, 50).map(({ h, issues }) => `
      <tr class="${issues.length ? 'row-bad' : ''}">
        <td>${esc(h._row)}</td><td>${esc(h.name)}</td>
        <td><code>${esc(h.genotype)}</code></td>
        <td>${h.temperament ? esc(h.temperament) : '<span class="cell-missing">—</span>'}</td>
        <td>${issues.length ? '⚠ ' + esc(issues.join('; ')) : '✓'}</td>
      </tr>`).join('');

    if (skipped.length && window.trackUse) trackUse('csv_rows_skipped');
    if (!rows.length) {
      toast(skipped.length
        ? `No importable rows — ${skipped.length} row(s) had no genotype.`
        : "Couldn't spot any horses in that file.", 'error');
      if (window.trackUse) trackUse('csv_no_rows');
      return;
    }
    gotoStep(2);
  }

  function confirmImport() {
    // Normalise variant + temperament on the way in (a typo'd variant lands as
    // Standard, an unknown temperament as blank) — now surfaced in the preview
    // above, so it's a shown correction, not a silent one. Drop the _row helper.
    const clean = wizardHorses.map(h => ({
      id: h.id, name: h.name, genotype: h.genotype,
      temperament: (typeof normalizeTemperament === 'function') ? normalizeTemperament(h.temperament) : (h.temperament || ''),
      variant: (typeof normalizeVariant === 'function') ? normalizeVariant(h.variant) : (h.variant || 'Standard')
    }));
    const mode = $('input[name="wizMode"]:checked');
    const replace = !mode || mode.value === 'replace';
    if (replace) setCollection(clean);
    else setCollection(collection.concat(clean));
    $('#wizDone').textContent = `${clean.length} horse(s) ${replace ? 'imported' : 'added'}.`;
    gotoStep(3);
    toast(`${clean.length} horse(s) ${replace ? 'imported' : 'added'}.`, 'success');
    if (window.trackUse) trackUse('csv_import_completed');
  }

  function exportCSV() {
    if (!collection.length) { toast("Nothing to export yet. Your stable is empty.", 'error'); return; }
    const head = 'ID,Name,Genotype,Temperament,Variant';
    const cell = (s) => {
      s = String(s == null ? '' : s);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const body = collection.map(h => [h.id, h.name, h.genotype, h.temperament, h.variant].map(cell).join(',')).join('\n');
    const blob = new Blob([head + '\n' + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'bloodline-collection.csv';
    document.body.appendChild(a); a.click(); a.remove();
    if (window.trackUse) trackUse('csv_exported');
    URL.revokeObjectURL(url);
    toast('Exported your stable as a CSV.', 'success');
  }

  // =========================================================================
  // "From Collection" parent pickers (calculator area)
  // =========================================================================
  function populateParentPickers() {
    ['1', '2'].forEach(n => {
      const sel = $('#parent' + n + 'FromColl');
      if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = '<option value="">Pick from collection…</option>' +
        collection.map((h, i) => `<option value="${i}">${esc(h.name)} (${esc(h.temperament)})</option>`).join('');
      if (cur && Number(cur) < collection.length) sel.value = cur;
      $$('.parent-source-row').forEach(r => { r.style.display = collection.length ? '' : 'none'; });
    });
  }

  function fillParentFromCollection(n, idx) {
    const h = collection[Number(idx)];
    if (!h) return;
    $('#parent' + n + 'Name').value = h.name || '';
    $('#parent' + n + 'Geno').value = h.genotype || '';
    $('#parent' + n + 'Temp').value = h.temperament || '';
    $('#parent' + n + 'Variant').value = h.variant || 'Standard';
    const ta = $('#parent' + n + 'Geno');
    if (ta) ta.dispatchEvent(new Event('input'));
  }

  // =========================================================================
  // Recent queries (Smart Search)
  // =========================================================================
  function recordQuery(q, count) {
    let recent = Store.load(K_QUERIES, []);
    recent = recent.filter(r => r.q !== q);
    recent.unshift({ q, count, ts: Date.now() });
    recent = recent.slice(0, MAX_RECENT);
    Store.save(K_QUERIES, recent);
    renderRecentQueries();
  }

  // Gate Smart Search behind having a collection: prompt to add horses if empty.
  function refreshSearchGate() {
    const empty = $('#searchEmpty'), controls = $('#searchControls');
    if (!empty || !controls) return;
    const hasHorses = collection.length > 0;
    empty.style.display = hasHorses ? 'none' : 'block';
    controls.style.display = hasHorses ? 'block' : 'none';
  }

  function renderRecentQueries() {
    const host = $('#recentQueries');
    if (!host) return;
    const recent = Store.load(K_QUERIES, []);
    if (!recent.length) { host.innerHTML = ''; return; }
    host.innerHTML = '<span class="recent-label">Recent:</span> ' + recent.map(r =>
      `<button class="chip" data-query="${esc(r.q)}">${esc(r.q)} <span class="chip-count">${r.count}</span></button>`).join('');
  }

  // =========================================================================
  // Chimera: now its own first-class area (reachable from the nav and from a
  // foal card). The engine fills #chimera* fields then calls switchTab.
  // =========================================================================
  function openChimeraModal() { showArea('chimera'); }

  // =========================================================================
  // Wiring
  // =========================================================================
  function wire() {
    // Nav
    $$('.nav-link[data-area]').forEach(l =>
      l.addEventListener('click', (e) => { e.preventDefault(); closeNavGroups(); showArea(l.dataset.area); }));

    // Nav dropdown groups: click toggles, outside click or Escape closes.
    $$('.nav-group-btn').forEach(btn =>
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const group = btn.parentElement;
        const wasOpen = group.classList.contains('open');
        closeNavGroups();
        if (!wasOpen) { group.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
      }));
    document.addEventListener('click', closeNavGroups);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNavGroups(); });
    $$('[data-nav]').forEach(b =>
      b.addEventListener('click', (e) => {
        e.preventDefault();
        const t = b.dataset.nav;
        if (t === 'landing') showView('landing'); else showArea(t);
      }));

    // Translate tab: fill genotype/variant when a collection horse is picked
    const tSel = $('#translateFromColl');
    if (tSel) tSel.addEventListener('change', () => {
      if (tSel.value !== '' && window.fillTranslateFromCollection) window.fillTranslateFromCollection(tSel.value);
    });

    // Layers tab: same, fill from the picked collection horse
    const lSel = $('#layersFromColl');
    if (lSel) lSel.addEventListener('change', () => {
      if (lSel.value !== '' && window.fillLayersFromCollection) window.fillLayersFromCollection(lSel.value);
    });

    // Somatic tab: same again
    const soSel = $('#somaticFromColl');
    if (soSel) soSel.addEventListener('change', () => {
      if (soSel.value !== '' && window.fillSomaticFromCollection) window.fillSomaticFromCollection(soSel.value);
    });

    // Collection toolbar
    const cs = $('#collSearch'); if (cs) cs.addEventListener('input', renderCollection);
    const cso = $('#collSort'); if (cso) cso.addEventListener('change', renderCollection);
    on('#collAdd', () => openEditor());
    on('#collImport', openWizard);
    on('#collExport', exportCSV);

    // Smart Search empty-state prompts
    on('#searchImport', openWizard);
    on('#searchAdd', () => openEditor());

    // Landing-page import prompt
    on('#landingImport', openWizard);
    on('#landingAdd', () => openEditor());

    // Dungeon Coursers import bookmarklets (drag to bookmarks bar)
    [['#dcBmAdd', 'add'], ['#dcBmP1', 'p1'], ['#dcBmP2', 'p2']].forEach((pair) => {
      const a = $(pair[0]);
      if (!a) return;
      a.href = dcBookmarklet(pair[1]);
      a.addEventListener('click', (e) => {
        e.preventDefault();
        toast('Drag this button up to your bookmarks bar, then click it on a courser page.', 'success', 5000);
      });
    });
    ['#dcBmAll', '#dcBmAllLanding'].forEach((sel) => {
      const allBtn = $(sel);
      if (!allBtn) return;
      allBtn.href = dcBulkBookmarklet();
      allBtn.addEventListener('click', (e) => {
        e.preventDefault();
        toast('Drag this up to your bookmarks bar, then click it on your My Characters page to import everything.', 'success', 5000);
      });
    });

    // Delegated edit/delete in the list
    const list = $('#collectionList');
    if (list) list.addEventListener('click', (e) => {
      const ed = e.target.closest('[data-edit]'); const del = e.target.closest('[data-del]');
      if (ed) openEditor(Number(ed.dataset.edit));
      else if (del) {
        const i = Number(del.dataset.del); const h = collection[i];
        if (h && confirm(`Delete "${h.name}"? This can't be undone.`)) {
          collection.splice(i, 1); setCollection(collection); toast('Horse removed.', 'success');
        }
      }
    });

    // Editor
    on('#edSave', saveEditor);
    on('#edCancel', closeEditor);
    on('#edDelete', deleteFromEditor);
    on('#editorClose', closeEditor);
    $('#editorOverlay').addEventListener('click', (e) => { if (e.target.id === 'editorOverlay') closeEditor(); });
    wireLiveValidation('#edGeno', '#editorHint');

    // Wizard
    const wf = $('#wizFile'); if (wf) wf.addEventListener('change', (e) => handleWizardFile(e.target.files[0]));
    on('#wizConfirm', confirmImport);
    on('#wizClose', closeWizard);
    on('#wizDoneBtn', () => { closeWizard(); showArea('collection'); });
    on('#wizBack', () => gotoStep(1));
    const dz = $('#wizDrop');
    if (dz) {
      ['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
      ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
      dz.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) handleWizardFile(e.dataTransfer.files[0]); });
      dz.addEventListener('click', () => wf && wf.click());
    }
    $('#wizardOverlay').addEventListener('click', (e) => { if (e.target.id === 'wizardOverlay') closeWizard(); });

    // From-collection pickers
    ['1', '2'].forEach(n => {
      const sel = $('#parent' + n + 'FromColl');
      if (sel) sel.addEventListener('change', () => { if (sel.value !== '') fillParentFromCollection(n, sel.value); });
    });

    // Recent query chips
    const rq = $('#recentQueries');
    if (rq) rq.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-query]');
      if (chip) { $('#breedingQuery').value = chip.dataset.query; if (window.searchBreeding) window.searchBreeding(); }
    });

    // Copy-to-clipboard (delegated) for any .geno-copy
    document.addEventListener('click', (e) => {
      const g = e.target.closest('.geno-copy');
      if (!g) return;
      const text = g.dataset.geno || g.textContent.replace('⧉', '').trim();
      copyText(text);
    });

    // Live validation on the foal-generator parent fields
    wireLiveValidation('#parent1Geno', '#parent1GenoHint');
    wireLiveValidation('#parent2Geno', '#parent2GenoHint');

    // Chimera mode toggle: Creation hides the parent inputs.
    $$('input[name="chimeraMode"]').forEach((r) => r.addEventListener('change', () => {
      const sel = $('input[name="chimeraMode"]:checked');
      const creation = sel && sel.value === 'creation';
      const par = $('#chimeraParents'); if (par) par.style.display = creation ? 'none' : '';
      const lbl = $('#chimeraGenoLabel'); if (lbl) lbl.textContent = (creation ? 'Creation' : 'Foal') + ' Genotype (with Chimera):';
    }));

    // Esc closes overlays
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeEditor(); closeWizard(); }
    });

    // Online/offline
    window.addEventListener('online', refreshOnline);
    window.addEventListener('offline', refreshOnline);
  }

  function on(sel, fn) { const el = $(sel); if (el) el.addEventListener('click', fn); }

  function copyText(text) {
    const done = () => toast('Copied that genotype.', 'success', 2500);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else { fallbackCopy(text, done); }
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast("Couldn't copy that, sorry.", 'error'); }
    ta.remove();
  }

  // =========================================================================
  // Import via URL params (used by the Dungeon Coursers bookmarklet, or any
  // link). Either adds a courser to the collection, or prefills a parent.
  //   ?add=1&name=...&geno=...&temp=...&variant=...&id=...
  //   ?p1geno=...&p1temp=...&p1variant=...&p1name=...  (and p2*)
  // =========================================================================
  // Delegate to the engine's normalisers (single source of truth); the inline
  // maps are only a fallback if breeding-calculator.js somehow didn't load.
  function normTemp(v) {
    if (typeof normalizeTemperament === 'function') return normalizeTemperament(v);
    const m = { choleric: 'Choleric', melancholic: 'Melancholic', phlegmatic: 'Phlegmatic', sanguine: 'Sanguine' };
    return m[(v || '').trim().toLowerCase()] || '';
  }
  function normVariant(v) {
    if (typeof normalizeVariant === 'function') return normalizeVariant(v);
    const m = { standard: 'Standard', heraldic: 'Heraldic', puck: 'Puck', cavedweller: 'Cavedweller', restored: 'Restored' };
    return m[(v || '').trim().toLowerCase()] || 'Standard';
  }

  function importFromQuery(search) {
    const q = new URLSearchParams(search != null ? search : window.location.search);
    if (!q.toString()) return false;
    let acted = false;

    if (q.get('add') && q.get('geno')) {
      const raw = (q.get('name') || '').trim();
      let id = (q.get('id') || '').trim();
      let name = raw;
      const m = raw.match(/^(\d+)\s*[:\-]\s*(.+)$/); // "2261: Scheitelhau"
      if (m) { if (!id) id = m[1]; name = m[2].trim(); }
      const horse = {
        id: id || name || ('import-' + Date.now()),
        name: name || ('Courser ' + (id || '')),
        genotype: (q.get('geno') || '').trim(),
        temperament: normTemp(q.get('temp')),
        variant: normVariant(q.get('variant'))
      };
      collection.push(horse);
      setCollection(collection);
      toast('Imported ' + horse.name + ' to your stable.', 'success');
      // Surface anything we quietly corrected or ignored, rather than letting a
      // bad genotype/variant slip into the collection unnoticed.
      const warns = [];
      const uk = (typeof findUnknownTokens === 'function') ? findUnknownTokens(horse.genotype) : { unknownGenes: [], unknownAnomalies: [] };
      const stray = uk.unknownGenes.concat(uk.unknownAnomalies);
      if (stray.length) warns.push('unrecognised in the genotype: ' + stray.join(', '));
      const rawVar = (q.get('variant') || '').trim();
      if (rawVar && typeof isKnownVariant === 'function' && !isKnownVariant(rawVar)) warns.push(`variant "${rawVar}" wasn't recognised (set to Standard)`);
      const rawTemp = (q.get('temp') || '').trim();
      if (rawTemp && typeof isKnownTemperament === 'function' && !isKnownTemperament(rawTemp)) warns.push(`temperament "${rawTemp}" wasn't recognised`);
      if (warns.length) toast('Heads up on ' + horse.name + ': ' + warns.join('; ') + '.', 'error');
      showArea('collection');
      if (window.trackUse) trackUse('bookmarklet_import');
      acted = true;
    }

    let parentSet = false;
    ['1', '2'].forEach(n => {
      const g = q.get('p' + n + 'geno');
      if (!g) return;
      fillParentSlot(n, { name: q.get('p' + n + 'name'), geno: g, temp: q.get('p' + n + 'temp'), variant: q.get('p' + n + 'variant') });
      parentSet = true;
    });
    if (parentSet) {
      // Bring the OTHER slot across from a recent handoff (the previous click),
      // so two separate courser imports can fill both parents despite the reload.
      const pend = loadPending();
      ['1', '2'].forEach(n => {
        if (q.get('p' + n + 'geno')) return;
        if (pend && pend['p' + n]) fillParentSlot(n, pend['p' + n]);
      });
      savePending();
      showArea('calculator');
      acted = true;
    }

    return acted;
  }

  function fillParentSlot(n, d) {
    if (!d) return;
    setVal('#parent' + n + 'Name', (d.name || '').trim());
    setVal('#parent' + n + 'Geno', (d.geno || '').trim());
    setVal('#parent' + n + 'Temp', normTemp(d.temp));
    setVal('#parent' + n + 'Variant', normVariant(d.variant));
    const ta = $('#parent' + n + 'Geno'); if (ta) ta.dispatchEvent(new Event('input'));
  }

  function snapshotSlot(n) {
    const geno = getVal('#parent' + n + 'Geno');
    if (!geno) return null;
    return { name: getVal('#parent' + n + 'Name'), geno: geno, temp: getVal('#parent' + n + 'Temp'), variant: getVal('#parent' + n + 'Variant') };
  }
  function savePending() { Store.save(K_PENDING, { p1: snapshotSlot('1'), p2: snapshotSlot('2'), ts: Date.now() }); }
  function loadPending() {
    const p = Store.load(K_PENDING, null);
    if (!p || !p.ts || (Date.now() - p.ts) > 15 * 60 * 1000) return null; // 15-min handoff window
    return p;
  }

  // Bulk import from a "My Characters" page, handed over in the URL hash as JSON.
  // Merges into the collection (de-duplicated by id).
  function importBulkFromHash(hash) {
    const h = hash != null ? hash : (window.location.hash || '');
    const m = h.match(/^#bulk=(.*)$/);
    if (!m) return false;
    let arr;
    try { arr = JSON.parse(decodeURIComponent(m[1])); } catch (e) { toast('That import link was malformed.', 'error'); return false; }
    if (!Array.isArray(arr) || !arr.length) return false;

    let added = 0, updated = 0;
    arr.forEach((c, i) => {
      const geno = (c.geno || '').trim();
      if (!geno) return;
      const raw = (c.name || '').trim();
      let id = (c.id == null ? '' : String(c.id)).trim();
      let name = raw;
      const mm = raw.match(/^(\d+)\s*[:\-]\s*(.+)$/);
      if (mm) { if (!id) id = mm[1]; name = mm[2].trim(); }
      const horse = {
        id: id || name || ('import-' + Date.now() + '-' + i),
        name: name || ('Courser ' + (id || '')),
        genotype: geno,
        temperament: normTemp(c.temp),
        variant: normVariant(c.variant)
      };
      const ix = collection.findIndex((x) => String(x.id) === String(horse.id));
      if (ix >= 0) { collection[ix] = horse; updated++; } else { collection.push(horse); added++; }
    });
    setCollection(collection);
    toast('Imported ' + added + ' courser' + (added === 1 ? '' : 's') + (updated ? (', updated ' + updated) : '') + '.', 'success');
    showArea('collection');
    if (window.trackUse) trackUse('bookmarklet_bulk_import');
    return true;
  }

  // =========================================================================
  // Init
  // =========================================================================
  function init() {
    // Pull any saved collection into the engine + UI.
    setCollection(Store.load(K_COLLECTION, []), { persist: false });
    renderRecentQueries();
    renderChangelog();
    refreshOnline();
    wire();

    // Apply per-tool feature flags: once now (cached flags from the last
    // visit apply instantly) and again whenever fresh flags arrive.
    applyToolFlags();
    if (window.posthog && posthog.onFeatureFlags) posthog.onFeatureFlags(applyToolFlags);

    // First-time visitors land on the landing page; returning users with a
    // stable go straight to the calculator.
    showView('landing');

    // Honour any ?import params or #bulk= hash, then strip them so a refresh
    // doesn't repeat the import.
    const didQuery = importFromQuery();
    const didBulk = importBulkFromHash();
    if (didQuery || didBulk) {
      history.replaceState({}, '', window.location.pathname);
    }

    // Offline support was removed (it cached stale versions). Tear down any
    // previously-installed service worker + its caches so nothing is pinned.
    if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    }
    if (window.caches && caches.keys) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
    }
  }

  // Public surface the engine hooks into.
  window.AppShell = {
    switchTab,
    showArea,
    showView,
    toast,
    recordQuery,
    openChimeraModal,
    _importFromQuery: importFromQuery,
    _importBulkFromHash: importBulkFromHash,
    onCollectionChanged: function (arr, opts) {
      // Engine called us after a CSV parse — adopt its array, persist, render.
      collection = Array.isArray(arr) ? arr.slice() : [];
      if (!opts || opts.persist !== false) persistCollection();
      renderCollection();
      populateParentPickers();
      if (window.populateTranslateCollectionSelect) window.populateTranslateCollectionSelect();
      if (window.populateLayersCollectionSelect) window.populateLayersCollectionSelect();
      if (window.populateSomaticCollectionSelect) window.populateSomaticCollectionSelect();
      refreshSearchGate();
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
