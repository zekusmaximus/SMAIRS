// High-level rendering orchestrator (markdown + optional PDF)
import { buildComparativeReport, type ComparativeReport } from './opening-report.js';
import { generatePDF } from './pdf-generator.js';

export interface BuildAndRenderParams { core: Parameters<typeof buildComparativeReport>[0]; includePDF?: boolean }

export async function buildAndRender(params: BuildAndRenderParams): Promise<ComparativeReport> {
  const rep = buildComparativeReport(params.core);
  if (params.includePDF) {
    try { rep.exportFormats.pdf = await generatePDF(rep.exportFormats.markdown) ?? undefined; } catch { /* swallow */ }
  }
  return rep;
}

export default { buildAndRender };
