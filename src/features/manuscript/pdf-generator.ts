// PDF generation helper using Pandoc if available.
// Lightweight: detects pandoc on PATH and converts markdown -> PDF.

import { exec as cpExec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const exec = promisify(cpExec);

export async function checkPandoc(): Promise<boolean> {
  try { await exec('pandoc --version'); return true; } catch { return false; }
}

export async function generatePDF(markdownReport: string): Promise<Buffer | null> {
  const pandocAvailable = await checkPandoc();
  if (!pandocAvailable) { console.warn('Pandoc not available, PDF generation skipped'); return null; }
  const tempMd = path.join(os.tmpdir(), `opening-report-${Date.now()}.md`);
  await fs.writeFile(tempMd, markdownReport, 'utf8');
  const pdfPath = tempMd.replace(/\.md$/, '.pdf');
  const args = [tempMd, '-o', pdfPath, '--pdf-engine=xelatex', '--toc', '--toc-depth=2'];
  try {
    await exec(`pandoc ${args.map(a => `'${a}'`).join(' ')}`);
    const buf = await fs.readFile(pdfPath);
    await fs.unlink(tempMd).catch(()=>{});
    await fs.unlink(pdfPath).catch(()=>{});
    return buf;
  } catch (e) {
    console.error('PDF generation failed:', e);
    return null;
  }
}

export default { generatePDF, checkPandoc };
