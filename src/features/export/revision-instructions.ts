// File: src/features/export/revision-instructions.ts
// Human-readable revision instruction generator for manual application of anchored edits

import type { AnchoredEdit } from "../manuscript/types.js";
import type { Scene } from "../manuscript/types.js";

export interface RevisionInstruction {
  stepNumber: number;
  sceneId: string;
  sceneName: string;  // Human-readable like "Chapter 3, Scene 2"
  instructionType: 'find' | 'replace' | 'insert' | 'delete';
  
  // Context for finding the location
  findContext: {
    precedingText: string;  // 50 chars before
    targetText: string;     // The exact text to find
    followingText: string;  // 50 chars after
    approximateLine?: number;
    approximateParagraph?: number;
  };
  
  // The actual change
  action: {
    verb: string;  // "Replace", "Insert", "Delete"
    original?: string;
    replacement?: string;
    explanation: string;  // Why this change
  };
  
  // Visual aid
  beforeAfter?: {
    before: string;  // Paragraph with highlight
    after: string;   // Paragraph after change
  };
}

interface GroupedEdit {
  edit: AnchoredEdit;
  scene: Scene;
  sceneName: string;
  precedingText: string;
  followingText: string;
  approximateLine: number;
  approximateParagraph: number;
}

export class RevisionInstructionGenerator {
  
  generateInstructions(
    edits: AnchoredEdit[],
    _manuscript: string,
    scenes: Scene[]
  ): RevisionInstruction[] {
    if (!edits.length) return [];
    
    // Create scene lookup for performance
    const sceneMap = new Map(scenes.map(s => [s.id, s]));
    
    // Group and enrich edits with context
    const groupedEdits = this.groupAndEnrichEdits(edits, sceneMap);
    
    // Sort by scene order, then by position within scene
    const sortedEdits = this.sortEditsByPosition(groupedEdits);
    
    // Generate instructions
    return sortedEdits.map((groupedEdit, index) => 
      this.createInstruction(groupedEdit, index + 1)
    );
  }
  
  formatAsMarkdown(instructions: RevisionInstruction[]): string {
    if (!instructions.length) {
      return "# Revision Instructions\n\nNo revisions required.";
    }
    
    const markdown = ["# Revision Instructions"];
    
    // Table of contents
    markdown.push("\n## Table of Contents");
    const sceneGroups = this.groupInstructionsByScene(instructions);
    sceneGroups.forEach((sceneInstructions, sceneName) => {
      markdown.push(`- [${sceneName}](#${this.createAnchor(sceneName)}) (${sceneInstructions.length} change${sceneInstructions.length > 1 ? 's' : ''})`);
    });
    
    // Instructions by scene
    sceneGroups.forEach((sceneInstructions, sceneName) => {
      markdown.push(`\n## ${sceneName}\n`);
      
      sceneInstructions.forEach(instruction => {
        markdown.push(`### Step ${instruction.stepNumber}: ${this.getActionTitle(instruction)}`);
        markdown.push(`**Find this text** (approximately line ${instruction.findContext.approximateLine}):`);
        markdown.push(`> "${instruction.findContext.precedingText}**${instruction.findContext.targetText}**${instruction.findContext.followingText}"`);
        markdown.push("");
        
        if (instruction.action.verb === "Replace") {
          markdown.push(`**Replace with**:`);
          markdown.push(`> "${instruction.action.replacement}"`);
        } else if (instruction.action.verb === "Insert") {
          markdown.push(`**Insert after**:`);
          markdown.push(`> "${instruction.action.replacement}"`);
        } else if (instruction.action.verb === "Delete") {
          markdown.push(`**Delete the highlighted text**`);
        }
        
        markdown.push("");
        markdown.push(`**Why**: ${instruction.action.explanation}`);
        
        if (instruction.beforeAfter) {
          markdown.push("");
          markdown.push("**Before**:");
          markdown.push(`> ${instruction.beforeAfter.before}`);
          markdown.push("**After**:");
          markdown.push(`> ${instruction.beforeAfter.after}`);
        }
        
        markdown.push("");
      });
    });
    
    return markdown.join("\n");
  }
  
  formatAsHTML(instructions: RevisionInstruction[]): string {
    if (!instructions.length) {
      return this.wrapInHTMLTemplate("<h1>Revision Instructions</h1><p>No revisions required.</p>");
    }
    
    const html = [`<h1>Revision Instructions</h1>`];
    
    // Progress tracking
    html.push(`<div class="progress-container">`);
    html.push(`<p>Progress: <span id="progress">0</span>/${instructions.length} completed</p>`);
    html.push(`<div class="progress-bar"><div class="progress-fill" style="width: 0%"></div></div>`);
    html.push(`</div>`);
    
    // Table of contents
    html.push(`<h2>Table of Contents</h2>`);
    html.push(`<ul class="toc">`);
    const sceneGroups = this.groupInstructionsByScene(instructions);
    sceneGroups.forEach((sceneInstructions, sceneName) => {
      html.push(`<li><a href="#${this.createAnchor(sceneName)}">${sceneName}</a> (${sceneInstructions.length} change${sceneInstructions.length > 1 ? 's' : ''})</li>`);
    });
    html.push(`</ul>`);
    
    // Instructions by scene
    sceneGroups.forEach((sceneInstructions, sceneName) => {
      html.push(`<h2 id="${this.createAnchor(sceneName)}">${sceneName}</h2>`);
      
      sceneInstructions.forEach(instruction => {
        html.push(`<div class="instruction-card" data-step="${instruction.stepNumber}">`);
        html.push(`<h3>Step ${instruction.stepNumber}: ${this.getActionTitle(instruction)}</h3>`);
        
        html.push(`<div class="find-section">`);
        html.push(`<p><strong>Find this text</strong> (approximately line ${instruction.findContext.approximateLine}):</p>`);
        html.push(`<div class="find-text">`);
        html.push(`<span class="context-before">${this.escapeHtml(instruction.findContext.precedingText)}</span>`);
        html.push(`<span class="target-text">${this.escapeHtml(instruction.findContext.targetText)}</span>`);
        html.push(`<span class="context-after">${this.escapeHtml(instruction.findContext.followingText)}</span>`);
        html.push(`<button class="copy-btn" onclick="copyToClipboard('${this.escapeForJs(instruction.findContext.targetText)}')">Copy</button>`);
        html.push(`</div>`);
        html.push(`</div>`);
        
        if (instruction.action.verb === "Replace") {
          html.push(`<div class="action-section">`);
          html.push(`<p><strong>Replace with</strong>:</p>`);
          html.push(`<div class="replacement-text">${this.escapeHtml(instruction.action.replacement || '')}`);
          html.push(`<button class="copy-btn" onclick="copyToClipboard('${this.escapeForJs(instruction.action.replacement || '')}')">Copy</button></div>`);
          html.push(`</div>`);
        } else if (instruction.action.verb === "Insert") {
          html.push(`<div class="action-section">`);
          html.push(`<p><strong>Insert after</strong>:</p>`);
          html.push(`<div class="replacement-text">${this.escapeHtml(instruction.action.replacement || '')}`);
          html.push(`<button class="copy-btn" onclick="copyToClipboard('${this.escapeForJs(instruction.action.replacement || '')}')">Copy</button></div>`);
          html.push(`</div>`);
        } else if (instruction.action.verb === "Delete") {
          html.push(`<div class="action-section">`);
          html.push(`<p><strong>Delete the highlighted text</strong></p>`);
          html.push(`</div>`);
        }
        
        html.push(`<div class="explanation">`);
        html.push(`<p><strong>Why</strong>: ${this.escapeHtml(instruction.action.explanation)}</p>`);
        html.push(`</div>`);
        
        if (instruction.beforeAfter) {
          html.push(`<details class="before-after">`);
          html.push(`<summary>Show Before/After Preview</summary>`);
          html.push(`<div class="comparison">`);
          html.push(`<div class="before-text"><strong>Before:</strong><br>${this.escapeHtml(instruction.beforeAfter.before)}</div>`);
          html.push(`<div class="after-text"><strong>After:</strong><br>${this.escapeHtml(instruction.beforeAfter.after)}</div>`);
          html.push(`</div>`);
          html.push(`</details>`);
        }
        
        html.push(`<div class="checkbox-container">`);
        html.push(`<label><input type="checkbox" onchange="updateProgress()"> Mark as completed</label>`);
        html.push(`</div>`);
        
        html.push(`</div>`); // close instruction-card
      });
    });
    
    return this.wrapInHTMLTemplate(html.join("\n"));
  }
  
  private groupAndEnrichEdits(
    edits: AnchoredEdit[], 
    sceneMap: Map<string, Scene>
  ): GroupedEdit[] {
    return edits.map(edit => {
      const scene = sceneMap.get(edit.anchor.sceneId);
      if (!scene) {
        throw new Error(`Scene not found: ${edit.anchor.sceneId}`);
      }
      
      const sceneName = this.generateSceneName(scene);
      const sceneText = scene.text;
      const offset = edit.anchor.offset;
      
      // Extract context around the target position
      const precedingText = this.extractPrecedingText(sceneText, offset, 50);
      const followingText = this.extractFollowingText(sceneText, offset + edit.anchor.length, 50);
      
      // Calculate approximate line and paragraph
      const approximateLine = this.calculateApproximateLine(sceneText, offset);
      const approximateParagraph = this.calculateApproximateParagraph(sceneText, offset);
      
      return {
        edit,
        scene,
        sceneName,
        precedingText,
        followingText,
        approximateLine,
        approximateParagraph
      };
    });
  }
  
  private sortEditsByPosition(groupedEdits: GroupedEdit[]): GroupedEdit[] {
    return groupedEdits.sort((a, b) => {
      // First sort by scene order (using scene startOffset as proxy)
      const sceneOrder = a.scene.startOffset - b.scene.startOffset;
      if (sceneOrder !== 0) return sceneOrder;
      
      // Then sort by position within scene
      return a.edit.anchor.offset - b.edit.anchor.offset;
    });
  }
  
  private createInstruction(groupedEdit: GroupedEdit, stepNumber: number): RevisionInstruction {
    const { edit, scene, sceneName, precedingText, followingText, approximateLine, approximateParagraph } = groupedEdit;
    
    // Determine target text based on edit type
    let targetText = "";
    if (edit.type === "delete" || edit.type === "replace") {
      targetText = edit.originalText || scene.text.slice(edit.anchor.offset, edit.anchor.offset + edit.anchor.length);
    } else {
      // For inserts, show a few characters around the insertion point
      targetText = scene.text.slice(Math.max(0, edit.anchor.offset - 5), edit.anchor.offset + 5);
    }
    
    // Generate action details
    const action = this.generateActionDetails(edit);
    
    // Generate before/after preview
    const beforeAfter = this.generateBeforeAfter(edit, scene.text);
    
    return {
      stepNumber,
      sceneId: edit.anchor.sceneId,
      sceneName,
      instructionType: this.mapEditTypeToInstructionType(edit.type),
      findContext: {
        precedingText,
        targetText,
        followingText,
        approximateLine,
        approximateParagraph
      },
      action,
      beforeAfter
    };
  }
  
  private generateSceneName(scene: Scene): string {
    // Parse scene ID to generate human-readable name
    const match = scene.id.match(/^ch(\d+)_s(\d+)$/);
    if (match) {
      const chapterNum = parseInt(match[1]!, 10);
      const sceneNum = parseInt(match[2]!, 10);
      return `Chapter ${chapterNum}, Scene ${sceneNum}`;
    }
    // Fallback to scene ID if pattern doesn't match
    return `Scene ${scene.id}`;
  }
  
  private extractPrecedingText(text: string, offset: number, maxChars: number): string {
    const start = Math.max(0, offset - maxChars);
    return text.slice(start, offset).trim();
  }
  
  private extractFollowingText(text: string, offset: number, maxChars: number): string {
    const end = Math.min(text.length, offset + maxChars);
    return text.slice(offset, end).trim();
  }
  
  private calculateApproximateLine(text: string, offset: number): number {
    return text.slice(0, offset).split('\n').length;
  }
  
  private calculateApproximateParagraph(text: string, offset: number): number {
    return text.slice(0, offset).split(/\n\s*\n/).length;
  }
  
  private mapEditTypeToInstructionType(editType: AnchoredEdit['type']): RevisionInstruction['instructionType'] {
    switch (editType) {
      case 'insert': return 'insert';
      case 'delete': return 'delete';
      case 'replace': return 'replace';
      default: return 'find';
    }
  }
  
  private generateActionDetails(edit: AnchoredEdit): RevisionInstruction['action'] {
    const reason = edit.reason || "This change improves the manuscript";
    
    switch (edit.type) {
      case 'insert':
        return {
          verb: 'Insert',
          replacement: edit.newText,
          explanation: reason
        };
      case 'delete':
        return {
          verb: 'Delete',
          original: edit.originalText,
          explanation: reason
        };
      case 'replace':
        return {
          verb: 'Replace',
          original: edit.originalText,
          replacement: edit.newText,
          explanation: reason
        };
      default:
        throw new Error(`Unknown edit type: ${edit.type}`);
    }
  }
  
  private generateBeforeAfter(edit: AnchoredEdit, sceneText: string): RevisionInstruction['beforeAfter'] {
    const contextRadius = 100; // chars before and after the edit
    const editStart = edit.anchor.offset;
    const editEnd = editStart + edit.anchor.length;
    
    const beforeStart = Math.max(0, editStart - contextRadius);
    const afterEnd = Math.min(sceneText.length, editEnd + contextRadius);
    
    // Extract the before context
    const beforeContext = sceneText.slice(beforeStart, editStart);
    const originalText = sceneText.slice(editStart, editEnd);
    const afterContext = sceneText.slice(editEnd, afterEnd);
    
    const before = `${beforeContext}**${originalText}**${afterContext}`;
    
    // Generate after text based on edit type
    let after: string;
    switch (edit.type) {
      case 'insert':
        after = `${beforeContext}${originalText}**${edit.newText || ''}**${afterContext}`;
        break;
      case 'delete':
        after = `${beforeContext}${afterContext}`;
        break;
      case 'replace':
        after = `${beforeContext}**${edit.newText || ''}**${afterContext}`;
        break;
      default:
        after = before;
    }
    
    return { before, after };
  }
  
  private groupInstructionsByScene(instructions: RevisionInstruction[]): Map<string, RevisionInstruction[]> {
    const groups = new Map<string, RevisionInstruction[]>();
    
    for (const instruction of instructions) {
      const sceneName = instruction.sceneName;
      if (!groups.has(sceneName)) {
        groups.set(sceneName, []);
      }
      groups.get(sceneName)!.push(instruction);
    }
    
    return groups;
  }
  
  private createAnchor(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  
  private getActionTitle(instruction: RevisionInstruction): string {
    switch (instruction.action.verb) {
      case 'Replace': return `Replace Text`;
      case 'Insert': return `Add New Content`;
      case 'Delete': return `Remove Content`;
      default: return `Modify Content`;
    }
  }
  
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  
  private escapeForJs(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }
  
  private wrapInHTMLTemplate(content: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Revision Instructions</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }
        
        .progress-container {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 30px;
        }
        
        .progress-bar {
            background: #e0e0e0;
            height: 8px;
            border-radius: 4px;
            overflow: hidden;
        }
        
        .progress-fill {
            background: #4CAF50;
            height: 100%;
            transition: width 0.3s ease;
        }
        
        .toc {
            background: #f9f9f9;
            padding: 15px;
            border-left: 4px solid #2196F3;
        }
        
        .instruction-card {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            background: white;
        }
        
        .find-section {
            background: #fff3cd;
            padding: 15px;
            border-radius: 6px;
            margin: 15px 0;
        }
        
        .find-text {
            position: relative;
            font-family: 'Courier New', monospace;
            background: white;
            padding: 10px;
            border-radius: 4px;
            margin-top: 10px;
        }
        
        .context-before, .context-after {
            color: #666;
        }
        
        .target-text {
            background: #ffeb3b;
            font-weight: bold;
            padding: 2px 4px;
            border-radius: 3px;
        }
        
        .action-section {
            background: #d4edda;
            padding: 15px;
            border-radius: 6px;
            margin: 15px 0;
        }
        
        .replacement-text {
            position: relative;
            font-family: 'Courier New', monospace;
            background: white;
            padding: 10px;
            border-radius: 4px;
            margin-top: 10px;
        }
        
        .explanation {
            background: #e7f3ff;
            padding: 15px;
            border-radius: 6px;
            margin: 15px 0;
        }
        
        .before-after {
            margin: 15px 0;
        }
        
        .comparison {
            display: flex;
            gap: 20px;
            margin-top: 10px;
        }
        
        .before-text, .after-text {
            flex: 1;
            font-family: 'Courier New', monospace;
            background: #f8f9fa;
            padding: 10px;
            border-radius: 4px;
            font-size: 14px;
        }
        
        .checkbox-container {
            margin-top: 20px;
            padding-top: 15px;
            border-top: 1px solid #eee;
        }
        
        .copy-btn {
            position: absolute;
            top: 5px;
            right: 5px;
            background: #2196F3;
            color: white;
            border: none;
            padding: 4px 8px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }
        
        .copy-btn:hover {
            background: #1976D2;
        }
        
        details summary {
            cursor: pointer;
            color: #2196F3;
            font-weight: bold;
        }
        
        h1, h2, h3 {
            color: #2c3e50;
        }
        
        h1 {
            border-bottom: 2px solid #3498db;
            padding-bottom: 10px;
        }
        
        @media (max-width: 600px) {
            .comparison {
                flex-direction: column;
            }
        }
    </style>
</head>
<body>
    ${content}
    
    <script>
        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(function() {
                // Could add a success message here
            });
        }
        
        function updateProgress() {
            const checkboxes = document.querySelectorAll('.checkbox-container input[type="checkbox"]');
            const checked = document.querySelectorAll('.checkbox-container input[type="checkbox"]:checked');
            const progress = Math.round((checked.length / checkboxes.length) * 100);
            
            document.getElementById('progress').textContent = checked.length;
            document.querySelector('.progress-fill').style.width = progress + '%';
        }
    </script>
</body>
</html>`;
  }
}