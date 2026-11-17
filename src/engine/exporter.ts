import type { Stage } from './stage';
import { renderScene } from './renderer';

/* ---------- canvas formats ---------- */

export type FormatId = 'screen' | 'square' | 'story' | 'wide';

/** The shapes the stage can take. `ratio` is width / height; `out` the size images and videos are saved at. */
export const FORMATS: { id: FormatId; label: string; ratio: number | null; out: [number, number] | null }[] = [
  { id: 'screen', label: 'Screen', ratio: null, out: null },
  { id: 'square', label: 'Square', ratio: 1, out: [1080, 1080] },
  { id: 'story', label: 'Story', ratio: 9 / 16, out: [1080, 1920] },
  { id: 'wide', label: 'Wide', ratio: 16 / 9, out: [1920, 1080] },
];

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Output size for a format; the full screen is saved at twice its size for images, 1920 on the long side for video. */
export function outSize(format: FormatId, W: number, H: number, video: boolean): { w: number; h: number } {
  const f = FORMATS.find((x) => x.id === format);
  if (f?.out) return { w: f.out[0], h: f.out[1] };
  if (video) { const s = 1920 / Math.max(W, H); return { w: even(W * s), h: even(H * s) }; }
  const MAX_PIXELS = 18e6, MAX_SIDE = 8192;
  const s = Math.min(2, Math.sqrt(MAX_PIXELS / (W * H)), MAX_SIDE / W, MAX_SIDE / H);
  return { w: Math.round(W * s), h: Math.round(H * s) };
}

/* ---------- images ---------- */

/** Renders the current frame — no interface, no cursor — at the given size, optionally with no background. */
export function exportBlob(st: Stage, size: { w: number; h: number }, transparent = false): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = size.w; c.height = size.h;
  const ctx = c.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas is not available'));
  // cover the whole output even if the stage's shape is a pixel off the format's
  renderScene(ctx, st, Math.max(size.w / st.W, size.h / st.H), transparent);
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('The image could not be encoded'))), 'image/png'),
  );
}

/* ---------- video ---------- */

/** The best format this browser can record: MP4 where it can, WebM otherwise; null if it cannot record at all. */
export function videoType(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
  for (const mime of ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
  }
  return null;
}

/** Records a canvas until stopped. */
export class Recording {
  private rec: MediaRecorder;
  private chunks: Blob[] = [];
  readonly ext: string;

  constructor(canvas: HTMLCanvasElement, type: { mime: string; ext: string }) {
    this.ext = type.ext;
    const stream = canvas.captureStream(60);
    this.rec = new MediaRecorder(stream, { mimeType: type.mime, videoBitsPerSecond: 12_000_000 });
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.start(250);
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      this.rec.onstop = () => {
        this.rec.stream.getTracks().forEach((t) => t.stop());
        resolve(new Blob(this.chunks, { type: this.rec.mimeType.split(';')[0] }));
      };
      this.rec.stop();
    });
  }
}

/* ---------- saving ---------- */

/** e.g. living-letters-hello-jelly-story-transparent.png */
export function fileName(word: string, material: string, ext = 'png', tags: string[] = []) {
  const slug = word.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/ñ/g, 'n').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
  return ['living-letters', slug, material, ...tags].join('-') + '.' + ext;
}

type Saver = { save(r: { filename: string; data: Blob }): Promise<unknown> };
declare global { interface Window { claude?: { use(name: string): Promise<unknown> } } }

/** Saves a file. Uses the host's download bridge when the page is embedded somewhere that blocks direct downloads. */
export async function saveFile(blob: Blob, filename: string): Promise<'saved' | 'declined'> {
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
