// Popup: Moodle connection, course/activity/class choice, grade loading, then injection of fillMBN (mbn-fill.js).
// Storage:
//  - chrome.storage.local   : conf {url, token}, catalog (courses, activities, class groups: no student data), last choices
//  - chrome.storage.session : pending login, loaded grades (in memory only, cleared when Chrome closes)
const $ = id => document.getElementById(id);
let conf = null, courses = [], items = [], byClass = {};
let catalog = { courses: null, items: {}, groups: {} };

const msg = (t, err) => { $('msg').textContent = t || ''; $('msg').className = err ? 'err' : ''; };
const saveCatalog = () => chrome.storage.local.set({ catalog });
const course = () => courses[$('course').value];
const item = () => items[$('item').value];

// ---------- Moodle web service ----------
async function api(fn, params = {}) {
  const body = new URLSearchParams({ wstoken: conf.token, wsfunction: fn, moodlewsrestformat: 'json', ...params });
  let r;
  try { r = await fetch(conf.url + '/webservice/rest/server.php', { method: 'POST', body }); }
  catch (e) { throw new Error('Moodle injoignable (connexion internet ?)'); }
  if (!r.ok) throw new Error('Moodle a répondu HTTP ' + r.status);
  const j = await r.json();
  if (j && j.exception) {
    const err = new Error(j.errorcode === 'invalidtoken' ? 'Connexion Moodle expirée : clique sur « Se reconnecter ».' : (j.message || j.errorcode));
    err.code = j.errorcode;
    throw err;
  }
  return j;
}

function parseToken(raw) {
  raw = raw.trim();
  const m = raw.match(/token=([A-Za-z0-9+/=_-]+)/);
  if (!m) return raw;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    return atob(b64 + '='.repeat((4 - b64.length % 4) % 4)).split(':::')[1];
  } catch (e) { throw new Error('Lien moodlemobile:// illisible'); }
}

// ---------- catalog: courses, activities, classes (cached, ↻ to refresh) ----------
const fill = (sel, arr, label) => { sel.innerHTML = ''; arr.forEach((x, i) => sel.add(new Option(label(x), i))); };

async function loadCourses(force) {
  if (force || !(catalog.courses && catalog.courses.length)) {
    msg('Connexion à Moodle…');
    const info = await api('core_webservice_get_site_info');
    catalog.courses = (await api('core_enrol_get_users_courses', { userid: info.userid }))
      .map(c => ({ id: c.id, fullname: c.fullname })).sort((a, b) => a.fullname.localeCompare(b.fullname));
    await saveCatalog();
    msg('');
  }
  courses = catalog.courses;
  fill($('course'), courses, c => c.fullname);
  const { courseId } = await chrome.storage.local.get('courseId');
  const i = courses.findIndex(c => c.id === courseId);
  if (i >= 0) $('course').value = i;
  await loadItems(force);
}

async function getGroups(courseId, force) {
  if (!force && catalog.groups[courseId]) return catalog.groups[courseId];
  let g = await api('core_group_get_course_groups', { courseid: courseId });
  // ENT naming "Cohorte 2026 C 4B": keep the latest school year, class = last word. Other naming: full group name.
  const years = g.flatMap(x => [...x.name.matchAll(/Cohorte (\d{4})/g)].map(m => +m[1]));
  if (years.length) g = g.filter(x => x.name.includes('Cohorte ' + Math.max(...years)));
  const out = g.sort((a, b) => a.name.localeCompare(b.name))
    .map(x => ({ id: x.id, classe: years.length ? x.name.trim().split(/\s+/).pop() : x.name.trim() }));
  catalog.groups[courseId] = out.length ? out : [{ id: 0, classe: '(tout le cours)' }];
  await saveCatalog();
  return catalog.groups[courseId];
}

const gradedItems = rep => rep.usergrades && rep.usergrades.length
  ? rep.usergrades[0].gradeitems.filter(x => x.itemtype === 'mod' || x.itemtype === 'manual')
      .map(x => ({ id: x.id, itemname: x.itemname, grademax: x.grademax })) : [];

async function loadItems(force) {
  const c = course();
  items = [];
  if (!c) { fill($('item'), [], () => ''); return msg('Aucun cours trouvé dans Moodle.', true); }
  if (!force && catalog.items[c.id]) items = catalog.items[c.id];
  else {
    msg('Chargement des activités…');
    try { items = gradedItems(await api('gradereport_user_get_grade_items', { courseid: c.id, groupid: 0 })); }
    catch (e) { if (e.code === 'invalidtoken') throw e; }
    if (!items.length) {   // course in "separate groups" mode: ask group by group
      for (const g of await getGroups(c.id, force)) {
        try { items = gradedItems(await api('gradereport_user_get_grade_items', { courseid: c.id, groupid: g.id })); }
        catch (e) { if (e.code === 'invalidtoken') throw e; continue; }
        if (items.length) break;
      }
    }
    if (items.length) { catalog.items[c.id] = items; await saveCatalog(); }
  }
  fill($('item'), items, x => x.itemname + (typeof x.grademax === 'number' ? ` (sur ${x.grademax})` : ''));
  const k = 'item_' + c.id, v = (await chrome.storage.local.get(k))[k], i = items.findIndex(x => x.id === v);
  if (i >= 0) $('item').value = i;
  msg(items.length ? '' : 'Aucune activité notée dans ce cours.', !items.length);
}

async function refreshAll() {
  catalog = { courses: null, items: {}, groups: {} };
  await saveCatalog();
  await loadCourses(true);
  await useCache();
  msg('Cours et activités actualisés.');
}

// ---------- grades (session memory only) ----------
const cacheKey = () => (course() && item()) ? course().id + ':' + item().id : null;
const readCache = async () => (await chrome.storage.session.get('cache')).cache || {};
async function writeCache() {
  const k = cacheKey(); if (!k) return;
  const all = await readCache();
  if (Object.keys(byClass).length) all[k] = byClass; else delete all[k];
  await chrome.storage.session.set({ cache: all });
}

function showClasses() {
  const list = Object.values(byClass).sort((a, b) => a.c.localeCompare(b.c, 'fr', { numeric: true }));
  $('group').innerHTML = '';
  const pl = (n, w) => n + ' ' + w + (n > 1 ? 's' : '');
  list.forEach(p => $('group').add(new Option(`${p.c}  (${pl(p.s.length, 'note')} / ${pl(p.total, 'élève')})`, p.c)));
  $('classBox').classList.toggle('hide', !list.length);
  $('fill').disabled = !list.length;
  $('load').textContent = list.length ? '↻ Recharger les notes depuis Moodle' : '1. Charger les notes depuis Moodle';
  $('load').classList.toggle('primary', !list.length);
}

async function useCache() {
  byClass = {};
  const k = cacheKey(), hit = k && (await readCache())[k];
  if (hit && Object.keys(hit).length) byClass = hit;
  showClasses();
  if (Object.keys(byClass).length) msg('Notes déjà chargées : choisis la classe, ouvre sa grille dans MBN, puis clique sur « 2 ».');
}

async function loadGrades() {
  const c = course(), it = item();
  if (!c || !it) return msg('Choisis un cours et une activité.', true);
  await chrome.storage.local.set({ courseId: c.id, ['item_' + c.id]: it.id });
  msg('Chargement des notes de toutes les classes…');
  const groups = await getGroups(c.id, false);
  const reps = await Promise.all(groups.map(g => api('gradereport_user_get_grade_items', { courseid: c.id, groupid: g.id })));
  byClass = {};
  groups.forEach((g, i) => {
    const p = { c: g.classe, e: it.itemname, b: Number(it.grademax) || 20, s: [], total: 0 };
    for (const ug of reps[i].usergrades || []) {
      p.total++;
      const gi = ug.gradeitems.find(x => x.id === it.id);
      if (gi && gi.graderaw != null) p.s.push([ug.userfullname, String(Math.round(gi.graderaw * 100) / 100).replace('.', ',')]);
    }
    if (p.total) byClass[g.classe] = p;
  });
  if (!Object.keys(byClass).length) { showClasses(); return msg('Aucun élève trouvé pour cette activité.', true); }
  await writeCache();
  showClasses();
  msg('Notes chargées. Choisis la classe, ouvre sa grille dans MBN, puis clique sur « 2 ».');
}

async function fillMbn() {
  const cls = $('group').value, payload = byClass[cls];
  if (!payload || !payload.s.length) return msg('Aucune note à saisir pour ' + cls + '.', true);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = '';
  try { host = new URL(tab.url).hostname; } catch (e) { /* no url */ }
  if (!/(^|\.)monbureaunumerique\.fr$/.test(host)) return msg('Ouvre d\'abord la grille du devoir dans MBN, dans l\'onglet actif.', true);
  const { trusted } = await chrome.storage.local.get('trusted');
  const ok = trusted && await chrome.permissions.contains({ permissions: ['debugger'] });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fillMBN, args: [Object.assign({}, payload, { t: !!ok })] });
  delete byClass[cls];   // a class's grades are forgotten once sent
  await writeCache();
  showClasses();
  window.close();
}

// ---------- connection ----------
const cleanUrl = v => {
  let u = v.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u.replace(/\/(my|login|course|admin)(\/.*)?$/, '');
};

async function connect() {   // the permission request must come first (user gesture)
  if (!$('url').value.trim()) return msg('Saisis l\'adresse de ton Moodle.', true);
  const url = cleanUrl($('url').value);
  const origin = new URL(url).origin;
  if (!(await chrome.permissions.request({ origins: [origin + '/*'] }))) return msg('Autorisation refusée : l\'extension doit pouvoir accéder à ton Moodle.', true);
  await chrome.storage.session.set({ pending: { origin, url } });
  const passport = crypto.getRandomValues(new Uint32Array(1))[0];
  await chrome.tabs.create({ url: url + '/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=' + passport + '&urlscheme=moodlemobile' });
  window.close();
}

async function saveManualToken() {
  if (!$('url').value.trim()) return msg('Saisis d\'abord l\'adresse de ton Moodle.', true);
  const url = cleanUrl($('url').value || '');
  const origin = new URL(url).origin;
  if (!(await chrome.permissions.request({ origins: [origin + '/*'] }))) return msg('Autorisation refusée.', true);
  conf = { url, token: parseToken($('token').value) };
  if (!conf.token) return msg('Jeton vide.', true);
  await chrome.storage.local.set({ conf });
  $('token').value = '';
  show('main');
  await loadCourses(true);
}

async function disconnect() {
  await chrome.storage.local.remove(['conf', 'catalog']);
  await chrome.storage.session.clear();
  conf = null; byClass = {}; catalog = { courses: null, items: {}, groups: {} };
  show('setup');
  msg('Déconnecté. Les notes en mémoire ont été effacées.');
}

// ---------- UI ----------
function show(which) {
  $('setup').classList.toggle('hide', which !== 'setup');
  $('main').classList.toggle('hide', which !== 'main');
  if (which === 'setup' && conf && conf.url) $('url').value = conf.url;
}

const run = fn => async () => {
  document.body.classList.add('busy');
  try { await fn(); }
  catch (e) { msg('❌ ' + e.message, true); if (e.code === 'invalidtoken') $('reconnect').classList.remove('hide'); }
  finally { document.body.classList.remove('busy'); }
};

async function start() {
  const st = await chrome.storage.local.get(['conf', 'catalog']);
  conf = st.conf || null;
  if (st.catalog) catalog = st.catalog;
  $('version').textContent = 'v' + chrome.runtime.getManifest().version;
  const tr = (await chrome.storage.local.get('trusted')).trusted && await chrome.permissions.contains({ permissions: ['debugger'] });
  $('trusted').checked = !!tr; $('trustedHint').classList.toggle('hide', !tr);
  if (!conf) return show('setup');
  show('main');
  await loadCourses(false);
  await useCache();
}

$('connect').onclick = run(connect);
$('url').onkeydown = e => { if (e.key === 'Enter') run(connect)(); };
$('manualLink').onclick = () => $('manual').classList.toggle('hide');
$('save').onclick = run(saveManualToken);
$('reset').onclick = run(disconnect);
$('reconnect').onclick = run(disconnect);
$('refresh').onclick = run(refreshAll);
$('course').onchange = run(async () => { await chrome.storage.local.set({ courseId: course().id }); await loadItems(false); await useCache(); });
$('item').onchange = run(async () => { msg(''); await chrome.storage.local.set({ ['item_' + course().id]: item().id }); await useCache(); });
$('load').onclick = run(loadGrades);
$('fill').onclick = run(fillMbn);
// Compatibility mode: real key presses through the browser's debugger API (optional permission, asked on tick).
$('trusted').onchange = async () => {
  const on = $('trusted').checked;
  if (on && !(await chrome.permissions.request({ permissions: ['debugger'] }))) { $('trusted').checked = false; return; }
  if (!on) await chrome.permissions.remove({ permissions: ['debugger'] }).catch(() => {});
  await chrome.storage.local.set({ trusted: on });
  $('trustedHint').classList.toggle('hide', !on);
};
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.conf && ch.conf.newValue && !conf) run(start)(); });
chrome.action.setBadgeText({ text: '' });
run(start)();
