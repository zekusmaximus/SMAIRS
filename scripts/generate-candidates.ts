#!/usr/bin/env node
import { generateCandidates } from '../src/features/manuscript/opening-candidates.ts';
import type { Scene } from '../src/features/manuscript/types.ts';

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

(async () => {
  try {
    const raw = await readStdin();
    const input = JSON.parse(raw) as { scenes: Array<{ id: string; chapterId: string; text: string; startOffset: number; endOffset: number; wordCount: number; dialogueRatio: number }>; strategy?: string };
    const scenes: Scene[] = input.scenes.map(s => ({
      id: s.id,
      chapterId: s.chapterId,
      text: s.text,
      startOffset: s.startOffset,
      endOffset: s.endOffset,
      wordCount: s.wordCount,
      dialogueRatio: s.dialogueRatio,
    } as unknown as Scene));
    const cands = generateCandidates(scenes, undefined);
    const out = cands.map(c => ({ id: c.id, sceneIds: c.scenes, type: c.type }));
    process.stdout.write(JSON.stringify(out));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    process.exit(1);
  }
})();
