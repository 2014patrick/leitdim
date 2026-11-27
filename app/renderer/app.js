/* LeitDim – Oberfläche */
(function () {
  'use strict';
  const LD = window.LD, D = window.LD_DATA;
  const native = window.ldNative || null;
  const VERSION = (native && native.version) || '1.0.0';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const { fmt, fmtS, fmtT } = LD;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = (id) => `<svg><use href="#${id}"/></svg>`;
  const BR = window.LD_BRAND;
  let uidN = 0;
  const uniq = (svg) => { const k = 'g' + ++uidN; return svg.replace(/id="cu"/g, `id="cu${k}"`).replace(/url\(#cu\)/g, `url(#cu${k})`).replace(/id="bgT"/g, `id="bgT${k}"`).replace(/url\(#bgT\)/g, `url(#bgT${k})`); };
  const TILE = `<defs><linearGradient id="bgT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16467A"/><stop offset="1" stop-color="#0B2545"/></linearGradient>${BR.coreDefs}</defs><rect x="8" y="8" width="240" height="240" rx="56" fill="url(#bgT)"/>`;
  const markDark = () => uniq(`<defs>${BR.coreDefs}</defs>${BR.markInnerDark}`);
  const markTileSvg = (cls) => `<svg class="${cls || ''}" viewBox="0 0 256 256" aria-hidden="true">${uniq(TILE + BR.markInnerDark)}</svg>`;
  const wordmarkSvg = (dark, h, cls) => { const w = dark ? BR.wordmarkDark : BR.wordmarkLight; return `<svg class="${cls || ''}" viewBox="0 0 ${w.w} 50" preserveAspectRatio="xMinYMid meet" style="height:${h}px;width:${Math.round((w.w * h) / 50)}px" aria-label="LeitDim">${w.svg}</svg>`; };
  let justSwitched = true;
  let lic = { state: 'test' };
  let upd = { state: 'idle' };
  const MAX_TEST = 3;
  const isTest = () => lic.state !== 'licensed';
  const lockedIdx = (c) => isTest() && project.circuits.indexOf(c) >= MAX_TEST;
  const isLocked = (c) => lockedIdx(c);
  const newIds = new Set();
  const lastRec = {};

  /* ---------- Modell ---------- */
  const today = () => new Date().toLocaleDateString('de-CH');
  const uid = () => Math.random().toString(36).slice(2, 10);

  function defaultCircuit(i) {
    return {
      id: uid(), name: 'F1.' + i, desc: '', kreisTyp: 'end', netz: '3', leiter: '3LNPE',
      last: { mode: 'I', I_B: 10, P_kW: '', cosphi: 0.9, eta: 1 }, kG: 1,
      schutz: { typ: 'LS', char: 'C', In: 'auto', Ir: '', Ii: '', icn_kA: '6', i2t_user: '' },
      basis: 'IN', motorIr: '', rcd: { idn_mA: '0', fehlerschutz: false },
      material: 'cu', isolation: 'pvc', verlegeart: 'B2', fAnordnung: 'trefoil', belastet: 'auto',
      laenge: 20, parallel: '1', pe: 'nin', querschnitt: 'auto',
      temp: 30, soilRho: '2.5', kTmanuell: '',
      haeufung: { methode: 'tab21', anordnung: '1', anzahl: 1, abstand: '0', faktor: 1 },
      du: { methode: 'nin', limit: projectDuDefault(), vor: 0 },
      ik: { modus: 'keine', ik1: '', zs: '', ikEnde: '', ikMax_kA: '' },
      tKennlinie: '', upstream: '',
    };
  }
  function projectDuDefault() { try { return (project && project.settings && project.settings.duLimit) || LD.SETTINGS_DEFAULT.duLimit; } catch (e) { return 4; } }

  function newProject() {
    let st = {};
    try { st = JSON.parse(localStorage.getItem('leitdim.defaultSettings') || '{}'); } catch (e) { st = {}; }
    const p = { app: 'LeitDim', format: 1, meta: { projekt: '', objekt: '', bearbeiter: '', firma: '', datum: today() }, settings: st, circuits: [] };
    return p;
  }

  let project = newProject();
  project.circuits.push(defaultCircuit(1));
  let curId = project.circuits[0].id;
  let filePath = null;
  let dirty = false;
  let activeTab = 'input';

  const cur = () => project.circuits.find((c) => c.id === curId) || project.circuits[0];
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  function setPath(o, p, v) {
    const ks = p.split('.');
    let a = o;
    for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null || typeof a[ks[i]] !== 'object') a[ks[i]] = {}; a = a[ks[i]]; }
    a[ks[ks.length - 1]] = v;
  }
  function fillDefaults(c, i) {
    const d = defaultCircuit(i || 1);
    const merge = (t, s) => { for (const k in s) { if (t[k] === undefined) t[k] = s[k]; else if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) merge(t[k], s[k]); } };
    merge(c, d);
    if (!c.id) c.id = uid();
    return c;
  }
  /* Vorgeschaltete Leitung: Δu und Ik übernehmen */
  function effective(c, seen) {
    seen = seen || new Set([c.id]);
    const clone = () => JSON.parse(JSON.stringify(c));
    const up = c.upstream ? project.circuits.find((x) => x.id === c.upstream) : null;
    if (!up || seen.has(up.id) || seen.size > 8) {
      if (c.ik && c.ik.modus === 'upstream') { const e = clone(); e.ik.modus = 'keine'; return e; }
      return c;
    }
    seen.add(up.id);
    const ur = LD.compute(effective(up, seen), project.settings);
    const e = clone();
    const ok = ur.ok && ur.sel;
    if (ok) e.du.vor = ur.sel.duTot;
    if (e.ik.modus === 'upstream') {
      if (ok && ur.sel.IkEnd) { e.ik.modus = 'anfang'; e.ik.ik1 = ur.sel.IkEnd; if (!e.ik.ikMax_kA && ur.ikMax) e.ik.ikMax_kA = ''; }
      else e.ik.modus = 'keine';
    }
    e._up = { id: up.id, name: up.name, ok: !!ok, du: ok ? ur.sel.duTot : null, ik: ok ? ur.sel.IkEnd : null };
    return e;
  }
  function chainOf(c) {
    const chain = [];
    const seen = new Set();
    let x = c;
    while (x && !seen.has(x.id) && chain.length < 9) { seen.add(x.id); chain.unshift(x); x = x.upstream ? project.circuits.find((y) => y.id === x.upstream) : null; }
    return chain.map((cc) => { const e = effective(cc); return { c: cc, r: LD.compute(e, project.settings), e }; });
  }
  function wouldCycle(c, upId) {
    let x = project.circuits.find((y) => y.id === upId);
    const seen = new Set();
    while (x && !seen.has(x.id)) { if (x.id === c.id) return true; seen.add(x.id); x = x.upstream ? project.circuits.find((y) => y.id === x.upstream) : null; }
    return false;
  }
  const calc = (c) => { const r = LD.compute(effective(c), project.settings); if (r.ok) r.up = effective(c)._up || null; return r; };
  const nLoaded = (c) => (c.belastet === '2' ? 2 : c.belastet === '3' ? 3 : c.netz === '1' ? 2 : 3);

  /* ---------- Zustand / Speichern ---------- */
  function setDirty(v) {
    dirty = v;
    document.getElementById('tbRight').classList.toggle('dirty', v);
    if (native) native.setDirty(v);
    updateTitle();
    if (v) scheduleAutosave();
  }
  function baseName(p) { return p ? p.split(/[\\/]/).pop() : 'Neues Projekt'; }
  function updateTitle() {
    const n = baseName(filePath);
    $('#fileName').textContent = n + (dirty ? ' *' : '');
    const t = `${n}${dirty ? ' *' : ''} – LeitDim`;
    document.title = t;
    if (native) native.setTitle(t);
  }
  let asTimer = null;
  function scheduleAutosave() {
    clearTimeout(asTimer);
    asTimer = setTimeout(() => { try { localStorage.setItem('leitdim.autosave', JSON.stringify({ project, filePath, curId })); } catch (e) {} }, 600);
  }
  function serialize() { return JSON.stringify(project, null, 1); }
  function suggestedName(ext) {
    const b = (project.meta.projekt || 'LeitDim-Projekt').replace(/[\\/:*?"<>|]+/g, '').trim() || 'LeitDim-Projekt';
    return `${b}.${ext}`;
  }
  async function cmdSave(asNew) {
    const content = serialize();
    if (native) {
      const r = await native.saveProject({ path: asNew ? null : filePath, content, defaultName: suggestedName('leitdim') });
      if (!r) return false;
      filePath = r.path;
      setDirty(false);
      toast('Gespeichert: ' + baseName(filePath), true);
      return true;
    }
    download(suggestedName('leitdim'), content, 'application/json');
    setDirty(false);
    return true;
  }
  function loadProject(text, path) {
    let p;
    try { p = JSON.parse(text); } catch (e) { toast('Datei konnte nicht gelesen werden.'); return; }
    if (!p || !Array.isArray(p.circuits)) { toast('Keine gültige LeitDim-Datei.'); return; }
    p.meta = Object.assign({ projekt: '', objekt: '', bearbeiter: '', firma: '', datum: today() }, p.meta || {});
    p.settings = p.settings || {};
    p.circuits.forEach((c, i) => fillDefaults(c, i + 1));
    if (!p.circuits.length) p.circuits.push(defaultCircuit(1));
    project = p;
    curId = p.circuits[0].id;
    filePath = path || null;
    setDirty(false);
    renderAll();
  }
  async function cmdOpen() {
    if (dirty && !(await confirmDiscard())) return;
    if (native) {
      const r = await native.openProject();
      if (r) { showLoader('Projekt wird geladen …'); await sleep(420); loadProject(r.content, r.path); justSwitched = true; renderAll(); hideLoader(120); }
      return;
    }
    $('#fileInput').click();
  }
  async function confirmDiscard() {
    if (native && native.confirm) return native.confirm('Ungespeicherte Änderungen verwerfen?');
    return window.confirm('Ungespeicherte Änderungen verwerfen?');
  }
  async function cmdNew() {
    if (dirty && !(await confirmDiscard())) return;
    project = newProject();
    project.circuits.push(defaultCircuit(1));
    curId = project.circuits[0].id;
    filePath = null;
    setDirty(false);
    renderAll();
  }
  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function nextName() {
    const names = project.circuits.map((c) => c.name);
    const last = names[names.length - 1] || 'F1.0';
    const m = last.match(/^(.*?)(\d+)$/);
    let cand = m ? m[1] + (parseInt(m[2], 10) + 1) : last + ' (2)';
    while (names.includes(cand) && m) cand = cand.replace(/(\d+)$/, (x) => String(parseInt(x, 10) + 1));
    return cand;
  }
  function testLimitReached() {
    if (isTest() && project.circuits.length >= MAX_TEST) {
      cmdLicense(`Die Testversion rechnet mit höchstens ${MAX_TEST} Stromkreisen. Mit einer Lizenz sind beliebig viele Stromkreise möglich.`);
      return true;
    }
    return false;
  }
  function cmdAdd() {
    if (testLimitReached()) return;
    const base = cur();
    const c = defaultCircuit(project.circuits.length + 1);
    if (base) { // Netz-/Kurzschlussangaben übernehmen (gleicher Verteiler)
      c.ik = JSON.parse(JSON.stringify(base.ik));
      c.du.vor = base.du.vor;
      c.du.limit = base.du.limit;
    }
    c.name = nextName();
    project.circuits.push(c);
    curId = c.id;
    newIds.add(c.id);
    justSwitched = true;
    setDirty(true);
    switchTab('input');
    renderAll();
    setTimeout(() => { const el = $('[data-path="name"]'); el && el.select(); }, 30);
  }
  function cmdDup() {
    if (testLimitReached()) return;
    const c = JSON.parse(JSON.stringify(cur()));
    c.id = uid();
    c.name = nextName();
    const idx = project.circuits.findIndex((x) => x.id === curId);
    project.circuits.splice(idx + 1, 0, c);
    curId = c.id;
    setDirty(true);
    renderAll();
    newIds.add(c.id);
    justSwitched = true;
    toast('Stromkreis dupliziert', true);
  }
  async function cmdDel() {
    const c = cur();
    const ok = native && native.confirm ? await native.confirm(`Stromkreis «${c.name}» löschen?`) : window.confirm(`Stromkreis «${c.name}» löschen?`);
    if (!ok) return;
    const idx = project.circuits.findIndex((x) => x.id === c.id);
    project.circuits.splice(idx, 1);
    if (!project.circuits.length) project.circuits.push(defaultCircuit(1));
    curId = project.circuits[Math.max(0, idx - 1)].id;
    setDirty(true);
    renderAll();
  }

  /* ---------- Formular ---------- */
  function fillSelect(sel, opts, keep) {
    const v = keep !== undefined ? keep : sel.value;
    sel.innerHTML = opts.map(([val, txt]) => `<option value="${esc(val)}">${esc(txt)}</option>`).join('');
    if (opts.some(([val]) => String(val) === String(v))) sel.value = String(v);
  }
  function sectionsFor(c) {
    const tab = D.iz[`${c.isolation}|${c.material}|${nLoaded(c)}`];
    let key = c.verlegeart;
    if (key === 'F' && nLoaded(c) === 3 && c.fAnordnung === 'flat') key = 'Fflat';
    const col = (tab && tab[key]) || [];
    return D.sections.filter((s, i) => col[i] !== null && col[i] !== undefined);
  }
  const VIS = {
    modeI: (c) => c.last.mode !== 'P',
    modeP: (c) => c.last.mode === 'P',
    isLS: (c) => c.schutz.typ === 'LS',
    notLSV: (c) => c.schutz.typ !== 'LSV',
    isLSV: (c) => c.schutz.typ === 'LSV',
    notGG: (c) => c.schutz.typ !== 'gG',
    basisIB: (c) => c.basis === 'IB',
    hasRCD: (c) => +c.rcd.idn_mA > 0,
    isF3: (c) => c.verlegeart === 'F' && nLoaded(c) === 3,
    isD: (c) => c.verlegeart === 'D',
    hmTab: (c) => ['tab21', 'tab38'].includes(c.haeufung.methode),
    hmCount: (c) => c.haeufung.methode !== 'manuell',
    hmDucts: (c) => c.haeufung.methode === 'ducts',
    hmMan: (c) => c.haeufung.methode === 'manuell',
    ikAnfang: (c) => c.ik.modus === 'anfang',
    ikZs: (c) => c.ik.modus === 'zs',
    ikEnde: (c) => c.ik.modus === 'ende',
    ikAny: (c) => c.ik.modus !== 'keine',
  };

  function renderForm() {
    const c = cur();
    // dynamische Listen
    const list = c.schutz.typ === 'gG' ? D.fuseIn : D.lsIn;
    fillSelect($('#selIn'), [['auto', 'automatisch (≥ IB)'], ...list.map((x) => [String(x), String(x)])], String(c.schutz.In));
    if ($('#selIn').value !== String(c.schutz.In)) c.schutz.In = 'auto';
    fillSelect($('#selMethod'), Object.entries(LD.METHOD_SHORT), c.verlegeart);
    $('#selMethod').title = LD.METHOD_LABEL[c.verlegeart] || '';
    const secs = sectionsFor(c);
    fillSelect($('#selS'), [['auto', 'automatisch (empfohlen)'], ...secs.map((s) => [String(s), fmtS(s) + ' mm²'])], String(c.querschnitt));
    if ($('#selS').value !== String(c.querschnitt)) c.querschnitt = 'auto';
    fillSelect($('#selPE'), [['nin', 'nach NIN 5.4.3 (auto)'], ['gleich', 'wie Polleiter'], ...D.sections.slice(0, 16).map((s) => [String(s), fmtS(s) + ' mm²'])], String(c.pe));
    const hmOpts = [['tab21', 'Tab. 21 – kH (gleichzeitig)'], ['tab38', 'Tab. 38 – kGH (nicht gleichz.)']];
    if (c.verlegeart === 'D') hmOpts.push(['ducts', 'Erdreich, Rohre mit Abstand']);
    hmOpts.push(['manuell', 'Faktor manuell']);
    if (c.haeufung.methode === 'ducts' && c.verlegeart !== 'D') c.haeufung.methode = 'tab21';
    fillSelect($('#selHM'), hmOpts, c.haeufung.methode);
    fillSelect($('#selArr'), Object.entries(LD.TAB21_ROWS).map(([k, v]) => [k, `${k} – ${v}`]), String(c.haeufung.anordnung));
    const ups = project.circuits.filter((x) => x.id !== c.id && !wouldCycle(c, x.id));
    if (c.upstream && !ups.some((x) => x.id === c.upstream)) c.upstream = '';
    fillSelect($('#selUp'), [['', 'keine (direkt ab Verteiler)'], ...ups.map((x) => [x.id, `${x.name}${x.desc ? ' – ' + x.desc : ''}`])], c.upstream || '');
    $('#optUp').hidden = !c.upstream;
    if (!c.upstream && c.ik.modus === 'upstream') c.ik.modus = 'keine';

    $$('[data-path]').forEach((el) => {
      const v = getPath(c, el.dataset.path);
      if (el.classList.contains('seg')) {
        $$('button', el).forEach((b) => b.classList.toggle('on', String(b.dataset.v) === String(v)));
      } else if (el.type === 'checkbox') el.checked = !!v;
      else if (document.activeElement !== el) el.value = v === undefined || v === null ? '' : String(v);
    });
    $$('[data-show]').forEach((el) => { const f = VIS[el.dataset.show]; el.classList.toggle('hide', f ? !f(c) : false); });
    $('#inpVor').disabled = !!c.upstream;
    if (c.upstream) { const e = effective(c); $('#inpVor').value = e._up && e._up.du !== null ? e._up.du.toFixed(2) : ''; }
    $('#lblTemp').innerHTML = c.verlegeart === 'D' ? 'Bodentemperatur<small>Tab. 19 (Referenz 20 °C)</small>' : 'Umgebungstemperatur<small>Tab. 18 (Referenz 30 °C)</small>';
    $$('[data-meta]').forEach((el) => { if (document.activeElement !== el) el.value = project.meta[el.dataset.meta] || ''; });
  }

  function onField(el) {
    const c = cur();
    const p = el.dataset.path;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'number') v = el.value === '' ? '' : parseFloat(el.value);
    else v = el.value;
    setPath(c, p, v);
    afterChange(p);
  }
  function afterChange(p) {
    const c = cur();
    if (p === 'netz') {
      if (c.netz === '1') c.leiter = 'LNPE';
      else if (c.leiter === 'LNPE') c.leiter = '3LNPE';
    }
    if (p === 'leiter') c.netz = c.leiter === 'LNPE' ? '1' : '3';
    if (p === 'verlegeart') {
      if (c.verlegeart === 'D' && +c.temp === 30) c.temp = 20;
      if (c.verlegeart !== 'D' && +c.temp === 20) c.temp = 30;
    }
    if (p === 'schutz.typ' && c.schutz.typ === 'LSV' && !c.schutz.Ir) c.schutz.Ir = '';
    setDirty(true);
    renderForm();
    renderResultsAndPanes();
    renderList();
  }

  /* ---------- Liste ---------- */
  function statusOf(res) {
    if (!res || !res.ok || !res.sel) return 'bad';
    if (!res.sel.okAll) return 'bad';
    const r = res.sel;
    if ([r.okShort, r.okFault].some((x) => x === null) || (res.zusatz.req && !res.zusatz.ok)) return res.zusatz.req && !res.zusatz.ok ? 'bad' : 'part';
    return 'ok';
  }
  function renderList() {
    const q = ($('#search').value || '').toLowerCase();
    const ul = $('#circuitList');
    ul.innerHTML = project.circuits
      .filter((c) => !q || (c.name + ' ' + c.desc).toLowerCase().includes(q))
      .map((c) => {
        if (isLocked(c)) return `<li data-id="${c.id}" class="locked ${c.id === curId ? 'active' : ''}"><span class="dot lock">${icon('i-lock')}</span><div><div class="t">${esc(c.name || '–')} <span>${esc(c.desc)}</span></div><small>Testversion – Lizenz nötig</small></div></li>`;
        const r = calc(c);
        const st = statusOf(r);
        const sub = r.ok && r.sel ? `${LD.cableDesignation(r, r.sel)} · ${r.d.label}` : r.ok ? 'kein gültiger Querschnitt' : r.error;
        return `<li data-id="${c.id}" class="${c.id === curId ? 'active' : ''}${newIds.has(c.id) ? ' new' : ''}"><span class="dot ${st}"></span><div><div class="t">${esc(c.name || '–')} <span>${esc(c.desc)}</span></div><small>${esc(sub)}</small></div></li>`;
      })
      .join('');
    $('#cCount').textContent = `(${project.circuits.length})`;
    newIds.clear();
  }

  /* ---------- Ergebnisse ---------- */
  function chk(ok, title, detail, badge) {
    const cls = ok === true ? 'ok' : ok === false ? 'bad' : 'na';
    const ic = ok === true ? 'i-check' : ok === false ? 'i-x' : 'i-dash';
    const b = badge || (ok === true ? 'i.O.' : ok === false ? 'nicht i.O.' : 'nicht geprüft');
    return `<div class="check ${cls}"><span class="ic"><svg><use href="#${ic}"/></svg></span><div><div class="t">${title}<em>${b}</em></div><div class="d">${detail}</div></div></div>`;
  }
  const A = (v, d = 1) => `${fmt(v, d)} A`;

  function checksFor(res) {
    const r = res.sel;
    const out = [];
    if (!r) return out;
    const tabTxt = res.tableNo ? `Tab. ${res.tableNo}, ${res.colKey === 'Fflat' ? 'F flach' : res.method}` : res.method;
    const Iname = res.basis === 'IB' ? 'I<sub>B</sub>' : 'I<sub>N</sub>';
    out.push({ key: 'load', ok: r.okLoad, title: 'Strombelastbarkeit', sub: 'NIN 5.2.3',
      d: `I<sub>korr</sub> = ${Iname} × k<sub>G</sub> ÷ (k<sub>ϑ</sub> × ${res.kHlabel === 'kGH' ? 'k<sub>GH</sub>' : 'k<sub>H</sub>'}${res.kSoil !== 1 ? ' × k<sub>Boden</sub>' : ''}) = ${fmt(res.Icalc, 1)} × ${fmt(res.kG, 2)} ÷ ${fmt(res.kTot, 3)} = <b>${A(res.Ikorr)}</b>${res.npar > 1 ? ` (÷ ${res.npar} = ${A(res.IkorrPer)} pro Leiter)` : ''}<br>Tabellenwert ${fmtS(r.S)} mm²: I<sub>tab</sub> = <b>${A(r.Itab)}</b> (${tabTxt})${r.loadUsed5 ? ' – 5-%-Regel angewendet' : ''}` });
    if (res.basis === 'IN') {
      out.push({ key: 'ovl', ok: r.okOverload, title: 'Überlastschutz', sub: 'NIN 4.3.3',
        d: `I<sub>B</sub> ≤ I<sub>N</sub> ≤ I<sub>Z</sub>: ${res.Ib ? fmt(res.Ib, 1) : '–'} ≤ ${fmt(res.In, 0)} ≤ <b>${A(r.IzEff)}</b>${res.kG !== 1 ? ' (I<sub>Z</sub> ÷ k<sub>G</sub>)' : ''}<br>I<sub>2</sub> = ${fmt(res.k2, 2)} × I<sub>N</sub> = ${A(r.I2)} ≤ 1,45 × I<sub>Z</sub> = ${A(1.45 * r.IzEff * res.tol)}` });
    } else {
      const Ir = res.motorIr;
      out.push({ key: 'ovl', ok: r.okOverload, title: 'Überlastschutz', sub: 'durch Verbraucher',
        d: `Überlastschutz durch den fest angeschlossenen Verbraucher${Ir ? ` / Motorschutz I<sub>r</sub> = ${A(Ir)} ≤ I<sub>Z</sub>` : ''}: I<sub>B</sub> = ${A(res.Ib)} ≤ I<sub>Z</sub> = <b>${A(r.IzEff)}</b>` });
    }
    out.push({ key: 'du', ok: r.okDu, title: 'Spannungsfall', sub: 'NIN 5.2.5',
      d: `Δu = <b>${fmt(r.du, 2)} %</b>${res.duVor ? ` + Vorbelastung ${fmt(res.duVor, 2)} % = <b>${fmt(r.duTot, 2)} %</b>` : ''} ≤ ${fmt(res.duLimit, 1)} % (ΔU = ${fmt(r.dU, 1)} V bei ${A(res.Idu)})<br>Max. Länge für ${fmt(res.duLimit, 1)} %: <b>${fmt(r.Lmax, 0)} m</b> (vorhanden ${fmt(res.L, 0)} m)` });
    if (res.ikAvailable && r.IkK) {
      let d;
      const dev = res.d;
      if (dev.typ === 'gG') {
        d = `I<sub>k</sub> Ende = ${A(r.IkEnd, 0)} × ${fmt(res.settings.ikFactor, 2)} = <b>${A(r.IkK, 0)}</b><br>t<sub>Üu</sub> = <b>${fmtT(r.tTrip)}</b>${r.tTripTxt && r.tTripTxt.startsWith('manuell') ? ' (manuell)' : ''} ≤ t<sub>Leiter</sub> = (k·S/I<sub>k</sub>)² = (${r.k}·${fmtS(Math.min(r.S, r.Spe) * res.npar)}/${fmt(r.IkK, 0)})² = <b>${fmtT(r.tCond)}</b>`;
      } else {
        const mag = dev.typ === 'LS' ? `${LD.LS_MAG[dev.char][1]} × I<sub>N</sub> = ${A(LD.LS_MAG[dev.char][1] * dev.In, 0)}` : dev.Ii ? `1,2 × I<sub>i</sub> = ${A(1.2 * dev.Ii, 0)}` : 'I<sub>i</sub> fehlt';
        d = `I<sub>k</sub> Ende = ${A(r.IkEnd, 0)} × ${fmt(res.settings.ikFactor, 2)} = <b>${A(r.IkK, 0)}</b> ${r.tTripTxt && r.tTripTxt.includes('magn') || r.tTripTxt.includes('Ii') ? '≥' : '<'} ${mag} → ${esc(r.tTripTxt)}`;
        if (r.i2t) d += `<br>I²t bei I<sub>k</sub> max ${fmt(res.ikMax / 1000, 1)} kA: ${fmt(r.i2t.v, 0)} A²s ${r.okI2t ? '≤' : '>'} k²S² = ${fmt(r.k2S2, 0)} A²s <span style="color:var(--muted)">(${esc(r.i2t.src)})</span>`;
        else if (res.ikMax) d += `<br>I²t-Prüfung: kein Normwert verfügbar – Herstellerwert eintragen.`;
        else d += `<br><span style="color:var(--muted)">I²t-Prüfung: I<sub>k</sub> max fehlt.</span>`;
      }
      out.push({ key: 'ks', ok: r.okShort, title: 'Kurzschlussschutz', sub: 'NIN 4.3.4', d });
      let fd;
      if (r.faultBy === 'RCD') fd = `Abschaltung durch RCD ${res.idn} mA (I<sub>k</sub> korr ${A(r.IkK, 0)} ≫ 5 × I<sub>Δn</sub>)`;
      else fd = `${esc(res.tMaxTxt)}: t<sub>Üu</sub> = <b>${fmtT(r.tTrip)}</b><br>I<sub>a</sub> (${fmt(res.tMax, 1)} s) = ${r.Ia ? A(r.Ia, 0) : '–'} ${r.Ia && r.IkK >= r.Ia ? '≤' : '>'} I<sub>k</sub> korr = ${A(r.IkK, 0)}${r.LmaxFault !== undefined ? ` · max. Länge <b>${fmt(r.LmaxFault, 0)} m</b>` : ''}`;
      out.push({ key: 'fs', ok: r.okFault, title: 'Fehlerschutz (Personenschutz)', sub: 'NIN 4.1.1.3', d: fd });
    } else {
      out.push({ key: 'ks', ok: null, title: 'Kurzschlussschutz', sub: 'NIN 4.3.4', d: 'Keine Kurzschlussangaben – im Block 7 I<sub>k</sub> oder Z<sub>s</sub> eingeben.' });
      out.push({ key: 'fs', ok: null, title: 'Fehlerschutz (Personenschutz)', sub: 'NIN 4.1.1.3', d: `${esc(res.tMaxTxt)} – ohne I<sub>k</sub> nicht prüfbar.` });
    }
    const z = res.zusatz;
    out.push({ key: 'rcd', ok: z.req ? !!z.ok : true, title: 'Zusatzschutz RCD', sub: 'NIN 4.1.1.3.3', d: esc(z.txt), badge: z.req ? (z.ok ? 'i.O.' : 'fehlt') : 'nicht erforderlich' });
    if (r.okIcn !== null) out.push({ key: 'icn', ok: r.okIcn, title: 'Schaltvermögen', sub: '', d: `I<sub>k</sub> max ${fmt(res.ikMax / 1000, 1)} kA ${r.okIcn ? '≤' : '>'} ${fmt(res.d.icn / 1000, 1)} kA` });
    out.push({ key: 'min', ok: r.okMin, title: 'Mindestquerschnitt', sub: 'NIN 5.2.4', d: `${fmtS(r.S)} mm² ≥ ${fmtS(res.settings.minSection[res.mat])} mm² ${res.mat === 'cu' ? 'Cu' : 'Al'}` });
    return out;
  }

  function renderPickbar(res, c) {
    const el = $('#pickbar');
    if (!el) return;
    if (!res.ok) { el.className = 'pickbar bad'; el.innerHTML = `<div class="pb-main"><span class="pb-lbl">Zu wählender Querschnitt</span><b>–</b><span class="pb-des">${esc(res.error)}</span></div>`; return; }
    const rec = res.rec, sel = res.sel;
    const manual = c.querschnitt !== 'auto' && c.querschnitt !== '';
    if (!rec) { el.className = 'pickbar bad'; el.innerHTML = `<div class="pb-main"><span class="pb-lbl">Zu wählender Querschnitt</span><b>–</b><span class="pb-des">Kein Querschnitt erfüllt alle Bedingungen – Schutzorgan, Verlegung oder Länge anpassen.</span></div>`; return; }
    const bad = manual && sel && !sel.okAll;
    el.className = 'pickbar ' + (bad ? 'bad' : 'ok');
    const pk = c.id + '|' + rec.S + '|' + (bad ? 1 : 0);
    if (lastRec.pick && lastRec.pick !== pk && lastRec.pickId === c.id) { void el.offsetWidth; el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 950); }
    lastRec.pick = pk; lastRec.pickId = c.id;
    const bumpIt = lastRec.pickPrev && lastRec.pickPrev !== rec.S && lastRec.pickPrevId === c.id;
    lastRec.pickPrev = rec.S; lastRec.pickPrevId = c.id;
    el.innerHTML = `<div class="pb-main"><span class="pb-lbl">${bad ? 'Korrekt zu wählen' : 'Zu wählender Querschnitt'}</span><b class="${bumpIt ? 'bump' : ''}">${fmtS(rec.S)} mm²</b><span class="pb-des">${esc(LD.cableDesignation(res, rec))} · ${esc(res.d.label)}</span></div>
      <div class="pb-side">${bad ? `<span class="x">Gewählt ${fmtS(sel.S)} mm² ist nicht zulässig</span>` : manual && sel && sel.S !== rec.S ? `Gewählt (manuell): <b>${fmtS(sel.S)} mm²</b>` : `Massgebend: <b>${esc(res.governing.join(', '))}</b>`}<br>I<sub>Z</sub> ${A(rec.IzEff)} · Δu ${fmt(rec.duTot, 2)} % · L<sub>max</sub> ${fmt(rec.Lmax, 0)} m${rec.IkEnd ? ` · I<sub>k</sub> ${A(rec.IkEnd, 0)}` : ''}</div>`;
  }

  function renderResults(res, c) {
    const el = $('#results');
    if (!res.ok) { el.innerHTML = `<div class="empty">${icon('i-warn')}<p>${esc(res.error)}</p></div>`; return; }
    const r = res.sel;
    const manual = c.querschnitt !== 'auto' && c.querschnitt !== '';
    const st = statusOf(res);
    let head = '';
    if (r) {
      const stTxt = st === 'ok' ? 'Alle Nachweise erfüllt' : st === 'part' ? 'Erfüllt – nicht alles geprüft' : 'Nachweise nicht erfüllt';
      head = `<div class="res-head">
        <div class="lbl">${manual ? 'Gewählter Querschnitt (manuell)' : 'Zu wählender Querschnitt'}</div>
        <div class="big"><b>${fmtS(r.S)}</b><span>mm² ${res.mat === 'cu' ? 'Cu' : 'Al'} ${res.iso === 'pvc' ? 'PVC' : 'VPE'}${res.npar > 1 ? ` · ${res.npar} parallel` : ''}</span></div>
        <div class="desig">${esc(LD.cableDesignation(res, r))}</div>
        <div class="gov">${manual ? (res.rec ? (res.rec.S === r.S ? 'Entspricht dem korrekten Querschnitt.' : `<span style="color:${r.okAll ? 'var(--muted)' : 'var(--bad)'}">${r.okAll ? 'Zulässig, kleinster korrekter Querschnitt wäre' : 'Nicht zulässig – korrekt zu wählen'}: </span><b>${fmtS(res.rec.S)} mm²</b> (${esc(LD.cableDesignation(res, res.rec))})`) : 'Kein Querschnitt erfüllt alle Bedingungen') : `Massgebend: <b>${esc(res.governing.join(', '))}</b> · Schutzorgan <b>${esc(res.d.label)}</b>`}</div>
        <div class="status-pill ${st}">${icon(st === 'bad' ? 'i-x' : 'i-check')}${stTxt}</div>
      </div>`;
    } else {
      head = `<div class="res-head"><div class="lbl">Ergebnis</div><div class="big"><b>–</b><span>kein Querschnitt</span></div><div class="gov">Kein tabellierter Querschnitt erfüllt alle Bedingungen.</div><div class="status-pill bad">${icon('i-x')}Nicht lösbar</div></div>`;
    }
    const kv = r ? `<div class="kv">
      <div><small>I<sub>B</sub></small><b>${res.Ib ? A(res.Ib) : '–'}</b></div>
      <div><small>Schutzorgan${res.inAuto ? ' (auto)' : ''}</small><b>${esc(res.d.typ === 'LS' ? res.d.char + fmt(res.In, 0) : res.d.typ === 'gG' ? 'gG ' + fmt(res.In, 0) + ' A' : 'Ir ' + fmt(res.In, 0) + ' A')}</b></div>
      <div><small>I<sub>korr</sub></small><b>${A(res.Ikorr)}</b></div>
      <div><small>I<sub>Z</sub></small><b>${A(r.IzEff)}</b></div>
      <div><small>Δu</small><b>${fmt(r.duTot, 2)} %</b></div>
      <div><small>I<sub>k</sub> Ende</small><b>${r.IkEnd ? A(r.IkEnd, 0) : '–'}</b></div>
    </div>` : '';
    const checks = r ? `<div class="checks">${checksFor(res).map((x) => chk(x.ok, x.title, x.d + (x.sub ? `<div class="ref">${x.sub}</div>` : ''), x.badge)).join('')}</div>` : '';
    const notes = [...res.warn.map((w) => ['warn', w]), ...res.info.map((w) => ['info', w])];
    const nt = notes.length ? `<div class="notes">${notes.map(([k, t]) => `<div class="note ${k}">${icon(k === 'warn' ? 'i-warn' : 'i-info')}<div>${esc(t)}</div></div>`).join('')}</div>` : '';
    el.innerHTML = head + kv + checks + nt;
    const key = c.id + '|' + (r ? r.S : '-');
    if (lastRec.res && lastRec.res !== key && lastRec.resId === c.id) { const b = $('.res-head .big b', el); b && b.classList.add('bump'); }
    lastRec.res = key; lastRec.resId = c.id;
    if (justSwitched) { const ch = $('.checks', el); ch && ch.classList.add('stagger'); }
  }

  /* ---------- Vergleich ---------- */
  const yn = (v) => (v === true ? '<span class="y">✓</span>' : v === false ? '<span class="x">✗</span>' : '<span class="na">–</span>');
  function renderCompare(res, c) {
    const el = $('#pane-compare');
    if (!res.ok) { el.innerHTML = `<div class="empty">${esc(res.error)}</div>`; return; }
    const ikA = res.ikAvailable;
    el.innerHTML = `<div class="pane-intro"><div><h2>Querschnittsvergleich</h2><p>${esc(c.name)} · ${esc(LD.METHOD_LABEL[res.method])} · ${res.n} belastete Leiter · I<sub>korr</sub> = ${A(res.Ikorr)} — Zeile anklicken, um den Querschnitt festzulegen.</p></div>
      <button class="btn" data-cmd="autoS">Automatisch wählen</button></div>
      <div style="overflow-x:auto"><table class="grid compact"><thead><tr>
      <th class="n">S [mm²]</th><th class="n">PE</th><th class="n">I<sub>tab</sub> [A]</th><th class="n">I<sub>Z</sub> [A]</th><th>Last</th><th>Üb.</th>
      <th class="n">Δu [%]</th><th class="n">L<sub>max</sub> Δu [m]</th>
      ${ikA ? '<th class="n">I<sub>k</sub> Ende [A]</th><th class="n">I<sub>k</sub> korr [A]</th><th class="n">t<sub>Üu</sub></th><th class="n">t<sub>Leiter</sub></th><th>KS</th><th>FS</th><th class="n">L<sub>max</sub> FS [m]</th>' : ''}
      <th>Gesamt</th></tr></thead><tbody>
      ${res.rows.map((r) => `<tr data-s="${r.S}" class="${res.rec && r.S === res.rec.S ? 'rec' : ''} ${res.sel && r.S === res.sel.S ? 'sel' : ''}">
        <td class="n"><b>${fmtS(r.S)}</b>${res.rec && r.S === res.rec.S ? '<span class="tag g">empfohlen</span>' : ''}</td><td class="n">${fmtS(r.Spe)}</td>
        <td class="n">${fmt(r.Itab, r.Itab % 1 ? 1 : 0)}</td><td class="n">${fmt(r.IzEff, 1)}</td><td>${yn(r.okLoad)}</td><td>${yn(r.okOverload)}</td>
        <td class="n ${r.okDu ? '' : 'x'}">${fmt(r.duTot, 2)}</td><td class="n">${fmt(r.Lmax, 0)}</td>
        ${ikA ? `<td class="n">${fmt(r.IkEnd, 0)}</td><td class="n">${fmt(r.IkK, 0)}</td><td class="n">${fmtT(r.tTrip)}</td><td class="n">${fmtT(r.tCond)}</td><td>${yn(r.okShort)}</td><td>${yn(r.okFault)}</td><td class="n">${r.LmaxFault !== undefined ? fmt(r.LmaxFault, 0) : '–'}</td>` : ''}
        <td>${yn(r.okAll)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="legend">Last = Strombelastbarkeit · Üb. = Überlastschutz · KS = Kurzschlussschutz (Leiter) · FS = Fehlerschutz · I<sub>k</sub> korr = I<sub>k</sub> × ${fmt(res.settings.ikFactor, 2)} · t<sub>Leiter</sub> = (k·S/I<sub>k korr</sub>)²</div>`;
  }

  /* ---------- Spannungsfall ---------- */
  function niceCeil(x) {
    if (!(x > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(x)));
    for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= x - 1e-9) return m * p;
    return 10 * p;
  }
  function duChart(res) {
    const r = res.sel;
    if (!r || !Number.isFinite(r.Lmax)) return '';
    const rows = res.rows;
    const idx = rows.indexOf(r);
    const plot = rows.slice(Math.max(0, idx - 2), idx + 3);
    const W = 660, H = 270, ml = 46, mr = 70, mt = 14, mb = 36;
    const xMax = niceCeil(Math.max(res.L * 1.4, r.Lmax * 1.15, 10));
    const yMax = niceCeil(Math.max(res.duLimit * 1.5, r.duTot * 1.15, res.duVor + 0.5));
    const X = (v) => ml + (v / xMax) * (W - ml - mr);
    const Y = (v) => mt + (1 - v / yMax) * (H - mt - mb);
    let g = '';
    for (let i = 0; i <= 5; i++) { const v = (yMax / 5) * i; g += `<line x1="${ml}" x2="${W - mr}" y1="${Y(v)}" y2="${Y(v)}" stroke="#eee"/><text x="${ml - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="#777">${fmt(v, yMax < 5 ? 1 : 0)}</text>`; }
    for (let i = 0; i <= 5; i++) { const v = (xMax / 5) * i; g += `<line y1="${mt}" y2="${H - mb}" x1="${X(v)}" x2="${X(v)}" stroke="#f2f2f2"/><text x="${X(v)}" y="${H - mb + 16}" text-anchor="middle" font-size="11" fill="#777">${fmt(v, 0)}</text>`; }
    g += `<text x="${(ml + W - mr) / 2}" y="${H - 4}" text-anchor="middle" font-size="11" fill="#555">Leitungslänge [m]</text><text x="12" y="${(mt + H - mb) / 2}" transform="rotate(-90 12 ${(mt + H - mb) / 2})" text-anchor="middle" font-size="11" fill="#555">Δu [%]</text>`;
    g += `<line x1="${ml}" x2="${W - mr}" y1="${Y(res.duLimit)}" y2="${Y(res.duLimit)}" stroke="#c42b1c" stroke-dasharray="5 4"/><text x="${W - mr + 4}" y="${Y(res.duLimit) + 4}" font-size="11" fill="#c42b1c">${fmt(res.duLimit, 1)} %</text>`;
    plot.forEach((p) => {
      if (!Number.isFinite(p.Lmax) || p.Lmax <= 0) return;
      const slope = (res.duLimit - res.duVor) / p.Lmax;
      let x2 = xMax, y2 = res.duVor + slope * xMax;
      if (y2 > yMax) { y2 = yMax; x2 = (yMax - res.duVor) / slope; }
      const on = p === r;
      g += `<line x1="${X(0)}" y1="${Y(res.duVor)}" x2="${X(x2)}" y2="${Y(y2)}" stroke="${on ? '#0f6cbd' : '#b5b5b5'}" stroke-width="${on ? 2.4 : 1.3}"/>`;
      g += `<text x="${X(x2) + (x2 < xMax ? 4 : 4)}" y="${Y(y2) + (x2 < xMax ? 10 : 4)}" font-size="11" fill="${on ? '#0f6cbd' : '#888'}" font-weight="${on ? 600 : 400}">${fmtS(p.S)} mm²</text>`;
    });
    g += `<line x1="${X(res.L)}" x2="${X(res.L)}" y1="${mt}" y2="${H - mb}" stroke="#555" stroke-dasharray="3 3"/><text x="${X(res.L) + 4}" y="${H - mb - 6}" font-size="11" fill="#555">L = ${fmt(res.L, 0)} m</text>`;
    g += `<circle cx="${X(res.L)}" cy="${Y(Math.min(r.duTot, yMax))}" r="4.5" fill="${r.okDu ? '#0e7a0d' : '#c42b1c'}" stroke="#fff" stroke-width="1.5"/>`;
    if (r.Lmax <= xMax) g += `<circle cx="${X(r.Lmax)}" cy="${Y(res.duLimit)}" r="3.5" fill="#0f6cbd"/><text x="${X(r.Lmax)}" y="${Y(res.duLimit) - 8}" text-anchor="middle" font-size="11" fill="#0f6cbd">L<tspan font-size="8" dy="2">max</tspan><tspan dy="-2"> ${fmt(r.Lmax, 0)} m</tspan></text>`;
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block">${g}</svg>`;
  }
  function renderDu(res, c) {
    const el = $('#pane-du');
    if (!res.ok) { el.innerHTML = `<div class="empty">${esc(res.error)}</div>`; return; }
    const r = res.sel;
    if (!r) { el.innerHTML = `<div class="empty">Kein gültiger Querschnitt.</div>`; return; }
    const Uref = res.threePh ? res.U : res.U0;
    const rho = res.settings.rhoDu[res.mat];
    const b = res.threePh ? '√3' : '2';
    const formula = res.duMethod === 'nin'
      ? `ΔU = ${b} · I · L · ρ / S = ${b} · ${fmt(res.Idu, 1)} A · ${fmt(res.L, 0)} m · ${fmt(rho, 4)} Ω·mm²/m / ${fmtS(r.S)}${res.npar > 1 ? ' / ' + res.npar : ''} mm² = <b>${fmt(r.dU, 2)} V</b>`
      : `ΔU = ${b} · I · L · (R′·cos φ + X′·sin φ) = ${b} · ${fmt(res.Idu, 1)} A · ${fmt(res.L, 0)} m · (${fmt((rho / r.S / res.npar) * 1000, 3)} · ${fmt(res.cosphi, 2)} + ${fmt(res.settings.xPrime / res.npar, 3)} · ${fmt(Math.sqrt(1 - res.cosphi * res.cosphi), 2)}) mΩ/m = <b>${fmt(r.dU, 2)} V</b>`;
    const chain = chainOf(c);
    const maxBar = Math.max(res.duLimit, ...chain.map((x) => (x.r.ok && x.r.sel ? x.r.sel.duTot : 0))) * 1.08;
    const cols = ['#0f6cbd', '#5b9bd5', '#9cc3e8', '#3a7d44', '#8fbf6a'];
    const bar = chain.map((x, i) => { const d = x.r.ok && x.r.sel ? x.r.sel.du : 0; return `<div title="${esc(x.c.name)}: ${fmt(d, 2)} %" style="width:${(d / maxBar) * 100}%;background:${cols[i % cols.length]}"></div>`; }).join('');
    el.innerHTML = `<div class="pane-intro"><div><h2>Spannungsfall</h2><p>${esc(c.name)} ${esc(c.desc)} · ${res.duMethod === 'nin' ? 'Berechnung wie NIN 6.1.3 Fig. 3 (Wirkwiderstand bei 70 °C)' : 'genaue Berechnung mit cos φ und Reaktanz'} · zulässig ${fmt(res.duLimit, 1)} %</p></div></div>
      <div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
        <div class="card"><h4>Berechnung für ${fmtS(r.S)} mm²</h4>
          <div class="fgrid" style="grid-template-columns:150px 1fr">
            <label>Strom</label><div>${A(res.Idu)} ${res.Ib ? '(I<sub>B</sub>)' : '(I<sub>N</sub>, kein I<sub>B</sub>)'}</div>
            <label>Länge</label><div>${fmt(res.L, 0)} m</div>
            <label>Spannungsfall ΔU</label><div><b>${fmt(r.dU, 2)} V</b> = <b>${fmt(r.du, 2)} %</b> von ${fmt(Uref, 0)} V</div>
            <label>Vorbelastung</label><div>${fmt(res.duVor, 2)} %${res.up ? ` (aus «${esc(res.up.name)}»)` : ''}</div>
            <label>Total am Leitungsende</label><div class="${r.okDu ? 'y' : 'x'}">${fmt(r.duTot, 2)} % ${r.okDu ? '≤' : '>'} ${fmt(res.duLimit, 1)} %</div>
            <label>Spannung am Ende</label><div><b>${fmt(Uref * (1 - r.duTot / 100), 1)} V</b> ${res.threePh ? '(Aussenleiter)' : ''}</div>
            <label>Max. Länge (${fmt(res.duLimit, 1)} %)</label><div><b>${fmt(r.Lmax, 0)} m</b></div>
            <div class="hint">${formula}<br>Δu = ΔU / ${fmt(Uref, 0)} V × 100 = ${fmt(r.du, 2)} %</div>
          </div>
        </div>
        <div class="card"><h4>Verkettung ab Einspeisung</h4>
          <table class="grid compact" style="border-radius:6px"><thead><tr><th>Stromkreis</th><th class="n">S</th><th class="n">L [m]</th><th class="n">Δu [%]</th><th class="n">Σ Δu [%]</th></tr></thead><tbody>
          ${chain.map((x) => { const s = x.r.ok ? x.r.sel : null; return `<tr data-id="${x.c.id}" title="${esc(x.c.desc)}"><td><b>${esc(x.c.name)}</b></td><td class="n">${s ? fmtS(s.S) : '–'}</td><td class="n">${fmt(+x.c.laenge, 0)}</td><td class="n">${s ? fmt(s.du, 2) : '–'}</td><td class="n ${s && !s.okDu ? 'x' : ''}">${s ? fmt(s.duTot, 2) : '–'}</td></tr>`; }).join('')}
          </tbody></table>
          <div style="margin-top:10px;position:relative;height:18px;background:#f3f3f3;border-radius:4px;display:flex;overflow:hidden">${bar}<div style="position:absolute;top:-3px;bottom:-3px;left:${(res.duLimit / maxBar) * 100}%;border-left:2px dashed #c42b1c"></div></div>
          <div class="legend">${chain.length < 2 ? 'Tipp: Unter «Spannungsfall → Vorgeschaltete Leitung» die Zuleitung wählen, dann wird deren Δu automatisch addiert.' : 'Rote Linie = zulässiger Spannungsfall'}</div>
        </div>
      </div>
      <div class="card" style="margin-top:12px"><h4>Δu über der Leitungslänge (wie Nomogramm NIN 6.1.3 Fig. 3)</h4>${duChart(res)}</div>
      <div style="margin-top:12px"><table class="grid"><thead><tr><th class="n">S [mm²]</th><th class="n">ΔU [V]</th><th class="n">Δu [%]</th><th class="n">Σ Δu [%]</th><th class="n">U Ende [V]</th><th class="n">L<sub>max</sub> [m]</th><th>Δu</th><th>alle Nachweise</th></tr></thead><tbody>
      ${res.rows.map((x) => `<tr data-s="${x.S}" class="${res.rec && x.S === res.rec.S ? 'rec' : ''} ${x === r ? 'sel' : ''}"><td class="n"><b>${fmtS(x.S)}</b></td><td class="n">${fmt(x.dU, 2)}</td><td class="n">${fmt(x.du, 2)}</td><td class="n">${fmt(x.duTot, 2)}</td><td class="n">${fmt(Uref * (1 - x.duTot / 100), 1)}</td><td class="n">${fmt(x.Lmax, 0)}</td><td>${yn(x.okDu)}</td><td>${yn(x.okAll)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  /* ---------- Rechenweg (Schulschema) ---------- */
  function calcRows(res, c) {
    const r = res.sel;
    const ev = (ok) => (ok === true ? '<span class="y">i.O.</span>' : ok === false ? '<span class="x">nicht i.O.</span>' : '<span class="na">–</span>');
    const rows = [];
    const sec = (t) => rows.push(`<tr class="sec"><td colspan="4">${t}</td></tr>`);
    const row = (pos, desc, val, okv, formula) => rows.push(`<tr><td class="pos">${pos}</td><td>${desc}${formula ? `<span class="formula">${formula}</span>` : ''}</td><td class="val">${val}</td><td class="ev">${okv === undefined ? '' : ev(okv)}</td></tr>`);
    sec('Strombelastbarkeit – NIN 5.2.3');
    row(1, 'Strom bestimmen: I<sub>N</sub> (Üu) / I<sub>B</sub> (Betriebsmittel)', `I<sub>N</sub> = ${res.In ? A(res.In, 0) : '–'} · I<sub>B</sub> = ${res.Ib ? A(res.Ib) : '–'} → gerechnet mit <b>${res.basis === 'IB' ? 'I<sub>B</sub>' : 'I<sub>N</sub>'} = ${A(res.Icalc)}</b>`);
    row(2, 'Verlegeart', esc(LD.METHOD_LABEL[res.method]) + (res.colKey === 'Fflat' ? ' (flach)' : ''));
    row(3, 'Leiter-Isolationsmaterial', `${res.iso === 'pvc' ? 'PVC (70 °C)' : 'VPE/EPR (90 °C)'} · ${res.mat === 'cu' ? 'Kupfer' : 'Aluminium'}`);
    row(4, `${res.method === 'D' ? 'Bodentemperatur' : 'Umgebungstemperatur'} → k<sub>ϑ</sub>`, `${fmt(res.temp, 0)} °C → k<sub>ϑ</sub> = <b>${fmt(res.kT, 2)}</b>${res.kTstep === 'manuell' ? ' (manuell)' : ` (Tab. ${res.method === 'D' ? 19 : 18})`}${res.kSoil !== 1 ? ` · k<sub>Boden</sub> = ${fmt(res.kSoil, 2)}` : ''}`);
    row(5, `Häufung → ${res.kHlabel === 'kGH' ? 'k<sub>GH</sub>' : 'k<sub>H</sub>'}`, `${esc(res.kHsrc)} → <b>${fmt(res.kH, 2)}</b>`);
    row(6, 'Gleichzeitigkeit k<sub>G</sub>', `<b>${fmt(res.kG, 2)}</b>${res.kG === 1 ? ' (gleichzeitig / kein Faktor)' : ''}`);
    row(7, 'Anzahl belastete Leiter', `${res.n} (${res.n === 2 ? 'zweiadrig' : 'dreiadrig'})${res.tableNo ? ` → NIN 5.2.3 Tab. ${res.tableNo}` : ''}`);
    row(8, 'Korrigierter Strom', `<b>${A(res.Ikorr)}</b>`, undefined, `I<sub>korr</sub> = I × k<sub>G</sub> ÷ (k<sub>ϑ</sub> × k<sub>H</sub>) = ${fmt(res.Icalc, 1)} × ${fmt(res.kG, 2)} ÷ (${fmt(res.kT, 2)} × ${fmt(res.kH, 2)}${res.kSoil !== 1 ? ' × ' + fmt(res.kSoil, 2) : ''})`);
    if (!r) { row(9, 'Querschnitt aus Tabelle', 'kein gültiger Querschnitt', false); return rows.join(''); }
    row(9, 'Querschnitt aus Tabelle', `<b>${fmtS(r.S)} mm²</b> · I<sub>tab</sub> = ${A(r.Itab)}${r.loadUsed5 ? ' (5-%-Regel)' : ''}`, r.okLoad);
    row(10, 'Leitungslänge ≤ max. Länge Spannungsfall', `${fmt(res.L, 0)} m ≤ ${fmt(r.Lmax, 0)} m · Δu = ${fmt(r.duTot, 2)} %`, r.okDu, res.duMethod === 'nin' ? `ΔU = ${res.threePh ? '√3' : '2'} · I · L · ρ / S, ρ = ${fmt(res.settings.rhoDu[res.mat], 4)} Ω·mm²/m (NIN 6.1.3 Fig. 3)` : `ΔU = ${res.threePh ? '√3' : '2'} · I · L · (R′·cos φ + X′·sin φ), cos φ = ${fmt(res.cosphi, 2)}`);
    sec('Leitungsschutz – Überlastschutz NIN 4.3');
    row(11, 'Überlastschutz I<sub>B</sub> ≤ I<sub>N</sub> ≤ I<sub>Z</sub>', res.basis === 'IN' ? `${res.Ib ? fmt(res.Ib, 1) : '–'} ≤ ${fmt(res.In, 0)} ≤ ${fmt(r.IzEff, 1)} A · I<sub>2</sub> ${fmt(r.I2, 1)} ≤ ${fmt(1.45 * r.IzEff * res.tol, 1)} A` : `durch Verbraucher: I<sub>B</sub> ${fmt(res.Ib, 1)} ≤ I<sub>Z</sub> ${fmt(r.IzEff, 1)} A`, r.okOverload);
    sec('Leitungsschutz – Kurzschlussschutz NIN 4.3');
    if (res.ikAvailable && r.IkK) {
      row(12, 'I<sub>k</sub> am Leitungsende (min)', `${A(r.IkEnd, 0)} · k = ${r.k}`, undefined, res.ikMode === 'ende' ? 'gegeben' : `I<sub>k</sub> = U<sub>0</sub> / (Z<sub>v</sub> + ρ·L·(1/S + 1/S<sub>PE</sub>)) = ${fmt(res.U0, 0)} / (${fmt(res.Zv, 3)} + ${fmt(r.Rloop, 3)}) Ω`);
      row(13, 'Faktor / korrigierter I<sub>k</sub>', `× ${fmt(res.settings.ikFactor, 2)} = <b>${A(r.IkK, 0)}</b>`);
      if (res.d.typ === 'gG') {
        row(14, 'Abschaltzeit (Leiter) [k × S / I<sub>k</sub>]²', `<b>${fmtT(r.tCond)}</b>`, undefined, `(${r.k} × ${fmtS(Math.min(r.S, r.Spe) * res.npar)} / ${fmt(r.IkK, 0)})²`);
        row(15, 'Abschaltzeit Üu (Kennlinie)', `<b>${fmtT(r.tTrip)}</b>`, undefined, r.tTripTxt && r.tTripTxt.startsWith('manuell') ? 'manuell eingegeben' : `mittlere Kennlinie gG ${fmt(res.In, 0)} A`);
        row(16, 'Kurzschlussschutz erfüllt: t Kennlinie-Üu ≤ t Leiter', `${fmtT(r.tTrip)} ≤ ${fmtT(r.tCond)}`, r.okShort);
      } else {
        row(14, 'I<sub>k</sub> max: I²t (Durchlassenergie) ≤ k² × S²', r.i2t ? `${fmt(r.i2t.v, 0)} ≤ ${fmt(r.k2S2, 0)} A²s` : 'nicht geprüft', r.okI2t === null ? undefined : r.okI2t, r.i2t ? esc(r.i2t.src) : '');
        row(15, 'Abschaltzeit Üu / I magn. Auslöser', esc(r.tTripTxt), undefined);
        row(16, 'Kurzschlussschutz erfüllt: I<sub>k</sub> min ausgelöst / I²t ≤ k²S²', '', r.okShort);
      }
    } else {
      row('12–16', 'Kurzschlussschutz', 'keine Kurzschlussangaben', undefined);
    }
    sec('Personenschutz – NIN 4.1');
    row(17, 'Fehlerschutz', res.ikAvailable && r.IkK ? (r.faultBy === 'RCD' ? `durch RCD ${res.idn} mA` : `${esc(res.tMaxTxt)} · t<sub>Üu</sub> = ${fmtT(r.tTrip)}`) : esc(res.tMaxTxt), r.okFault === null ? undefined : r.okFault);
    row(18, 'Zusatzschutz RCD 30 mA', res.zusatz.req ? (res.zusatz.ok ? 'benötigt – vorhanden' : 'benötigt – fehlt') : 'nicht benötigt', res.zusatz.req ? !!res.zusatz.ok : undefined);
    return rows.join('');
  }
  function renderCalc(res, c) {
    const el = $('#pane-calc');
    if (!res.ok) { el.innerHTML = `<div class="empty">${esc(res.error)}</div>`; return; }
    el.innerHTML = `<div class="pane-intro"><div><h2>Rechenweg – Bestimmung Querschnitt</h2><p>${esc(c.name)} ${esc(c.desc)} · Aufbau wie Lösungsblatt «Bestimmung Querschnitt» (Pos. 1–18)</p></div></div>
      <table class="calc"><thead><tr><th>Pos.</th><th>Beschreibung</th><th>Wert</th><th style="text-align:center">Bewertung</th></tr></thead><tbody>${calcRows(res, c)}</tbody></table>`;
  }

  /* ---------- Kabelliste ---------- */
  function listRows() {
    return project.circuits.filter((c) => !isLocked(c)).map((c) => {
      const r = calc(c);
      const s = r.ok ? r.sel : null;
      return { c, r, s, st: statusOf(r) };
    });
  }
  function renderKabelliste() {
    const el = $('#pane-list');
    const rows = listRows();
    el.innerHTML = `<div class="pane-intro"><div><h2>Kabelliste</h2><p>${rows.length} Stromkreise · ${rows.filter((x) => x.st === 'ok').length} vollständig erfüllt · ${rows.filter((x) => x.st === 'bad').length} nicht erfüllt</p></div><button class="btn" data-cmd="csv">Als CSV exportieren</button></div>
      <table class="grid"><thead><tr><th>Bez.</th><th>Beschreibung</th><th>Netz</th><th>Schutzorgan</th><th class="n">I<sub>B</sub> [A]</th><th class="n">L [m]</th><th>Verl.</th><th>Kabel</th><th class="n">Δu [%]</th><th class="n">I<sub>k</sub> Ende [A]</th><th>Status</th></tr></thead><tbody>
      ${rows.map(({ c, r, s, st }) => `<tr data-id="${c.id}"><td><b>${esc(c.name)}</b></td><td>${esc(c.desc)}</td><td>${c.netz === '1' ? '1 × 230 V' : '3 × 400 V'}</td><td>${r.ok ? esc(r.d.label) : '–'}</td><td class="n">${r.ok && r.Ib ? fmt(r.Ib, 1) : '–'}</td><td class="n">${fmt(+c.laenge, 0)}</td><td>${esc(c.verlegeart)}</td><td>${s ? esc(LD.cableDesignation(r, s)) : '<span class="x">–</span>'}</td><td class="n">${s ? fmt(s.duTot, 2) : '–'}</td><td class="n">${s && s.IkEnd ? fmt(s.IkEnd, 0) : '–'}</td><td><span class="dot ${st}" style="display:inline-block;margin:0 6px 0 0;vertical-align:-1px"></span>${st === 'ok' ? 'i.O.' : st === 'part' ? 'teilw. geprüft' : 'nicht i.O.'}</td></tr>`).join('')}
      </tbody></table>`;
  }
  function csvExport() {
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const head = ['Bezeichnung', 'Beschreibung', 'Art', 'Netz', 'Schutzorgan', 'I_B [A]', 'I_N [A]', 'Länge [m]', 'Verlegeart', 'Material', 'Isolation', 'Querschnitt [mm2]', 'PE [mm2]', 'Kabel', 'I_korr [A]', 'I_Z [A]', 'Δu [%]', 'Ik Ende [A]', 'Status'];
    const lines = [head.map(q).join(';')];
    listRows().forEach(({ c, r, s, st }) => {
      const n = (v, d) => (v === null || v === undefined || !Number.isFinite(v) ? '' : v.toFixed(d).replace('.', ','));
      lines.push([c.name, c.desc, { end: 'Endstromkreis', sd: 'Steckdosen', vert: 'Verteilstromkreis' }[c.kreisTyp], c.netz === '1' ? '1x230V' : '3x400V', r.ok ? r.d.label : '', r.ok ? n(r.Ib, 1) : '', r.ok ? n(r.In, 0) : '', n(+c.laenge, 0), c.verlegeart, c.material === 'cu' ? 'Cu' : 'Al', c.isolation === 'pvc' ? 'PVC' : 'VPE', s ? String(s.S).replace('.', ',') : '', s ? String(s.Spe).replace('.', ',') : '', s ? LD.cableDesignation(r, s) : '', r.ok ? n(r.Ikorr, 1) : '', s ? n(s.IzEff, 1) : '', s ? n(s.duTot, 2) : '', s && s.IkEnd ? n(s.IkEnd, 0) : '', st === 'ok' ? 'i.O.' : st === 'part' ? 'teilweise geprüft' : 'nicht i.O.'].map(q).join(';'));
    });
    const content = '﻿' + lines.join('\r\n');
    const name = suggestedName('csv').replace('.csv', ' - Kabelliste.csv');
    if (native) native.saveText({ content, defaultName: name, filters: [{ name: 'CSV (Excel)', extensions: ['csv'] }] }).then((p) => p && toast('Exportiert: ' + baseName(p), true));
    else download(name, content, 'text/csv;charset=utf-8');
  }

  /* ---------- Bericht ---------- */
  function reportHTML() {
    const m = project.meta;
    const rows = listRows();
    const stt = (st) => (st === 'ok' ? '<span class="ok">i.O.</span>' : st === 'part' ? 'teilw.' : '<span class="bad">nicht i.O.</span>');
    let h = `<div class="rp">${isTest() ? '<div class="rp-watermark">TESTVERSION</div>' : ''}<div class="rp-brand">${markTileSvg('rp-mark')}${wordmarkSvg(false, 26, 'rp-wm')}<span>Leitungsdimensionierung · NIN 2025</span></div><h1>Leitungsdimensionierung</h1>
      <div class="meta"><span>Projekt</span><b>${esc(m.projekt || '–')}</b><span>Datum</span><b>${esc(m.datum || today())}</b>
      <span>Objekt</span><b>${esc(m.objekt || '–')}</b><span>Bearbeiter</span><b>${esc(m.bearbeiter || '–')}</b>
      <span>Firma</span><b>${esc(m.firma || '–')}</b><span>Grundlage</span><b>NIN 2025 (SN 411000:2025)</b></div>
      <h2>Kabelliste</h2><table><thead><tr><th>Bez.</th><th>Beschreibung</th><th>Schutzorgan</th><th class="n">I<sub>B</sub> [A]</th><th class="n">L [m]</th><th>Verl.</th><th>Kabel</th><th class="n">Δu [%]</th><th class="n">I<sub>k</sub> [A]</th><th>Status</th></tr></thead><tbody>
      ${rows.map(({ c, r, s, st }) => `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.desc)}</td><td>${r.ok ? esc(r.d.label) : '–'}</td><td class="n">${r.ok && r.Ib ? fmt(r.Ib, 1) : '–'}</td><td class="n">${fmt(+c.laenge, 0)}</td><td>${esc(c.verlegeart)}</td><td>${s ? esc(LD.cableDesignation(r, s)) : '–'}</td><td class="n">${s ? fmt(s.duTot, 2) : '–'}</td><td class="n">${s && s.IkEnd ? fmt(s.IkEnd, 0) : '–'}</td><td>${stt(st)}</td></tr>`).join('')}
      </tbody></table>`;
    const st0 = LD.compute(project.circuits[0], project.settings).settings;
    h += `<p class="small">Rechenparameter: ρ Spannungsfall Cu ${fmt(st0.rhoDu.cu, 4)} / Al ${fmt(st0.rhoDu.al, 4)} Ω·mm²/m · ρ Kurzschluss Cu ${fmt(st0.rhoIk.cu, 4)} / Al ${fmt(st0.rhoIk.al, 4)} Ω·mm²/m · Korrekturfaktor I<sub>k</sub> × ${fmt(st0.ikFactor, 2)} · 5-%-Regel ${st0.fivePct ? 'ein' : 'aus'} · gG-Kennlinien: mittlere Zeit-/Strom-Kennlinien${st0.fuseTol ? ` + ${st0.fuseTol} %` : ''}.</p>`;
    rows.forEach(({ c, r, s, st }) => {
      h += `<div class="circ"><h2>${esc(c.name)} ${c.desc ? '– ' + esc(c.desc) : ''}</h2>`;
      if (!r.ok) { h += `<p class="bad">${esc(r.error)}</p></div>`; return; }
      const inputs = [
        ['Art', { end: 'Endstromkreis', sd: 'Steckdosen-Stromkreis', vert: 'Verteilstromkreis' }[c.kreisTyp]],
        ['Netz / Leiter', `${c.netz === '1' ? '1 × 230 V' : '3 × 400 V'} · ${{ '3LNPE': '3L+N+PE', '3LPE': '3L+PE', LNPE: 'L+N+PE' }[c.leiter]}`],
        ['Betriebsstrom I<sub>B</sub>', r.Ib ? `${A(r.Ib)}${c.last.mode === 'P' ? ` (P = ${fmt(+c.last.P_kW, 2)} kW, cos φ ${fmt(r.cosphi, 2)}, η ${fmt(r.eta, 2)})` : ''}` : '–'],
        ['Schutzorgan', esc(r.d.label) + (r.inAuto ? ' (automatisch)' : '')],
        ['Bemessung nach', r.basis === 'IB' ? 'I<sub>B</sub> Verbraucher' : 'I<sub>N</sub> Überstromunterbrecher'],
        ['Leitung', `${c.material === 'cu' ? 'Kupfer' : 'Aluminium'}, ${c.isolation === 'pvc' ? 'PVC' : 'VPE/EPR'}, L = ${fmt(+c.laenge, 0)} m${r.npar > 1 ? `, ${r.npar} parallel` : ''}`],
        ['Verlegeart', esc(LD.METHOD_LABEL[r.method])],
        ['Faktoren', `k<sub>ϑ</sub> ${fmt(r.kT, 2)} (${fmt(r.temp, 0)} °C) · ${r.kHlabel === 'kGH' ? 'k<sub>GH</sub>' : 'k<sub>H</sub>'} ${fmt(r.kH, 2)} · k<sub>G</sub> ${fmt(r.kG, 2)}${r.kSoil !== 1 ? ` · k<sub>Boden</sub> ${fmt(r.kSoil, 2)}` : ''}`],
        ['Kurzschluss', { keine: 'keine Angaben', anfang: `I<sub>k</sub> min Anfang ${fmt(+c.ik.ik1, 0)} A`, zs: `Z<sub>s</sub> Anfang ${fmt(+c.ik.zs, 3)} Ω`, ende: `I<sub>k</sub> Ende ${fmt(+c.ik.ikEnde, 0)} A`, upstream: `aus ${esc(r.up ? r.up.name : '–')}: I<sub>k</sub> Anfang ${r.up && r.up.ik ? fmt(r.up.ik, 0) + ' A' : '–'}` }[c.ik.modus] + (c.ik.ikMax_kA ? ` · I<sub>k</sub> max ${fmt(+c.ik.ikMax_kA, 1)} kA` : '')],
        ['Spannungsfall', `zulässig ${fmt(r.duLimit, 1)} %${r.duVor ? `, Vorbelastung ${fmt(r.duVor, 2)} %` : ''}${r.up ? ` (aus ${esc(r.up.name)})` : ''}`],
      ];
      h += `<div class="two"><div><h3>Eingaben</h3><table><tbody>${inputs.map(([k, v]) => `<tr><td style="width:34mm;color:#555">${k}</td><td>${v}</td></tr>`).join('')}</tbody></table></div>
        <div><h3>Ergebnis</h3><div class="box">${s ? `<b>${esc(LD.cableDesignation(r, s))}</b><br>${c.querschnitt !== 'auto' ? 'manuell gewählt' : 'massgebend: ' + esc(r.governing.join(', '))}` : '<b class="bad">kein gültiger Querschnitt</b>'}<br>Gesamtbewertung: ${stt(st)}</div>
        ${s ? `<table><tbody>${checksFor(r).map((x) => `<tr><td style="width:34mm">${x.title}</td><td>${x.ok === true ? '<span class="ok">i.O.</span>' : x.ok === false ? '<span class="bad">nicht i.O.</span>' : '–'}</td></tr>`).join('')}</tbody></table>` : ''}</div></div>`;
      h += `<h3>Rechenweg</h3><table><thead><tr><th>Pos.</th><th>Beschreibung</th><th>Wert</th><th>Bewertung</th></tr></thead><tbody>${calcRows(r, c).replace(/class="sec"/g, 'style="background:#f0f0f0;font-weight:600"')}</tbody></table>`;
      const notes = [...r.warn, ...r.info];
      if (notes.length) h += `<p class="small">${notes.map(esc).join('<br>')}</p>`;
      h += `</div>`;
    });
    if (isTest() && project.circuits.length > MAX_TEST) h += `<p class="small"><b>Testversion:</b> Nur die ersten ${MAX_TEST} von ${project.circuits.length} Stromkreisen sind im Bericht enthalten.</p>`;
    h += `<div class="foot">${isTest() ? '<b>TESTVERSION – nicht lizenziert.</b> ' : `Lizenziert für ${esc(lic.payload.n)}${lic.payload.f ? ', ' + esc(lic.payload.f) : ''}. `}Erstellt mit LeitDim ${esc(VERSION)} am ${today()}. Hilfsmittel zur Leitungsdimensionierung nach NIN 2025; massgebend sind die NIN, die Werkvorschriften und die Herstellerangaben (Kennlinien, Durchlass-I²t). Ergebnisse vor der Ausführung fachlich prüfen.</div></div>`;
    return h;
  }
  async function cmdReport() {
    $('#print-root').innerHTML = reportHTML();
    await new Promise((r) => setTimeout(r, 50));
    if (native) {
      const p = await native.printPDF({ defaultName: suggestedName('pdf').replace('.pdf', ' - Leitungsdimensionierung.pdf') });
      if (p) toast('Bericht gespeichert: ' + baseName(p), true);
    } else { showLoader('Bericht wird erstellt …'); await sleep(650); hideLoader(); window.print(); }
  }

  /* ---------- Einstellungen / Hilfe ---------- */
  function openModal(title, body, foot) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = body;
    $('#modalFoot').innerHTML = foot || '<button class="btn pri" data-close>Schliessen</button>';
    $('#modalBg').classList.add('open');
  }
  function closeModal() { $('#modalBg').classList.remove('open'); }
  function cmdSettings() {
    const st = LD.compute(cur(), project.settings).settings;
    const f = (id, v, step) => `<div class="field"><input type="number" step="${step || 'any'}" id="${id}" value="${v}" /></div>`;
    openModal('Rechenparameter', `<div class="fgrid">
      <h5 style="grid-column:1/-1">Spannungsfall</h5>
      <label>ρ Kupfer (Betrieb) <small>Ω·mm²/m – NIN-Nomogramm ≈ 0,0213</small></label>${f('s-rdcu', st.rhoDu.cu)}
      <label>ρ Aluminium (Betrieb) <small>Ω·mm²/m</small></label>${f('s-rdal', st.rhoDu.al)}
      <label>Reaktanzbelag X′ <small>mΩ/m – nur Methode «genau»</small></label>${f('s-x', st.xPrime)}
      <label>Zulässiger Spannungsfall <small>% – Vorgabe für neue Stromkreise</small></label>${f('s-du', st.duLimit)}
      <h5 style="grid-column:1/-1">Kurzschluss &amp; Fehlerschutz</h5>
      <label>ρ Kupfer (20 °C) <small>Ω·mm²/m</small></label>${f('s-rkcu', st.rhoIk.cu)}
      <label>ρ Aluminium (20 °C) <small>Ω·mm²/m</small></label>${f('s-rkal', st.rhoIk.al)}
      <label>Korrekturfaktor I<sub>k</sub> min <small>Schule 0,66 · NIN Workbook ¾</small></label>${f('s-ikf', st.ikFactor, '0.01')}
      <label>Toleranz gG-Kennlinie <small>% Strom auf mittlere Kennlinie</small></label>${f('s-ftol', st.fuseTol, '1')}
      <h5 style="grid-column:1/-1">Strombelastbarkeit</h5>
      <label>5-%-Regel anwenden <small>NIN 5.2.3 – Tabellenwert darf um 5 % überschritten werden</small></label><div class="field"><label class="chk"><input type="checkbox" id="s-5" ${st.fivePct ? 'checked' : ''}/> aktiv</label></div>
      <label>Mindestquerschnitt Cu <small>mm²</small></label>${f('s-mcu', st.minSection.cu)}
      <label>Mindestquerschnitt Al <small>mm²</small></label>${f('s-mal', st.minSection.al)}
      <div class="hint" style="grid-column:1/-1"><label class="chk"><input type="checkbox" id="s-def" /> Auch als Standard für neue Projekte verwenden</label></div>
    </div>`, `<button class="btn" id="s-reset">Standardwerte</button><span style="flex:1"></span><button class="btn" data-close>Abbrechen</button><button class="btn pri" id="s-ok">Übernehmen</button>`);
    const v = (id) => parseFloat($('#' + id).value);
    $('#s-reset').onclick = () => { project.settings = {}; setDirty(true); closeModal(); renderAll(); toast('Standardwerte wiederhergestellt'); };
    $('#s-ok').onclick = () => {
      const s = { rhoDu: { cu: v('s-rdcu'), al: v('s-rdal') }, xPrime: v('s-x'), duLimit: v('s-du'), rhoIk: { cu: v('s-rkcu'), al: v('s-rkal') }, ikFactor: v('s-ikf'), fuseTol: v('s-ftol') || 0, fivePct: $('#s-5').checked, minSection: { cu: v('s-mcu'), al: v('s-mal') } };
      const bad = [s.rhoDu.cu, s.rhoDu.al, s.rhoIk.cu, s.rhoIk.al, s.ikFactor].some((x) => !(x > 0));
      if (bad) { toast('Bitte gültige positive Werte eingeben.'); return; }
      project.settings = s;
      if ($('#s-def').checked) try { localStorage.setItem('leitdim.defaultSettings', JSON.stringify(s)); } catch (e) {}
      setDirty(true);
      closeModal();
      renderAll();
    };
  }
  function cmdHelp() {
    openModal('Rechengrundlagen', `<div class="help">
      <p><b>Ablauf</b> (wie Lösungsblatt «Bestimmung Querschnitt», WBZ Biel):</p>
      <ol>
        <li>Strom: I<sub>N</sub> des Überstromunterbrechers (Normalfall) oder I<sub>B</sub> eines fest angeschlossenen Verbrauchers mit eigenem Überlastschutz.</li>
        <li>Korrigierter Strom: <code>I_korr = I × kG ÷ (kϑ × kH)</code> – kϑ aus NIN 5.2.3 Tab. 18/19, kH aus Tab. 21 (bzw. kGH aus Tab. 38), kG aus Tab. 37.</li>
        <li>Querschnitt aus NIN 5.2.3 Tab. 4–7 (A1–D) bzw. Tab. 12–15 (E/F); 5-%-Regel optional.</li>
        <li>Spannungsfall: <code>ΔU = √3 · I · L · ρ / S</code> (Drehstrom) bzw. <code>2 · I · L · ρ / S</code> (Wechselstrom), ρ ≈ 0,0213 Ω·mm²/m wie NIN 6.1.3 Fig. 3 (Leitertemperatur 70 °C). Richtwert 4 %.</li>
        <li>Überlastschutz NIN 4.3.3: <code>IB ≤ IN ≤ IZ</code> und <code>I2 ≤ 1,45 · IZ</code>.</li>
        <li>Kurzschluss: <code>Ik = U0 / (Zv + ρ·L·(1/S + 1/S_PE))</code> mit ρ<sub>20</sub>; korrigiert × 0,66. Leiter: <code>t = (k · S / Ik)²</code> (k = 115 Cu/PVC, 143 Cu/VPE, 76 Al/PVC, 94 Al/VPE). Schmelzsicherung: Schmelzzeit aus mittlerer Kennlinie gG ≤ t Leiter. LS: magnetische Auslösung (B 5, C 10, D 20 × I<sub>N</sub>) und <code>I²t ≤ k²S²</code> bei I<sub>k</sub> max.</li>
        <li>Fehlerschutz NIN 4.1: Endstromkreise ≤ 32 A und Steckdosen ≤ 63 A max. 0,4 s, sonst bzw. Verteilstromkreise max. 5 s.</li>
        <li>Zusatzschutz: RCD ≤ 30 mA für Steckdosen bis 32 A.</li>
      </ol>
      <p><b>Tabellenwerte:</b> Strombelastbarkeiten und Umrechnungsfaktoren nach NIN 2025 Kap. 5.2.3 (entsprechen IEC 60364-5-52 Anhang B). gG-Kennlinien: mittlere Zeit-/Strom-Kennlinien NH-Sicherungen gG (6–630 A); 2, 4 und 13 A abgeleitet. LS-I²t: Grenzwerte EN 60898-1 Energiebegrenzungsklasse 3.</p>
      <p><b>Hinweis:</b> LeitDim ist ein Hilfsmittel. Massgebend sind die NIN, die Werkvorschriften und die Herstellerangaben. Ergebnisse vor der Ausführung fachlich prüfen.</p>
      <p style="color:var(--muted)">LeitDim ${esc(VERSION)} · Tastatur: Ctrl+N Neu · Ctrl+O Öffnen · Ctrl+S Speichern · Ctrl+T Stromkreis · Ctrl+D Duplizieren · Ctrl+P Bericht</p>
    </div>`);
  }

  const licTxt = () => ({ licensed: 'Lizenziert', test: 'Testversion', expired: 'Lizenz abgelaufen', revoked: 'Lizenz gesperrt', invalid: 'Lizenz ungültig' }[lic.state] || 'Testversion');
  function renderStatus() {
    const el = $('#sbLic');
    if (el) {
      el.className = 'lic ' + (lic.state === 'licensed' ? 'ok' : 'test');
      el.innerHTML = `${icon(lic.state === 'licensed' ? 'i-check' : 'i-lock')}${lic.state === 'licensed' ? 'Lizenziert · ' + esc(lic.payload.n) : esc(licTxt()) + ` (max. ${MAX_TEST} Stromkreise)`}`;
    }
    const u = $('#sbUpd');
    if (u) {
      const m = { checking: 'Suche Updates …', downloading: `Update ${upd.latest || ''} wird geladen …`, ready: `Update ${upd.latest} bereit – wird beim Schliessen installiert`, current: 'Aktuell', error: '' };
      u.textContent = m[upd.state] || '';
      u.className = upd.state === 'ready' ? 'upd ready' : 'upd';
    }
  }
  function cmdLicense(reason) {
    const p = lic.payload || {};
    const det = lic.payload ? `<dl class="licdl"><dt>Lizenznehmer</dt><dd>${esc(p.n)}${p.f ? ' · ' + esc(p.f) : ''}</dd><dt>E-Mail</dt><dd>${esc(p.e || '–')}</dd><dt>Lizenz-ID</dt><dd class="mono">${esc(p.id)}</dd><dt>Ausgestellt</dt><dd>${esc(p.ia || '–')}</dd><dt>Gültig bis</dt><dd>${p.ex ? esc(p.ex) : 'unbefristet'}</dd></dl>` : '';
    const stateLine = { licensed: '<div class="note info" style="background:var(--ok-bg);border-color:#cfe8cf;color:var(--ok)">' + icon('i-check') + '<div><b>LeitDim ist lizenziert.</b> Alle Funktionen ohne Einschränkung.</div></div>', test: `<div class="note warn">${icon('i-lock')}<div><b>Testversion.</b> Höchstens ${MAX_TEST} Stromkreise, PDF-Bericht mit Wasserzeichen.</div></div>`, expired: `<div class="note warn">${icon('i-warn')}<div><b>Die Lizenz ist abgelaufen</b> (${esc(p.ex || '')}). LeitDim läuft als Testversion.</div></div>`, revoked: `<div class="note warn">${icon('i-warn')}<div><b>Diese Lizenz wurde gesperrt.</b> LeitDim läuft als Testversion.</div></div>`, invalid: `<div class="note warn">${icon('i-warn')}<div><b>Gespeicherte Lizenz ungültig:</b> ${esc(lic.error || '')}</div></div>` }[lic.state] || '';
    openModal('Lizenz', `${reason ? `<p style="margin-top:0">${esc(reason)}</p>` : ''}${stateLine}${det}
      <h5>${lic.state === 'licensed' ? 'Andere Lizenz eintragen' : 'Lizenzschlüssel eintragen'}</h5>
      <textarea id="licKey" class="lickey" spellcheck="false" placeholder="LD1.…  (Schlüssel aus der Lizenz-E-Mail einfügen)"></textarea>
      <div id="licMsg" class="licmsg"></div>
      <p class="small-muted">Den Schlüssel erhältst du von Patrick Thommen. Eine Lizenzdatei (.leitdim-lizenz) kannst du auch einfach ins Fenster ziehen.</p>`,
      `${lic.state === 'licensed' ? '<button class="btn" id="licRemove">Lizenz entfernen</button>' : ''}<button class="btn" id="licFile">Lizenzdatei öffnen …</button><span style="flex:1"></span><button class="btn" data-close>Schliessen</button><button class="btn pri" id="licAct">Aktivieren</button>`);
    const act = async (key) => {
      const msg = $('#licMsg');
      if (!native) { msg.textContent = 'Aktivierung nur in der Desktop-Version.'; return; }
      msg.className = 'licmsg'; msg.textContent = 'Wird geprüft …';
      const r = await native.license.activate(key || $('#licKey').value);
      if (!r.ok) { msg.className = 'licmsg bad'; msg.textContent = r.error; return; }
      lic = r.license;
      closeModal();
      renderStatus();
      renderAll();
      celebrate();
    };
    $('#licAct').onclick = () => act();
    $('#licFile').onclick = async () => { const t = await native.license.openFile(); if (t) { $('#licKey').value = t.trim(); act(t); } };
    const rm = $('#licRemove');
    if (rm) rm.onclick = async () => { if (!(await native.confirm('Lizenz von diesem PC entfernen?'))) return; lic = await native.license.remove(); closeModal(); renderStatus(); renderAll(); };
    setTimeout(() => $('#licKey') && $('#licKey').focus(), 50);
  }
  function celebrate() {
    showLoader('Lizenz aktiviert');
    $('#loaderTxt').innerHTML = `Lizenz aktiviert<br><span style="font-weight:500;font-size:12px;color:#9fb7d4">Danke, ${esc(lic.payload.n)}!</span>`;
    hideLoader(1500);
  }

  function cmdAbout() {
    openModal('Über LeitDim', `<div class="about">
      <div class="hero"><svg class="m" viewBox="0 0 256 256" style="--len:${BR.arcLen}">${uniq(`<defs>${BR.coreDefs}</defs>` + BR.markInnerDark)}</svg>${wordmarkSvg(true, 40, 'w')}<small>Leitungsdimensionierung · NIN 2025</small></div>
      <dl><dt>Version</dt><dd>${esc(VERSION)}</dd><dt>Grundlage</dt><dd>NIN 2025 (SN 411000:2025), Kap. 4.1, 4.3, 5.2</dd>
      <dt>Nachweise</dt><dd>Strombelastbarkeit · Spannungsfall · Überlast-, Kurzschluss- und Fehlerschutz</dd><dt>Lizenz</dt><dd>${lic.state === 'licensed' ? 'Lizenziert für ' + esc(lic.payload.n) + (lic.payload.ex ? ' (bis ' + esc(lic.payload.ex) + ')' : '') : esc(licTxt())}</dd><dt>Updates</dt><dd>${upd.state === 'ready' ? 'Version ' + esc(upd.latest) + ' wird beim Schliessen installiert' : upd.state === 'current' ? 'aktuell' : 'automatisch über GitHub'}</dd><dt>Entwickelt von</dt><dd>Patrick Thommen</dd></dl>
      <div class="swatches"><span style="background:#0B2545" data-n="Navy"></span><span style="background:#1A6FE0" data-n="Elektroblau"></span><span style="background:#3DA5FF" data-n="Messbogen"></span><span style="background:#C8743A" data-n="Kupfer"></span><span style="background:#F3F5F8" data-n="Hell"></span></div>
      <p style="color:var(--muted);font-size:11.5px;margin:30px 0 0">Hilfsmittel – massgebend sind NIN, Werkvorschriften und Herstellerangaben.</p></div>`);
  }

  /* ---------- Rendering ---------- */
  function lockHTML(big) {
    return `<div class="lockbox${big ? ' big' : ''}">${icon('i-lock')}<h3>Testversion</h3><p>In der Testversion werden nur die ersten ${MAX_TEST} Stromkreise berechnet. Dieser Stromkreis ist gesperrt.</p><button class="btn pri" data-cmd="license">Lizenz eintragen</button></div>`;
  }
  function renderResultsAndPanes() {
    const c = cur();
    if (isLocked(c)) {
      $('#results').innerHTML = lockHTML(false);
      const pb = $('#pickbar');
      if (pb) { pb.className = 'pickbar bad'; pb.innerHTML = `<div class="pb-main"><span class="pb-lbl">Testversion</span><b style="color:var(--muted)">gesperrt</b><span class="pb-des">Nur die ersten ${MAX_TEST} Stromkreise werden berechnet.</span></div><div class="pb-side"><button class="btn pri" data-cmd="license">Lizenz eintragen</button></div>`; }
      ['compare', 'du', 'calc'].forEach((t) => { if (activeTab === t) $('#pane-' + t).innerHTML = lockHTML(true); });
      if (activeTab === 'list') renderKabelliste();
      $('#factorHint').textContent = 'Testversion – gesperrt';
      $('#ikHint').textContent = '–';
      $('#duHint').textContent = '–';
      justSwitched = false;
      return;
    }
    const t0 = performance.now();
    const res = calc(c);
    const dt = performance.now() - t0;
    renderResults(res, c);
    renderPickbar(res, c);
    if (activeTab === 'compare') renderCompare(res, c);
    if (activeTab === 'du') renderDu(res, c);
    if (activeTab === 'calc') renderCalc(res, c);
    if (activeTab === 'list') renderKabelliste();
    // Hilfsanzeigen im Formular
    $('#ibCalc').textContent = res.ok && res.Ib ? fmt(res.Ib, 2) : '–';
    if (res.ok) {
      $('#factorHint').innerHTML = `k<sub>ϑ</sub> = <b>${fmt(res.kT, 2)}</b> · ${res.kHlabel === 'kGH' ? 'k<sub>GH</sub>' : 'k<sub>H</sub>'} = <b>${fmt(res.kH, 2)}</b>${res.kSoil !== 1 ? ` · k<sub>Boden</sub> = <b>${fmt(res.kSoil, 2)}</b>` : ''} · k<sub>G</sub> = <b>${fmt(res.kG, 2)}</b> → I<sub>korr</sub> = <b>${A(res.Ikorr)}</b>`;
      const s = res.sel;
      $('#duHint').innerHTML = res.sel ? `Δu ${fmtS(res.sel.S)} mm²: <b>${fmt(res.sel.du, 2)} %</b>${res.duVor ? ` + Vorbelastung ${fmt(res.duVor, 2)} %` : ''} = <b>${fmt(res.sel.duTot, 2)} %</b> · max. Länge <b>${fmt(res.sel.Lmax, 0)} m</b>` : '–';
      $('#ikHint').innerHTML = res.ikAvailable && s ? `I<sub>k</sub> Ende ${A(s.IkEnd, 0)} × ${fmt(res.settings.ikFactor, 2)} = <b>${A(s.IkK, 0)}</b> · ${esc(res.tMaxTxt)}` : `Korrekturfaktor I<sub>k</sub> × ${fmt(res.settings.ikFactor, 2)} (Einstellungen) · ${esc(res.tMaxTxt || '')}`;
    } else {
      $('#factorHint').textContent = res.error;
      $('#ikHint').textContent = '–';
    }
    $('#sbCalc').textContent = `berechnet in ${dt.toFixed(1)} ms`;
    justSwitched = false;
    $('#sbInfo').textContent = res.ok && res.tableNo ? `Tabelle NIN 5.2.3 Tab. ${res.tableNo} · ${res.colKey === 'Fflat' ? 'F flach' : res.method}` : '';
  }
  function renderAll() {
    renderForm();
    renderResultsAndPanes();
    renderList();
    updateTitle();
  }
  function switchTab(t) {
    activeTab = t;
    $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    $$('.pane').forEach((p) => p.classList.toggle('active', p.id === 'pane-' + t));
    renderResultsAndPanes();
  }
  let loaderT = null;
  function showLoader(txt) {
    clearTimeout(loaderT);
    $('#loaderTxt').textContent = txt || 'Bitte warten …';
    $('#loader').classList.add('open');
  }
  function hideLoader(delay) { clearTimeout(loaderT); loaderT = setTimeout(() => $('#loader').classList.remove('open'), delay || 0); }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let toastT = null;
  function toast(msg, ok) {
    const t = $('#toast');
    t.innerHTML = (ok ? '<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : '') + `<span>${esc(msg)}</span>`;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- Befehle ---------- */
  const CMDS = {
    new: cmdNew, open: cmdOpen, save: () => cmdSave(false), saveAs: () => cmdSave(true),
    addCircuit: cmdAdd, dupCircuit: cmdDup, delCircuit: cmdDel,
    report: cmdReport, csv: csvExport, settings: cmdSettings, help: cmdHelp, about: cmdAbout, license: () => cmdLicense(),
    autoS: () => { cur().querschnitt = 'auto'; afterChange('querschnitt'); },
    saveThenClose: async () => { if (await cmdSave(false)) native.closeNow(); },
  };
  function runCmd(cmd) { if (CMDS[cmd]) CMDS[cmd](); }

  /* ---------- Ereignisse ---------- */
  document.addEventListener('click', (e) => {
    const cmdEl = e.target.closest('[data-cmd]');
    if (cmdEl) { runCmd(cmdEl.dataset.cmd); return; }
    const segBtn = e.target.closest('.seg button');
    if (segBtn) {
      const seg = segBtn.parentElement;
      setPath(cur(), seg.dataset.path, segBtn.dataset.v);
      afterChange(seg.dataset.path);
      return;
    }
    const li = e.target.closest('#circuitList li');
    if (li) { if (curId !== li.dataset.id) justSwitched = true; curId = li.dataset.id; renderAll(); return; }
    const tab = e.target.closest('.tab');
    if (tab) { switchTab(tab.dataset.tab); return; }
    const tr = e.target.closest('#pane-compare tbody tr');
    if (tr) { cur().querschnitt = tr.dataset.s; afterChange('querschnitt'); return; }
    const td = e.target.closest('#pane-du tbody tr[data-s]');
    if (td) { cur().querschnitt = td.dataset.s; afterChange('querschnitt'); return; }
    const tch = e.target.closest('#pane-du tbody tr[data-id]');
    if (tch) { curId = tch.dataset.id; renderAll(); return; }
    const tl = e.target.closest('#pane-list tbody tr');
    if (tl) { curId = tl.dataset.id; switchTab('input'); renderAll(); return; }
    if (e.target.closest('[data-close]') || e.target.closest('#modalClose') || e.target.id === 'modalBg') closeModal();
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.path && (el.tagName === 'INPUT') && el.type !== 'checkbox') onField(el);
    if (el.dataset.meta) { project.meta[el.dataset.meta] = el.value; setDirty(true); }
    if (el.id === 'search') renderList();
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.path && (el.tagName === 'SELECT' || el.type === 'checkbox')) onField(el);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if (native) return; // Electron-Menü übernimmt die Kürzel
    const k = e.key.toLowerCase();
    if (e.key === 'F1') { e.preventDefault(); cmdHelp(); }
    if (!(e.ctrlKey || e.metaKey)) return;
    const map = { s: e.shiftKey ? 'saveAs' : 'save', o: 'open', n: 'new', p: 'report', t: 'addCircuit', d: 'dupCircuit' };
    if (map[k]) { e.preventDefault(); runCmd(map[k]); }
  });
  $('#fileInput').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    showLoader('Projekt wird geladen …');
    f.text().then(async (t) => { await sleep(420); loadProject(t, f.name); hideLoader(120); });
    e.target.value = '';
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && /\.leitdim-lizenz$/i.test(f.name)) { f.text().then((t) => { cmdLicense(); setTimeout(() => { $('#licKey').value = t.trim(); $('#licAct').click(); }, 60); }); return; }
    if (f && /\.(leitdim|json)$/i.test(f.name)) f.text().then((t) => loadProject(t, (native && native.pathForFile && native.pathForFile(f)) || f.name));
  });
  window.addEventListener('beforeunload', (e) => { if (!native && dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- Start ---------- */
  async function init() {
    $('#sbVer').textContent = VERSION;
    $('#brandMark').innerHTML = markDark();
    $('#brandWm').outerHTML = wordmarkSvg(true, 23, 'bwm');
    $('#loaderMark').innerHTML = uniq(`<defs>${BR.coreDefs}</defs><circle cx="128" cy="128" r="92" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="12"/><g class="spin">${BR.markInnerDark.replace(/<circle class="sheath"[\s\S]*$/, '')}</g>` + BR.markInnerDark.replace(/^[\s\S]*?(<circle class="sheath")/, '$1'));
    document.body.classList.add('enter');
    setTimeout(() => document.body.classList.remove('enter'), 1200);
    if (native) native.onMenu(runCmd);
    if (native && native.onBusy) native.onBusy((b) => (b && b.on ? showLoader(b.text) : hideLoader(150)));
    if (native && native.license) {
      try { lic = await native.license.get(); } catch (e) {}
      native.license.onChange((s) => { lic = s; renderStatus(); renderAll(); });
      try { upd = await native.update.get(); } catch (e) {}
      native.update.onChange((s) => { const was = upd.state; upd = s; renderStatus(); if (s.state === 'ready' && was !== 'ready') toast(`Update ${s.latest} geladen – wird beim Schliessen installiert`, true); });
    }
    renderStatus();
    window.__ldSmoke = () => ({ version: VERSION, circuits: project.circuits.length, pick: ($('#pickbar') || {}).innerText || '', license: lic.state, title: document.title });
    window.__ldBuildReport = () => { $('#print-root').innerHTML = reportHTML(); return true; };
    let started = false;
    if (native && native.getStartupFile) {
      const f = await native.getStartupFile();
      if (f) { loadProject(f.content, f.path); started = true; }
    }
    if (!started) {
      try {
        const a = JSON.parse(localStorage.getItem('leitdim.autosave') || 'null');
        if (a && a.project && Array.isArray(a.project.circuits) && a.project.circuits.length) {
          loadProject(JSON.stringify(a.project), a.filePath);
          if (a.curId && project.circuits.some((c) => c.id === a.curId)) curId = a.curId;
          started = true;
          renderAll();
        }
      } catch (e) {}
    }
    if (!started) renderAll();
  }
  init();
})();
