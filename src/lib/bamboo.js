// Procedural bamboo-paper texture (seamless tile), generated once on-device - no image assets needed.
let url;
export function bambooUrl() {
  if (url) return url;
  const S = 384;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  // warm base
  const base = g.createLinearGradient(0, 0, S, S);
  base.addColorStop(0, '#ecd9a0');
  base.addColorStop(1, '#e2cb8a');
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);

  let seed = 1337;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // soft clouds so the colour is not flat
  for (let i = 0; i < 40; i++) {
    const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 70;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() > 0.5;
    rg.addColorStop(0, dark ? 'rgba(150,110,40,.10)' : 'rgba(255,245,200,.16)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.save(); g.translate(ox, oy); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
    }
  }
  // long vertical bamboo fibres
  for (let i = 0; i < 520; i++) {
    const x = rnd() * S, y = rnd() * S, len = 20 + rnd() * 150;
    const a = 0.05 + rnd() * 0.16;
    g.strokeStyle = rnd() > 0.45 ? `rgba(120,85,30,${a})` : `rgba(255,248,215,${a * 1.2})`;
    g.lineWidth = 0.4 + rnd() * 1.1;
    const dx = (rnd() - 0.5) * 3;
    for (const oy of [-S, 0, S]) {
      g.beginPath(); g.moveTo(x, y + oy); g.lineTo(x + dx, y + oy + len); g.stroke();
    }
  }
  // faint chain lines (paper mould marks) and bamboo nodes
  for (let x = 14; x < S; x += 24) {
    g.fillStyle = 'rgba(110,80,30,.045)';
    g.fillRect(x, 0, 1.4, S);
  }
  for (const y of [96, 290]) {
    const ng = g.createLinearGradient(0, y - 5, 0, y + 5);
    ng.addColorStop(0, 'rgba(100,70,20,0)');
    ng.addColorStop(0.5, 'rgba(100,70,20,.12)');
    ng.addColorStop(1, 'rgba(100,70,20,0)');
    g.fillStyle = ng;
    g.fillRect(0, y - 5, S, 10);
  }
  // fine grain
  const id = g.getImageData(0, 0, S, S);
  for (let i = 0; i < id.data.length; i += 4) {
    const n = (rnd() - 0.5) * 14;
    id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n;
  }
  g.putImageData(id, 0, 0);
  url = c.toDataURL('image/jpeg', 0.9);
  return url;
}
