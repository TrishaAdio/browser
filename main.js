const { app, BrowserWindow, ipcMain, session, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

const PARTITION = 'persist:ipbrowser';
const CONFIG_FILE = () => path.join(app.getPath('userData'), 'ip-config.json');

let mainWindow = null;
let proxyCreds = null; // { username, password } used for proxy auth challenges

// ---------- helpers ----------
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function browserSession() {
  return session.fromPartition(PARTITION);
}

async function applyProxy(cfg) {
  const ses = browserSession();
  if (!cfg || cfg.mode === 'direct') {
    proxyCreds = null;
    await ses.setProxy({ mode: 'direct' });
  } else {
    if (!IPV4_RE.test(cfg.ip || '')) throw new Error('Invalid IPv4 address');
    const port = Number(cfg.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port (1-65535)');
    const scheme = cfg.scheme === 'socks5' ? 'socks5' : cfg.scheme === 'socks4' ? 'socks4' : 'http';
    proxyCreds = cfg.username ? { username: cfg.username, password: cfg.password || '' } : null;
    await ses.setProxy({
      mode: 'fixed_servers',
      proxyRules: `${scheme}://${cfg.ip}:${port}`,
      proxyBypassRules: '<local>'
    });
  }
  // Drop keep-alive sockets so the new route is used immediately
  await ses.closeAllConnections();
}

async function lookupPublicIp() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await browserSession().fetch('https://api.ipify.org?format=json', { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.ip;
  } finally {
    clearTimeout(timer);
  }
}

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE(), 'utf8'));
    if (raw.passwordEnc && safeStorage.isEncryptionAvailable()) {
      raw.password = safeStorage.decryptString(Buffer.from(raw.passwordEnc, 'base64'));
    }
    delete raw.passwordEnc;
    return raw;
  } catch {
    return null;
  }
}

function saveConfig(cfg) {
  const out = { ...cfg };
  delete out.password;
  if (cfg.password && safeStorage.isEncryptionAvailable()) {
    out.passwordEnc = safeStorage.encryptString(cfg.password).toString('base64');
  }
  fs.mkdirSync(path.dirname(CONFIG_FILE()), { recursive: true });
  fs.writeFileSync(CONFIG_FILE(), JSON.stringify(out, null, 2));
}

// ---------- window ----------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: '#0d0f14',
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0d0f14', symbolColor: '#e6e8ef', height: 42 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// Lock down every <webview>: no preload, no node, always our proxied partition
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (_ev, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    params.partition = PARTITION;
  });

  if (contents.getType() === 'webview') {
    // Open popups / target=_blank as new tabs
    contents.setWindowOpenHandler(({ url }) => {
      if (mainWindow) mainWindow.webContents.send('open-tab', url);
      return { action: 'deny' };
    });

    // Forward browser shortcuts even when a web page has keyboard focus
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || !mainWindow) return;
      const k = input.key.toLowerCase();
      const map =
        input.control && k === 't' ? 'new-tab' :
        input.control && k === 'w' ? 'close-tab' :
        (input.control && k === 'r') || k === 'f5' ? 'reload' :
        input.control && k === 'l' ? 'focus-url' :
        input.alt && k === 'arrowleft' ? 'back' :
        input.alt && k === 'arrowright' ? 'forward' :
        input.control && k === 'tab' ? 'next-tab' : null;
      if (map) {
        event.preventDefault();
        mainWindow.webContents.send('shortcut', map);
      }
    });
  }
});

// Answer proxy authentication challenges with the configured credentials
app.on('login', (event, _wc, _details, authInfo, callback) => {
  if (authInfo.isProxy && proxyCreds) {
    event.preventDefault();
    callback(proxyCreds.username, proxyCreds.password);
  }
});

// ---------- IPC ----------
ipcMain.handle('config:load', () => loadConfig());

ipcMain.handle('proxy:apply', async (_e, cfg) => {
  try {
    await applyProxy(cfg);
    if (cfg.remember) saveConfig(cfg);
    else if (fs.existsSync(CONFIG_FILE())) fs.unlinkSync(CONFIG_FILE());
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('proxy:test', async (_e, cfg) => {
  try {
    await applyProxy(cfg);
    const ip = await lookupPublicIp();
    return { ok: true, ip };
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'Timed out — proxy did not respond' : err.message;
    return { ok: false, error: msg };
  }
});

ipcMain.handle('ip:public', async () => {
  try {
    return { ok: true, ip: await lookupPublicIp() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
