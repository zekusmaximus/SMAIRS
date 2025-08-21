// Edit burden domain types – Phase 2
// Lightweight types aligned with design spec.

import type { TextAnchor } from './spoiler-types.js';
import type { OpeningCandidate } from '../src/features/manuscript/opening-candidates.js';
import type { SpoilerAnalysis } from './spoiler-types.js';
import type { ContextAnalysis } from '../src/features/manuscript/context-analyzer.js';

export type EditOperation = 'insert' | 'delete' | 'replace';
export type EditPriority = 'critical' | 'important' | 'optional';

export interface EditAnchor extends Partial<TextAnchor> { position?: number; }

export interface EditSpan {
  id?: string;
  type: EditOperation;
  anchor?: EditAnchor;
  originalText?: string;
  newText?: string;
  wordDelta: number;
  priority?: EditPriority;
  reason?: string;
  fullRewrite?: boolean;
  punctuationOnly?: boolean;
}

export interface BurdenMetrics {
  originalWords: number;
  addedWords: number;
  deletedWords: number;
  modifiedWords: number;
  affectedSpans: number;
  percentAdded: number;
  percentDeleted: number;
  percentModified: number;
  percentUntouched: number;
  totalChangePercent: number;
}

export interface ComplexityMetrics {
  avgWordsPerEdit: number;
  maxConsecutiveEdits: number;
  editDensity: number;
  fragmentationScore: number;
  punctuationOnlyEdits?: number;
}

export interface TimeEstimates {
  minutesToImplement: number;
  minutesToReview: number;
  totalMinutes: number;
  confidenceLevel: 'high' | 'medium' | 'low';
}

export type BurdenLevel = 'minimal' | 'light' | 'moderate' | 'heavy' | 'extensive';
export type FeasibilityLevel = 'trivial' | 'easy' | 'manageable' | 'challenging' | 'prohibitive';

export interface BurdenAssessment {
  burden: BurdenLevel;
  feasibility: FeasibilityLevel;
  recommendation: string;
  warning?: string;
}

export interface EditBurden {
  candidateId: string;
  metrics: BurdenMetrics;
  complexity: ComplexityMetrics;
  timeEstimates: TimeEstimates;
  editsByType: {
    contextBridges: EditSpan[];
    spoilerFixes: EditSpan[];
    continuityPatches: EditSpan[];
    optionalEnhancements: EditSpan[];
  };
  assessment: BurdenAssessment;
}

export type EditBurdenCalculator = (
  candidate: OpeningCandidate,
  spoiler: SpoilerAnalysis,
  context: ContextAnalysis,
  scenes: { id: string; wordCount: number }[]
) => EditBurden;
