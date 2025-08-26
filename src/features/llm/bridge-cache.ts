import type { ContextGap } from '../manuscript/context-analyzer.js';
import type { Scene } from '../manuscript/types.js';
import { globalLLMCache } from './cache-manager.js';
import { BridgeGenerator, type BridgeGenerationRequest, type BridgeParagraph } from './bridge-generator.js';

export class BridgeCache {
  getCacheKey(gap: ContextGap, scene: Scene): string {
    const need = gap.requiredInfo?.facts?.slice(0, 5) || [];
    return globalLLMCache.generateCacheKey('BRIDGE', { id: gap.id, sceneId: scene.id, need });
  }

  async getOrGenerate(
    request: BridgeGenerationRequest,
    generator: BridgeGenerator = new BridgeGenerator()
  ): Promise<BridgeParagraph[]> {
    const key = this.getCacheKey(request.gap, request.targetScene);
    return globalLLMCache.getOrCompute(key, async () => {
      return await generator.generateMultipleOptions(request, 3);
    }, { maxAgeMs: 24 * 60 * 60 * 1000, staleAfterMs: 12 * 60 * 60 * 1000, revalidateAfterMs: 60 * 60 * 1000 });
  }
}

export const globalBridgeCache = new BridgeCache();
