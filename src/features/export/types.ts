import type { AnchoredEdit } from "../manuscript/types.js";

export type ChangeEntry = {
  id: string;
  type: AnchoredEdit["type"];
  position: number;
  originalSnippet?: string;
  newSnippet?: string;
  success: boolean;
  reason?: string;
};

export type AppliedResult = {
  patchedText: string;
  changeLog: ChangeEntry[];
  statistics: {
    wordsAdded: number;
    wordsRemoved: number;
    wordsModified: number;
    successRate: number;
  };
};

export type ValidationReport = {
  characterConsistencyOk: boolean;
  timelineOk: boolean;
  sceneRefsOk: boolean;
  pronounsOk: boolean;
  warnings: string[];
};

export type DocumentMetadata = {
  title?: string;
  author?: string | string[];
  date?: string; // ISO or freeform
  keywords?: string[];
  subject?: string;
};

export type DocxOptions = {
  referenceDocxPath?: string;
  trackChanges?: boolean;
};

export type PdfOptions = {
  latexEngine?: "pdflatex" | "xelatex" | "lualatex";
  headerHtml?: string;
  footerHtml?: string;
  cssPath?: string;
};

export type ExportFormats = {
  markdown: string;
  html: string;
  plain: string;
  docx?: Uint8Array;
  pdf?: Uint8Array;
};

export type Synopsis = {
  text: string;
  wordCount: number;
  style: "query" | "full" | "onePage";
  keyPoints: string[];
  warnings: string[];
};

export type BundleOptions = {
  // Required inputs
  candidateId: string;
  // Text sources
  revisedOpeningMarkdown: string; // will be rendered to selected formats
  synopsisText?: string; // precomputed synopsis, if any
  queryMarkdown?: string; // optional custom query letter text; template used otherwise
  rationaleMarkdown?: string; // optional rationale memo; template used otherwise
  comparisonMarkdown?: string; // optional comparison report

  // Output formats
  openingFormat?: "docx" | "pdf" | "md";
  synopsisFormat?: "pdf" | "md";

  // Rendering options
  metadata?: DocumentMetadata;
  docx?: DocxOptions;
  pdf?: PdfOptions;
};

export type BundleResult = {
  zipPath: string; // absolute or memory:// path
  files: { path: string; bytes?: Uint8Array }[];
};
