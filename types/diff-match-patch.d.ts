declare module 'diff-match-patch' {
  export const DIFF_DELETE: -1;
  export const DIFF_INSERT: 1;
  export const DIFF_EQUAL: 0;
  export class diff_match_patch {
    Diff_Timeout: number;
    Diff_EditCost: number;
    diff_main(text1: string, text2: string): Array<[number, string]>;
    diff_cleanupSemantic(diffs: Array<[number, string]>): void;
  }
}
