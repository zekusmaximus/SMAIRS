// src/features/llm/bridge-generator.ts
// AI-driven bridge paragraph generation with style analysis and quality scoring.

import { z } from 'zod';
import type { TextAnchor } from '../../../types/spoiler-types.js';
import type { BridgeRequirement } from './revision-orchestrator.js';
import { globalProviderAdapter } from './provider-adapter.js';
import { globalLLMCache } from './cache-manager.js';

// --- Public Types ----------------------------------------------------------

export interface StyleProfile {
  sentenceLength: { mean: number; stddev: number };
  vocabulary: {
    complexity: number; // 1-10 scale
    commonWords: string[];
    distinctPhrases: string[];
  };
  tone: 'formal' | 'casual' | 'literary' | 'conversational';
  pov: 'first' | 'third-limited' | 'third-omniscient';
  tensePrimary: 'past' | 'present';
  paragraphLength: { mean: number; stddev: number };
}

export interface BridgeDraft {
  requirement: BridgeRequirement;
  text: string;
  wordCount: number;
  confidence: number;
  insertionAnchor: TextAnchor;
  alternates: string[];
  styleMatch: number; // 0-1
}

// Internal superset for optional fields that may not exist on BridgeRequirement today.
type RichRequirement = BridgeRequirement & { missingInfo?: string[]; type?: string; maxWords?: number };

// --- Schemas --------------------------------------------------------------

const StyleProfileSchema = z.object({
  sentenceLength: z.object({ mean: z.number(), stddev: z.number() }),
  vocabulary: z.object({ complexity: z.number(), commonWords: z.array(z.string()).default([]), distinctPhrases: z.array(z.string()).default([]) }),
  tone: z.enum(['formal', 'casual', 'literary', 'conversational']),
  pov: z.enum(['first', 'third-limited', 'third-omniscient']),
  tensePrimary: z.enum(['past', 'present']),
  paragraphLength: z.object({ mean: z.number(), stddev: z.number() }),
});

const BridgeVariationsSchema = z.object({ variations: z.array(z.string()) });
const StyleScoreSchema = z.object({ score: z.number().min(0).max(1), explanation: z.string().optional() });

// --- Utilities ------------------------------------------------------------

function fnv32(str: string): string { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
async function hashManuscript(text: string): Promise<string> { return fnv32(text); }

function wordsCount(s: string): number { return s.trim().split(/\s+/).filter(Boolean).length; }

function deriveMissingInfo(req: BridgeRequirement): string[] {
  const t = (req as { text?: string }).text || '';
  if (!t) return [];
  const sentences = t.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  return sentences.slice(0, 3);
}

function buildPromptForVariations(req: RichRequirement, context: { before: string; after: string }, style: StyleProfile): string {
  const missing = (req.missingInfo && req.missingInfo.length ? req.missingInfo : deriveMissingInfo(req)) || [];
  const kind = req.type || 'context';
  const maxWords = req.maxWords || 80;
  return `Context before insertion: "${context.before.slice(-200)}"\nContext after insertion: "${context.after.slice(0, 200)}"\n\nGenerate a bridge paragraph that:\n- Introduces: ${missing.join(', ')}\n- Type: ${kind}\n- Max words: ${maxWords}\n- Style: ${JSON.stringify(style)}\n\nGenerate 3 variations maintaining the author's voice.`;
}

// --- Bridge Generator -----------------------------------------------------

export class BridgeGenerator {
  private styleCache = new Map<string, StyleProfile>();

  async analyzeStyle(manuscript: string): Promise<StyleProfile> {
    const cacheKey = await hashManuscript(manuscript);
    const existing = this.styleCache.get(cacheKey);
    if (existing) return existing;
    const cacheKeyLLM = 'style:' + globalLLMCache.generateCacheKey('FAST_ITERATE', { k: cacheKey });
    const profile = await globalLLMCache.getOrCompute(cacheKeyLLM, async () => {
      const result = await globalProviderAdapter.executeWithFallback<typeof StyleProfileSchema._type>('FAST_ITERATE', {
        system: 'Analyze the writing style of this manuscript.',
        prompt: `Analyze style for: ${manuscript.slice(0, 5000)}...`,
        schema: StyleProfileSchema,
        profile: 'FAST_ITERATE',
        temperature: 0.2,
      });
      const parsed = StyleProfileSchema.safeParse(result.json);
      if (parsed.success) return parsed.data;
      // Conservative fallback
      return {
        sentenceLength: { mean: 16, stddev: 6 },
        vocabulary: { complexity: 5, commonWords: [], distinctPhrases: [] },
        tone: 'literary',
        pov: 'third-limited',
        tensePrimary: 'past',
        paragraphLength: { mean: 90, stddev: 40 },
      } satisfies StyleProfile;
    }, { maxAgeMs: 6 * 60 * 60 * 1000, staleAfterMs: 3 * 60 * 60 * 1000, revalidateAfterMs: 30 * 60 * 1000 });
    this.styleCache.set(cacheKey, profile);
    return profile;
  }

  async generateBridge(
    requirement: BridgeRequirement,
    context: { before: string; after: string },
    style: StyleProfile
  ): Promise<BridgeDraft> {
    const prompt = buildPromptForVariations(requirement as RichRequirement, context, style);
    const result = await globalProviderAdapter.executeWithFallback<typeof BridgeVariationsSchema._type>('FAST_ITERATE', {
      prompt,
      temperature: 0.8,
      schema: BridgeVariationsSchema,
      profile: 'FAST_ITERATE',
    });
    const variations = (result.json && (result.json as unknown as { variations: string[] }).variations) ||
      (result.text ? result.text.split(/\n+/).slice(0, 3) : []);
    const limited = variations.slice(0, 3).filter(Boolean);
    const scored = await Promise.all(
      limited.map(async v => ({ text: v, score: await this.scoreStyleMatch(v, style) }))
    );
    const best = scored.reduce((a, b) => (a.score >= b.score ? a : b), { text: limited[0] || '', score: 0 });
    const alternates = limited.filter(v => v !== best.text);
    return {
      requirement,
      text: best.text,
      wordCount: wordsCount(best.text),
      confidence: best.score,
      insertionAnchor: requirement.insertPoint,
      alternates,
      styleMatch: best.score,
    };
  }

  async optimizeLength(bridge: BridgeDraft, targetWords: number): Promise<BridgeDraft> {
    const wc = bridge.wordCount;
    if (wc === targetWords) return bridge;
    const directive = wc > targetWords ? `Condense to ~${targetWords} words, keep tone and key facts.` : `Expand slightly to ~${targetWords} words without adding new facts.`;
    const prompt = `${directive}\n\nOriginal:\n${bridge.text}`;
    const res = await globalProviderAdapter.executeWithFallback('FAST_ITERATE', { prompt, temperature: 0.5, profile: 'FAST_ITERATE' });
    const revised = res.text && res.text.length > 0 ? res.text.trim() : bridge.text;
    const updated: BridgeDraft = { ...bridge, text: revised, wordCount: wordsCount(revised) };
    // Re-score style match
    updated.styleMatch = await this.scoreStyleMatch(updated.text, await this.analyzeStyle(updated.text));
    updated.confidence = Math.min(1, Math.max(0, updated.styleMatch));
    return updated;
  }

  async scoreStyleMatch(text: string, style: StyleProfile): Promise<number> {
    const result = await globalProviderAdapter.executeWithFallback<typeof StyleScoreSchema._type>('JUDGE_SCORER', {
      prompt: `Score how well this text matches the style profile:\nText: "${text}"\nTarget style: ${JSON.stringify(style)}\nReturn a score 0-1 and explanation.`,
      schema: StyleScoreSchema,
      profile: 'JUDGE_SCORER',
      temperature: 0.2,
    });
    const parsed = StyleScoreSchema.safeParse(result.json);
    if (parsed.success) return parsed.data.score;
    // Fallback to heuristic: lexical overlap with distinct phrases
    const phrases = (style.vocabulary?.distinctPhrases || []).map(p => p.toLowerCase());
    const lower = text.toLowerCase();
    const overlap = phrases.length ? phrases.filter(p => lower.includes(p)).length / phrases.length : 0.5;
    return Math.max(0, Math.min(1, 0.5 + overlap * 0.5));
  }
}

export default { BridgeGenerator };
