// Page cache: Blob -> object URL -> decoded <img>, with neighbour preloading and eviction.
export class PageLoader {
  constructor(doc) {
    this.doc = doc;
    this.count = doc.count;
    this.map = new Map(); // index -> Promise<{url,w,h,mono}>
    this.ready = new Map(); // index -> resolved value (sync access for gestures)
    this.dead = false;
  }

  get(i) {
    if (i < 0 || i >= this.count) return Promise.resolve(null);
    let p = this.map.get(i);
    if (!p) {
      p = (async () => {
        const blob = await this.doc.getPage(i);
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.src = url;
        try { await img.decode(); } catch { /* some formats decode lazily */ }
        if (this.dead) { URL.revokeObjectURL(url); return null; }
        const r = { url, w: img.naturalWidth || 1, h: img.naturalHeight || 1, mono: isMono(img) };
        this.ready.set(i, r);
        return r;
      })();
      p.catch(() => this.map.delete(i));
      this.map.set(i, p);
    }
    return p;
  }

  peek(i) { return this.ready.get(i) || null; }

  preload(i, ahead = 2, behind = 1) {
    for (let k = -behind; k <= ahead; k++) this.get(i + k);
  }

  // keep only [lo, hi]
  evict(lo, hi) {
    for (const [i, p] of this.map) {
      if (i < lo || i > hi) {
        this.map.delete(i);
        this.ready.delete(i);
        p.then((r) => r && URL.revokeObjectURL(r.url)).catch(() => {});
      }
    }
  }

  drop(i) {
    const p = this.map.get(i);
    if (!p) return;
    this.map.delete(i);
    this.ready.delete(i);
    p.then((r) => r && URL.revokeObjectURL(r.url)).catch(() => {});
  }

  destroy() {
    this.dead = true;
    for (const p of this.map.values()) p.then((r) => r && URL.revokeObjectURL(r.url)).catch(() => {});
    this.map.clear();
    this.ready.clear();
    this.doc.close?.();
  }
}

// Detect (nearly) colourless pages so "Auto B&W" can clean up scans without touching colour pages.
let probe;
function isMono(img) {
  try {
    probe ||= document.createElement('canvas');
    probe.width = probe.height = 32;
    const ctx = probe.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 32, 32);
    const d = ctx.getImageData(0, 0, 32, 32).data;
    let sat = 0;
    for (let i = 0; i < d.length; i += 4) {
      const mx = Math.max(d[i], d[i + 1], d[i + 2]);
      const mn = Math.min(d[i], d[i + 1], d[i + 2]);
      sat += mx ? (mx - mn) / mx : 0;
    }
    return sat / 1024 < 0.1;
  } catch { return false; }
}
