import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { DEFAULT_CUSTOM, ELEMENTS, MATERIALS, MAX_CHARS, PRESETS, resolvePalette } from './engine/config';
import { Stage } from './engine/stage';
import { fileName, savePng } from './engine/exporter';
import type { Settings } from './engine/types';
import { Panel } from './ui/Panel';
import { QuickEditor } from './ui/QuickEditor';
import { Icon } from './ui/Icon';

const INITIAL: Settings = {
  word: 'hello', material: 'jelly', intensity: 0.5, motion: 0.5, palette: 'night',
  custom: DEFAULT_CUSTOM, font: 'serif', tune: {}, element: 'fire',
};

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
  const coarseRef = useRef(coarse);
  const wheelAcc = useRef(0);
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

  const exportPng = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage || exporting === 'working') return;
    setExporting('working');
    try {
      const blob = await stage.exportPng();
      const result = await savePng(blob, fileName(settings.word, settings.material));
      setExporting(result === 'saved' ? 'saved' : 'idle');
    } catch {
      setExporting('failed');
    }
    window.setTimeout(() => setExporting('idle'), 1800);
  }, [exporting, settings.word, settings.material]);

  const closeEditor = useCallback(() => { setEditor(null); canvasRef.current?.focus(); }, []);

  /** Keys that never produce text, shared by the page and the stage's own text field. Returns true when handled. */
  const command = useCallback((key: string) => {
    if (key === 'Escape') setPanelOpen((o) => !o);
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
  const exportLabel = { idle: 'Export PNG', working: 'Rendering…', saved: 'Saved', failed: 'Export failed' }[exporting];
  const element = ELEMENTS.find((e) => e.id === settings.element) ?? ELEMENTS[0];
  const help = settings.material === 'elements' ? (coarse ? element.touchHelp : element.help) : coarse ? material.touchHelp : material.help;
  const gestures = [coarse ? 'Double-tap to edit' : 'Type to rewrite', ...help.split(' · ')];

  return (
    <div className="app" style={vars} data-panel={panelOpen ? 'open' : 'closed'}>
      <canvas
        ref={canvasRef}
        className="stage"
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

      <header className="corner tl">
        <h1>Living Letters</h1>
        <p>A playground for words</p>
      </header>

      <div className="corner tr">
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

      {!word && <p className="empty">{coarse ? 'Double-tap to write a word' : 'Type a word to bring it to life'}</p>}
      <p className="hint" data-show={hint && !!word} aria-hidden={!hint}>
        {coarse ? 'Touch the letters to play. Double-tap to change the word.' : 'Just start typing, or play with the letters.'}
      </p>

      <ul className="corner bl dock glass" aria-live="polite" aria-label="How to play">
        {gestures.map((g) => <li key={g}>{g}</li>)}
      </ul>

      <div className="corner br">
        <button type="button" className="chip glass" onClick={reset}>
          <Icon name="reset" />
          Reset
        </button>
        <button type="button" className="chip solid" onClick={exportPng} disabled={!word || exporting === 'working'}>
          <Icon name="download" />
          {exportLabel}
        </button>
      </div>

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
