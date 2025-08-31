#!/usr/bin/env node
import { OpeningLabOrchestrator } from '@/features/llm/orchestrator.ts';

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

(async () => {
  try {
    const raw = await readStdin();
    const input = JSON.parse(raw);
    const orchestrator = new OpeningLabOrchestrator();
    const result = await orchestrator.analyzeCandidate({
      candidateId: input.candidateId,
      manuscriptText: input.manuscriptText,
      candidateText: input.candidateText,
    });
    process.stdout.write(JSON.stringify(result));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    process.exit(1);
  }
})();
