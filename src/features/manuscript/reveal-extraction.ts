// src/features/manuscript/reveal-extraction.ts
// Character + simple reveal extraction (Phase 1 prototype)
// Deterministic, pure functions relying only on built-ins.

import type { Scene, Reveal } from "./types.js";
import { sha256 } from "./anchoring.js"; // reuse existing helper for stable ids

/**
 * Extract candidate character names from scene text.
 * Strategy:
 *  - Scan for capitalized tokens / multi-word sequences.
 *  - Allow titles/abbrev segments like Dr., Mr., Mrs., Ms., Prof., St.
 *  - Preserve original casing; de-duplicate while retaining first occurrence order.
 *  - Exclude stop pronouns & pure sentence-start capitalizations that are just first word of sentence if followed by lowercase chain (heuristic kept simple for Phase 1).
 */
export function extractCharacters(scene: Scene): string[] {
  const text = scene.text || "";
  if (!text) return [];

  // Pronoun / exclusion list (lowercase compare)
  const STOP = new Set([
    "he","she","they","them","him","her","his","hers","their","theirs","we","us","our","ours","i","you","your","yours","it","its"
  ]);

  // Regex captures sequences of capitalized words (with optional internal periods) possibly preceded by a title.
  // Examples matched: "Dr. Jane Doe", "Jane", "Jane Doe", "McArthur", "O'Hearn" (partial), "The President" (we may keep single-person roles?)
  // We'll keep sequences of 1-5 tokens each starting capital letter OR known title abbreviations.
  const TITLE = "(?:Dr|Mr|Mrs|Ms|Prof|Sir|Madam|Lady|Lord|St)\\.?";
  // NAME_WORD: capitalized word forms plus explicit allowance for O'Name pattern where leading part is a single 'O'
  // NAME_WORD now supports hyphenated given names (Jean-Luc) and compound surnames (Smith-Jones)
  const NAME_WORD = "(?:Mc[A-Z][a-z]+|O['’][A-Z][a-z]+|[A-Z][a-z]+(?:-[A-Z][a-z]+)?(?:['’][A-Z][a-z]+)?)";
  const CONNECTOR = "(?:\\s+(?:of|the|van|von|de|da|del))?"; // allow small lowercase in middle (rare)
  const PATTERN = new RegExp(`((?:${TITLE}\\s+)?${NAME_WORD}(?:${CONNECTOR}\\s+${NAME_WORD}){0,4})`, 'g');

  const seen = new Set<string>();
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = PATTERN.exec(text)) !== null) {
    const g1 = m[1];
    if (!g1) continue;
    const full = g1.trim();
    if (!full) continue;
    // Split into words to verify at least one core name word (exclude just titles)
    const words = full.split(/\s+/);
    const coreWords = words.filter(w => /[A-Za-z]/.test(w) && !/^Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Prof\.?|Sir|Madam|Lady|Lord|St\.?$/.test(w));
    if (coreWords.length === 0) continue;
    // Exclude if single word pronoun
    if (words.length === 1) {
      const w0 = words[0];
      if (w0 && STOP.has(w0.toLowerCase())) continue;
    }
  // Heuristic: ignore single capitalized word at sentence start if followed by lowercase word and not later reoccurring as a multi-word name
  if (words.length === 1 && /^(The|A|And|But|For|Yet|So|Tomorrow|Today|Meanwhile)$/i.test(full)) continue;
    if (!seen.has(full)) {
      seen.add(full);
      results.push(full);
    }
  }
  return results;
}

/** Simple pattern-based reveal extraction for Phase 1.
 *  Patterns:
 *   1. "Name is trait" where Name is a previously extracted character OR capitalized phrase (first token capitalized).
 *   2. "the <noun> is engineered" style: the <noun> is <verb/adj> (specifically capturing 'engineered' for now per requirement).
 *  Each unique description becomes a Reveal with sha256(description).
 */
export function extractReveals(scene: Scene): Reveal[] {
  const text = scene.text || "";
  if (!text) return [];

  const descriptions = new Set<string>();
  const reveals: Reveal[] = [];
  const push = (desc: string, type: Reveal['type'], entities: string[], confidence = 0.9) => {
    if (!desc || descriptions.has(desc)) return;
    descriptions.add(desc);
    reveals.push({ id: sha256(desc), description: desc, type, confidence, entities, sceneId: scene.id });
  };

  // Pre-capture candidate entities (characters + salient nouns later)
  const chars = extractCharacters(scene);
  const charSet = new Set(chars);

  const fast = process.env.SMAIRS_FAST_REVEALS === '1';

  // Utility guards
  const isNegated = (s: string) => /\bnot\b|\bnever\b|\bno longer\b/i.test(s);
  const isQuestion = (s: string) => /\?/.test(s);
  const isHypo = (s: string) => /\bif\b.*\bwere\b/i.test(s);

  // Sentence-wise iteration to reduce false positives
  const sentences = text.split(/(?<=[.!?])\s+/);
  // Performance guard: for very large scenes, only run baseline patterns to maintain throughput.
  const extendedEnabled = scene.wordCount < 1500; // heuristic threshold

  // Precompiled regexes reused across sentences (reduces recompilation overhead)
  const nameIsRe = /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})\s+is\s+([^.;!?]{1,80})/g;
  const theEngineeredRe = /\bthe\s+([a-z]+)\s+is\s+engineered\b/gi;
  const itHasBeenRe = /\bIt has been\s+([^,.!?]{1,40})\s+since\s+([^,.!?]{1,60})/gi;
  const happenedAgoRe = /\b([A-Z]?[a-z]+(?:\s+[A-Z]?[a-z]+){0,4})\s+happened\s+([0-9]+\s+\w+\s+ago)/gi;
  const inTimeRe = /\bIn\s+([0-9]{3,4}|the\s+\w+)?,?\s+([^,.!?]{3,80})/g;
  const knowsRe = /\b([A-Z][A-Za-z]+)\s+knows\s+([A-Z][A-Za-z]+)/g;
  const andAreRelRe = /\b([A-Z][A-Za-z]+)\s+and\s+([A-Z][A-Za-z]+)\s+are\s+([a-z]+)\b/g;
  const worksWithRe = /\b([A-Z][A-Za-z]+)\s+works\s+(?:for|with)\s+([A-Z][A-Za-z]+)/g;
  const isNowRe = /\b([A-Z][A-Za-z]+)\s+is\s+now\s+([^,.!?]{1,40})/g;
  const movedToRe = /\b([A-Z][A-Za-z]+)\s+moved\s+to\s+([A-Z][A-Za-z]+)\b/g;
  const becameRe = /\b([A-Z][A-Za-z]+)\s+became\s+([^,.!?]{1,40})/g;
  const hasRe = /\b([A-Z][A-Za-z]+)\s+has\s+([^,.!?]{1,60})/g;
  const hadRe = /\b([A-Z][A-Za-z]+)\s+had\s+([^,.!?]{1,60})/g;
  const canRe = /\b([A-Z][A-Za-z]+)\s+can\s+([^,.!?]{1,40})/g;
  const couldRe = /\b([A-Z][A-Za-z]+)\s+could\s+([^,.!?]{1,40})/g;
  const needsRe = /\b([A-Z][A-Za-z]+)\s+(?:must|needs|need to)\s+([^,.!?]{1,50})/g;
  const becauseRe = /\b([^,.!?]{3,60})\s+because\s+([^,.!?]{3,60})/gi;
  const ledToRe = /\b([^,.!?]{3,60})\s+led\s+to\s+([^,.!?]{3,60})/gi;

  for (const sent of sentences) {
    const s = sent.trim();
    if (!s) continue;
    if (isQuestion(s) || isHypo(s)) continue;
    if (isNegated(s)) continue; // conservative: drop negated facts altogether

    // 1. Name is X (character reveal / state)
  let m: RegExpExecArray | null;
  nameIsRe.lastIndex = 0;
    while ((m = nameIsRe.exec(s)) !== null) {
      const name = m[1]?.trim();
      const rhsRaw = m[2]?.trim();
      if (!name || !rhsRaw) continue;
      if (!(charSet.has(name) || name.includes(' '))) continue;
      const rhs = rhsRaw.replace(/\s+/g,' ').replace(/[,'"-]+$/,'').trim();
      if (!rhs) continue;
      const desc = `${name} is ${rhs}`;
      push(desc, 'character', [name]);
    }

    // 2. the <noun> is engineered (plot/world)
  theEngineeredRe.lastIndex = 0;
  while ((m = theEngineeredRe.exec(s)) !== null) {
      const noun = m[1];
      if (noun) push(`${noun} is engineered`, 'world', [noun], 0.95);
    }

    // --- Phase 2 patterns ---
  if (!extendedEnabled || fast) continue;
    // Temporal
  // Temporal patterns
    let tempMatch: RegExpExecArray | null;
  itHasBeenRe.lastIndex = 0;
    while ((tempMatch = itHasBeenRe.exec(s)) !== null) {
      const span = `${tempMatch[1]} since ${tempMatch[2]}`.trim();
  const ent1 = tempMatch[1] ? String(tempMatch[1]) : undefined;
  const ent2 = tempMatch[2] ? String(tempMatch[2]) : undefined;
  const ents: string[] = [];
  if (ent1) ents.push(ent1);
  if (ent2) ents.push(ent2);
  push(`Temporal: ${span}`, 'temporal', ents, 0.8);
    }
  happenedAgoRe.lastIndex = 0;
    while ((tempMatch = happenedAgoRe.exec(s)) !== null) {
  if (tempMatch[1] && tempMatch[2]) push(`Temporal: ${tempMatch[1]} happened ${tempMatch[2]}`, 'temporal', [String(tempMatch[1])], 0.75);
    }
  inTimeRe.lastIndex = 0; // In 1997, X ... / In the morning, X...
    while ((tempMatch = inTimeRe.exec(s)) !== null) {
      const time = tempMatch[1];
      const rest = tempMatch[2];
  if (time && rest) push(`Temporal: ${rest} (in ${time})`, 'temporal', [String(time)], 0.6);
    }

    // Relationship dynamics
  knowsRe.lastIndex = 0;
    while ((m = knowsRe.exec(s)) !== null) {
  if (m[1] && m[2]) push(`${m[1]} knows ${m[2]}`, 'relationship', [String(m[1]), String(m[2])], 0.85);
    }
  andAreRelRe.lastIndex = 0;
    while ((m = andAreRelRe.exec(s)) !== null) {
  if (m[1] && m[2]) push(`${m[1]}-${m[2]} ${m[3]}`, 'relationship', [String(m[1]), String(m[2])], 0.8);
    }
  worksWithRe.lastIndex = 0;
    while ((m = worksWithRe.exec(s)) !== null) {
  if (m[1] && m[2]) push(`${m[1]} works with ${m[2]}`, 'relationship', [String(m[1]), String(m[2])], 0.8);
    }

    // Location / state changes
  isNowRe.lastIndex = 0;
    while ((m = isNowRe.exec(s)) !== null) {
  if (m[1] && m[2]) push(`${m[1]} now ${m[2]}`,'state_change',[String(m[1])],0.85);
    }
  movedToRe.lastIndex = 0;
    while ((m = movedToRe.exec(s)) !== null) {
  if (m[1] && m[2]) push(`${m[1]} at ${m[2]}`,'state_change',[String(m[1]), String(m[2])],0.75);
    }
  becameRe.lastIndex = 0;
    while ((m = becameRe.exec(s)) !== null) {
  if (m[1] && m[2]) push(`${m[1]} became ${m[2]}`,'state_change',[String(m[1])],0.85);
    }

    // Plot facts (possession / capability / requirement)
  hasRe.lastIndex = 0;
    while ((m = hasRe.exec(s)) !== null) {
  if (m[1] && m[2]) push(`${m[1]} has ${m[2]}`,'plot',[String(m[1])],0.7);
    }
  hadRe.lastIndex = 0;
    while ((m = hadRe.exec(s)) !== null) {
  if (m[1] && m[2]) push(`${m[1]} has ${m[2]}`,'plot',[String(m[1])],0.6); // normalize had -> has form
    }
  canRe.lastIndex = 0;
  while ((m = canRe.exec(s)) !== null) if (m[1] && m[2]) push(`${m[1]} can ${m[2]}`,'plot',[String(m[1])],0.8);
  couldRe.lastIndex = 0;
  while ((m = couldRe.exec(s)) !== null) if (m[1] && m[2]) push(`${m[1]} can ${m[2]}`,'plot',[String(m[1])],0.6);
  needsRe.lastIndex = 0;
  while ((m = needsRe.exec(s)) !== null) if (m[1] && m[2]) push(`${m[1]} needs ${m[2]}`,'plot',[String(m[1])],0.7);

    // Causality
  becauseRe.lastIndex = 0;
  while ((m = becauseRe.exec(s)) !== null) {
      if (m[1] && m[2]) {
        const cause = m[2].trim(); const effect = m[1].trim();
        push(`${cause} causes ${effect}`,'plot',[],0.65);
      }
    }
  ledToRe.lastIndex = 0;
  while ((m = ledToRe.exec(s)) !== null) {
      if (m[1] && m[2]) push(`${m[1].trim()} leads to ${m[2].trim()}`,'plot',[],0.65);
    }
  }

  return reveals;
}

// Coreference resolution stub (Phase 2 placeholder)
export function resolveReferences(text: string, knownEntities: Set<string>): Map<string,string> {
  void text; void knownEntities; // placeholder no-op usage to silence unused warnings
  return new Map();
}

export default { extractCharacters, extractReveals };
