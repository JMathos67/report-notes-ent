// Catches the token Moodle hands to its mobile app. After login, launch.php answers with a redirect
// "Location: moodlemobile://token=BASE64(sitehash:::token[:::privatetoken])". The header is read here,
// the token is stored locally (chrome.storage.local) and the login tab is closed. Nothing is sent anywhere.
chrome.webRequest.onHeadersReceived.addListener(async details => {
  const loc = (details.responseHeaders || []).find(h => h.name.toLowerCase() === 'location');
  if (!loc || !/^moodlemobile:\/\/token=/i.test(loc.value || '')) return;
  const { pending } = await chrome.storage.session.get('pending');
  if (!pending || new URL(details.url).origin !== pending.origin) return;   // only the Moodle the user asked for
  try {
    const b64 = loc.value.match(/token=([A-Za-z0-9+/=_-]+)/)[1].replace(/-/g, '+').replace(/_/g, '/');
    const token = atob(b64 + '='.repeat((4 - b64.length % 4) % 4)).split(':::')[1];
    if (!token) throw new Error('jeton absent');
    await chrome.storage.local.set({ conf: { url: pending.url || pending.origin, token } });
    await chrome.storage.session.remove('pending');
    chrome.action.setBadgeBackgroundColor({ color: '#2e7d32' });
    chrome.action.setBadgeText({ text: '✓' });
    if (details.tabId >= 0) chrome.tabs.remove(details.tabId).catch(() => {});
  } catch (e) {
    console.warn('Report de notes vers l\'ENT : jeton illisible', e);
  }
}, { urls: ['https://*/admin/tool/mobile/launch.php*'] }, ['responseHeaders']);

// Enter sent from the page's own context (MAIN world): some browsers ignore key events built in the extension's
// isolated world. Only accepted from a tab showing MBN, and only to press Enter in the note field.
function pressEnterMain(how) {
  const el = document.querySelector('#js-eval-eleve__note');
  if (!el) return null;
  el.focus();
  const types = ['keydown', 'keypress', 'keyup'];
  const $ = window.jQuery || window.$;
  const diag = { jq: !!($ && $.fn), kc: new KeyboardEvent('keydown', { keyCode: 13 }).keyCode };
  if (how === 'native') {
    // Some browsers ignore keyCode/which in the constructor: force them on the event itself.
    types.forEach(t => {
      const ev = new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, charCode: t === 'keypress' ? 13 : 0, bubbles: true, cancelable: true, composed: true, view: window });
      [['keyCode', 13], ['which', 13], ['charCode', t === 'keypress' ? 13 : 0]].forEach(([k, v]) => { if (ev[k] !== v) { try { Object.defineProperty(ev, k, { get: () => v }); } catch (e) { /* read-only */ } } });
      el.dispatchEvent(ev);
    });
  } else if ($ && $.fn) {
    types.forEach(t => $(el).trigger($.Event(t, { which: 13, keyCode: 13, key: 'Enter' })));
  }
  return diag;
}
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (!m || m.type !== 'nmm-enter' || !sender.tab || !/(^|\.)monbureaunumerique\.fr$/.test(new URL(sender.tab.url || sender.url).hostname)) return;
  chrome.scripting.executeScript({ target: { tabId: sender.tab.id, allFrames: true }, world: 'MAIN', func: pressEnterMain, args: [m.how === 'jquery' ? 'jquery' : 'native'] })
    .then(res => reply({ ok: true, d: (res || []).map(x => x.result).filter(Boolean)[0] || null }), e => reply({ ok: false, error: String(e) }));
  return true;
});
