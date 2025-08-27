// Tests for revision instructions generator
import { describe, it, expect } from "vitest";
import { RevisionInstructionGenerator } from "../revision-instructions.js";
import type { AnchoredEdit, Scene } from "../../manuscript/types.js";

describe("RevisionInstructionGenerator", () => {
  let generator: RevisionInstructionGenerator;

  const mockScenes: Scene[] = [
    {
      id: "ch01_s01",
      chapterId: "ch01", 
      startOffset: 0,
      endOffset: 200,
      text: `The morning sun cast long shadows across the laboratory floor. Sarah, the brilliant scientist, was already there when I arrived, her dark hair pulled back in a messy bun as she hunched over her microscope.

"You're late," she said without looking up. "The samples won't analyze themselves."`,
      wordCount: 45,
      dialogueRatio: 0.3
    },
    {
      id: "ch01_s02", 
      chapterId: "ch01",
      startOffset: 201,
      endOffset: 400,
      text: `I set down my coffee and walked to the adjacent workstation. The revelation that Sarah was working for the enemy would come later, but for now, she was just my research partner.

"What did you find in the blood samples?" I asked, pulling on latex gloves.`,
      wordCount: 40,
      dialogueRatio: 0.25
    },
    {
      id: "ch02_s01",
      chapterId: "ch02",
      startOffset: 401, 
      endOffset: 600,
      text: `Three days passed before the truth emerged. Sarah's betrayal cut deeper than any physical wound. The data she'd been feeding to our competitors wasn't just corporate espionage—it was personal.

I confronted her in the same laboratory where we'd shared countless discoveries.`,
      wordCount: 42,
      dialogueRatio: 0.1
    }
  ];

  const manuscript = mockScenes.map(s => s.text).join('\n\n');

  beforeEach(() => {
    generator = new RevisionInstructionGenerator();
  });

  describe("generateInstructions", () => {
    it("generates clear find-and-replace instructions", () => {
      const edits: AnchoredEdit[] = [{
        id: "edit1",
        type: "replace",
        anchor: { sceneId: "ch01_s01", offset: 67, length: 26 },
        originalText: "Sarah, the brilliant scientist",
        newText: "Sarah",
        reason: "Remove premature character description",
        source: "spoiler"
      }];

      const instructions = generator.generateInstructions(edits, manuscript, mockScenes);

      expect(instructions).toHaveLength(1);
      const instruction = instructions[0]!;
      expect(instruction.stepNumber).toBe(1);
      expect(instruction.sceneId).toBe("ch01_s01");
      expect(instruction.sceneName).toBe("Chapter 1, Scene 1");
      expect(instruction.instructionType).toBe("replace");
      expect(instruction.action.verb).toBe("Replace");
      expect(instruction.action.original).toBe("Sarah, the brilliant scientist");
      expect(instruction.action.replacement).toBe("Sarah");
      expect(instruction.action.explanation).toBe("Remove premature character description");
    });

    it("provides sufficient context to locate text", () => {
      const edits: AnchoredEdit[] = [{
        id: "edit1", 
        type: "replace",
        anchor: { sceneId: "ch01_s01", offset: 67, length: 26 },
        originalText: "Sarah, the brilliant scientist",
        newText: "Sarah",
        reason: "Remove spoiler"
      }];

      const instructions = generator.generateInstructions(edits, manuscript, mockScenes);
      const instruction = instructions[0]!;

      expect(instruction.findContext.precedingText).toBeTruthy();
      expect(instruction.findContext.targetText).toBe("Sarah, the brilliant scientist");
      expect(instruction.findContext.followingText).toBeTruthy();
      expect(instruction.findContext.approximateLine).toBeGreaterThan(0);
      expect(instruction.findContext.approximateParagraph).toBeGreaterThan(0);

      // Should provide enough context (at least a few words before/after)
      expect(instruction.findContext.precedingText.length).toBeGreaterThan(5);
      expect(instruction.findContext.followingText.length).toBeGreaterThan(5);
    });

    it("groups instructions by scene", () => {
      const edits: AnchoredEdit[] = [
        {
          id: "edit1",
          type: "replace", 
          anchor: { sceneId: "ch01_s01", offset: 67, length: 26 },
          originalText: "Sarah, the brilliant scientist",
          newText: "Sarah",
          reason: "Remove spoiler"
        },
        {
          id: "edit2",
          type: "delete",
          anchor: { sceneId: "ch01_s02", offset: 74, length: 31 },
          originalText: "The revelation that Sarah was working for the enemy would come later, but for now,",
          reason: "Remove foreshadowing"
        },
        {
          id: "edit3", 
          type: "replace",
          anchor: { sceneId: "ch01_s01", offset: 150, length: 4 },
          originalText: "late",
          newText: "early",
          reason: "Fix continuity"
        }
      ];

      const instructions = generator.generateInstructions(edits, manuscript, mockScenes);

      expect(instructions).toHaveLength(3);
      
      // Should be sorted by scene order, then position
      expect(instructions[0]!.sceneId).toBe("ch01_s01");
      expect(instructions[1]!.sceneId).toBe("ch01_s01"); 
      expect(instructions[2]!.sceneId).toBe("ch01_s02");

      // Within same scene, should be sorted by position
      expect(instructions[0]!.findContext.targetText).toBe("Sarah, the brilliant scientist"); // offset 67
      expect(instructions[1]!.findContext.targetText).toBe("late"); // offset 150
    });

    it("handles overlapping edits gracefully", () => {
      const edits: AnchoredEdit[] = [
        {
          id: "edit1",
          type: "replace",
          anchor: { sceneId: "ch01_s01", offset: 67, length: 26 },
          originalText: "Sarah, the brilliant scientist",  
          newText: "Sarah",
          reason: "Remove spoiler"
        },
        {
          id: "edit2", 
          type: "replace",
          anchor: { sceneId: "ch01_s01", offset: 75, length: 18 },
          originalText: "brilliant scientist",
          newText: "researcher", 
          reason: "Tone down description"
        }
      ];

      // Should not throw error even with overlapping edits
      expect(() => {
        generator.generateInstructions(edits, manuscript, mockScenes);
      }).not.toThrow();

      const instructions = generator.generateInstructions(edits, manuscript, mockScenes);
      expect(instructions).toHaveLength(2);
    });

    it("includes before/after examples", () => {
      const edits: AnchoredEdit[] = [{
        id: "edit1",
        type: "replace",
        anchor: { sceneId: "ch01_s01", offset: 67, length: 26 },
        originalText: "Sarah, the brilliant scientist",
        newText: "Sarah", 
        reason: "Remove spoiler"
      }];

      const instructions = generator.generateInstructions(edits, manuscript, mockScenes);
      const instruction = instructions[0]!;

      expect(instruction.beforeAfter!).toBeDefined();
      expect(instruction.beforeAfter!.before).toContain("h, the brilliant scientist**");
      expect(instruction.beforeAfter!.after).toContain("**Sarah**");
      expect(instruction.beforeAfter!.after).not.toContain("brilliant scientist");
    });

    it("explains why each change is needed", () => {
      const edits: AnchoredEdit[] = [
        {
          id: "edit1",
          type: "replace",
          anchor: { sceneId: "ch01_s01", offset: 67, length: 26 },
          originalText: "Sarah, the brilliant scientist",
          newText: "Sarah",
          reason: "Removes premature character background that spoils later reveal"
        },
        {
          id: "edit2",
          type: "delete", 
          anchor: { sceneId: "ch01_s02", offset: 74, length: 31 },
          originalText: "The revelation that would come later",
          reason: "Eliminates foreshadowing that reduces suspense"
        }
      ];

      const instructions = generator.generateInstructions(edits, manuscript, mockScenes);

      expect(instructions[0]!.action.explanation).toBe("Removes premature character background that spoils later reveal");
      expect(instructions[1]!.action.explanation).toBe("Eliminates foreshadowing that reduces suspense");
    });

    it("handles insert operations", () => {
      const edits: AnchoredEdit[] = [{
        id: "edit1",
        type: "insert",
        anchor: { sceneId: "ch01_s01", offset: 67, length: 0 },
        newText: "Dr. ",
        reason: "Add professional title for consistency"
      }];

      const instructions = generator.generateInstructions(edits, manuscript, mockScenes);
      const instruction = instructions[0]!;

      expect(instruction.instructionType).toBe("insert");
      expect(instruction.action.verb).toBe("Insert");
      expect(instruction.action.replacement).toBe("Dr. ");
      expect(instruction.beforeAfter!.after).toContain("**Dr. **");
    });

    it("handles delete operations", () => {
      const edits: AnchoredEdit[] = [{
        id: "edit1", 
        type: "delete",
        anchor: { sceneId: "ch01_s01", offset: 67, length: 26 },
        originalText: "Sarah, the brilliant scientist",
        reason: "Remove character description"
      }];

      const instructions = generator.generateInstructions(edits, manuscript, mockScenes);
      const instruction = instructions[0]!;

      expect(instruction.instructionType).toBe("delete");
      expect(instruction.action.verb).toBe("Delete");
      expect(instruction.action.original).toBe("Sarah, the brilliant scientist");
      expect(instruction.beforeAfter!.before).toContain("h, the brilliant scientist**");
      expect(instruction.beforeAfter!.after).not.toContain("Sarah, the brilliant scientist");
    });

    it("handles empty edits array", () => {
      const instructions = generator.generateInstructions([], manuscript, mockScenes);
      expect(instructions).toHaveLength(0);
    });

    it("throws error for missing scene", () => {
      const edits: AnchoredEdit[] = [{
        id: "edit1",
        type: "replace",
        anchor: { sceneId: "nonexistent_scene", offset: 0, length: 5 },
        originalText: "test",
        newText: "replacement",
        reason: "test"
      }];

      expect(() => {
        generator.generateInstructions(edits, manuscript, mockScenes);
      }).toThrow("Scene not found: nonexistent_scene");
    });
  });

  describe("formatAsMarkdown", () => {
    it("produces valid markdown output", () => {
      const edits: AnchoredEdit[] = [{
        id: "edit1",
        type: "replace",
        anchor: { sceneId: "ch01_s01", offset: 67, length: 26 },
        originalText: "Sarah, the brilliant scientist", 
        newText: "Sarah",
        reason: "Remove premature character description"
      }];

      const instructions = generator.generateInstructions(edits, manuscript, mockScenes);
      const markdown = generator.formatAsMarkdown(instructions);

      expect(markdown).toContain("# Revision Instructions");
      expect(markdown).toContain("## Table of Contents");
      expect(markdown).toContain("## Chapter 1, Scene 1");
      expect(markdown).toContain("### Step 1:");
      expect(markdown).toContain("**Find this text**");
      expect(markdown).toContain("**Replace with**:");
      expect(markdown).toContain("**Why**:");
      expect(markdown).toContain("Remove premature character description");
    });

    it("handles empty instructions", () => {
      const markdown = generator.formatAsMarkdown([]);
      expect(markdown).toBe("# Revision Instructions\n\nNo revisions required.");
    });

    it("groups by scene in markdown", () => {
      const edits: AnchoredEdit[] = [
        {
          id: "edit1",
          type: "replace",
          anchor: { sceneId: "ch01_s01", offset: 67, length: 26 },
          originalText: "Sarah, the brilliant scientist",
          newText: "Sarah",
          reason: "Remove spoiler"
        },
        {
          id: "edit2",
          type: "delete",
          anchor: { sceneId: "ch02_s01", offset: 50, length: 10 },
          originalText: "betrayal cut",
          reason: "Reduce emotional intensity"
        }
      ];

      const instructions = generator.generateInstructions(edits, manuscript, mockScenes);
      const markdown = generator.formatAsMarkdown(instructions);

      expect(markdown).toContain("## Chapter 1, Scene 1");
      expect(markdown).toContain("## Chapter 2, Scene 1");
      expect(markdown.indexOf("Chapter 1, Scene 1")).toBeLessThan(markdown.indexOf("Chapter 2, Scene 1"));
    });
  });

  describe("formatAsHTML", () => {
    it("produces valid HTML output", () => {
      const edits: AnchoredEdit[] = [{
        id: "edit1",
        type: "replace", 
        anchor: { sceneId: "ch01_s01", offset: 67, length: 26 },
        originalText: "Sarah, the brilliant scientist",
        newText: "Sarah",
        reason: "Remove premature character description"
      }];

      const instructions = generator.generateInstructions(edits, manuscript, mockScenes);
      const html = generator.formatAsHTML(instructions);

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html lang=\"en\">");
      expect(html).toContain("<h1>Revision Instructions</h1>");
      expect(html).toContain("class=\"instruction-card\"");
      expect(html).toContain("class=\"find-text\"");
      expect(html).toContain("class=\"copy-btn\"");
      expect(html).toContain("type=\"checkbox\"");
      expect(html).toContain("updateProgress()");
    });

    it("includes interactive features", () => {
      const edits: AnchoredEdit[] = [{
        id: "edit1", 
        type: "replace",
        anchor: { sceneId: "ch01_s01", offset: 67, length: 26 },
        originalText: "Sarah, the brilliant scientist",
        newText: "Sarah", 
        reason: "Remove spoiler"
      }];

      const instructions = generator.generateInstructions(edits, manuscript, mockScenes);
      const html = generator.formatAsHTML(instructions);

      // Should include progress tracking
      expect(html).toContain("Progress:");
      expect(html).toContain("progress-bar");
      
      // Should include copy buttons
      expect(html).toContain("copyToClipboard");
      expect(html).toContain("Copy");
      
      // Should include checkboxes
      expect(html).toContain("Mark as completed");
      expect(html).toContain("onchange=\"updateProgress()\"");
      
      // Should include collapsible before/after
      expect(html).toContain("<details");
      expect(html).toContain("Show Before/After Preview");
    });

    it("handles empty instructions", () => {
      const html = generator.formatAsHTML([]);
      expect(html).toContain("No revisions required.");
    });

    it("escapes HTML characters properly", () => {
      const edits: AnchoredEdit[] = [{
        id: "edit1",
        type: "replace",
        anchor: { sceneId: "ch01_s01", offset: 67, length: 26 },
        originalText: "Sarah, the <brilliant> scientist & \"researcher\"",
        newText: "Sarah",
        reason: "Remove <tags> & \"quotes\""
      }];

      const instructions = generator.generateInstructions(edits, manuscript, mockScenes);
      const html = generator.formatAsHTML(instructions);

      expect(html).toContain("&lt;brilliant&gt;");
      expect(html).toContain("&amp;");
      expect(html).toContain("&quot;");
      expect(html).not.toContain("Sarah, the <brilliant> scientist & \"researcher\"");
    });
  });

  describe("edge cases", () => {
    it("handles edits at start of scene", () => {
      const edits: AnchoredEdit[] = [{
        id: "edit1",
        type: "insert",
        anchor: { sceneId: "ch01_s01", offset: 0, length: 0 },
        newText: "Previously: ",
        reason: "Add context"
      }];

      const instructions = generator.generateInstructions(edits, manuscript, mockScenes);
      expect(instructions).toHaveLength(1);
      expect(instructions[0]!.findContext.precedingText).toBe("");
    });

    it("handles edits at end of scene", () => {
      const sceneText = mockScenes[0]!.text;
      const edits: AnchoredEdit[] = [{
        id: "edit1", 
        type: "insert",
        anchor: { sceneId: "ch01_s01", offset: sceneText.length, length: 0 },
        newText: " The end.",
        reason: "Add conclusion"
      }];

      const instructions = generator.generateInstructions(edits, manuscript, mockScenes);
      expect(instructions).toHaveLength(1);
      expect(instructions[0]!.findContext.followingText).toBe("");
    });

    it("handles very short scenes", () => {
      const shortScenes: Scene[] = [{
        id: "ch01_s01",
        chapterId: "ch01",
        startOffset: 0, 
        endOffset: 10,
        text: "Short.",
        wordCount: 1,
        dialogueRatio: 0
      }];

      const edits: AnchoredEdit[] = [{
        id: "edit1",
        type: "replace",
        anchor: { sceneId: "ch01_s01", offset: 0, length: 5 },
        originalText: "Short",
        newText: "Brief",
        reason: "Better word choice"
      }];

      const instructions = generator.generateInstructions(edits, "Short.", shortScenes);
      expect(instructions).toHaveLength(1);
      expect(instructions[0]!.findContext.targetText).toBe("Short");
    });

    it("handles scene ID parsing edge cases", () => {
      const weirdScenes: Scene[] = [{
        id: "weird_scene_name",
        chapterId: "ch01",
        startOffset: 0,
        endOffset: 20, 
        text: "Some text here.",
        wordCount: 3,
        dialogueRatio: 0
      }];

      const edits: AnchoredEdit[] = [{
        id: "edit1",
        type: "replace",
        anchor: { sceneId: "weird_scene_name", offset: 0, length: 4 },
        originalText: "Some",
        newText: "Any",
        reason: "Test"
      }];

      const instructions = generator.generateInstructions(edits, "Some text here.", weirdScenes);
      expect(instructions[0]!.sceneName).toBe("Scene weird_scene_name");
    });
  });
});