import { useEffect, useRef } from 'react';
import { FORMATS, type FormatId } from '../engine/exporter';
import { Icon } from './Icon';

interface Props {
  format: FormatId;
  transparent: boolean;
  canRecord: boolean;
  sizeLabel: string;
  onFormat(f: FormatId): void;
  onTransparent(on: boolean): void;
  onImage(): void;
  onVideo(): void;
  onClose(): void;
}

/** A small drawing of each format's shape. */
function Shape({ ratio }: { ratio: number | null }) {
  const r = ratio ?? 16 / 10;
  const w = r >= 1 ? 22 : 22 * r, h = r >= 1 ? 22 / r : 22;
  return (
    <svg viewBox="0 0 26 26" width="26" height="26" aria-hidden="true">
      <rect x={13 - w / 2} y={13 - h / 2} width={w} height={h} rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray={ratio ? undefined : '3 2.5'} />
    </svg>
  );
}

/**
 * Export: the canvas format (which also reshapes the stage, so what you play is what you save), a transparent
 * background for images, and the two outputs — an image of this moment, or a video of what you do next.
 */
export function ExportMenu({ format, transparent, canRecord, sizeLabel, onFormat, onTransparent, onImage, onVideo, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !(t instanceof Element && t.closest('[data-export-toggle]'))) onClose();
    };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [onClose]);

  return (
    <div ref={ref} className="export glass" role="dialog" aria-label="Export">
      <div className="row"><span id="fmt-label">Canvas</span><span className="dim num">{sizeLabel}</span></div>
      <div className="formats" role="radiogroup" aria-labelledby="fmt-label">
        {FORMATS.map((f) => (
          <button key={f.id} type="button" role="radio" aria-checked={format === f.id} onClick={() => onFormat(f.id)}>
            <Shape ratio={f.ratio} />
            <span>{f.label}</span>
          </button>
        ))}
      </div>
      <label className="switch">
        <input type="checkbox" checked={transparent} onChange={(e) => onTransparent(e.target.checked)} />
        <span>Transparent background <span className="dim">· images</span></span>
      </label>
      <div className="export-actions">
        <button type="button" className="btn" onClick={onVideo} disabled={!canRecord} title={canRecord ? undefined : 'This browser cannot record video'}>
          <Icon name="record" />Record video
        </button>
        <button type="button" className="btn primary" onClick={onImage}><Icon name="image" />Save image</button>
      </div>
      <p className="dim small">
        {canRecord
          ? 'The video records what you do until you press stop (up to 20 s) — the letters only, without cursor or interface.'
          : 'Video recording is not available in this browser.'}
      </p>
    </div>
  );
}
