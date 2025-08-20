// Missing context detection (Phase 1 stub)
// Full algorithm can be expanded; initial version returns empty to keep integration stable.

import type { MissingContext } from '../../../types/spoiler-types.js';
import type { OpeningCandidate } from './opening-candidates.js';
import type { Scene } from './types.js';

export function detectMissingContext(candidate: OpeningCandidate, originalOpening: Scene[], allScenes: Scene[]): MissingContext[] {
  void candidate; void originalOpening; void allScenes; // placeholder
  return [];
}

export default { detectMissingContext };
