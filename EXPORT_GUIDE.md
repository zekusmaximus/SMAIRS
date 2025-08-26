# Export Guide

This guide provides comprehensive information about the export functionality in the SMAIRS project, including supported formats, submission bundles, and configuration options.

## Overview

The export system enables users to generate professional submission packages from manuscript analysis results. It supports multiple output formats and creates comprehensive bundles containing revised openings, synopses, query letters, and supporting documents.

## Supported Export Formats

### Microsoft Word (DOCX)
- **Best for**: Professional submissions to agents and publishers
- **Features**: Track changes support, proper formatting, metadata embedding
- **Requirements**: Pandoc installation (automatically handled in Tauri builds)

### PDF
- **Best for**: Final submissions, archival purposes
- **Features**: Consistent formatting across platforms, metadata embedding
- **Requirements**: Pandoc with LaTeX engine (automatically handled in Tauri builds)

### Markdown
- **Best for**: Development, collaboration, version control
- **Features**: Plain text format, easy to edit, Git-friendly
- **Requirements**: None (built-in support)

## Export Components

### Revised Opening
The core manuscript opening with applied revisions:

- **Source**: Opening candidate with applied edits
- **Formats**: DOCX, PDF, Markdown
- **Metadata**: Title, author, date, keywords
- **Options**: Track changes (DOCX only)

### Synopsis
AI-generated or heuristic-based manuscript summary:

- **Styles**: Query letter, Full, One-page
- **Generation**: LLM-powered with fallback heuristics
- **Formats**: PDF, Markdown
- **Content**: Key points, warnings, word count limits

### Query Letter
Professional submission letter:

- **Template**: Customizable default template
- **Customization**: Author name, manuscript details
- **Format**: Markdown (can be converted to other formats)

### Rationale Memo
Explanation of revisions made:

- **Content**: Revision rationale, improvements made
- **Format**: PDF or Markdown
- **Template**: Structured with bullet points

### Comparison Report
Optional comparative analysis:

- **Content**: Candidate comparisons, rankings
- **Format**: Markdown
- **Optional**: Only included when available

## Submission Bundles

### Bundle Structure
```
submission_YYYY-MM-DD.zip/
├── opening.docx/pdf/md
├── synopsis.pdf/md
├── query.md
├── rationale.pdf/md
├── comparison.md (optional)
└── metadata.json
```

### Bundle Generation
```typescript
import { SubmissionBundle } from './submission-bundle';

const bundle = new SubmissionBundle();

const result = await bundle.create({
  candidateId: 'opening-123',
  revisedOpeningMarkdown: '# Chapter 1\n\nOpening text...',
  synopsisText: 'Synopsis content...',
  openingFormat: 'docx',
  synopsisFormat: 'pdf',
  metadata: {
    title: 'Manuscript Title',
    author: 'Author Name',
    date: '2024-01-01'
  }
});

console.log(result.zipPath); // Path to generated ZIP file
```

## Pandoc Integration

### Overview
The system uses Pandoc for format conversion between Markdown and DOCX/PDF:

- **DOCX Conversion**: Markdown → DOCX with metadata
- **PDF Conversion**: Markdown → LaTeX → PDF
- **Metadata**: YAML frontmatter support
- **Templates**: Custom styling and formatting

### Configuration
```typescript
// DOCX options
const docxOptions = {
  referenceDocxPath: '/path/to/template.docx',
  trackChanges: true
};

// PDF options
const pdfOptions = {
  latexEngine: 'xelatex',
  headerHtml: '<div>Custom Header</div>',
  footerHtml: '<div>Custom Footer</div>',
  cssPath: '/path/to/styles.css'
};
```

## Synopsis Generation

### LLM-Powered Generation
```typescript
import { SynopsisGenerator } from './synopsis-generator';

const generator = new SynopsisGenerator();

const synopsis = await generator.generateFromManuscript(
  manuscript,
  openingCandidate,
  'onePage'
);

console.log(synopsis.text);
console.log(synopsis.keyPoints);
console.log(synopsis.warnings);
```

### Styles
- **Query**: Optimized for query letters (concise, compelling)
- **Full**: Comprehensive summary (detailed, analytical)
- **One-page**: Standard format (balanced length)

### Fallback Heuristics
When LLM is unavailable, the system uses:
- Text extraction from manuscript
- Reveal analysis for key points
- Template-based synopsis construction

## Preflight Checks

### Validation Types
- **Character Consistency**: Character names and descriptions
- **Timeline Validation**: Chronological consistency
- **Scene References**: Cross-scene consistency
- **Pronoun Usage**: Pronoun consistency
- **General Warnings**: Length, formatting issues

### Usage
```typescript
import { runPreflight } from './preflight';

const checks = runPreflight({
  candidate: selectedCandidate,
  analysis: openingAnalysis
});

const okToExport = checks.every(c => c.pass || !c.critical);
```

## UI Integration

### Export Panel
The `ExportPanel` component provides:

- **Format Selection**: DOCX, PDF, Markdown
- **Option Configuration**: Track changes, synopsis inclusion
- **Preflight Display**: Validation status
- **Progress Tracking**: Export progress with steps
- **Download Links**: Direct download of generated bundles

### Usage
```tsx
import { ExportPanel } from './ui/panels/ExportPanel';

<ExportPanel
  selectedCandidate={candidate}
  analysis={analysis}
/>
```

## Configuration Options

### Environment Variables
```bash
# Export settings
EXPORT_PANDOC_PATH=/usr/local/bin/pandoc
EXPORT_LATEX_ENGINE=xelatex
EXPORT_TRACK_CHANGES=1

# Bundle settings
EXPORT_BUNDLE_BASE_NAME=submission
EXPORT_INCLUDE_METADATA=1
```

### Programmatic Configuration
```typescript
const bundleOptions = {
  candidateId: 'opening-123',
  revisedOpeningMarkdown: content,
  synopsisText: synopsis,
  openingFormat: 'docx' as const,
  synopsisFormat: 'pdf' as const,
  metadata: {
    title: 'Title',
    author: 'Author',
    date: new Date().toISOString(),
    keywords: ['fiction', 'mystery'],
    subject: 'Manuscript Submission'
  },
  docx: {
    trackChanges: true,
    referenceDocxPath: '/path/to/template.docx'
  },
  pdf: {
    latexEngine: 'xelatex',
    cssPath: '/path/to/styles.css'
  }
};
```

## Error Handling

### Common Issues
1. **Pandoc Not Found**: Ensure Pandoc is installed and accessible
2. **LaTeX Errors**: Verify LaTeX distribution for PDF generation
3. **File Permissions**: Check write permissions for temporary files
4. **Memory Issues**: Large manuscripts may require increased memory

### Error Recovery
- Automatic fallback to Markdown-only export
- Temporary file cleanup on errors
- Detailed error messages with suggestions

## Best Practices

### File Organization
1. **Use descriptive filenames**: Include dates and candidate IDs
2. **Organize by project**: Group related exports in folders
3. **Version control**: Track export configurations
4. **Backup bundles**: Archive important submission packages

### Quality Assurance
1. **Run preflight checks**: Always validate before export
2. **Proofread content**: Review generated documents
3. **Test formats**: Verify appearance in target applications
4. **Check metadata**: Ensure correct document properties

### Performance Optimization
1. **Cache synopses**: Reuse generated synopses when possible
2. **Batch exports**: Process multiple candidates together
3. **Monitor resources**: Track memory usage for large manuscripts
4. **Use appropriate formats**: Choose formats based on use case

## Integration Examples

### Complete Export Workflow
```typescript
// 1. Generate synopsis
const synopsis = await generator.generateFromManuscript(manuscript, candidate, 'query');

// 2. Run preflight checks
const checks = runPreflight({ candidate, analysis });
if (!checks.every(c => c.pass || !c.critical)) {
  throw new Error('Preflight checks failed');
}

// 3. Create bundle
const bundle = new SubmissionBundle();
const result = await bundle.create({
  candidateId: candidate.id,
  revisedOpeningMarkdown: candidate.revisedText,
  synopsisText: synopsis.text,
  openingFormat: 'docx',
  synopsisFormat: 'pdf',
  metadata: {
    title: manuscript.title,
    author: manuscript.author
  }
});

// 4. Handle result
console.log(`Bundle created: ${result.zipPath}`);
```

### Custom Export Pipeline
```typescript
class CustomExporter {
  async exportWithCustomFormatting(options: BundleOptions) {
    // Custom preprocessing
    const processedContent = await this.preprocessContent(options.revisedOpeningMarkdown);

    // Use standard bundle creation
    const bundle = new SubmissionBundle();
    return bundle.create({
      ...options,
      revisedOpeningMarkdown: processedContent
    });
  }

  private async preprocessContent(content: string): Promise<string> {
    // Custom formatting logic
    return content;
  }
}
```

## Troubleshooting

### Pandoc Issues
- **Installation**: Ensure Pandoc 2.0+ is installed
- **Path**: Verify Pandoc is in system PATH
- **Permissions**: Check execution permissions

### LaTeX Issues
- **Distribution**: Install complete LaTeX distribution (TeX Live, MiKTeX)
- **Packages**: Ensure required LaTeX packages are installed
- **Engine**: Verify selected LaTeX engine is available

### File System Issues
- **Permissions**: Ensure write access to export directories
- **Space**: Verify sufficient disk space for temporary files
- **Cleanup**: Remove temporary files after export

### Performance Issues
- **Memory**: Increase Node.js memory limit for large manuscripts
- **Caching**: Enable caching for repeated exports
- **Batch Size**: Limit concurrent export operations
