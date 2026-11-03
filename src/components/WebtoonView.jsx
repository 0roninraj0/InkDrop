// Vertical continuous scroll for manhwa / manhua / webtoons. Pages are loaded lazily and unloaded when far away.
import { useEffect, useRef } from 'preact/hooks';

export function WebtoonView({ loader, page, onPage, onCenterTap, apiRef, tapZones, tapInvert }) {
  const scroller = useRef();
  const P = useRef({});
  P.current = { onPage, onCenterTap, tapZones, tapInvert, page };
  const cur = useRef(page);
  const settled = useRef(false);

  useEffect(() => {
    const sc = scroller.current;
    const els = () => sc.children;

    const load = (i) => {
      const el = els()[i];
      if (!el || el.dataset.on) return;
      el.dataset.on = '1';
      loader.get(i).then((v) => {
        if (!v || !el.dataset.on) return;
        el.style.height = '';
        el.style.aspectRatio = `${v.w} / ${v.h}`;
        const img = new Image();
        img.className = 'pgimg wt';
        img.draggable = false;
        img.src = v.url;
        if (v.mono) img.classList.add('mono');
        el.textContent = '';
        el.appendChild(img);
        el.classList.add('loaded');
      }).catch(() => { el.dataset.on = ''; });
    };
    const unload = (i) => {
      const el = els()[i];
      if (!el || !el.dataset.on) return;
      el.dataset.on = '';
      // keep its box height so the scroll position does not jump
      const h = el.getBoundingClientRect().height;
      el.style.aspectRatio = 'auto';
      el.style.height = h + 'px';
      el.textContent = '';
      el.classList.remove('loaded');
      loader.drop(i);
    };

    const loadObs = new IntersectionObserver((es) => {
      for (const e of es) {
        const i = +e.target.dataset.i;
        if (e.isIntersecting) { load(i); }
      }
    }, { root: sc, rootMargin: '150% 0px 150% 0px' });

    const farObs = new IntersectionObserver((es) => {
      for (const e of es) if (!e.isIntersecting) unload(+e.target.dataset.i);
    }, { root: sc, rootMargin: '500% 0px 500% 0px' });

    const midObs = new IntersectionObserver((es) => {
      for (const e of es) {
        if (!e.isIntersecting) continue;
        const i = +e.target.dataset.i;
        if (i !== cur.current && settled.current) { cur.current = i; P.current.onPage(i); }
      }
    }, { root: sc, rootMargin: '-48% 0px -48% 0px' });

    for (const el of els()) { loadObs.observe(el); farObs.observe(el); midObs.observe(el); }

    // restore position
    const start = P.current.page;
    load(start);
    requestAnimationFrame(() => {
      els()[start]?.scrollIntoView({ block: 'start' });
      setTimeout(() => { settled.current = true; }, 250);
    });

    apiRef.current = {
      next: () => sc.scrollBy({ top: sc.clientHeight * 0.85, behavior: 'smooth' }),
      prev: () => sc.scrollBy({ top: -sc.clientHeight * 0.85, behavior: 'smooth' }),
      jump: (i) => {
        if (i === cur.current) return;
        cur.current = i;
        load(i);
        els()[i]?.scrollIntoView({ block: 'start' });
      },
    };

    // tap handling (native touch scrolling stays untouched)
    let d = null;
    const down = (e) => { d = { x: e.clientX, y: e.clientY, t: performance.now() }; };
    const up = (e) => {
      if (!d) return;
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      const quick = performance.now() - d.t < 350;
      d = null;
      if (moved > 10 || !quick) return;
      const b = sc.getBoundingClientRect();
      const f = (e.clientY - b.top) / b.height;
      const { tapZones, tapInvert, onCenterTap } = P.current;
      if (tapZones && (f < 0.28 || f > 0.72)) {
        let down = f > 0.72;
        if (tapInvert) down = !down;
        sc.scrollBy({ top: (down ? 1 : -1) * sc.clientHeight * 0.85, behavior: 'smooth' });
      } else onCenterTap?.();
    };
    const cancel = () => { d = null; };
    sc.addEventListener('pointerdown', down);
    sc.addEventListener('pointerup', up);
    sc.addEventListener('pointercancel', cancel);
    return () => {
      loadObs.disconnect(); farObs.disconnect(); midObs.disconnect();
      sc.removeEventListener('pointerdown', down);
      sc.removeEventListener('pointerup', up);
      sc.removeEventListener('pointercancel', cancel);
    };
  }, [loader]);

  return (
    <div class="webtoon" ref={scroller} data-testid="webtoon">
      {Array.from({ length: loader.count }, (_, i) => (
        <div class="wt-page" data-i={i} key={i} />
      ))}
    </div>
  );
}
