// LLM-powered bridge paragraph generator
import type { Scene } from '../manuscript/types.js';
import type { ContextGap } from '../manuscript/context-analyzer.js';
import { globalProviderAdapter } from './provider-adapter.js';
import { StyleAnalyzer, type StyleProfile } from '../manuscript/style-analyzer';
import { DefaultBridgeGenerator } from '../manuscript/bridge-generator.js';
import type { TextAnchor } from '../../../types/spoiler-types.js';
import type { BridgeRequirement } from './revision-orchestrator.js';

type Profile = 'FAST_ITERATE' | 'JUDGE_SCORER';

function readEnv(name: string): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyImportMeta: any = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
  return (anyImportMeta && anyImportMeta[name]) || (typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>)?.[name] : undefined);
}

function isOffline(): boolean { return (readEnv('LLM_OFFLINE') || '0') === '1'; }

export interface BridgeGenerationRequest {
  gap: ContextGap;
  targetScene: Scene;
  originalOpening?: Scene[];
  manuscriptStyle?: StyleProfile;
  maxWords: number;
}

export interface BridgeParagraph {
  text: string;
  wordCount: number;
  insertionPoint: TextAnchor;
  contextCovered: string[];
  styleMatch: number;
  alternatives?: string[];
}

// Bridge draft shape used by revision orchestrator/edit burden
export interface BridgeDraft {
  requirement: BridgeRequirement;
  text: string;
  wordCount: number;
  confidence: number;
  insertionAnchor: TextAnchor;
  alternates: string[];
  styleMatch: number; // 0-1
}

export class BridgeGenerator {
  constructor(
    private llm = globalProviderAdapter,
    private styleAnalyzer = new StyleAnalyzer()
  ) {}

  // Style analysis for orchestrator usage
  async analyzeStyle(manuscript: string): Promise<StyleProfile> {
    return this.styleAnalyzer.analyzeManuscript({ rawText: manuscript } as unknown as { rawText: string });
  }

  // Overloaded: accepts either BridgeGenerationRequest or BridgeRequirement+context+style
  async generateBridge(request: BridgeGenerationRequest): Promise<BridgeParagraph>;
  async generateBridge(requirement: BridgeRequirement, context: { before: string; after: string }, style: StyleProfile): Promise<BridgeDraft>;
  async generateBridge(a: unknown, b?: unknown, c?: unknown): Promise<BridgeParagraph | BridgeDraft> {
    // Branch on shape
    if (typeof a === 'object' && a && 'gap' in (a as Record<string, unknown>)) {
      const request = a as BridgeGenerationRequest;
      // 1. Extract style fingerprint from surrounding text
      const style = await this.extractLocalStyle(request);

      // 2. Build prompt with context and constraints
      const prompt = this.buildBridgePrompt(request, style);

      // 3. Generate via FAST_ITERATE profile
      const offline = isOffline();
      let text: string | null = null;
      let covered: string[] = [];
      if (!offline) {
        try {
          const result = await this.llm.executeWithFallback('FAST_ITERATE' as Profile, {
            prompt,
            temperature: 0.7,
            profile: 'FAST_ITERATE',
          });
          const parsed = this.parseBridgeResponse(result.text, request);
          text = parsed.text;
          covered = parsed.contextCovered;
        } catch {
          text = null;
        }
      }

      // Fallback to deterministic local generator if offline or parsing failed
      if (!text) {
        const local = DefaultBridgeGenerator.generateBridge({
          id: request.gap.id,
          category: request.gap.category,
          entity: request.gap.entity,
          requiredInfo: { facts: request.gap.requiredInfo.facts, wordCount: request.gap.requiredInfo.wordCount },
        });
        text = local.text || '';
        covered = request.gap.requiredInfo.facts.slice(0, 3);
      }

      // Trim to word budget and align POV
      text = this.enforceWordLimit(this.alignPOV(text, style), request.maxWords);

      // Style score
      const bridgeStyle = this.styleAnalyzer.analyzeText(text);
      const baseStyle = request.manuscriptStyle || style;
      const styleMatch = this.styleAnalyzer.compareStyles(baseStyle, bridgeStyle);

      return {
        text,
        wordCount: this.countWords(text),
        insertionPoint: request.gap.entity.firstReference,
        contextCovered: covered,
        styleMatch,
      } as BridgeParagraph;
    }

    // Requirement-based generation (used by RevisionOrchestrator)
    const requirement = a as BridgeRequirement;
    const context = b as { before: string; after: string };
    const style = (c as StyleProfile) || this.styleAnalyzer.analyzeText(context.before + ' ' + context.after);
    const fakeGap = {
      id: 'req:' + requirement.insertPoint.sceneId + ':' + requirement.insertPoint.offset,
      category: 'concept' as const,
      entity: { name: requirement.text.slice(0, 16) || 'context', firstReference: requirement.insertPoint, referenceType: 'definite' },
      requiredInfo: { facts: [requirement.text], wordCount: Math.min(80, Math.max(20, requirement.text.split(/\s+/).length)) },
    } as unknown as ContextGap;
    const scene: Scene = { id: requirement.insertPoint.sceneId, text: context.after, startOffset: 0, endOffset: context.after.length } as unknown as Scene;
    const single = (await this.generateBridge({ gap: fakeGap, targetScene: scene, manuscriptStyle: style, maxWords: Math.max(40, fakeGap.requiredInfo.wordCount) })) as BridgeParagraph;
    const alts = await this.generateMultipleOptions({ gap: fakeGap, targetScene: scene, manuscriptStyle: style, maxWords: Math.max(40, fakeGap.requiredInfo.wordCount) }, 3);
    const styleMatch = this.styleAnalyzer.compareStyles(style, this.styleAnalyzer.analyzeText(single.text));
    return {
      requirement,
      text: single.text,
      wordCount: single.wordCount,
      confidence: Math.max(0.6, styleMatch),
      insertionAnchor: requirement.insertPoint,
      alternates: alts.map(a => a.text).filter(t => t !== single.text),
      styleMatch,
    } as BridgeDraft;
  }

  async generateMultipleOptions(
    request: BridgeGenerationRequest,
    count: number = 3
  ): Promise<BridgeParagraph[]> {
    const style = await this.extractLocalStyle(request);
    const temps = [0.6, 0.85, 1.0].slice(0, count);
    const prompts = temps.map((t, i) => this.buildBridgePrompt(request, style, i));
    const offline = isOffline();

    if (!offline) {
      try {
  const results = await this.llm.executeBatch('FAST_ITERATE' as Profile, prompts.map((p, i) => ({ prompt: p, temperature: temps[i], profile: 'FAST_ITERATE' })));
        const uniques = new Set<string>();
        const bridges: BridgeParagraph[] = [];
        for (const r of results) {
          const parsed = this.parseBridgeResponse(r.text, request);
          const t = this.enforceWordLimit(parsed.text, request.maxWords);
          if (uniques.has(t)) continue;
          uniques.add(t);
          const bridgeStyle = this.styleAnalyzer.analyzeText(t);
          const baseStyle = request.manuscriptStyle || style;
          bridges.push({
            text: t,
            wordCount: this.countWords(t),
            insertionPoint: request.gap.entity.firstReference,
            contextCovered: parsed.contextCovered,
            styleMatch: this.styleAnalyzer.compareStyles(baseStyle, bridgeStyle),
          });
          if (bridges.length >= count) break;
        }
        if (bridges.length) return bridges;
      } catch { /* fall through */ }
    }

    // Offline or failure: produce local diversified variants
  const base = DefaultBridgeGenerator.generateBridge({
      id: request.gap.id,
      category: request.gap.category,
      entity: request.gap.entity,
      requiredInfo: { facts: request.gap.requiredInfo.facts, wordCount: request.gap.requiredInfo.wordCount },
    }).text;
  const variants = this.diversifyLocal(this.alignPOV(base, style), count, style);
    return variants.map((t) => ({
      text: this.enforceWordLimit(t, request.maxWords),
      wordCount: this.countWords(t),
      insertionPoint: request.gap.entity.firstReference,
      contextCovered: request.gap.requiredInfo.facts.slice(0, 3),
      styleMatch: this.styleAnalyzer.compareStyles(request.manuscriptStyle || style, this.styleAnalyzer.analyzeText(t)),
    }));
  }

  private diversifyLocal(text: string, count: number, style: StyleProfile): string[] {
    const transforms: ((s: string) => string)[] = [
      (s) => s,
      (s) => s.replace(/, /g, ' — ').replace(/\./g, '.'),
      (s) => s.replace(/\bjust\b/gi, 'simply'),
      (s) => 'Anyway, ' + s,
      (s) => s.replace(/\bis\b/gi, 'seems'),
      (s) => s.replace(/\bthe\b/gi, 'the very'),
      (s) => s.replace(/\bwas\b/gi, 'had been'),
    ];
    const outs = new Set<string>();
    for (let i = 0; outs.size < count && i < transforms.length * 2; i++) {
      const fn = transforms[i % transforms.length]!;
      const t = fn(text);
      const adjusted = style.avgSentenceLength > 18 ? t.replace(/\.(\s|$)/g, ';$1') : t;
      outs.add(adjusted);
    }
    return Array.from(outs).slice(0, count);
  }

  private alignPOV(text: string, style: StyleProfile): string {
    if (style.pov === 'first') {
      let t = text.trim();
      // Replace leading third-person pronoun with 'I'
      t = t.replace(/^(\s*)(He|She|They)\b/i, '$1I');
      // If no first-person marker present, gently add a leading clause
      if (!/\b(I|my|me|we|our)\b/i.test(t)) {
        t = 'I ' + t.charAt(0).toLowerCase() + t.slice(1);
      }
      return t;
    }
    return text;
  }

  private enforceWordLimit(text: string, maxWords: number): string {
    const words = text.trim().split(/\s+/);
    if (words.length <= maxWords) return text.trim();
    return words.slice(0, maxWords).join(' ').replace(/[\s,;:]+$/, '') + '…';
  }

  private countWords(text: string): number {
    const m = text.trim().match(/\b\w+\b/g);
    return m ? m.length : 0;
  }

  private extractLocalStyle(request: BridgeGenerationRequest): Promise<StyleProfile> {
    const style = request.manuscriptStyle || this.styleAnalyzer.analyzeLocalContext(request.targetScene, 500);
    return Promise.resolve(style);
  }

  private parseBridgeResponse(raw: string, request: BridgeGenerationRequest): { text: string; contextCovered: string[] } {
    // Try to parse JSON block, otherwise use raw
    try {
      const match = raw.match(/\{[\s\S]*\}$/);
      const json = JSON.parse(match ? match[0] : raw);
      const text = String(json.paragraph || json.text || '').trim();
      const covered = Array.isArray(json.contextCovered) ? json.contextCovered.map(String) : [];
      if (text) return { text, contextCovered: covered };
    } catch { /* ignore */ }
    // fallback: use raw and infer coverage from facts
    const facts = request.gap.requiredInfo.facts || [];
    return { text: raw.trim(), contextCovered: facts.slice(0, 3) };
  }

  private buildBridgePrompt(
    request: BridgeGenerationRequest,
    style: StyleProfile,
    variant?: number
  ): string {
    const gapEntities = [request.gap.entity?.name].filter(Boolean) as string[];
    const infoItems = (request.gap.requiredInfo.facts || []).join('\n');
    const targetExcerpt = (request.targetScene?.text || '').slice(0, 500);
    const diversify = variant != null ? `\nPROMPT VARIATION: Option ${variant + 1} with a distinct cadence.` : '';
    return `
You are drafting a brief transitional paragraph to bridge context when starting a manuscript at an alternate opening.${diversify}

CONTEXT GAPS TO ADDRESS:
${gapEntities.map((e) => `- entity: ${e}`).join('\n')}

INFORMATION READER NEEDS:
${infoItems}

TARGET SCENE OPENING (where we're jumping to):
"${targetExcerpt}..."

STYLE TO MATCH:
- POV: ${style.pov}
- Tense: ${style.tense}
- Voice: ${style.voice}
- Typical sentence length: ${style.avgSentenceLength} words

CONSTRAINTS:
- Maximum ${request.maxWords} words
- Must feel natural, not like an info dump
- Should flow seamlessly into the target scene
- Maintain the manuscript's voice and style
- Only provide essential context, not full backstory

Generate a transitional paragraph that provides the missing context while maintaining the story's flow and voice.

OUTPUT FORMAT:
{
  "paragraph": "Your bridge paragraph text here...",
  "contextCovered": ["entity1", "entity2"],
  "wordCount": 47
}
`;
  }
}

export const globalBridgeGenerator = new BridgeGenerator();

// --- Orchestrator-compatible API ----------------------------------------
// Generate a bridge for a BridgeRequirement + context, returning BridgeDraft
export type OrchestratorContext = { before: string; after: string };

// OrchestratorStyle is simply StyleProfile; alias omitted to avoid redundant interface

// Overload signature (kept simple to avoid TS overload complexity across ESM)
export async function generateBridge(
  generator: BridgeGenerator,
  requirement: BridgeRequirement,
  context: OrchestratorContext,
  style: StyleProfile
): Promise<BridgeDraft> {
  // Build a lightweight prompt reusing core builder
  const gapLikeFacts = [requirement.text];
  const fakeGap = {
    id: 'req:' + requirement.insertPoint.sceneId + ':' + requirement.insertPoint.offset,
    category: 'concept' as const,
    entity: { name: 'context', firstReference: requirement.insertPoint, referenceType: 'definite' },
    requiredInfo: { facts: gapLikeFacts, wordCount: Math.min(80, Math.max(20, gapLikeFacts.join(' ').split(/\s+/).length)) },
  };
  const bridge = await generator.generateBridge({ gap: fakeGap as unknown as ContextGap, targetScene: { id: requirement.insertPoint.sceneId, text: context.after, startOffset: 0, endOffset: context.after.length } as unknown as Scene, maxWords: Math.max(40, fakeGap.requiredInfo.wordCount) });
  const alternates = await generator.generateMultipleOptions({ gap: fakeGap as unknown as ContextGap, targetScene: { id: requirement.insertPoint.sceneId, text: context.after, startOffset: 0, endOffset: context.after.length } as unknown as Scene, manuscriptStyle: style, maxWords: Math.max(40, fakeGap.requiredInfo.wordCount) }, 3);
  const best = bridge;
  const styleMatch = generator['styleAnalyzer'].compareStyles(style, generator['styleAnalyzer'].analyzeText(best.text));
  return {
    requirement,
    text: best.text,
    wordCount: best.wordCount,
    confidence: Math.max(0.6, styleMatch),
    insertionAnchor: requirement.insertPoint,
    alternates: alternates.map(a => a.text).filter(t => t !== best.text),
    styleMatch,
  };
}
 
