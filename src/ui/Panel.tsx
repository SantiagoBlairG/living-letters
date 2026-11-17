import { MATERIALS, MAX_CHARS, PALETTES, SUGGESTIONS } from '../engine/config';
import type { MaterialId, Settings } from '../engine/types';
import { cleanWord } from '../App';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  settings: Settings;
  onChange(p: Partial<Settings>): void;
  onToggle(): void;
  onReset(): void;
  onSurprise(): void;
}

/** Small drawings of each material's cursor, so the picker previews the tool. */
function Glyph({ id }: { id: MaterialId }) {
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      {id === 'jelly' && (<><ellipse cx="16" cy="17" rx="11" ry="9" /><circle cx="14" cy="16" r="2.8" fill="currentColor" stroke="none" /></>)}
      {id === 'magnet' && (<><path d="M6 13a11 11 0 0 1 14-7.5M26 19a11 11 0 0 1-14 7.5" /><circle cx="16" cy="16" r="3.4" fill="currentColor" stroke="none" /></>)}
      {id === 'bloom' && (<g stroke="none" fill="currentColor"><path d="M16 9c4 3 4 10 0 14c-4-4-4-11 0-14Z" /><path d="M14 22C9 22 6 19 5 15c5 0 8 3 9 7ZM18 22c5 0 8-3 9-7c-5 0-8 3-9 7Z" opacity=".55" /></g>)}
      {id === 'balloon' && (<><ellipse cx="16" cy="12" rx="7.5" ry="8.5" fill="currentColor" stroke="none" /><path d="M16 21c-2 2 2 3 0 5s1 2 0 4" /></>)}
      {id === 'wave' && (<><path d="M3 13c3.2-3 6.3-3 9.5 0s6.3 3 9.5 0 4.8-2.5 7-1" /><path d="M3 21c3.2-3 6.3-3 9.5 0s6.3 3 9.5 0 4.8-2.5 7-1" opacity=".55" /></>)}
      {id === 'explode' && (<><path d="M16 3v6M16 23v6M3 16h6M23 16h6M7 7l4 4M25 25l-4-4M25 7l-4 4M7 25l4-4" /><circle cx="16" cy="16" r="2.6" fill="currentColor" stroke="none" /></>)}
      {id === 'gravity' && (<><path d="M16 5v13M10.5 13l5.5 5.5 5.5-5.5" strokeLinejoin="round" /><path d="M6 26h20" /></>)}
      {id === 'float' && (<><circle cx="21" cy="11" r="3.4" fill="currentColor" stroke="none" /><path d="M17 15C12 19 8 21 4 26M19 18c-3 3-5 5-7 8" opacity=".7" /></>)}
    </svg>
  );
}

export function Panel({ open, settings, onChange, onToggle, onReset, onSurprise }: Props) {
  const count = Array.from(settings.word).length;
  const current = MATERIALS.find((m) => m.id === settings.material)!;
  return (
    <aside id="panel" className="panel glass" data-open={open} aria-label="Controls">
      <button type="button" className="handle" onClick={onToggle} aria-expanded={open}>
        <span className="grip" aria-hidden="true" />
        <span>{open ? 'Close controls' : 'Controls'}</span>
        <span className="handle-now">{current.label}</span>
      </button>

      <div className="panel-body" inert={!open}>
        <div className="row head only-wide">
          <span>Controls</span>
          <button type="button" className="text-btn" onClick={onToggle}>Hide <kbd>Esc</kbd></button>
        </div>

        <section>
          <div className="row">
            <label htmlFor="word">Word</label>
            <span className="dim num" aria-hidden="true">{count} / {MAX_CHARS}</span>
          </div>
          <input
            id="word" className="word-input" value={settings.word} placeholder="Type a word"
            maxLength={MAX_CHARS * 2} autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="done"
            onChange={(e) => onChange({ word: cleanWord(e.target.value) })}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }}
          />
          <div className="suggest" role="group" aria-label="Suggestions">
            {SUGGESTIONS.map((w) => (
              <button key={w} type="button" aria-pressed={settings.word === w} onClick={() => onChange({ word: w })}>{w}</button>
            ))}
          </div>
        </section>

        <section>
          <div className="row"><span id="mat-label">Material</span><span className="dim only-wide"><kbd>←</kbd><kbd>→</kbd></span></div>
          <div className="materials" role="radiogroup" aria-labelledby="mat-label">
            {MATERIALS.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={settings.material === m.id} title={m.note} onClick={() => onChange({ material: m.id })}>
                <Glyph id={m.id} />
                <span className="m-name">{m.label}</span>
              </button>
            ))}
          </div>
          <p className="m-desc" aria-live="polite"><strong>{current.label}</strong>{current.note}</p>
        </section>

        <section className="sliders">
          <Slider id="intensity" label="Intensity" hint="How strongly the letters react to you" value={settings.intensity} onChange={(v) => onChange({ intensity: v })} />
          <Slider id="motion" label="Motion" hint="How much they move on their own" value={settings.motion} onChange={(v) => onChange({ motion: v })} />
        </section>

        <section>
          <div className="row"><span id="col-label">Color</span><span className="dim">{PALETTES.find((p) => p.id === settings.palette)?.name}</span></div>
          <div className="palettes" role="radiogroup" aria-labelledby="col-label">
            {PALETTES.map((p) => (
              <button
                key={p.id} type="button" role="radio" aria-checked={settings.palette === p.id} aria-label={p.name} title={p.name}
                style={{ background: p.bg, color: p.ink }} onClick={() => onChange({ palette: p.id })}
              >
                <span className="p-a" aria-hidden="true">a</span>
                <i style={{ background: p.stem }} /><i style={{ background: p.flower }} /><i style={{ background: p.spark }} />
              </button>
            ))}
          </div>
        </section>

        <section className="actions">
          <button type="button" className="btn" onClick={onReset}>Reset <kbd className="only-wide">Enter</kbd></button>
          <button type="button" className="btn primary" onClick={onSurprise}><Icon name="sparkle" />Surprise me</button>
        </section>
      </div>
    </aside>
  );
}

function Slider({ id, label, hint, value, onChange }: { id: string; label: string; hint: string; value: number; onChange(v: number): void }) {
  const pct = Math.round(value * 100);
  return (
    <div className="slider">
      <div className="row">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="dim num">{pct}</output>
      </div>
      <input
        id={id} type="range" min={0} max={100} step={1} value={pct} aria-describedby={`${id}-hint`}
        style={{ ['--v' as string]: `${pct}%` }} onChange={(e) => onChange(Number(e.target.value) / 100)}
      />
      <p id={`${id}-hint`} className="dim small">{hint}</p>
    </div>
  );
}
