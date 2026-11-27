// LeitDim – vollautomatische Updates über GitHub Releases (Ordner- und portable Version).
// Lädt im Hintergrund herunter und installiert beim Schliessen des Programms.
'use strict';
const { app, net } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const REPO = '2014patrick/leitdim';

function cmpVer(a, b) {
  const pa = String(a).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
  return 0;
}

function createUpdater({ prefix, folderAsset, log, onState }) {
  // prefix: 'LeitDim' oder 'LeitDim-Lizenzen'; folderAsset: true, wenn es eine Ordner-ZIP gibt
  const dir = path.join(app.getPath('userData'), 'updates');
  const portableFile = process.env.PORTABLE_EXECUTABLE_FILE || null;
  const mode = portableFile ? 'portable' : 'ordner';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  let pending = null;
  let state = { state: 'idle', current: app.getVersion(), mode };
  const set = (s) => { state = Object.assign({ current: app.getVersion(), mode }, s); try { onState && onState(state); } catch (e) {} };

  async function fetchJson(url) {
    const r = await net.fetch(url, { headers: { 'User-Agent': `${prefix}/${app.getVersion()}`, Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function check() {
    if (!app.isPackaged) { set({ state: 'dev' }); return state; }
    if (mode === 'ordner' && !folderAsset) { set({ state: 'unsupported' }); return state; }
    try {
      set({ state: 'checking' });
      const rel = await fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`);
      const ver = String(rel.tag_name || '').replace(/^v/, '');
      if (!ver || cmpVer(ver, app.getVersion()) <= 0) { set({ state: 'current', latest: ver }); log(`Update: aktuell (${app.getVersion()}, neueste ${ver || '–'})`); return state; }
      const name = mode === 'portable' ? `${prefix}-${ver}-portable-${arch}.exe` : `${prefix}-${ver}-${arch}-Ordner.zip`;
      const asset = (rel.assets || []).find((a) => a.name === name);
      if (!asset) { set({ state: 'noasset', latest: ver }); log(`Update ${ver}: Datei ${name} fehlt im Release`); return state; }
      fs.mkdirSync(dir, { recursive: true });
      const target = path.join(dir, name);
      if (!(fs.existsSync(target) && fs.statSync(target).size === asset.size)) {
        set({ state: 'downloading', latest: ver });
        log(`Update ${ver}: lade ${name} (${Math.round(asset.size / 1e6)} MB)`);
        const r = await net.fetch(asset.browser_download_url, { headers: { 'User-Agent': `${prefix}/${app.getVersion()}` } });
        if (!r.ok) throw new Error(`Download HTTP ${r.status}`);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length !== asset.size) throw new Error('Download unvollständig');
        if (asset.digest && /^sha256:/.test(asset.digest)) {
          const h = crypto.createHash('sha256').update(buf).digest('hex');
          if (h !== asset.digest.slice(7)) throw new Error('Prüfsumme stimmt nicht');
        }
        fs.writeFileSync(target + '.part', buf);
        fs.renameSync(target + '.part', target);
      }
      pending = { version: ver, file: target, mode };
      set({ state: 'ready', latest: ver, notes: rel.body || '' });
      log(`Update ${ver}: bereit, wird beim Schliessen installiert`);
    } catch (e) {
      set({ state: 'error', error: e.message });
      log('Update-Fehler: ' + e.message);
    }
    return state;
  }

  function installOnQuit() {
    if (!pending) return false;
    try {
      const script = path.join(dir, 'installieren.ps1');
      fs.writeFileSync(script, `param([int]$AppPid, [string]$Mode, [string]$Source, [string]$Target, [string]$Log)
$ErrorActionPreference = 'Stop'
function L($m) { Add-Content -LiteralPath $Log -Value ("{0:yyyy-MM-dd HH:mm:ss} [Update] {1}" -f (Get-Date), $m) }
try {
  try { Wait-Process -Id $AppPid -Timeout 90 -ErrorAction SilentlyContinue } catch {}
  Start-Sleep -Milliseconds 1200
  if ($Mode -eq 'portable') {
    $ok = $false
    for ($i = 0; $i -lt 45 -and -not $ok; $i++) { try { Copy-Item -LiteralPath $Source -Destination $Target -Force; $ok = $true } catch { Start-Sleep -Seconds 1 } }
    if (-not $ok) { throw "Datei gesperrt: $Target" }
  } else {
    $tmp = Join-Path $env:TEMP ("leitdim-update-" + [guid]::NewGuid().ToString('N'))
    Expand-Archive -LiteralPath $Source -DestinationPath $tmp -Force
    $src = Get-ChildItem -LiteralPath $tmp -Directory | Select-Object -First 1
    $rc = 0
    for ($i = 0; $i -lt 5; $i++) { & robocopy $src.FullName $Target /E /IS /IT /R:5 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null; $rc = $LASTEXITCODE; if ($rc -lt 8) { break }; Start-Sleep -Seconds 2 }
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    if ($rc -ge 8) { throw "robocopy Fehler $rc" }
  }
  Remove-Item -LiteralPath $Source -Force -ErrorAction SilentlyContinue
  L "installiert: $Target"
} catch { L ("FEHLER: " + $_.Exception.Message) }
`, 'utf8');
      const target = pending.mode === 'portable' ? process.env.PORTABLE_EXECUTABLE_FILE : path.dirname(process.execPath);
      const logFile = path.join(app.getPath('userData'), `${prefix === 'LeitDim' ? 'leitdim' : 'lizenzen'}.log`);
      const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script, '-AppPid', String(process.pid), '-Mode', pending.mode, '-Source', pending.file, '-Target', target, '-Log', logFile], { detached: true, stdio: 'ignore', windowsHide: true });
      p.unref();
      log(`Update ${pending.version}: Installation gestartet (${pending.mode} → ${target})`);
      pending = null;
      return true;
    } catch (e) {
      log('Update-Installation fehlgeschlagen: ' + e.message);
      return false;
    }
  }

  return { check, installOnQuit, getState: () => state, hasPending: () => !!pending, mode };
}

module.exports = { createUpdater, cmpVer };
