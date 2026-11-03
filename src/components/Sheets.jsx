import { useMemo, useState } from 'preact/hooks';
import { Icon } from './Icons.jsx';
import { Sheet, Toggle, Seg } from './ui.jsx';
import { ReadingControls, DisplayControls } from './Controls.jsx';
import {
  useStore, closeSheet, getGroups, assignToCollection, removeFromCollection, resetGrouping, renameCollection, deleteCollection,
  markRead, toggleFav, openSheet, setSetting, addFolder, removeFolder, rescan, resetCovers, clearLibrary, toast, summarize,
} from '../lib/store.js';
import { natCompare, fmtSize } from '../lib/util.js';
import { isNative } from '../lib/fs.js';

export function Sheets() {
  const S = useStore();
  const sh = S.sheet;
  if (!sh) return null;
  const close = closeSheet;
  switch (sh.type) {
    case 'sort': return <SortSheet st={S.settings} close={close} />;
    case 'settings': return <SettingsSheet S={S} close={close} />;
    case 'move': return <MoveSheet ids={sh.ids} close={close} />;
    case 'add': return <AddSheet ckey={sh.key} close={close} />;
    case 'rename': return <RenameSheet ckey={sh.key} close={close} />;
    case 'colmenu': return <ColMenu ckey={sh.key} close={close} />;
    case 'comicmenu': return <ComicMenu id={sh.id} close={close} />;
    default: return null;
  }
}

function Row({ icon, label, sub, onClick, danger, testid }) {
  return (
    <button class={'menu-row rip' + (danger ? ' danger' : '')} onClick={onClick} data-testid={testid}>
      <Icon n={icon} size={20} />
      <span><b>{label}</b>{sub && <small>{sub}</small>}</span>
    </button>
  );
}

function SortSheet({ st, close }) {
  const opts = [['recent', 'Recently read'], ['added', 'Newly added'], ['az', 'Name A → Z'], ['za', 'Name Z → A'], ['progress', 'Progress']];
  return (
    <Sheet title="Sort by" onClose={close}>
      {opts.map(([v, l]) => (
        <button key={v} class={'menu-row rip' + (st.sort === v ? ' on' : '')} onClick={() => { setSetting('sort', v); close(); }}>
          <Icon n={st.sort === v ? 'check' : 'scroll'} size={20} /><span><b>{l}</b></span>
        </button>
      ))}
    </Sheet>
  );
}

/* ---- manual collection assignment ---- */
function MoveSheet({ ids, close }) {
  const S = useStore();
  const [name, setName] = useState('');
  const [filter, setFilter] = useState('');
  const g = getGroups();
  const cols = useMemo(() => [...g.cols.values()].filter((c) => !ids.every((id) => g.idToCol.get(id) === c.key)).sort((a, b) => natCompare(a.name, b.name)), [S.structRev, ids]);
  const shown = cols.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()));
  const apply = (n) => { assignToCollection(ids, n); close(); toast(`Moved to “${n}”`); };
  return (
    <Sheet title={`Move ${ids.length} comic${ids.length > 1 ? 's' : ''} to…`} onClose={close} tall>
      <div class="new-col glass-lite">
        <input placeholder="New collection name" value={name} onInput={(e) => setName(e.target.value)} data-testid="new-col-name" />
        <button class="btn primary small rip" disabled={!name.trim()} onClick={() => apply(name)} data-testid="new-col-create">Create</button>
      </div>
      <div class="searchbar glass-lite"><Icon n="search" size={18} /><input placeholder="Find collection" value={filter} onInput={(e) => setFilter(e.target.value)} /></div>
      <div class="pick-list">
        {shown.map((c) => (
          <button key={c.key} class="menu-row rip" onClick={() => apply(c.name)} data-testid="pick-col" data-name={c.name}>
            <Icon n="collection" size={20} /><span><b>{c.name}</b><small>{c.ids.length} comic{c.ids.length > 1 ? 's' : ''}</small></span>
          </button>
        ))}
        {!shown.length && <p class="hint">No matching collections. Type a name above to create one.</p>}
      </div>
      <div class="sep" />
      <Row icon="close" label="Make standalone" sub="Take out of its collection" onClick={() => { removeFromCollection(ids); close(); }} />
      <Row icon="refresh" label="Reset to automatic" sub="Let file names decide again" onClick={() => { resetGrouping(ids); close(); }} />
    </Sheet>
  );
}

function AddSheet({ ckey, close }) {
  const S = useStore();
  const g = getGroups();
  const col = g.cols.get(ckey);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(new Set());
  const list = useMemo(
    () => Object.values(S.comics).filter((c) => !c.missing && g.idToCol.get(c.id) !== ckey).sort((a, b) => natCompare(a.name, b.name)),
    [S.structRev]
  );
  const shown = list.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id) => setPick((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <Sheet title={`Add to “${col?.name}”`} onClose={close} tall>
      <div class="searchbar glass-lite"><Icon n="search" size={18} /><input placeholder="Search comics" value={q} onInput={(e) => setQ(e.target.value)} /></div>
      <div class="pick-list">
        {shown.map((c) => (
          <button key={c.id} class={'menu-row rip' + (pick.has(c.id) ? ' on' : '')} onClick={() => toggle(c.id)} data-testid="add-item" data-name={c.name}>
            <span class={'cbox' + (pick.has(c.id) ? ' on' : '')}>{pick.has(c.id) && <Icon n="check" size={14} sw={3} />}</span>
            <span><b>{c.name.replace(/\.[^.]+$/, '')}</b><small>{fmtSize(c.size)}</small></span>
          </button>
        ))}
      </div>
      <button class="btn primary big rip stick" disabled={!pick.size} data-testid="add-confirm"
        onClick={() => { assignToCollection([...pick], col.name); close(); toast(`Added ${pick.size} to “${col.name}”`); }}>
        Add {pick.size || ''} comic{pick.size === 1 ? '' : 's'}
      </button>
    </Sheet>
  );
}

function RenameSheet({ ckey, close }) {
  const col = getGroups().cols.get(ckey);
  const [v, setV] = useState(col?.name || '');
  return (
    <Sheet title="Rename collection" onClose={close}>
      <div class="new-col glass-lite">
        <input value={v} onInput={(e) => setV(e.target.value)} autoFocus data-testid="rename-input" />
        <button class="btn primary small rip" onClick={() => { renameCollection(ckey, v); close(); }} data-testid="rename-save">Save</button>
      </div>
    </Sheet>
  );
}

function ColMenu({ ckey, close }) {
  const g = getGroups();
  const col = g.cols.get(ckey);
  if (!col) return null;
  return (
    <Sheet title={col.name} onClose={close}>
      <Row icon="edit" label="Rename" onClick={() => { close(); setTimeout(() => openSheet({ type: 'rename', key: ckey }), 260); }} />
      <Row icon="plus" label="Add comics manually" onClick={() => { close(); setTimeout(() => openSheet({ type: 'add', key: ckey }), 260); }} />
      <Row icon="check" label="Mark all as read" onClick={() => { markRead(col.ids, true); close(); }} />
      <Row icon="refresh" label="Mark all as unread" onClick={() => { markRead(col.ids, false); close(); }} />
      <Row icon="layers" label="Ungroup" sub="Reset to automatic grouping" danger onClick={() => { deleteCollection(ckey); close(); }} />
    </Sheet>
  );
}

function ComicMenu({ id, close }) {
  const S = useStore();
  const c = S.comics[id];
  if (!c) return null;
  return (
    <Sheet title={c.name.replace(/\.[^.]+$/, '')} onClose={close}>
      <Row icon="move" label="Move to collection…" testid="menu-move" onClick={() => { close(); setTimeout(() => openSheet({ type: 'move', ids: [id] }), 260); }} />
      <Row icon="star" label={c.fav ? 'Remove from favourites' : 'Add to favourites'} onClick={() => { toggleFav([id]); close(); }} />
      <Row icon="check" label={c.finished ? 'Mark as unread' : 'Mark as read'} onClick={() => { markRead([id], !c.finished); close(); }} />
      <Row icon="close" label="Remove from collection" sub="Make it a standalone comic" onClick={() => { removeFromCollection([id]); close(); }} />
    </Sheet>
  );
}

/* ---- settings ---- */
function SettingsSheet({ S, close }) {
  const st = S.settings;
  const total = Object.values(S.comics).filter((c) => !c.missing).length;
  return (
    <Sheet title="Settings" onClose={close} tall>
      <h4 class="sec">Library</h4>
      {S.folders.map((f) => (
        <div class="folder-row glass-lite" key={f.uri}>
          <Icon n="folder" size={20} /><span><b>{f.name}</b><small>{Object.values(S.comics).filter((c) => c.folder === f.uri && !c.missing).length} comics</small></span>
          <button class="icon-btn rip" onClick={() => removeFolder(f.uri)} aria-label="Remove folder"><Icon n="trash" size={18} /></button>
        </div>
      ))}
      <div class="btn-row">
        <button class="btn primary rip" onClick={() => { close(); addFolder(); }} data-testid="settings-add-folder"><Icon n="plus" size={18} /> {S.folders.length ? 'Add folder' : 'Choose folder'}</button>
        <button class="btn rip" onClick={() => { close(); rescan(); }} disabled={!S.folders.length}><Icon n="refresh" size={18} /> Rescan</button>
      </div>
      <p class="hint">{isNative ? 'InkDrop keeps read-only access to the folders you pick. Nothing is copied.' : 'Browser preview: files are kept in memory for this session only.'}</p>

      <h4 class="sec">Reading defaults</h4>
      <ReadingControls st={st} mode={st.mode} />
      <h4 class="sec">Display</h4>
      <DisplayControls st={st} />
      <Toggle on={st.keepAwake} onChange={(v) => setSetting('keepAwake', v)} label="Keep screen on while reading" />
      <Seg label="Auto page turn speed (play button)" value={st.autoPlaySec} onChange={(v) => setSetting('autoPlaySec', v)} options={[[3, '3 s'], [6, '6 s'], [10, '10 s'], [20, '20 s']]} />
      <h4 class="sec">Interface</h4>
      <Toggle on={st.fx} onChange={(v) => setSetting('fx', v)} label="Water animations" sub="Turn off to save battery" />
      <h4 class="sec">Maintenance</h4>
      <div class="btn-row">
        <button class="btn rip" onClick={() => { resetCovers(); toast('Rebuilding covers…'); }}>Rebuild covers</button>
        <button class="btn danger rip" onClick={() => { if (confirm('Clear library data (reading progress and collections)? Your comic files are not touched.')) { clearLibrary(); close(); } }}>Clear library</button>
      </div>
      <p class="hint">InkDrop has no internet permission and no analytics. {total} comics indexed on this device.</p>
    </Sheet>
  );
}
