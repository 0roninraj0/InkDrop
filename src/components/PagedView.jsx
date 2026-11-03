// Paged reader (comic LTR / manga RTL): swipe with a literal 3D page turn, slide, or instant;
// tap zones, pinch / double-tap zoom, wheel + keyboard on desktop.
import { useEffect, useRef } from 'preact/hooks';
import { clamp } from '../lib/util.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function PagedView(props) {
  const { loader } = props;
  const R = useRef({});
  const P = useRef(props);
  P.current = props;
  const S = useRef({ idx: props.page, busy: false, s: 1, tx: 0, ty: 0, raf: 0 });
  const r = (n) => (el) => (R.current[n] = el);

  /* ---------- helpers (read refs lazily so they are always current) ---------- */
  const $ = (n) => R.current[n];
  const setImg = (img, v) => { img.src = v.url; img.classList.toggle('mono', !!v.mono); };

  function applyZoom(smooth) {
    const st = S.current, z = $('zoom');
    z.style.transition = smooth ? 'transform .25s cubic-bezier(.2,.8,.2,1)' : 'none';
    z.style.transform = `translate3d(${st.tx}px,${st.ty}px,0) scale(${st.s})`;
  }
  function clampPan() {
    const st = S.current, b = $('root').getBoundingClientRect();
    st.tx = clamp(st.tx, b.width - b.width * st.s, 0);
    st.ty = clamp(st.ty, b.height - b.height * st.s, 0);
  }
  function resetZoom(smooth) {
    const st = S.current;
    st.s = 1; st.tx = 0; st.ty = 0;
    applyZoom(smooth);
  }

  function hideLayers() {
    for (const n of ['under', 'sheet']) {
      const e = $(n);
      e.style.visibility = 'hidden';
      e.style.transform = '';
      e.style.boxShadow = '';
    }
    $('base').style.visibility = 'visible';
  }

  async function show(i) {
    const st = S.current;
    const v = await loader.get(i);
    if (!v) return;
    setImg($('baseImg'), v);
    st.idx = i;
    resetZoom();
    hideLayers();
    loader.preload(i);
    loader.evict(i - 3, i + 4);
  }

  /* ---------- flip rendering ---------- */
  function layout(forward, a, b) {
    // forward: current page (a) lifts away revealing next (b). backward: previous (b) lands on top of current (a)
    setImg($('underImg'), forward ? b : a);
    setImg($('frontImg'), forward ? a : b);
    setImg($('backImg'), forward ? a : b);
    $('base').style.visibility = 'hidden';
    $('under').style.visibility = 'visible';
    $('sheet').style.visibility = 'visible';
  }

  function render(g, forward) {
    const { anim, rtl } = P.current;
    const sheet = $('sheet'), under = $('under');
    if (anim === 'curl') {
      const gg = clamp(g, 0, 2);
      const th = forward ? Math.acos(1 - gg) : Math.PI - Math.acos(1 - gg);
      const deg = (th * 180) / Math.PI;
      const sn = Math.sin(th);
      sheet.style.transformOrigin = rtl ? '100% 50%' : '0% 50%';
      sheet.style.transform = `rotateY(${rtl ? deg : -deg}deg)`;
      sheet.style.boxShadow = `0 0 ${(sn * 60).toFixed(0)}px rgba(0,0,0,${(sn * 0.7).toFixed(2)})`;
      $('shadeF').style.opacity = (sn * 0.55).toFixed(3);
      $('sheen').style.opacity = clamp(sn * 1.4, 0, 1).toFixed(3);
      $('shadeB').style.opacity = ((1 - sn) * 0.5).toFixed(3);
      $('shadeU').style.opacity = (sn * 0.6).toFixed(3);
      under.style.transform = '';
    } else {
      const W = $('root').clientWidth;
      const q = clamp(g, 0, 1);
      const dir = rtl ? -1 : 1;
      sheet.style.transformOrigin = '50% 50%';
      sheet.style.transform = `translate3d(${forward ? -dir * q * W : -dir * (1 - q) * W}px,0,0)`;
      under.style.transform = `translate3d(${forward ? dir * (1 - q) * W : dir * q * W}px,0,0)`;
      $('shadeF').style.opacity = 0; $('sheen').style.opacity = 0; $('shadeB').style.opacity = 0; $('shadeU').style.opacity = 0;
    }
  }

  function run(from, to, dur, forward, done) {
    const st = S.current;
    cancelAnimationFrame(st.raf);
    const t0 = performance.now();
    const step = (now) => {
      const t = clamp((now - t0) / dur, 0, 1);
      render(from + (to - from) * ease(t), forward);
      if (t < 1) st.raf = requestAnimationFrame(step);
      else done?.();
    };
    st.raf = requestAnimationFrame(step);
  }

  const neighbor = (forward) => S.current.idx + (forward ? 1 : -1);

  async function prepare(forward) {
    const st = S.current;
    const [a, b] = await Promise.all([loader.get(st.idx), loader.get(neighbor(forward))]);
    if (!a || !b) return false;
    layout(forward, a, b);
    render(0, forward);
    return true;
  }
  function prepareSync(forward) {
    const st = S.current;
    const a = loader.peek(st.idx), b = loader.peek(neighbor(forward));
    if (!b) loader.get(neighbor(forward));
    if (!a || !b) return false;
    layout(forward, a, b);
    render(0, forward);
    return true;
  }

  async function finish(forward) {
    const st = S.current;
    st.idx = neighbor(forward);
    const v = await loader.get(st.idx);
    setImg($('baseImg'), v);
    try { await $('baseImg').decode(); } catch { /* ignore */ }
    resetZoom();
    hideLayers();
    st.busy = false;
    P.current.onPage(st.idx);
    loader.preload(st.idx);
    loader.evict(st.idx - 3, st.idx + 4);
  }

  function complete(forward, fromG) {
    const { anim } = P.current;
    const st = S.current;
    st.busy = true;
    if (anim === 'none') { render(anim === 'curl' ? 2 : 1, forward); finish(forward); return; }
    const target = anim === 'curl' ? 2 : 1;
    const remain = (target - fromG) / target;
    run(fromG, target, (anim === 'curl' ? 560 : 260) * Math.max(0.35, remain), forward, () => finish(forward));
  }
  function cancel(forward, fromG) {
    const st = S.current;
    st.busy = true;
    run(fromG, 0, 260, forward, () => { hideLayers(); st.busy = false; });
  }

  function bounce(forward) {
    const { rtl } = P.current;
    const b = $('base');
    const dx = (forward ? -1 : 1) * (rtl ? -1 : 1) * 26;
    b.style.transition = 'transform .14s ease-out';
    b.style.transform = `translateX(${dx}px)`;
    setTimeout(() => { b.style.transition = 'transform .3s cubic-bezier(.2,.9,.3,1.3)'; b.style.transform = ''; }, 140);
  }

  async function turn(forward) {
    const st = S.current;
    if (st.busy) return;
    const n = neighbor(forward);
    if (n < 0 || n >= loader.count) { P.current.onEdge?.(forward); bounce(forward); return; }
    if (st.s > 1) resetZoom(true);
    st.busy = true;
    const ok = await prepare(forward);
    if (!ok) { st.busy = false; return; }
    st.busy = false;
    complete(forward, 0);
  }

  /* ---------- API for the reader chrome ---------- */
  useEffect(() => {
    P.current.apiRef.current = {
      next: () => turn(true),
      prev: () => turn(false),
      jump: (i) => { if (!S.current.busy) show(i); },
    };
  });

  useEffect(() => { show(props.page); return () => cancelAnimationFrame(S.current.raf); }, [loader]);
  useEffect(() => {
    const st = S.current;
    if (!st.busy && props.page !== st.idx) show(props.page);
  }, [props.page]);

  /* ---------- gestures ---------- */
  useEffect(() => {
    const root = $('root');
    const pts = new Map();
    let g = null; // gesture state
    let lastTap = { t: 0, x: 0, y: 0 };
    let tapTimer = 0;
    let wheelLock = 0;

    const rel = (e) => { const b = root.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top, w: b.width, h: b.height }; };

    const down = (e) => {
      root.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const st = S.current;
      if (pts.size === 2) {
        if (g?.mode === 'drag') cancel(g.forward, g.g);
        const [a, b] = [...pts.values()];
        const c = rel({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
        g = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), s0: st.s, px: (c.x - st.tx) / st.s, py: (c.y - st.ty) / st.s };
        return;
      }
      if (st.busy) { g = { mode: 'ignore' }; return; }
      g = { mode: 'undecided', x0: e.clientX, y0: e.clientY, t0: performance.now(), moves: [] };
    };

    const move = (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!g) return;
      const st = S.current;
      const { rtl } = P.current;

      if (g.mode === 'pinch' && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const c = rel({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
        st.s = clamp((g.s0 * d) / g.d0, 1, 4);
        st.tx = c.x - g.px * st.s;
        st.ty = c.y - g.py * st.s;
        clampPan();
        applyZoom(false);
        return;
      }
      if (pts.size !== 1) return;

      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;

      if (st.s > 1.02 && g.mode !== 'ignore') { // pan while zoomed
        g.mode = 'pan';
        st.tx += e.clientX - prev.x; st.ty += e.clientY - prev.y;
        clampPan(); applyZoom(false);
        return;
      }

      if (g.mode === 'undecided' && Math.abs(dx) > 9 && Math.abs(dx) > Math.abs(dy) * 0.7) {
        const forward = (rtl ? dx : -dx) > 0;
        const n = neighbor(forward);
        if (n < 0 || n >= loader.count) g = { ...g, mode: 'edge', forward };
        else if (prepareSync(forward)) g = { ...g, mode: 'drag', forward, g: 0 };
        else g = { ...g, mode: 'ignore' };
        if (g.mode === 'drag') { st.busy = true; cancelAnimationFrame(st.raf); }
      }

      if (g.mode === 'drag') {
        const W = root.clientWidth;
        const pull = Math.max(0, g.forward ? (rtl ? dx : -dx) : (rtl ? -dx : dx));
        const k = P.current.anim === 'curl' ? 2.2 : 1.05;
        g.g = Math.min(pull * k / W, P.current.anim === 'curl' ? 2 : 1);
        g.moves.push({ t: performance.now(), x: e.clientX });
        if (g.moves.length > 6) g.moves.shift();
        render(g.g, g.forward);
      } else if (g.mode === 'edge') {
        const b = $('base');
        b.style.transition = 'none';
        b.style.transform = `translateX(${clamp(dx * 0.25, -70, 70)}px)`;
        g.dx = dx;
      }
    };

    const up = (e) => {
      const had = pts.delete(e.pointerId);
      if (!had || !g) return;
      const st = S.current;
      const cur = g;
      if (cur.mode === 'pinch') {
        if (pts.size < 2) { if (st.s < 1.05) resetZoom(true); g = pts.size === 1 ? { mode: 'ignore' } : null; }
        return;
      }
      if (pts.size > 0) return;
      g = null;
      if (cur.mode === 'drag') {
        const m = cur.moves;
        let v = 0;
        if (m.length > 1) {
          const a = m[0], b = m[m.length - 1];
          const raw = (b.x - a.x) / Math.max(1, b.t - a.t); // px/ms
          v = cur.forward ? (P.current.rtl ? raw : -raw) : (P.current.rtl ? -raw : raw);
        }
        const thr = P.current.anim === 'curl' ? 0.6 : 0.33;
        if (cur.g >= thr || (v > 0.45 && cur.g > 0.08)) complete(cur.forward, cur.g);
        else cancel(cur.forward, cur.g);
      } else if (cur.mode === 'edge') {
        const b = $('base');
        b.style.transition = 'transform .35s cubic-bezier(.2,.9,.3,1.3)';
        b.style.transform = '';
        if (Math.abs(cur.dx || 0) > root.clientWidth * 0.18) P.current.onEdge?.(cur.forward);
      } else if (cur.mode === 'undecided' || cur.mode === 'pan') {
        const moved = Math.hypot(e.clientX - cur.x0, e.clientY - cur.y0);
        if (cur.mode === 'undecided' && moved < 12 && performance.now() - cur.t0 < 380) tap(rel(e));
      }
    };

    const tap = ({ x, y, w }) => {
      const st = S.current;
      const { tapZones, tapInvert, rtl, onCenterTap } = P.current;
      const f = x / w;
      const side = f < 0.3 ? 'left' : f > 0.7 ? 'right' : 'center';
      if (side !== 'center' && tapZones && st.s <= 1.02) {
        let forward = side === 'right';
        if (rtl) forward = !forward;
        if (tapInvert) forward = !forward;
        turn(forward);
        return;
      }
      // center: double tap zooms, single tap toggles the toolbars
      const now = performance.now();
      if (now - lastTap.t < 300 && Math.hypot(x - lastTap.x, y - lastTap.y) < 40) {
        clearTimeout(tapTimer);
        lastTap.t = 0;
        if (st.s > 1.02) resetZoom(true);
        else { st.s = 2.5; st.tx = x - x * 2.5; st.ty = y - y * 2.5; clampPan(); applyZoom(true); }
        return;
      }
      lastTap = { t: now, x, y };
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => onCenterTap?.(), 260);
    };

    const wheel = (e) => {
      e.preventDefault();
      const st = S.current;
      if (e.ctrlKey || e.metaKey) {
        const b = root.getBoundingClientRect();
        const x = e.clientX - b.left, y = e.clientY - b.top;
        const ns = clamp(st.s * (e.deltaY < 0 ? 1.15 : 0.87), 1, 4);
        const px = (x - st.tx) / st.s, py = (y - st.ty) / st.s;
        st.s = ns; st.tx = x - px * ns; st.ty = y - py * ns;
        clampPan(); applyZoom(false);
        return;
      }
      if (st.s > 1.02) { st.tx -= e.deltaX; st.ty -= e.deltaY; clampPan(); applyZoom(false); return; }
      const now = performance.now();
      if (now - wheelLock < 380) return;
      wheelLock = now;
      turn(e.deltaY > 0 || e.deltaX > 0);
    };

    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('wheel', wheel, { passive: false });
    return () => {
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', up);
      root.removeEventListener('pointercancel', up);
      root.removeEventListener('wheel', wheel);
      clearTimeout(tapTimer);
    };
  }, [loader]);

  return (
    <div class={'stage' + (props.rtl ? ' rtl' : '')} ref={r('root')} data-testid="stage">
      <div class="layer under" ref={r('under')} style="visibility:hidden">
        <img class="pgimg" ref={r('underImg')} draggable={false} alt="" />
        <div class="shade" ref={r('shadeU')} />
      </div>
      <div class="layer base" ref={r('base')}>
        <div class="zoom" ref={r('zoom')}>
          <img class="pgimg" ref={r('baseImg')} draggable={false} alt="" />
        </div>
      </div>
      <div class="layer sheet" ref={r('sheet')} style="visibility:hidden">
        <div class="face front">
          <img class="pgimg" ref={r('frontImg')} draggable={false} alt="" />
          <div class="shade" ref={r('shadeF')} />
          <div class="sheen" ref={r('sheen')} />
        </div>
        <div class="face back">
          <img class="pgimg mirror" ref={r('backImg')} draggable={false} alt="" />
          <div class="shade paper" ref={r('shadeB')} />
        </div>
      </div>
    </div>
  );
}
