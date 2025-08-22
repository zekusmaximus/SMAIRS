#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { importManuscript } from '../features/manuscript/importer.js';
import { segmentScenes } from '../features/manuscript/segmentation.js';
import { generateCandidates } from '../features/manuscript/opening-candidates.js';
import { analyzeScenes } from '../features/manuscript/analyzer.js';
import { buildRevealGraph, RevealGraph } from '../features/manuscript/reveal-graph.js';
import { detectSpoilers } from '../features/manuscript/spoiler-detector.js';
import { analyzeCandidateContext } from '../features/manuscript/context-analyzer.js';
import { calculateEditBurden } from '../features/manuscript/edit-burden.js';
import { OpeningLabOrchestrator } from '../features/manuscript/opening-lab-orchestrator.js';
import type { Manuscript, Scene } from '../features/manuscript/types.js';
import { DiffExporter } from '../features/manuscript/diff-exporter.js';
import { DiffEngine } from '../features/manuscript/diff-engine.js';
import type { CandidateGenerationOptions } from '../features/manuscript/opening-candidates.js';

async function main() {
  console.log('📚 Opening Lab Analysis Tool\n');

  const manuscriptPath = process.argv[2];
  const outputDir = process.argv[3] || 'out/opening-analysis';

  if (!manuscriptPath || !existsSync(manuscriptPath)) {
    console.error('Usage: npm run analyze:opening <manuscript.txt> [output-dir]');
    console.error('\nExample: npm run analyze:opening data/manuscript.txt out/my-analysis');
    process.exit(1);
  }

  const useRealLLM = process.env.USE_REAL_LLM === 'true';
  if (!useRealLLM) {
    console.log('🤖 Using mock LLM mode (set USE_REAL_LLM=true for real API calls)\n');
    process.env.LLM_OFFLINE = '1';
  }

  try {
    console.log(`📖 Loading manuscript from ${manuscriptPath}...`);
    const text = await readFile(manuscriptPath, 'utf-8');
    const manuscript = importManuscript(text);
    console.log(`   ✓ ${manuscript.chapters.length} chapters, ${manuscript.wordCount.toLocaleString()} words\n`);

    console.log('🎬 Segmenting scenes...');
    const scenes = segmentScenes(manuscript);
    console.log(`   ✓ ${scenes.length} scenes identified\n`);

    // Optional diagnostics
    const diagnose = process.argv.includes('--diagnose');
    if (diagnose) {
      console.log('📊 Diagnostic Mode');
      const analysis = analyzeScenes(scenes);
      const hooks = analysis.hookScores;
      let sum = 0;
      let maxHook = 0;
      let dlgScenes = 0;
      let lowHook = 0;
      let noDialogue = 0;
      let tooShort = 0;
      const minHook = 0.6; // align with legacy candidate threshold
      const minWords = 500;
      for (const s of scenes) {
        const h = hooks.get(s.id) ?? 0;
        sum += h;
        if (h > maxHook) maxHook = h;
        if ((s.dialogueRatio ?? 0) > 0) dlgScenes++;
        if (h < minHook) lowHook++;
        if ((s.dialogueRatio ?? 0) === 0) noDialogue++;
        if ((s.wordCount ?? 0) < minWords) tooShort++;
      }
      const avg = scenes.length ? sum / scenes.length : 0;
      console.log(`   - Average hook score: ${avg.toFixed(3)}`);
      console.log(`   - Max hook score: ${maxHook.toFixed(3)}`);
      console.log(`   - Scenes with dialogue: ${dlgScenes} / ${scenes.length}`);
      console.log('   - Filter reasons:');
      console.log(`       low_hook: ${lowHook}`);
      console.log(`       no_dialogue: ${noDialogue}`);
      console.log(`       too_short: ${tooShort}\n`);
    }

    console.log('🎯 Generating opening candidates...');
    // Parse optional CLI thresholds
    const args = process.argv.slice(2);
    const htIdx = args.indexOf('--hook-threshold');
    let options: CandidateGenerationOptions | undefined;
    let useOptionsMode = false;
    if (htIdx !== -1 && htIdx + 1 < args.length) {
      const val = Number(args[htIdx + 1]);
      if (Number.isFinite(val)) {
        options = { minHookScore: val, maxCandidates: 5, requireDialogue: false };
        useOptionsMode = true;
      }
    }

    let candidates = useOptionsMode ? generateCandidates(scenes, options) : generateCandidates(scenes);

    // Ensure at least 3 candidates when using options mode, by relaxing thresholds if needed
    if (useOptionsMode && candidates.length < 3) {
      console.warn('[warn] Fewer than 3 candidates with provided thresholds; relaxing to fill set.');
      const relaxed: CandidateGenerationOptions = {
        minHookScore: 0,
        minWordCount: options?.minWordCount ?? 500,
        maxCandidates: Math.max(3, options?.maxCandidates ?? 5),
        requireDialogue: false,
        minDialogueRatio: 0,
      };
      const more = generateCandidates(scenes, relaxed);
      candidates = more.slice(0, Math.max(3, Math.min(5, more.length)));
    }
    console.log(`   ✓ ${candidates.length} viable candidates found`);

    console.log('\n📊 Candidate Summary:');
    for (const [idx, candidate] of candidates.entries()) {
      console.log(`   ${idx + 1}. ${candidate.id}`);
      console.log(`      - Hook Score: ${(candidate.hookScore * 100).toFixed(1)}%`);
      console.log(`      - Words: ${candidate.totalWords}`);
      console.log(`      - Dialogue: ${(candidate.dialogueRatio * 100).toFixed(1)}%`);
    }

    console.log('\n🔍 Analyzing reveals and dependencies...');
    const revealGraphEntries = buildRevealGraph(scenes);
    console.log(`   ✓ ${revealGraphEntries.reveals.length} reveals mapped\n`);

    // Materialize a RevealGraph instance for spoiler detection
    const revealGraph = new RevealGraph();
    const { extractReveals } = await import('../features/manuscript/reveal-extraction.js');
    for (const s of scenes) {
      const revs = extractReveals(s);
      for (const r of revs) revealGraph.addReveal(r, []);
    }

    console.log('📈 Analyzing spoilers and edit burden...');
    for (const candidate of candidates) {
      const spoilers = detectSpoilers(candidate, scenes, revealGraph);
      const firstSceneId = candidate.scenes[0]!;
      const candidateStartIndex = scenes.findIndex(s => s.id === firstSceneId);
      const candidateScenes: Scene[] = candidate.scenes.map(id => scenes.find(s => s.id === id)!).filter(Boolean);
      const context = analyzeCandidateContext(candidate.id, candidateScenes, scenes, Math.max(0, candidateStartIndex));
      const burden = calculateEditBurden(candidate, spoilers, context);

      console.log(`   ✓ ${candidate.id}:`);
      console.log(`     - Spoiler violations: ${spoilers.violations.length}`);
      console.log(`     - Context gaps: ${context.gaps.length}`);
      console.log(`     - Edit burden: ${(burden.metrics.totalChangePercent).toFixed(1)}%`);
    }

    console.log('\n🧪 Running Opening Lab analysis...');
    const orchestrator = new OpeningLabOrchestrator();
    const report = await orchestrator.analyzeOpenings(
      manuscript as Manuscript,
      candidates
    );

    console.log('\n💾 Saving results...');
    await mkdir(outputDir, { recursive: true });

    const markdownPath = `${outputDir}/opening-analysis.md`;
    await writeFile(markdownPath, report.exportFormats.markdown);
    console.log(`   ✓ Markdown report: ${markdownPath}`);

    const jsonPath = `${outputDir}/opening-analysis.json`;
    await writeFile(jsonPath, JSON.stringify(report, null, 2));
    console.log(`   ✓ JSON data: ${jsonPath}`);

    console.log('\n🏆 Recommendation:');
    console.log(`   Winner: ${report.comparison.winnerAnalysis.id}`);
    console.log(`   Confidence: ${report.comparison.winnerAnalysis.confidence}%`);
    if (report.comparison.winnerAnalysis.recommendation) {
      console.log(`   Rationale: ${report.comparison.winnerAnalysis.recommendation}`);
    }

    // Optional: export revision diffs
    if (process.argv.includes('--export-diffs')) {
      console.log('\n📝 Generating revision diffs...');
      const exporter = new DiffExporter();
      const engine = new DiffEngine();
      // naive original opening text = first candidate scenes concatenated
      for (const cand of candidates) {
        const firstSceneId = cand.scenes[0]!;
        const startIndex = scenes.findIndex(s => s.id === firstSceneId);
        const originalOpeningText = scenes.slice(startIndex, Math.min(scenes.length, startIndex + 3)).map(s => s.text).join('\n\n');
        const spoilers = detectSpoilers(cand, scenes, revealGraph);
        const candidateScenes: Scene[] = cand.scenes.map(id => scenes.find(s => s.id === id)!).filter(Boolean);
        const context = analyzeCandidateContext(cand.id, candidateScenes, scenes, Math.max(0, startIndex));
        const diff = engine.generateDiff(originalOpeningText, spoilers.violations, context.gaps);
        await exporter.exportDiff(diff, outputDir, cand.id);
      }
      console.log('   ✓ Diffs exported for all candidates');
    }

    console.log('\n✅ Analysis complete!');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('analyze-opening.ts')) {
  // Run only when executed directly
  main().catch(console.error);
}
