import type { Stage } from './stage';
import { renderScene } from './renderer';

/** Renders the current frame, without interface or cursor, at about twice the stage size. */
export function exportBlob(st: Stage): Promise<Blob> {
  const MAX_PIXELS = 18e6, MAX_SIDE = 8192;
  let s = 2;
  s = Math.min(s, Math.sqrt(MAX_PIXELS / (st.W * st.H)), MAX_SIDE / st.W, MAX_SIDE / st.H);
  const c = document.createElement('canvas');
  c.width = Math.round(st.W * s); c.height = Math.round(st.H * s);
  const ctx = c.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas is not available'));
  renderScene(ctx, st, c.width / st.W);
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('The image could not be encoded'))), 'image/png'),
  );
}

export function fileName(word: string, material: string) {
  const slug = word.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/ñ/g, 'n').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
  return `living-letters-${slug}-${material}.png`;
}

type Saver = { save(r: { filename: string; data: Blob }): Promise<unknown> };
declare global { interface Window { claude?: { use(name: string): Promise<unknown> } } }

/** Saves the PNG. Uses the host's download bridge when the page is embedded somewhere that blocks direct downloads. */
export async function savePng(blob: Blob, filename: string): Promise<'saved' | 'declined'> {
  if (window.claude?.use) {
    const dl = (await window.claude.use('downloads').catch(() => null)) as Saver | null;
    if (dl) {
      try { await dl.save({ filename, data: blob }); return 'saved'; }
      catch (e) { if ((e as { code?: string })?.code === 'declined') return 'declined'; throw e; }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'saved';
}
