import { PandocExporter } from "./pandoc-exporter.js";
import type { BundleOptions, BundleResult } from "./types.js";

async function getTauriInvoke(): Promise<undefined | ((cmd: string, args?: unknown) => Promise<unknown>)> {
  const g = globalThis as unknown as { __TAURI__?: unknown };
  if (!g.__TAURI__) return undefined;
  const mod = await (new Function("s", "return import(s)") as (s: string) => Promise<unknown>)("@tauri-apps/api/core") as { invoke: (cmd: string, args?: unknown) => Promise<unknown> };
  return mod.invoke;
}

export class SubmissionBundle {
  async create(options: BundleOptions): Promise<BundleResult> {
    const exporter = new PandocExporter();
    const files: { path: string; bytes?: Uint8Array }[] = [];
    const invoke = await getTauriInvoke();

    // 1) Revised opening
    const openingName = `opening.${options.openingFormat || 'docx'}`;
    if ((options.openingFormat || 'docx') === 'md') {
      files.push({ path: openingName, bytes: new TextEncoder().encode(options.revisedOpeningMarkdown) });
    } else if (options.openingFormat === 'pdf') {
      const pdf = await exporter.exportPdf(options.revisedOpeningMarkdown, options.metadata || {});
      files.push({ path: openingName, bytes: pdf });
    } else {
      const docx = await exporter.exportDocx(options.revisedOpeningMarkdown, options.metadata || {}, options.docx);
      files.push({ path: openingName, bytes: docx });
    }

    // 2) Synopsis
    if (options.synopsisText) {
      const synFormat = options.synopsisFormat || 'pdf';
      if (synFormat === 'md') {
        files.push({ path: 'synopsis.md', bytes: new TextEncoder().encode(options.synopsisText) });
      } else {
        const pdf = await exporter.exportPdf(options.synopsisText, { title: 'Synopsis' }, options.pdf);
        files.push({ path: 'synopsis.pdf', bytes: pdf });
      }
    }

    // 3) Query letter template or provided
    const queryMd = options.queryMarkdown ?? defaultQueryTemplate(options.metadata?.author);
    files.push({ path: 'query.md', bytes: new TextEncoder().encode(queryMd) });

    // 4) Rationale memo
    const rationaleMd = options.rationaleMarkdown ?? defaultRationale();
    if (options.synopsisFormat === 'md') files.push({ path: 'rationale.md', bytes: new TextEncoder().encode(rationaleMd) });
    else {
      const pdf = await exporter.exportPdf(rationaleMd, { title: 'Revision Rationale' }, options.pdf);
      files.push({ path: 'rationale.pdf', bytes: pdf });
    }

    // 5) Comparison report (markdown only for now)
    if (options.comparisonMarkdown) files.push({ path: 'comparison.md', bytes: new TextEncoder().encode(options.comparisonMarkdown) });

    // 6) Metadata
    const meta = { candidateId: options.candidateId, created: new Date().toISOString(), metadata: options.metadata || {} };
    files.push({ path: 'metadata.json', bytes: new TextEncoder().encode(JSON.stringify(meta, null, 2)) });

    // Package as zip
    const baseName = `submission_${new Date().toISOString().slice(0, 10)}`;
    if (invoke) {
      // Write temp files then call backend zipper
      const paths: string[] = [];
      for (const f of files) {
        const p = await (invoke("export_write_temp", { name: f.path, content: f.bytes ? new TextDecoder().decode(f.bytes) : '' }) as Promise<string>);
        paths.push(p);
      }
      const zipPath = await (invoke("export_package_zip", { files: paths, baseName }) as Promise<string>);
      return { zipPath, files };
    }
    // Fallback: in-memory path
    return { zipPath: `memory://${baseName}.zip`, files };
  }
}

function defaultQueryTemplate(author?: string | string[]): string {
  const name = Array.isArray(author) ? author.join(', ') : (author || 'Author');
  return `To whom it may concern,\n\nPlease consider my manuscript for representation.\n\nRegards,\n${name}`;
}

function defaultRationale(): string {
  return `# Revision Rationale\n\n- Improved hook and pacing\n- Clarified character motivations\n- Reduced exposition in opening\n`;
}
