// Lightweight style analyzer for matching manuscript voice
import type { Scene } from './types.js';

export interface StyleProfile {
  pov: 'first' | 'third-limited' | 'third-omniscient';
  tense: 'past' | 'present';
  voice: 'literary' | 'commercial' | 'genre-specific';
  avgSentenceLength: number;
  vocabularyLevel: number;  // 1-10
  dialogueRatio: number;
  commonPhrases: string[];
  toneMarkers: string[];    // Dark, humorous, formal, etc.
}

function tokenizeWords(text: string): string[] { return text.toLowerCase().match(/[a-zA-Z']+/g) || []; }
function splitSentences(text: string): string[] { return text.split(/[.!?]+\s+/).filter(Boolean); }

export class StyleAnalyzer {
  analyzeLocalContext(
    scene: Scene,
    radius: number = 500
  ): StyleProfile {
    const text = scene.text || '';
    const sample = text.slice(0, radius);
    return this.analyzeText(sample);
  }

  analyzeManuscript(manuscript: { rawText: string }): StyleProfile {
    const text = manuscript.rawText || '';
    // Take several samples across the manuscript for stability
    const len = text.length;
    const chunks = [0, Math.floor(len / 3), Math.floor((2 * len) / 3)].map((i) => text.slice(i, Math.min(len, i + 1200))).join('\n');
    return this.analyzeText(chunks);
  }

  analyzeText(text: string): StyleProfile {
    const sentences = splitSentences(text);
    const words = tokenizeWords(text);
    const avgSentenceLength = sentences.length ? Math.round((words.length / sentences.length) * 10) / 10 : words.length;
  const dialogueMarks = (text.match(/"|“|”|'\s*\w+\s*'/g) || []).length;
    const dialogueRatio = Math.min(1, Math.round(((dialogueMarks / Math.max(1, sentences.length)) * 100)) / 100);
    const unique = new Set(words);
    const vocabularyLevel = Math.min(10, Math.max(1, Math.round((unique.size / Math.max(1, words.length)) * 100)));
    const commonPhrases = this.topBigrams(words, 5);
    const pov = this.detectPOV(text);
    const tense = this.detectTense(text);
    const voice = this.detectVoice(avgSentenceLength, vocabularyLevel);
    const toneMarkers = this.detectTone(text);
    return { pov, tense, voice, avgSentenceLength, vocabularyLevel, dialogueRatio, commonPhrases, toneMarkers };
  }

  compareStyles(a: StyleProfile, b: StyleProfile): number {
    // Simple heuristic similarity 0..1
    let score = 1.0;
    if (a.pov !== b.pov) score -= 0.2;
    if (a.tense !== b.tense) score -= 0.2;
    score -= Math.min(0.2, Math.abs(a.avgSentenceLength - b.avgSentenceLength) / 20);
    score -= Math.min(0.1, Math.abs(a.vocabularyLevel - b.vocabularyLevel) / 10);
    score -= Math.min(0.1, Math.abs(a.dialogueRatio - b.dialogueRatio));
    score = Math.max(0, Math.min(1, score));
    return Math.round(score * 1000) / 1000;
  }

  private detectPOV(text: string): StyleProfile['pov'] {
    const first = /\b(I|my|me|we|our)\b/i.test(text);
    if (first) return 'first';
    const omni = /\b(he|she|they|their)\b/i.test(text) && /\b(knew|felt|thought)\b/i.test(text);
    return omni ? 'third-omniscient' : 'third-limited';
  }

  private detectTense(text: string): StyleProfile['tense'] {
    const present = /\b(am|is|are|walks|says|think|goes)\b/i.test(text);
    const past = /\b(was|were|walked|said|thought|went)\b/i.test(text);
    return present && !past ? 'present' : 'past';
  }

  private detectVoice(avgLen: number, vocab: number): StyleProfile['voice'] {
    if (avgLen > 20 || vocab > 40) return 'literary';
    if (avgLen < 12) return 'commercial';
    return 'genre-specific';
  }

  private detectTone(text: string): string[] {
    const tones: string[] = [];
    if (/\bgrim|bleak|shadow|blood|ruin\b/i.test(text)) tones.push('dark');
    if (/\bquipped|wry|smiled|snorted|banter\b/i.test(text)) tones.push('humorous');
    if (/\bprotocol|formal|hereby|therefore\b/i.test(text)) tones.push('formal');
    return tones;
  }

  private topBigrams(words: string[], n: number): string[] {
    const map = new Map<string, number>();
    for (let i = 0; i < words.length - 1; i++) {
      const bg = words[i] + ' ' + words[i + 1];
      map.set(bg, (map.get(bg) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  }
}

export default StyleAnalyzer;
