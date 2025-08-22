/* eslint-env node */
/* global console, process */
// Diagnostic script: analyze-scenes.js (ESM)
// - Dynamically registers tsx ESM loader to import TypeScript modules
// - Reads data/manuscript.txt
// - Uses importManuscript, segmentScenes, analyzeScenes to gather info
// - Prints first 10 scenes and global statistics

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Resolve project root relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Utility: safe number formatting
function fmt3(n) {
  return typeof n === 'number' && Number.isFinite(n) ? n.toFixed(3) : 'N/A';
}

// Utility: normalize and detect dialogue using multiple quote styles
function detectDialogue(text) {
  if (!text) return false;
  const t = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  // "..." spans not crossing newlines
  const dq = t.match(/"[^"\n]{2,}"/g) || [];
  // '...' spans (avoid contractions by requiring len >= 4)
  const sq = t.match(/'[^'\n]{4,}'/g) || [];
  // Optional: em dash dialogue patterns (— Word ...), heuristic
  const dash = t.match(/(^|\n)\s*[—-]\s*[^\n]{6,}/g) || [];
  return dq.length + sq.length + dash.length > 0;
}

// Utility: truncate first N chars, collapse newlines/spaces
function preview(text, n = 100) {
  if (!text) return '';
  const s = text.replace(/\s+/g, ' ').trim();
  return s.length <= n ? s : s.slice(0, n) + '…';
}

// Pretty section divider
function section(title) {
  const line = '-'.repeat(Math.max(12, Math.min(80, title.length + 6)));
  console.log(`\n${line}\n${title}\n${line}`);
}

// Register tsx ESM loader to allow importing TypeScript files from Node
try {
  await import('tsx/esm');
} catch (e) {
  console.warn('[warn] Could not register tsx/esm loader. Ensure dev dependency "tsx" is installed.');
  throw e;
}

async function main() {
  try {
    // Dynamically import TypeScript sources after loader is active
    const [{ importManuscript }, { segmentScenes }, { analyzeScenes }] = await Promise.all([
      import('./src/features/manuscript/importer.ts'),
      import('./src/features/manuscript/segmentation.ts'),
      import('./src/features/manuscript/analyzer.ts'),
    ]);

    const manuscriptPath = join(__dirname, 'data', 'manuscript.txt');
    const rawText = await readFile(manuscriptPath, 'utf8').catch((err) => {
      console.error(`[error] Failed to read manuscript at ${manuscriptPath}`);
      throw err;
    });

    const manuscript = importManuscript(rawText);
    const scenes = segmentScenes(manuscript);

    if (!Array.isArray(scenes) || scenes.length === 0) {
      console.log('No scenes were found. Check that your manuscript has [SCENE: CHxx_Syy] headers.');
      return;
    }

    // Analyze (hook scores, etc.)
    const analysis = analyzeScenes(scenes);

    // Per-scene: first 10
    section('First 10 Scenes');
    const header = ['Scene ID'.padEnd(10), 'Words'.padStart(6), 'Hook'.padStart(8), 'Dlg%'.padStart(8), 'HasDlg'.padStart(8), 'Preview (first 100 chars)'];
    console.log(header.join('  '));
    console.log('-'.repeat(10 + 2 + 6 + 2 + 8 + 2 + 8 + 2 + 8 + 2 + 40));

    for (const s of scenes.slice(0, 10)) {
      const hook = analysis?.hookScores?.get(s.id);
      const dlgRatio = typeof s.dialogueRatio === 'number' ? s.dialogueRatio : undefined;
      const row = [
        String(s.id ?? '').padEnd(10),
        String(s.wordCount ?? 0).padStart(6),
        fmt3(hook).padStart(8),
        fmt3(dlgRatio).padStart(8),
        String(detectDialogue(s.text)).padStart(8),
        preview(s.text, 100),
      ];
      console.log(row.join('  '));
    }

    // Global stats
    section('Global Statistics');

    // Top 5 hook scores with dialogue ratios
    const scoreRows = scenes
      .map((s) => ({ id: s.id, score: analysis.hookScores.get(s.id) ?? NaN, dlg: s.dialogueRatio ?? 0 }))
      .filter((r) => Number.isFinite(r.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    console.log('Top 5 Hooks:');
    if (scoreRows.length === 0) {
      console.log('  (no hook scores)');
    } else {
      for (const r of scoreRows) {
        console.log(`  ${String(r.id).padEnd(10)}  Hook=${fmt3(r.score)}  Dlg%=${fmt3(r.dlg)}`);
      }
    }

    // Hook score distribution
    let low = 0, med = 0, high = 0;
    for (const s of scenes) {
      const sc = analysis.hookScores.get(s.id);
      if (typeof sc !== 'number') continue;
      if (sc < 0.3) low++; else if (sc < 0.6) med++; else high++;
    }
    console.log('\nHook score distribution:');
    console.log(`  low (<0.3):   ${low}`);
    console.log(`  medium (0.3–0.6): ${med}`);
    console.log(`  high (>=0.6): ${high}`);

    // Dialogue ratio distribution
    let none = 0, some = 0, dhigh = 0;
    for (const s of scenes) {
      const r = typeof s.dialogueRatio === 'number' ? s.dialogueRatio : 0;
      if (r === 0) none++; else if (r < 0.2) some++; else dhigh++;
    }
    console.log('\nDialogue ratio distribution:');
    console.log(`  none (=0):   ${none}`);
    console.log(`  some (<0.2): ${some}`);
    console.log(`  high (>=0.2): ${dhigh}`);

    console.log('\nDone.');
  } catch (err) {
    console.error('[fatal] analyze-scenes failed:', err?.stack || err?.message || String(err));
    process.exitCode = 1;
  }
}

await main();
