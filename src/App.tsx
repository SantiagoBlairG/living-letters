import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { MATERIALS, MAX_CHARS, PALETTES, PRESETS } from './engine/config';
import { Stage } from './engine/stage';
import { fileName, savePng } from './engine/exporter';
import type { MaterialId, Settings } from './engine/types';
import { Panel } from './ui/Panel';
import { QuickEditor } from './ui/QuickEditor';

const INITIAL: Settings = { word: 'hello', material: 'jelly', intensity: 0.5, motion: 0.5, palette: 'night' };

export const cleanWord = (v: string) =>
  Array.from(v.normalize('NFC').replace(/[\r\n\t]/g, ' ')).slice(0, MAX_CHARS).join('');

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

type ExportState = 'idle' | 'working' | 'saved' | 'failed';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const [settings, setSettings] = useState<Settings>(INITIAL);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 1099px)').matches);
  const [coarse, setCoarse] = useState(() => window.matchMedia('(pointer: coarse)').matches);
  const [panelOpen, setPanelOpen] = useState(() => !window.matchMedia('(max-width: 1099px)').matches);
  const [sound, setSound] = useState(false);
  const [hint, setHint] = useState(true);
  const [editor, setEditor] = useState<{ x: number; y: number } | null>(null);
  const [exporting, setExporting] = useState<ExportState>('idle');
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;

  const patch = useCallback((p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p })), []);

  // One engine for the life of the page; React only hands it settings.
  useEffect(() => {
    const stage = new Stage(canvasRef.current!, INITIAL, {
      onInteract: () => setHint(false),
      onEmptyDoubleTap: (x, y) => { if (!panelOpenRef.current) setEditor({ x, y }); },
    });
    stageRef.current = stage;
    return () => { stage.destroy(); stageRef.current = null; };
  }, []);

  useEffect(() => { stageRef.current?.update(settings); }, [settings]);

  useEffect(() => {
    const mqN = window.matchMedia('(max-width: 1099px)');
    const mqC = window.matchMedia('(pointer: coarse)');
    const onN = () => setNarrow(mqN.matches);
    const onC = () => setCoarse(mqC.matches);
    mqN.addEventListener('change', onN); mqC.addEventListener('change', onC);
    return () => { mqN.removeEventListener('change', onN); mqC.removeEventListener('change', onC); };
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

  // Playground shortcuts. They stand down whenever a text field has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'h') { setPanelOpen((o) => !o); e.preventDefault(); }
      else if (k === 'r') reset();
      else if (k >= '1' && k <= '4') patch({ material: MATERIALS[Number(k) - 1].id as MaterialId });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [patch, reset]);

  const palette = PALETTES.find((p) => p.id === settings.palette) ?? PALETTES[0];
  const material = MATERIALS.find((m) => m.id === settings.material)!;
  const vars = useMemo(() => ({ '--ink': palette.ink, '--bg': palette.bg }) as CSSProperties, [palette]);
  useEffect(() => {
    document.body.style.background = palette.bg;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.bg);
  }, [palette.bg]);

  const word = settings.word.trim();
  const exportLabel = { idle: 'Export PNG', working: 'Rendering…', saved: 'Saved', failed: 'Export failed' }[exporting];

  return (
    <div className="app" style={vars} data-panel={panelOpen ? 'open' : 'closed'}>
      <canvas
        ref={canvasRef}
        className="stage"
        tabIndex={0}
        role="img"
        aria-label={word ? `The word “${word}”, set in large letters that behave like ${material.label.toLowerCase()}.` : 'An empty stage. Type a word to begin.'}
      />

      <header className="corner tl">
        <h1>Living Letters</h1>
        <p>A playground for words.</p>
      </header>

      <div className="corner tr">
        <button type="button" className="chip" aria-pressed={sound} onClick={toggleSound}>
          Sound {sound ? 'on' : 'off'}
        </button>
        <button
          type="button" className="chip only-wide" aria-expanded={panelOpen} aria-controls="panel"
          onClick={() => setPanelOpen((o) => !o)}
        >
          {panelOpen ? 'Hide panel' : 'Show panel'}
        </button>
      </div>

      {!word && <p className="empty">Type a word to bring it to life.</p>}
      <p className="hint" data-show={hint && !!word} aria-hidden={!hint}>
        {coarse ? 'Drag to touch. Tap to surprise.' : 'Move to touch. Click to surprise.'}
      </p>

      <p className="corner bl help" aria-live="polite">
        {coarse ? material.touchHelp : material.help}
        {!panelOpen && <span className="help-more">{coarse ? 'Double-tap empty space to retype' : 'Double-click empty space to retype'}</span>}
      </p>

      <div className="corner br">
        <button type="button" className="chip" onClick={reset}>Reset</button>
        <button type="button" className="chip solid" onClick={exportPng} disabled={!word || exporting === 'working'}>
          {exportLabel}
        </button>
      </div>

      <Panel
        open={panelOpen} narrow={narrow} settings={settings}
        onChange={patch} onToggle={() => setPanelOpen((o) => !o)}
        onReset={reset} onSurprise={surprise}
      />

      {editor && (
        <QuickEditor x={editor.x} y={editor.y} word={settings.word} onChange={(w) => patch({ word: w })} onClose={closeEditor} />
      )}
    </div>
  );
}
