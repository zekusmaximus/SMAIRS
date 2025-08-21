// Edit burden calculation orchestrator
import type { OpeningCandidate } from './opening-candidates.js';
import type { SpoilerAnalysis } from '../../../types/spoiler-types.js';
import type { ContextAnalysis } from './context-analyzer.js';
import type { EditSpan, EditBurden, BurdenMetrics, ComplexityMetrics, BurdenAssessment, BurdenLevel, FeasibilityLevel } from '../../../types/burden-types.js';
import { consolidateEdits, countWords } from './edit-consolidation.js';
import { estimateTime } from './time-estimation.js';

// ---------------- Collection ---------------------------------------------

type Severity = 'critical' | 'moderate' | 'minor';

function severityToPriority(sev: Severity): EditSpan['priority'] {
  if (sev === 'critical') return 'critical';
  if (sev === 'moderate') return 'important';
  return 'optional';
}

function calculateWordDelta(fix: { type: 'insert'|'delete'|'replace'; original: string; suggested: string }): number {
  const originalWords = countWords(fix.original);
  const suggestedWords = countWords(fix.suggested);
  if (fix.type === 'insert') return suggestedWords;
  if (fix.type === 'delete') return -originalWords;
  if (fix.type === 'replace') return suggestedWords - originalWords;
  return 0;
}

export function collectAllEdits(spoilers: SpoilerAnalysis, context: ContextAnalysis): EditSpan[] {
  const edits: EditSpan[] = [];
  for (const v of spoilers.violations) {
    edits.push({
      id: `spoiler-${v.revealId}`,
      type: v.fix.type,
      anchor: { ...v.mentionedIn.anchor, position: v.mentionedIn.anchor.offset },
      originalText: v.fix.original,
      newText: v.fix.suggested,
      wordDelta: calculateWordDelta(v.fix),
      priority: severityToPriority(v.severity),
      reason: v.fix.reason,
    });
  }
  for (const g of context.gaps) {
    edits.push({
      id: `context-${g.id}`,
      type: 'insert',
      anchor: { ...g.bridge.insertPoint, position: g.bridge.insertPoint.offset },
      newText: g.bridge.text,
      wordDelta: g.requiredInfo.wordCount,
      priority: severityToPriority(g.confusion.severity === 'high' ? 'critical' : g.confusion.severity === 'medium' ? 'moderate' : 'minor'),
      reason: `Add context for ${g.entity.name}`,
    });
  }
  return edits;
}

// Overlap + adjacency checks reused from consolidation module
export { consolidateEdits } from './edit-consolidation.js';

// ---------------- Metrics -------------------------------------------------

export function calculateMetrics(edits: EditSpan[], candidate: { totalWords: number }): BurdenMetrics {
  const originalWords = candidate.totalWords || 1;
  let addedWords = 0, deletedWords = 0, modifiedWords = 0;
  for (const e of edits) {
    switch (e.type) {
      case 'insert': addedWords += e.wordDelta; break;
      case 'delete': deletedWords += Math.abs(e.wordDelta); break;
      case 'replace': {
        const orig = countWords(e.originalText);
        const repl = countWords(e.newText);
        modifiedWords += orig;
        if (repl > orig) addedWords += repl - orig; else if (repl < orig) deletedWords += orig - repl;
        break;
      }
    }
  }
  const affectedWords = addedWords + deletedWords + modifiedWords;
  const affectedSpans = edits.length;
  const percentAdded = addedWords / originalWords * 100;
  const percentDeleted = deletedWords / originalWords * 100;
  const percentModified = modifiedWords / originalWords * 100;
  let totalChangePercent = affectedWords / originalWords * 100;
  if (totalChangePercent > 100) totalChangePercent = 100; // cap per edge case
  const percentUntouched = Math.max(0, 100 - totalChangePercent);
  return { originalWords, addedWords, deletedWords, modifiedWords, affectedSpans, percentAdded, percentDeleted, percentModified, percentUntouched, totalChangePercent };
}

// ---------------- Complexity ---------------------------------------------

function findMaxConsecutive(edits: EditSpan[]): number {
  if (!edits.length) return 0;
  const sorted = edits.slice().sort((a,b)=> (a.anchor?.position ?? 0) - (b.anchor?.position ?? 0));
  let maxChain = 1, chain = 1;
  for (let i=1;i<sorted.length;i++) {
    const prev = sorted[i-1]; const cur = sorted[i];
    if (!prev || !cur) continue;
    if ((cur.anchor?.position ?? 0) - (prev.anchor?.position ?? 0) < 50) { // within 50 chars counts as consecutive cluster
      chain++;
      if (chain > maxChain) maxChain = chain;
    } else chain = 1;
  }
  return maxChain;
}

export function calculateFragmentation(edits: EditSpan[], candidate: { totalWords: number }): number {
  if (edits.length <= 1) return 0;
  const sorted = edits.slice().sort((a,b)=> (a.anchor?.position ?? 0) - (b.anchor?.position ?? 0));
  const distances: number[] = [];
  for (let i=1;i<sorted.length;i++) {
    const cur = sorted[i]; const prev = sorted[i-1];
    if (!cur || !prev) continue;
    distances.push(((cur.anchor?.position ?? 0) - (prev.anchor?.position ?? 0)));
  }
  const avg = distances.reduce((a,b)=> a+b,0)/distances.length;
  const variance = distances.reduce((a,d)=> a + Math.pow(d-avg,2),0) / distances.length;
  const maxPossibleVariance = Math.pow(candidate.totalWords,2);
  return Math.min(1, variance / maxPossibleVariance);
}

export function analyzeComplexity(edits: EditSpan[], candidate: { totalWords: number }): ComplexityMetrics {
  const totalEditWords = edits.reduce((s,e)=> s + Math.abs(e.wordDelta), 0) || 0;
  const avgWordsPerEdit = totalEditWords / Math.max(1, edits.length);
  const maxConsecutiveEdits = findMaxConsecutive(edits);
  const editDensity = edits.length / Math.max(1, candidate.totalWords) * 1000;
  const fragmentationScore = calculateFragmentation(edits, candidate);
  const punctuationOnlyEdits = edits.filter(e => e.type === 'replace' && e.wordDelta === 0 && countWords(e.originalText) === 0 && countWords(e.newText) === 0).length;
  return { avgWordsPerEdit, maxConsecutiveEdits, editDensity, fragmentationScore, punctuationOnlyEdits };
}

// ---------------- Assessment --------------------------------------------

export function assessBurden(metrics: Partial<BurdenMetrics> & { totalChangePercent?: number; affectedSpans?: number }, complexity: Partial<ComplexityMetrics> & { fragmentationScore?: number }): BurdenAssessment {
  const totalChangePercent = metrics.totalChangePercent ?? 0;
  let burden: BurdenLevel;
  if (totalChangePercent < 3) burden = 'minimal';
  else if (totalChangePercent < 7) burden = 'light';
  else if (totalChangePercent < 12) burden = 'moderate';
  else if (totalChangePercent < 20) burden = 'heavy';
  else burden = 'extensive';

  const frag = complexity.fragmentationScore ?? 0;
  const score = totalChangePercent + frag * 10;
  let feasibility: FeasibilityLevel;
  if (score < 5) feasibility = 'trivial';
  else if (score < 10) feasibility = 'easy';
  else if (score < 17) feasibility = 'manageable';
  else if (score < 27) feasibility = 'challenging';
  else feasibility = 'prohibitive';

  const recommendation = generateRecommendation(burden, feasibility, metrics as BurdenMetrics);
  return { burden, feasibility, recommendation };
}

export function generateRecommendation(burden: BurdenLevel, feasibility: FeasibilityLevel, metrics: Partial<BurdenMetrics> & { affectedSpans?: number; totalChangePercent?: number; addedWords?: number; modifiedWords?: number }): string {
  const affectedSpans = metrics.affectedSpans ?? 0;
  const pct = metrics.totalChangePercent ?? 0;
  const added = metrics.addedWords ?? 0;
  const modified = metrics.modifiedWords ?? 0;
  if (burden === 'minimal' && feasibility === 'trivial') return `Excellent candidate. Only ${affectedSpans} minor edits needed (${pct.toFixed(1)}% change). Implementation time: under 30 minutes.`;
  if (burden === 'light' && feasibility === 'easy') return `Strong candidate. ${added} words of context needed, ${modified} words to revise. Approximately 1 hour of work.`;
  if (burden === 'moderate' && feasibility === 'manageable') return `Viable candidate with effort. Requires ${affectedSpans} edits affecting ${pct.toFixed(1)}% of text. Allow 2-3 hours for implementation.`;
  if (feasibility === 'challenging' || feasibility === 'prohibitive') return `High-effort candidate. ${pct.toFixed(1)}% of opening requires revision with ${affectedSpans} separate edits. Consider if benefits justify ${Math.round(pct / 3)} hours of work.`;
  return `Standard revision load: ${burden} burden, ${feasibility} implementation.`;
}

// ---------------- Categorization ----------------------------------------

function categorizeEdits(edits: EditSpan[]) {
  return {
    contextBridges: edits.filter(e => e.id?.startsWith('context-')),
    spoilerFixes: edits.filter(e => e.id?.startsWith('spoiler-')),
    continuityPatches: [],
    optionalEnhancements: edits.filter(e => e.priority === 'optional'),
  };
}

// ---------------- Main ---------------------------------------------------

export function calculateEditBurden(candidate: OpeningCandidate, spoilerAnalysis: SpoilerAnalysis, contextAnalysis: ContextAnalysis): EditBurden {
  const edits = collectAllEdits(spoilerAnalysis, contextAnalysis);
  const consolidated = consolidateEdits(edits);
  const metrics = calculateMetrics(consolidated, candidate);
  const complexity = analyzeComplexity(consolidated, candidate);
  const timeEstimates = estimateTime(metrics, complexity);
  const editsByType = categorizeEdits(consolidated);
  const assessment = assessBurden(metrics, complexity);
  return { candidateId: candidate.id, metrics, complexity, timeEstimates, editsByType, assessment };
}

export { estimateTime };
export default { calculateEditBurden, collectAllEdits, consolidateEdits, calculateMetrics, analyzeComplexity, estimateTime, assessBurden, calculateFragmentation };
