// src/features/manuscript/segmentation.ts
import type { Manuscript, Scene } from "./types.js";

/** Scene header: [SCENE: CH01_S01 | POV: ... | Location: ...] */
const SCENE_RE =
  /^\[SCENE:\s*CH(\d{1,3})_S(\d{1,3})(?:\s*\|\s*POV:\s*[^\]|]+)?(?:\s*\|\s*Location:\s*[^\]|]+)?\]\s*$/gim;

/** Chapter header: === CHAPTER 01 === or === CHAPTER 01: Title === */
const CHAPTER_RE = /^===\s*CHAPTER\s+\d{1,3}(?::.*)?\s*===\s*$/gim;

/** Progress callback type for segmentation operations */
export type SegmentationProgressCallback = (progress: number, message?: string) => void;

/** Worker-based segmentation with fallback to synchronous processing */
export async function segmentScenesAsync(
  ms: Manuscript,
  onProgress?: SegmentationProgressCallback,
  options: { useWorker?: boolean; chunkSize?: number } = {}
): Promise<Scene[]> {
  const { useWorker = true, chunkSize = 1000 } = options;

  if (useWorker && typeof Worker !== 'undefined') {
    try {
      return await segmentScenesWithWorker(ms, onProgress, chunkSize);
    } catch (error) {
      console.warn('Web worker segmentation failed, falling back to synchronous processing:', error);
      // Fall through to synchronous implementation
    }
  }

  // Fallback to synchronous processing
  return segmentScenes(ms, onProgress);
}

/** Web worker-based segmentation */
async function segmentScenesWithWorker(
  ms: Manuscript,
  onProgress?: SegmentationProgressCallback,
  chunkSize: number = 1000
): Promise<Scene[]> {
  return new Promise((resolve, reject) => {
    try {
      // Create worker using Vite's worker import - fix the path
      const worker = new Worker(new URL('../../workers/manuscript.worker.ts', import.meta.url), {
        type: 'module'
      });

      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new Error('Segmentation timed out'));
      }, 30000); // 30 second timeout

      worker.onmessage = (e) => {
        const { data } = e;

        switch (data.type) {
          case 'progress':
            onProgress?.(data.progress, data.message);
            break;
          case 'result':
            clearTimeout(timeout);
            worker.terminate();
            resolve(data.scenes);
            break;
          case 'error':
            clearTimeout(timeout);
            worker.terminate();
            reject(new Error(data.error));
            break;
        }
      };

      worker.onerror = (error) => {
        clearTimeout(timeout);
        worker.terminate();
        reject(error);
      };

      // Send segmentation request
      worker.postMessage({
        type: 'segment',
        manuscript: ms,
        chunkSize
      });
    } catch (error) {
      reject(error);
    }
  });
}

type Header = {
  id: string;            // chNN_sMM
  chapterId: string;     // chNN
  headerStart: number;   // index of header line
  headerEnd: number;     // exclusive
  bodyStart: number;     // first char of scene body (skips single newline if present)
};

export function segmentScenes(ms: Manuscript, onProgress?: SegmentationProgressCallback): Scene[] {
  const text: string = ms.rawText;

  // Report initial progress
  onProgress?.(0, 'Starting scene segmentation...');

  // 1) Collect chapter start offsets (sorted)
  const chapterStarts: number[] = [];
  {
    const re = new RegExp(CHAPTER_RE.source, CHAPTER_RE.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      chapterStarts.push(m.index);
    }
    chapterStarts.sort((a, b) => a - b);
  }

  onProgress?.(10, 'Found chapter boundaries...');

  // 2) Collect scene headers with definite indices
  const headers: Header[] = [];
  {
    const re = new RegExp(SCENE_RE.source, SCENE_RE.flags);
    let m: RegExpExecArray | null;
    let headerCount = 0;
    while ((m = re.exec(text)) !== null) {
      const capCh = m[1];
      const capSc = m[2];
      if (capCh == null || capSc == null) continue; // defensive

      const ch = String(parseInt(capCh, 10)).padStart(2, "0");
      const sc = String(parseInt(capSc, 10)).padStart(2, "0");
      const id = `ch${ch}_s${sc}`;

      const headerStart = m.index;
      const headerEnd = headerStart + m[0].length;
      const bodyStart = headerEnd + (text.charAt(headerEnd) === "\n" ? 1 : 0);

      const chapterId = resolveChapterId(ms, headerStart);
      headers.push({ id, chapterId, headerStart, headerEnd, bodyStart });

      headerCount++;
      // Report progress based on text position
      const progressPercent = 10 + (headerStart / text.length) * 30; // 10-40% range
      onProgress?.(progressPercent, `Found ${headerCount} scene headers...`);
    }
  }

  if (headers.length === 0) {
    onProgress?.(100, 'No scenes found');
    return [];
  }

  onProgress?.(40, 'Processing scene boundaries...');

  // 3) Sort headers by position
  headers.sort((a, b) => a.headerStart - b.headerStart);

  // 4) Build scenes using the next header / next chapter / EOF as boundary
  const scenes: Scene[] = [];
  let currentChapterId = '';
  let scenesInCurrentChapter = 0;

  for (let i = 0; i < headers.length; i++) {
    const h: Header = headers[i] as Header; // definite

    // Track chapter changes for progress reporting
    if (h.chapterId !== currentChapterId) {
      if (currentChapterId !== '') {
        onProgress?.(40 + (i / headers.length) * 55, `Completed chapter ${currentChapterId} (${scenesInCurrentChapter} scenes)`);
      }
      currentChapterId = h.chapterId;
      scenesInCurrentChapter = 0;
      onProgress?.(40 + (i / headers.length) * 55, `Processing chapter ${currentChapterId}...`);
    }

    // Next scene header start (or +∞)
    const nextHeaderStart: number =
      i + 1 < headers.length ? (headers[i + 1] as Header).headerStart : Number.POSITIVE_INFINITY;

    // Next chapter start after this header (or +∞)
    const nextChapterStart: number = nextChapterBoundary(chapterStarts, h.headerStart);

    let end = Math.min(nextHeaderStart, nextChapterStart, text.length);
    if (end < h.bodyStart) end = h.bodyStart; // safety (shouldn't happen, but keeps TS and logic happy)

    const slice = text.substring(h.bodyStart, end);
    const wordCount = slice.split(/\s+/).filter(Boolean).length;
    const dialogueRatio = calcDialogueRatio(slice);

    scenes.push({
      id: h.id,
      chapterId: h.chapterId,
      startOffset: h.bodyStart,
      endOffset: end,
      text: slice,
      wordCount,
      dialogueRatio,
    });

    scenesInCurrentChapter++;

    // Report progress based on completion percentage
    const progressPercent = 40 + ((i + 1) / headers.length) * 55; // 40-95% range
    onProgress?.(progressPercent, `Processed ${i + 1}/${headers.length} scenes...`);
  }

  // Final progress report
  onProgress?.(95, `Completed segmentation: ${scenes.length} scenes in ${ms.chapters.length} chapters`);

  return scenes;
}

function resolveChapterId(ms: Manuscript, pos: number): string {
  // Importer guarantees ≥1, but guard anyway.
  const firstChapter = ms.chapters[0];           // Chapter | undefined under noUncheckedIndexedAccess
let current: string = firstChapter ? firstChapter.id : "ch01";
  for (let i = 0; i < ms.chapters.length; i++) {
  const chapter = ms.chapters[i];     // Chapter | undefined under noUncheckedIndexedAccess
  if (!chapter) continue;             // <-- guard

  if (chapter.startOffset <= pos) {
    current = chapter.id;
  } else {
    break;
  }
}

  return current;
}

function nextChapterBoundary(starts: number[], afterPos: number): number {
  for (const v of starts) {         // v is a number, never undefined
    if (v > afterPos) return v;
  }
  return Number.POSITIVE_INFINITY;
}


function calcDialogueRatio(text: string): number {
  // Normalize “smart” quotes to straight quotes (analysis-only)
  const t = text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

  // Count double-quoted spans that don't cross newlines
  const dq = t.match(/"[^"\n]{2,}"/g) || [];
  let dlgLen = dq.reduce((acc, s) => acc + s.length, 0);

  // Optionally count single-quoted spans, but avoid contractions like don't
  const sq = t.match(/'[^'\n]{4,}'/g) || [];
  dlgLen += sq.reduce((acc, s) => acc + s.length, 0);

  const denom = t.length || 1;
  const ratio = dlgLen / denom;

  // Clamp to [0,1] for safety
  return ratio < 0 ? 0 : ratio > 1 ? 1 : ratio;
}
