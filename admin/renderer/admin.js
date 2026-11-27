/* LeitDim Lizenzen – Oberfläche */
(function () {
  'use strict';
  const A = window.adm;
  const BR = window.LD_BRAND;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = (id) => `<svg><use href="#${id}"/></svg>`;
  const DL = 'https://github.com/2014patrick/leitdim/releases/latest';
  let view = 'licenses';
  let db = { licenses: [] };
  let st = {};
  let selId = null;
  let q = '';
  let ban = null;

  /* ---------- Hilfen ---------- */
  const fmtDate = (d) => (d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('de-CH') : '–');
  const expired = (l) => l.ex && new Date(l.ex + 'T23:59:59') < new Date();
  const statusOf = (l) => (l.status === 'gesperrt' ? 'gesperrt' : expired(l) ? 'abgelaufen' : 'aktiv');
  let toastT;
  function toast(m, ok = true) { const t = $('#toast'); t.innerHTML = (ok ? '<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : '') + `<span>${esc(m)}</span>`; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
  function showLoader(t) { $('#loaderTxt').textContent = t; $('#loader').classList.add('open'); }
  function hideLoader() { $('#loader').classList.remove('open'); }
  async function run(p, busy) {
    if (busy) showLoader(busy);
    try { const r = await p; if (!r.ok) throw new Error(r.error); return r.data; }
    finally { if (busy) hideLoader(); }
  }
  function openModal(title, body, foot) { $('#modalTitle').textContent = title; $('#modalBody').innerHTML = body; $('#modalFoot').innerHTML = foot || '<button class="btn pri" data-close>Schliessen</button>'; $('#modalBg').classList.add('open'); }
  function closeModal() { $('#modalBg').classList.remove('open'); }
  function mailText(l) {
    return `Grüezi ${l.n}

Vielen Dank für Ihr Interesse an LeitDim – Leitungsdimensionierung nach NIN 2025. Hier ist Ihr persönlicher Lizenzschlüssel:

${l.key}

So aktivieren Sie LeitDim:
1. LeitDim herunterladen und starten: ${DL}
2. Oben auf «Lizenz» (oder unten rechts auf «Testversion») klicken
3. Schlüssel einfügen und «Aktivieren» klicken – fertig.

Lizenznehmer: ${l.n}${l.f ? ', ' + l.f : ''}
Lizenz-ID: ${l.id}
Gültig bis: ${l.ex ? fmtDate(l.ex) : 'unbefristet'}

Updates installiert LeitDim automatisch.

Freundliche Grüsse
Patrick Thommen`;
  }

  /* ---------- Daten ---------- */
  async function reload() {
    st = await run(A.status());
    db = await run(A.dbLoad());
    renderStatus();
  }
  function renderStatus() {
    $('#sbVer').textContent = A.version;
    $('#sbKey').innerHTML = st.key && st.key.matches ? '🔑 Signaturschlüssel bereit' : '⚠ Signaturschlüssel fehlt';
    $('#sbGit').textContent = st.hasToken ? 'GitHub verbunden (Token gespeichert)' : 'GitHub: kein Token';
  }

  /* ---------- Ansichten ---------- */
  function render() {
    $$('.vbtn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    const m = $('#main');
    if (view === 'licenses') m.innerHTML = vLicenses();
    if (view === 'ban') { m.innerHTML = vBan(); loadBan(); }
    if (view === 'releases') { m.innerHTML = vReleases(); loadReleases(); }
    if (view === 'setup') m.innerHTML = vSetup();
    const s = $('#search2');
    if (s) { s.value = q; s.oninput = () => { q = s.value; $('#ltBody').innerHTML = rows(); }; }
  }
  function filtered() {
    const t = q.toLowerCase();
    return db.licenses.filter((l) => !t || [l.n, l.f, l.e, l.id, l.note].join(' ').toLowerCase().includes(t));
  }
  function rows() {
    const list = filtered();
    if (!list.length) return `<tr><td colspan="6"><div class="empty2">${icon('i-key')}<p>${db.licenses.length ? 'Keine Treffer.' : 'Noch keine Lizenzen. Oben rechts «Neue Lizenz» klicken.'}</p></div></td></tr>`;
    return list.map((l) => { const s = statusOf(l); return `<tr data-id="${l.id}" class="${l.id === selId ? 'sel' : ''}"><td><b>${esc(l.n)}</b>${l.f ? `<br><span style="color:var(--muted)">${esc(l.f)}</span>` : ''}</td><td>${esc(l.e || '–')}</td><td class="mono">${esc(l.id)}</td><td>${fmtDate(l.ia)}</td><td>${l.ex ? fmtDate(l.ex) : 'unbefristet'}</td><td><span class="badge ${s}">${s}</span></td></tr>`; }).join('');
  }
  function vLicenses() {
    const all = db.licenses, ak = all.filter((l) => statusOf(l) === 'aktiv').length, ge = all.filter((l) => statusOf(l) === 'gesperrt').length, ab = all.filter((l) => statusOf(l) === 'abgelaufen').length;
    const warn = !(st.key && st.key.matches) ? `<div class="note warn" style="margin-bottom:14px">${icon('i-warn')}<div><b>Einrichtung nötig:</b> Signaturschlüssel importieren, sonst können keine Lizenzen erstellt werden. <a class="linkish" data-view="setup">Zur Einrichtung</a></div></div>` : '';
    return `${warn}<div class="stats"><div class="stat"><small>Lizenzen total</small><b>${all.length}</b></div><div class="stat"><small>Aktiv</small><b>${ak}</b></div><div class="stat cu"><small>Gesperrt</small><b>${ge}</b></div><div class="stat"><small>Abgelaufen</small><b>${ab}</b></div></div>
      <div class="split"><div class="panel"><div class="ph"><h2>Lizenzen</h2><div style="display:flex;gap:8px"><input class="search2" id="search2" placeholder="Name, Firma, E-Mail, ID …" /><button class="btn sm" data-cmd="csv">CSV</button></div></div>
      <div class="pb" style="padding:0"><table class="lt"><thead><tr><th>Lizenznehmer</th><th>E-Mail</th><th>ID</th><th>Ausgestellt</th><th>Gültig bis</th><th>Status</th></tr></thead><tbody id="ltBody">${rows()}</tbody></table></div></div>
      <div class="panel detail" id="detail">${vDetail()}</div></div>`;
  }
  function vDetail() {
    const l = db.licenses.find((x) => x.id === selId);
    if (!l) return `<div class="empty2">${icon('i-key')}<p>Lizenz in der Liste anklicken, um Schlüssel, Lizenzdatei und E-Mail-Text zu sehen.</p></div>`;
    const s = statusOf(l);
    return `<div class="pb" style="padding-top:16px"><div class="who">${esc(l.n)}</div><div class="sub">${esc(l.f || '')}</div>
      <dl><dt>Status</dt><dd><span class="badge ${s}">${s}</span>${l.revokeReason ? ' – ' + esc(l.revokeReason) : ''}</dd><dt>E-Mail</dt><dd>${esc(l.e || '–')}</dd><dt>Lizenz-ID</dt><dd class="mono">${esc(l.id)}</dd><dt>Ausgestellt</dt><dd>${fmtDate(l.ia)}</dd><dt>Gültig bis</dt><dd>${l.ex ? fmtDate(l.ex) : 'unbefristet'}</dd>${l.note ? `<dt>Notiz</dt><dd>${esc(l.note)}</dd>` : ''}</dl>
      <div class="keybox" id="keybox">${esc(l.key)}</div>
      <div class="actions"><button class="btn sm" data-act="copy">${icon('i-copy')}Schlüssel kopieren</button><button class="btn sm" data-act="file">${icon('i-file')}Lizenzdatei</button><button class="btn sm" data-act="mail">${icon('i-mail')}E-Mail-Text</button></div>
      <div class="actions" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line-2)">${l.status === 'gesperrt' ? `<button class="btn sm" data-act="unban">${icon('i-unlock')}Entsperren</button>` : `<button class="btn sm danger" data-act="ban">${icon('i-lock')}Sperren</button>`}<span style="flex:1"></span><button class="btn sm" data-act="del" title="Nur aus der lokalen Liste entfernen">Aus Liste entfernen</button></div></div>`;
  }
  function vBan() {
    return `<div class="panel"><div class="ph"><h2>Sperrliste auf GitHub</h2><button class="btn sm" data-cmd="ban-refresh">Aktualisieren</button></div><div class="pb"><p style="color:var(--muted);margin-top:0">LeitDim prüft beim Start und alle 6 Stunden diese Liste (<span class="mono">lizenzen/gesperrt.json</span> im Repo). Gesperrte Lizenzen fallen in den Testmodus zurück. In der Liste stehen nur IDs, keine Namen.</p><div id="banBody"><div class="empty2">Wird geladen …</div></div></div></div>`;
  }
  async function loadBan() {
    const el = $('#banBody');
    try {
      ban = await run(A.banList());
      const items = ban.gesperrt || [];
      el.innerHTML = items.length ? `<table class="lt"><thead><tr><th>ID</th><th>Lizenznehmer (lokal)</th><th>Gesperrt am</th><th>Grund</th><th></th></tr></thead><tbody>${items.map((x) => { const id = typeof x === 'string' ? x : x.id; const l = db.licenses.find((y) => y.id === id); return `<tr><td class="mono">${esc(id)}</td><td>${l ? esc(l.n) : '<span style="color:var(--muted)">unbekannt</span>'}</td><td>${esc(x.datum || '–')}</td><td>${esc(x.grund || '')}</td><td><button class="btn sm" data-unban="${esc(id)}">Entsperren</button></td></tr>`; }).join('')}</tbody></table>` : `<div class="empty2">${icon('i-shield')}<p>Keine Lizenz gesperrt.</p></div>`;
    } catch (e) { el.innerHTML = `<div class="note warn">${icon('i-warn')}<div>${esc(e.message)}</div></div>`; }
  }
  function nextVersion(rel) {
    const tags = (rel || []).map((r) => r.tag.replace(/^v/, '')).filter((t) => /^\d+\.\d+\.\d+$/.test(t));
    if (!tags.length) return '1.2.0';
    const [a, b, c] = tags.sort((x, y) => y.localeCompare(x, undefined, { numeric: true }))[0].split('.').map(Number);
    return `${a}.${b}.${c + 1}`;
  }
  function vReleases() {
    return `<div class="split"><div class="panel"><div class="ph"><h2>Veröffentlichte Versionen</h2><button class="btn sm" data-cmd="rel-refresh">Aktualisieren</button></div><div class="pb" id="relBody"><div class="empty2">Wird geladen …</div></div></div>
      <div class="panel"><div class="ph"><h2>Neue Version veröffentlichen</h2></div><div class="pb">
        <p style="margin-top:0;line-height:1.5">Erstellt auf GitHub die Version (Tag). Danach baut GitHub LeitDim und die Lizenzverwaltung automatisch in Windows-VMs (x64 und ARM64), testet sie und stellt sie als Release bereit. Alle installierten LeitDim-Programme laden das Update selbst und installieren es beim Schliessen.</p>
        <div class="form"><label>Version</label><input class="inp" id="relVer" placeholder="1.2.1" /></div>
        <div class="actions" style="justify-content:flex-end;margin-top:12px"><button class="btn pri" data-cmd="publish">${icon('i-rocket')} Veröffentlichen</button></div>
        <h5 style="margin-top:20px">Letzte Build-Läufe</h5><div id="runBody" class="runs"></div></div></div></div>`;
  }
  async function loadReleases() {
    const el = $('#relBody');
    try {
      const d = await run(A.releases());
      el.innerHTML = d.releases.length ? `<table class="lt"><thead><tr><th>Version</th><th>Datum</th><th>Dateien</th><th>Downloads</th><th></th></tr></thead><tbody>${d.releases.map((r) => `<tr><td><b>${esc(r.tag)}</b></td><td>${fmtDate(r.date)}</td><td>${r.assets}</td><td>${r.downloads}</td><td><a class="linkish" data-url="${esc(r.url)}">öffnen ${icon('i-ext')}</a></td></tr>`).join('')}</tbody></table>` : `<div class="empty2">${icon('i-rocket')}<p>Noch keine Version veröffentlicht.</p></div>`;
      const v = $('#relVer'); if (v && !v.value) v.value = nextVersion(d.releases);
      $('#runBody').innerHTML = d.runs.length ? `<table class="lt"><tbody>${d.runs.map((r) => `<tr><td>${esc(r.name)}<br><span style="color:var(--muted)">${esc(r.branch || '')}</span></td><td><span class="st ${esc(r.conclusion || r.status)}">${esc({ success: 'erfolgreich', failure: 'fehlgeschlagen', in_progress: 'läuft …', queued: 'wartet', cancelled: 'abgebrochen' }[r.conclusion || r.status] || r.conclusion || r.status)}</span></td><td>${fmtDate(r.date)}</td><td><a class="linkish" data-url="${esc(r.url)}">${icon('i-ext')}</a></td></tr>`).join('')}</tbody></table>` : '<p style="color:var(--muted)">Keine Läufe.</p>';
    } catch (e) { el.innerHTML = `<div class="note warn">${icon('i-warn')}<div>${esc(e.message)}</div></div>`; }
  }
  function vSetup() {
    const k = st.key;
    const keyOk = k && k.matches;
    return `<div class="setup">
      <div class="scard"><h3>${icon('i-key')} Signaturschlüssel</h3><span class="state ${keyOk ? 'ok' : 'bad'}">${icon(keyOk ? 'i-check' : 'i-warn')}${keyOk ? 'importiert' : 'fehlt'}</span>
        <p>Mit dem privaten Schlüssel werden Lizenzen unterschrieben. Er wird verschlüsselt (Windows-Datenschutz) nur auf diesem PC gespeichert.</p>
        ${keyOk ? `<p>Fingerabdruck: <span class="mono">${esc(k.fingerprint)}</span> – passt zu LeitDim.</p>` : `<ol><li>«Schlüssel importieren» klicken</li><li>Datei <b>leitdim-signatur-PRIVAT.pem</b> wählen (Ordner «Elektriker › LeitDim Signaturschluessel (PRIVAT)»)</li></ol>`}
        <div class="actions"><button class="btn ${keyOk ? '' : 'pri'}" data-cmd="key-import">Schlüssel importieren …</button>${keyOk ? '<button class="btn" data-cmd="key-backup">Sicherung exportieren …</button>' : ''}</div></div>
      <div class="scard"><h3>${icon('i-shield')} GitHub-Verbindung</h3><span class="state ${st.hasToken ? 'ok' : 'bad'}">${icon(st.hasToken ? 'i-check' : 'i-warn')}${st.hasToken ? 'Token gespeichert' : 'kein Token'}</span>
        <p>Nötig zum Sperren von Lizenzen und Veröffentlichen von Versionen. Repo: <span class="mono">${esc(st.repo)}</span></p>
        <ol><li><a class="linkish" data-url="https://github.com/settings/personal-access-tokens/new">Token auf GitHub erstellen ${icon('i-ext')}</a> (Fine-grained)</li><li>Repository access: <b>Only select repositories → leitdim</b></li><li>Permissions: <b>Contents: Read and write</b>, <b>Actions: Read-only</b></li><li>Token kopieren und hier einfügen</li></ol>
        <div class="form" style="grid-template-columns:1fr"><input class="inp mono" id="tok" type="password" placeholder="github_pat_…" autocomplete="off" /></div>
        <div class="actions"><button class="btn pri" data-cmd="tok-save">Speichern &amp; testen</button>${st.hasToken ? '<button class="btn" data-cmd="tok-test">Verbindung testen</button><button class="btn danger" data-cmd="tok-del">Token entfernen</button>' : ''}</div><div id="tokMsg" style="margin-top:8px;font-size:12px"></div></div>
      <div class="scard"><h3>${icon('i-file')} Datenablage</h3><span class="state ok">${icon('i-check')}aktiv</span>
        <p>Die Lizenzliste (mit Namen und E-Mails) bleibt lokal und wird nicht hochgeladen. Tipp: einen Ordner in SynologyDrive wählen, dann ist sie automatisch gesichert.</p>
        <p class="mono" style="font-size:11.5px;word-break:break-all">${esc(st.dbFile)}</p>
        <div class="actions"><button class="btn" data-cmd="datadir">Ordner ändern …</button><button class="btn" data-cmd="csv">Liste als CSV …</button></div></div>
    </div>`;
  }

  /* ---------- Aktionen ---------- */
  function newLicense() {
    if (!(st.key && st.key.matches)) { toast('Zuerst den Signaturschlüssel importieren.', false); view = 'setup'; render(); return; }
    const inYear = new Date(); inYear.setFullYear(inYear.getFullYear() + 1);
    openModal('Neue Lizenz', `<div class="form">
      <label>Name *</label><input class="inp" id="fN" placeholder="Vorname Nachname" />
      <label>Firma</label><input class="inp" id="fF" placeholder="optional" />
      <label>E-Mail</label><input class="inp" id="fE" placeholder="optional" />
      <label>Gültigkeit</label><div style="display:flex;gap:10px;align-items:center"><label class="chk"><input type="checkbox" id="fUnb" checked /> unbefristet</label><input class="inp" type="date" id="fEx" value="${inYear.toISOString().slice(0, 10)}" disabled style="max-width:170px" /></div>
      <label>Notiz</label><input class="inp" id="fNote" placeholder="intern, z. B. Rechnung 2026-041" />
    </div>`, `<button class="btn" data-close>Abbrechen</button><button class="btn pri" id="fGo">${icon('i-key')} Lizenz erstellen</button>`);
    $('#fUnb').onchange = () => { $('#fEx').disabled = $('#fUnb').checked; };
    setTimeout(() => $('#fN').focus(), 40);
    $('#fGo').onclick = async () => {
      try {
        const rec = await run(A.create({ n: $('#fN').value, f: $('#fF').value, e: $('#fE').value, ex: $('#fUnb').checked ? null : $('#fEx').value, note: $('#fNote').value }), 'Lizenz wird signiert …');
        db = await run(A.dbLoad());
        selId = rec.id;
        openModal('Lizenz erstellt', `<div class="okbanner"><div class="c">${icon('i-check')}</div><div><b>${esc(rec.n)}</b>${rec.f ? ' · ' + esc(rec.f) : ''}<br><span style="color:var(--muted)">ID ${esc(rec.id)} · ${rec.ex ? 'gültig bis ' + fmtDate(rec.ex) : 'unbefristet'}</span></div></div>
          <div class="keybox">${esc(rec.key)}</div>
          <h5>E-Mail an ${esc(rec.e || 'Kunde')}</h5><div class="mail">${esc(mailText(rec))}</div>`,
          `<button class="btn" id="rFile">${icon('i-file')} Lizenzdatei speichern</button><button class="btn" id="rMail">${icon('i-mail')} E-Mail-Text kopieren</button><span style="flex:1"></span><button class="btn pri" id="rCopy">${icon('i-copy')} Schlüssel kopieren</button>`);
        $('#rCopy').onclick = async () => { await run(A.copy(rec.key)); toast('Schlüssel kopiert'); };
        $('#rMail').onclick = async () => { await run(A.copy(mailText(rec))); toast('E-Mail-Text kopiert'); };
        $('#rFile').onclick = async () => { const p = await run(A.saveFile(rec)); if (p) toast('Lizenzdatei gespeichert'); };
        view = 'licenses'; render();
      } catch (e) { toast(e.message, false); }
    };
  }
  async function act(a) {
    const l = db.licenses.find((x) => x.id === selId);
    if (!l) return;
    try {
      if (a === 'copy') { await run(A.copy(l.key)); toast('Schlüssel kopiert'); }
      if (a === 'mail') { await run(A.copy(mailText(l))); toast('E-Mail-Text kopiert'); }
      if (a === 'file') { const p = await run(A.saveFile(l)); if (p) toast('Lizenzdatei gespeichert'); }
      if (a === 'ban') {
        openModal('Lizenz sperren', `<p>Lizenz <b>${esc(l.n)}</b> (<span class="mono">${esc(l.id)}</span>) sperren? LeitDim fällt beim Kunden spätestens nach dem nächsten Start bzw. innert 6 Stunden in den Testmodus.</p><div class="form"><label>Grund</label><input class="inp" id="banWhy" placeholder="z. B. nicht bezahlt" /></div>`, `<button class="btn" data-close>Abbrechen</button><button class="btn pri" id="banGo" style="background:var(--bad);border-color:var(--bad)">${icon('i-lock')} Sperren</button>`);
        $('#banGo').onclick = async () => { try { await run(A.setRevoked(l.id, true, $('#banWhy').value), 'Sperrliste auf GitHub aktualisieren …'); closeModal(); db = await run(A.dbLoad()); render(); toast('Lizenz gesperrt'); } catch (e) { toast(e.message, false); } };
      }
      if (a === 'unban') { await run(A.setRevoked(l.id, false, ''), 'Sperrliste auf GitHub aktualisieren …'); db = await run(A.dbLoad()); render(); toast('Lizenz entsperrt'); }
      if (a === 'del') {
        if (!(await run(A.confirm(`Lizenz «${l.n}» aus der lokalen Liste entfernen? Der Schlüssel bleibt gültig, solange er nicht gesperrt ist.`)))) return;
        db.licenses = db.licenses.filter((x) => x.id !== l.id); await run(A.dbSave(db)); selId = null; render();
      }
    } catch (e) { toast(e.message, false); }
  }
  const CMD = {
    new: newLicense,
    csv: async () => {
      const qv = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
      const lines = [['ID', 'Name', 'Firma', 'E-Mail', 'Ausgestellt', 'Gültig bis', 'Status', 'Notiz'].map(qv).join(';'), ...db.licenses.map((l) => [l.id, l.n, l.f, l.e, l.ia, l.ex || 'unbefristet', statusOf(l), l.note].map(qv).join(';'))];
      try { const p = await run(A.exportCsv(lines.join('\r\n'))); if (p) toast('Exportiert'); } catch (e) { toast(e.message, false); }
    },
    'ban-refresh': loadBan,
    'rel-refresh': loadReleases,
    publish: async () => {
      const v = $('#relVer').value.trim();
      if (!(await run(A.confirm(`Version ${v} jetzt veröffentlichen? GitHub baut und testet sie (ca. 10–15 Minuten), danach erhalten alle Benutzer das Update automatisch.`)))) return;
      try { const r = await run(A.publish(v), 'Version wird angelegt …'); toast(`Version ${r.tag} angelegt – Build läuft`); setTimeout(loadReleases, 3000); } catch (e) { toast(e.message, false); }
    },
    'key-import': async () => { try { const r = await run(A.keyImport()); if (r) { toast('Signaturschlüssel importiert'); await reload(); render(); } } catch (e) { toast(e.message, false); } },
    'key-backup': async () => { try { const p = await run(A.keyBackup()); if (p) toast('Sicherung gespeichert'); } catch (e) { toast(e.message, false); } },
    'tok-save': async () => {
      const t = $('#tok').value.trim();
      if (!t) { toast('Token einfügen.', false); return; }
      try { await run(A.setToken(t)); await reload(); render(); CMD['tok-test'](); } catch (e) { toast(e.message, false); }
    },
    'tok-test': async () => {
      const m = $('#tokMsg'); if (m) m.textContent = 'Teste …';
      try { const r = await run(A.testGithub(), 'Verbindung zu GitHub testen …'); const ok = r.push; const msg = `${r.name}: ${ok ? 'Schreibzugriff OK' : 'nur Lesezugriff – Token-Rechte prüfen'} · Sperrliste: ${r.banCount}`; if ($('#tokMsg')) { $('#tokMsg').style.color = ok ? 'var(--ok)' : 'var(--bad)'; $('#tokMsg').textContent = msg; } toast(ok ? 'GitHub verbunden' : 'Token ohne Schreibrecht', ok); } catch (e) { if ($('#tokMsg')) { $('#tokMsg').style.color = 'var(--bad)'; $('#tokMsg').textContent = e.message; } }
    },
    'tok-del': async () => { await run(A.setToken('')); await reload(); render(); toast('Token entfernt'); },
    datadir: async () => { try { const d = await run(A.chooseDataDir()); if (d) { await reload(); render(); toast('Datenordner geändert'); } } catch (e) { toast(e.message, false); } },
  };

  /* ---------- Ereignisse ---------- */
  document.addEventListener('click', async (e) => {
    const v = e.target.closest('[data-view]'); if (v) { view = v.dataset.view; render(); return; }
    const c = e.target.closest('[data-cmd]'); if (c && CMD[c.dataset.cmd]) { CMD[c.dataset.cmd](); return; }
    const a = e.target.closest('[data-act]'); if (a) { act(a.dataset.act); return; }
    const u = e.target.closest('[data-url]'); if (u) { A.open(u.dataset.url); return; }
    const ub = e.target.closest('[data-unban]'); if (ub) { try { await run(A.setRevoked(ub.dataset.unban, false, ''), 'Sperrliste aktualisieren …'); db = await run(A.dbLoad()); loadBan(); toast('Entsperrt'); } catch (err) { toast(err.message, false); } return; }
    const tr = e.target.closest('#ltBody tr[data-id]'); if (tr) { selId = tr.dataset.id; $$('#ltBody tr').forEach((r) => r.classList.toggle('sel', r.dataset.id === selId)); $('#detail').innerHTML = vDetail(); return; }
    if (e.target.closest('[data-close]') || e.target.id === 'modalBg') closeModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); newLicense(); } });
  A.onMenu((c) => CMD[c] && CMD[c]());
  A.onUpdate((s) => { $('#sbUpd').textContent = s.state === 'ready' ? `Update ${s.latest} wird beim Schliessen installiert` : s.state === 'downloading' ? `Update ${s.latest} wird geladen …` : ''; });

  /* ---------- Start ---------- */
  (async function init() {
    $('#brandMark').innerHTML = `<defs>${BR.coreDefs}</defs>${BR.markInnerDark}`;
    const w = BR.wordmarkDark;
    $('#brandWm').outerHTML = `<svg class="bwm" viewBox="0 0 ${w.w} 50" preserveAspectRatio="xMinYMid meet" style="height:23px;width:${Math.round((w.w * 23) / 50)}px">${w.svg}</svg>`;
    $('#loaderMark').innerHTML = `<defs>${BR.coreDefs}</defs><g class="spin">${BR.markInnerDark.replace(/<circle class="sheath"[\s\S]*$/, '')}</g>` + BR.markInnerDark.replace(/^[\s\S]*?(<circle class="sheath")/, '$1');
    document.body.classList.add('enter');
    setTimeout(() => document.body.classList.remove('enter'), 900);
    try { await reload(); } catch (e) { toast(e.message, false); }
    if (!(st.key && st.key.matches)) view = 'setup';
    render();
  })();
})();
