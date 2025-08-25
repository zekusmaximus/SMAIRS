import type { OpeningAnalysis, OpeningCandidate } from "@/types";
import { emitJobEvent } from "@/lib/events";

export type BundleOptions = { format: "docx"|"pdf"|"md"; includeSynopsis?: boolean; trackChanges?: boolean };

export async function generateBundle(args: { candidate: OpeningCandidate; analysis: OpeningAnalysis; options: BundleOptions; jobId?: string }): Promise<{ outputPath: string }> {
  const { candidate, analysis, options, jobId } = args;
  const progress = async (p: number, step?: string) => { if (jobId) await emitJobEvent(jobId, "progress", { id: jobId, percent: p, step }); };
  await progress(5, "prepare");

  // Build core markdown content
  const md: string[] = [];
  md.push(`# Opening: ${candidate.id}`);
  md.push("");
  md.push(`Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);
  md.push(`Edit burden: ${(analysis.editBurdenPercent * 100).toFixed(1)}%`);
  md.push("");
  md.push("## Rationale");
  md.push(analysis.rationale || "(none)");

  if (options.includeSynopsis) {
    md.push("");
    md.push("## Synopsis");
    md.push(generateSynopsis(analysis));
  }

  md.push("");
  md.push("## Memo: Why this opening");
  md.push(buildMemo(analysis));

  const base = await ensureTauri();
  await progress(20, "formatting");

  let outPath = "";
  if (options.format === "md") {
    outPath = await base.writeTemp("opening.md", md.join("\n"));
  } else if (options.format === "docx") {
    const mdPath = await base.writeTemp("opening.md", md.join("\n"));
    outPath = await base.toDocx({ markdownPath: mdPath, trackChanges: !!options.trackChanges });
  } else if (options.format === "pdf") {
    const mdPath = await base.writeTemp("opening.md", md.join("\n"));
    outPath = await base.toPdf({ markdownPath: mdPath });
  }

  await progress(80, "bundling");
  const zipPath = await base.packageZip({ files: [outPath], baseName: `opening-${candidate.id}` });
  await progress(100, "complete");
  return { outputPath: zipPath };
}

function generateSynopsis(analysis: OpeningAnalysis): string {
  // Minimal placeholder; could be LLM powered later
  return `This opening positions the story with a strong hook (confidence ${(analysis.confidence * 100).toFixed(0)}%), outlines key stakes, and sets tone and pacing for the first chapters.`;
}

function buildMemo(a: OpeningAnalysis): string {
  const bullets = [
    `Hook confidence ${(a.confidence * 100).toFixed(0)}%`,
    a.spoilerCount === 0 ? "No critical spoilers detected" : `${a.spoilerCount} spoiler risks (mitigated)`,
    `Estimated edit burden ${(a.editBurdenPercent * 100).toFixed(0)}%`,
  ];
  return bullets.map((b) => `- ${b}`).join("\n");
}

// Bridge to Tauri export commands
async function ensureTauri() {
  const g = globalThis as unknown as { __TAURI__?: unknown };
  const has = !!g.__TAURI__;
  if (!has) {
    // Fallback to in-memory temp + simulate paths for web/dev runs
    return {
      async writeTemp(name: string, _content: string) { void _content; return `memory://${name}`; },
      async toDocx(_o: { markdownPath: string; trackChanges: boolean }) { void _o; return `memory://opening.docx`; },
      async toPdf(_o: { markdownPath: string }) { void _o; return `memory://opening.pdf`; },
      async packageZip(_o: { files: string[]; baseName: string }) { void _o; return `memory://bundle.zip`; },
    };
  }
  // Dynamically import to avoid bundler issues
  const { invoke }: { invoke: (cmd: string, args?: unknown) => Promise<unknown> } = await (new Function("s", "return import(s)") as (s: string) => Promise<unknown>)("@tauri-apps/api/core") as { invoke: (cmd: string, args?: unknown) => Promise<unknown> };
  return {
    async writeTemp(name: string, content: string) { return await invoke("export_write_temp", { name, content }) as string; },
    async toDocx(opts: { markdownPath: string; trackChanges: boolean }) { return await invoke("export_pandoc_docx", { markdownPath: opts.markdownPath, trackChanges: opts.trackChanges }) as string; },
    async toPdf(opts: { markdownPath: string }) { return await invoke("export_pandoc_pdf", { markdownPath: opts.markdownPath }) as string; },
    async packageZip(opts: { files: string[]; baseName: string }) { return await invoke("export_package_zip", { files: opts.files, baseName: opts.baseName }) as string; },
  };
}
