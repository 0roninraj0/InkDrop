// Tiny IndexedDB wrapper. Everything stays on the device.
let dbp;
function open() {
  return (dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('inkdrop', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('kv');
      r.result.createObjectStore('covers');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}

function run(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((res, rej) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => res(req && req.result);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      })
  );
}

export const kvGet = (k) => run('kv', 'readonly', (s) => s.get(k)).catch(() => undefined);
export const kvSet = (k, v) => run('kv', 'readwrite', (s) => s.put(v, k)).catch(() => {});
export const coverGet = (id) => run('covers', 'readonly', (s) => s.get(id)).catch(() => undefined);
export const coverSet = (id, blob) => run('covers', 'readwrite', (s) => s.put(blob, id)).catch(() => {});
export const coverDel = (id) => run('covers', 'readwrite', (s) => s.delete(id)).catch(() => {});
export const coversClear = () => run('covers', 'readwrite', (s) => s.clear()).catch(() => {});
