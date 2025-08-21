import type { CallArgs, Profile } from './providers.js';

export interface CachedPrompt { prompt: string; tokens: number; }
export interface OptimizedRequest { args: CallArgs; batchedWith?: string[]; compressed?: boolean; savings?: CostSavings; }
export interface CostSavings { tokensReduced: number; estUSD: number; percent: number; }
export interface PendingBatch { requests: { id: string; args: CallArgs; resolve: (o: OptimizedRequest) => void }[]; timer?: ReturnType<typeof setTimeout>; }
// Internal utility result for batching decision
interface BatchDecision { batched: boolean; batchId?: string; peers?: string[] }
export interface CompressedPrompt { prompt: string; reduced: number; }

export class CostOptimizer {
  private promptCache: Map<string, CachedPrompt> = new Map();
  private batchWindow = 100; // ms
  private pendingBatches: Map<Profile, PendingBatch> = new Map();

  async optimizeRequest(profile: Profile, request: CallArgs): Promise<OptimizedRequest> {
    const originalTokens = this.estimateTokens(request.prompt);
    // Step 1: compression
    const compressed = this.compressPrompt(request.prompt);
    const args: CallArgs = { ...request, prompt: compressed.prompt };
    // Step 2: attempt batching
  const batchDecision = await this.attemptBatching(profile, args);
  return { args, compressed: compressed.reduced > 0, savings: { tokensReduced: compressed.reduced, estUSD: (compressed.reduced / 1_000_000) * 2, percent: compressed.reduced ? compressed.reduced / originalTokens : 0 }, batchedWith: batchDecision.batched ? batchDecision.peers || [] : undefined };
  }

  private compressPrompt(prompt: string): CompressedPrompt {
    const before = this.estimateTokens(prompt);
    let out = prompt.replace(/\s+/g, ' ').trim();
    if (out.length > 10_000) out = out.slice(0, 10_000); // guard
    const after = this.estimateTokens(out);
    return { prompt: out, reduced: Math.max(0, before - after) };
  }

  private async attemptBatching(profile: Profile, request: CallArgs): Promise<BatchDecision> {
    // Minimal heuristic: batch identical system messages within window
    const key = (request.system || '') + '|' + profile;
    let pending = this.pendingBatches.get(profile);
    if (!pending) {
      pending = { requests: [] };
      this.pendingBatches.set(profile, pending);
    }
    return new Promise<BatchDecision>(res => {
      const id = key + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 7);
  pending!.requests.push({ id, args: request, resolve: () => { /* placeholder buffered until flush */ } });
      if (!pending!.timer) {
        pending!.timer = setTimeout(() => {
          const peers = pending!.requests.map(r => r.id);
          for (const r of pending!.requests) {
            r.resolve({ args: r.args, batchedWith: peers.filter(p => p !== r.id), compressed: false, savings: undefined });
          }
          // Return decision referencing all peers
          res({ batched: pending!.requests.length > 1, batchId: id, peers: peers.filter(p => p !== id) });
          this.pendingBatches.delete(profile);
        }, this.batchWindow);
      }
    });
  }

  estimateSavings(original: CallArgs, optimized: OptimizedRequest): CostSavings {
    const originalTokens = this.estimateTokens(original.prompt);
    const newTokens = this.estimateTokens(optimized.args.prompt);
    const reduced = Math.max(0, originalTokens - newTokens);
    const estUSD = (reduced / 1_000_000) * 2;
    return { tokensReduced: reduced, estUSD, percent: originalTokens ? reduced / originalTokens : 0 };
  }

  private estimateTokens(text: string): number { return Math.round(text.length / 4); }
}
