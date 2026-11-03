import { useEffect, useRef, useState } from 'preact/hooks';
import { coverGet } from '../lib/db.js';
import { Icon } from './Icons.jsx';

/* ---------- water ripple on every .rip element ---------- */
export function installRipple() {
  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target.closest?.('.rip');
      if (!t || t.disabled) return;
      const b = t.getBoundingClientRect();
      const size = Math.max(b.width, b.height) * 2.2;
      const s = document.createElement('span');
      s.className = 'ripple';
      s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - b.left - size / 2}px;top:${e.clientY - b.top - size / 2}px`;
      t.appendChild(s);
      setTimeout(() => s.remove(), 750);
    },
    { passive: true }
  );
}

/* ---------- cover image from IndexedDB ---------- */
const urlCache = new Map();
export function useCover(id, rev) {
  const [url, setUrl] = useState(urlCache.get(id) || null);
  useEffect(() => {
    let live = true;
    if (urlCache.has(id)) { setUrl(urlCache.get(id)); return; }
    coverGet(id).then((b) => {
      if (!live || !b) return;
      const u = URL.createObjectURL(b);
      urlCache.set(id, u);
      setUrl(u);
    });
    return () => { live = false; };
  }, [id, rev]);
  return url;
}
export function dropCoverUrl(id) { const u = urlCache.get(id); if (u) URL.revokeObjectURL(u); urlCache.delete(id); }

export function Cover({ id, title, cover, class: c = '' }) {
  const url = useCover(id, cover);
  const hue = [...title].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 40;
  return (
    <div class={'cover ' + c} style={!url ? `--h:${15 + hue}` : ''}>
      {url ? <img src={url} alt="" loading="lazy" draggable={false} /> : (
        <div class="cover-ph"><span>{title.trim().charAt(0).toUpperCase()}</span></div>
      )}
    </div>
  );
}

/* ---------- liquid progress bar ---------- */
export function Liquid({ value, class: c = '' }) {
  return (
    <div class={'liquid ' + c}>
      <div class="liquid-fill" style={`width:${Math.max(0, Math.min(1, value)) * 100}%`} />
    </div>
  );
}

/* ---------- glass bottom sheet ---------- */
export function Sheet({ title, onClose, children, tall }) {
  const [shown, setShown] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setShown(true)); }, []);
  const close = () => { setShown(false); setTimeout(onClose, 220); };
  return (
    <div class={'sheet-wrap' + (shown ? ' on' : '')} onClick={(e) => e.target === e.currentTarget && close()}>
      <div class={'sheet glass' + (tall ? ' tall' : '')} role="dialog" aria-label={title}>
        <div class="grab" />
        <div class="sheet-head">
          <h3>{title}</h3>
          <button class="icon-btn rip" onClick={close} aria-label="Close"><Icon n="close" /></button>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Toggle({ on, onChange, label, sub }) {
  return (
    <button class="row-toggle rip" onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span class="row-text"><b>{label}</b>{sub && <small>{sub}</small>}</span>
      <span class={'switch' + (on ? ' on' : '')}><i /></span>
    </button>
  );
}

export function Seg({ value, options, onChange, label }) {
  return (
    <div class="seg-wrap">
      {label && <div class="seg-label">{label}</div>}
      <div class="seg glass-lite">
        {options.map(([v, text, sub]) => (
          <button key={v} class={'seg-b rip' + (value === v ? ' on' : '')} onClick={() => onChange(v)}>
            {text}{sub && <small>{sub}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Slider({ value, min = 0, max = 100, onChange, label, unit = '' }) {
  return (
    <label class="slider-row">
      <span>{label}</span>
      <input type="range" min={min} max={max} value={value} onInput={(e) => onChange(+e.target.value)} />
      <em>{value}{unit}</em>
    </label>
  );
}

/* ---------- music-player style scrubber ---------- */
export function Scrubber({ value, max, rtl, onSeek, loader }) {
  const track = useRef();
  const [drag, setDrag] = useState(null); // preview index while dragging
  const [thumb, setThumb] = useState(null);
  const timer = useRef(0);
  const frac = (i) => (max > 0 ? i / max : 0);
  const shown = drag ?? value;

  const idxFrom = (e) => {
    const b = track.current.getBoundingClientRect();
    let f = (e.clientX - b.left) / b.width;
    if (rtl) f = 1 - f;
    return Math.round(Math.max(0, Math.min(1, f)) * max);
  };
  const preview = (i) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const v = await loader?.get(i);
      if (v) setThumb({ i, url: v.url });
    }, 90);
  };
  const down = (e) => {
    track.current.setPointerCapture(e.pointerId);
    const i = idxFrom(e);
    setDrag(i); preview(i);
  };
  const move = (e) => {
    if (drag === null) return;
    const i = idxFrom(e);
    if (i !== drag) { setDrag(i); preview(i); }
  };
  const up = (e) => {
    if (drag === null) return;
    const i = idxFrom(e);
    setDrag(null); setThumb(null);
    clearTimeout(timer.current);
    onSeek(i);
  };
  const pct = frac(shown) * 100;

  return (
    <div class={'scrub' + (rtl ? ' rtl' : '') + (drag !== null ? ' dragging' : '')} ref={track}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-testid="scrub">
      <div class="scrub-rail">
        <div class="scrub-fill" style={`width:${pct}%`} />
      </div>
      <div class="scrub-knob" style={rtl ? `right:${pct}%` : `left:${pct}%`}><i /></div>
      {drag !== null && (
        <div class="scrub-bubble glass" style={rtl ? `right:clamp(52px, ${pct}%, calc(100% - 52px))` : `left:clamp(52px, ${pct}%, calc(100% - 52px))`}>
          {thumb && thumb.i === drag ? <img src={thumb.url} alt="" /> : <div class="bubble-ph" />}
          <b>{drag + 1}</b>
        </div>
      )}
    </div>
  );
}
