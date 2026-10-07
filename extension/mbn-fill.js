// Injected into the MBN tab by popup.js (chrome.scripting.executeScript, func: fillMBN).
// Must stay self-contained: it is serialized and runs in the page, without access to the popup's scope.
// d = { c: class, e: activity name, b: barème, s: [[student full name, "15,5" | motif], ...] }
async function fillMBN(d) {
  if (window.__notesMoodleMbnRunning) { alert('Une saisie est déjà en cours dans cet onglet.'); return; }
  window.__notesMoodleMbnRunning = true;
  // Busy overlay: shows progress and blocks the user's real clicks/keys (our synthetic events are not trusted, so they pass).
  let ui = null, stop = false;
  const wins = [];
  const block = e => {
    if (!e.isTrusted) return;
    if (e.type === 'keydown' && e.key === 'Escape') stop = true;
    e.stopImmediatePropagation(); e.preventDefault();
  };
  const evts = ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'keydown', 'keypress', 'keyup'];
  const showUi = (w) => {
    ui = document.createElement('div');
    ui.innerHTML = '<style>@keyframes nmmSpin{to{transform:rotate(360deg)}}</style>' +
      '<div style="background:#fff;border-radius:12px;padding:22px 28px;box-shadow:0 8px 30px rgba(0,0,0,.3);font:15px/1.4 system-ui,sans-serif;color:#222;text-align:center;max-width:360px">' +
      '<div style="width:34px;height:34px;margin:0 auto 12px;border:4px solid #dbe4f5;border-top-color:#2a5bd7;border-radius:50%;animation:nmmSpin .8s linear infinite"></div>' +
      '<b>Saisie des notes en cours…</b><div id="nmmCount" style="margin:6px 0;font-size:20px;font-weight:600">0 / ' + d.s.length + '</div>' +
      '<div style="font-size:13px;color:#555">Ne clique pas et ne tape rien pendant la saisie.<br>Échap pour interrompre.</div></div>';
    ui.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(20,30,50,.35);display:flex;align-items:center;justify-content:center;cursor:wait';
    document.documentElement.appendChild(ui);
    for (const x of new Set([window, w])) { evts.forEach(t => x.addEventListener(t, block, true)); wins.push(x); }
  };
  const progress = n => { const c = ui && ui.querySelector('#nmmCount'); if (c) c.textContent = n + ' / ' + d.s.length; };
  const hideUi = () => {
    for (const x of wins.splice(0)) evts.forEach(t => x.removeEventListener(t, block, true));
    if (ui) { ui.remove(); ui = null; }
  };
  try {
    const sel = 'div.colonne_eleves div.eleve.js-eleve';
    const docs = [document];   // the grid may sit in a same-origin iframe
    for (let i = 0; i < docs.length; i++) for (const f of docs[i].querySelectorAll('iframe,frame')) { try { if (f.contentDocument) docs.push(f.contentDocument); } catch (e) { /* cross-origin */ } }
    const D = docs.find(x => x.querySelector(sel)) || document;
    const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .split(/[\s\-'’]+/).filter(Boolean).sort().join(' ');
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const cells = [...D.querySelectorAll(sel)];
    if (!cells.length) { alert('Grille introuvable : ouvre le devoir dans MBN, onglet « Évaluation ».'); return; }

    // Students with the same normalized name cannot be told apart: left for manual entry.
    const count = new Map();
    for (const [n] of d.s) count.set(norm(n), (count.get(norm(n)) || 0) + 1);
    const pb = [];
    const map = new Map();
    for (const [n, v] of d.s) {
      if (count.get(norm(n)) > 1) pb.push(n + ' : homonyme, à saisir à la main');
      else map.set(norm(n), [n, v]);
    }

    if (!confirm('Classe ' + d.c + ' – ' + d.e + '\n' + map.size + ' note(s) à saisir, ' + cells.length + ' élèves dans la grille.\n' +
      'Notes sur ' + d.b + ' : le devoir MBN doit avoir le même barème.\n\n' +
      'Vérifie que c\'est bien le devoir de ' + d.c + '. Continuer ?')) return;

    // Header "Évaluation de Prénom NOM": the element is cached, scanning the page at every poll was slow.
    let hEl = null;
    const re = /^\s*Évaluation de\s+\S/;
    const hText = el => el.textContent.trim().replace(/^Évaluation de\s*/, '').trim();
    const header = () => {
      if (hEl && hEl.isConnected && hEl.offsetParent !== null && re.test(hEl.textContent)) return hText(hEl);
      let els = [...D.querySelectorAll('body *')].filter(x => !x.firstElementChild && re.test(x.textContent) && x.offsetParent !== null);
      if (!els.length) {
        els = [...D.querySelectorAll('body *')].filter(x => re.test(x.textContent) && x.offsetParent !== null);
        els.sort((a, b) => a.textContent.length - b.textContent.length);
      }
      hEl = els[0] || null;
      return hEl ? hText(hEl) : '';
    };

    const fire = (el, types) => types.forEach(t => el.dispatchEvent(new Event(t, { bubbles: true })));
    // Enter, in two flavours: the plain one, then a richer one (charCode, composed, view) tried if MBN ignored the first.
    const enter = (el, rich) => ['keydown', 'keypress', 'keyup'].forEach(t => el.dispatchEvent(new KeyboardEvent(t,
      Object.assign({ key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true },
        rich ? { charCode: 13, composed: true, view: D.defaultView || window } : {}))));
    const mouse = (el, types) => types.forEach(t => el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window })));
    const boxOf = c => c.querySelector('.selection_eleve_checkbox');
    const checked = () => [...D.querySelectorAll('.selection_eleve_checkbox')].filter(x => x.checked);
    // The right panel must show the student selected in the grid (it is refreshed a bit after the click).
    const toks = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/…|\.{3}|\d+([.,]\d+)?/g, ' ').split(/[\s\-'’]+/).filter(Boolean);
    const cellNames = c => [c.querySelector('a, .nom, .libelle'), c].filter(Boolean)
      .map(e => (e.innerText.split('\n').find(l => l.trim()) || '').trim()).filter(Boolean);
    const matches = (c, who) => {
      const h = toks(who);
      return h.length > 0 && cellNames(c).some(n => { const t = toks(n); return t.length > 0 && t.every(w => h.some(x => x.startsWith(w))); });
    };
    const ready = c => { const cb = boxOf(c); return cb && cb.checked && checked().length === 1 && matches(c, header()); };
    const waitReady = async c => { for (let i = 0; i < 12; i++) { if (ready(c)) return true; await sleep(25); } return false; };

    // Selecting a student: three ways, the one that works is remembered and tried first next time.
    let best = 0;
    const select = async c => {
      if (ready(c)) return true;
      const cb = boxOf(c);
      const nameEl = c.querySelector('a, .nom, .libelle, label') || c;
      const tries = [() => nameEl.click(), () => mouse(c, ['mousedown', 'mouseup', 'click']), () => cb && cb.click()];
      for (const ti of [best, ...[0, 1, 2].filter(i => i !== best)]) {
        tries[ti]();
        if (await waitReady(c)) { best = ti; return true; }
        if (checked().length > 1) for (const x of checked()) if (x !== cb) x.click();
        if (await waitReady(c)) { best = ti; return true; }
      }
      return false;
    };

    // Walk the grid with Enter (MBN validates the note and moves to the next student).
    const done = new Set(), typed = [];
    const how = ['iso', 'rich', 'main', 'jq'], used = [0, 0, 0, 0];
    let hi = 0, enterFail = 0;
    const press = async h => {
      if (h === 'iso') enter(note0());
      else if (h === 'rich') enter(note0(), true);
      else { try { await chrome.runtime.sendMessage({ type: 'nmm-enter', how: h === 'main' ? 'native' : 'jquery' }); } catch (e) { /* no background */ } }
    };
    const note0 = () => D.querySelector('#js-eval-eleve__note');
    const cur = () => cells.findIndex(c => { const x = boxOf(c); return x && x.checked; });
    showUi(D.defaultView || window);
    if (!(await select(cells[0]))) { hideUi(); alert('Impossible de sélectionner le premier élève : clique dessus à la main puis relance.'); return; }
    for (let n = 0; n < cells.length + 2; n++) {
      if (stop) { pb.push('interrompu (Échap) après ' + done.size + ' saisie(s)'); break; }
      for (let i = 0; i < 25 && !(cur() >= 0 && ready(cells[cur()])); i++) await sleep(40);
      const idx = cur();
      if (idx < 0 || !ready(cells[idx])) { pb.push('arrêt : sélection multiple, perdue ou panneau non mis à jour après ' + done.size + ' saisie(s)'); break; }
      const who = header(), k = norm(who);
      const note = D.querySelector('#js-eval-eleve__note'), motif = D.querySelector('#js-eval-eleve__non-notation');
      if (!note) { pb.push('arrêt : champ « Note » introuvable'); break; }
      if (map.has(k)) {
        if (done.has(k)) pb.push(who + ' : homonyme dans la grille, à vérifier');
        else {
          const v = map.get(k)[1];
          if (/^\d+([.,]\d+)?$/.test(v)) { note.focus(); note.value = v; fire(note, ['input', 'change']); typed.push([idx, v, who]); done.add(k); progress(done.size); }
          else {
            const o = motif && [...motif.options].find(o => o.text.trim() === v);
            if (o) { motif.value = o.value; fire(motif, ['change']); done.add(k); progress(done.size); } else pb.push(who + ' : motif « ' + v + ' » introuvable');
          }
        }
      }
      // Enter, with a ladder of methods: the one that works is remembered for the next students.
      //   iso/rich = events from this isolated script; main/jq = events sent by the extension's service worker
      //   from the page's own context (native events, then jQuery trigger).
      note.focus();
      const waitMoved = async ms => { for (let i = 0; i < ms / 20; i++) { await sleep(20); const j = cur(); if (j > idx && ready(cells[j])) return true; } return false; };
      let moved = false;
      if (idx + 1 >= cells.length) { await press(how[hi]); await sleep(300); break; }   // last student: nothing to wait for
      for (let a = hi; a < how.length && !moved; a++) {
        note.focus(); await press(how[a]);
        moved = await waitMoved(a === hi ? 400 : 700);
        if (moved) { hi = a; used[a]++; }
      }
      if (!moved) enterFail++;
      if (!moved && !(await select(cells[idx + 1]))) { pb.push('arrêt : impossible de passer à l\'élève suivant après ' + done.size + ' saisie(s)'); break; }
    }

    // Check that each typed note is now shown in the grid (MBN only shows it once validated).
    await sleep(200);
    const flat = s => s.replace(/\s+/g, '').replace(/\./g, ',');
    for (const [idx, v, who] of typed) if (!flat(cells[idx].innerText).includes(flat(v))) pb.push(who + ' : ' + v + ' non visible dans la grille, à vérifier');
    for (const [k, [n]] of map) if (!done.has(k) && !stop) pb.push(n + ' : absent de la grille MBN');

    hideUi();
    alert('✅ ' + done.size + ' / ' + d.s.length + ' saisie(s) pour ' + d.c + '.\n' +
      (pb.length ? '\n⚠️ À vérifier / faire à la main :\n- ' + pb.join('\n- ') : '\nAucun problème.') +
      '\n\n[Entrée — méthode 1 : ' + used[0] + ', 2 : ' + used[1] + ', 3 : ' + used[2] + ', 4 : ' + used[3] + ' ; sans effet : ' + enterFail + ']' +
      '\nVérifie la grille puis clique sur « Valider ».');
  } catch (e) {
    hideUi();
    alert('Erreur extension : ' + (e && e.message || e));
  } finally {
    hideUi();
    window.__notesMoodleMbnRunning = false;
  }
}
