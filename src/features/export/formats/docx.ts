export type DocxOptions = { markdownPath: string; trackChanges?: boolean };

export async function toDocx(opts: DocxOptions): Promise<string> {
  const base = await ensureTauri();
  return await base.toDocx({ markdownPath: opts.markdownPath, trackChanges: !!opts.trackChanges });
}

export async function toPdf(opts: { markdownPath: string }): Promise<string> {
  const base = await ensureTauri();
  return await base.toPdf({ markdownPath: opts.markdownPath });
}

async function ensureTauri() {
  const g = globalThis as unknown as { __TAURI__?: unknown };
  if (!g.__TAURI__) {
    return {
      async toDocx(o: { markdownPath: string; trackChanges: boolean }) { void o; return `memory://opening.docx`; },
      async toPdf(o: { markdownPath: string }) { void o; return `memory://opening.pdf`; },
    };
  }
  const { invoke }: { invoke: (cmd: string, args?: unknown) => Promise<unknown> } = await (new Function("s", "return import(s)") as (s: string) => Promise<unknown>)("@tauri-apps/api/core") as { invoke: (cmd: string, args?: unknown) => Promise<unknown> };
  return {
    async toDocx(o: { markdownPath: string; trackChanges: boolean }) { return await invoke("export_pandoc_docx", { markdownPath: o.markdownPath, trackChanges: o.trackChanges }) as string; },
    async toPdf(o: { markdownPath: string }) { return await invoke("export_pandoc_pdf", { markdownPath: o.markdownPath }) as string; },
  };
}
