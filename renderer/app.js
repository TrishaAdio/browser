'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const HOME = 'ipb://home';
const SEARCH = 'https://www.google.com/search?q=';

/* ============================================================
 *  SETUP SCREEN
 * ============================================================ */
const setup = $('#setup');
const modeSeg = $('#modeSeg');
const proxyFields = $('#proxyFields');
const octets = $$('#octets input');
const portIn = $('#port');
const userIn = $('#user');
const passIn = $('#pass');
const rememberIn = $('#remember');
const statusEl = $('#status');
const testBtn = $('#testBtn');
const startBtn = $('#startBtn');

let mode = 'proxy';
let scheme = 'http';
let browserStarted = false;
let activeConfig = null;

function setMode(m) {
  mode = m;
  modeSeg.dataset.mode = m;
  $$('button', modeSeg).forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  proxyFields.classList.toggle('collapsed', m === 'direct');
  hideStatus();
}
$$('button', modeSeg).forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

function setScheme(s) {
  scheme = s;
  $$('#schemeChips button').forEach(b => b.classList.toggle('active', b.dataset.scheme === s));
}
$$('#schemeChips button').forEach(b => b.addEventListener('click', () => setScheme(b.dataset.scheme)));

$('#authToggle').addEventListener('click', () => {
  const box = $('#authBox');
  box.classList.toggle('open');
  $('#authToggle').textContent = box.classList.contains('open')
    ? '− Hide username & password' : '+ Add username & password (optional)';
});

// --- smart octet inputs: auto-advance, backspace, paste "1.2.3.4:8080" ---
function fillFromString(str) {
  const m = String(str).trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::(\d{1,5}))?$/);
  if (!m) return false;
  octets.forEach((o, i) => (o.value = m[i + 1]));
  if (m[5]) portIn.value = m[5];
  portIn.focus();
  return true;
}

octets.forEach((inp, i) => {
  inp.addEventListener('input', () => {
    inp.value = inp.value.replace(/\D/g, '').slice(0, 3);
    if (Number(inp.value) > 255) shake($('#octets'));
    if (inp.value.length === 3) (octets[i + 1] || portIn).focus();
  });
  inp.addEventListener('keydown', e => {
    if ((e.key === '.' || e.key === ' ') && inp.value) {
      e.preventDefault();
      (octets[i + 1] || portIn).focus();
    } else if (e.key === 'Backspace' && !inp.value && i > 0) {
      octets[i - 1].focus();
    } else if (e.key === 'ArrowRight' && inp.selectionStart === inp.value.length) {
      (octets[i + 1] || portIn).focus();
    } else if (e.key === 'ArrowLeft' && inp.selectionStart === 0 && i > 0) {
      octets[i - 1].focus();
    } else if (e.key === ':') {
      e.preventDefault();
      portIn.focus();
    }
  });
  inp.addEventListener('paste', e => {
    if (fillFromString(e.clipboardData.getData('text'))) e.preventDefault();
  });
  inp.addEventListener('focus', () => inp.select());
});
portIn.addEventListener('input', () => (portIn.value = portIn.value.replace(/\D/g, '').slice(0, 5)));
portIn.addEventListener('keydown', e => {
  if (e.key === 'Backspace' && !portIn.value) octets[3].focus();
});

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 500);
}

function showStatus(type, msg) {
  statusEl.className = `status show ${type}`;
  statusEl.textContent = msg;
}
function hideStatus() { statusEl.className = 'status'; }

function readConfig() {
  if (mode === 'direct') return { mode: 'direct', remember: rememberIn.checked };
  const parts = octets.map(o => o.value);
  const validOctets = parts.every(p => p !== '' && Number(p) <= 255);
  if (!validOctets) { shake($('#octets')); showStatus('err', 'Please enter a valid IPv4 address (0–255 in each box).'); return null; }
  const port = Number(portIn.value);
  if (!port || port > 65535) { shake($('.port')); showStatus('err', 'Please enter a valid port (1–65535).'); return null; }
  return {
    mode: 'proxy',
    scheme,
    ip: parts.map(Number).join('.'),
    port,
    username: userIn.value.trim(),
    password: passIn.value,
    remember: rememberIn.checked
  };
}

function busy(btn, on) {
  btn.disabled = on;
  btn.classList.toggle('loading', on);
}

testBtn.addEventListener('click', async () => {
  const cfg = readConfig();
  if (!cfg) return;
  busy(testBtn, true);
  showStatus('info', 'Testing connection…');
  const res = await window.api.testProxy(cfg);
  busy(testBtn, false);
  if (res.ok) showStatus('ok', `✓ Connected! Websites will see your IP as ${res.ip}`);
  else showStatus('err', `✕ Connection failed: ${res.error}`);
});

startBtn.addEventListener('click', start);
setup.addEventListener('keydown', e => {
  if (e.key === 'Enter') start();
  if (e.key === 'Escape' && browserStarted) closeSetup();
});

async function start() {
  const cfg = readConfig();
  if (!cfg) return;
  busy(startBtn, true);
  const res = await window.api.applyProxy(cfg);
  busy(startBtn, false);
  if (!res.ok) { showStatus('err', res.error); return; }
  activeConfig = cfg;
  closeSetup();
  if (!browserStarted) {
    browserStarted = true;
    $('#browser').classList.remove('hidden');
    newTab(HOME);
  } else {
    toast(cfg.mode === 'direct' ? 'Switched to direct connection' : `Now browsing via ${cfg.ip}:${cfg.port}`);
    tabs.forEach(t => t.url !== HOME && t.view.reload());
  }
  refreshIp();
}

function closeSetup() {
  setup.classList.add('leaving');
  setTimeout(() => setup.classList.add('hidden'), 600);
}

function openSetup() {
  hideStatus();
  setup.classList.remove('hidden');
  void setup.offsetWidth;
  setup.classList.remove('leaving');
  // replay entrance animation
  const card = $('.card', setup);
  card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
}

// restore saved config
(async () => {
  const saved = await window.api.loadConfig();
  if (saved) {
    setMode(saved.mode || 'proxy');
    if (saved.scheme) setScheme(saved.scheme);
    if (saved.ip) fillFromString(saved.ip);
    if (saved.port) portIn.value = saved.port;
    if (saved.username) { userIn.value = saved.username; $('#authToggle').click(); }
    if (saved.password) passIn.value = saved.password;
  }
  (mode === 'proxy' ? octets[0] : startBtn).focus();
})();

/* ============================================================
 *  BROWSER
 * ============================================================ */
const tabsEl = $('#tabs');
const viewsEl = $('#views');
const urlIn = $('#url');
const progress = $('#progress');
const ipBadge = $('#ipBadge');
const ipText = $('#ipText');

let tabs = [];
let active = null;
let publicIp = null;
let seq = 0;

function normalize(input) {
  const s = input.trim();
  if (!s) return null;
  if (/^(https?|file|about|data):/i.test(s)) return s;
  if (/^localhost(:\d+)?(\/|$)/i.test(s) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(s)) return 'http://' + s;
  if (/^[^\s]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(s)) return 'https://' + s;
  return SEARCH + encodeURIComponent(s);
}

function makeHomePage(tab) {
  const el = document.createElement('div');
  el.className = 'home';
  const sites = [
    ['Google', 'https://www.google.com'], ['YouTube', 'https://www.youtube.com'],
    ['Wikipedia', 'https://www.wikipedia.org'], ['GitHub', 'https://github.com'],
    ['What is my IP', 'https://whatismyipaddress.com']
  ];
  el.innerHTML = `
    <div class="home-inner">
      <h2>Where to?</h2>
      <form><input placeholder="Search or enter address" spellcheck="false" /></form>
      <div class="ipline">Browsing as <b class="home-ip">${publicIp || 'checking…'}</b></div>
      <div class="shortcuts">
        ${sites.map(([n, u], i) => `
          <button data-url="${u}" style="animation-delay:${0.22 + i * 0.05}s">
            <img src="https://www.google.com/s2/favicons?sz=64&domain=${new URL(u).hostname}" alt="" />
            ${n}
          </button>`).join('')}
      </div>
    </div>`;
  const input = $('input', el);
  $('form', el).addEventListener('submit', e => {
    e.preventDefault();
    const u = normalize(input.value);
    if (u) navigate(tab, u);
  });
  $$('.shortcuts button', el).forEach(b => b.addEventListener('click', () => navigate(tab, b.dataset.url)));
  return el;
}

function newTab(url = HOME, focus = true) {
  const tab = { id: ++seq, url, title: 'New Tab', favicon: null, loading: false, view: null, home: null };

  // tab button
  const btn = document.createElement('div');
  btn.className = 'tab';
  btn.innerHTML = `<span class="favbox"><span class="fav"></span></span><span class="title">New Tab</span>
    <button class="x" title="Close (Ctrl+W)"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
  btn.addEventListener('mousedown', e => { if (e.button === 0 && !e.target.closest('.x')) activate(tab); });
  btn.addEventListener('auxclick', e => { if (e.button === 1) closeTab(tab); });
  $('.x', btn).addEventListener('click', e => { e.stopPropagation(); closeTab(tab); });
  tab.btn = btn;
  tabsEl.appendChild(btn);

  // webview
  const wv = document.createElement('webview');
  wv.setAttribute('partition', 'persist:ipbrowser');
  wv.setAttribute('allowpopups', '');
  wv.setAttribute('src', 'about:blank');
  tab.view = wv;
  viewsEl.appendChild(wv);
  wireWebview(tab);

  // home page
  tab.home = makeHomePage(tab);
  viewsEl.appendChild(tab.home);

  tabs.push(tab);
  if (focus) activate(tab);
  if (url !== HOME) navigate(tab, url);
  return tab;
}

function wireWebview(tab) {
  const wv = tab.view;
  wv.addEventListener('dom-ready', () => { tab.ready = true; }, { once: true });
  wv.addEventListener('did-start-loading', () => { tab.loading = true; renderTab(tab); if (tab === active) startProgress(); });
  wv.addEventListener('did-stop-loading', () => { tab.loading = false; renderTab(tab); if (tab === active) { endProgress(); syncToolbar(); } });
  wv.addEventListener('page-title-updated', e => { tab.title = e.title; renderTab(tab); });
  wv.addEventListener('page-favicon-updated', e => { tab.favicon = e.favicons[0]; renderTab(tab); });
  const onNav = e => {
    if (e.url === 'about:blank') return;
    if (e.isMainFrame === false) return;
    tab.url = e.url;
    showView(tab);
    if (tab === active) syncToolbar();
  };
  wv.addEventListener('did-navigate', onNav);
  wv.addEventListener('did-navigate-in-page', onNav);
  wv.addEventListener('did-fail-load', e => {
    if (e.isMainFrame && e.errorCode !== -3) toast(`Couldn't load page: ${e.errorDescription}`);
  });
}

function navigate(tab, url) {
  if (url === HOME) {
    tab.url = HOME; tab.title = 'New Tab'; tab.favicon = null;
    showView(tab); renderTab(tab); syncToolbar();
    return;
  }
  tab.url = url;
  tab.title = url.replace(/^https?:\/\//, '');
  renderTab(tab);
  showView(tab);
  if (tab.ready) tab.view.loadURL(url).catch(() => {});
  else tab.view.addEventListener('dom-ready', () => tab.view.loadURL(url).catch(() => {}), { once: true });
  if (tab === active) { urlIn.value = url; urlIn.blur(); }
}

function showView(tab) {
  const isHome = tab.url === HOME;
  tab.home.classList.toggle('shown', tab === active && isHome);
  tab.view.classList.toggle('shown', tab === active && !isHome);
}

function renderTab(tab) {
  const box = $('.favbox', tab.btn);
  box.innerHTML = '';
  if (tab.loading) {
    box.innerHTML = '<span class="fav spin"></span>';
  } else if (tab.favicon) {
    const img = document.createElement('img');
    img.className = 'fav';
    img.src = tab.favicon;
    img.onerror = () => img.remove();
    box.appendChild(img);
  } else {
    box.innerHTML = '<span class="fav"></span>';
  }
  $('.title', tab.btn).textContent = tab.title || 'New Tab';
  tab.btn.title = tab.title;
}

function activate(tab) {
  if (active === tab) return;
  const prev = active;
  active = tab;
  tabs.forEach(t => { t.btn.classList.toggle('active', t === tab); });
  if (prev) { prev.home.classList.remove('shown'); prev.view.classList.remove('shown'); }
  showView(tab);
  syncToolbar();
  if (tab.loading) startProgress(); else endProgress(true);
  if (tab.url === HOME) setTimeout(() => $('input', tab.home).focus(), 50);
}

function closeTab(tab) {
  const idx = tabs.indexOf(tab);
  if (idx < 0) return;
  tabs.splice(idx, 1);
  tab.btn.classList.add('closing');
  tab.home.classList.remove('shown');
  tab.view.classList.remove('shown');
  setTimeout(() => { tab.btn.remove(); tab.view.remove(); tab.home.remove(); }, 260);
  if (!tabs.length) { active = null; newTab(HOME); return; }
  if (active === tab) { active = null; activate(tabs[Math.min(idx, tabs.length - 1)]); }
}

function syncToolbar() {
  if (!active) return;
  const isHome = active.url === HOME;
  if (document.activeElement !== urlIn) urlIn.value = isHome ? '' : active.url;
  let canFwd = false;
  try { canFwd = !isHome && active.view.canGoForward(); } catch {}
  $('#backBtn').disabled = isHome; // falls back to the home page if no history
  $('#fwdBtn').disabled = !canFwd;
}

let progressTimer;
function startProgress() {
  clearTimeout(progressTimer);
  progress.className = 'progress';
  void progress.offsetWidth;
  progress.className = 'progress run';
}
function endProgress(instant) {
  if (instant) { progress.className = 'progress'; return; }
  progress.className = 'progress done';
  progressTimer = setTimeout(() => (progress.className = 'progress'), 700);
}

// toolbar actions
$('#omnibox').addEventListener('submit', e => {
  e.preventDefault();
  const u = normalize(urlIn.value);
  if (u && active) navigate(active, u);
});
urlIn.addEventListener('focus', () => setTimeout(() => urlIn.select(), 0));
$('#backBtn').addEventListener('click', () => {
  if (!active) return;
  try { if (active.view.canGoBack()) return active.view.goBack(); } catch {}
  navigate(active, HOME);
});
$('#fwdBtn').addEventListener('click', () => { try { active.view.goForward(); } catch {} });
$('#reloadBtn').addEventListener('click', reload);
$('#homeBtn').addEventListener('click', () => active && navigate(active, HOME));
$('#newTabBtn').addEventListener('click', () => newTab(HOME));
ipBadge.addEventListener('click', openSetup);

function reload() {
  const b = $('#reloadBtn');
  b.classList.remove('spinning'); void b.offsetWidth; b.classList.add('spinning');
  if (active && active.url !== HOME) active.view.reload();
}

// keyboard shortcuts (host page + forwarded from webviews by main process)
function handleShortcut(key) {
  switch (key) {
    case 'new-tab': newTab(HOME); break;
    case 'close-tab': active && closeTab(active); break;
    case 'reload': reload(); break;
    case 'focus-url': urlIn.focus(); break;
    case 'back': $('#backBtn').click(); break;
    case 'forward': $('#fwdBtn').click(); break;
    case 'next-tab': if (tabs.length) activate(tabs[(tabs.indexOf(active) + 1) % tabs.length]); break;
    case 'ip-config': openSetup(); break;
  }
}
window.addEventListener('keydown', e => {
  if (!browserStarted || !setup.classList.contains('hidden')) return;
  const k = e.key.toLowerCase();
  const map =
    e.ctrlKey && k === 't' ? 'new-tab' :
    e.ctrlKey && k === 'w' ? 'close-tab' :
    (e.ctrlKey && k === 'r') || k === 'f5' ? 'reload' :
    (e.ctrlKey && k === 'l') ? 'focus-url' :
    e.altKey && k === 'arrowleft' ? 'back' :
    e.altKey && k === 'arrowright' ? 'forward' :
    e.ctrlKey && k === 'tab' ? 'next-tab' : null;
  if (map) { e.preventDefault(); handleShortcut(map); }
});
window.api.onShortcut && window.api.onShortcut(handleShortcut);
window.api.onOpenTab(url => newTab(url));

// public IP indicator
async function refreshIp() {
  ipBadge.className = 'ip-badge';
  ipText.textContent = 'Checking IP…';
  const res = await window.api.publicIp();
  if (res.ok) {
    publicIp = res.ip;
    ipBadge.className = 'ip-badge ok';
    const via = activeConfig && activeConfig.mode === 'proxy' ? ` · ${activeConfig.scheme.toUpperCase()}` : ' · Direct';
    ipText.textContent = res.ip + via;
  } else {
    publicIp = null;
    ipBadge.className = 'ip-badge err';
    ipText.textContent = 'No connection';
  }
  $$('.home-ip').forEach(b => (b.textContent = publicIp || 'unreachable'));
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
