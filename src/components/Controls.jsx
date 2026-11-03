// Reading + display controls shared by the reader sheet and Settings.
import { Seg, Toggle, Slider } from './ui.jsx';
import { setSetting, setModeFor } from '../lib/store.js';

export function ReadingControls({ st, comicId, mode }) {
  return (
    <>
      <Seg
        label="Reading mode"
        value={mode}
        onChange={(v) => (comicId ? setModeFor(comicId, v) : setSetting('mode', v))}
        options={[['ltr', 'Comic', 'left → right'], ['rtl', 'Manga', 'right → left'], ['webtoon', 'Manhwa', 'vertical scroll']]}
      />
      {mode !== 'webtoon' && (
        <Seg
          label="Page turn animation"
          value={st.anim}
          onChange={(v) => setSetting('anim', v)}
          options={[['curl', 'Page flip', '3D paper'], ['slide', 'Slide'], ['none', 'Instant']]}
        />
      )}
      <Toggle on={st.tapZones} onChange={(v) => setSetting('tapZones', v)} label="Tap to turn" sub={mode === 'webtoon' ? 'Tap top / bottom to scroll' : 'Tap left / right edge of the screen'} />
      {st.tapZones && <Toggle on={st.tapInvert} onChange={(v) => setSetting('tapInvert', v)} label="Invert tap zones" />}
    </>
  );
}

export function DisplayControls({ st }) {
  return (
    <>
      <Seg
        label="Colour mode"
        value={st.filter}
        onChange={(v) => setSetting('filter', v)}
        options={[['none', 'Normal'], ['bw', 'B&W'], ['auto', 'Auto B&W'], ['sepia', 'Sepia'], ['night', 'Night']]}
      />
      <p class="hint">Auto B&W sharpens colourless pages (manga, scans) and leaves colour pages untouched.</p>
      <Toggle on={st.paper} onChange={(v) => setSetting('paper', v)} label="Bamboo paper texture" sub="Warm fibre texture over every page" />
      {st.paper && <Slider label="Texture" value={st.paperAmt} min={10} max={100} onChange={(v) => setSetting('paperAmt', v)} unit="%" />}
      <Toggle on={st.eye} onChange={(v) => setSetting('eye', v)} label="Eye protection" sub="Warm, low blue-light tint" />
      <Slider label="Warmth" value={st.eyeAmt} min={10} max={100} onChange={(v) => setSetting('eyeAmt', v)} unit="%" />
      <Toggle on={st.autoEye} onChange={(v) => setSetting('autoEye', v)} label="Auto eye protection at night" sub="Turns on from 7 pm to 6 am" />
      <Slider label="Brightness" value={st.brightness} min={35} max={120} onChange={(v) => setSetting('brightness', v)} unit="%" />
    </>
  );
}
