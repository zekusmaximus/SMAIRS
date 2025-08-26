import type { DocumentMetadata, DocxOptions, ExportFormats, PdfOptions } from "./types.js";

async function getTauriInvoke(): Promise<undefined | ((cmd: string, args?: unknown) => Promise<unknown>)> {
  const g = globalThis as unknown as { __TAURI__?: unknown };
  if (!g.__TAURI__) return undefined;
  const mod = await (new Function("s", "return import(s)") as (s: string) => Promise<unknown>)("@tauri-apps/api/core") as { invoke: (cmd: string, args?: unknown) => Promise<unknown> };
  return mod.invoke;
}

export class PandocExporter {
  private async checkPandoc(): Promise<boolean> {
    // If Tauri backend exists, assume pandoc integration via commands; otherwise try spawning in Node if available
    const invoke = await getTauriInvoke();
    if (invoke) return true;
    try {
      const cp = await import("node:child_process");
      const res = cp.spawnSync("pandoc", ["--version"], { encoding: "utf-8" });
      if (res.error) return false;
      const text = String(res.stdout || "");
      const m = text.match(/pandoc\s+(\d+\.\d+(?:\.\d+)?)/i);
      if (!m) return false;
      const ver = parseFloat(m[1] || "0");
      return ver >= 2.0;
    } catch {
      return false;
    }
  }

  async exportDocx(content: string, metadata: DocumentMetadata, options?: DocxOptions): Promise<Uint8Array> {
    const invoke = await getTauriInvoke();
    const md = this.wrapMarkdown(content, metadata);
    if (invoke) {
      const mdPath = await invoke("export_write_temp", { name: "export.md", content: md }) as string;
      const out = await invoke("export_pandoc_docx", { markdownPath: mdPath, trackChanges: !!options?.trackChanges }) as string;
      // Read back file when running under Node; otherwise return a placeholder buffer
      try { const fs = await import("node:fs"); return fs.readFileSync(out); } catch { return new TextEncoder().encode("DOCX://" + out); }
    }
    // Fallback: return markdown wrapped content as bytes tagged .docx (consumer can save-as)
    const body = `DOCX fallback (no pandoc)\n\n` + md;
    return new TextEncoder().encode(body);
  }

  async exportPdf(content: string, metadata: DocumentMetadata, options?: PdfOptions): Promise<Uint8Array> {
    const invoke = await getTauriInvoke();
    const md = this.wrapMarkdown(content + (options?.latexEngine ? `\n\n<!-- engine:${options.latexEngine} -->\n` : ""), metadata);
    if (invoke) {
      const mdPath = await invoke("export_write_temp", { name: "export.md", content: md }) as string;
      const out = await invoke("export_pandoc_pdf", { markdownPath: mdPath }) as string;
      try { const fs = await import("node:fs"); return fs.readFileSync(out); } catch { return new TextEncoder().encode("PDF://" + out); }
    }
    // Fallback: generate simple PDF-like placeholder (not a real PDF)
    const body = `PDF fallback (no pandoc)\n\n` + md;
    return new TextEncoder().encode(body);
  }

  fallbackExport(content: string): ExportFormats {
    const markdown = content;
    const html = `<!doctype html><meta charset="utf-8"><style>body{font-family:system-ui;line-height:1.5;max-width:720px;margin:2rem auto;padding:0 1rem}</style><article>\n${markdown
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>")}</article>`;
    const plain = markdown.replace(/\*\*|__|`/g, "");
    return { markdown, html, plain };
  }

  private wrapMarkdown(content: string, metadata: DocumentMetadata): string {
    const yaml: string[] = ["---"];
    if (metadata.title) yaml.push(`title: ${escapeYaml(metadata.title)}`);
    if (metadata.author) yaml.push(`author: ${Array.isArray(metadata.author) ? metadata.author.join(', ') : metadata.author}`);
    if (metadata.date) yaml.push(`date: ${metadata.date}`);
    if (metadata.subject) yaml.push(`subject: ${escapeYaml(metadata.subject)}`);
    if (metadata.keywords?.length) yaml.push(`keywords: [${metadata.keywords.map(escapeYaml).join(', ')}]`);
    yaml.push("---\n");
    return yaml.join("\n") + content;
  }
}

function escapeYaml(s: string): string { return JSON.stringify(String(s)); }
