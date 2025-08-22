import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdir } from 'fs/promises';
import { importManuscript } from '../../src/features/manuscript/importer.js';
import { segmentScenes } from '../../src/features/manuscript/segmentation.js';
import { generateCandidates } from '../../src/features/manuscript/opening-candidates.js';
import { buildRevealGraph, RevealGraph } from '../../src/features/manuscript/reveal-graph.js';
import { extractReveals } from '../../src/features/manuscript/reveal-extraction.js';
import { detectSpoilers } from '../../src/features/manuscript/spoiler-detector.js';
import { analyzeCandidateContext } from '../../src/features/manuscript/context-analyzer.js';
import { calculateEditBurden } from '../../src/features/manuscript/edit-burden.js';
import { OpeningLabOrchestrator } from '../../src/features/manuscript/opening-lab-orchestrator.js';
import type { Manuscript, Scene } from '../../src/features/manuscript/types.js';

describe('Full Pipeline Integration', () => {
  let testManuscript: string;

  beforeAll(async () => {
    // Deterministic mode for tests
    process.env.LLM_OFFLINE = '1';
    process.env.FIXED_TIMESTAMP = '2025-01-01T00:00:00Z';
    process.env.SMAIRS_FAST_REVEALS = '1';

    await mkdir('tests/output', { recursive: true });

  const manuscriptPath = 'tests/fixtures/sample-manuscript.txt';
  // Always generate a deterministic synthetic manuscript for integration
  testManuscript = generateSyntheticManuscript();
  await writeFile(manuscriptPath, testManuscript, 'utf-8');
  });

  afterAll(() => {
    delete process.env.LLM_OFFLINE;
    delete process.env.FIXED_TIMESTAMP;
    delete process.env.SMAIRS_FAST_REVEALS;
  });

  it('processes a complete manuscript through all phases', async () => {
    // Phase 1: Import and segment
    const manuscript = importManuscript(testManuscript);
    expect(manuscript.chapters.length).toBeGreaterThan(0);
    expect(manuscript.wordCount).toBeGreaterThan(5000);

    const scenes = segmentScenes(manuscript);
    expect(scenes.length).toBeGreaterThan(5);

    // Phase 2: Generate candidates
    const candidates = generateCandidates(scenes);
    expect(candidates.length).toBeGreaterThanOrEqual(3);
    expect(candidates.length).toBeLessThanOrEqual(5);

    // Verify quality filters
    for (const candidate of candidates) {
      expect(candidate.hookScore).toBeGreaterThanOrEqual(0.6);
      expect(candidate.dialogueRatio).toBeGreaterThan(0);
      expect(candidate.totalWords).toBeGreaterThanOrEqual(500);
    }

    // Phase 3: Build reveal graph
    const revealGraphEntries = buildRevealGraph(scenes);
    expect(revealGraphEntries.reveals.length).toBeGreaterThan(0);

    // Also create a RevealGraph instance for spoiler detection
    const revealGraph = new RevealGraph();
    for (const s of scenes) {
  const revs = extractReveals(s);
      for (const r of revs) revealGraph.addReveal(r, []);
    }

    // Phase 4: Analyze each candidate
    const analysisResults = new Map<string, unknown>();
    for (const candidate of candidates) {
      const spoilers = detectSpoilers(candidate, scenes, revealGraph);
      const firstSceneId = candidate.scenes[0]!;
      const candidateStartIndex = scenes.findIndex(s => s.id === firstSceneId);
      const candidateScenes: Scene[] = candidate.scenes.map(id => scenes.find(s => s.id === id)!).filter(Boolean);
      const context = analyzeCandidateContext(candidate.id, candidateScenes, scenes, Math.max(0, candidateStartIndex));
      const burden = calculateEditBurden(candidate, spoilers, context);

      analysisResults.set(candidate.id, { spoilers, context, burden });

      // Verify edit burden is under threshold (<= 10%)
      expect(burden.metrics.totalChangePercent).toBeLessThanOrEqual(10);
    }

    // Phase 5: Run Opening Lab orchestration
    const orchestrator = new OpeningLabOrchestrator();
    const report = await orchestrator.analyzeOpenings(
      manuscript as Manuscript,
      candidates
    );

    // Verify report completeness
    expect(report).toBeDefined();
    expect(report.candidates).toHaveLength(candidates.length);
    expect(report.comparison).toBeDefined();
    expect(report.comparison.winnerAnalysis).toBeDefined();
    // Confidence is represented as percent integer in this codebase
    expect(report.comparison.winnerAnalysis.confidence).toBeGreaterThan(50);

    // Verify all components present
    expect(report.comparison.matrix).toBeDefined();
    expect(report.visualizations.spoilerHeatmap).toBeDefined();
    expect(report.exportFormats.markdown).toBeDefined();

    // Save report for inspection
    const markdown = report.exportFormats.markdown;
    await writeFile('tests/output/integration-report.md', markdown);

    // Verify markdown content
    expect(markdown).toContain('# Opening Lab Analysis Report');
    expect(markdown).toContain('## Recommendations');

    console.log('✅ Integration test complete. Report saved to tests/output/integration-report.md');
  });

  it('handles edge cases gracefully', async () => {
    // Minimal manuscript
    const minimalText = generateMinimalManuscript();
    const minimalMs = importManuscript(minimalText);
    const minimalScenes = segmentScenes(minimalMs);
  const minimalCandidates = generateCandidates(minimalScenes);
  expect(Array.isArray(minimalCandidates)).toBe(true); // may be 0 if thresholds not met

    // No-dialogue manuscript should filter out non-dialogue candidates
    const noDialogueText = generateNoDialogueManuscript();
    const noDialogueMs = importManuscript(noDialogueText);
    const noDialogueScenes = segmentScenes(noDialogueMs);
    const noDialogueCandidates = generateCandidates(noDialogueScenes);
    expect(noDialogueCandidates.every(c => c.dialogueRatio > 0)).toBe(true);
  });

  it('maintains deterministic output', async () => {
    const manuscript = importManuscript(testManuscript);
    const scenes = segmentScenes(manuscript);
    const candidates = generateCandidates(scenes);

    const orchestrator = new OpeningLabOrchestrator();
    const report1 = await orchestrator.analyzeOpenings(
      manuscript as Manuscript,
      candidates
    );
    const report2 = await orchestrator.analyzeOpenings(
      manuscript as Manuscript,
      candidates
    );

    expect(report1.comparison.winnerAnalysis.id).toBe(
      report2.comparison.winnerAnalysis.id
    );
  });
});

// Helper functions for generating test manuscripts
function generateSyntheticManuscript(): string {
  const chapters: string[] = [];
  for (let ch = 1; ch <= 5; ch++) {
    chapters.push(`=== CHAPTER ${ch} ===`);
    for (let sc = 1; sc <= 4; sc++) {
      chapters.push(`[SCENE: CH0${ch}_S0${sc}]`);
      chapters.push(generateSceneContent(ch, sc));
    }
  }
  return chapters.join('\n');
}

function generateSceneContent(chapter: number, scene: number): string {
  const content: string[] = [];
  // Put strong hook tokens at the very start (counted in first 250 chars)
  content.push('Suddenly, an alarm blared! Is there a danger? The gun case was open. Blood on the floor. Siren outside. A knock. Chase begins. Threat detected.');
  // Dialogue in even scenes
  if (scene % 2 === 0) {
    const dialogLine = '"We have to move now," said A. "Stay low," replied B. ';
    content.push(dialogLine.repeat(40)); // boost dialogue ratio
  }
  // Reveals for dependency graph realism
  if (chapter === 1 && scene === 1) content.push('The virus is engineered.');
  if (chapter === 2 && scene === 1) content.push('Sarah is the mole.');
  // Regular prose to build word count
  const words: string[] = [];
  for (let i = 0; i < 700; i++) words.push(`word${i % 50}`);
  content.push(words.join(' ') + '.');
  return content.join('\n');
}

function generateMinimalManuscript(): string {
  return `=== CHAPTER 1 ===\n[SCENE: CH01_S01]\n"Hello," she said. This is a minimal scene with just enough content.\n[SCENE: CH01_S02]\n"Goodbye," he replied. Another minimal scene to test edge cases.`;
}

function generateNoDialogueManuscript(): string {
  return `=== CHAPTER 1 ===\n[SCENE: CH01_S01]\nThis scene has no dialogue whatsoever. Just pure narration and description.\n[SCENE: CH01_S02]\nAnother scene without any dialogue. Only narrative prose here.`;
}
