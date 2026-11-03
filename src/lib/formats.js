// Comic containers -> uniform "pages as Blobs" interface.
//   openComic(source) -> { count, getPage(i): Promise<Blob>, close() }
import { natCompare } from './util.js';

const IMG_RE = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;
const JUNK_RE = /(^|\/)(__macosx|\.ds_store|thumbs\.db|\._)/i;
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp' };
const mimeOf = (n) => MIME[n.split('.').pop().toLowerCase()] || 'image/jpeg';
const pickImages = (names) => names.filter((n) => IMG_RE.test(n) && !JUNK_RE.test(n)).sort(natCompare);

async function sniff(src) {
  const h = await src.read(0, 8);
  const s = String.fromCharCode(...h.slice(0, 4));
  if (h[0] === 0x50 && h[1] === 0x4b) return 'zip';
  if (s === 'Rar!') return 'rar';
  if (s === '%PDF') return 'pdf';
  return null;
}

export async function openComic(src, ext) {
  const kind = (await sniff(src)) || (ext === 'cbr' || ext === 'rar' ? 'rar' : ext === 'pdf' ? 'pdf' : 'zip');
  if (kind === 'zip') return openZip(src);
  if (kind === 'pdf') return openPdf(src);
  return openRar(src);
}

/* ---------------- ZIP / CBZ (random access: only touched pages are read) ---------------- */
async function openZip(src) {
  const zip = await import('@zip.js/zip.js');
  zip.configure({ useWebWorkers: false });
  class SrcReader extends zip.Reader {
    constructor() { super(); this.size = src.size; }
    async init() { this.size = src.size; }
    async readUint8Array(index, length) { return src.read(index, length); }
  }
  const reader = new zip.ZipReader(new SrcReader());
  const all = await reader.getEntries();
  const byName = new Map(all.filter((e) => !e.directory).map((e) => [e.filename, e]));
  const names = pickImages([...byName.keys()]);
  if (!names.length) throw new Error('No images found in this archive');
  return {
    count: names.length,
    async getPage(i) {
      const e = byName.get(names[i]);
      return e.getData(new zip.BlobWriter(mimeOf(names[i])));
    },
    close() { reader.close().catch(() => {}); },
  };
}

/* ---------------- RAR / CBR (loaded in memory, extracted on demand) ---------------- */
async function openRar(src) {
  const { createExtractorFromData } = await import('node-unrar-js');
  const wasmUrl = (await import('node-unrar-js/esm/js/unrar.wasm?url')).default;
  const wasmBinary = await (await fetch(wasmUrl)).arrayBuffer();
  const data = await src.read(0, src.size);
  const ex = await createExtractorFromData({ wasmBinary, data: data.buffer });
  const headers = [...ex.getFileList().fileHeaders].filter((h) => !h.flags.directory);
  const names = pickImages(headers.map((h) => h.name));
  if (!names.length) throw new Error('No images found in this archive');
  return {
    count: names.length,
    async getPage(i) {
      const { files } = ex.extract({ files: [names[i]] });
      const f = [...files][0];
      if (!f?.extraction?.data) throw new Error('Could not extract page ' + (i + 1));
      return new Blob([f.extraction.data], { type: mimeOf(names[i]) });
    },
    close() {},
  };
}

/* ---------------- PDF (rendered to JPEG per page) ---------------- */
let pdfjsP;
function loadPdfjs() {
  return (pdfjsP ||= (async () => {
    const lib = await import('pdfjs-dist');
    const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    lib.GlobalWorkerOptions.workerSrc = worker;
    return lib;
  })());
}

async function openPdf(src) {
  const pdfjs = await loadPdfjs();
  const base = (p) => new URL(p, document.baseURI).href;
  const first = await src.read(0, Math.min(src.size, 1024 * 1024));
  class Transport extends pdfjs.PDFDataRangeTransport {
    requestDataRange(begin, end) {
      src.read(begin, end - begin).then((chunk) => this.onDataRange(begin, chunk)).catch(() => {});
    }
  }
  const task = pdfjs.getDocument({
    range: new Transport(src.size, first),
    disableAutoFetch: true,
    disableStream: true,
    isEvalSupported: false,
    wasmUrl: base('pdfjs/wasm/'),
    cMapUrl: base('pdfjs/cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: base('pdfjs/standard_fonts/'),
    iccUrl: base('pdfjs/iccs/'),
  });
  const doc = await task.promise;
  return {
    count: doc.numPages,
    async getPage(i, opts = {}) {
      const page = await doc.getPage(i + 1);
      const v1 = page.getViewport({ scale: 1 });
      const target = opts.width || Math.min(2000, Math.round(Math.max(window.innerWidth, 360) * Math.min(window.devicePixelRatio || 1, 2.5)));
      const vp = page.getViewport({ scale: target / v1.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, canvas, viewport: vp }).promise;
      page.cleanup();
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
      canvas.width = canvas.height = 0;
      return blob;
    },
    close() { task.destroy().catch(() => {}); },
  };
}

/* ---------------- thumbnails ---------------- */
export async function makeThumb(blob, width = 360) {
  let bmp;
  try { bmp = await createImageBitmap(blob, { resizeWidth: width, resizeQuality: 'high' }); }
  catch { bmp = await createImageBitmap(blob); }
  const w = Math.min(width, bmp.width);
  const h = Math.round((bmp.height * w) / bmp.width);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
}
