import { ELEMENTS, FONTS, MATERIALS, MAX_CHARS, PALETTES, TUNES } from '../engine/config';
import type { CustomColors, ElementId, MaterialId, Settings } from '../engine/types';
import { cleanWord } from '../App';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  settings: Settings;
  onChange(p: Partial<Settings>): void;
  onToggle(): void;
  onSurprise(): void;
}

/** Small drawings of each material's cursor, so the picker previews the tool. */
export function Glyph({ id }: { id: MaterialId }) {
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      {id === 'jelly' && (<><ellipse cx="16" cy="17" rx="11" ry="9" /><circle cx="14" cy="16" r="2.8" fill="currentColor" stroke="none" /></>)}
      {id === 'magnet' && (<><path d="M6 13a11 11 0 0 1 14-7.5M26 19a11 11 0 0 1-14 7.5" /><circle cx="16" cy="16" r="3.4" fill="currentColor" stroke="none" /></>)}
      {id === 'bloom' && (<g stroke="none" fill="currentColor"><path d="M16 9c4 3 4 10 0 14c-4-4-4-11 0-14Z" /><path d="M14 22C9 22 6 19 5 15c5 0 8 3 9 7ZM18 22c5 0 8-3 9-7c-5 0-8 3-9 7Z" opacity=".55" /></g>)}
      {id === 'balloon' && (<><ellipse cx="16" cy="12" rx="7.5" ry="8.5" fill="currentColor" stroke="none" /><path d="M16 21c-2 2 2 3 0 5s1 2 0 4" /></>)}
      {id === 'wave' && (<><path d="M3 13c3.2-3 6.3-3 9.5 0s6.3 3 9.5 0 4.8-2.5 7-1" /><path d="M3 21c3.2-3 6.3-3 9.5 0s6.3 3 9.5 0 4.8-2.5 7-1" opacity=".55" /></>)}
      {id === 'sand' && (<g fill="currentColor" stroke="none"><rect x="14.5" y="9" width="3" height="3" /><rect x="10" y="14" width="3" height="3" /><rect x="19" y="14" width="3" height="3" /><rect x="6" y="20" width="3" height="3" /><rect x="14.5" y="19" width="3" height="3" /><rect x="23" y="20" width="3" height="3" /><rect x="3" y="25" width="26" height="2.5" rx="1.2" opacity=".55" /></g>)}
      {id === 'melt' && (<path d="M6 6h20v7c0 2-1.5 2-1.5 4.5s-3.2 2.5-3.2 0V15c0-2-3-2-3 0v8c0 3.2-3.6 3.2-3.6 0v-5.5c0-2-3-2-3 0v.5c0 2.2-3.7 2.2-3.7 0z" fill="currentColor" stroke="none" />)}
      {id === 'explode' && (<><path d="M16 3v6M16 23v6M3 16h6M23 16h6M7 7l4 4M25 25l-4-4M25 7l-4 4M7 25l4-4" /><circle cx="16" cy="16" r="2.6" fill="currentColor" stroke="none" /></>)}
      {id === 'gravity' && (<><path d="M16 5v13M10.5 13l5.5 5.5 5.5-5.5" strokeLinejoin="round" /><path d="M6 26h20" /></>)}
      {id === 'blackhole' && (<><ellipse cx="16" cy="16" rx="13" ry="4.5" transform="rotate(-15 16 16)" /><circle cx="16" cy="16" r="5.5" fill="currentColor" stroke="none" /></>)}
      {id === 'elements' && (<g stroke="none" fill="currentColor"><path d="M10 4c3 3 4 6 1.5 9.5C9.5 11 9 9 10 4Z" /><path d="M22 4c4 4 4 9 0 11-4-2-4-7 0-11Z" opacity=".55" /><path d="M4 27l6-9 4 5 3-3 6 7Z" opacity=".55" /><path d="M21 19c1.5 2.4 3 4.2 3 5.8a3 3 0 0 1-6 0c0-1.6 1.5-3.4 3-5.8Z" /></g>)}
      {id === 'focus' && (<><path d="M5 11V6h5M27 11V6h-5M5 21v5h5M27 21v5h-5" /><circle cx="16" cy="16" r="4.2" /><circle cx="16" cy="16" r="1.4" fill="currentColor" stroke="none" /></>)}
      {id === 'echo' && (<g fill="currentColor" stroke="none"><circle cx="21" cy="16" r="5.5" /><circle cx="13.5" cy="16" r="4.5" opacity=".5" /><circle cx="7.5" cy="16" r="3.5" opacity=".25" /></g>)}
      {id === 'ferro' && (<path d="M5 25c3-1 3.5-6 5-12 1.5 6 2 9.5 6 10 4-.5 4.5-4 6-10 1.5 6 2 11 5 12Z" fill="currentColor" stroke="none" />)}
      {id === 'glitch' && (<g fill="currentColor" stroke="none"><rect x="5" y="7" width="16" height="4" /><rect x="10" y="13" width="17" height="4" opacity=".55" /><rect x="4" y="19" width="13" height="4" /><rect x="19" y="19" width="6" height="4" opacity=".55" /></g>)}
      {id === 'kaleido' && (<><path d="M16 4 26.4 10v12L16 28 5.6 22V10Z" /><path d="M16 4v24M5.6 10l20.8 12M5.6 22l20.8-12" opacity=".55" /></>)}
      {id === 'lava' && (<><path d="M11 4h10l3 22H8Z" strokeLinejoin="round" /><circle cx="15" cy="20" r="3.4" fill="currentColor" stroke="none" /><circle cx="18" cy="11" r="2.2" fill="currentColor" stroke="none" /></>)}
      {id === 'mirage' && (<><path d="M5 9c2.5-2 5-2 7.5 0s5 2 7.5 0 5-2 7.5 0M5 14c2.5-2 5-2 7.5 0s5 2 7.5 0 5-2 7.5 0" /><path d="M4 19h24" /><path d="M5 24c2.5-1.4 5-1.4 7.5 0s5 1.4 7.5 0 5-1.4 7.5 0" opacity=".45" /></>)}
      {id === 'bubble' && (<><circle cx="13" cy="15" r="8.5" /><circle cx="23.5" cy="22.5" r="4.5" /><path d="M8.5 12.5a5 5 0 0 1 3-3.4" /></>)}
      {id === 'float' && (<><circle cx="21" cy="11" r="3.4" fill="currentColor" stroke="none" /><path d="M17 15C12 19 8 21 4 26M19 18c-3 3-5 5-7 8" opacity=".7" /></>)}
    </svg>
  );
}

export function Panel({ open, settings, onChange, onToggle, onSurprise }: Props) {
  const count = Array.from(settings.word).length;
  const current = MATERIALS.find((m) => m.id === settings.material)!;
  const font = FONTS.find((f) => f.id === settings.font) ?? FONTS[0];
  const tune = TUNES[settings.material];
  return (
    <aside id="panel" className="panel glass" data-open={open} aria-label="Controls" data-devour>
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
            style={{ fontFamily: font.family, fontWeight: font.weight }}
            maxLength={MAX_CHARS * 2} autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="done"
            onChange={(e) => onChange({ word: cleanWord(e.target.value) })}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }}
          />
        </section>

        <section>
          <div className="row"><span id="font-label">Typeface</span><span className="dim">{font.label}</span></div>
          <div className="fonts" role="radiogroup" aria-labelledby="font-label">
            {FONTS.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={settings.font === f.id} onClick={() => onChange({ font: f.id })}>
                <span className="f-ag" style={{ fontFamily: f.family, fontWeight: f.weight }} aria-hidden="true">Ag</span>
                <span className="f-name">{f.label}</span>
              </button>
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
          {settings.material === 'elements' && (
            <div className="elements" role="radiogroup" aria-label="Element">
              {ELEMENTS.map((e) => (
                <button key={e.id} type="button" role="radio" aria-checked={settings.element === e.id} onClick={() => onChange({ element: e.id })}>
                  <ElementIcon id={e.id} />
                  <span>{e.label}</span>
                </button>
              ))}
              <span className="dim small only-wide">Switch with the mouse wheel or <kbd>↑</kbd><kbd>↓</kbd></span>
            </div>
          )}
        </section>

        <section className="sliders">
          <Slider id="intensity" label="Intensity" hint="How strongly the letters react to you" value={settings.intensity} onChange={(v) => onChange({ intensity: v })} />
          <Slider id="motion" label="Motion" hint="How much they move on their own" value={settings.motion} onChange={(v) => onChange({ motion: v })} />
        </section>

        <section className="tune">
          <Slider
            id="tune" label={`${current.label} · ${tune.label}`} hint={tune.hint} value={settings.tune[settings.material] ?? 0.5}
            onChange={(v) => onChange({ tune: { ...settings.tune, [settings.material]: v } })}
          />
        </section>

        <section>
          <div className="row"><span id="col-label">Color</span><span className="dim">{settings.palette === 'custom' ? 'Custom' : PALETTES.find((p) => p.id === settings.palette)?.name}</span></div>
          <ColorChoices settings={settings} onChange={onChange} />
          <label className="switch backdrop-switch">
            <input type="checkbox" checked={settings.backdrop} onChange={(e) => onChange({ backdrop: e.target.checked })} />
            <span>Background effect <span className="dim">· follows the material</span></span>
          </label>
        </section>

        <section className="actions">
          <button type="button" className="btn primary" onClick={onSurprise}><Icon name="sparkle" />Surprise me</button>
        </section>
      </div>
    </aside>
  );
}

export function Slider({ id, label, hint, value, onChange }: { id: string; label: string; hint: string; value: number; onChange(v: number): void }) {
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

function ColorField({ label, value, onChange }: { label: string; value: string; onChange(v: string): void }) {
  return (
    <label className="swatch">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <span>{label}</span>
    </label>
  );
}

export function ElementIcon({ id }: { id: ElementId }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      {id === 'fire' && <path stroke="none" d="M12 2c4 4 6 7.5 6 11a6 6 0 0 1-12 0c0-2.5 1.2-4.5 3-6 0 2 1 3.2 2.2 3.6C10.6 7.8 11 5 12 2Z" />}
      {id === 'air' && <g fill="none"><path d="M3 9h11a3 3 0 1 0-3-3" /><path d="M3 14h15a3 3 0 1 1-3 3" /><path d="M3 19h6" /></g>}
      {id === 'earth' && <path stroke="none" d="M2 20 9 8l4 6 3-4 6 10Z" />}
      {id === 'water' && <path stroke="none" d="M12 3c3 4.5 6 8 6 11.5a6 6 0 0 1-12 0C6 11 9 7.5 12 3Z" />}
    </svg>
  );
}

/** The palette rows and the custom colours: shared by the panel and the quick colour picker on the stage. */
export function ColorChoices({ settings, onChange }: { settings: Settings; onChange(p: Partial<Settings>): void }) {
  const custom = settings.palette === 'custom';
  const setCustom = (c: Partial<CustomColors>) => onChange({ custom: { ...settings.custom, ...c } });
  return (
    <>
      <div role="radiogroup" aria-label="Colour">
        {(['dark', 'bright', 'gradient'] as const).map((g) => (
          <div key={g} className="palette-row">
            <span className="palette-label">{{ dark: 'Dark', bright: 'Bright', gradient: 'Gradient' }[g]}</span>
            <div className="palettes">
              {PALETTES.filter((p) => p.group === g).map((p) => (
                <button
                  key={p.id} type="button" role="radio" aria-checked={settings.palette === p.id} aria-label={p.name} title={p.name}
                  style={{ background: p.bg2 ? `linear-gradient(160deg, ${p.bg}, ${p.bg2})` : p.bg, color: p.ink }}
                  onClick={() => onChange({ palette: p.id })}
                >
                  <span className="p-a" aria-hidden="true">a</span>
                  <i style={{ background: p.stem }} /><i style={{ background: p.flower }} /><i style={{ background: p.spark }} />
                </button>
              ))}
            </div>
          </div>
        ))}
        <button type="button" role="radio" aria-checked={custom} className="custom-btn" onClick={() => onChange({ palette: 'custom' })}>
          <span className="swatch-dot" aria-hidden="true" />Custom colours
        </button>
      </div>
      {custom && (
        <div className="custom">
          <ColorField label="Background" value={settings.custom.bg} onChange={(v) => setCustom({ bg: v })} />
          <ColorField label="Letters" value={settings.custom.ink} onChange={(v) => setCustom({ ink: v })} />
          <ColorField label="Accent" value={settings.custom.accent} onChange={(v) => setCustom({ accent: v })} />
          <label className="switch">
            <input type="checkbox" checked={settings.custom.gradient} onChange={(e) => setCustom({ gradient: e.target.checked })} />
            <span>Gradient</span>
          </label>
          {settings.custom.gradient && (
            <ColorField label="Fades to" value={settings.custom.bg2} onChange={(v) => setCustom({ bg2: v })} />
          )}
        </div>
      )}
    </>
  );
}
