/// <reference lib="webworker" />
import { analyzeScenes } from "@/features/manuscript/analyzer";

export type AnalyzeScenesMsg = { type: "analyze"; scenes: { id: string; text: string; wordCount: number }[] };
export type AnalyzeScenesResp = { type: "result"; hookScores: [string, number][] };

self.onmessage = (ev: MessageEvent<AnalyzeScenesMsg>) => {
  const { data } = ev;
  if (data.type === "analyze") {
    const res = analyzeScenes(
      data.scenes.map((s) => ({ id: s.id, chapterId: "", startOffset: 0, endOffset: 0, text: s.text, wordCount: s.wordCount, dialogueRatio: 0 }))
    );
    const resp: AnalyzeScenesResp = { type: "result", hookScores: Array.from(res.hookScores.entries()) };
    postMessage(resp);
  }
};
