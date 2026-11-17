import { useEffect, useRef } from 'react';
import type { Settings } from '../engine/types';
import { ColorChoices } from './Panel';

/** The quick colour picker that opens from the swatch on the stage: only the palettes and custom colours. */
export function ColorPop({ settings, onChange, onClose }: { settings: Settings; onChange(p: Partial<Settings>): void; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !(t instanceof Element && t.closest('[data-color-toggle]'))) onClose();
    };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [onClose]);
  return (
    <div ref={ref} className="quick-controls color-pop glass" role="dialog" aria-label="Colour">
      <ColorChoices settings={settings} onChange={onChange} />
    </div>
  );
}
