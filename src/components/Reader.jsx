import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { SystemBars } from '@capacitor/core';
import { Icon } from './Icons.jsx';
import { Scrubber, Sheet } from './ui.jsx';
import { PagedView } from './PagedView.jsx';
import { WebtoonView } from './WebtoonView.jsx';
import { ReadingControls, DisplayControls } from './Controls.jsx';
import { useStore, saveProgress, modeFor, getGroups, pop, set, toast } from '../lib/store.js';
import { openSource, isNative } from '../lib/fs.js';
import { openComic } from '../lib/formats.js';
import { PageLoader } from '../lib/pages.js';
import { bambooUrl } from '../lib/bamboo.js';
import { clamp, debounce } from '../lib/util.js';

const FILTERS = {
  none: 'none',
  auto: 'none',
  bw: 'grayscale(1) contrast(1.12)',
  sepia: 'sepia(.6) contrast(.96)',
  night: 'invert(1) hue-rotate(180deg) brightness(.9)',
};

export function Reader({ id }) {
  const S = useStore();
  const comic = S.comics[id];
  const st = S.settings;
  const mode = modeFor(id);
  const rtl = mode === 'rtl';

  const [loader, setLoader] = useState(null);
  const [err, setErr] = useState('');
  const [page, setPage] = useState(0);
  const [ui, setUi] = useState(true);
  const [panel, setPanel] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);
  const api = useRef({});
  const pageRef = useRef(0);
  pageRef.current = page;
  const total = loader?.count || 0;

  /* ---- open the archive ---- */
  useEffect(() => {
    let dead = false, ld, src;
    (async () => {
      try {
        src = openSource(comic);
        const doc = await openComic(src, comic.ext);
        ld = new PageLoader(doc);
        if (dead) { ld.destroy(); return; }
        const start = comic.finished ? 0 : clamp(comic.page || 0, 0, doc.count - 1);
        comic.pages = doc.count;
        setPage(start);
        setLoader(ld);
      } catch (e) {
        if (!dead) setErr(String(e.message || e));
      }
    })();
    return () => { dead = true; ld?.destroy(); src?.close(); };
  }, [id]);

  /* ---- progress saving ---- */
  const save = useMemo(() => debounce((i, n) => saveProgress(id, i, n), 450), [id]);
  const onPage = (i) => {
    setPage(i);
    save(i, loader.count);
    if (i >= loader.count - 1 && playing) setPlaying(false);
  };
  useEffect(() => () => { if (loader) { save.flush(pageRef.current, loader.count); } }, [loader]);
  /* ---- immersive + wake lock ---- */
  useEffect(() => {
    if (isNative) SystemBars.hide().catch(() => {});
    return () => { if (isNative) SystemBars.show().catch(() => {}); };
  }, []);
  useEffect(() => {
    let lock;
    if (st.keepAwake && navigator.wakeLock) navigator.wakeLock.request('screen').then((l) => (lock = l)).catch(() => {});
    return () => lock?.release?.().catch(() => {});
  }, [st.keepAwake]);

  /* ---- auto-advance (the "play" button) ---- */
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      if (pageRef.current >= total - 1) { setPlaying(false); setDone(true); return; }
      api.current.next?.();
    }, Math.max(2, st.autoPlaySec) * 1000);
    return () => clearInterval(t);
  }, [playing, total, st.autoPlaySec]);

  /* ---- keyboard (desktop / bluetooth keyboards) ---- */
  useEffect(() => {
    const k = (e) => {
      if (panel) return;
      const fwd = rtl ? 'ArrowLeft' : 'ArrowRight', back = rtl ? 'ArrowRight' : 'ArrowLeft';
      if (e.key === fwd || e.key === 'PageDown' || e.key === ' ') { api.current.next?.(); e.preventDefault(); }
      else if (e.key === back || e.key === 'PageUp') { api.current.prev?.(); e.preventDefault(); }
      else if (e.key === 'Escape') pop();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [rtl, panel]);

  /* ---- neighbours in the collection ---- */
  const nav = useMemo(() => {
    const g = getGroups();
    const col = g.cols.get(g.idToCol.get(id));
    if (!col) return {};
    const i = col.ids.indexOf(id);
    return { col, prev: col.ids[i - 1], next: col.ids[i + 1], idx: i };
  }, [id, S.structRev]);
  const gotoComic = (nid) => { if (nid) set({ nav: [...S.nav.slice(0, -1), { name: 'reader', id: nid }] }); };

  const seek = (i) => { setPage(i); api.current.jump?.(i); save(i, total); };

  /* ---- look ---- */
  const hour = new Date().getHours();
  const night = hour >= 19 || hour < 6;
  const eyeOn = st.eye || (st.autoEye && night);
  const style = {
    '--imgf': `${FILTERS[st.filter]} brightness(${st.brightness / 100})`.replace('none ', ''),
    '--monof': st.filter === 'auto' ? `grayscale(1) contrast(1.28) brightness(${(st.brightness / 100) * 1.03})` : `${FILTERS[st.filter]} brightness(${st.brightness / 100})`.replace('none ', ''),
  };
  const bamboo = st.paper ? bambooUrl() : null;
  const left = Math.max(0, total - 1 - page);

  return (
    <div class="reader" style={style} data-testid="reader">
      {err && (
        <div class="center-msg">
          <div class="glass pad">
            <h3>Can't open this comic</h3>
            <p>{err}</p>
            <button class="btn rip" onClick={pop}>Back</button>
          </div>
        </div>
      )}
      {!loader && !err && <div class="center-msg"><div class="droplet-spin" /><p>Opening…</p></div>}

      {loader && mode !== 'webtoon' && (
        <PagedView key={'p' + id} loader={loader} page={page} rtl={rtl} anim={st.anim} tapZones={st.tapZones} tapInvert={st.tapInvert}
          onPage={onPage} apiRef={api} onCenterTap={() => setUi((u) => !u)}
          onEdge={(fwd) => (fwd ? setDone(true) : toast('First page'))} />
      )}
      {loader && mode === 'webtoon' && (
        <WebtoonView key={'w' + id} loader={loader} page={page} onPage={onPage} apiRef={api} tapZones={st.tapZones} tapInvert={st.tapInvert}
          onCenterTap={() => setUi((u) => !u)} />
      )}

      {bamboo && <div class="overlay paper-ov" style={`background-image:url(${bamboo});opacity:${st.paperAmt / 100}`} />}
      {eyeOn && <div class="overlay eye-ov" style={`opacity:${0.1 + st.eyeAmt * 0.0048}`} />}

      {/* top bar */}
      <div class={'topbar glass' + (ui ? '' : ' hide')}>
        <button class="icon-btn rip" onClick={pop} aria-label="Back" data-testid="rd-back"><Icon n="back" /></button>
        <div class="tb-title">
          <b>{nav.col?.name || comic.name}</b>
          <small>{comic.name.replace(/\.[^.]+$/, '')}</small>
        </div>
        <button class="icon-btn rip" onClick={() => setPanel('display')} aria-label="Display settings" data-testid="rd-display"><Icon n="eye" /></button>
        <button class="icon-btn rip" onClick={() => setPanel('read')} aria-label="Reading settings" data-testid="rd-read"><Icon n="sliders" /></button>
      </div>

      {/* track bar - like a music player */}
      {loader && (
        <div class={'trackbar glass' + (ui ? '' : ' hide')} data-testid="trackbar">
          <div class="tr-top">
            <span class="tr-now"><b data-testid="rd-page">{page + 1}</b><i>/</i>{total}</span>
            <span class="tr-mid">{nav.col && nav.col.ids.length > 1 ? `Issue ${nav.idx + 1} of ${nav.col.ids.length}` : mode === 'webtoon' ? 'Manhwa' : rtl ? 'Manga' : 'Comic'}</span>
            <span class="tr-left">{left ? `${left} left` : 'last page'}</span>
          </div>
          <Scrubber value={page} max={Math.max(0, total - 1)} rtl={rtl} onSeek={seek} loader={loader} />
          <div class={'tr-controls' + (rtl ? ' rtl' : '')}>
            <button class="icon-btn rip" disabled={!nav.prev} onClick={() => gotoComic(nav.prev)} aria-label="Previous issue"><Icon n="skipb" fill sw={1.4} /></button>
            <button class="icon-btn rip" onClick={() => api.current.prev?.()} aria-label="Previous page" data-testid="rd-prev"><Icon n="back" size={26} /></button>
            <button class={'play rip' + (playing ? ' on' : '')} onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause auto page turn' : 'Auto page turn'} data-testid="rd-play">
              <Icon n={playing ? 'pause' : 'play'} fill={!playing} size={26} />
            </button>
            <button class="icon-btn rip" onClick={() => api.current.next?.()} aria-label="Next page" data-testid="rd-next"><Icon n="next" size={26} /></button>
            <button class="icon-btn rip" disabled={!nav.next} onClick={() => gotoComic(nav.next)} aria-label="Next issue"><Icon n="skipf" fill sw={1.4} /></button>
          </div>
        </div>
      )}

      {done && (
        <div class="end-wrap" onClick={(e) => e.target === e.currentTarget && setDone(false)}>
          <div class="glass end-card" data-testid="end-card">
            <div class="end-drop"><Icon n="check" size={30} sw={2.4} /></div>
            <h3>Finished</h3>
            <p>{comic.name.replace(/\.[^.]+$/, '')}</p>
            {nav.next && <button class="btn primary rip" onClick={() => gotoComic(nav.next)}>Next issue <Icon n="next" size={18} /></button>}
            <button class="btn rip" onClick={() => { setDone(false); seek(0); }}>Read again</button>
            <button class="btn ghost rip" onClick={pop}>Back to library</button>
          </div>
        </div>
      )}

      {panel === 'display' && (
        <Sheet title="Display" onClose={() => setPanel(null)} tall><DisplayControls st={st} /></Sheet>
      )}
      {panel === 'read' && (
        <Sheet title="Reading" onClose={() => setPanel(null)} tall>
          <ReadingControls st={st} comicId={id} mode={mode} />
        </Sheet>
      )}
    </div>
  );
}
