// LeitDim Lizenzen – Lizenzverwaltung (Hauptprozess)
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, net, safeStorage, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const Lizenz = require('./lizenz');
const { createUpdater } = require('./updater');

const REPO = Lizenz.REPO;
const BAN_PATH = 'lizenzen/gesperrt.json';
let win = null;
let updater = null;

/* ---------- Protokoll ---------- */
let logFile = null;
function log(msg) {
  try {
    if (!logFile) logFile = path.join(app.getPath('userData'), 'lizenzen.log');
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${msg}\n`);
  } catch (e) {}
}
process.on('uncaughtException', (err) => { log('FEHLER ' + (err && err.stack || err)); });

const smokeArg = process.argv.find((a) => a.startsWith('--smoke-test='));
const SMOKE = smokeArg ? smokeArg.slice('--smoke-test='.length).replace(/^"|"$/g, '') : null;

/* ---------- Ablage ---------- */
const ud = () => app.getPath('userData');
const cfgFile = () => path.join(ud(), 'config.json');
const secFile = () => path.join(ud(), 'geheim.bin');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const cfg = () => Object.assign({ dataDir: ud() }, readJson(cfgFile(), {}));
const dbFile = () => path.join(cfg().dataDir, 'leitdim-lizenzen.json');
function loadDb() { return Object.assign({ format: 1, licenses: [] }, readJson(dbFile(), {})); }
function saveDb(db) {
  fs.mkdirSync(path.dirname(dbFile()), { recursive: true });
  const f = dbFile();
  if (fs.existsSync(f)) fs.copyFileSync(f, f + '.bak');
  fs.writeFileSync(f, JSON.stringify(db, null, 2), 'utf8');
}
function loadSecrets() {
  try {
    if (!fs.existsSync(secFile())) return {};
    const buf = fs.readFileSync(secFile());
    return JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8'));
  } catch (e) { log('Geheimnisse nicht lesbar: ' + e.message); return {}; }
}
function saveSecrets(s) {
  const txt = JSON.stringify(s);
  fs.writeFileSync(secFile(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(txt) : Buffer.from(txt, 'utf8'));
}

/* ---------- GitHub ---------- */
async function gh(pathname, opts = {}) {
  const token = loadSecrets().githubToken;
  if (!token) throw new Error('Kein GitHub-Token eingetragen (Einrichtung).');
  const r = await net.fetch(`https://api.github.com${pathname}`, {
    method: opts.method || 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'LeitDim-Lizenzen', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });
  const txt = await r.text();
  let j = null;
  try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = { raw: txt }; }
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(j && j.message) || r.statusText}`);
  return j;
}
async function getBanList() {
  const f = await gh(`/repos/${REPO}/contents/${BAN_PATH}?ref=main`);
  const data = JSON.parse(Buffer.from(f.content, 'base64').toString('utf8'));
  return { data, sha: f.sha };
}
async function putBanList(data, sha, message) {
  const content = Buffer.from(JSON.stringify(data, null, 2) + '\n', 'utf8').toString('base64');
  return gh(`/repos/${REPO}/contents/${BAN_PATH}`, { method: 'PUT', body: { message, content, sha, branch: 'main' } });
}
async function setRevoked(id, revoked, reason) {
  const { data, sha } = await getBanList();
  data.gesperrt = (data.gesperrt || []).filter((x) => (typeof x === 'string' ? x : x.id) !== id);
  if (revoked) data.gesperrt.push({ id, datum: new Date().toISOString().slice(0, 10), grund: reason ? String(reason).slice(0, 80) : '' });
  await putBanList(data, sha, `${revoked ? 'Lizenz gesperrt' : 'Lizenz entsperrt'}: ${id}`);
  return data.gesperrt.length;
}

/* ---------- Fenster ---------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 1060, minHeight: 620, title: 'LeitDim Lizenzen', backgroundColor: '#f3f5f8', show: false,
    icon: path.join(__dirname, 'renderer', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  let shown = false;
  const show = () => { if (shown) return; shown = true; if (!SMOKE) win.maximize(); win.show(); if (SMOKE) runSmoke(); };
  win.once('ready-to-show', show);
  setTimeout(show, 6000);
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}
async function runSmoke() {
  const errs = [];
  win.webContents.on('console-message', (ev) => { if (ev.level === 'error') errs.push(ev.message); });
  try {
    fs.mkdirSync(SMOKE, { recursive: true });
    await new Promise((r) => setTimeout(r, 2000));
    fs.writeFileSync(path.join(SMOKE, 'lizenzen-1.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`document.querySelector('[data-view="setup"]').click(); true`);
    await new Promise((r) => setTimeout(r, 500));
    fs.writeFileSync(path.join(SMOKE, 'lizenzen-2-einrichtung.png'), (await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(SMOKE, 'lizenzen-smoke.json'), JSON.stringify({ ok: errs.length === 0, version: app.getVersion(), arch: process.arch, errors: errs }, null, 2));
    app.exit(errs.length ? 1 : 0);
  } catch (e) { app.exit(1); }
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '&Datei', submenu: [{ label: 'Neue Lizenz', accelerator: 'CmdOrCtrl+N', click: () => win.webContents.send('menu', 'new') }, { type: 'separator' }, { label: 'Datenordner öffnen', click: () => shell.openPath(cfg().dataDir) }, { label: 'Protokoll öffnen', click: () => logFile && shell.openPath(logFile) }, { type: 'separator' }, { label: 'Beenden', role: 'quit' }] },
    { label: '&Ansicht', submenu: [{ role: 'reload', label: 'Neu laden' }, { role: 'zoomIn', label: 'Vergrössern' }, { role: 'zoomOut', label: 'Verkleinern' }, { role: 'resetZoom', label: 'Originalgrösse' }] },
  ]));
}

/* ---------- IPC ---------- */
const handle = (ch, fn) => ipcMain.handle(ch, async (e, ...a) => { try { return { ok: true, data: await fn(...a) } } catch (err) { log(`${ch}: ${err.message}`); return { ok: false, error: err.message }; } });

handle('status', async () => {
  const s = loadSecrets();
  let keyInfo = null;
  if (s.privateKey) {
    const pub = Lizenz.publicFromPrivate(s.privateKey);
    keyInfo = { fingerprint: Lizenz.fingerprint(pub), matches: Lizenz.fingerprint(pub) === Lizenz.fingerprint(Lizenz.PUBLIC_KEY) };
  }
  return { version: app.getVersion(), repo: REPO, dataDir: cfg().dataDir, dbFile: dbFile(), key: keyInfo, appKeyFingerprint: Lizenz.fingerprint(Lizenz.PUBLIC_KEY), hasToken: !!s.githubToken, encryption: safeStorage.isEncryptionAvailable() };
});
handle('db:load', async () => loadDb());
handle('db:save', async (db) => { saveDb(db); return true; });
handle('key:import', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Privaten Signaturschlüssel importieren', filters: [{ name: 'PEM-Schlüssel', extensions: ['pem'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const pem = fs.readFileSync(r.filePaths[0], 'utf8');
  const pub = Lizenz.publicFromPrivate(pem); // wirft bei ungültigem Schlüssel
  const fp = Lizenz.fingerprint(pub);
  if (fp !== Lizenz.fingerprint(Lizenz.PUBLIC_KEY)) throw new Error('Dieser Schlüssel passt nicht zu LeitDim (anderer Fingerabdruck: ' + fp + ').');
  const s = loadSecrets(); s.privateKey = pem; saveSecrets(s);
  log('Signaturschlüssel importiert ' + fp);
  return { fingerprint: fp, file: r.filePaths[0] };
});
handle('key:exportBackup', async () => {
  const s = loadSecrets();
  if (!s.privateKey) throw new Error('Kein Schlüssel vorhanden.');
  const r = await dialog.showSaveDialog(win, { title: 'Sicherung des Signaturschlüssels', defaultPath: 'leitdim-signatur-PRIVAT.pem', filters: [{ name: 'PEM', extensions: ['pem'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, s.privateKey, 'utf8');
  return r.filePath;
});
handle('license:create', async (input) => {
  const s = loadSecrets();
  if (!s.privateKey) throw new Error('Zuerst den Signaturschlüssel importieren (Einrichtung).');
  const n = String(input.n || '').trim();
  if (!n) throw new Error('Name fehlt.');
  const payload = { v: 1, id: Lizenz.makeId(), n, f: String(input.f || '').trim() || undefined, e: String(input.e || '').trim() || undefined, ed: 'pro', ia: new Date().toISOString().slice(0, 10), ex: input.ex || null };
  const key = Lizenz.sign(payload, s.privateKey);
  if (!Lizenz.verify(key).ok) throw new Error('Selbsttest fehlgeschlagen – Schlüssel passt nicht.');
  const db = loadDb();
  const rec = { ...payload, note: String(input.note || ''), key, status: 'aktiv', created: new Date().toISOString() };
  db.licenses.unshift(rec);
  saveDb(db);
  log('Lizenz erstellt ' + payload.id + ' für ' + n);
  return rec;
});
handle('license:saveFile', async (rec) => {
  const safe = String(rec.n || 'Lizenz').replace(/[\\/:*?"<>|]+/g, '').trim();
  const r = await dialog.showSaveDialog(win, { title: 'Lizenzdatei speichern', defaultPath: `${safe} - LeitDim.leitdim-lizenz`, filters: [{ name: 'LeitDim-Lizenz', extensions: ['leitdim-lizenz'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, Lizenz.licenseFileText(rec.key, rec), 'utf8');
  shell.showItemInFolder(r.filePath);
  return r.filePath;
});
handle('license:setRevoked', async (id, revoked, reason) => {
  const count = await setRevoked(id, revoked, reason);
  const db = loadDb();
  const rec = db.licenses.find((x) => x.id === id);
  if (rec) { rec.status = revoked ? 'gesperrt' : 'aktiv'; rec.revokedAt = revoked ? new Date().toISOString() : undefined; rec.revokeReason = revoked ? reason || '' : undefined; saveDb(db); }
  log(`${revoked ? 'gesperrt' : 'entsperrt'}: ${id}`);
  return { count };
});
handle('github:setToken', async (token) => { const s = loadSecrets(); if (token) s.githubToken = String(token).trim(); else delete s.githubToken; saveSecrets(s); return true; });
handle('github:test', async () => {
  const repo = await gh(`/repos/${REPO}`);
  let ban = null;
  try { ban = (await getBanList()).data.gesperrt.length; } catch (e) { ban = 'Datei fehlt: ' + e.message; }
  return { name: repo.full_name, push: !!(repo.permissions && repo.permissions.push), banCount: ban, url: repo.html_url };
});
handle('github:banList', async () => (await getBanList()).data);
handle('github:releases', async () => {
  const rel = await gh(`/repos/${REPO}/releases?per_page=10`);
  let runs = [];
  try { runs = (await gh(`/repos/${REPO}/actions/runs?per_page=6`)).workflow_runs || []; } catch (e) {}
  return { releases: rel.map((r) => ({ tag: r.tag_name, name: r.name, date: r.published_at, url: r.html_url, assets: (r.assets || []).length, downloads: (r.assets || []).reduce((a, x) => a + (x.download_count || 0), 0) })), runs: runs.map((r) => ({ name: r.name, branch: r.head_branch, status: r.status, conclusion: r.conclusion, date: r.created_at, url: r.html_url })) };
});
handle('github:publish', async (version) => {
  const v = String(version || '').trim().replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error('Version im Format 1.2.3 angeben.');
  const ref = await gh(`/repos/${REPO}/git/ref/heads/main`);
  await gh(`/repos/${REPO}/git/refs`, { method: 'POST', body: { ref: `refs/tags/v${v}`, sha: ref.object.sha } });
  log('Version veröffentlicht: v' + v);
  return { tag: 'v' + v, actions: `https://github.com/${REPO}/actions` };
});
handle('settings:chooseDataDir', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Datenordner wählen', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const old = dbFile();
  const c = cfg(); c.dataDir = r.filePaths[0];
  const target = path.join(c.dataDir, 'leitdim-lizenzen.json');
  if (fs.existsSync(old) && !fs.existsSync(target)) fs.copyFileSync(old, target);
  fs.writeFileSync(cfgFile(), JSON.stringify(c, null, 2));
  return c.dataDir;
});
handle('export:csv', async (csv) => {
  const r = await dialog.showSaveDialog(win, { title: 'Lizenzliste exportieren', defaultPath: 'LeitDim-Lizenzen.csv', filters: [{ name: 'CSV (Excel)', extensions: ['csv'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, '﻿' + csv, 'utf8');
  return r.filePath;
});
handle('clipboard', async (txt) => { clipboard.writeText(String(txt)); return true; });
handle('open', async (url) => { if (/^https:\/\//.test(url)) await shell.openExternal(url); return true; });
handle('confirm', async (msg) => dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Ja', 'Abbrechen'], defaultId: 0, cancelId: 1, title: 'LeitDim Lizenzen', message: msg }) === 0);
handle('update:get', async () => (updater ? updater.getState() : { state: 'idle' }));
ipcMain.on('appVersion', (e) => { e.returnValue = app.getVersion(); });

if (!app.requestSingleInstanceLock() && !SMOKE) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  app.whenReady().then(() => {
    log(`--- LeitDim Lizenzen ${app.getVersion()} (${process.arch}) startet`);
    buildMenu();
    createWindow();
    if (!SMOKE) {
      updater = createUpdater({ prefix: 'LeitDim-Lizenzen', folderAsset: false, log, onState: (s) => win && win.webContents.send('update', s) });
      setTimeout(() => updater.check(), 5000);
    }
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => { if (updater) updater.installOnQuit(); });
}
