import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon, Logo } from './Icons.jsx';
import { Cover, Liquid } from './ui.jsx';
import {
  useStore, getGroups, summarize, comicStatus, comicProgress, addFolder, rescan, setSetting, push, startReading,
  openSheet, startSelect, toggleSelect, clearSelect, markRead, toggleFav, pop,
} from '../lib/store.js';
import { natCompare, fmtSize, timeAgo } from '../lib/util.js';

const DAY = 86400000;
let libScroll = 0; // remembered when you come back from a collection / the reader
const TABS = [
  ['all', 'All'], ['recent', 'Recently read'], ['unread', 'Unread'], ['ongoing', 'Ongoing'],
  ['new', 'Newly added'], ['completed', 'Completed'], ['fav', 'Favourites'],
];
const SORTS = [['recent', 'Recently read'], ['added', 'Newly added'], ['az', 'Name A → Z'], ['za', 'Name Z → A'], ['progress', 'Progress']];

/* long-press helper (one press at a time, so module state is fine) */
let lpT = 0, lpFired = false, lpX = 0, lpY = 0;
export const press = (onLong, onTap) => ({
  onPointerDown: (e) => { lpFired = false; lpX = e.clientX; lpY = e.clientY; clearTimeout(lpT); lpT = setTimeout(() => { lpFired = true; navigator.vibrate?.(14); onLong(); }, 430); },
  onPointerMove: (e) => { if (Math.hypot(e.clientX - lpX, e.clientY - lpY) > 10) clearTimeout(lpT); },
  onPointerUp: () => clearTimeout(lpT),
  onPointerCancel: () => clearTimeout(lpT),
  onClick: () => { if (lpFired) { lpFired = false; return; } onTap(); },
  onContextMenu: (e) => e.preventDefault(),
});

export function Library() {
  const S = useStore();
  const st = S.settings;
  const [q, setQ] = useState('');
  const [search, setSearch] = useState(false);
  const sel = S.select;
  const root = useRef();
  useLayoutEffect(() => { if (root.current) root.current.scrollTop = libScroll; }, []);

  const { cols } = getGroups();

  const items = useMemo(() => {
    const now = Date.now();
    let list;
    if (st.groupBy === 'collections') {
      list = [...cols.values()].map((col) => {
        const s = summarize(col);
        return { kind: 'col', key: col.key, name: col.name, col, s, status: s.status, last: s.lastRead, added: s.added, prog: s.progress, fav: s.fav };
      });
    } else {
      list = Object.values(S.comics).filter((c) => !c.missing).map((c) => ({
        kind: 'comic', key: c.id, name: c.name.replace(/\.[^.]+$/, ''), c, status: comicStatus(c), last: c.lastRead, added: c.addedAt, prog: comicProgress(c), fav: c.fav,
      }));
    }
    const tab = st.tab;
    list = list.filter((it) => {
      if (tab === 'recent') return it.last > 0;
      if (tab === 'unread') return it.status === 'unread';
      if (tab === 'ongoing') return it.status === 'ongoing';
      if (tab === 'completed') return it.status === 'completed';
      if (tab === 'new') return now - it.added < 14 * DAY;
      if (tab === 'fav') return it.fav;
      return true;
    });
    if (q.trim()) {
      const w = q.toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter((it) => {
        const hay = (it.name + ' ' + (it.col ? it.col.ids.map((id) => S.comics[id]?.name).join(' ') : '')).toLowerCase();
        return w.every((x) => hay.includes(x));
      });
    }
    const sort = tab === 'recent' ? 'recent' : tab === 'new' ? 'added' : st.sort;
    const cmp = {
      recent: (a, b) => b.last - a.last || natCompare(a.name, b.name),
      added: (a, b) => b.added - a.added || natCompare(a.name, b.name),
      az: (a, b) => natCompare(a.name, b.name),
      za: (a, b) => natCompare(b.name, a.name),
      progress: (a, b) => b.prog - a.prog || natCompare(a.name, b.name),
    }[sort];
    return list.sort(cmp);
  }, [S.rev, S.structRev, st.groupBy, st.tab, st.sort, q]);

  const total = Object.values(S.comics).filter((c) => !c.missing).length;
  const stale = S.folders.some((f) => f.stale);

  const openItem = (it) => {
    if (sel) { if (it.kind === 'comic') toggleSelect(it.key); return; }
    if (it.kind === 'comic') startReading(it.key);
    else if (it.col.ids.length === 1) startReading(it.col.ids[0]);
    else push({ name: 'collection', key: it.key });
  };
  const longItem = (it) => {
    if (it.kind === 'comic') startSelect(it.key);
    else openSheet({ type: 'colmenu', key: it.key });
  };

  return (
    <div class="screen lib" ref={root} onScroll={(e) => (libScroll = e.currentTarget.scrollTop)}>
      <header class="lib-head">
        <div class="brand"><Logo /><h1>InkDrop</h1></div>
        <div class="head-actions">
          <button class="icon-btn rip" onClick={() => { setSearch(!search); setQ(''); }} aria-label="Search"><Icon n="search" /></button>
          <button class="icon-btn rip" onClick={() => setSetting('view', st.view === 'grid' ? 'list' : 'grid')} aria-label="Toggle layout"><Icon n={st.view === 'grid' ? 'list' : 'grid'} /></button>
          <button class="icon-btn rip" onClick={() => openSheet({ type: 'settings' })} aria-label="Settings" data-testid="open-settings"><Icon n="gear" /></button>
        </div>
      </header>

      {search && (
        <div class="searchbar glass-lite">
          <Icon n="search" size={18} />
          <input autoFocus placeholder="Search comics & collections" value={q} onInput={(e) => setQ(e.target.value)} />
        </div>
      )}

      {(S.scan.busy || S.covers.total > 0) && (
        <div class="status-pill glass-lite">
          <Liquid value={S.scan.busy ? 0.3 : S.covers.done / S.covers.total} class="thin" />
          <span>{S.scan.busy ? S.scan.msg : `Preparing covers ${S.covers.done}/${S.covers.total}`}</span>
        </div>
      )}

      {total > 0 && (
        <>
          <div class="chips" role="tablist">
            {TABS.map(([v, l]) => (
              <button key={v} role="tab" aria-selected={st.tab === v} class={'chip rip' + (st.tab === v ? ' on' : '')} onClick={() => setSetting('tab', v)} data-testid={'tab-' + v}>{l}</button>
            ))}
          </div>
          <div class="toolbar">
            <div class="seg glass-lite small">
              <button class={'seg-b rip' + (st.groupBy === 'collections' ? ' on' : '')} onClick={() => setSetting('groupBy', 'collections')} data-testid="by-collections"><Icon n="layers" size={16} /> Collections</button>
              <button class={'seg-b rip' + (st.groupBy === 'comics' ? ' on' : '')} onClick={() => setSetting('groupBy', 'comics')} data-testid="by-comics"><Icon n="book" size={16} /> Comics</button>
            </div>
            <button class="sort-btn glass-lite rip" onClick={() => openSheet({ type: 'sort' })}>
              {SORTS.find((s) => s[0] === st.sort)[1]} <Icon n="scroll" size={15} />
            </button>
          </div>
          <div class="count-line">{items.length} {st.groupBy === 'collections' ? 'collection' : 'comic'}{items.length === 1 ? '' : 's'} · {total} files</div>
        </>
      )}

      {stale && (
        <div class="notice glass-lite">
          <span>Browser preview forgot your files after reload. Re-select the folder.</span>
          <button class="btn small rip" onClick={addFolder}>Choose</button>
        </div>
      )}

      {!S.folders.length && S.ready && <Hero />}
      {S.folders.length > 0 && total === 0 && !S.scan.busy && !stale && (
        <div class="empty"><p>No comics found in your folder.</p><button class="btn rip" onClick={() => rescan()}>Scan again</button></div>
      )}
      {total > 0 && items.length === 0 && <div class="empty"><p>{st.tab === 'new' ? 'Nothing added in the last 14 days.' : 'Nothing here yet.'}</p></div>}

      <div class={st.view === 'grid' ? 'grid' : 'list'} data-testid="items">
        {items.map((it) => (
          <Card key={it.key} it={it} view={st.view} selected={sel?.has(it.key)} selecting={!!sel} {...press(() => longItem(it), () => openItem(it))} />
        ))}
      </div>

      {sel && <SelectBar />}
      {!sel && <NowReading />}
      <div class="bottom-pad" />
    </div>
  );
}

function Hero() {
  return (
    <div class="hero">
      <div class="hero-drop"><span class="ring r1" /><span class="ring r2" /><span class="ring r3" /><Logo size={84} /></div>
      <h2>Your comics, offline.</h2>
      <p>Pick the folder where your CBZ, CBR, ZIP and PDF comics live. InkDrop sorts them into collections automatically. Nothing leaves your phone.</p>
      <button class="btn primary big rip" onClick={addFolder} data-testid="choose-folder"><Icon n="folder" size={20} /> Choose comics folder</button>
    </div>
  );
}

export function Card({ it, view, selected, selecting, ...handlers }) {
  const S = useStore();
  const isCol = it.kind === 'col';
  const coverComic = isCol ? S.comics[it.s.first?.id] : it.c;
  const count = isCol ? it.s.total : 0;
  const isNew = Date.now() - it.added < 7 * DAY && it.status === 'unread';
  const sub = isCol
    ? count > 1 ? `${it.s.done}/${count} read` : it.status === 'completed' ? 'Read' : it.status === 'ongoing' ? 'Reading' : 'Unread'
    : it.status === 'completed' ? 'Read' : it.status === 'ongoing' ? `Page ${it.c.page + 1}${it.c.pages ? ' / ' + it.c.pages : ''}` : fmtSize(it.c.size);
  return (
    <div class={'card rip' + (selected ? ' selected' : '') + (view === 'list' ? ' row' : '')} data-testid={isCol ? 'col-card' : 'comic-card'} data-name={it.name} {...handlers}>
      <div class="card-cover">
        {isCol && count > 1 && <><i class="stack s2" /><i class="stack s1" /></>}
        <Cover id={coverComic?.id || it.key} title={it.name} cover={coverComic?.cover} />
        {count > 1 && <span class="badge">{count}</span>}
        {isNew && <span class="tag-new">NEW</span>}
        {it.fav && <span class="fav"><Icon n="star" size={14} fill /></span>}
        {selecting && <span class={'check' + (selected ? ' on' : '')}><Icon n="check" size={16} sw={3} /></span>}
        {it.status !== 'unread' && <Liquid value={it.prog} class="on-cover" />}
      </div>
      <div class="card-meta">
        <b title={it.name}>{it.name}</b>
        <small>{sub}{it.last ? ` · ${timeAgo(it.last)}` : ''}</small>
      </div>
    </div>
  );
}

function SelectBar() {
  const S = useStore();
  const ids = [...S.select];
  return (
    <div class="selectbar glass" data-testid="selectbar">
      <button class="icon-btn rip" onClick={clearSelect} aria-label="Cancel"><Icon n="close" /></button>
      <b>{ids.length} selected</b>
      <span class="grow" />
      <button class="sb rip" onClick={() => openSheet({ type: 'move', ids })} data-testid="sel-move"><Icon n="move" /><small>Collection</small></button>
      <button class="sb rip" onClick={() => toggleFav(ids)}><Icon n="star" /><small>Favourite</small></button>
      <button class="sb rip" onClick={() => markRead(ids, true)}><Icon n="check" /><small>Read</small></button>
      <button class="sb rip" onClick={() => markRead(ids, false)}><Icon n="refresh" /><small>Unread</small></button>
    </div>
  );
}

/* mini "now playing" pill: last unfinished comic */
export function NowReading() {
  const S = useStore();
  const c = useMemo(() => Object.values(S.comics).filter((x) => !x.missing && x.lastRead && !x.finished).sort((a, b) => b.lastRead - a.lastRead)[0], [S.rev]);
  if (!c) return null;
  const g = getGroups();
  const col = g.cols.get(g.idToCol.get(c.id));
  return (
    <button class="nowreading glass rip" onClick={() => startReading(c.id)} data-testid="now-reading">
      <Cover id={c.id} title={c.name} cover={c.cover} class="mini" />
      <span class="nr-text">
        <small>Continue reading</small>
        <b>{col?.name || c.name}</b>
        <Liquid value={comicProgress(c)} class="thin" />
      </span>
      <span class="nr-play"><Icon n="play" fill size={22} /></span>
    </button>
  );
}

/* ---------------- collection detail ---------------- */
export function CollectionView({ ckey }) {
  const S = useStore();
  const g = getGroups();
  const col = g.cols.get(ckey);
  const sel = S.select;
  if (!col) return <div class="screen"><p class="empty">Collection not found.</p></div>;
  const s = summarize(col);
  const comics = col.ids.map((id) => S.comics[id]).filter(Boolean);

  return (
    <div class="screen col-view">
      <header class="col-head">
        <button class="icon-btn rip" onClick={pop} aria-label="Back" data-testid="col-back"><Icon n="back" /></button>
        <span class="grow" />
        <button class="icon-btn rip" onClick={() => openSheet({ type: 'add', key: ckey })} aria-label="Add comics" data-testid="col-add"><Icon n="plus" /></button>
        <button class="icon-btn rip" onClick={() => openSheet({ type: 'colmenu', key: ckey })} aria-label="More"><Icon n="more" /></button>
      </header>

      <div class="col-hero glass">
        <div class="col-cover"><Cover id={s.first?.id} title={col.name} cover={s.first?.cover} /></div>
        <div class="col-info">
          <h2 data-testid="col-title" onClick={() => openSheet({ type: 'rename', key: ckey })}>{col.name} <Icon n="edit" size={15} /></h2>
          <p>{s.total} issues · {s.done} read{s.lastRead ? ` · ${timeAgo(s.lastRead)}` : ''}</p>
          <Liquid value={s.progress} />
          <button class="btn primary rip" onClick={() => startReading(s.resume.id)} data-testid="col-continue">
            <Icon n="play" fill size={18} /> {s.status === 'unread' ? 'Start reading' : s.status === 'completed' ? 'Read again' : 'Continue'}
          </button>
        </div>
      </div>

      <div class="list issues" data-testid="issues">
        {comics.map((c) => {
          const lbl = g.info.get(c.id)?.label;
          const st = comicStatus(c);
          const selected = sel?.has(c.id);
          return (
            <div key={c.id} class={'issue rip' + (selected ? ' selected' : '')} data-testid="issue" data-name={c.name}
              {...press(() => startSelect(c.id), () => (sel ? toggleSelect(c.id) : startReading(c.id)))}>
              <div class="issue-cover"><Cover id={c.id} title={c.name} cover={c.cover} />{sel && <span class={'check' + (selected ? ' on' : '')}><Icon n="check" size={14} sw={3} /></span>}</div>
              <div class="issue-meta">
                <b>{lbl || c.name.replace(/\.[^.]+$/, '')}</b>
                <small title={c.name}>{c.name}</small>
                <small>{c.pages ? `${c.pages} pages · ` : ''}{fmtSize(c.size)} · {c.ext.toUpperCase()}</small>
                {st !== 'unread' && <Liquid value={comicProgress(c)} class="thin" />}
              </div>
              <span class={'state ' + st}>{st === 'completed' ? <Icon n="check" size={16} sw={3} /> : st === 'ongoing' ? 'Reading' : 'New'}</span>
              <button class="icon-btn rip" onClick={(e) => { e.stopPropagation(); openSheet({ type: 'comicmenu', id: c.id }); }} aria-label="Comic options"><Icon n="more" /></button>
            </div>
          );
        })}
      </div>
      {sel && <SelectBar />}
      {!sel && <NowReading />}
      <div class="bottom-pad" />
    </div>
  );
}
