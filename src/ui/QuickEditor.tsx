import { useEffect, useRef } from 'react';
import { MAX_CHARS } from '../engine/config';
import { cleanWord } from '../App';

interface Props { x: number; y: number; word: string; onChange(w: string): void; onClose(): void }

/** Compact in-place editor for touch screens, opened by double-tapping empty stage. */
export function QuickEditor({ x, y, word, onChange, onClose }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const left = Math.min(Math.max(x - 130, 12), window.innerWidth - 272);
  const top = Math.min(Math.max(y - 30, 12), window.innerHeight - 110);
  return (
    <div className="quick glass" style={{ left, top }}>
      <label htmlFor="quick-word">Word</label>
      <input
        id="quick-word" ref={ref} value={word} maxLength={MAX_CHARS * 2}
        autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="done"
        onChange={(e) => onChange(cleanWord(e.target.value))}
        onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); onClose(); } }}
        onBlur={onClose}
      />
      <span>Press Enter when you're done</span>
    </div>
  );
}
