import { useEffect } from 'preact/hooks';
import { App as CapApp } from '@capacitor/app';
import { Library, CollectionView } from './components/Library.jsx';
import { Reader } from './components/Reader.jsx';
import { Sheets } from './components/Sheets.jsx';
import { installRipple } from './components/ui.jsx';
import { isNative } from './lib/fs.js';
import { useStore, init, pop, get, closeSheet, clearSelect } from './lib/store.js';

export function App() {
  const S = useStore();

  useEffect(() => {
    init();
    installRipple();
    if (!isNative) return;
    const h = CapApp.addListener('backButton', () => {
      const s = get();
      if (s.sheet) closeSheet();
      else if (s.select) clearSelect();
      else if (s.nav.length > 1) pop();
      else CapApp.exitApp();
    });
    return () => { h.then((x) => x.remove()); };
  }, []);

  const top = S.nav[S.nav.length - 1];
  return (
    <div class={'app' + (S.settings.fx ? '' : ' nofx')}>
      <div class="bg" aria-hidden="true"><i class="blob b1" /><i class="blob b2" /><i class="blob b3" /></div>
      {top.name === 'library' && <Library key="lib" />}
      {top.name === 'collection' && <CollectionView key={top.key} ckey={top.key} />}
      {top.name === 'reader' && S.comics[top.id] && <Reader key={top.id} id={top.id} />}
      <Sheets />
      {S.toast && <div class="toast glass" key={S.toast.id} role="status">{S.toast.msg}</div>}
    </div>
  );
}
