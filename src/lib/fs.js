// File access layer.
//  - Android app: native "ComicFs" plugin (Storage Access Framework, persistent folder permission)
//  - Browser (testing / desktop PWA): File System Access API or <input webkitdirectory>
import { Capacitor, registerPlugin } from '@capacitor/core';
import { hash } from './util.js';

export const isNative = Capacitor.isNativePlatform();
const Native = isNative ? registerPlugin('ComicFs') : null;

const EXT_RE = /\.(cbz|zip|cbr|rar|pdf)$/i;
const webFiles = new Map(); // comic id -> File (browser only, lives for the session)
const webFolders = new Map(); // folder uri -> [{file, path}]

export const comicId = (uri, size) => 'c' + hash(uri + '|' + size);

function itemFrom(folderUri, uri, name, path, size, mtime) {
  const ext = (name.match(EXT_RE)?.[1] || '').toLowerCase();
  return { id: comicId(uri, size), uri, name, path, size: size || 0, mtime: mtime || 0, ext, folder: folderUri };
}

/* ---------------- folder picking ---------------- */
export async function pickFolder() {
  if (isNative) {
    const r = await Native.pickFolder();
    return { uri: r.uri, name: r.name || 'Comics' };
  }
  let entries = [];
  let name = 'Comics';
  if (window.showDirectoryPicker) {
    const dir = await window.showDirectoryPicker();
    name = dir.name;
    const walk = async (d, prefix) => {
      for await (const [n, h] of d.entries()) {
        if (n.startsWith('.')) continue;
        if (h.kind === 'directory') await walk(h, prefix + n + '/');
        else if (EXT_RE.test(n)) entries.push({ file: await h.getFile(), path: prefix + n });
      }
    };
    await walk(dir, '');
  } else {
    const files = await pickViaInput();
    if (!files.length) throw new Error('cancelled');
    entries = files
      .filter((f) => EXT_RE.test(f.name))
      .map((f) => ({ file: f, path: f.webkitRelativePath || f.name }));
    name = (files[0].webkitRelativePath || '').split('/')[0] || 'Comics';
  }
  const uri = 'web:' + name;
  webFolders.set(uri, entries);
  return { uri, name };
}

function pickViaInput() {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.multiple = true;
    inp.webkitdirectory = true;
    inp.style.display = 'none';
    inp.onchange = () => resolve([...inp.files]);
    inp.oncancel = () => resolve([]);
    document.body.appendChild(inp);
    inp.click();
    setTimeout(() => inp.remove(), 60000);
  });
}

/* ---------------- scanning ---------------- */
export async function scanFolder(folder) {
  if (isNative) {
    const r = await Native.listFiles({ uri: folder.uri });
    return { items: r.files.map((f) => itemFrom(folder.uri, f.uri, f.name, f.path || f.name, f.size, f.mtime)), stale: false };
  }
  const entries = webFolders.get(folder.uri);
  if (!entries) return { items: [], stale: true }; // browser forgot the files after reload
  const items = entries.map(({ file, path }) => {
    const it = itemFrom(folder.uri, 'web:' + path, file.name, path, file.size, file.lastModified);
    webFiles.set(it.id, file);
    return it;
  });
  return { items, stale: false };
}

export const canRead = (comic) => (isNative ? true : webFiles.has(comic.id));

/* ---------------- random-access reading ---------------- */
const BLOCK = 1024 * 1024;

async function b64ToU8(b64) {
  const res = await fetch('data:application/octet-stream;base64,' + b64);
  return new Uint8Array(await res.arrayBuffer());
}

export function openSource(comic) {
  let raw;
  if (isNative) {
    raw = async (offset, length) => {
      const r = await Native.read({ uri: comic.uri, offset, length });
      return b64ToU8(r.data);
    };
  } else {
    const file = webFiles.get(comic.id);
    if (!file) throw new Error('File not available. Re-select the folder.');
    raw = async (offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
  }
  const size = comic.size;
  const cache = new Map(); // block index -> Promise<Uint8Array>
  const getBlock = (i) => {
    if (cache.has(i)) {
      const p = cache.get(i);
      cache.delete(i); cache.set(i, p); // LRU bump
      return p;
    }
    const p = raw(i * BLOCK, Math.min(BLOCK, size - i * BLOCK));
    cache.set(i, p);
    if (cache.size > 6) cache.delete(cache.keys().next().value);
    p.catch(() => cache.delete(i));
    return p;
  };

  return {
    size,
    async read(offset, length) {
      length = Math.max(0, Math.min(length, size - offset));
      if (length > 3 * BLOCK) return raw(offset, length); // big reads skip the block cache
      const out = new Uint8Array(length);
      let pos = 0;
      while (pos < length) {
        const abs = offset + pos;
        const bi = Math.floor(abs / BLOCK);
        const blk = await getBlock(bi);
        const inBlk = abs - bi * BLOCK;
        const n = Math.min(blk.length - inBlk, length - pos);
        if (n <= 0) break;
        out.set(blk.subarray(inBlk, inBlk + n), pos);
        pos += n;
      }
      return out;
    },
    close() {
      cache.clear();
      if (isNative) Native.close({ uri: comic.uri }).catch(() => {});
    },
  };
}
