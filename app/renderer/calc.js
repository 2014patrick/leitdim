/* LeitDim – Rechenkern Leitungsdimensionierung nach NIN 2025 (SN 411000:2025)
 * Läuft im Browser (window.LD) und in Node (globalThis.LD) für Tests.
 */
(function (g) {
  'use strict';
  const D = g.LD_DATA;
  const SQRT3 = Math.sqrt(3);

  const SETTINGS_DEFAULT = {
    rhoDu: { cu: 0.0213, al: 0.0343 }, // Ω·mm²/m für Spannungsfall (≈ 70 °C, wie NIN 6.1.3 Fig. 3)
    rhoIk: { cu: 0.0175, al: 0.0286 }, // Ω·mm²/m für Kurzschlussstrom (20 °C, Schulunterlage)
    xPrime: 0.08, // mΩ/m Reaktanzbelag (nur Methode «genau»)
    ikFactor: 0.66, // Korrekturfaktor Ik min (Erwärmung/Toleranz)
    duLimit: 4, // % (NIN-Richtwert)
    fuseTol: 0, // % Stromtoleranz auf mittlere gG-Kennlinie (0 = wie Schulunterlage)
    fivePct: true, // 5-%-Regel NIN 5.2.3
    minSection: { cu: 1.5, al: 16 },
    U0: 230,
    U: 400,
  };

  const METHOD_LABEL = {
    A1: 'A1 – Aderleitungen im Rohr in wärmegedämmter Wand',
    A2: 'A2 – Mehradriges Kabel im Rohr in wärmegedämmter Wand',
    B1: 'B1 – Aderleitungen im Rohr/Kanal auf oder in der Wand',
    B2: 'B2 – Mehradriges Kabel im Rohr/Kanal auf oder in der Wand',
    C: 'C – Kabel direkt auf/in Wand, Decke, ungelochter Wanne',
    D: 'D – Kabel im Rohr im Erdreich',
    E: 'E – Mehradriges Kabel frei in Luft / gelochte Wanne',
    F: 'F – Einadrige Kabel frei in Luft / gelochte Wanne',
  };

  const METHOD_SHORT = {
    A1: 'A1 – Adern im Rohr, Dämmwand',
    A2: 'A2 – Kabel im Rohr, Dämmwand',
    B1: 'B1 – Adern im Rohr/Kanal',
    B2: 'B2 – Kabel im Rohr/Kanal',
    C: 'C – Kabel direkt auf Wand/Decke',
    D: 'D – Kabel im Rohr im Erdreich',
    E: 'E – Mehradrig frei in Luft/Wanne',
    F: 'F – Einadrig frei in Luft/Wanne',
  };

  const TAB21_ROWS = {
    1: 'Gebündelt auf einer Fläche, eingebettet oder umschlossen',
    2: 'Einlagig auf Wand, Fussboden oder ungelochter Kabelwanne',
    3: 'Einlagig unter einer Decke',
    4: 'Einlagig auf gelochter Kabelwanne (horizontal/vertikal)',
    5: 'Einlagig auf Kabelpritsche oder an Schellen',
  };

  /* ---------- Hilfsfunktionen ---------- */
  const num = (v, d = null) => {
    if (v === null || v === undefined || v === '') return d;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/’|'/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : d;
  };
  const deepMerge = (a, b) => {
    const out = Array.isArray(a) ? a.slice() : Object.assign({}, a);
    for (const k in b || {}) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a && typeof a[k] === 'object') out[k] = deepMerge(a[k], b[k]);
      else if (b[k] !== undefined) out[k] = b[k];
    }
    return out;
  };

  function tableNo(iso, n) {
    // NIN 2025 5.2.3: Tab. 4 PVC zweiadrig, 5 VPE zweiadrig, 6 PVC dreiadrig, 7 VPE dreiadrig
    if (iso === 'pvc') return n === 2 ? 4 : 6;
    return n === 2 ? 5 : 7;
  }

  function stepLookup(steps, vals, x) {
    // nächsthöhere Stufe (konservativ)
    for (let i = 0; i < steps.length; i++) if (x <= steps[i] + 1e-9) return { f: vals[i], step: steps[i] };
    return { f: null, step: steps[steps.length - 1] };
  }

  function countLookup(counts, vals, n) {
    // NIN Tab. 36/39: Zwischenwerte nach der Spalte ≤ n (9…11 → 9, 12…15 → 12, 16…19 → 16)
    let idx = 0;
    for (let i = 0; i < counts.length && i < vals.length; i++) if (counts[i] <= n) idx = i;
    return { f: vals[idx], col: counts[idx] };
  }

  function kgSuggest(n) {
    let f = 1;
    for (const [c, v] of D.tab37) if (n >= c) f = v;
    return f;
  }

  function nextStdSection(x) {
    for (const s of D.sections) if (s >= x - 1e-9) return s;
    return D.sections[D.sections.length - 1];
  }

  function peSection(S, rule) {
    if (rule === 'gleich') return S;
    const m = num(rule);
    if (m) return m;
    if (S <= 16) return S;
    if (S <= 35) return 16;
    return nextStdSection(S / 2);
  }

  function kValue(mat, iso, S) {
    if (mat === 'cu') return iso === 'pvc' ? (S > 300 ? 103 : 115) : 143;
    return iso === 'pvc' ? (S > 300 ? 68 : 76) : 94;
  }

  /* ---------- Schutzorgane ---------- */
  function fuseCurve(In) {
    return D.fuseCurves[String(In)] || null;
  }

  let FUSE_TOL = 0;
  function fuseTime(In, I) {
    const c = fuseCurve(In);
    I = I / (1 + FUSE_TOL / 100);
    if (!c || !(I > 0)) return null;
    if (I < c[0][0]) return Infinity; // unter Kennlinie (> ca. 1 h)
    for (let i = 1; i < c.length; i++) {
      if (I <= c[i][0]) {
        const [I1, t1] = c[i - 1], [I2, t2] = c[i];
        const w = Math.log(I / I1) / Math.log(I2 / I1);
        return Math.exp(Math.log(t1) + w * Math.log(t2 / t1));
      }
    }
    // Extrapolation unterhalb 0,01 s
    const [I1, t1] = c[c.length - 2], [I2, t2] = c[c.length - 1];
    const s = Math.log(t2 / t1) / Math.log(I2 / I1);
    return Math.exp(Math.log(t2) + s * Math.log(I / I2));
  }

  function fuseCurrentAt(In, t) {
    // Strom, bei dem die Sicherung in t Sekunden schmilzt (mittlere Kennlinie)
    const c = fuseCurve(In);
    if (!c) return null;
    if (t >= c[0][1]) return c[0][0] * (1 + FUSE_TOL / 100);
    for (let i = 1; i < c.length; i++) {
      if (t >= c[i][1]) {
        const [I1, t1] = c[i - 1], [I2, t2] = c[i];
        const w = Math.log(t / t1) / Math.log(t2 / t1);
        return Math.exp(Math.log(I1) + w * Math.log(I2 / I1)) * (1 + FUSE_TOL / 100);
      }
    }
    return c[c.length - 1][0] * (1 + FUSE_TOL / 100);
  }

  const LS_MAG = { B: [3, 5], C: [5, 10], D: [10, 20] };

  function device(inp) {
    const s = inp.schutz || {};
    const typ = s.typ || 'LS';
    const d = { typ, char: s.char || 'C' };
    if (typ === 'LSV') {
      d.In = num(s.Ir);
      d.Ii = num(s.Ii);
      d.k2 = 1.3; // IEC 60947-2: konventioneller Auslösestrom 1,3 × Ir
      d.label = `Leistungs-/Motorschutzschalter Ir ${d.In ?? '?'} A` + (d.Ii ? `, Ii ${d.Ii} A` : '');
    } else if (typ === 'gG') {
      d.In = s.In;
      d.label = `Schmelzsicherung gG ${d.In ?? '?'} A`;
    } else {
      d.In = s.In;
      d.label = `LS ${d.char}${d.In ?? '?'}`;
    }
    d.icn = num(s.icn_kA) ? num(s.icn_kA) * 1000 : null;
    d.i2tUser = num(s.i2t_user);
    return d;
  }

  function k2Of(d) {
    if (d.typ === 'LSV') return 1.3;
    if (d.typ === 'LS') return 1.45;
    const In = d.In;
    if (In >= 16) return 1.45; // gG ≥ 16 A (Leitungsschutz, wie LS)
    if (In > 4) return 1.9;
    return 2.1;
  }

  function tripTime(d, I) {
    // obere Abschaltzeit (für Nachweise)
    if (!(I > 0) || !d.In) return { t: null, txt: '–' };
    if (d.typ === 'gG') {
      const t = fuseTime(d.In, I);
      return { t, txt: t === Infinity ? '> 1 h' : null, src: 'mittlere Kennlinie gG' };
    }
    if (d.typ === 'LS') {
      const [, mmax] = LS_MAG[d.char] || LS_MAG.C;
      if (I >= mmax * d.In) return { t: 0.1, txt: '≤ 0,1 s (magnetisch)', mag: true };
      return { t: Infinity, txt: `keine sichere Schnellauslösung (< ${mmax} × In)`, mag: false };
    }
    if (d.typ === 'LSV') {
      if (d.Ii && I >= 1.2 * d.Ii) return { t: 0.1, txt: '≤ 0,1 s (Ii + 20 %)', mag: true };
      return { t: Infinity, txt: d.Ii ? 'unter Ii + 20 %' : 'Ii fehlt', mag: false };
    }
    return { t: null, txt: '–' };
  }

  function currentForTime(d, t) {
    // Abschaltstrom Ia für Zeit t
    if (!d.In) return null;
    if (d.typ === 'gG') return fuseCurrentAt(d.In, t);
    if (d.typ === 'LS') return (LS_MAG[d.char] || LS_MAG.C)[1] * d.In;
    if (d.typ === 'LSV') return d.Ii ? 1.2 * d.Ii : null;
    return null;
  }

  function lsI2t(d, Ik) {
    if (d.i2tUser) return { v: d.i2tUser, src: 'Herstellerangabe' };
    if (d.typ !== 'LS' || !(Ik > 0)) return null;
    if (d.In > 32) return null;
    const grp = d.In <= 16 ? D.lsI2t.le16 : D.lsI2t.le32;
    const ch = d.char === 'B' ? 'B' : 'C';
    const pts = Object.keys(grp).map(Number).sort((a, b) => a - b).map((k) => [k, grp[String(k)][ch]]);
    let v;
    if (Ik <= pts[0][0]) v = pts[0][1];
    else if (Ik >= pts[pts.length - 1][0]) {
      const [I1, v1] = pts[pts.length - 2], [I2, v2] = pts[pts.length - 1];
      v = Math.exp(Math.log(v2) + (Math.log(v2 / v1) / Math.log(I2 / I1)) * Math.log(Ik / I2));
    } else {
      for (let i = 1; i < pts.length; i++) {
        if (Ik <= pts[i][0]) {
          const [I1, v1] = pts[i - 1], [I2, v2] = pts[i];
          v = Math.exp(Math.log(v1) + (Math.log(Ik / I1) / Math.log(I2 / I1)) * Math.log(v2 / v1));
          break;
        }
      }
    }
    return { v, src: `Grenzwert EN 60898-1 Kl. 3 (${ch}${d.char === 'D' ? ', D ≈ C' : ''})` };
  }

  /* ---------- Hauptberechnung ---------- */
  function compute(inp, settings) {
    const st = deepMerge(SETTINGS_DEFAULT, settings || {});
    FUSE_TOL = num(st.fuseTol, 0);
    const warn = [];
    const info = [];
    const mat = inp.material === 'al' ? 'al' : 'cu';
    const iso = inp.isolation === 'xlpe' ? 'xlpe' : 'pvc';
    const threePh = inp.netz !== '1';
    const U = threePh ? num(inp.U, st.U) : num(inp.U, st.U0);
    const U0 = threePh ? (st.U0 * U) / st.U : U; // 400 V → 230 V
    const L = num(inp.laenge, 0);
    const npar = Math.max(1, Math.round(num(inp.parallel, 1)));

    // 1) Betriebsstrom
    let Ib = null;
    const last = inp.last || {};
    const cosphi = Math.min(1, Math.max(0.05, num(last.cosphi, 1)));
    const eta = Math.min(1, Math.max(0.05, num(last.eta, 1)));
    if (last.mode === 'P') {
      const P = num(last.P_kW);
      if (P) Ib = threePh ? (P * 1000) / (SQRT3 * U * cosphi * eta) : (P * 1000) / (U * cosphi * eta);
    } else {
      Ib = num(last.I_B);
    }

    // 2) Schutzorgan
    const d = device(inp);
    const s = inp.schutz || {};
    let inAuto = false;
    if (d.typ !== 'LSV') {
      if (s.In === 'auto' || s.In === undefined || s.In === null || s.In === '') {
        const list = d.typ === 'gG' ? D.fuseIn : D.lsIn;
        if (Ib) {
          d.In = list.find((x) => x >= Ib - 1e-9) || null;
          inAuto = true;
          if (!d.In) warn.push('Kein Normstrom des Schutzorgans gross genug für I_B.');
        } else d.In = null;
      } else d.In = num(s.In);
      d.label = d.typ === 'gG' ? `Schmelzsicherung gG ${d.In ?? '?'} A` : `LS ${d.char}${d.In ?? '?'}`;
    }
    const In = d.In;

    // 3) Bemessungsgrundlage
    const basis = inp.basis === 'IB' ? 'IB' : 'IN';
    const Icalc = basis === 'IB' ? Ib : In;
    if (!Icalc) {
      return { ok: false, error: basis === 'IB' ? 'Betriebsstrom I_B fehlt.' : 'Nennstrom des Überstromunterbrechers fehlt (oder I_B für «auto»).', settings: st };
    }

    // 4) Belastete Leiter, Tabelle/Spalte
    let n = inp.belastet === 2 || inp.belastet === '2' ? 2 : inp.belastet === 3 || inp.belastet === '3' ? 3 : threePh ? 3 : 2;
    let method = inp.verlegeart || 'C';
    let colKey = method === 'F' && n === 3 && inp.fAnordnung === 'flat' ? 'Fflat' : method;
    const tab = D.iz[`${iso}|${mat}|${n}`];
    const col = tab && tab[colKey];
    if (!col) return { ok: false, error: 'Keine Tabellenwerte für diese Kombination.', settings: st };

    // 5) Faktoren
    const inGround = method === 'D';
    const temp = num(inp.temp, inGround ? 20 : 30);
    const tt = inGround ? D.tempGround : D.tempAir;
    let kT, kTstep;
    if (num(inp.kTmanuell)) {
      kT = num(inp.kTmanuell);
      kTstep = 'manuell';
    } else {
      const r = stepLookup(tt.steps, tt[iso], temp);
      kT = r.f;
      kTstep = r.step;
      if (kT === null) return { ok: false, error: `Umgebungstemperatur ${temp} °C für ${iso.toUpperCase()} nicht zulässig.`, settings: st };
      if (temp !== r.step) info.push(`Temperatur ${temp} °C → Tabellenstufe ${r.step} °C (nächsthöhere Stufe).`);
    }
    let kSoil = 1;
    if (inGround) {
      const rho = num(inp.soilRho, 2.5);
      // nächstgrösserer Wärmewiderstand (konservativ)
      const r = stepLookup(D.soil.rho, D.soil.f, rho);
      kSoil = r.f ?? D.soil.f[D.soil.f.length - 1];
    }

    const h = inp.haeufung || {};
    const nCirc = Math.max(1, Math.round(num(h.anzahl, 1)));
    let kH = 1, kHlabel = 'kH', kHsrc = '';
    const hm = h.methode || 'tab21';
    if (hm === 'manuell') {
      kH = num(h.faktor, 1);
      kHsrc = 'manuell';
    } else if (hm === 'tab38') {
      const row = D.tab38.rows[String(h.anordnung || 1)] || D.tab38.rows['1'];
      const r = countLookup(D.tab38.counts, row, nCirc);
      kH = r.f;
      kHlabel = 'kGH';
      kHsrc = `Tab. 38, Zeile ${h.anordnung || 1}, ${nCirc} Stromkreis(e)`;
    } else if (hm === 'ducts') {
      const row = D.ducts.rows[String(h.abstand ?? '0')] || D.ducts.rows['0'];
      const r = countLookup(D.ducts.counts, row, nCirc);
      kH = r.f;
      kHsrc = `Erdreich in Rohren, Abstand ${h.abstand ?? 0} m, ${nCirc} Stromkreis(e)`;
    } else {
      const row = D.tab21.rows[String(h.anordnung || 1)] || D.tab21.rows['1'];
      const r = countLookup(D.tab21.counts, row, nCirc);
      kH = r.f;
      kHsrc = `Tab. 21, Zeile ${h.anordnung || 1}, ${nCirc} Stromkreis(e)`;
    }
    const kG = num(inp.kG, 1);
    if (hm === 'tab38' && kG !== 1) warn.push('kGH (Tab. 38) enthält die Gleichzeitigkeit bereits – kG zusätzlich nur verwenden, wenn begründet.');

    const kTot = kT * kH * kSoil;
    const Ikorr = (Icalc * kG) / kTot; // korrigierter Strom (gesamt)
    const IkorrPer = Ikorr / npar;
    const tol = st.fivePct ? 1.05 : 1;

    // 6) Weitere Grössen
    const Idu = Ib || Icalc; // Strom für Spannungsfall
    const sinphi = Math.sqrt(Math.max(0, 1 - cosphi * cosphi));
    const bFac = threePh ? SQRT3 : 2;
    const Uref = threePh ? U : U0;
    const du = inp.du || {};
    const duLimit = num(du.limit, st.duLimit);
    const duVor = num(du.vor, 0);
    const duMethod = du.methode === 'exakt' ? 'exakt' : 'nin';

    const ik = inp.ik || {};
    const ikMode = ik.modus || 'keine';
    let Zv = null;
    if (ikMode === 'anfang' && num(ik.ik1)) Zv = U0 / num(ik.ik1);
    if (ikMode === 'zs' && num(ik.zs) !== null) Zv = num(ik.zs);
    const ikEndeGiven = ikMode === 'ende' ? num(ik.ikEnde) : null;
    const ikMax = num(ik.ikMax_kA) ? num(ik.ikMax_kA) * 1000 : null;
    const ikAvailable = Zv !== null || ikEndeGiven;

    // Abschaltzeit-Anforderung
    const kreis = inp.kreisTyp || 'end';
    let tMax, tMaxTxt;
    const Iref = Ib || In;
    if (kreis === 'vert') { tMax = 5; tMaxTxt = 'Verteilstromkreis: max. 5 s'; }
    else if (kreis === 'sd') { tMax = In && In <= 63 ? 0.4 : 5; tMaxTxt = In <= 63 ? 'Steckdosen ≤ 63 A: max. 0,4 s' : 'Steckdosen > 63 A: max. 5 s'; }
    else { tMax = Iref && Iref <= 32 ? 0.4 : 5; tMaxTxt = Iref <= 32 ? 'Endstromkreis ≤ 32 A: max. 0,4 s' : 'Endstromkreis > 32 A: max. 5 s'; }

    const rcd = inp.rcd || {};
    const idn = num(rcd.idn_mA);
    const rcdFS = !!rcd.fehlerschutz && idn;
    const k2 = In ? k2Of(d) : null;
    const tOverride = num(inp.tKennlinie);

    const rows = [];
    const sections = D.sections;
    for (let i = 0; i < sections.length; i++) {
      const S = sections[i];
      const Itab = col[i];
      if (Itab === null || Itab === undefined) continue;
      const r = { S, Itab };
      r.Spe = peSection(S, inp.pe || 'nin');
      r.Iz = Itab * kTot * npar; // Strombelastbarkeit unter Betriebsbedingungen
      r.IzEff = r.Iz / kG; // inkl. Gleichzeitigkeit
      r.okLoad = IkorrPer <= Itab * tol + 1e-9;
      r.loadUsed5 = r.okLoad && IkorrPer > Itab + 1e-9;
      // Überlastschutz
      if (basis === 'IN') {
        r.okIbIn = Ib ? Ib <= In + 1e-9 : true;
        r.I2 = k2 * In;
        r.okI2 = r.I2 <= 1.45 * r.IzEff * tol + 1e-9;
        r.okOverload = r.okLoad && r.okIbIn && r.okI2;
      } else {
        const Ir = num(inp.motorIr);
        r.okIbIn = true;
        r.okI2 = true;
        r.okOverload = r.okLoad && (!Ir || Ir <= r.IzEff * tol + 1e-9);
      }
      // Spannungsfall
      const rP = st.rhoDu[mat] / S / npar; // Ω/m
      const xP = st.xPrime / 1000 / npar;
      const zEff = duMethod === 'exakt' ? rP * cosphi + xP * sinphi : rP;
      r.dU = bFac * Idu * L * zEff;
      r.du = (r.dU / Uref) * 100;
      r.duTot = r.du + duVor;
      r.okDu = r.duTot <= duLimit + 1e-9;
      r.Lmax = Idu > 0 ? (((duLimit - duVor) / 100) * Uref) / (bFac * Idu * zEff) : null;
      // Kurzschluss / Fehlerschutz
      if (ikAvailable && In) {
        const Rloop = (st.rhoIk[mat] * L * (1 / S + 1 / r.Spe)) / npar;
        r.Rloop = Rloop;
        r.IkEnd = ikEndeGiven ? ikEndeGiven : U0 / (Zv + Rloop);
        r.IkK = r.IkEnd * st.ikFactor;
        const tr = tripTime(d, r.IkK);
        r.tTrip = tOverride ?? tr.t;
        r.tTripTxt = tOverride ? 'manuell (Kennlinie)' : tr.txt;
        const Smin = Math.min(S, r.Spe) * npar;
        r.k = kValue(mat, iso, S);
        r.tCond = Math.pow((r.k * Smin) / r.IkK, 2);
        r.k2S2 = Math.pow(r.k * S * npar, 2);
        if (d.typ === 'gG') {
          r.okShort = r.tTrip !== null && r.tTrip <= r.tCond + 1e-9 && r.tTrip <= 5;
          r.shortNote = r.tTrip > 5 ? 'Abschaltzeit > 5 s' : '';
        } else {
          const okMin = (tOverride ?? tr.t) !== null && (tOverride ? tOverride <= r.tCond : tr.mag);
          r.i2t = ikMax ? lsI2t(d, ikMax) : null;
          r.okI2t = r.i2t ? r.i2t.v <= r.k2S2 + 1e-9 : null;
          r.okShort = okMin && r.okI2t !== false;
        }
        r.Ia = currentForTime(d, tMax);
        if (rcdFS) {
          r.okFault = r.IkK >= 5 * idn / 1000;
          r.faultBy = 'RCD';
        } else {
          r.okFault = r.tTrip !== null && r.tTrip <= tMax + 1e-9;
          r.faultBy = 'Üu';
        }
        // max. Länge für Fehlerschutz
        if (!ikEndeGiven && r.Ia) {
          const Rmax = U0 / (r.Ia / st.ikFactor) - Zv;
          r.LmaxFault = Rmax > 0 ? (Rmax * npar) / (st.rhoIk[mat] * (1 / S + 1 / r.Spe)) : 0;
        }
      } else {
        r.okShort = null;
        r.okFault = null;
      }
      r.okMin = S >= (st.minSection[mat] || 0) - 1e-9;
      // Schaltvermögen
      r.okIcn = d.icn && ikMax ? ikMax <= d.icn : null;
      const crit = [r.okLoad, r.okOverload, r.okDu, r.okMin, r.okShort, r.okFault, r.okIcn];
      r.okAll = crit.every((c) => c !== false);
      rows.push(r);
    }

    // massgebende Kriterien
    const firstOk = (key) => { const r = rows.find((x) => x[key] !== false); return r ? r.S : null; };
    const crits = [
      ['okLoad', 'Strombelastbarkeit'],
      ['okOverload', 'Überlastschutz'],
      ['okDu', 'Spannungsfall'],
      ['okShort', 'Kurzschlussschutz'],
      ['okFault', 'Fehlerschutz'],
      ['okMin', 'Mindestquerschnitt'],
    ];
    const critS = {};
    crits.forEach(([k]) => (critS[k] = firstOk(k)));
    const rec = rows.find((r) => r.okAll) || null;
    let governing = [];
    if (rec) governing = crits.filter(([k]) => critS[k] === rec.S && rows[0] && rows[0].S !== rec.S && !(k === 'okOverload' && critS.okLoad === critS.okOverload)).map(([, l]) => l);
    if (rec && !governing.length) governing = rows[0] && rows[0].S === rec.S ? ['kleinster Tabellenquerschnitt'] : ['Kombination mehrerer Kriterien'];

    const manual = num(inp.querschnitt);
    let sel = null;
    if (manual) {
      sel = rows.find((r) => Math.abs(r.S - manual) < 1e-9) || null;
      if (!sel) warn.push(`Querschnitt ${manual} mm² ist für diese Verlegeart nicht tabelliert.`);
    } else sel = rec;

    if (!rec) warn.push('Kein Querschnitt erfüllt alle Bedingungen – Schutzorgan, Verlegung oder Länge anpassen.');
    if (!ikAvailable) info.push('Kurzschluss- und Fehlerschutz nicht geprüft (keine Kurzschlussangaben).');
    if (basis === 'IB' && In && sel && In > sel.IzEff * tol) info.push(`Üu ${In} A schützt die Leitung nicht bei Überlast – Überlastschutz muss durch den Verbraucher bzw. Motorschutz sichergestellt sein.`);
    if (ikEndeGiven) info.push('Ik am Leitungsende vorgegeben – gilt für alle Querschnitte gleich.');
    if (npar > 1) info.push('Parallelschaltung: NIN 5.2.3.7 beachten (Cu ab 2 × 35 mm², gleiche Länge/Querschnitt).');
    if (threePh && (inp.leiter === '3LNPE') && n === 3) info.push('Neutralleiter als unbelastet angenommen (symmetrische Last). Bei Oberschwingungen > 15 %: N = Aussenleiterquerschnitt.');
    if (d.typ === 'gG' && [2, 4, 13].includes(In)) info.push(`Kennlinie gG ${In} A aus Nachbarkennlinien abgeleitet – bei Grenzfällen Herstellerkennlinie prüfen.`);

    // Zusatzschutz
    let zusatz = { req: false, txt: 'nicht erforderlich' };
    if (kreis === 'sd' && In && In <= 32) {
      zusatz.req = true;
      zusatz.ok = !!(idn && idn <= 30);
      zusatz.txt = zusatz.ok ? `RCD ${idn} mA vorhanden` : 'RCD ≤ 30 mA erforderlich (Steckdosen ≤ 32 A)';
    } else if (idn && idn <= 30) {
      zusatz.txt = `RCD ${idn} mA vorhanden`;
      zusatz.ok = true;
    }

    return {
      ok: true,
      settings: st,
      warn,
      info,
      Ib, In, inAuto, d, k2, basis, Icalc, n, method, colKey, iso, mat, threePh, U, U0, L, npar,
      tableNo: method === 'E' || method === 'F' ? { 'pvc|cu': 12, 'pvc|al': 13, 'xlpe|cu': 14, 'xlpe|al': 15 }[`${iso}|${mat}`] : tableNo(iso, n),
      kT, kTstep, temp, kSoil, kH, kHlabel, kHsrc, kG, kTot, Ikorr, IkorrPer, tol,
      Idu, cosphi, eta, duLimit, duVor, duMethod,
      ikMode, Zv, ikMax, ikAvailable, tMax, tMaxTxt, kreis, rcdFS, idn, zusatz,
      motorIr: num(inp.motorIr), rows, rec, sel, governing, critS, leiter: inp.leiter || (threePh ? "3LNPE" : "LNPE"),
    };
  }

  /* ---------- Darstellung ---------- */
  function fmt(v, dec = 1) {
    if (v === null || v === undefined || Number.isNaN(v)) return '–';
    if (v === Infinity) return '∞';
    const neg = v < 0;
    let s = Math.abs(v).toFixed(dec);
    let [a, b] = s.split('.');
    a = a.replace(/\B(?=(\d{3})+(?!\d))/g, '’');
    return (neg ? '−' : '') + a + (b ? ',' + b : '');
  }
  function fmtS(S) { return fmt(S, S % 1 ? 1 : 0); }
  function fmtT(t) {
    if (t === null || t === undefined) return '–';
    if (t === Infinity) return '> 1 h';
    if (t >= 100) return fmt(t, 0) + ' s';
    if (t >= 10) return fmt(t, 1) + ' s';
    if (t >= 0.1) return fmt(t, 2) + ' s';
    return fmt(t, 3) + ' s';
  }

  function cableDesignation(res, r) {
    if (!r) return '–';
    const S = fmtS(r.S), Spe = fmtS(r.Spe);
    const mat = res.mat === 'cu' ? 'Cu' : 'Al';
    const iso = res.iso === 'pvc' ? 'PVC' : 'VPE';
    const p = res.npar > 1 ? `${res.npar} × (` : '';
    const q = res.npar > 1 ? ')' : '';
    let core;
    const leiter = res.leiter || '';
    if (res.method === 'F') {
      const nL = leiter === 'LNPE' || !res.threePh ? 2 : leiter === '3LPE' ? 3 : 4;
      return `${res.npar > 1 ? res.npar + ' × ' : ''}${nL} × 1 × ${S} mm² + PE ${Spe} mm² ${mat} ${iso} (einadrig)`;
    }
    if (leiter === 'LNPE' || !res.threePh) core = r.Spe === r.S ? `3 × ${S}` : `2 × ${S} + ${Spe}`;
    else if (leiter === '3LPE') core = r.Spe === r.S ? `4 × ${S}` : `3 × ${S} + ${Spe}`;
    else core = r.Spe === r.S ? `5 × ${S}` : `4 × ${S} + ${Spe}`;
    return `${p}${core} mm²${q} ${mat} ${iso}`;
  }

  g.LD = { compute, fuseTime, fuseCurrentAt, tripTime, peSection, kValue, kgSuggest, fmt, fmtS, fmtT, cableDesignation, SETTINGS_DEFAULT, METHOD_LABEL, METHOD_SHORT, TAB21_ROWS, tableNo, LS_MAG };
})(typeof window !== 'undefined' ? window : globalThis);
