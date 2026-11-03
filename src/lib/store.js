import { useEffect, useState } from 'preact/hooks';
import { kvGet, kvSet, coverSet, coverDel, coversClear } from './db.js';
import { debounce } from './util.js';
import { groupComics, sortIssues } from './organizer.js';
import { pickFolder, scanFolder, openSource, isNative } from './fs.js';
import { openComic, makeThumb } from './formats.js';

export const DEFAULTS = {
  mode: 'ltr',           // ltr (comic) | rtl (manga) | webtoon (manhwa / manhua vertical)
  anim: 'curl',          // curl | slide | none
  tapZones: true,
  tapInvert: false,
  filter: 'none',        // none | bw | sepia | night
  paper: false,
  paperAmt: 55,
  eye: false,
  eyeAmt: 45,
  autoEye: false,
  brightness: 100,
  autoPlaySec: 6,
  keepAwake: true,
  fx: true,              // liquid / water animations
  view: 'grid',          // grid | list
  groupBy: 'collections',// collections | comics
  tab: 'all',            // all | recent | unread | ongoing | new | completed | fav
  sort: 'recent',        // recent | added | az | za | progress
  seriesMode: {},        // collection key -> reading mode
};

let S = {
  ready: false,
  rev: 0,        // bumps on any change (progress etc.)
  structRev: 0,  // bumps when grouping inputs change
  comics: {},
  assign: {},    // comicId -> {name} | {solo:true}
  renames: {},   // auto collection key -> custom name
  folders: [],   // [{uri,name,stale}]
  settings: { ...DEFAULTS },
  scan: { busy: false, msg: '' },
  covers: { total: 0, done: 0 },
  nav: [{ name: 'library' }],
  sheet: null,
  toast: null,
  select: null,  // Set of comic ids in selection mode
};

const subs = new Set();
export const get = () => S;
export function set(patch) {
  S = { ...S, ...patch };
  subs.forEach((f) => f());
}
export function useStore() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    subs.add(f);
    return () => subs.delete(f);
  }, []);
  return S;
}

const bump = (struct = false) => set({ rev: S.rev + 1, structRev: struct ? S.structRev + 1 : S.structRev });

/* ---------------- persistence ---------------- */
const persist = debounce(() => {
  kvSet('state', { comics: S.comics, assign: S.assign, renames: S.renames, folders: S.folders, settings: S.settings });
}, 700);
function save() { persist(); }

export async function init() {
  const saved = await kvGet('state');
  if (saved) {
    set({
      comics: saved.comics || {},
      assign: saved.assign || {},
      renames: saved.renames || {},
      folders: saved.folders || [],
      settings: { ...DEFAULTS, ...(saved.settings || {}) },
      structRev: 1,
    });
  }
  set({ ready: true });
  document.addEventListener('visibilitychange', () => document.hidden && persist.flush());
  if (isNative && S.folders.length) rescan(true);
  else queueCovers();
}

/* ---------------- toast / nav / sheets ---------------- */
let toastT;
export function toast(msg) {
  set({ toast: { msg, id: Date.now() } });
  clearTimeout(toastT);
  toastT = setTimeout(() => set({ toast: null }), 2600);
}
export const push = (v) => set({ nav: [...S.nav, v], select: null });
export const pop = () => (S.nav.length > 1 ? set({ nav: S.nav.slice(0, -1) }) : false);
export const openSheet = (sheet) => set({ sheet });
export const closeSheet = () => set({ sheet: null });
export const startSelect = (id) => set({ select: new Set([id]) });
export const toggleSelect = (id) => {
  const s = new Set(S.select);
  s.has(id) ? s.delete(id) : s.add(id);
  set({ select: s.size ? s : null });
};
export const clearSelect = () => set({ select: null });

/* ---------------- settings ---------------- */
export function setSetting(k, v) {
  set({ settings: { ...S.settings, [k]: v } });
  save();
}

/* ---------------- folders & scanning ---------------- */
export async function addFolder() {
  let f;
  try { f = await pickFolder(); } catch { return; }
  const folders = S.folders.filter((x) => x.uri !== f.uri).concat({ ...f, stale: false });
  set({ folders });
  await rescan();
}

export async function removeFolder(uri) {
  const comics = { ...S.comics };
  for (const c of Object.values(comics)) if (c.folder === uri) { delete comics[c.id]; coverDel(c.id); }
  set({ folders: S.folders.filter((f) => f.uri !== uri), comics });
  bump(true); save();
}

export async function rescan(silent = false) {
  if (S.scan.busy) return;
  set({ scan: { busy: true, msg: 'Scanning folders…' } });
  let added = 0;
  try {
    const folders = [...S.folders];
    for (const folder of folders) {
      let res;
      try { res = await scanFolder(folder); }
      catch (e) {
        if (!silent) toast('Could not read ' + folder.name);
        continue;
      }
      if (res.stale) { folder.stale = true; continue; }
      folder.stale = false;
      const seen = new Set();
      for (const it of res.items) {
        seen.add(it.id);
        const ex = S.comics[it.id];
        if (!ex) {
          S.comics[it.id] = { ...it, addedAt: it.mtime || Date.now(), page: 0, pages: 0, lastRead: 0, finished: false, fav: false };
          added++;
        } else Object.assign(ex, { uri: it.uri, path: it.path, name: it.name, size: it.size, mtime: it.mtime, folder: it.folder, missing: false });
      }
      for (const c of Object.values(S.comics)) if (c.folder === folder.uri && !seen.has(c.id)) c.missing = true;
    }
    set({ folders });
  } finally {
    set({ scan: { busy: false, msg: '' } });
    bump(true); save();
  }
  if (!silent) toast(added ? `Added ${added} comic${added > 1 ? 's' : ''}` : 'Library is up to date');
  queueCovers();
}

/* ---------------- covers + page counts ---------------- */
let coverRunning = false;
export async function queueCovers(force = false) {
  if (coverRunning) return;
  const todo = Object.values(S.comics)
    .filter((c) => !c.missing && (force || !c.cover))
    .sort((a, b) => (a.ext === 'cbr' || a.ext === 'rar') - (b.ext === 'cbr' || b.ext === 'rar'));
  if (!todo.length) return;
  coverRunning = true;
  set({ covers: { total: todo.length, done: 0 } });
  let n = 0;
  const work = async (c) => {
    try {
      const src = openSource(c);
      const doc = await openComic(src, c.ext);
      const blob = await doc.getPage(0, { width: 420 });
      const thumb = await makeThumb(blob);
      await coverSet(c.id, thumb);
      c.pages = doc.count;
      c.cover = 'ok';
      doc.close(); src.close();
    } catch (e) {
      c.cover = c.cover || 'fail';
      c.error = String(e.message || e);
    }
    n++;
    if (n % 3 === 0 || n === todo.length) { set({ covers: { total: todo.length, done: n } }); bump(); save(); }
  };
  const q = [...todo];
  await Promise.all([0, 1].map(async () => { while (q.length) await work(q.shift()); }));
  coverRunning = false;
  set({ covers: { total: 0, done: 0 } });
  bump(); save();
}

export async function resetCovers() {
  await coversClear();
  for (const c of Object.values(S.comics)) delete c.cover;
  bump(); save();
  queueCovers(true);
}

export async function clearLibrary() {
  await coversClear();
  set({ comics: {}, assign: {}, renames: {}, folders: [] });
  bump(true); save();
}

/* ---------------- collections ---------------- */
let gcache = { sr: -1, val: null };
export function getGroups() {
  if (gcache.sr === S.structRev && gcache.val) return gcache.val;
  const list = Object.values(S.comics).filter((c) => !c.missing);
  const info = groupComics(list);
  const cols = new Map();
  for (const c of list) {
    const a = S.assign[c.id];
    const i = info.get(c.id);
    let key, name, auto = false;
    if (a?.name) { key = 'm:' + a.name.toLowerCase(); name = a.name; }
    else if (a?.solo) { key = 's:' + c.id; name = c.name.replace(/\.[^.]+$/, ''); }
    else { key = 'a:' + i.key; name = S.renames[key] || i.title; auto = true; }
    if (!cols.has(key)) cols.set(key, { key, name, auto, members: [] });
    cols.get(key).members.push(c);
  }
  for (const col of cols.values()) {
    col.members = sortIssues(col.members, info);
    col.ids = col.members.map((m) => m.id);
    delete col.members;
  }
  const idToCol = new Map();
  for (const col of cols.values()) for (const id of col.ids) idToCol.set(id, col.key);
  gcache = { sr: S.structRev, val: { cols, info, idToCol } };
  return gcache.val;
}

export function comicStatus(c) {
  return c.finished ? 'completed' : c.lastRead ? 'ongoing' : 'unread';
}
export function comicProgress(c) {
  if (c.finished) return 1;
  if (!c.pages || !c.lastRead) return 0;
  return Math.min(1, (c.page + 1) / c.pages);
}

export function summarize(col) {
  const cs = col.ids.map((id) => S.comics[id]).filter(Boolean);
  let lastRead = 0, added = 0, done = 0, unread = 0, prog = 0, fav = false;
  for (const c of cs) {
    lastRead = Math.max(lastRead, c.lastRead || 0);
    added = Math.max(added, c.addedAt || 0);
    const st = comicStatus(c);
    if (st === 'completed') done++;
    if (st === 'unread') unread++;
    prog += comicProgress(c);
    fav ||= c.fav;
  }
  const status = done === cs.length ? 'completed' : unread === cs.length ? 'unread' : 'ongoing';
  // resume target: most recently read unfinished, else first unread, else first
  let resume = cs.filter((c) => c.lastRead && !c.finished).sort((a, b) => b.lastRead - a.lastRead)[0]
    || cs.find((c) => !c.lastRead) || cs[0];
  return { total: cs.length, done, unread, lastRead, added, progress: cs.length ? prog / cs.length : 0, status, fav, resume, first: cs[0] };
}

/* ---------------- manual organizing ---------------- */
export function assignToCollection(ids, name) {
  name = name.trim();
  if (!name) return;
  const assign = { ...S.assign };
  ids.forEach((id) => (assign[id] = { name }));
  set({ assign, select: null });
  bump(true); save();
}
export function removeFromCollection(ids) {
  const assign = { ...S.assign };
  ids.forEach((id) => (assign[id] = { solo: true }));
  set({ assign, select: null });
  bump(true); save();
}
export function resetGrouping(ids) {
  const assign = { ...S.assign };
  ids.forEach((id) => delete assign[id]);
  set({ assign, select: null });
  bump(true); save();
}
export function renameCollection(key, name) {
  name = name.trim();
  if (!name) return;
  const g = getGroups();
  const col = g.cols.get(key);
  if (!col) return;
  if (key.startsWith('a:')) set({ renames: { ...S.renames, [key]: name } });
  else if (key.startsWith('m:')) {
    const assign = { ...S.assign };
    col.ids.forEach((id) => (assign[id] = { name }));
    set({ assign });
  }
  bump(true); save();
}
export function deleteCollection(key) {
  const col = getGroups().cols.get(key);
  if (col) resetGrouping(col.ids);
}

/* ---------------- reading state ---------------- */
export function saveProgress(id, page, total) {
  const c = S.comics[id];
  if (!c) return;
  c.page = page;
  c.pages = total;
  c.lastRead = Date.now();
  if (total > 1 && page >= total - 1) c.finished = true;
  bump(); save();
}
export function markRead(ids, read) {
  for (const id of ids) {
    const c = S.comics[id];
    if (!c) continue;
    if (read) { c.finished = true; c.lastRead = c.lastRead || Date.now(); c.page = Math.max(0, (c.pages || 1) - 1); }
    else { c.finished = false; c.lastRead = 0; c.page = 0; }
  }
  set({ select: null });
  bump(); save();
}
export function toggleFav(ids) {
  const all = ids.every((id) => S.comics[id]?.fav);
  ids.forEach((id) => S.comics[id] && (S.comics[id].fav = !all));
  set({ select: null });
  bump(); save();
}
export function startReading(id) {
  push({ name: 'reader', id });
}
export function modeFor(comicId) {
  const key = getGroups().idToCol.get(comicId);
  return (key && S.settings.seriesMode[key]) || S.settings.mode;
}
export function setModeFor(comicId, mode) {
  const key = getGroups().idToCol.get(comicId);
  if (key) set({ settings: { ...S.settings, seriesMode: { ...S.settings.seriesMode, [key]: mode } } });
  else set({ settings: { ...S.settings, mode } });
  save();
}
