// Integration test demonstrating the revision instructions generator with realistic data
import { describe, it, expect } from "vitest";
import { RevisionInstructionGenerator } from "../revision-instructions.js";
import type { AnchoredEdit, Scene } from "../../manuscript/types.js";

describe("RevisionInstructionGenerator Integration", () => {
  it("generates comprehensive instructions for complex editing scenario", () => {
    const generator = new RevisionInstructionGenerator();

    // Realistic manuscript scenes
    const scenes: Scene[] = [
      {
        id: "ch01_s01",
        chapterId: "ch01",
        startOffset: 0,
        endOffset: 500,
        text: `The detective arrived at the crime scene just as the sun was setting. Blood pooled around the victim's head—Sarah Martinez, the brilliant forensic scientist who had been working on the Riverside murders.

"Another one," muttered Detective Jones, noting the similar pattern. Sarah had been close to identifying the killer when she was silenced. Her research would have exposed the truth about the serial killer's identity.`,
        wordCount: 65,
        dialogueRatio: 0.1
      },
      {
        id: "ch01_s02", 
        chapterId: "ch01",
        startOffset: 501,
        endOffset: 800,
        text: `Back at the precinct, Detective Jones reviewed Sarah's files. The killer had left another calling card—a red rose, just like the previous victims. The pattern was becoming clear, but Jones didn't yet know that the killer was actually Sarah's own research partner, Dr. Williams.

"We need to find this maniac before he strikes again," Jones said to his partner.`,
        wordCount: 55,
        dialogueRatio: 0.15
      }
    ];

    const manuscript = scenes.map(s => s.text).join('\n\n');

    // Multiple complex edits simulating spoiler removal and context bridging
    const edits: AnchoredEdit[] = [
      {
        id: "edit1",
        type: "replace",
        anchor: { sceneId: "ch01_s01", offset: 98, length: 39 },
        originalText: "Sarah Martinez, the brilliant forensic scientist",
        newText: "Sarah Martinez, a local resident",
        reason: "Removes premature reveal of victim's profession, which spoils the investigation subplot",
        source: "spoiler",
        priority: 1
      },
      {
        id: "edit2", 
        type: "delete",
        anchor: { sceneId: "ch01_s01", offset: 235, length: 98 },
        originalText: "Sarah had been close to identifying the killer when she was silenced. Her research would have",
        reason: "Eliminates foreshadowing that reduces mystery and suspense",
        source: "spoiler", 
        priority: 2
      },
      {
        id: "edit3",
        type: "replace", 
        anchor: { sceneId: "ch01_s02", offset: 221, length: 84 },
        originalText: "but Jones didn't yet know that the killer was actually Sarah's own research partner, Dr. Williams",
        newText: "though the killer's identity remained a mystery",
        reason: "Removes explicit spoiler of the killer's identity and relationship to victim",
        source: "spoiler",
        priority: 3
      },
      {
        id: "edit4",
        type: "insert",
        anchor: { sceneId: "ch01_s02", offset: 0, length: 0 },
        newText: "Hours later, ",
        reason: "Adds temporal context to bridge the scene transition",
        source: "context",
        priority: 1
      }
    ];

    const instructions = generator.generateInstructions(edits, manuscript, scenes);

    // Verify comprehensive instruction generation
    expect(instructions).toHaveLength(4);

    // Check proper ordering (by scene, then position)
    expect(instructions[0]!.sceneId).toBe("ch01_s01"); // First edit in scene 1
    expect(instructions[1]!.sceneId).toBe("ch01_s01"); // Second edit in scene 1  
    expect(instructions[2]!.sceneId).toBe("ch01_s02"); // Insert at start of scene 2
    expect(instructions[3]!.sceneId).toBe("ch01_s02"); // Replace in scene 2

    // Test detailed instruction content for spoiler removal
    const spoilerEdit = instructions[0]!;
    expect(spoilerEdit.sceneName).toBe("Chapter 1, Scene 1");
    expect(spoilerEdit.instructionType).toBe("replace");
    expect(spoilerEdit.action.verb).toBe("Replace");
    expect(spoilerEdit.action.original).toBe("Sarah Martinez, the brilliant forensic scientist");
    expect(spoilerEdit.action.replacement).toBe("Sarah Martinez, a local resident");
    expect(spoilerEdit.action.explanation).toContain("spoils the investigation subplot");

    // Verify context finding aids
    expect(spoilerEdit.findContext.targetText).toBe("Sarah Martinez, the brilliant forensic scientist");
    expect(spoilerEdit.findContext.precedingText).toBeTruthy();
    expect(spoilerEdit.findContext.followingText).toBeTruthy();
    expect(spoilerEdit.findContext.approximateLine).toBeGreaterThan(0);

    // Test before/after preview generation
    expect(spoilerEdit.beforeAfter!).toBeDefined();
    expect(spoilerEdit.beforeAfter!.before).toContain("Sarah Martinez, the brilliant");
    expect(spoilerEdit.beforeAfter!.after).toContain("local resident");
    expect(spoilerEdit.beforeAfter!.after).not.toContain("brilliant forensic scientist");

    // Test markdown output
    const markdown = generator.formatAsMarkdown(instructions);
    expect(markdown).toContain("# Revision Instructions");
    expect(markdown).toContain("## Table of Contents");
    expect(markdown).toContain("Chapter 1, Scene 1");
    expect(markdown).toContain("Chapter 1, Scene 2"); 
    expect(markdown).toContain("Step 1:");
    expect(markdown).toContain("Step 4:");
    expect(markdown).toContain("**Why**: Removes premature reveal");
    expect(markdown).toContain("**Replace with**:");
    expect(markdown).toContain("**Delete the highlighted text**");
    expect(markdown).toContain("**Insert after**:");

    // Test HTML output with interactive features
    const html = generator.formatAsHTML(instructions);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Progress: <span id=\"progress\">0</span>/4 completed");
    expect(html).toContain("class=\"instruction-card\"");
    expect(html).toContain("copyToClipboard");
    expect(html).toContain("Mark as completed");
    expect(html).toContain("Show Before/After Preview");
    expect(html).toContain("updateProgress()");

    // Verify HTML escaping
    expect(html).not.toContain("<script>alert(");
    expect(html).toContain("&quot;"); // Properly escaped quotes
  });

  it("handles realistic edge cases and formatting", () => {
    const generator = new RevisionInstructionGenerator();

    const scenes: Scene[] = [{
      id: "ch03_s05",
      chapterId: "ch03",
      startOffset: 1000,
      endOffset: 1200,
      text: `"I can't believe you did this to me!" she screamed. The betrayal was complete—her own sister had been working against her all along. But what Jessica didn't know was that Maria's deception ran even deeper than she could imagine.`,
      wordCount: 40,
      dialogueRatio: 0.3
    }];

    const manuscript = scenes[0]!.text;

    // Test with quotes, punctuation, and complex formatting
    const edits: AnchoredEdit[] = [{
      id: "complex_edit",
      type: "replace",
      anchor: { sceneId: "ch03_s05", offset: 130, length: 94 },
      originalText: "But what Jessica didn't know was that Maria's deception ran even deeper than she could imagine.",
      newText: "The full truth would emerge later.",
      reason: "Eliminates explicit foreshadowing while preserving dramatic tension",
      source: "spoiler"
    }];

    const instructions = generator.generateInstructions(edits, manuscript, scenes);
    
    expect(instructions).toHaveLength(1);
    expect(instructions[0]!.sceneName).toBe("Chapter 3, Scene 5");
    
    // Test markdown generation with complex punctuation
    const markdown = generator.formatAsMarkdown(instructions);
    expect(markdown).toContain("Chapter 3, Scene 5");
    expect(markdown).toContain("Jessica didn't know");
    expect(markdown).toContain("The full truth would emerge later");

    // Test HTML generation with proper escaping
    const html = generator.formatAsHTML(instructions);
    expect(html).toContain("Jessica didn"); // Contains the character name
    expect(html).toContain("didn&#39;t know"); // Proper apostrophe escaping
  });

  it("demonstrates scalability with many edits", () => {
    const generator = new RevisionInstructionGenerator();

    // Generate a larger scenario with multiple scenes and many edits
    const scenes: Scene[] = Array.from({ length: 5 }, (_, i) => ({
      id: `ch01_s0${i + 1}`,
      chapterId: "ch01",
      startOffset: i * 200,
      endOffset: (i + 1) * 200,
      text: `Scene ${i + 1} content with some character mentions like John, Sarah, and Dr. Williams. This scene has plot elements and reveals that need careful handling.`,
      wordCount: 25,
      dialogueRatio: 0.1
    }));

    const manuscript = scenes.map(s => s.text).join('\n\n');

    // Generate multiple edits across all scenes
    const edits: AnchoredEdit[] = scenes.flatMap((scene, sceneIndex) => [
      {
        id: `spoiler_${sceneIndex}`,
        type: "replace",
        anchor: { sceneId: scene.id, offset: 50, length: 10 },
        originalText: "character",
        newText: "person",
        reason: `Remove character classification spoiler in scene ${sceneIndex + 1}`,
        source: "spoiler"
      },
      {
        id: `context_${sceneIndex}`,
        type: "insert", 
        anchor: { sceneId: scene.id, offset: 0, length: 0 },
        newText: "Meanwhile, ",
        reason: `Add scene transition context for scene ${sceneIndex + 1}`,
        source: "context"
      }
    ]);

    const instructions = generator.generateInstructions(edits, manuscript, scenes);

    // Should handle 10 edits efficiently
    expect(instructions).toHaveLength(10);
    
    // Should maintain proper ordering
    expect(instructions[0]!.sceneId).toBe("ch01_s01");
    expect(instructions[1]!.sceneId).toBe("ch01_s01");
    expect(instructions[2]!.sceneId).toBe("ch01_s02");
    
    // Test that markdown scales reasonably
    const markdown = generator.formatAsMarkdown(instructions);
    expect(markdown.length).toBeGreaterThan(2000); // Substantial content
    expect(markdown).toContain("Step 10:"); // All steps present
    
    // Test that HTML includes progress tracking
    const html = generator.formatAsHTML(instructions);
    expect(html).toContain(">/10 completed"); // Should show 0/10 or similar
    expect(html.split('class="instruction-card"')).toHaveLength(11); // 10 cards + 1 for the split
  });
});