import { distance as levenshteinDistance } from "fastest-levenshtein";
import type { AnchoredEdit } from "../manuscript/types.js";
import type { AppliedResult, ChangeEntry, ValidationReport } from "./types.js";

function wordCount(s: string): number { return s.trim() ? s.trim().split(/\s+/).length : 0; }

export class PatchApplicator {
  applyPatches(originalText: string, patches: AnchoredEdit[]): AppliedResult {
    const changeLog: ChangeEntry[] = [];
    const src = originalText;
    // Defensive copy and sort by anchor offset descending to avoid shifting
    const sorted = patches.slice().sort((a, b) => (b.anchor.offset - a.anchor.offset) || ((b.priority ?? 0) - (a.priority ?? 0)));

    let text = src;
    let wordsAdded = 0, wordsRemoved = 0, wordsModified = 0;

    for (const p of sorted) {
      const pos = p.anchor.offset;
      const len = p.anchor.length;
      const within = pos >= 0 && pos + len <= text.length;
      const snippet = within ? text.slice(pos, pos + len) : "";

      // Validate anchor if we have expected originalText for delete/replace
      let valid = within;
      let reason: string | undefined;
      if ((p.type === 'delete' || p.type === 'replace') && p.originalText != null) {
        const expected = p.originalText;
        if (snippet !== expected) {
          // allow small drift via fuzzy check
          const dist = levenshteinDistance(snippet, expected);
          const tol = Math.max(1, Math.floor(expected.length * 0.1));
          if (dist > tol) { valid = false; reason = `anchor mismatch (distance ${dist} > ${tol})`; }
        }
      }

      if (!valid) {
        changeLog.push({ id: p.id, type: p.type, position: pos, originalSnippet: snippet, newSnippet: p.newText, success: false, reason: reason ?? 'invalid position' });
        continue;
      }

      if (p.type === 'insert') {
        const ins = p.newText ?? '';
        text = text.slice(0, pos) + ins + text.slice(pos);
        wordsAdded += wordCount(ins);
        changeLog.push({ id: p.id, type: p.type, position: pos, newSnippet: ins, success: true });
      } else if (p.type === 'delete') {
        text = text.slice(0, pos) + text.slice(pos + len);
        wordsRemoved += wordCount(snippet);
        changeLog.push({ id: p.id, type: p.type, position: pos, originalSnippet: snippet, success: true });
      } else if (p.type === 'replace') {
        const rep = p.newText ?? '';
        text = text.slice(0, pos) + rep + text.slice(pos + len);
        const before = wordCount(snippet);
        const after = wordCount(rep);
        if (after > before) wordsAdded += after - before; else wordsRemoved += before - after;
        wordsModified += Math.min(before, after);
        changeLog.push({ id: p.id, type: p.type, position: pos, originalSnippet: snippet, newSnippet: rep, success: true });
      }
    }

    const successCount = changeLog.filter(c => c.success).length;
    const successRate = sorted.length ? successCount / sorted.length : 1;
    return {
      patchedText: text,
      changeLog,
      statistics: { wordsAdded, wordsRemoved, wordsModified, successRate },
    };
  }

  validateContinuity(patchedText: string): ValidationReport {
    const warnings: string[] = [];
    // Character consistency: look for non-ASCII control chars
    // Avoid control chars (explicit scan to avoid lint on regex control escapes)
    let bad = false;
    for (let i = 0; i < Math.min(patchedText.length, 10000); i++) {
      const code = patchedText.charCodeAt(i);
      if ((code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127) { bad = true; break; }
    }
    if (bad) warnings.push("Non-printable characters detected");

    // Timeline integrity: naive check for backward chapter numbering like CH10 followed by CH01
    const chapterMatches = [...patchedText.matchAll(/CH(\d{2})/g)].map(m => parseInt((m[1] || "0"), 10));
    let timelineOk = true;
    for (let i = 1; i < chapterMatches.length; i++) {
      const prev = chapterMatches[i - 1] ?? 0;
      const curr = chapterMatches[i] ?? prev;
      if (curr < prev) { timelineOk = false; break; }
    }
    if (!timelineOk) warnings.push("Chapter numbering appears to go backwards");

    // Scene references: check dangling placeholders like [SCENE: ...] without closing
    if ((patchedText.match(/\[SCENE:[^\]]*\]/g) || []).length === 0 && /\[SCENE:/i.test(patchedText)) {
      warnings.push("Unclosed scene reference tag");
    }

    // Orphaned pronouns: extremely naive heuristic – lines starting with pronoun without prior noun in 2 lines
    const lines = patchedText.split(/\n/);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]?.trim() ?? '';
      if (/^(he|she|they|it|him|her|them)\b/i.test(l)) {
        const context = lines.slice(Math.max(0, i - 2), i).join(' ');
        if (!/\b[A-Z][a-z]+\b/.test(context)) warnings.push(`Possible orphaned pronoun near line ${i + 1}`);
      }
    }

    return {
      characterConsistencyOk: !bad,
      timelineOk,
      sceneRefsOk: !warnings.some(w => /scene reference/i.test(w)),
      pronounsOk: !warnings.some(w => /pronoun/i.test(w)),
      warnings,
    };
  }
}
