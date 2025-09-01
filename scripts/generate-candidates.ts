#!/usr/bin/env node

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
    // Ensure only JSON goes to stdout; send logs to stderr
    const toStderr = (...args: unknown[]) => {
      try { process.stderr.write(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n'); } catch { /* no-op */ }
    };
    console.log = toStderr as unknown as typeof console.log;
    console.info = toStderr as unknown as typeof console.info;
    console.warn = toStderr as unknown as typeof console.warn;
  const raw = await readStdin();
  type SceneIn = { id: string; chapterId: string; text: string; startOffset: number; endOffset: number; wordCount: number; dialogueRatio: number };
  const input = JSON.parse(raw) as { scenes: SceneIn[]; strategy?: string };
  // Import after console redirection to keep any module logs off stdout
  // Use .js extension to satisfy ESM resolution under tsx/Node
  const mod: typeof import('../src/features/manuscript/opening-candidates.js') = await import('../src/features/manuscript/opening-candidates.js');
  const { generateCandidates } = mod;
  const scenes = input.scenes.map(s => ({
      id: s.id,
      chapterId: s.chapterId,
      text: s.text,
      startOffset: s.startOffset,
      endOffset: s.endOffset,
      wordCount: s.wordCount,
      dialogueRatio: s.dialogueRatio,
    }));
  const cands = generateCandidates(scenes);
  const out = cands.map(c => ({ id: c.id, sceneIds: c.scenes, type: c.type }));
  process.stdout.write(JSON.stringify(out));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    process.exit(1);
  }
})();
