// LeitDim – Lizenzschlüssel (Ed25519-signiert). Identisch in app/ und admin/.
// Format: LD1.<payload base64url>.<signatur base64url>
'use strict';
const crypto = require('crypto');

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAghHamD9MF9v6zqOSCYnhpgZj2dJyOGhKpa4d1icMz4M=
-----END PUBLIC KEY-----`;

const PREFIX = 'LD1';
const REPO = '2014patrick/leitdim';
const SPERRLISTE_URL = `https://raw.githubusercontent.com/${REPO}/main/lizenzen/gesperrt.json`;

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function normalise(key) {
  const txt = String(key || '');
  const re = /LD1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;
  const m = txt.match(re) || txt.replace(/\s+/g, '').match(re);
  return m ? m[0] : txt.replace(/\s+/g, '').trim();
}

function licenseFileText(key, p) {
  return `LeitDim – Lizenzdatei\r\nLizenznehmer: ${p.n}${p.f ? ', ' + p.f : ''}\r\nLizenz-ID: ${p.id}\r\nGültig bis: ${p.ex || 'unbefristet'}\r\n\r\nDatei in LeitDim ins Fenster ziehen oder unter «Lizenz» öffnen.\r\n\r\n${key}\r\n`;
}

function makeId() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += abc[b[i] % abc.length];
  return s.slice(0, 4) + '-' + s.slice(4);
}

function sign(payload, privatePem) {
  const body = b64u(Buffer.from(JSON.stringify(payload), 'utf8'));
  const msg = `${PREFIX}.${body}`;
  const sig = crypto.sign(null, Buffer.from(msg, 'utf8'), crypto.createPrivateKey(privatePem));
  return `${msg}.${b64u(sig)}`;
}

function verify(key, publicPem) {
  const k = normalise(key);
  const parts = k.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false, error: 'Kein gültiger LeitDim-Lizenzschlüssel.' };
  let payload;
  try { payload = JSON.parse(fromB64u(parts[1]).toString('utf8')); } catch (e) { return { ok: false, error: 'Lizenzschlüssel ist beschädigt.' }; }
  let good = false;
  try { good = crypto.verify(null, Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8'), crypto.createPublicKey(publicPem || PUBLIC_KEY), fromB64u(parts[2])); } catch (e) { good = false; }
  if (!good) return { ok: false, error: 'Signatur ungültig – Schlüssel wurde nicht von LeitDim ausgestellt oder verändert.' };
  return { ok: true, payload, key: k };
}

function isExpired(payload, now) {
  if (!payload || !payload.ex) return false;
  const end = new Date(payload.ex + 'T23:59:59');
  return (now || new Date()) > end;
}

function publicFromPrivate(privatePem) {
  return crypto.createPublicKey(crypto.createPrivateKey(privatePem)).export({ type: 'spki', format: 'pem' }).toString().trim();
}

function fingerprint(publicPem) {
  return crypto.createHash('sha256').update(crypto.createPublicKey(publicPem).export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16).toUpperCase().replace(/(.{4})(?=.)/g, '$1 ');
}

module.exports = { PUBLIC_KEY, PREFIX, REPO, SPERRLISTE_URL, sign, verify, isExpired, makeId, normalise, publicFromPrivate, fingerprint, licenseFileText };
