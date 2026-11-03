// Auto-organizer: turns file names into series "collections".
//   "One Piece v01.cbz", "One_Piece_v02 (Digital).cbz", "one piece 3.zip"  ->  "One Piece"
import { natCompare } from './util.js';

const VOL = 'volume|vol|v|tome|book|bk';
const CHP = 'chapter|chap|ch|c|issue|iss|no|n|episode|ep|part|pt|#';
const MARK = new RegExp(`(?<![\\p{L}])(${VOL}|${CHP})\\.?\\s*#?\\s*(\\d+(?:\\.\\d+)?)(?![\\p{L}\\d])`, 'giu');
const VOL_SET = new Set(VOL.split('|'));

export function parseName(filename, folderHint = '') {
  let s = filename.replace(/\.[a-z0-9]{2,4}$/i, '');
  s = s.replace(/_/g, ' ').replace(/(?<!\d)\.|\.(?!\d)/g, ' ');
  // drop [groups], (years / tags), {misc}
  s = s.replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  let title = s;
  let vol = null, chp = null, tail = '';
  const hits = [...s.matchAll(MARK)];

  if (hits.length) {
    const first = hits[0];
    title = s.slice(0, first.index);
    tail = s.slice(first.index);
    for (const h of hits) {
      const word = h[1].toLowerCase();
      const n = parseFloat(h[2]);
      if (VOL_SET.has(word)) { if (vol === null) vol = n; }
      else if (chp === null) chp = n;
    }
  } else {
    // bare number token: take the last one that is not the very first word
    const toks = [...s.matchAll(/(?<![\p{L}\d.])(\d{1,4}(?:\.\d+)?)(?![\p{L}\d])/gu)].filter((m) => m.index > 0);
    if (toks.length) {
      const m = toks[toks.length - 1];
      title = s.slice(0, m.index);
      tail = s.slice(m.index);
      chp = parseFloat(m[1]);
    }
  }

  title = title.replace(/[\s\-–—:,#|~_]+$/g, '').replace(/^[\s\-–—:,|~_]+/, '').trim();
  if (!title) title = folderHint || s.replace(/\d+/g, '').trim() || 'Untitled';

  const num = vol !== null ? vol + (chp ?? 0) / 10000 : chp; // volume-only, bare numbers and chapters share one scale
  let label = '';
  if (vol !== null && chp !== null) label = `Vol ${vol} · Ch ${chp}`;
  else if (vol !== null) label = `Vol ${vol}`;
  else if (chp !== null) label = /^(ch|c|chapter|chap)/i.test(tail) ? `Ch ${chp}` : `#${chp}`;

  return { title, key: normKey(title), num, label, tail: tail.trim() };
}

export function normKey(t) {
  return t
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/^(the|a|an) /, '')
    .trim();
}

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function similar(a, b) {
  if (a === b) return true;
  const max = Math.max(a.length, b.length);
  if (max < 5) return false;
  // never merge names that differ only by a digit/number token ("Batman Year 1" vs "Year 2" is handled by number stripping)
  if (Math.abs(a.length - b.length) > Math.ceil(max * 0.15)) return false;
  const ca = a.replace(/ /g, ''), cb = b.replace(/ /g, '');
  if (ca === cb) return true;                       // "one piece" vs "onepiece"
  return 1 - lev(ca, cb) / Math.max(ca.length, cb.length) >= 0.86;
}

const titleCase = (s) =>
  s === s.toLowerCase() || s === s.toUpperCase()
    ? s.toLowerCase().replace(/(^|[\s\-(])(\p{L})/gu, (_, p, c) => p + c.toUpperCase())
    : s;

/**
 * comics: [{id, name, path}]
 * returns Map<id, {key, title, num, label}> where key is the shared collection key
 */
export function groupComics(comics) {
  const parsed = new Map();
  const keyCount = new Map();
  for (const c of comics) {
    const parts = (c.path || c.name).split('/');
    const folder = parts.length > 1 ? parts[parts.length - 2] : '';
    const p = parseName(c.name, folder);
    parsed.set(c.id, p);
    keyCount.set(p.key, (keyCount.get(p.key) || 0) + 1);
  }

  // cluster similar keys (most frequent first so the popular spelling becomes the representative)
  const keys = [...keyCount.keys()].sort((a, b) => keyCount.get(b) - keyCount.get(a) || a.length - b.length || natCompare(a, b));
  const rep = new Map();
  const reps = [];
  for (const k of keys) {
    let r = reps.find((x) => similar(x, k));
    if (!r) { r = k; reps.push(k); }
    rep.set(k, r);
  }

  // display names: most common raw title inside the cluster
  const names = new Map();
  for (const c of comics) {
    const p = parsed.get(c.id);
    const r = rep.get(p.key);
    if (!names.has(r)) names.set(r, new Map());
    const m = names.get(r);
    m.set(p.title, (m.get(p.title) || 0) + 1);
  }
  const display = new Map();
  for (const [r, m] of names) {
    const best = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
    display.set(r, titleCase(best));
  }

  const out = new Map();
  for (const c of comics) {
    const p = parsed.get(c.id);
    const r = rep.get(p.key);
    out.set(c.id, { key: r, title: display.get(r), num: p.num, label: p.label });
  }
  return out;
}

export function sortIssues(list, info) {
  return [...list].sort((a, b) => {
    const x = info.get(a.id), y = info.get(b.id);
    const nx = x?.num, ny = y?.num;
    if (nx != null && ny != null && nx !== ny) return nx - ny;
    if (nx != null && ny == null) return -1;
    if (nx == null && ny != null) return 1;
    return natCompare(a.name, b.name);
  });
}
