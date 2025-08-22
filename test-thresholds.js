/* eslint-env node */
/* global console, process */

// test-thresholds.js
// - Backs up src/features/manuscript/opening-candidates.ts to .bak
// - Lowers thresholds in-place for quick experimentation
//   * c.hookScore >= 0.6  -> c.hookScore >= 0.3
//   * c.dialogueRatio > 0 -> c.dialogueRatio >= 0
// - Writes the modified file and logs a confirmation

import { readFile, writeFile, access } from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const target = join(__dirname, 'src', 'features', 'manuscript', 'opening-candidates.ts');
  const backup = target + '.bak';

  try {
    // Ensure target exists
    await access(target, FS.F_OK);
  } catch (err) {
    console.error('[fatal] Target file not found:', target, err);
    process.exitCode = 1;
    return;
  }

  let original;
  try {
    original = await readFile(target, 'utf8');
  } catch (err) {
    console.error('[fatal] Failed to read target:', err);
    process.exitCode = 1;
    return;
  }

  // Write backup
  try {
    await writeFile(backup, original, 'utf8');
    console.log(`[ok] Backup written: ${backup}`);
  } catch (err) {
    console.error('[fatal] Failed to write backup:', err);
    process.exitCode = 1;
    return;
  }

  // Build replacements
  const hookRe = /c\.hookScore\s*>=\s*0\.6/g;
  const dlgRe = /c\.dialogueRatio\s*>\s*0\b/g;
  const hookMatches = original.match(hookRe) || [];
  const dlgMatches = original.match(dlgRe) || [];

  let modified = original.replace(hookRe, 'c.hookScore >= 0.3');
  modified = modified.replace(dlgRe, 'c.dialogueRatio >= 0');

  // Write modified
  try {
    await writeFile(target, modified, 'utf8');
    console.log(`[ok] Modified thresholds in ${target}`);
    console.log(`    Replaced hook comparator: ${hookMatches.length} occurrence(s)`);
    console.log(`    Replaced dialogue comparator: ${dlgMatches.length} occurrence(s)`);
  } catch (err) {
    console.error('[fatal] Failed to write modified file. Attempting to restore backup...', err);
    try {
      await writeFile(target, original, 'utf8');
      console.log('[ok] Restored original file.');
    } catch (restoreErr) {
      console.error('[error] Failed to restore original file:', restoreErr);
    }
    process.exitCode = 1;
    return;
  }
}

await main();
