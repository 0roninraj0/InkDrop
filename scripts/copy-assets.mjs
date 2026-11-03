// Copies pdf.js runtime assets (wasm, cmaps, fonts) into /public so the APK works fully offline.
import { cpSync, mkdirSync, existsSync } from 'node:fs';
const src = 'node_modules/pdfjs-dist';
const dst = 'public/pdfjs';
mkdirSync(dst, { recursive: true });
for (const d of ['wasm', 'cmaps', 'standard_fonts', 'iccs']) {
  if (existsSync(`${src}/${d}`)) cpSync(`${src}/${d}`, `${dst}/${d}`, { recursive: true });
}
console.log('pdf.js assets copied');
