// Context gap analysis for alternate opening candidates.
// Provides detection of undefined / ambiguous entity references and minimal bridging suggestions.

import type { Scene } from './types.js';
import type { TextAnchor } from '../../../types/spoiler-types.js';
import { sha256 } from './anchoring.js';
import { detectReferences, type EntityReference } from './entity-detector.js';
import { DefaultBridgeGenerator } from './bridge-generator.js';

export interface ContextGapEntity {
  name: string;
  firstReference: TextAnchor;
  referenceType: 'pronoun' | 'definite' | 'possessive' | 'action' | 'comparative';
}

export interface ContextGapConfusion {
  type: 'undefined' | 'ambiguous' | 'assumed_knowledge';
  severity: 'high' | 'medium' | 'low';
  readerQuestion: string;
}

export interface RequiredInfo {
  facts: string[];
  wordCount: number;
  dependencies: string[];
}

export interface ContextBridgeSuggestion {
  text: string;
  insertPoint: TextAnchor;
  intrusiveness: number; // 0..1
}

export interface ContextGap {
  id: string; // stable hash entity+scene
  category: 'character' | 'location' | 'object' | 'event' | 'concept';
  entity: ContextGapEntity;
  confusion: ContextGapConfusion;
  requiredInfo: RequiredInfo;
  bridge: ContextBridgeSuggestion;
}

export interface ContextAnalysis {
  candidateId: string;
  gaps: ContextGap[];
  totalWordCount: number;
  criticalGaps: number;
  contextScore: number; // 0-1 higher = more complete
}

// --- Reference requirement analysis -------------------------------------------------

interface EntityIntro { name: string; sceneIndex: number; anchor: TextAnchor; facts: string[]; }

export function analyzeRequiredContext(ref: EntityReference, originalScenes: Scene[], candidateStart: number): RequiredInfo {
  const intro = findEntityIntroduction(ref.name, originalScenes);
  if (!intro || intro.sceneIndex >= candidateStart) {
    return generateMinimalContext(ref);
  }
  // Leverage existing facts; choose minimal subset based on reference type.
  const minimal = selectMinimalFacts(intro.facts, ref.referenceType);
  return { facts: minimal, wordCount: estimateWordCount(minimal), dependencies: [] };
}

function findEntityIntroduction(name: string, scenes: Scene[]): EntityIntro | null {
  const lower = name.toLowerCase();
  for (let i = 0; i < scenes.length; i++) {
  const sc = scenes[i];
  if (!sc) continue; // defensive under noUncheckedIndexedAccess
  const idx = sc.text.toLowerCase().indexOf(lower);
    if (idx !== -1) {
      return { name, sceneIndex: i, anchor: { sceneId: sc.id, offset: idx, length: name.length }, facts: extractEntityFacts(sc, name) };
    }
  }
  return null;
}

function extractEntityFacts(scene: Scene, name: string): string[] {
  // Naive heuristics: gather sentences containing the name with 'is/was/has/had'
  const sentences = scene.text.split(/(?<=[.!?])\s+/);
  const facts: string[] = [];
  for (const s of sentences) {
    if (s.includes(name) && /\b(is|was|has|had|can|could)\b/.test(s)) {
      // Shorten
      facts.push(s.trim().replace(/[\n\r]/g,' ').slice(0, 120));
    }
    if (facts.length >= 3) break;
  }
  return facts;
}

function selectMinimalFacts(all: string[], refType: EntityReference['referenceType']): string[] {
  if (!all.length) return [];
  if (refType === 'pronoun') return all.slice(0,1);
  if (refType === 'definite') return all.slice(0,2);
  return all.slice(0,2);
}

function estimateWordCount(facts: string[]): number {
  return facts.join(' ').split(/\s+/).filter(Boolean).length;
}

function inferRole(context: string): string {
  if (/\bexplosives?\b/i.test(context)) return 'demolitions expert';
  if (/\bchief|leader|captain\b/i.test(context)) return 'team leader';
  if (/\bdoctor|dr\.\b/i.test(context)) return 'doctor';
  return 'operative';
}
function inferRelationship(): string | undefined { return undefined; }
function inferLocationType(context: string): string {
  if (/\blab|laboratory\b/i.test(context)) return 'research facility';
  if (/\bwarehouse\b/i.test(context)) return 'storage site';
  return 'location';
}
function inferLocationPurpose(): string | undefined { return undefined; }

export function generateMinimalContext(ref: EntityReference): RequiredInfo {
  if (ref.category === 'character') {
    const role = inferRole(ref.context);
  const rel = inferRelationship();
    const facts = [`${ref.name} is a ${role}`];
    if (rel) facts.push(rel);
    return { facts, wordCount: 10, dependencies: [] };
  }
  if (ref.category === 'location') {
    const type = inferLocationType(ref.context);
  const purpose = inferLocationPurpose();
    const facts = [`The ${ref.name.replace(/^the\s+/i,'')} is a ${type}`];
    if (purpose) facts.push(purpose);
    return { facts, wordCount: 12, dependencies: [] };
  }
  // Fallback
  return { facts: [`${ref.name} is introduced`], wordCount: 6, dependencies: [] };
}

// --- Gap construction ----------------------------------------------------

function readerQuestionFor(ref: EntityReference, confusionType: ContextGapConfusion['type']): string {
  if (ref.referenceType === 'pronoun') return 'Who is ' + ref.name + '?';
  if (confusionType === 'assumed_knowledge' && /^the /i.test(ref.name)) return `What ${ref.name.replace(/^the\s+/i,'')}?`;
  return `Who or what is ${ref.name}?`;
}

export function calculateConfusionSeverity(gap: ContextGap): 'high' | 'medium' | 'low' {
  const { entity, confusion, requiredInfo } = gap;
  if (entity.referenceType === 'pronoun') return 'high';
  if (confusion.type === 'undefined' && requiredInfo.facts.length > 2) return 'high';
  if (/^(the|this|that)\s/i.test(entity.name) && confusion.type !== 'assumed_knowledge') return 'high';
  if (gap.category === 'location' && confusion.type === 'ambiguous') return 'medium';
  if (requiredInfo.wordCount > 20) return 'medium';
  return 'low';
}

export function calculateContextScore(analysis: { gaps: { confusion: { severity: 'high'|'medium'|'low' } }[]; totalWordCount: number }): number {
  let score = 1.0;
  const weights = { high: 0.15, medium: 0.08, low: 0.03 } as const;
  for (const g of analysis.gaps) score -= weights[g.confusion.severity];
  if (analysis.gaps.length === 0) score = 1.0; // removed small-bridge bonus to align with spec tests
  return Math.max(0, Math.min(1, score));
}

// Public: analyze a single scene as if it were the starting candidate.
export function analyzeContext(scene: Scene, originalScenes: Scene[], candidateStart: number): ContextGap[] {
  const refs = detectReferences(scene);
  const gaps: ContextGap[] = [];
  const introduced = new Set<string>();
  for (const ref of refs) {
    const canonical = ref.canonical;
    const previously = introduced.has(canonical) || (candidateStart > 0 && originalScenes.slice(0, candidateStart).some(s => s.text.toLowerCase().includes(canonical)));
    // Determine confusion type
    let confusionType: ContextGapConfusion['type'] = 'undefined';
    if (/^the /i.test(ref.name) && !previously) confusionType = 'assumed_knowledge';
  if (previously) continue; // if genuinely introduced earlier in chronology
    const requiredInfo = analyzeRequiredContext(ref, originalScenes, candidateStart);
    const gap: ContextGap = {
      id: sha256(scene.id + ':' + ref.name + ':' + ref.anchor.offset),
      category: ref.category,
      entity: { name: ref.name, firstReference: ref.anchor, referenceType: ref.referenceType },
      confusion: { type: confusionType, severity: 'low', readerQuestion: readerQuestionFor(ref, confusionType) },
      requiredInfo,
      bridge: { text: '', insertPoint: ref.anchor, intrusiveness: 0 }
    };
    gap.confusion.severity = calculateConfusionSeverity(gap);
    const bridge = DefaultBridgeGenerator.generateBridge(gap);
    gap.bridge = { text: bridge.text, insertPoint: bridge.insertPoint || ref.anchor, intrusiveness: bridge.intrusiveness };
    gaps.push(gap);
    introduced.add(canonical);
  }
  return gaps;
}

export function analyzeCandidateContext(candidateId: string, scenes: Scene[], originalScenes: Scene[], candidateStartIndex: number): ContextAnalysis {
  const firstScene = scenes[0];
  if (!firstScene) return { candidateId, gaps: [], totalWordCount: 0, criticalGaps: 0, contextScore: 1 };
  const gaps = analyzeContext(firstScene, originalScenes, candidateStartIndex);
  const totalWordCount = gaps.reduce((a,g)=> a + g.requiredInfo.wordCount, 0);
  const criticalGaps = gaps.filter(g => g.confusion.severity === 'high').length;
  const contextScore = calculateContextScore({ gaps, totalWordCount });
  return { candidateId, gaps, totalWordCount, criticalGaps, contextScore };
}

export default { analyzeContext, analyzeCandidateContext };
