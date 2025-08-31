// Entity / reference detection for context gap analysis (Phase 2 prototype)
// Lightweight heuristics only – no external dependencies.

import type { Scene } from './types.js';
import type { TextAnchor } from '../../../types/spoiler-types.js';

export type EntityCategory = 'character' | 'location' | 'object' | 'event' | 'concept';
export type ReferenceType = 'pronoun' | 'definite' | 'possessive' | 'action' | 'comparative';

export interface EntityReference {
  name: string; // surface form ("Marcus" | "the facility")
  canonical: string; // canonical entity key (lowercased / stripped articles)
  category: EntityCategory;
  referenceType: ReferenceType;
  anchor: TextAnchor; // where encountered
  context: string; // local sentence / span
}

// Generic pronouns that don't imply a specific unresolved antecedent.
const GENERIC_PRONOUNS = new Set(['one', 'someone', 'anyone', 'everyone', 'nobody']);

// Common everyday locations we treat as self-evident.
const COMMON_PLACES = new Set(['home', 'office', 'street', 'room', 'door']);

// Universal / cosmic concepts that rarely need introduction.
const UNIVERSAL_CONCEPTS = new Set(['sun', 'moon', 'sky', 'ground', 'air']);

const PRONOUNS = /(\b)(He|She|They|Him|Her|Them|His|Hers|Their|Theirs|It|Its)(\b)/g; // capitalized start acceptable

export interface PronounRef {
  pronoun: string;
  index: number;
}

export function detectUnresolvedPronouns(text: string): PronounRef[] {
  const refs: PronounRef[] = [];
  if (!text) return refs;
  // We only flag pronouns appearing before any proper noun or named entity sequence.
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0] || text; // first sentence heuristic
  let m: RegExpExecArray | null;
  PRONOUNS.lastIndex = 0;
  while ((m = PRONOUNS.exec(firstSentence)) !== null) {
    const pronoun = m[2];
    if (!pronoun) continue;
    const lower = pronoun.toLowerCase();
    if (GENERIC_PRONOUNS.has(lower)) continue; // skip generic forms
    const idx = m.index + (m[1] ? m[1].length : 0);
    refs.push({ pronoun, index: idx });
  }
  return refs;
}

function buildAnchor(scene: Scene, offset: number, length: number): TextAnchor {
  return { sceneId: scene.id, offset, length };
}

function classifyDefinite(noun: string): EntityCategory {
  if (!noun) return 'concept';
  if (/\b(room|hall|facility|lab|office|street|alley|compound|ship)\b/i.test(noun))
    return 'location';
  if (/\b(team|crew|squad|family)\b/i.test(noun)) return 'concept';
  return 'object';
}

function canonicalize(name: string): string {
  return name.replace(/^(the|a|an)\s+/i, '').toLowerCase();
}

export function detectReferences(
  scene: Scene,
  priorEntities: Set<string> = new Set(),
): EntityReference[] {
  const text = scene.text || '';
  const references: EntityReference[] = [];
  const seenSpans = new Set<string>(); // avoid duplicate anchors for same substring + type

  // Sentence split for local context capturing.
  const sentences = text.split(/(?<=[.!?])\s+/);

  // Pattern 1: Definite articles 'the <word>' (lowercase noun)
  // We keep simple: single noun tokens only to limit noise.
  const definiteRe = /\b[Tt]he\s+([a-z][a-z-]{2,})\b/g; // hyphen inside class does not need escaping unless range
  let m: RegExpExecArray | null;
  definiteRe.lastIndex = 0;
  while ((m = definiteRe.exec(text)) !== null) {
    const whole = m[0];
    const noun = m[1];
    if (!whole || !noun) continue;
    if (COMMON_PLACES.has(noun.toLowerCase()) || UNIVERSAL_CONCEPTS.has(noun.toLowerCase()))
      continue;
    const key = `${m.index}:${whole}`;
    if (seenSpans.has(key)) continue;
    seenSpans.add(key);
    references.push({
      name: `the ${noun}`,
      canonical: canonicalize(noun),
      category: classifyDefinite(noun),
      referenceType: 'definite',
      anchor: buildAnchor(scene, m.index, whole.length),
      context: findSentenceForOffset(sentences, text, m.index),
    });
  }

  // Pattern 2: Possessives "Name's <thing>" basic proper name (capitalized word)
  const possessiveRe = /\b([A-Z][a-z]+)'s\s+([A-Za-z]+)/g;
  possessiveRe.lastIndex = 0;
  while ((m = possessiveRe.exec(text)) !== null) {
    const owner = m[1];
    const thing = m[2];
    if (!owner || !thing) continue;
    const whole = m[0];
    const key = `${m.index}:${whole}`;
    if (seenSpans.has(key)) continue;
    seenSpans.add(key);
    references.push({
      name: owner, // entity is the owner needing intro
      canonical: canonicalize(owner),
      category: 'character',
      referenceType: 'possessive',
      anchor: buildAnchor(scene, m.index, owner.length),
      context: findSentenceForOffset(sentences, text, m.index),
    });
  }

  // Pattern 3: Unresolved pronouns at scene start
  for (const p of detectUnresolvedPronouns(text)) {
    // Simple coreference resolution: if prior entities exist, assume pronoun refers to them
    if (priorEntities.size > 0) continue;
    references.push({
      name: p.pronoun,
      canonical: canonicalize(p.pronoun),
      category: 'character',
      referenceType: 'pronoun',
      anchor: buildAnchor(scene, p.index, p.pronoun.length),
      context: sentences[0] || text.slice(0, 120),
    });
  }

  // Pattern 4: Contextual action verbs implying prior state
  const actionRe = /\b([A-Z][a-z]+)\s+(returned|resumed|continued|finished|stopped)\b/g;
  actionRe.lastIndex = 0;
  while ((m = actionRe.exec(text)) !== null) {
    const captured = m[1];
    if (!captured) continue;
    const name: string = captured;
    const whole = m[0] || name;
    const key = `${m.index}:${whole}`;
    if (seenSpans.has(key)) continue;
    seenSpans.add(key);
    references.push({
      name: name,
      canonical: canonicalize(name),
      category: 'character',
      referenceType: 'action',
      anchor: buildAnchor(scene, m.index, name.length),
      context: findSentenceForOffset(sentences, text, m.index),
    });
  }

  // Pattern 5: Comparatives needing baseline
  const compRe = /\b(more|less|better|worse|faster|slower)\s+than\b/g;
  compRe.lastIndex = 0;
  while ((m = compRe.exec(text)) !== null) {
    const whole = m[0];
    const key = `${m.index}:${whole}`;
    if (seenSpans.has(key)) continue;
    seenSpans.add(key);
    references.push({
      name: whole,
      canonical: canonicalize(whole),
      category: 'concept',
      referenceType: 'comparative',
      anchor: buildAnchor(scene, m.index, whole.length),
      context: findSentenceForOffset(sentences, text, m.index),
    });
  }

  // Pattern 6: Scene-opening proper noun (first capitalized token) as implicit character intro
  if (text) {
    const firstTokenMatch = /^([A-Z][a-z]{2,})\b/.exec(text);
    if (firstTokenMatch) {
      const [, rawToken = ''] = firstTokenMatch; // ensure string
      const token = rawToken;
      if (token && !/^(The|A|An|When|After|Before|During|If|On|At|In|From)$/i.test(token)) {
        const already = references.some((r) => r.anchor.offset === 0 && r.name === token);
        if (!already) {
          references.unshift({
            name: token,
            canonical: canonicalize(token),
            category: 'character',
            referenceType: 'definite',
            anchor: buildAnchor(scene, 0, token.length),
            context: sentences[0] || text.slice(0, 120),
          });
        }
      }
    }
  }

  return references;
}

function findSentenceForOffset(sentences: string[], full: string, offset: number): string {
  let running = 0;
  for (const s of sentences) {
    const start = running;
    running += s.length + 1; // +1 for the split delimiter approximate
    if (offset >= start && offset < running) return s.trim();
  }
  return full.slice(offset, offset + 120);
}

export default { detectReferences };
