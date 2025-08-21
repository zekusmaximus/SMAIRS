import type { BurdenMetrics, ComplexityMetrics, TimeEstimates } from '../../../types/burden-types.js';

export function estimateTime(metrics: Partial<BurdenMetrics> & { addedWords?: number; modifiedWords?: number; deletedWords?: number; originalWords?: number; totalChangePercent?: number }, complexity: Partial<ComplexityMetrics> & { fragmentationScore?: number; avgWordsPerEdit?: number; maxConsecutiveEdits?: number }): TimeEstimates {
  const added = metrics.addedWords || 0;
  const modified = metrics.modifiedWords || 0;
  const deleted = metrics.deletedWords || 0;
  const original = metrics.originalWords || 1;
  const totalChangePercent = metrics.totalChangePercent ?? ((added + deleted + modified) / original * 100);
  const fragmentationScore = complexity.fragmentationScore ?? 0;
  const maxConsecutive = complexity.maxConsecutiveEdits ?? 0;
  const affectedSpans = (metrics as Partial<BurdenMetrics>).affectedSpans ?? 1;
  const avgWordsPerEdit = complexity.avgWordsPerEdit ?? (added + modified + deleted) / Math.max(1, affectedSpans);

  const WRITING_SPEED = 250; // wph new
  const EDITING_SPEED = 500; // wph revise/remove
  const REVIEW_SPEED = 1000; // wph review

  const writingMinutes = (added / WRITING_SPEED) * 60;
  const editingMinutes = (modified / EDITING_SPEED) * 60;
  const deletionMinutes = (deleted / EDITING_SPEED) * 60 * 0.5; // faster

  let complexityMultiplier = 1.0;
  if (fragmentationScore > 0.7) complexityMultiplier += 0.3;
  if (maxConsecutive > 5) complexityMultiplier += 0.2;
  if (avgWordsPerEdit < 5) complexityMultiplier += 0.2;

  const implement = (writingMinutes + editingMinutes + deletionMinutes) * complexityMultiplier;
  const review = (original / REVIEW_SPEED) * 60;

  let confidence: TimeEstimates['confidenceLevel'];
  if (totalChangePercent < 5) confidence = 'high';
  else if (totalChangePercent < 15) confidence = 'medium';
  else confidence = 'low';

  return {
    minutesToImplement: Math.round(implement),
    minutesToReview: Math.round(review),
    totalMinutes: Math.round(implement + review),
    confidenceLevel: confidence,
  };
}

export default { estimateTime };
