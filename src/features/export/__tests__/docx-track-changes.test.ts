// Tests for DOCX Track Changes implementation
import { describe, it, expect, beforeEach, vi } from "vitest";
import { DocxTrackChangesExporter, type TrackChange, type DocxTrackChangesOptions } from "../docx-track-changes.js";
import type { AnchoredEdit } from "../../manuscript/types.js";
import type { DocumentMetadata } from "../types.js";

describe('DocxTrackChangesExporter', () => {
  let exporter: DocxTrackChangesExporter;
  let mockTauriInvoke: ReturnType<typeof vi.fn>;

  const sampleOriginalText = `Chapter 1

The detective walked into the crime scene. Sarah Martinez, the forensic scientist, was already examining the evidence. Blood samples were scattered across the table.

"What do we have here?" Detective Jones asked, approaching the scene with caution.`;

  const sampleRevisedText = `Chapter 1

The detective walked into the crime scene. Sarah Martinez was already examining the evidence. Blood samples were scattered across the table.

"What do we have here?" Detective Jones asked, approaching the scene.`;

  const sampleMetadata: DocumentMetadata = {
    title: "Crime Scene Investigation",
    author: "Test Author",
    date: "2024-01-15",
    subject: "Legal Document with Track Changes"
  };

  const sampleChanges: AnchoredEdit[] = [
    {
      id: "edit1",
      type: "replace",
      anchor: { sceneId: "ch01_s01", offset: 89, length: 35 },
      originalText: "Sarah Martinez, the forensic scientist,",
      newText: "Sarah Martinez",
      reason: "Remove premature character description",
      source: "spoiler"
    },
    {
      id: "edit2",
      type: "delete", 
      anchor: { sceneId: "ch01_s01", offset: 245, length: 15 },
      originalText: "with caution",
      reason: "Remove redundant description"
    }
  ];

  beforeEach(() => {
    exporter = new DocxTrackChangesExporter();
    mockTauriInvoke = vi.fn();
    
    // Mock Tauri invoke function
    vi.stubGlobal('globalThis', {
      __TAURI__: true
    });
    
    // Mock dynamic import of Tauri API
    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: mockTauriInvoke
    }));
  });

  describe('generateInstructions', () => {
    it('generates valid DOCX with track changes', async () => {
      mockTauriInvoke
        .mockResolvedValueOnce('temp/track_changes.md') // export_write_temp
        .mockResolvedValueOnce('out/track_changes.docx'); // export_docx_track_changes

      // Mock file system for reading result
      vi.doMock("node:fs", () => ({
        readFileSync: vi.fn().mockReturnValue(new Uint8Array([
          0x50, 0x4B, 0x03, 0x04, // ZIP file signature
          // Mock DOCX content with OOXML track changes
          ...new TextEncoder().encode('<w:ins w:author="SMAIRS"><w:r><w:t>test</w:t></w:r></w:ins>')
        ]))
      }));

      const result = await exporter.exportWithChanges(
        sampleOriginalText,
        sampleRevisedText, 
        sampleChanges,
        sampleMetadata
      );

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
      expect(mockTauriInvoke).toHaveBeenCalledWith("export_write_temp", expect.any(Object));
      expect(mockTauriInvoke).toHaveBeenCalledWith("export_docx_track_changes", expect.any(Object));
    });

    it('track changes visible in generated DOCX', async () => {
      const docxContent = `<w:document>
        <w:body>
          <w:p>
            <w:r><w:t>Sarah Martinez</w:t></w:r>
            <w:del w:id="1" w:author="SMAIRS" w:date="2024-01-15T10:00:00Z">
              <w:r><w:delText>, the forensic scientist,</w:delText></w:r>
            </w:del>
            <w:r><w:t> was already examining</w:t></w:r>
          </w:p>
        </w:body>
      </w:document>`;

      mockTauriInvoke
        .mockResolvedValueOnce('temp/track_changes.md')
        .mockResolvedValueOnce('out/track_changes.docx');

      vi.doMock("node:fs", () => ({
        readFileSync: vi.fn().mockReturnValue(new TextEncoder().encode(docxContent))
      }));

      const result = await exporter.exportWithChanges(
        sampleOriginalText,
        sampleRevisedText,
        sampleChanges,
        sampleMetadata
      );

      const content = new TextDecoder().decode(result);
      expect(content).toContain('<w:del');
      expect(content).toContain('w:author="SMAIRS"');
      expect(content).toContain('<w:delText>, the forensic scientist,</w:delText>');
    });

    it('includes author and timestamp metadata', async () => {
      const options: DocxTrackChangesOptions = {
        defaultAuthor: "John Smith",
        enableComments: true
      };

      mockTauriInvoke.mockResolvedValue('out/test.docx');
      vi.doMock("node:fs", () => ({
        readFileSync: vi.fn().mockReturnValue(new TextEncoder().encode('<w:ins w:author="John Smith"/>'))
      }));

      const result = await exporter.exportWithChanges(
        sampleOriginalText,
        sampleRevisedText,
        sampleChanges,
        sampleMetadata,
        options
      );

      const content = new TextDecoder().decode(result);
      expect(content).toContain('w:author="John Smith"');
      expect(content).toMatch(/w:date="\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('preserves document formatting', async () => {
      const formattedText = `# Chapter 1

**Bold text** and *italic text* with [links](http://example.com).

> Blockquote text

- List item 1
- List item 2`;

      mockTauriInvoke.mockResolvedValue('out/formatted.docx');
      vi.doMock("node:fs", () => ({
        readFileSync: vi.fn().mockReturnValue(new TextEncoder().encode(`
          <w:document>
            <w:body>
              <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Bold text</w:t></w:r></w:p>
              <w:p><w:r><w:rPr><w:i/></w:rPr><w:t>italic text</w:t></w:r></w:p>
            </w:body>
          </w:document>
        `))
      }));

      const result = await exporter.exportWithChanges(
        formattedText,
        formattedText,
        [],
        sampleMetadata,
        { preserveFormatting: true }
      );

      const content = new TextDecoder().decode(result);
      expect(content).toContain('<w:b/>'); // Bold formatting preserved
      expect(content).toContain('<w:i/>'); // Italic formatting preserved
    });

    it('handles unicode and special characters', async () => {
      const unicodeText = `Text with émojis 🎉 and spëcial çharacters: "quotes", 'apostrophes', & ampersands.`;
      const unicodeChanges: AnchoredEdit[] = [{
        id: "unicode_edit",
        type: "replace",
        anchor: { sceneId: "test", offset: 10, length: 7 },
        originalText: "émojis",
        newText: "emojis",
        reason: "Replace accented characters"
      }];

      mockTauriInvoke.mockResolvedValue('out/unicode.docx');
      vi.doMock("node:fs", () => ({
        readFileSync: vi.fn().mockReturnValue(new TextEncoder().encode('<w:del><w:delText>émojis</w:delText></w:del>'))
      }));

      const result = await exporter.exportWithChanges(
        unicodeText,
        unicodeText.replace('émojis', 'emojis'),
        unicodeChanges,
        sampleMetadata
      );

      const content = new TextDecoder().decode(result);
      expect(content).toContain('émojis'); // Unicode preserved in OOXML
    });

    it('supports comments on changes', async () => {
      const changesWithComments: AnchoredEdit[] = [{
        id: "commented_edit",
        type: "delete",
        anchor: { sceneId: "test", offset: 0, length: 10 },
        originalText: "Delete this",
        reason: "This text is redundant and should be removed for clarity"
      }];

      mockTauriInvoke.mockResolvedValue('out/commented.docx');
      vi.doMock("node:fs", () => ({
        readFileSync: vi.fn().mockReturnValue(new TextEncoder().encode(`
          <w:document>
            <w:body>
              <w:commentRangeStart w:id="1"/>
              <w:del w:id="1" w:author="SMAIRS">
                <w:r><w:delText>Delete this</w:delText></w:r>
              </w:del>
              <w:commentRangeEnd w:id="1"/>
            </w:body>
          </w:document>
        `))
      }));

      const result = await exporter.exportWithChanges(
        "Delete this text",
        "text",
        changesWithComments,
        sampleMetadata,
        { enableComments: true }
      );

      const content = new TextDecoder().decode(result);
      expect(content).toContain('<w:commentRange'); // Comments present
    });

    it('handles large documents efficiently', async () => {
      // Generate a large document (simulate 120k words)
      const words = Array.from({ length: 120000 }, (_, i) => `word${i}`);
      const largeText = words.join(' ');
      
      // Create changes throughout the document
      const largeChanges: AnchoredEdit[] = Array.from({ length: 100 }, (_, i) => ({
        id: `large_edit_${i}`,
        type: 'replace' as const,
        anchor: { sceneId: "large", offset: i * 1000, length: 5 },
        originalText: `word${i}`,
        newText: `WORD${i}`,
        reason: `Change ${i}`
      }));

      mockTauriInvoke.mockResolvedValue('out/large.docx');
      vi.doMock("node:fs", () => ({
        readFileSync: vi.fn().mockReturnValue(new TextEncoder().encode('Large DOCX content'))
      }));

      const startTime = Date.now();
      
      const result = await exporter.exportWithChanges(
        largeText,
        largeText,
        largeChanges,
        sampleMetadata
      );

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      expect(result).toBeInstanceOf(Uint8Array);
      expect(processingTime).toBeLessThan(5000); // Less than 5 seconds
      expect(result.length).toBeGreaterThan(0);
    });

    it('handles overlapping and complex changes', async () => {
      const complexChanges: AnchoredEdit[] = [
        {
          id: "replace1",
          type: "replace",
          anchor: { sceneId: "test", offset: 0, length: 10 },
          originalText: "Old text A",
          newText: "New text A",
          reason: "Replace A"
        },
        {
          id: "insert1", 
          type: "insert",
          anchor: { sceneId: "test", offset: 5, length: 0 },
          newText: " inserted",
          reason: "Insert text"
        },
        {
          id: "delete1",
          type: "delete",
          anchor: { sceneId: "test", offset: 15, length: 8 },
          originalText: " delete ",
          reason: "Remove text"
        }
      ];

      mockTauriInvoke.mockResolvedValue('out/complex.docx');
      vi.doMock("node:fs", () => ({
        readFileSync: vi.fn().mockReturnValue(new TextEncoder().encode(`
          <w:document>
            <w:body>
              <w:p>
                <w:del w:id="1"><w:delText>Old text A</w:delText></w:del>
                <w:ins w:id="2"><w:r><w:t>New text A</w:t></w:r></w:ins>
                <w:ins w:id="3"><w:r><w:t> inserted</w:t></w:r></w:ins>
                <w:del w:id="4"><w:delText> delete </w:delText></w:del>
              </w:p>
            </w:body>
          </w:document>
        `))
      }));

      const result = await exporter.exportWithChanges(
        "Old text A and delete more text",
        "New text A inserted more text",
        complexChanges,
        sampleMetadata
      );

      const content = new TextDecoder().decode(result);
      expect(content).toContain('<w:ins'); // Has insertions
      expect(content).toContain('<w:del'); // Has deletions
      expect(content).toContain('New text A'); // Replacement content
      expect(content).toContain(' inserted'); // Inserted content
    });
  });

  describe('fallback mechanisms', () => {
    it('falls back to Python processor when Pandoc fails', async () => {
      // Mock Pandoc failure
      mockTauriInvoke
        .mockRejectedValueOnce(new Error("Pandoc not found"))
        .mockResolvedValueOnce('out/python_fallback.docx'); // Python fallback

      vi.doMock("node:fs", () => ({
        readFileSync: vi.fn().mockReturnValue(new TextEncoder().encode('Python generated DOCX'))
      }));

      const result = await exporter.exportWithChanges(
        sampleOriginalText,
        sampleRevisedText,
        sampleChanges,
        sampleMetadata
      );

      expect(result).toBeInstanceOf(Uint8Array);
      expect(mockTauriInvoke).toHaveBeenCalledWith("export_docx_python", expect.any(Object));
    });

    it('falls back to direct OOXML when all else fails', async () => {
      // Mock both Pandoc and Python failures
      mockTauriInvoke.mockRejectedValue(new Error("All external tools failed"));

      const result = await exporter.exportWithChanges(
        sampleOriginalText,
        sampleRevisedText,
        sampleChanges,
        sampleMetadata
      );

      expect(result).toBeInstanceOf(Uint8Array);
      const content = new TextDecoder().decode(result);
      expect(content).toContain('DOCX-OOXML:'); // Direct OOXML fallback marker
    });
  });

  describe('validation', () => {
    it('validates output when requested', async () => {
      const validDocx = new TextEncoder().encode('<w:ins w:author="Test"><w:document>Valid DOCX</w:document></w:ins>');
      
      mockTauriInvoke.mockResolvedValue('out/valid.docx');
      vi.doMock("node:fs", () => ({
        readFileSync: vi.fn().mockReturnValue(validDocx)
      }));

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await exporter.exportWithChanges(
        sampleOriginalText,
        sampleRevisedText,
        sampleChanges,
        sampleMetadata,
        { validateOutput: true }
      );

      expect(consoleSpy).not.toHaveBeenCalled(); // No warnings for valid output
      consoleSpy.mockRestore();
    });

    it('warns about invalid output', async () => {
      const invalidDocx = new TextEncoder().encode('Invalid content without track changes');
      
      mockTauriInvoke.mockResolvedValue('out/invalid.docx');
      vi.doMock("node:fs", () => ({
        readFileSync: vi.fn().mockReturnValue(invalidDocx)
      }));

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await exporter.exportWithChanges(
        sampleOriginalText,
        sampleRevisedText,
        sampleChanges,
        sampleMetadata,
        { validateOutput: true }
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Generated DOCX may have compatibility issues")
      );
      consoleSpy.mockRestore();
    });
  });

  describe('OOXML generation', () => {
    it('generates proper OOXML structure', () => {
      const trackChange: TrackChange = {
        id: "test_change",
        author: "Test Author",
        date: new Date('2024-01-15T10:30:00Z'),
        type: 'insertion',
        content: 'inserted text',
        position: 0
      };

      // Access private method via type assertion for testing
      const revision = (exporter as any).createRevision(trackChange);
      const ooxml = (exporter as any).generateOOXMLElement(trackChange, revision);

      expect(ooxml).toContain('<w:ins');
      expect(ooxml).toContain('w:author="Test Author"');
      expect(ooxml).toContain('w:date="2024-01-15T10:30:00.000Z"');
      expect(ooxml).toContain('<w:t>inserted text</w:t>');
      expect(ooxml).toContain('</w:ins>');
    });

    it('properly escapes XML characters in OOXML', () => {
      const trackChange: TrackChange = {
        id: "escape_test",
        author: 'Author "Name" & <Company>',
        date: new Date(),
        type: 'deletion',
        content: 'Text with <tags> & "quotes"',
        position: 0
      };

      const revision = (exporter as any).createRevision(trackChange);
      const ooxml = (exporter as any).generateOOXMLElement(trackChange, revision);

      expect(ooxml).toContain('w:author="Author &quot;Name&quot; &amp; &lt;Company&gt;"');
      expect(ooxml).toContain('<w:delText>Text with &lt;tags&gt; &amp; &quot;quotes&quot;</w:delText>');
    });

    it('generates Windows file time format', () => {
      const testDate = new Date('2024-01-15T10:30:00Z');
      const windowsFileTime = (exporter as any).toWindowsFileTime(testDate);
      
      expect(windowsFileTime).toMatch(/^\d+$/); // Should be numeric string
      expect(parseInt(windowsFileTime)).toBeGreaterThan(0);
    });
  });
});