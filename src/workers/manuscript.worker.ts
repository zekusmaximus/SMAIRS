/// <reference lib="webworker" />
import type { Manuscript, Scene } from "@/features/manuscript/types.js";

// Re-export types for worker usage
export type { Manuscript, Scene } from "@/features/manuscript/types.js";

// Worker message types
export type SegmentationRequest = {
  type: "segment";
  manuscript: Manuscript;
  chunkSize?: number;
};

export type SegmentationProgress = {
  type: "progress";
  progress: number;
  message: string;
  partialScenes?: Scene[];
};

export type SegmentationResult = {
  type: "result";
  scenes: Scene[];
};

export type WorkerMessage = SegmentationRequest;
export type WorkerResponse = SegmentationProgress | SegmentationResult;

// Import segmentation logic (adapted for worker)
const SCENE_RE = /^\[SCENE:\s*CH(\d{1,3})_S(\d{1,3})(?:\s*\|\s*POV:\s*[^\]|]+)?(?:\s*\|\s*Location:\s*[^\]|]+)?\]\s*$/gim;
const CHAPTER_RE = /^===\s*CHAPTER\s+\d{1,3}(?::.*)?\s*===\s*$/gim;

type Header = {
  id: string;
  chapterId: string;
  headerStart: number;
  headerEnd: number;
  bodyStart: number;
};

function resolveChapterId(ms: Manuscript, pos: number): string {
  const firstChapter = ms.chapters[0];
  let current: string = firstChapter ? firstChapter.id : "ch01";
  for (let i = 0; i < ms.chapters.length; i++) {
    const chapter = ms.chapters[i];
    if (!chapter) continue;
    if (chapter.startOffset <= pos) {
      current = chapter.id;
    } else {
      break;
    }
  }
  return current;
}

function nextChapterBoundary(starts: number[], afterPos: number): number {
  for (const v of starts) {
    if (v > afterPos) return v;
  }
  return Number.POSITIVE_INFINITY;
}

function calcDialogueRatio(text: string): number {
  const t = text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

  const dq = t.match(/"[^"\n]{2,}"/g) || [];
  let dlgLen = dq.reduce((acc, s) => acc + s.length, 0);

  const sq = t.match(/'[^'\n]{4,}'/g) || [];
  dlgLen += sq.reduce((acc, s) => acc + s.length, 0);

  const denom = t.length || 1;
  const ratio = dlgLen / denom;
  return ratio < 0 ? 0 : ratio > 1 ? 1 : ratio;
}

async function segmentScenesInWorker(
  ms: Manuscript,
  onProgress?: (progress: number, message: string, partialScenes?: Scene[]) => void,
  chunkSize: number = 1000
): Promise<Scene[]> {
  const text: string = ms.rawText;
  const scenes: Scene[] = [];

  // 1) Collect chapter start offsets
  const chapterStarts: number[] = [];
  {
    const re = new RegExp(CHAPTER_RE.source, CHAPTER_RE.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      chapterStarts.push(m.index);
    }
    chapterStarts.sort((a, b) => a - b);
  }

  onProgress?.(5, 'Found chapter boundaries...');

  // 2) Collect scene headers with chunked processing
  const headers: Header[] = [];
  {
    const re = new RegExp(SCENE_RE.source, SCENE_RE.flags);
    let m: RegExpExecArray | null;
    let headerCount = 0;
    let lastProgressUpdate = 0;

    while ((m = re.exec(text)) !== null) {
      const capCh = m[1];
      const capSc = m[2];
      if (capCh == null || capSc == null) continue;

      const ch = String(parseInt(capCh, 10)).padStart(2, "0");
      const sc = String(parseInt(capSc, 10)).padStart(2, "0");
      const id = `ch${ch}_s${sc}`;

      const headerStart = m.index;
      const headerEnd = headerStart + m[0].length;
      const bodyStart = headerEnd + (text.charAt(headerEnd) === "\n" ? 1 : 0);

      const chapterId = resolveChapterId(ms, headerStart);
      headers.push({ id, chapterId, headerStart, headerEnd, bodyStart });

      headerCount++;

      // Yield control periodically to prevent blocking
      if (headerCount % chunkSize === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
        const progressPercent = 5 + (headerStart / text.length) * 25;
        if (progressPercent - lastProgressUpdate > 1) {
          onProgress?.(progressPercent, `Found ${headerCount} scene headers...`);
          lastProgressUpdate = progressPercent;
        }
      }
    }
  }

  if (headers.length === 0) {
    onProgress?.(100, 'No scenes found');
    return [];
  }

  onProgress?.(30, 'Processing scene boundaries...');

  // 3) Sort headers by position
  headers.sort((a, b) => a.headerStart - b.headerStart);

  // 4) Build scenes with chunked processing
  let currentChapterId = '';
  let scenesInCurrentChapter = 0;
  let processedCount = 0;

  for (let i = 0; i < headers.length; i++) {
    const h: Header = headers[i]!;

    // Track chapter changes
    if (h.chapterId !== currentChapterId) {
      if (currentChapterId !== '') {
        onProgress?.(30 + (i / headers.length) * 65, `Completed chapter ${currentChapterId} (${scenesInCurrentChapter} scenes)`);
      }
      currentChapterId = h.chapterId;
      scenesInCurrentChapter = 0;
    }

    const nextHeaderStart: number = i + 1 < headers.length ? headers[i + 1]!.headerStart : Number.POSITIVE_INFINITY;
    const nextChapterStart: number = nextChapterBoundary(chapterStarts, h.headerStart);

    let end = Math.min(nextHeaderStart, nextChapterStart, text.length);
    if (end < h.bodyStart) end = h.bodyStart;

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
    processedCount++;

    // Yield control and send progress updates periodically
    if (processedCount % chunkSize === 0 || i === headers.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 0));
      const progressPercent = 30 + ((i + 1) / headers.length) * 65;
      onProgress?.(progressPercent, `Processed ${i + 1}/${headers.length} scenes...`, scenes.slice(-chunkSize));
    }
  }

  onProgress?.(95, `Completed segmentation: ${scenes.length} scenes`);
  return scenes;
}

// Worker message handler
self.onmessage = async (ev: MessageEvent<SegmentationRequest>) => {
  const { data } = ev;

  if (data.type === "segment") {
    try {
      const scenes = await segmentScenesInWorker(
        data.manuscript,
        (progress, message, partialScenes) => {
          const progressMsg: SegmentationProgress = {
            type: "progress",
            progress,
            message,
            partialScenes
          };
          self.postMessage(progressMsg);
        },
        data.chunkSize || 1000
      );

      const result: SegmentationResult = {
        type: "result",
        scenes
      };
      self.postMessage(result);
    } catch (error) {
      // Send error back to main thread
      self.postMessage({
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
};
