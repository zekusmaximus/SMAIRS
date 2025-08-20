// Spoiler detection related domain types (Phase 1 implementation)
// Lightweight, keeps parity with manuscript feature style (no external deps)

import type { Reveal } from '../src/features/manuscript/types.js';

// Minimal text anchor (can be enhanced later to integrate richer anchoring tiers)
export interface TextAnchor {
  sceneId: string;
  offset: number; // character offset within scene text
  length: number; // length of quoted segment
}

export interface FixSuggestion {
  type: 'replace' | 'delete' | 'insert';
  original: string; // original token/phrase (empty for insert)
  suggested: string; // replacement (empty for delete)
  reason: string; // human readable explanation
}

export interface SpoilerViolation {
  revealId: string;
  revealDescription: string;
  mentionedIn: {
    sceneId: string;
    anchor: TextAnchor;
    quotedText: string;
  };
  properIntroduction: {
    sceneId: string; // scene id where reveal first appears in original ordering
    sceneIndex: number; // index in original chronological ordering
  };
  severity: 'critical' | 'moderate' | 'minor';
  spoiledDependencies: string[]; // downstream reveals this might invalidate
  fix: FixSuggestion;
  missingPrerequisites: string[]; // ids of prereqs absent at time of mention
  reveal: Reveal; // pass-through convenience (may help UI/tests) – non-serialized optional usage
}

export interface MissingContext {
  entityType: 'character' | 'location' | 'object' | 'event';
  identifier: string;
  firstMention: TextAnchor;
  requiredContext: string[];
  sugggestedBridge: string;
  insertionPoint: TextAnchor;
}

export interface SpoilerAnalysis {
  candidateId: string;
  violations: SpoilerViolation[];
  missingPrerequisites: MissingContext[];
  safeReveals: string[]; // reveal ids properly introduced before usage
  totalSeverityScore: number; // weighted sum for ranking (critical=5, moderate=2, minor=1)
}

export interface SpoilerCell {
  sceneId: string;
  severity: number; // 0..1 normalized severity
  violations: string[]; // reveal ids
  color: string; // hex color for visualization
}

export interface SpoilerHeatmap {
  candidateId: string;
  grid: SpoilerCell[][]; // rows: scenes (in reordered candidate reading order); columns: consolidated reveals by order of first appearance
  legend: Map<string, string>;
}

export type Severity = 'critical' | 'moderate' | 'minor';
