import type { Manuscript, Scene } from "../manuscript/types.js";
import type { OpeningCandidate } from "../manuscript/opening-candidates.js";
import type { Synopsis } from "./types.js";
import { globalProviderAdapter } from "../llm/provider-adapter.js";
import { extractReveals } from "../manuscript/reveal-extraction.js";

export class SynopsisGenerator {
  async generateFromManuscript(
    manuscript: Manuscript,
    opening: OpeningCandidate,
    style: 'query' | 'full' | 'onePage' = 'onePage'
  ): Promise<Synopsis> {
    const maxWords = 1000;
    const llmEnabled = !isEnvFlag("LLM_OFFLINE");
  // Access manuscript text lazily in heuristics to avoid bundler tree-shaking complaining
  let synopsis = '';
  let keyPoints: string[] = [];
    const warnings: string[] = [];

    if (llmEnabled) {
      try {
        const prompt = this.buildLLMPrompt(manuscript, opening, style);
        const res = await globalProviderAdapter.executeWithFallback('STRUCTURE_LONGCTX', { system: 'SYNOPSIS', prompt, temperature: 0.3, profile: 'STRUCTURE_LONGCTX' });
        synopsis = trimWords((res.text || '').trim(), maxWords);
      } catch {
        synopsis = '';
      }
    }

    // Heuristic extraction for key points always; also synthesize synopsis if LLM path failed
    const scenes = this.collectScenesInOrder(manuscript, opening);
    const reveals = scenes.flatMap(sc => extractReveals(sc));
    keyPoints = reveals.length ? reveals.slice(0, 10).map(r => r.description) : ["Protagonist introduced", "Inciting incident", "Rising stakes"];
    if (!synopsis) {
      const arc = this.heuristicArc(scenes, keyPoints);
      synopsis = trimWords(arc, maxWords);
    }

    if (wordCount(synopsis) < 100) warnings.push('Synopsis is very short');
    if (!/[Rr]esolution|[Ee]ndgame|[Cc]limax/.test(synopsis)) warnings.push('Missing resolution hints');

    return { text: synopsis, wordCount: wordCount(synopsis), style, keyPoints, warnings };
  }

  private collectScenesInOrder(ms: Manuscript, opening: OpeningCandidate): Scene[] {
    // For now, build from chapter offsets; in phase 1 scenes are not globally stored here, so slice by offsets
    const start = Math.max(0, opening.startOffset - 2000);
    const end = Math.min(ms.rawText.length, opening.endOffset + 4000);
    const slice = ms.rawText.slice(start, end);
    return [{ id: 'window', chapterId: 'chXX', startOffset: start, endOffset: end, text: slice, wordCount: wordCount(slice), dialogueRatio: 0.3 }];
  }

  private heuristicArc(scenes: Scene[], points: string[]): string {
    const body = scenes.map(s => s.text).join('\n');
    const firstPara = (body.split(/\n{2,}/)[0] || '').replace(/\s+/g, ' ').trim();
    const bullets = points.slice(0, 6).map(p => `- ${p}`).join('\n');
    return `Opening establishes premise and stakes.\n\n${firstPara}\n\nKey turns:\n${bullets}\n\nResolution: Protagonist confronts central conflict; loose ends signal series potential.`;
  }

  private buildLLMPrompt(ms: Manuscript, opening: OpeningCandidate, style: Synopsis['style']): string {
    const header = `STYLE: ${style}\nWORDS<=1000\nOPENING_ID=${opening.id}\n`;
    const excerpt = ms.rawText.slice(Math.max(0, opening.startOffset - 1000), Math.min(ms.rawText.length, opening.endOffset + 3000));
    return `${header}\nTEXT:\n${excerpt}`;
  }
}

function wordCount(s: string): number { return s.trim() ? s.trim().split(/\s+/).length : 0; }
function trimWords(s: string, max: number): string { const w = s.split(/\s+/).filter(Boolean); return w.slice(0, max).join(' '); }
function isEnvFlag(name: string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyImportMeta: any = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
  const v = (anyImportMeta && anyImportMeta[name]) || (typeof process !== 'undefined' ? process.env?.[name] : undefined);
  return v === '1' || v === 'true';
}
