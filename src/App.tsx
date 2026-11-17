import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { DEFAULT_CUSTOM, ELEMENTS, MATERIALS, MAX_CHARS, PRESETS, resolvePalette } from './engine/config';
import { Stage } from './engine/stage';
import { FORMATS, Recording, fileName, outSize, saveFile, videoType, type FormatId } from './engine/exporter';
import type { Settings } from './engine/types';
import { Panel } from './ui/Panel';
import { QuickEditor } from './ui/QuickEditor';
import { Icon } from './ui/Icon';
import { ExportMenu } from './ui/ExportMenu';

const MAX_REC = 20; // seconds
const VIDEO = videoType();

/** Where a framed stage sits: the largest box of the format's shape in the space the interface leaves free. */
function frameRect(ratio: number, vw: number, vh: number, panelOpen: boolean) {
  const narrow = vw < 1100;
  const top = 76, bottom = narrow ? 120 : 84, left = 24, right = panelOpen && !narrow ? 356 : 24;
  const aw = Math.max(80, vw - left - right), ah = Math.max(80, vh - top - bottom);
  const w = Math.min(aw, ah * ratio), h = w / ratio;
  return { left: Math.round(left + (aw - w) / 2), top: Math.round(top + (ah - h) / 2), width: Math.round(w), height: Math.round(h) };
}

const INITIAL: Settings = {
  word: 'hello', material: 'jelly', intensity: 0.5, motion: 0.5, palette: 'night',
  custom: DEFAULT_CUSTOM, font: 'serif', tune: {}, element: 'fire',
};

/**
 * The black hole eating the interface: every piece marked data-devour is sent spiralling into the point,
 * nearest first, squeezed like a genie into a bottle. With null, it is all thrown back out.
 */
function devour(app: HTMLDivElement | null, at: { x: number; y: number } | null, timer: { current: number }) {
  if (!app) return;
  window.clearTimeout(timer.current);
  const cv = app.querySelector('canvas.stage')?.getBoundingClientRect();
  if (at && cv) at = { x: at.x + cv.left, y: at.y + cv.top };
  if (!at) {
    if (app.dataset.devour !== 'in') return;
    app.dataset.devour = 'out';
    timer.current = window.setTimeout(() => { delete app.dataset.devour; }, 900);
    return;
  }
  const parts = [...app.querySelectorAll<HTMLElement>('[data-devour]')].map((el) => {
    const r = el.getBoundingClientRect();
    const dx = at.x - (r.left + r.width / 2), dy = at.y - (r.top + r.height / 2);
    return { el, dx, dy, d: Math.hypot(dx, dy) };
  }).sort((a, b) => a.d - b.d);
  parts.forEach(({ el, dx, dy }, i) => {
    el.style.setProperty('--dx', dx + 'px'); el.style.setProperty('--dy', dy + 'px');
    // its long axis turns toward the hole, but never more than a quarter turn, so nothing ends up upside down;
    // --side says which end (right +1, left -1) faces the hole and should recede into it
    let ang = (Math.atan2(dy, dx) * 180) / Math.PI, side = 1;
    if (ang > 90) { ang -= 180; side = -1; } else if (ang < -90) { ang += 180; side = -1; }
    el.style.setProperty('--ang', ang + 'deg');
    el.style.setProperty('--side', String(side));
    // a curved path: halfway there, it has swung out to the side, as if orbiting on the way in
    el.style.setProperty('--ox', -dy * 0.35 + 'px'); el.style.setProperty('--oy', dx * 0.35 + 'px');
    el.style.setProperty('--delay', i * 0.14 + 's'); // one after another, so they never pile up at the centre
  });
  app.dataset.devour = 'in';
}

const nextElement = (id: string, dir: number) => {
  const i = ELEMENTS.findIndex((e) => e.id === id);
  return ELEMENTS[(i + dir + ELEMENTS.length) % ELEMENTS.length].id;
};

export const cleanWord = (v: string) =>
  Array.from(v.normalize('NFC').replace(/[\r\n\t]/g, ' ')).slice(0, MAX_CHARS).join('');

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

type ExportState = 'idle' | 'working' | 'saved' | 'failed';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ghostRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const [settings, setSettings] = useState<Settings>(INITIAL);
  const [coarse, setCoarse] = useState(() => window.matchMedia('(pointer: coarse)').matches);
  const [panelOpen, setPanelOpen] = useState(() => !window.matchMedia('(max-width: 1099px)').matches);
  const [sound, setSound] = useState(false);
  const [hint, setHint] = useState(true);
  const [typing, setTyping] = useState(false);
  const [editor, setEditor] = useState<{ x: number; y: number } | null>(null);
  const [exporting, setExporting] = useState<ExportState>('idle');
  const [format, setFormat] = useState<FormatId>('screen');
  const [transparent, setTransparent] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rec, setRec] = useState<{ t0: number; elapsed: number } | null>(null);
  const recRef = useRef<Recording | null>(null);
  const [view, setView] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const menuOpenRef = useRef(menuOpen);
  menuOpenRef.current = menuOpen;
  const coarseRef = useRef(coarse);
  const wheelAcc = useRef(0);
  const appRef = useRef<HTMLDivElement>(null);
  const devourTimer = useRef(0);
  coarseRef.current = coarse;

  const patch = useCallback((p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p })), []);

  /** Hands the keyboard to the stage: the word is edited in place, with a caret after the last letter. */
  const focusStageText = useCallback(() => {
    const g = ghostRef.current;
    if (!g) return;
    g.focus({ preventScroll: true });
    const n = g.value.length;
    g.setSelectionRange(n, n);
  }, []);

  // One engine for the life of the page; React only hands it settings.
  useEffect(() => {
    const stage = new Stage(canvasRef.current!, INITIAL, {
      onInteract: () => setHint(false),
      // touch has no keyboard until a field is focused, so it gets a small editor; a mouse just gets the caret
      onEmptyDoubleTap: (x, y) => { if (coarseRef.current) setEditor({ x, y }); else focusStageText(); },
      onDevour: (at) => devour(appRef.current, at, devourTimer),
      // the wheel switches element while Elements is the material
      onWheel: (dy) => {
        wheelAcc.current += dy;
        if (Math.abs(wheelAcc.current) < 60) return;
        const dir = wheelAcc.current > 0 ? 1 : -1;
        wheelAcc.current = 0;
        setSettings((s) => (s.material === 'elements' ? { ...s, element: nextElement(s.element, dir) } : s));
      },
    });
    stageRef.current = stage;
    return () => { stage.destroy(); stageRef.current = null; };
  }, [focusStageText]);

  useEffect(() => { stageRef.current?.update(settings); }, [settings]);
  useEffect(() => { stageRef.current?.setCaret(typing); }, [typing]);
  useEffect(() => { stageRef.current?.setFormat(format); }, [format]);
  useEffect(() => {
    const onResize = () => setView({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const mqC = window.matchMedia('(pointer: coarse)');
    const onC = () => setCoarse(mqC.matches);
    mqC.addEventListener('change', onC);
    return () => mqC.removeEventListener('change', onC);
  }, []);

  const reset = useCallback(() => stageRef.current?.reset(), []);

  const surprise = useCallback(() => {
    setSettings((s) => {
      const pool = PRESETS.filter((p) => p.word !== s.word && p.material !== s.material);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      return { ...s, ...pick };
    });
    stageRef.current?.reset();
  }, []);

  const cycleMaterial = useCallback((dir: 1 | -1) => {
    setSettings((s) => {
      const i = MATERIALS.findIndex((m) => m.id === s.material);
      return { ...s, material: MATERIALS[(i + dir + MATERIALS.length) % MATERIALS.length].id };
    });
  }, []);

  const toggleSound = () => {
    // runs inside the click, which is what lets the browser start audio
    stageRef.current?.sound.setEnabled(!sound);
    setSound(!sound);
  };

  const flash = (state: ExportState) => {
    setExporting(state);
    window.setTimeout(() => setExporting('idle'), 1800);
  };

  const saveImage = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage || exporting === 'working') return;
    setMenuOpen(false);
    setExporting('working');
    try {
      const blob = await stage.exportPng(outSize(format, stage.W, stage.H, false), transparent);
      const result = await saveFile(blob, fileName(settings.word, settings.material, 'png', [...(format !== 'screen' ? [format] : []), ...(transparent ? ['transparent'] : [])]));
      flash(result === 'saved' ? 'saved' : 'idle');
    } catch {
      flash('failed');
    }
  }, [exporting, format, transparent, settings.word, settings.material]);

  const stopVideo = useCallback(async () => {
    const r = recRef.current;
    if (!r) return;
    recRef.current = null;
    stageRef.current?.stopRecording();
    setRec(null);
    setExporting('working');
    try {
      const blob = await r.stop();
      const result = await saveFile(blob, fileName(settings.word, settings.material, r.ext, format !== 'screen' ? [format] : []));
      flash(result === 'saved' ? 'saved' : 'idle');
    } catch {
      flash('failed');
    }
  }, [settings.word, settings.material, format]);

  const startVideo = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !VIDEO || recRef.current) return;
    setMenuOpen(false);
    try {
      const canvas = stage.startRecording(outSize(format, stage.W, stage.H, true));
      recRef.current = new Recording(canvas, VIDEO);
      setRec({ t0: performance.now(), elapsed: 0 });
    } catch {
      stage.stopRecording();
      flash('failed');
    }
  }, [format]);

  // the recording clock; it stops by itself at the limit
  useEffect(() => {
    if (!rec) return;
    const id = window.setInterval(() => {
      const elapsed = (performance.now() - rec.t0) / 1000;
      if (elapsed >= MAX_REC) void stopVideo();
      else setRec((r) => (r ? { ...r, elapsed } : r));
    }, 200);
    return () => window.clearInterval(id);
  }, [rec?.t0, stopVideo]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeEditor = useCallback(() => { setEditor(null); canvasRef.current?.focus(); }, []);

  /** Keys that never produce text, shared by the page and the stage's own text field. Returns true when handled. */
  const command = useCallback((key: string) => {
    if (key === 'Escape') { if (menuOpenRef.current) setMenuOpen(false); else setPanelOpen((o) => !o); }
    else if (key === 'ArrowRight') cycleMaterial(1);
    else if (key === 'ArrowLeft') cycleMaterial(-1);
    else if (key === 'Enter') reset();
    else if (key === 'ArrowUp' || key === 'ArrowDown') {
      const dir = key === 'ArrowDown' ? 1 : -1;
      setSettings((s) => (s.material === 'elements' ? { ...s, element: nextElement(s.element, dir) } : s));
    }
    else return false;
    return true;
  }, [cycleMaterial, reset]);

  // Typing anywhere on the page writes on the stage. Other text fields keep their own keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const onButton = e.target instanceof HTMLElement && e.target.tagName === 'BUTTON';
      if (onButton && (e.key === 'Enter' || e.key === ' ')) return; // let the button do its thing
      if (command(e.key)) { e.preventDefault(); return; }
      const text = e.key === 'Backspace' || e.key === 'Dead' || e.key === 'Process' || Array.from(e.key).length === 1;
      // Focusing the field during keydown routes this very keystroke into it, so accents and IME work too.
      if (text) { setHint(false); focusStageText(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [command, focusStageText]);

  const onGhostKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (command(e.key)) e.preventDefault();
  };

  const palette = resolvePalette(settings);
  const material = MATERIALS.find((m) => m.id === settings.material)!;
  const vars = useMemo(() => ({ '--ink': palette.ink, '--bg': palette.bg }) as CSSProperties, [palette]);
  useEffect(() => {
    const bg2 = palette.bg2 ?? palette.bg;
    document.body.style.background = bg2 !== palette.bg ? `linear-gradient(${palette.bg}, ${bg2})` : palette.bg;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.bg);
  }, [palette.bg, palette.bg2]);

  const word = settings.word.trim();
  const exportLabel = { idle: 'Export', working: 'Saving…', saved: 'Saved', failed: 'Export failed' }[exporting];
  const fmt = FORMATS.find((f) => f.id === format)!;
  const frame = fmt.ratio ? frameRect(fmt.ratio, view.w, view.h, panelOpen) : null;
  const stageSize = stageRef.current ? outSize(format, stageRef.current.W, stageRef.current.H, false) : null;
  const sizeLabel = fmt.out ? `${fmt.out[0]} × ${fmt.out[1]}` : stageSize ? `${stageSize.w} × ${stageSize.h}` : '';
  const clock = rec ? `0:${String(Math.floor(rec.elapsed)).padStart(2, '0')}` : '';
  const element = ELEMENTS.find((e) => e.id === settings.element) ?? ELEMENTS[0];
  const help = settings.material === 'elements' ? (coarse ? element.touchHelp : element.help) : coarse ? material.touchHelp : material.help;
  const gestures = [coarse ? 'Double-tap to edit' : 'Type to rewrite', ...help.split(' · ')];

  return (
    <div ref={appRef} className="app" style={vars} data-panel={panelOpen ? 'open' : 'closed'} data-frame={frame ? format : undefined} data-rec={rec ? '' : undefined}>
      <canvas
        ref={canvasRef}
        className="stage"
        style={frame ?? undefined}
        tabIndex={0}
        role="img"
        aria-label={word ? `The word “${word}”, set in large letters that behave like ${material.label.toLowerCase()}.` : 'An empty stage. Type a word to begin.'}
      />

      {/* Invisible field behind the stage's caret: it is what actually receives the keystrokes. */}
      <input
        ref={ghostRef} className="ghost" value={settings.word} aria-label="Word on the stage" tabIndex={-1}
        maxLength={MAX_CHARS * 2} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
        onChange={(e) => patch({ word: cleanWord(e.target.value) })}
        onKeyDown={onGhostKey}
        onFocus={() => setTyping(true)} onBlur={() => setTyping(false)}
      />

      <header className="corner tl" data-devour>
        <h1>Living Letters</h1>
        <p>A playground for words</p>
      </header>

      <div className="corner tr" data-devour>
        <button type="button" className="chip glass" aria-pressed={sound} onClick={toggleSound}>
          <Icon name={sound ? 'sound' : 'mute'} />
          Sound {sound ? 'on' : 'off'}
        </button>
        <button
          type="button" className="chip glass only-wide" aria-expanded={panelOpen} aria-controls="panel"
          onClick={() => setPanelOpen((o) => !o)}
        >
          <Icon name="sliders" />
          {panelOpen ? 'Hide controls' : 'Controls'}
        </button>
      </div>

      {!word && <p className="empty" style={frame ? { left: frame.left, right: 'auto', width: frame.width, top: frame.top + frame.height / 2 } : undefined}>{coarse ? 'Double-tap to write a word' : 'Type a word to bring it to life'}</p>}
      <p
        className="hint" data-show={hint && !!word} aria-hidden={!hint}
        style={frame ? { left: frame.left, right: 'auto', width: frame.width, top: frame.top + frame.height * 0.84 } : undefined}
      >
        {coarse ? 'Touch the letters to play. Double-tap to change the word.' : 'Just start typing, or play with the letters.'}
      </p>

      <ul data-devour className="corner bl dock glass" aria-live="polite" aria-label="How to play">
        {gestures.map((g) => <li key={g}>{g}</li>)}
      </ul>

      <div className="corner br" data-devour>
        <button type="button" className="chip glass" onClick={reset}>
          <Icon name="reset" />
          Reset
        </button>
        {rec ? (
          <button type="button" className="chip rec" onClick={() => void stopVideo()}>
            <Icon name="stop" />
            <span className="num">{clock}</span> Stop
          </button>
        ) : (
          <button
            type="button" className="chip solid" data-export-toggle aria-expanded={menuOpen} aria-haspopup="dialog"
            onClick={() => setMenuOpen((o) => !o)} disabled={!word || exporting === 'working'}
          >
            <Icon name="download" />
            {exportLabel}
          </button>
        )}
      </div>

      {menuOpen && (
        <ExportMenu
          format={format} transparent={transparent} canRecord={!!VIDEO} sizeLabel={sizeLabel}
          onFormat={setFormat} onTransparent={setTransparent}
          onImage={() => void saveImage()} onVideo={startVideo} onClose={() => setMenuOpen(false)}
        />
      )}

      <Panel
        open={panelOpen} settings={settings}
        onChange={patch} onToggle={() => setPanelOpen((o) => !o)}
        onReset={reset} onSurprise={surprise}
      />

      {editor && (
        <QuickEditor x={editor.x} y={editor.y} word={settings.word} onChange={(w) => patch({ word: w })} onClose={closeEditor} />
      )}
    </div>
  );
}
