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
  const NAME_WORD = "(?:[A-Z][a-z]+(?:['’][A-Z][a-z]+)?)"; // basic capitalized word with optional O' prefix pattern
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
    // Heuristic: ignore sentence-start capitalized common words (e.g., "The", "A") if alone
    if (words.length === 1 && /^(The|A|And|But|For|Yet|So)$/.test(full)) continue;
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

  const chars = extractCharacters(scene);
  const charSet = new Set(chars);

  // Pattern 1: Name is X
  // We allow simple trailing clause until punctuation (.,;!? newline) — keep concise.
    const nameIsRe = /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})\s+is\s+([^.\n;!?]{1,80})/g;
  let m: RegExpExecArray | null;
  while ((m = nameIsRe.exec(text)) !== null) {
    const gName = m[1];
    const gRhs = m[2];
    if (!gName || !gRhs) continue;
    const name = gName.trim();
    const rhsRaw = gRhs.trim();
    if (!name || !rhsRaw) continue;
    // Require that name is recognized as a character OR is multi-word (to reduce false positives on sentence starts)
    if (!(charSet.has(name) || name.includes(" "))) continue;
      const rhs = rhsRaw.replace(/\s+/g, ' ').replace(/[,-]+$/, '').trim();
    if (!rhs) continue;
    const desc = `${name} is ${rhs}`;
    if (!descriptions.has(desc)) {
      descriptions.add(desc);
      reveals.push({ id: sha256(desc), description: desc });
    }
  }

  // Pattern 2: the <noun> is engineered (explicit requirement)
  const theEngineeredRe = /\bthe\s+([a-z]+)\s+is\s+engineered\b/gi;
  while ((m = theEngineeredRe.exec(text)) !== null) {
    const noun = m[1];
    if (!noun) continue;
    const desc = `${noun} is engineered`;
    if (!descriptions.has(desc)) {
      descriptions.add(desc);
      reveals.push({ id: sha256(desc), description: desc });
    }
  }

  return reveals;
}

export default { extractCharacters, extractReveals };
