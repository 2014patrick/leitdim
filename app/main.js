// LeitDim – Electron-Hauptprozess
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const Lizenz = require('./lizenz');
const { createUpdater } = require('./updater');

/* ---------- Protokoll ---------- */
let logFile = null;
function log(msg) {
  try {
    if (!logFile) {
      logFile = path.join(app.getPath('userData'), 'leitdim.log');
      if (fs.existsSync(logFile) && fs.statSync(logFile).size > 1e6) fs.renameSync(logFile, logFile + '.alt');
    }
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${msg}\n`);
  } catch (e) {}
}
process.on('uncaughtException', (err) => { log('FEHLER ' + (err && err.stack || err)); try { if (!SMOKE) dialog.showErrorBox('LeitDim – Fehler', String(err && err.stack || err)); } catch (e) {} });

/* ---------- Smoke-Test (CI) ---------- */
const smokeArg = process.argv.find((a) => a.startsWith('--smoke-test='));
const SMOKE = smokeArg ? smokeArg.slice('--smoke-test='.length).replace(/^"|"$/g, '') : null;
const smoke = { started: Date.now(), events: [], errors: [] };
const mark = (e) => { smoke.events.push({ t: Date.now() - smoke.started, e }); log('Start: ' + e); };

let win = null;
let splash = null;
let dirty = false;
let allowClose = false;
let updater = null;

function startupFile() {
  const args = process.argv.slice(app.isPackaged ? 1 : 2).filter((a) => !a.startsWith('--'));
  const f = args.find((a) => /\.(leitdim|json)$/i.test(a) && fs.existsSync(a));
  if (!f) return null;
  try { return { path: f, content: fs.readFileSync(f, 'utf8') }; } catch (e) { return null; }
}
function send(cmd) { if (win && !win.isDestroyed()) win.webContents.send('menu', cmd); }

/* ---------- Lizenz ---------- */
const licFile = () => path.join(app.getPath('userData'), 'lizenz.json');
const banFile = () => path.join(app.getPath('userData'), 'sperrliste.json');
let licState = { state: 'test' };
function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function evalLicense() {
  const stored = readJson(licFile(), null);
  if (!stored || !stored.key) { licState = { state: 'test' }; return licState; }
  const v = Lizenz.verify(stored.key);
  if (!v.ok) { licState = { state: 'invalid', error: v.error }; return licState; }
  const ban = readJson(banFile(), { ids: [], checked: null });
  if ((ban.ids || []).includes(v.payload.id)) { licState = { state: 'revoked', payload: v.payload, checked: ban.checked }; return licState; }
  if (Lizenz.isExpired(v.payload)) { licState = { state: 'expired', payload: v.payload }; return licState; }
  licState = { state: 'licensed', payload: v.payload, checked: ban.checked };
  return licState;
}
async function refreshBanList() {
  if (SMOKE) return;
  try {
    const r = await net.fetch(Lizenz.SPERRLISTE_URL + '?t=' + Date.now(), { headers: { 'User-Agent': 'LeitDim/' + app.getVersion() }, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const ids = (j.gesperrt || []).map((x) => (typeof x === 'string' ? x : x.id)).filter(Boolean);
    fs.writeFileSync(banFile(), JSON.stringify({ ids, checked: new Date().toISOString() }));
    const before = licState.state;
    evalLicense();
    if (before !== licState.state && win) win.webContents.send('license', licState);
    log(`Sperrliste geprüft (${ids.length} gesperrt) – Lizenz: ${licState.state}`);
  } catch (e) { log('Sperrliste nicht erreichbar: ' + e.message); }
}

/* ---------- Menü ---------- */
function buildMenu() {
  const t = [
    { label: '&Datei', submenu: [
      { label: 'Neues Projekt', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
      { label: 'Öffnen…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
      { type: 'separator' },
      { label: 'Speichern', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
      { label: 'Speichern unter…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('saveAs') },
      { type: 'separator' },
      { label: 'Bericht als PDF…', accelerator: 'CmdOrCtrl+P', click: () => send('report') },
      { label: 'Kabelliste als CSV…', click: () => send('csv') },
      { type: 'separator' },
      { label: 'Beenden', accelerator: 'Alt+F4', click: () => win && win.close() },
    ] },
    { label: '&Stromkreis', submenu: [
      { label: 'Neuer Stromkreis', accelerator: 'CmdOrCtrl+T', click: () => send('addCircuit') },
      { label: 'Duplizieren', accelerator: 'CmdOrCtrl+D', click: () => send('dupCircuit') },
      { label: 'Löschen', click: () => send('delCircuit') },
    ] },
    { label: '&Extras', submenu: [
      { label: 'Rechenparameter…', click: () => send('settings') },
      { label: 'Lizenz…', click: () => send('license') },
      { label: 'Nach Updates suchen', click: () => updater && updater.check() },
      { type: 'separator' },
      { label: 'Protokoll öffnen', click: () => logFile && shell.openPath(logFile) },
    ] },
    { label: '&Ansicht', submenu: [
      { label: 'Vergrössern', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
      { label: 'Verkleinern', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
      { label: 'Originalgrösse', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
      { type: 'separator' },
      { label: 'Vollbild', role: 'togglefullscreen' },
    ] },
    { label: '&Hilfe', submenu: [
      { label: 'Rechengrundlagen', accelerator: 'F1', click: () => send('help') },
      { type: 'separator' },
      { label: 'Über LeitDim', click: () => send('about') },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}

/* ---------- Startbildschirm ---------- */
let splashShownAt = 0;
function createSplash() {
  try {
    splash = new BrowserWindow({
      width: 588, height: 368, frame: false, transparent: true, resizable: false, show: false,
      alwaysOnTop: !SMOKE, skipTaskbar: true, center: true, title: 'LeitDim', icon: path.join(__dirname, 'renderer', 'icon.png'),
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    });
    splash.loadFile(path.join(__dirname, 'renderer', 'splash.html'), { query: { v: app.getVersion() } }).catch((e) => log('Splash-Ladefehler: ' + e.message));
    splash.once('ready-to-show', () => { if (splash) { splash.show(); splashShownAt = Date.now(); mark('splash sichtbar'); } });
    splash.webContents.on('did-fail-load', () => { log('Splash konnte nicht geladen werden'); closeSplash(); });
    splash.on('closed', () => { splash = null; });
  } catch (e) { log('Splash-Fehler: ' + e.message); splash = null; }
}
function closeSplash() {
  // blockiert nie: Animation anstossen, dann sicher schliessen
  const s = splash;
  if (!s) return;
  try { s.webContents.executeJavaScript('window.ldSplashDone && window.ldSplashDone()').catch(() => {}); } catch (e) {}
  setTimeout(() => { try { if (!s.isDestroyed()) s.destroy(); } catch (e) {} }, 550);
}

/* ---------- Hauptfenster ---------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1000, minHeight: 620,
    title: 'LeitDim', icon: path.join(__dirname, 'renderer', 'icon.png'), backgroundColor: '#f3f5f8', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html')).catch((e) => log('Ladefehler Hauptfenster: ' + e.message));
  let shown = false;
  const showMain = (why) => {
    if (shown || !win || win.isDestroyed()) return;
    shown = true;
    mark('Hauptfenster anzeigen (' + why + ')');
    try { if (!SMOKE) win.maximize(); win.show(); win.focus(); } catch (e) { log('show-Fehler: ' + e.message); }
    closeSplash();
    if (SMOKE) runSmoke();
  };
  win.once('ready-to-show', () => {
    mark('Hauptfenster bereit');
    const minSplash = 1300;
    const wait = splash && splashShownAt ? Math.max(0, minSplash - (Date.now() - splashShownAt)) : 0;
    setTimeout(() => showMain('bereit'), Math.min(wait, 1300));
  });
  setTimeout(() => showMain('Zeitlimit'), 7000); // spätestens jetzt, egal was passiert
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('render-process-gone', (e, d) => { log('Oberfläche beendet: ' + d.reason); smoke.errors.push('render-process-gone ' + d.reason); if (!SMOKE) dialog.showErrorBox('LeitDim', `Die Oberfläche wurde beendet (${d.reason}). Bitte LeitDim neu starten.`); });
  win.webContents.on('console-message', (ev) => { const lvl = ev.level; if (lvl === 'error' || lvl === 3) { smoke.errors.push(String(ev.message)); log('Konsole: ' + ev.message); } });
  win.webContents.on('preload-error', (e, p, err) => { log('Preload-Fehler: ' + err.message); smoke.errors.push('preload ' + err.message); });
  win.on('close', (e) => {
    if (allowClose || !dirty || SMOKE) return;
    e.preventDefault();
    const r = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Speichern', 'Nicht speichern', 'Abbrechen'], defaultId: 0, cancelId: 2, title: 'LeitDim', message: 'Änderungen am Projekt speichern?' });
    if (r === 0) send('saveThenClose');
    else if (r === 1) { allowClose = true; win.close(); }
  });
}

/* ---------- Smoke-Test ---------- */
async function runSmoke() {
  const out = SMOKE;
  const done = (ok) => {
    const res = { ok, version: app.getVersion(), arch: process.arch, platform: process.platform, portable: !!process.env.PORTABLE_EXECUTABLE_FILE, license: licState.state, events: smoke.events, errors: smoke.errors };
    try { fs.writeFileSync(path.join(out, 'smoke.json'), JSON.stringify(res, null, 2)); } catch (e) {}
    log('Smoke-Test ' + (ok ? 'OK' : 'FEHLER'));
    app.exit(ok ? 0 : 1);
  };
  const guard = setTimeout(() => { smoke.errors.push('Zeitüberschreitung im Smoke-Test'); done(false); }, 60000);
  try {
    fs.mkdirSync(out, { recursive: true });
    await new Promise((r) => setTimeout(r, 2200));
    const info = await win.webContents.executeJavaScript('window.__ldSmoke ? window.__ldSmoke() : null');
    smoke.ui = info;
    fs.writeFileSync(path.join(out, 'ui.json'), JSON.stringify(info, null, 2));
    fs.writeFileSync(path.join(out, '1-hauptfenster.png'), (await win.webContents.capturePage()).toPNG());
    for (const [i, tab] of [['2', 'du'], ['3', 'compare'], ['4', 'calc']]) {
      await win.webContents.executeJavaScript(`document.querySelector('[data-tab="${tab}"]').click(); true`);
      await new Promise((r) => setTimeout(r, 500));
      fs.writeFileSync(path.join(out, `${i}-${tab}.png`), (await win.webContents.capturePage()).toPNG());
    }
    await win.webContents.executeJavaScript(`window.__ldBuildReport && window.__ldBuildReport(); true`);
    await new Promise((r) => setTimeout(r, 400));
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true });
    fs.writeFileSync(path.join(out, '5-bericht.pdf'), pdf);
    clearTimeout(guard);
    const ok = !!(info && info.circuits > 0 && info.pick) && smoke.errors.length === 0;
    done(ok);
  } catch (e) {
    smoke.errors.push('Smoke: ' + e.message);
    clearTimeout(guard);
    done(false);
  }
}

/* ---------- IPC ---------- */
const FILTER = [{ name: 'LeitDim-Projekt', extensions: ['leitdim'] }, { name: 'JSON', extensions: ['json'] }];
ipcMain.handle('saveProject', async (e, { path: p, content, defaultName }) => {
  let target = p && /\.(leitdim|json)$/i.test(p) && path.isAbsolute(p) ? p : null;
  if (!target) {
    const r = await dialog.showSaveDialog(win, { title: 'Projekt speichern', defaultPath: defaultName, filters: FILTER });
    if (r.canceled || !r.filePath) return null;
    target = r.filePath;
  }
  fs.writeFileSync(target, content, 'utf8');
  return { path: target };
});
ipcMain.handle('openProject', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Projekt öffnen', filters: FILTER, properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  return { path: r.filePaths[0], content: fs.readFileSync(r.filePaths[0], 'utf8') };
});
ipcMain.handle('saveText', async (e, { content, defaultName, filters }) => {
  const r = await dialog.showSaveDialog(win, { title: 'Exportieren', defaultPath: defaultName, filters });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, content, 'utf8');
  return r.filePath;
});
ipcMain.handle('printPDF', async (e, { defaultName }) => {
  const r = await dialog.showSaveDialog(win, { title: 'Bericht als PDF speichern', defaultPath: defaultName, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return null;
  win.webContents.send('busy', { on: true, text: 'Bericht wird erstellt …' });
  await new Promise((res) => setTimeout(res, 350));
  try {
    const test = licState.state !== 'licensed';
    const data = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: `<div style="font-size:7pt;color:#777;width:100%;display:flex;justify-content:space-between;padding:0 13mm;font-family:Segoe UI,Arial"><span><b style="color:#0B2545">Leit</b><b style="color:#C8743A">Dim</b> · Leitungsdimensionierung NIN 2025${test ? ' · <b style="color:#c42b1c">TESTVERSION – nicht lizenziert</b>' : ''}</span><span>Seite <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`, margins: { marginType: 'custom', top: 0.55, bottom: 0.6, left: 0.5, right: 0.5 } });
    fs.writeFileSync(r.filePath, data);
  } catch (err) {
    win.webContents.send('busy', { on: false });
    dialog.showErrorBox('LeitDim', 'PDF konnte nicht erstellt werden:\n' + err.message);
    return null;
  }
  win.webContents.send('busy', { on: false });
  shell.openPath(r.filePath);
  return r.filePath;
});
ipcMain.handle('confirm', async (e, msg) => dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Ja', 'Abbrechen'], defaultId: 0, cancelId: 1, title: 'LeitDim', message: msg }) === 0);
ipcMain.handle('startupFile', () => startupFile());
ipcMain.handle('license:get', () => licState);
ipcMain.handle('license:activate', (e, key) => {
  const v = Lizenz.verify(key);
  if (!v.ok) return { ok: false, error: v.error };
  if (Lizenz.isExpired(v.payload)) return { ok: false, error: `Diese Lizenz ist am ${v.payload.ex} abgelaufen.` };
  const ban = readJson(banFile(), { ids: [] });
  if ((ban.ids || []).includes(v.payload.id)) return { ok: false, error: 'Diese Lizenz wurde gesperrt.' };
  fs.writeFileSync(licFile(), JSON.stringify({ key: v.key, activated: new Date().toISOString() }));
  evalLicense();
  log('Lizenz aktiviert: ' + v.payload.id);
  refreshBanList();
  return { ok: true, license: licState };
});
ipcMain.handle('license:remove', () => { try { fs.unlinkSync(licFile()); } catch (e) {} evalLicense(); log('Lizenz entfernt'); return licState; });
ipcMain.handle('license:openFile', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Lizenzdatei öffnen', filters: [{ name: 'LeitDim-Lizenz', extensions: ['leitdim-lizenz', 'txt'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  return fs.readFileSync(r.filePaths[0], 'utf8');
});
ipcMain.handle('update:get', () => (updater ? updater.getState() : { state: 'idle' }));
ipcMain.handle('update:check', () => (updater ? updater.check() : null));
ipcMain.on('setDirty', (e, v) => { dirty = !!v; });
ipcMain.on('setTitle', (e, t) => { if (win) win.setTitle(String(t)); });
ipcMain.on('closeNow', () => { allowClose = true; if (win) win.close(); });
ipcMain.on('appVersion', (e) => { e.returnValue = app.getVersion(); });
ipcMain.on('isSmoke', (e) => { e.returnValue = !!SMOKE; });

/* ---------- Start ---------- */
const gotLock = SMOKE ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  app.whenReady().then(() => {
    log(`--- LeitDim ${app.getVersion()} (${process.arch}, ${process.env.PORTABLE_EXECUTABLE_FILE ? 'portable' : 'Ordner'}) startet – ${process.execPath}`);
    mark('app bereit');
    evalLicense();
    buildMenu();
    createSplash();
    createWindow();
    if (!SMOKE) {
      updater = createUpdater({ prefix: 'LeitDim', folderAsset: true, log, onState: (s) => { if (win && !win.isDestroyed()) win.webContents.send('update', s); } });
      setTimeout(() => { refreshBanList(); updater.check(); }, 4000);
      setInterval(() => { refreshBanList(); updater.check(); }, 6 * 3600 * 1000);
    }
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => { if (updater) updater.installOnQuit(); log('beendet'); });
}
