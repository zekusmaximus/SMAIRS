export type SearchHit = {
  sceneId: string;
  offset: number;
  snippet: string;
  score: number;
  highlights: Array<[number, number]>;
};
