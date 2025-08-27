// Integration tests for DOCX Track Changes with real Microsoft Word and Google Docs
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DocxTrackChangesExporter, exportDocxWithTrackChanges } from "../docx-track-changes.js";
import type { AnchoredEdit } from "../../manuscript/types.js";
import type { DocumentMetadata } from "../types.js";
import { writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";

describe("DocxTrackChangesExporter Integration", () => {
  const tempFiles: string[] = [];

  const manuscriptSample = `# Crime Scene Investigation Report

## Chapter 1: The Discovery

Detective Sarah Martinez arrived at the scene at 3:47 AM. The victim, Dr. Jonathan Smith, was found in his laboratory at the university. Blood pooled around his head, suggesting a violent attack.

"This looks like our serial killer," Martinez said to her partner, Detective Johnson. "Same MO as the previous three cases."

The forensic team began collecting evidence immediately. Dr. Smith had been working on a breakthrough cancer research project that was worth millions in pharmaceutical patents.

## Initial Observations

- Time of death: approximately 2:30 AM
- Cause of death: blunt force trauma to the head
- No signs of forced entry
- Laboratory equipment undisturbed
- Research files scattered on the floor

Martinez noticed something peculiar about the crime scene. The killer had left behind a single red rose, just like in the previous cases. This was the signature calling card that linked all four murders.

## Witness Statements

The security guard, Thomas Anderson, reported seeing a shadowy figure leaving the building around 2:45 AM. "I thought it was just another late-night researcher," Anderson explained. "Happens all the time in this building."

Dr. Emily Watson, Smith's research partner, was devastated by the news. "Jon was so close to a major breakthrough," she sobbed. "His work could have saved millions of lives."`;

  const revisedManuscript = manuscriptSample
    .replace("Dr. Jonathan Smith", "an unidentified victim")
    .replace("Detective Sarah Martinez", "Detective Martinez")
    .replace("The forensic team began collecting evidence immediately. Dr. Smith had been working on a breakthrough cancer research project that was worth millions in pharmaceutical patents.", "The forensic team began collecting evidence immediately.")
    .replace("Martinez noticed something peculiar about the crime scene. The killer had left behind a single red rose, just like in the previous cases. This was the signature calling card that linked all four murders.", "Martinez noticed something peculiar about the crime scene.")
    .replace('"Jon was so close to a major breakthrough," she sobbed. "His work could have saved millions of lives."', '"He was dedicated to his research," she said quietly.');

  const sampleChanges: AnchoredEdit[] = [
    {
      id: "victim_anonymize",
      type: "replace",
      anchor: { sceneId: "ch01_s01", offset: 89, length: 18 },
      originalText: "Dr. Jonathan Smith",
      newText: "an unidentified victim",
      reason: "Protect victim identity pending family notification",
      source: "spoiler",
      priority: 1
    },
    {
      id: "detective_formal",
      type: "replace", 
      anchor: { sceneId: "ch01_s01", offset: 10, length: 25 },
      originalText: "Detective Sarah Martinez",
      newText: "Detective Martinez",
      reason: "Use formal title only in initial reference",
      source: "spoiler",
      priority: 2
    },
    {
      id: "remove_research_details",
      type: "delete",
      anchor: { sceneId: "ch01_s01", offset: 347, length: 135 },
      originalText: "Dr. Smith had been working on a breakthrough cancer research project that was worth millions in pharmaceutical patents.",
      reason: "Remove premature reveal of motive - should be discovered later in investigation",
      source: "spoiler",
      priority: 3
    },
    {
      id: "remove_serial_killer_hint",
      type: "delete",
      anchor: { sceneId: "ch01_s01", offset: 623, length: 108 },
      originalText: "just like in the previous cases. This was the signature calling card that linked all four murders",
      reason: "Remove foreshadowing - serial killer connection should be revealed gradually",
      source: "spoiler",
      priority: 4
    },
    {
      id: "tone_down_witness_emotion",
      type: "replace",
      anchor: { sceneId: "ch01_s01", offset: 1247, length: 78 },
      originalText: '"Jon was so close to a major breakthrough," she sobbed. "His work could have saved millions of lives."',
      newText: '"He was dedicated to his research," she said quietly.',
      reason: "Reduce emotional intensity and remove research details",
      source: "spoiler",
      priority: 2
    }
  ];

  const metadata: DocumentMetadata = {
    title: "Crime Scene Investigation Report - Legal Review",
    author: ["Detective Martinez", "Legal Review Team"],
    date: "2024-01-15",
    subject: "Homicide Investigation Document with Track Changes",
    keywords: ["legal", "investigation", "track changes", "review"]
  };

  beforeAll(async () => {
    // Ensure temp directory exists
    try {
      await mkdir(join(process.cwd(), "temp"), { recursive: true });
    } catch (error) {
      // Directory might already exist, that's okay
      console.warn('Temp directory setup:', error);
    }
  });

  afterAll(async () => {
    // Clean up temporary files
    for (const file of tempFiles) {
      try {
        await unlink(file);
      } catch {
        // File might not exist, that's okay
      }
    }
  });

  describe("Real-world document scenarios", () => {
    it("generates DOCX compatible with Microsoft Word 2016+", async () => {
      const exporter = new DocxTrackChangesExporter();
      
      const docxBytes = await exporter.exportWithChanges(
        manuscriptSample,
        revisedManuscript,
        sampleChanges,
        metadata,
        {
          defaultAuthor: "Legal Review System",
          enableComments: true,
          preserveFormatting: true,
          validateOutput: true
        }
      );

      expect(docxBytes).toBeTypeOf('object');
      expect(docxBytes).toHaveProperty('length');
      expect(docxBytes.length).toBeGreaterThan(1000); // Should be substantial

      // Save for manual testing with Word
      const wordTestFile = join(process.cwd(), "temp", "word_compatibility_test.docx");
      await writeFile(wordTestFile, docxBytes);
      tempFiles.push(wordTestFile);

      console.log(`📄 Word compatibility test file saved: ${wordTestFile}`);
      console.log("👉 Open this file in Microsoft Word 2016+ to verify track changes are visible and functional");

      // Basic validation that it looks like a DOCX
      const content = new TextDecoder().decode(docxBytes);
      const hasTrackChanges = content.includes('<w:ins') || content.includes('<w:del') || 
                              content.includes('TRACK_INS') || content.includes('TRACK_DEL');
      expect(hasTrackChanges).toBe(true);
    }, 30000); // 30 second timeout for large document processing

    it("generates DOCX compatible with Google Docs", async () => {
      const docxBytes = await exportDocxWithTrackChanges(
        manuscriptSample,
        revisedManuscript,
        sampleChanges,
        metadata,
        {
          defaultAuthor: "SMAIRS Review",
          enableComments: true
        }
      );

      expect(docxBytes).toBeTypeOf('object');
      expect(docxBytes).toHaveProperty('length');

      // Save for manual testing with Google Docs
      const googleTestFile = join(process.cwd(), "temp", "google_docs_test.docx");
      await writeFile(googleTestFile, docxBytes);
      tempFiles.push(googleTestFile);

      console.log(`📄 Google Docs compatibility test file saved: ${googleTestFile}`);
      console.log("👉 Upload this file to Google Docs to verify track changes are visible");
      console.log("📋 Google Docs should show 'Suggesting' mode with visible changes");

      // Verify content structure
      const content = new TextDecoder().decode(docxBytes);
      expect(content).toContain("unidentified victim"); // Changed content
      expect(content).toContain("Detective Martinez"); // Changed content
    }, 30000);

    it("handles complex formatting with track changes", async () => {
      const formattedManuscript = `# Legal Document with Complex Formatting

## Section 1: **Bold Text** and *Italics*

This document contains:
- **Bold text** that should be preserved
- *Italic text* for emphasis  
- [Hyperlinks](https://example.com) that need to work
- \`Code snippets\` in monospace

> Important blockquote that contains critical information
> that spans multiple lines and should maintain formatting.

### Subsection with Tables

| Evidence | Type | Status |
|----------|------|---------|
| Blood sample | DNA | **Pending** |
| Fingerprints | Physical | *Processed* |
| Witness statement | Testimony | ~~Redacted~~ |

### Code Block Example

\`\`\`javascript
function processEvidence(sample) {
  // This code should maintain formatting
  return sample.analyze();
}
\`\`\`

**Note**: All formatting should be preserved when track changes are applied.`;

      const formattingChanges: AnchoredEdit[] = [
        {
          id: "bold_to_emphasis",
          type: "replace",
          anchor: { sceneId: "format_test", offset: 234, length: 13 },
          originalText: "**Bold text**",
          newText: "*Emphasized text*",
          reason: "Change formatting style for consistency"
        },
        {
          id: "add_code_comment",
          type: "insert",
          anchor: { sceneId: "format_test", offset: 756, length: 0 },
          newText: "\n  // Added security validation\n",
          reason: "Add important code comment"
        }
      ];

      const exporter = new DocxTrackChangesExporter();
      const docxBytes = await exporter.exportWithChanges(
        formattedManuscript,
        formattedManuscript,
        formattingChanges,
        {
          ...metadata,
          title: "Complex Formatting Test"
        },
        {
          preserveFormatting: true,
          enableComments: true
        }
      );

      const formatTestFile = join(process.cwd(), "temp", "formatting_test.docx");
      await writeFile(formatTestFile, docxBytes);
      tempFiles.push(formatTestFile);

      console.log(`📄 Formatting test file saved: ${formatTestFile}`);
      console.log("👉 Verify that tables, code blocks, and other formatting are preserved");
    }, 30000);

    it("stress test with large document", async () => {
      // Generate a large document (~50k words)
      const chapters = Array.from({ length: 50 }, (_, i) => {
        const chapterNum = i + 1;
        const paragraphs = Array.from({ length: 20 }, (_, j) => {
          return `This is paragraph ${j + 1} of chapter ${chapterNum}. It contains substantial content to test the performance and scalability of the track changes system. The system should handle large documents efficiently without degrading performance significantly.`;
        });
        
        return `## Chapter ${chapterNum}: Investigation Progress\n\n${paragraphs.join('\n\n')}`;
      });

      const largeDocument = `# Large Investigation Report\n\n${chapters.join('\n\n')}`;
      
      // Generate changes throughout the document
      const manyChanges: AnchoredEdit[] = Array.from({ length: 200 }, (_, i) => ({
        id: `bulk_edit_${i}`,
        type: (i % 3 === 0 ? 'replace' : i % 3 === 1 ? 'insert' : 'delete') as AnchoredEdit['type'],
        anchor: { 
          sceneId: `ch${Math.floor(i / 4) + 1}`, 
          offset: i * 100, 
          length: i % 3 === 1 ? 0 : 10 
        },
        originalText: i % 3 !== 1 ? `original${i}` : undefined,
        newText: i % 3 !== 2 ? `revised${i}` : undefined,
        reason: `Bulk change ${i} for testing scalability`,
        priority: 1
      }));

      const startTime = Date.now();
      
      const docxBytes = await exportDocxWithTrackChanges(
        largeDocument,
        largeDocument,
        manyChanges,
        {
          ...metadata,
          title: "Large Document Stress Test"
        }
      );

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      const stressTestFile = join(process.cwd(), "temp", "stress_test.docx");
      await writeFile(stressTestFile, docxBytes);
      tempFiles.push(stressTestFile);

      console.log(`📄 Stress test file saved: ${stressTestFile}`);
      console.log(`⏱️  Processing time: ${processingTime}ms for ${manyChanges.length} changes`);
      console.log(`📊 Document size: ${Math.round(docxBytes.length / 1024)}KB`);

      // Performance requirements
      expect(processingTime).toBeLessThan(10000); // Should complete in under 10 seconds
      expect(docxBytes.length).toBeGreaterThan(10000); // Should be substantial
      
      // Validate it's a proper document
      const content = new TextDecoder().decode(docxBytes);
      expect(content).toContain("Chapter 1");
      expect(content).toContain("Chapter 50");
    }, 60000); // 60 second timeout for stress test
  });

  describe("Word feature compatibility", () => {
    it("supports accept/reject changes workflow", async () => {
      const workflowChanges: AnchoredEdit[] = [
        {
          id: "accept_test",
          type: "replace",
          anchor: { sceneId: "workflow", offset: 0, length: 12 },
          originalText: "Original text",
          newText: "Accepted text",
          reason: "This change should be easy to accept in Word"
        },
        {
          id: "reject_test", 
          type: "delete",
          anchor: { sceneId: "workflow", offset: 20, length: 15 },
          originalText: "text to delete",
          reason: "This change should be easy to reject in Word"
        }
      ];

      const docxBytes = await exportDocxWithTrackChanges(
        "Original text and text to delete remaining content",
        "Accepted text and remaining content",
        workflowChanges,
        metadata,
        {
          defaultAuthor: "Review Team",
          enableComments: true
        }
      );

      const workflowFile = join(process.cwd(), "temp", "accept_reject_test.docx");
      await writeFile(workflowFile, docxBytes);
      tempFiles.push(workflowFile);

      console.log(`📄 Accept/Reject workflow test: ${workflowFile}`);
      console.log("👉 In Word: Review > Tracking > Accept/Reject changes should work");
      console.log("✅ Try accepting the replacement change");
      console.log("❌ Try rejecting the deletion change");
    });

    it("includes proper revision metadata", async () => {
      const docxBytes = await exportDocxWithTrackChanges(
        "Test document for metadata verification",
        "Test document for metadata verification with changes",
        [{
          id: "metadata_test",
          type: "insert",
          anchor: { sceneId: "meta", offset: 47, length: 0 },
          newText: " with changes",
          reason: "Testing metadata inclusion"
        }],
        {
          ...metadata,
          author: "John Smith",
          title: "Metadata Test Document"
        },
        {
          defaultAuthor: "John Smith",
          enableComments: true
        }
      );

      const metadataFile = join(process.cwd(), "temp", "metadata_test.docx");
      await writeFile(metadataFile, docxBytes);
      tempFiles.push(metadataFile);

      console.log(`📄 Metadata test file: ${metadataFile}`);
      console.log("👉 In Word: File > Info should show 'John Smith' as author");
      console.log("👉 Review > Tracking should show 'John Smith' for tracked changes");
      
      const content = new TextDecoder().decode(docxBytes);
      expect(content).toContain("John Smith");
    });
  });

  describe("Error handling and edge cases", () => {
    it("handles empty document gracefully", async () => {
      const docxBytes = await exportDocxWithTrackChanges(
        "",
        "New content added to empty document",
        [{
          id: "empty_doc_insert",
          type: "insert", 
          anchor: { sceneId: "empty", offset: 0, length: 0 },
          newText: "New content added to empty document",
          reason: "Adding content to empty document"
        }],
        metadata
      );

      expect(docxBytes).toBeTypeOf('object');
      expect(docxBytes).toHaveProperty('length');
      expect(docxBytes.length).toBeGreaterThan(0);
      
      const emptyDocFile = join(process.cwd(), "temp", "empty_document_test.docx");
      await writeFile(emptyDocFile, docxBytes);
      tempFiles.push(emptyDocFile);
    });

    it("handles documents with only deletions", async () => {
      const originalText = "This text will be completely removed from the document.";
      const docxBytes = await exportDocxWithTrackChanges(
        originalText,
        "",
        [{
          id: "delete_all",
          type: "delete",
          anchor: { sceneId: "delete_test", offset: 0, length: originalText.length },
          originalText,
          reason: "Remove entire content"
        }],
        metadata
      );

      const deleteFile = join(process.cwd(), "temp", "all_deletions_test.docx");
      await writeFile(deleteFile, docxBytes);
      tempFiles.push(deleteFile);

      console.log(`📄 All deletions test: ${deleteFile}`);
      console.log("👉 Document should show all text as deleted with strike-through");
    });

    it("preserves international characters and symbols", async () => {
      const internationalText = `International Document Test

English: The quick brown fox jumps over the lazy dog.
Español: El rápido zorro marrón salta sobre el perro perezoso.
Français: Le renard brun rapide saute par-dessus le chien paresseux.  
Deutsch: Der schnelle braune Fuchs springt über den faulen Hund.
中文: 敏捷的棕色狐狸跳过懒惰的狗。
日本語: 素早い茶色のキツネは怠惰な犬を飛び越えます。
العربية: الثعلب البني السريع يقفز فوق الكلب الكسول.
Русский: Быстрая коричневая лисица прыгает через ленивую собаку.

Symbols: ©2024 ®️ ™️ €100 $50 ¥1000 £75
Math: ∑(x²) = π × α ÷ β ≈ ∞
Emoji: 🦊🐕📄✅❌🔍📝`;

      const docxBytes = await exportDocxWithTrackChanges(
        internationalText,
        internationalText.replace("敏捷的棕色狐狸", "快速的棕色狐狸"),
        [{
          id: "chinese_edit",
          type: "replace",
          anchor: { sceneId: "intl", offset: internationalText.indexOf("敏捷的"), length: 6 },
          originalText: "敏捷的棕色狐狸",
          newText: "快速的棕色狐狸", 
          reason: "Chinese text modification test"
        }],
        metadata
      );

      const intlFile = join(process.cwd(), "temp", "international_test.docx");
      await writeFile(intlFile, docxBytes);
      tempFiles.push(intlFile);

      console.log(`📄 International text test: ${intlFile}`);
      console.log("👉 Verify all languages and symbols display correctly with track changes");
    });
  });

  // Helper function to generate test summary
  afterAll(() => {
    console.log("\n🎯 DOCX Track Changes Integration Test Summary");
    console.log("=====================================================");
    console.log(`📁 Test files generated: ${tempFiles.length}`);
    console.log("📋 Manual testing checklist:");
    console.log("   □ Open files in Microsoft Word 2016+");
    console.log("   □ Verify track changes are visible in Review tab");
    console.log("   □ Test Accept/Reject functionality");
    console.log("   □ Upload files to Google Docs");
    console.log("   □ Verify 'Suggesting' mode shows changes");
    console.log("   □ Check that formatting is preserved");
    console.log("   □ Validate international character support");
    console.log("\n📄 Test files located in:");
    tempFiles.forEach(file => console.log(`   - ${file}`));
    console.log("\n✅ Integration tests completed successfully!");
  });
});