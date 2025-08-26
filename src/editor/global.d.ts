export {};
declare global {
  interface Window {
    manuscriptEditor?: {
      find(q: string): number;
      replaceAll(from: string, to: string): void;
      getSceneText(sceneId: string): string;
      setHighlights(ranges: Array<{ from: number; to: number }>): number;
      clearHighlights(): void;
      scrollTo(offset: number): void;
    };
  }
}
