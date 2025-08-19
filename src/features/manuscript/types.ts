export interface Chapter {
  id: string;          // ch01
  index: number;       // 1-based
  startOffset: number; // byte index in normalized text
}

export interface Manuscript {
  id: string;          // checksum prefix
  title: string;
  rawText: string;     // normalized LF text
  checksum: string;    // sha256 of normalized text
  wordCount: number;
  chapters: Chapter[];
}

export interface Scene {
  id: string;          // ch01_s01
  chapterId: string;   // ch01
  startOffset: number; // body start (after header line)
  endOffset: number;   // exclusive
  text: string;
  wordCount: number;
  dialogueRatio: number; // 0..1
}
