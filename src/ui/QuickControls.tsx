import { useEffect, useRef } from 'react';
import { ELEMENTS, MATERIALS } from '../engine/config';
import type { Settings } from '../engine/types';
import { ElementIcon, Glyph, Slider } from './Panel';

interface Props {
  settings: Settings;
  onChange(p: Partial<Settings>): void;
  onClose(): void;
}

/**
 * The quick controls that open from the material badge on the stage: only the materials (and the element,
 * for Elements) and the intensity — enough to change the feel without opening the whole panel.
 */
export function QuickControls({ settings, onChange, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const current = MATERIALS.find((m) => m.id === settings.material)!;
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !(t instanceof Element && t.closest('[data-quick-toggle]'))) onClose();
    };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [onClose]);

  return (
    <div ref={ref} className="quick-controls glass" role="dialog" aria-label="Material">
      <div className="materials" role="radiogroup" aria-label="Material">
        {MATERIALS.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={settings.material === m.id} title={m.note} onClick={() => onChange({ material: m.id })}>
            <Glyph id={m.id} />
            <span className="m-name">{m.label}</span>
          </button>
        ))}
      </div>
      <p className="m-desc"><strong>{current.label}</strong>{current.note}</p>
      {settings.material === 'elements' && (
        <div className="elements" role="radiogroup" aria-label="Element">
          {ELEMENTS.map((e) => (
            <button key={e.id} type="button" role="radio" aria-checked={settings.element === e.id} onClick={() => onChange({ element: e.id })}>
              <ElementIcon id={e.id} />
              <span>{e.label}</span>
            </button>
          ))}
        </div>
      )}
      <Slider id="quick-intensity" label="Intensity" hint="How strongly the letters react to you" value={settings.intensity} onChange={(v) => onChange({ intensity: v })} />
    </div>
  );
}
