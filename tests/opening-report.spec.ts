import { describe, it, expect, vi } from 'vitest';
import { calculateOverallScore, calculateMarketAppeal, buildComparativeReport, type CandidateReport } from '../src/features/manuscript/opening-report.js';
import type { OpeningCandidate } from '../src/features/manuscript/opening-candidates.js';
import type { SpoilerAnalysis } from '../types/spoiler-types.js';
import type { ContextAnalysis } from '../src/features/manuscript/context-analyzer.js';
import type { EditBurden } from '../types/burden-types.js';
import { generateSpoilerHeatmap } from '../src/features/manuscript/report-visualizations.js';
import { generatePDF } from '../src/features/manuscript/pdf-generator.js';

// ---- Mocks --------------------------------------------------------------
type MockCandidate = OpeningCandidate;
type MockSpoilers = SpoilerAnalysis;
type MockContext = ContextAnalysis;
type MockBurden = EditBurden;

const mockCandidate: MockCandidate = { id: 'single:ch01_s01', type: 'single', scenes: ['ch01_s01'], startOffset: 0, endOffset: 100, totalWords: 1200, hookScore: 0.8, actionDensity: 0.7, mysteryQuotient: 0.4, characterIntros: 2, dialogueRatio: 0.5 } as MockCandidate;
const mockSpoilers: MockSpoilers = { candidateId: mockCandidate.id, violations: [], missingPrerequisites: [], safeReveals: [], totalSeverityScore: 0 } as MockSpoilers;
const mockContext: MockContext = { candidateId: mockCandidate.id, gaps: [], totalWordCount: 0, criticalGaps: 0, contextScore: 1 } as MockContext;
const mockBurden: MockBurden = { candidateId: mockCandidate.id, metrics: { totalChangePercent: 5, addedWords: 50, modifiedWords: 20, deletedWords: 0, originalWords: 1200, affectedSpans: 3, percentAdded: 0, percentDeleted:0, percentModified:0, percentUntouched:0 }, complexity: { avgWordsPerEdit: 10, maxConsecutiveEdits:2, editDensity:0, fragmentationScore:0 }, timeEstimates: { minutesToImplement:30, minutesToReview:20, totalMinutes:50, confidenceLevel:'high' }, editsByType: { contextBridges:[], spoilerFixes:[], continuityPatches:[], optionalEnhancements:[] }, assessment: { burden: 'light', feasibility: 'easy', recommendation: '' } } as MockBurden;

const mockCandidate2 = { ...mockCandidate, id: 'single:ch01_s02', hookScore: 0.6, actionDensity: 0.2, mysteryQuotient: 0.1 };
const mockSpoilers2: MockSpoilers = { ...mockSpoilers, candidateId: mockCandidate2.id, violations: [ { revealId:'r1', revealDescription:'desc', mentionedIn: { sceneId:'ch01_s01', anchor:{ sceneId:'ch01_s01', offset:0, length:5 }, quotedText:'X' }, properIntroduction: { sceneId:'ch01_s01', sceneIndex:0 }, severity: 'moderate', spoiledDependencies: [], fix: { type:'replace', original:'X', suggested:'Y', reason:'' }, missingPrerequisites: [], reveal: { id:'r1', description:'desc', type:'plot', confidence:1, entities:[], sceneId:'ch01_s01' } } ], totalSeverityScore:2 } as MockSpoilers;
const mockContext2: MockContext = { ...mockContext, candidateId: mockCandidate2.id, gaps: [ { id:'g1' } ] } as MockContext;
const mockBurden2: MockBurden = { ...mockBurden, candidateId: mockCandidate2.id, metrics: { ...mockBurden.metrics, totalChangePercent: 15 } } as MockBurden;

const mockReportInput = {
  manuscriptId: 'ms1',
  candidates: [
    { candidate: mockCandidate, spoilers: mockSpoilers, context: mockContext, burden: mockBurden, label: 'Current Opening' },
    { candidate: mockCandidate2, spoilers: mockSpoilers2, context: mockContext2, burden: mockBurden2, label: 'Option A' },
  ],
};

// ---- Tests --------------------------------------------------------------

describe('comparative report generation', () => {
  it('calculates overall scores correctly', () => {
    const scores = calculateOverallScore(mockCandidate, mockSpoilers, mockContext, mockBurden);
    expect(scores.overall).toBeGreaterThan(80);
    expect(scores.components.spoilerFreedom).toBe(100);
    expect(scores.confidence).toBeGreaterThan(0.5);
  });

  it('market appeal heuristic bounds scores', () => {
    const score = calculateMarketAppeal(mockCandidate);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThan(0);
  });

  it('generates comparison matrix with winners', () => {
    const rep = buildComparativeReport(mockReportInput);
  const matrix = rep.comparison.matrix;
  expect(matrix.rows[0]?.winner).toBeDefined();
    expect(matrix.headers.some(h => /Current Opening/.test(h))).toBe(true);
  });

  it('renders spoiler heatmap correctly', () => {
    const heatmap = generateSpoilerHeatmap(repCandidates(buildComparativeReport(mockReportInput)), [mockSpoilers, mockSpoilers2]);
    expect(heatmap).toContain('Spoiler Heatmap');
    expect(heatmap).toContain('Legend');
  });

  it('generates complete markdown report', () => {
    const rep = buildComparativeReport(mockReportInput);
    const md = rep.exportFormats.markdown;
    expect(md).toContain('# Opening Lab Analysis Report');
    expect(md).toContain('## Detailed Comparison');
    expect(md).toContain('| Metric |');
    expect(md).toContain('## Recommendations');
  });

  it('handles Pandoc unavailability gracefully', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(()=>{});
    const pdf = await generatePDF('# Test PDF');
    // pdf may be null or buffer depending on CI environment; ensure no throw and warn when null
    if (!pdf) expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

function repCandidates(rep: ReturnType<typeof buildComparativeReport>): CandidateReport[] { return rep.candidates; }
