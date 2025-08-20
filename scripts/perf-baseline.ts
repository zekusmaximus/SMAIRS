import { runSceneInventory } from '../src/cli/scene-inventory.js';

function chapterHeader(ch: number){ return `=== CHAPTER ${String(ch).padStart(2,'0')} ===\n`; }
function sceneHeader(ch: number, s: number){ return `[SCENE: CH${String(ch).padStart(2,'0')}_S${String(s).padStart(2,'0')}]\n`; }

function synth(chapters: number, scenesPerChapter: number, wordsPerScene: number): string {
  let m='';
  for (let ch=1; ch<=chapters; ch++) {
    m += chapterHeader(ch);
    for (let s=1; s<=scenesPerChapter; s++) {
      m += sceneHeader(ch,s);
      const tokens: string[] = [];
      for (let w=0; w<wordsPerScene; w++) tokens.push('w'+(w%40)+'_'+ch+'_'+s);
      m += tokens.join(' ')+'\n';
    }
  }
  return m;
}

async function measure(label: string, text: string) {
  const t0 = performance.now();
  const mem0 = process.memoryUsage().heapUsed;
  const res = await runSceneInventory(text, { fixedTimestamp: '2025-01-01T00:00:00Z' });
  const t1 = performance.now();
  const mem1 = process.memoryUsage().heapUsed;
  return {
    label,
    words: text.trim().split(/\s+/).length,
    scenes: (res.report.match(/\n\[/g) || []).length,
    ms: +(t1 - t0).toFixed(1),
    heapMB: +((mem1 - mem0)/1024/1024).toFixed(2)
  };
}

(async () => {
  const small = synth(10,10,80);
  const large = synth(60,20,100); // ~120k words
  const results = [ await measure('small', small), await measure('large120k', large) ];
  console.log(JSON.stringify(results, null, 2));
})();
