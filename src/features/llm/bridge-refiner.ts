import { globalProviderAdapter } from './provider-adapter.js';
import type { Scene } from '../manuscript/types.js';
import { StyleAnalyzer, type StyleProfile } from '../manuscript/style-analyzer';

export interface BridgeParagraph { text: string; wordCount: number; insertionPoint: { sceneId: string; offset: number; length: number }; contextCovered: string[]; styleMatch: number; alternatives?: string[] }

export interface ValidationResult { flows: boolean; contradictions: string[]; voiceConsistent: boolean; score: number }

export interface RefinementFeedback {
  issues: Array<{ type: 'style' | 'clarity' | 'flow' | 'accuracy'; description: string; severity: 'minor' | 'major' }>;
  suggestions: string[];
}

function readEnv(name: string): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyImportMeta: any = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
  return (anyImportMeta && anyImportMeta[name]) || (typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>)?.[name] : undefined);
}
function isOffline(): boolean { return (readEnv('LLM_OFFLINE') || '0') === '1'; }

export class BridgeRefiner {
  constructor(private style = new StyleAnalyzer()) {}

  async refine(bridge: BridgeParagraph, feedback: RefinementFeedback, targetScene?: Scene, baselineStyle?: StyleProfile, maxWords = 80): Promise<BridgeParagraph> {
    const offline = isOffline();
    const baseStyle = baselineStyle || (targetScene ? this.style.analyzeLocalContext(targetScene, 500) : this.style.analyzeText(bridge.text));
    if (!offline) {
      try {
        // Ask judge to critique
        const judgePrompt = `You are a strict fiction editor. Evaluate the following bridge paragraph for style, clarity, flow, and accuracy.
Target scene excerpt: "${(targetScene?.text || '').slice(0, 300)}..."
Feedback issues: ${feedback.issues.map(i => `${i.type}(${i.severity}): ${i.description}`).join(' | ')}
Suggestions: ${feedback.suggestions.join('; ')}
Bridge:\n${bridge.text}\n
Return a JSON object: {"score": number (0-1), "actionable": ["..."], "mustFix": ["..."], "styleNotes": ["..."]}`;
  const judge = await globalProviderAdapter.executeWithFallback('JUDGE_SCORER', { prompt: judgePrompt, profile: 'JUDGE_SCORER', temperature: 0.2 });
        const data = safeExtractJSON(judge.text) as { score?: number; actionable?: string[]; mustFix?: string[]; styleNotes?: string[] };
        const needs = (data?.mustFix || []).concat(feedback.suggestions);
        // Regenerate with FAST_ITERATE using constraints
        const regenPrompt = `Revise the bridge paragraph to address the following issues while matching style.
Constraints: <= ${maxWords} words, natural flow into target scene, avoid info-dump.
Must-fix: ${needs.join('; ')}
Style: POV=${baseStyle.pov}, Tense=${baseStyle.tense}, Voice=${baseStyle.voice}, AvgLen=${baseStyle.avgSentenceLength}
Original:\n${bridge.text}\n
Return only the revised paragraph.`;
  const regen = await globalProviderAdapter.executeWithFallback('FAST_ITERATE', { prompt: regenPrompt, profile: 'FAST_ITERATE', temperature: 0.6 });
        const text = (regen.text || '').trim();
        const t = this.enforceWordLimit(text, maxWords);
        const styleNow = this.style.analyzeText(t);
        return { ...bridge, text: t, wordCount: this.countWords(t), styleMatch: this.style.compareStyles(baseStyle, styleNow) };
      } catch { /* fall through to local minimal edit */ }
    }
    // Offline or failure: apply simple truncation and verb tense nudge
    const t = this.enforceWordLimit(bridge.text.replace(/\bjust\b/gi, 'simply'), maxWords);
    const styleNow = this.style.analyzeText(t);
    return { ...bridge, text: t, wordCount: this.countWords(t), styleMatch: this.style.compareStyles(baseStyle, styleNow) };
  }

  async validateCoherence(bridge: BridgeParagraph, targetScene: Scene): Promise<ValidationResult> {
    // Heuristic local validator
    const contradictions: string[] = [];
    const t = (bridge.text + ' ' + targetScene.text.slice(0, 200)).toLowerCase();
    if (/\b(today|now)\b/.test(bridge.text) && /\b(yesterday|last night)\b/.test(targetScene.text)) contradictions.push('time reference mismatch');
    const baseStyle = this.style.analyzeLocalContext(targetScene, 500);
    const styleNow = this.style.analyzeText(bridge.text);
    const voiceConsistent = this.style.compareStyles(baseStyle, styleNow) >= 0.7;
    const flows = /\.$/.test(bridge.text.trim()) && t.length > 20;
    const score = Math.max(0, Math.min(1, (voiceConsistent ? 0.6 : 0.4) + (contradictions.length ? -0.2 : 0) + (flows ? 0.2 : 0)));
    return { flows, contradictions, voiceConsistent, score };
  }

  private enforceWordLimit(text: string, maxWords: number): string {
    const words = text.trim().split(/\s+/);
    if (words.length <= maxWords) return text.trim();
    return words.slice(0, maxWords).join(' ').replace(/[\s,;:]+$/, '') + '…';
  }
  private countWords(text: string): number { return (text.trim().match(/\b\w+\b/g) || []).length; }
}

function safeExtractJSON(text: string): unknown {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  } catch { return {}; }
}

export default BridgeRefiner;
