// DOCX Track Changes Validator
// Utility to validate generated DOCX files for Word/Google Docs compatibility

export interface ValidationResult {
  isValid: boolean;
  compatibility: {
    word: boolean;
    googleDocs: boolean;
  };
  trackChanges: {
    found: boolean;
    insertions: number;
    deletions: number;
    replacements: number;
  };
  structure: {
    hasDocumentXml: boolean;
    hasSettingsXml: boolean;
    hasStylesXml: boolean;
    hasMetadata: boolean;
  };
  issues: string[];
  warnings: string[];
}

export class DocxValidator {
  /**
   * Validate a DOCX file for track changes compatibility
   */
  async validateDocx(docxBytes: Uint8Array): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: false,
      compatibility: {
        word: false,
        googleDocs: false
      },
      trackChanges: {
        found: false,
        insertions: 0,
        deletions: 0,
        replacements: 0
      },
      structure: {
        hasDocumentXml: false,
        hasSettingsXml: false,
        hasStylesXml: false,
        hasMetadata: false
      },
      issues: [],
      warnings: []
    };

    try {
      const content = new TextDecoder().decode(docxBytes);
      
      // Validate basic DOCX structure
      this.validateStructure(content, result);
      
      // Validate track changes
      this.validateTrackChanges(content, result);
      
      // Check compatibility requirements
      this.checkCompatibility(content, result);
      
      // Overall validation
      result.isValid = result.issues.length === 0 && 
                      result.trackChanges.found && 
                      (result.structure.hasDocumentXml || content.includes('DOCX-OOXML:'));

    } catch (error) {
      result.issues.push(`Validation error: ${error}`);
    }

    return result;
  }

  private validateStructure(content: string, result: ValidationResult): void {
    // Check for DOCX ZIP structure or OOXML content
    if (content.includes('word/document.xml')) {
      result.structure.hasDocumentXml = true;
    } else if (content.includes('DOCX-OOXML:')) {
      result.structure.hasDocumentXml = true; // Direct OOXML format
    } else {
      result.issues.push('Missing document.xml or OOXML content');
    }

    // Check for settings (track changes enabled)
    if (content.includes('word/settings.xml') || content.includes('<w:settings')) {
      result.structure.hasSettingsXml = true;
    } else {
      result.warnings.push('Missing settings.xml - track changes may not be enabled by default');
    }

    // Check for styles
    if (content.includes('word/styles.xml') || content.includes('<w:styles')) {
      result.structure.hasStylesXml = true;
    } else {
      result.warnings.push('Missing styles.xml - formatting may not be preserved');
    }

    // Check for metadata
    if (content.includes('docProps/core.xml') || content.includes('<cp:coreProperties')) {
      result.structure.hasMetadata = true;
    } else {
      result.warnings.push('Missing document metadata');
    }
  }

  private validateTrackChanges(content: string, result: ValidationResult): void {
    // Look for OOXML track change elements
    const insertions = this.countMatches(content, /<w:ins[^>]*>/g);
    const deletions = this.countMatches(content, /<w:del[^>]*>/g);
    
    // Also look for our custom track change markers
    const customInsertions = this.countMatches(content, /\[TRACK_INS_[^\]]+\]/g);
    const customDeletions = this.countMatches(content, /\[TRACK_DEL_[^\]]+\]/g);

    result.trackChanges.insertions = insertions + customInsertions;
    result.trackChanges.deletions = deletions + customDeletions;
    result.trackChanges.replacements = Math.min(insertions, deletions); // Replacements are del+ins pairs
    
    result.trackChanges.found = (result.trackChanges.insertions + result.trackChanges.deletions) > 0;

    if (!result.trackChanges.found) {
      result.issues.push('No track changes found in document');
    }

    // Validate track change structure
    this.validateTrackChangeStructure(content, result);
  }

  private validateTrackChangeStructure(content: string, result: ValidationResult): void {
    // Check for required attributes in track changes
    const trackChangeElements = content.match(/<w:(ins|del)[^>]*>/g) || [];
    
    for (const element of trackChangeElements) {
      if (!element.includes('w:author=')) {
        result.warnings.push('Track change missing author attribute');
      }
      if (!element.includes('w:date=')) {
        result.warnings.push('Track change missing date attribute');
      }
      if (!element.includes('w:id=')) {
        result.warnings.push('Track change missing ID attribute');
      }
    }

    // Check for proper content structure
    const insertionContent = content.match(/<w:ins[^>]*>[\s\S]*?<\/w:ins>/g) || [];
    const deletionContent = content.match(/<w:del[^>]*>[\s\S]*?<\/w:del>/g) || [];

    for (const ins of insertionContent) {
      if (!ins.includes('<w:t>') && !ins.includes('<w:r>')) {
        result.warnings.push('Insertion track change missing proper text structure');
      }
    }

    for (const del of deletionContent) {
      if (!del.includes('<w:delText>') && !del.includes('<w:r>')) {
        result.warnings.push('Deletion track change missing proper deletion text structure');
      }
    }
  }

  private checkCompatibility(content: string, result: ValidationResult): void {
    // Word compatibility checks
    result.compatibility.word = this.checkWordCompatibility(content, result);
    
    // Google Docs compatibility checks  
    result.compatibility.googleDocs = this.checkGoogleDocsCompatibility(content, result);
  }

  private checkWordCompatibility(content: string, result: ValidationResult): boolean {
    let compatible = true;

    // Check for Word-specific requirements
    if (!content.includes('w:trackRevisions')) {
      result.warnings.push('Document may not enable track changes by default in Word');
    }

    // Check namespace declarations
    if (content.includes('<w:') && !content.includes('xmlns:w=')) {
      result.warnings.push('Missing Word namespace declaration');
      compatible = false;
    }

    // Check for compatibility mode setting
    if (content.includes('<w:compat>') && !content.includes('compatibilityMode')) {
      result.warnings.push('Missing Word compatibility mode setting');
    }

    // Validate XML structure
    if (!this.isValidXmlStructure(content)) {
      result.issues.push('Invalid XML structure - may not open in Word');
      compatible = false;
    }

    return compatible && result.trackChanges.found;
  }

  private checkGoogleDocsCompatibility(content: string, result: ValidationResult): boolean {
    let compatible = true;

    // Google Docs has more limited OOXML support
    if (content.includes('<w:commentRange')) {
      result.warnings.push('Comments may not be fully supported in Google Docs');
    }

    // Complex formatting might not be supported
    if (content.includes('<w:drawing') || content.includes('<w:object')) {
      result.warnings.push('Complex objects may not be supported in Google Docs');
    }

    // Google Docs requires simpler track change structure
    const hasComplexTrackChanges = content.includes('<w:moveFrom') || 
                                  content.includes('<w:moveTo') ||
                                  content.includes('<w:customXml');
    
    if (hasComplexTrackChanges) {
      result.warnings.push('Complex track changes may not display properly in Google Docs');
      compatible = false;
    }

    return compatible && result.trackChanges.found;
  }

  private countMatches(text: string, regex: RegExp): number {
    const matches = text.match(regex);
    return matches ? matches.length : 0;
  }

  private isValidXmlStructure(content: string): boolean {
    try {
      // Basic XML validation - check for balanced tags
      const tagPattern = /<(\/?)([\w:]+)[^>]*>/g;
      const stack: string[] = [];
      let match;

      while ((match = tagPattern.exec(content)) !== null) {
        const isClosing = match[1] === '/';
        const tagName = match[2];

        if (!tagName) continue; // Skip if no tag name

        if (isClosing) {
          const poppedTag = stack.pop();
          if (poppedTag === undefined || poppedTag !== tagName) {
            return false; // Unmatched closing tag
          }
        } else if (!match[0]!.endsWith('/>')) {
          stack.push(tagName); // Opening tag
        }
      }

      return stack.length === 0; // All tags should be closed
    } catch {
      return false;
    }
  }

  /**
   * Generate a human-readable validation report
   */
  generateReport(validation: ValidationResult): string {
    const report: string[] = [];
    
    report.push('DOCX Track Changes Validation Report');
    report.push('=====================================');
    report.push('');
    
    // Overall status
    report.push(`Overall Status: ${validation.isValid ? '✅ VALID' : '❌ INVALID'}`);
    report.push('');
    
    // Compatibility
    report.push('Compatibility:');
    report.push(`  Microsoft Word: ${validation.compatibility.word ? '✅ Compatible' : '❌ Issues Found'}`);
    report.push(`  Google Docs:    ${validation.compatibility.googleDocs ? '✅ Compatible' : '⚠️  Limited Support'}`);
    report.push('');
    
    // Track Changes
    report.push('Track Changes:');
    report.push(`  Found: ${validation.trackChanges.found ? '✅ Yes' : '❌ No'}`);
    report.push(`  Insertions: ${validation.trackChanges.insertions}`);
    report.push(`  Deletions:  ${validation.trackChanges.deletions}`);
    report.push(`  Replacements: ${validation.trackChanges.replacements}`);
    report.push('');
    
    // Document Structure
    report.push('Document Structure:');
    report.push(`  Document XML: ${validation.structure.hasDocumentXml ? '✅' : '❌'}`);
    report.push(`  Settings XML: ${validation.structure.hasSettingsXml ? '✅' : '⚠️'}`);
    report.push(`  Styles XML:   ${validation.structure.hasStylesXml ? '✅' : '⚠️'}`);
    report.push(`  Metadata:     ${validation.structure.hasMetadata ? '✅' : '⚠️'}`);
    report.push('');
    
    // Issues
    if (validation.issues.length > 0) {
      report.push('❌ Issues:');
      validation.issues.forEach(issue => {
        report.push(`  - ${issue}`);
      });
      report.push('');
    }
    
    // Warnings
    if (validation.warnings.length > 0) {
      report.push('⚠️  Warnings:');
      validation.warnings.forEach(warning => {
        report.push(`  - ${warning}`);
      });
      report.push('');
    }
    
    // Recommendations
    report.push('Recommendations:');
    if (!validation.isValid) {
      report.push('  - Fix critical issues before using document');
    }
    if (!validation.compatibility.word) {
      report.push('  - Test document in Microsoft Word before distribution');
    }
    if (!validation.compatibility.googleDocs) {
      report.push('  - Test document in Google Docs - some features may not work');
    }
    if (validation.warnings.length > 0) {
      report.push('  - Review warnings for potential compatibility issues');
    }
    if (validation.isValid && validation.issues.length === 0) {
      report.push('  - Document appears ready for use ✅');
    }
    
    return report.join('\n');
  }
}

/**
 * Convenience function to validate and report on a DOCX file
 */
export async function validateDocxFile(docxBytes: Uint8Array): Promise<string> {
  const validator = new DocxValidator();
  const result = await validator.validateDocx(docxBytes);
  return validator.generateReport(result);
}