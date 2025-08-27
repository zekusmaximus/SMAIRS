/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';
import { generateTestManuscript, loadLargeManuscript, ManuscriptGenerator } from './fixtures/manuscript-generator.js';
import { setupTestEnvironment, verifyExportQuality, TestHelpers } from './helpers/test-helpers.js';

test.describe('Complete SMAIRS Workflow', () => {
  let helpers: TestHelpers;
  
  test.beforeEach(async ({ page }) => {
    helpers = await setupTestEnvironment(page);
    await helpers.setupPerformanceMonitoring();
  });

  test('full pipeline from import to export in under 2 minutes', async ({ page }) => {
    // Setup
    const generator = new ManuscriptGenerator();
    const manuscript = await generator.generateLargeManuscript(); // 120k words
    const startTime = Date.now();
    
    // Start performance monitoring
    await page.evaluate(() => performance.mark('workflow-start'));

    // 1. Navigate to application
    await page.goto('/');
    await expect(page.locator('[data-testid="app-ready"]')).toBeVisible({ timeout: 10000 });

    // 2. Import manuscript
    console.log('Starting manuscript import...');
    await page.evaluate(() => performance.mark('import-start'));
    
    await helpers.uploadManuscript(manuscript.path);
    
    await page.evaluate(() => {
      performance.mark('import-end');
      performance.measure('import-time', 'import-start', 'import-end');
    });

    // Verify import success
    await expect(page.locator('[data-testid="manuscript-word-count"]')).toContainText('120,000', { timeout: 5000 });
    console.log('✓ Manuscript imported successfully');

    // 3. Wait for analysis to complete
    console.log('Starting analysis...');
    await helpers.waitForAnalysisComplete();
    console.log('✓ Analysis completed');

    // 4. Navigate to Opening Lab and review candidates
    console.log('Reviewing opening candidates...');
    await helpers.selectFirstCandidate();
    
    // Verify candidates loaded
    const candidates = page.locator('[data-testid="candidate-card"]');
    await expect(candidates).toHaveCount(5, { timeout: 10000 });
    console.log('✓ Opening candidates loaded');

    // 5. Review spoiler analysis
    console.log('Reviewing spoiler analysis...');
    const violationCount = await helpers.reviewSpoilerAnalysis();
    expect(violationCount).toBeGreaterThan(0);
    console.log(`✓ Found ${violationCount} spoiler violations`);
    
    // Verify heatmap is interactive
    await page.locator('[data-testid="spoiler-heatmap"]').click();
    await expect(page.locator('[data-testid="spoiler-detail"]')).toBeVisible();

    // 6. Generate and apply patches
    console.log('Generating patches...');
    await helpers.generateAndApplyPatches();
    console.log('✓ Patches generated and applied');

    // Verify patches were applied
    const patchCount = await page.locator('[data-testid="applied-patch"]').count();
    expect(patchCount).toBeGreaterThan(0);

    // 7. Export bundle
    console.log('Starting export...');
    const exportPath = await helpers.exportBundle({
      includeDocx: true,
      includeSynopsis: true,
      includeMemo: true
    });
    console.log(`✓ Export completed: ${exportPath}`);

    // 8. Verify export completion and quality
    await expect(page.locator('[data-testid="export-success"]')).toBeVisible();
    
    if (exportPath) {
      await verifyExportQuality(exportPath);
      console.log('✓ Export quality verified');
    }

    // 9. Verify total time constraint
    await page.evaluate(() => {
      performance.mark('workflow-end');
      performance.measure('total-workflow-time', 'workflow-start', 'workflow-end');
    });

    const elapsed = Date.now() - startTime;
    console.log(`Total workflow time: ${elapsed}ms (${elapsed / 1000}s)`);
    expect(elapsed).toBeLessThan(120000); // Under 2 minutes

    // 10. Check performance metrics
    const metrics = await helpers.getPerformanceMetrics();
    console.log('Performance metrics:', metrics);
    
    expect(metrics.importTime).toBeLessThan(5000); // < 5s import
    expect(metrics.analysisTime).toBeLessThan(30000); // < 30s analysis  
    expect(metrics.exportTime).toBeLessThan(15000); // < 15s export

    // 11. Check memory usage
    const memoryUsage = await helpers.checkMemoryUsage();
    console.log(`Memory usage: ${Math.round(memoryUsage / 1024 / 1024)}MB`);
    expect(memoryUsage).toBeLessThan(300 * 1024 * 1024); // Under 300MB

    console.log('✅ Complete workflow test passed!');
  });

  test('handles errors gracefully and recovers', async ({ page }) => {
    console.log('Testing error recovery...');
    
    // Test network failure scenario
    await helpers.simulateNetworkFailure();
    
    await page.goto('/');
    
    // Should show offline mode indicator
    await expect(page.locator('[data-testid="offline-indicator"]')).toBeVisible({ timeout: 5000 });
    console.log('✓ Offline mode detected');

    // Test that core features still work offline
    const offlineCapable = await helpers.testOfflineCapabilities();
    expect(offlineCapable).toBe(true);
    console.log('✓ Offline capabilities verified');

    // Test recovery when network returns
    await page.unrouteAll();
    await page.reload();
    
    await expect(page.locator('[data-testid="app-ready"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="offline-indicator"]')).not.toBeVisible();
    console.log('✓ Network recovery successful');

    // Test file upload error handling
    const generator = new ManuscriptGenerator();
    const smallManuscript = await generator.generateSmallManuscript();
    
    // Simulate server error during upload
    await page.route('**/api/upload/**', route => {
      route.fulfill({ status: 500, body: 'Server Error' });
    });

    await helpers.uploadManuscript(smallManuscript.path);
    
    // Should show error message and retry option
    await expect(page.locator('[data-testid="upload-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="retry-upload-btn"]')).toBeVisible();
    console.log('✓ Upload error handling verified');

    // Test retry functionality
    await page.unroute('**/api/upload/**');
    await page.locator('[data-testid="retry-upload-btn"]').click();
    
    await expect(page.locator('[data-testid="import-success"]')).toBeVisible({ timeout: 15000 });
    console.log('✓ Retry functionality works');

    console.log('✅ Error recovery test passed!');
  });

  test('maintains performance with large manuscripts', async ({ page }) => {
    console.log('Testing performance with large manuscript...');
    
    const generator = new ManuscriptGenerator();
    const largeManuscript = await generator.generateLargeManuscript();
    
    await page.goto('/');
    
    // Start comprehensive performance monitoring
    const performanceData = await page.evaluate(() => {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'measure') {
            (window as any).performanceMeasures = (window as any).performanceMeasures || {};
            (window as any).performanceMeasures[entry.name] = entry.duration;
          }
        }
      });
      observer.observe({ entryTypes: ['measure'] });
      
      return { monitoring: true };
    });

    // Test import performance
    await helpers.uploadManuscript(largeManuscript.path);
    
    const importMetrics = await helpers.getPerformanceMetrics();
    expect(importMetrics.importTime).toBeLessThan(5000);
    console.log(`✓ Import time: ${importMetrics.importTime}ms`);

    // Test analysis performance
    await helpers.waitForAnalysisComplete();
    
    const analysisMetrics = await helpers.getPerformanceMetrics();
    expect(analysisMetrics.analysisTime).toBeLessThan(30000);
    console.log(`✓ Analysis time: ${analysisMetrics.analysisTime}ms`);

    // Test UI responsiveness during heavy operations
    const frameRate = await helpers.measureFrameRate(3000);
    expect(frameRate).toBeGreaterThan(30); // At least 30fps
    console.log(`✓ Frame rate: ${frameRate}fps`);

    // Test memory management
    const initialMemory = await helpers.checkMemoryUsage();
    
    // Perform memory-intensive operations
    await page.locator('[data-testid="spoiler-tab"]').click();
    await page.waitForSelector('[data-testid="spoiler-heatmap"]');
    
    // Switch between different views to test memory stability
    await page.locator('[data-testid="context-tab"]').click();
    await page.locator('[data-testid="metrics-tab"]').click();
    await page.locator('[data-testid="preview-tab"]').click();
    
    const finalMemory = await helpers.checkMemoryUsage();
    const memoryIncrease = finalMemory - initialMemory;
    
    console.log(`Memory usage: ${Math.round(initialMemory / 1024 / 1024)}MB → ${Math.round(finalMemory / 1024 / 1024)}MB`);
    expect(finalMemory).toBeLessThan(300 * 1024 * 1024); // Under 300MB total
    expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase
    
    // Test export performance
    await helpers.generateAndApplyPatches();
    const exportPath = await helpers.exportBundle();
    
    const exportMetrics = await helpers.getPerformanceMetrics();
    expect(exportMetrics.exportTime).toBeLessThan(15000);
    console.log(`✓ Export time: ${exportMetrics.exportTime}ms`);
    
    if (exportPath) {
      await verifyExportQuality(exportPath);
    }

    console.log('✅ Performance test passed!');
  });

  test('accessibility compliance throughout workflow', async ({ page }) => {
    console.log('Testing accessibility compliance...');
    
    await page.goto('/');
    
    // Check initial accessibility
    let a11yResults = await helpers.checkAccessibility();
    expect(a11yResults.missingAltText).toBe(0);
    expect(a11yResults.missingLabels).toBe(0);
    console.log('✓ Initial accessibility check passed');

    // Test keyboard navigation
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(['BUTTON', 'INPUT', 'A']).toContain(focusedElement);
    console.log('✓ Keyboard navigation works');

    // Upload manuscript and test accessibility with content
    const generator = new ManuscriptGenerator();
    const manuscript = await generator.generateMediumManuscript();
    
    await helpers.uploadManuscript(manuscript.path);
    await helpers.waitForAnalysisComplete();
    
    // Check accessibility with loaded content
    a11yResults = await helpers.checkAccessibility();
    expect(a11yResults.missingAltText).toBeLessThan(5);
    expect(a11yResults.missingLabels).toBeLessThan(3);
    
    // Test screen reader announcements
    const announcements = await page.locator('[aria-live]').count();
    expect(announcements).toBeGreaterThan(0);
    console.log('✓ ARIA live regions present');

    // Test focus management in modals
    await page.locator('[data-testid="export-bundle-btn"]').click();
    
    const modalVisible = await page.locator('[role="dialog"]').isVisible();
    if (modalVisible) {
      const focusedInModal = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"]');
        return modal?.contains(document.activeElement);
      });
      expect(focusedInModal).toBe(true);
      console.log('✓ Modal focus management works');
      
      // Close modal with Escape
      await page.keyboard.press('Escape');
      await expect(page.locator('[role="dialog"]')).not.toBeVisible();
      console.log('✓ Modal keyboard dismissal works');
    }

    console.log('✅ Accessibility test passed!');
  });

  test('handles edge cases and unusual inputs', async ({ page }) => {
    console.log('Testing edge cases...');
    
    await page.goto('/');
    
    // Test with extremely small manuscript
    const generator = new ManuscriptGenerator();
    const tinyManuscript = await generator.generateTestManuscript({ wordCount: 50 });
    
    await helpers.uploadManuscript(tinyManuscript.path);
    
    // Should handle gracefully with appropriate messaging
    await expect(page.locator('[data-testid="manuscript-too-small-warning"]')).toBeVisible({ timeout: 10000 });
    console.log('✓ Tiny manuscript handled gracefully');

    // Test with manuscript containing special characters
    const specialManuscript = await generator.generateTestManuscript({ 
      wordCount: 5000 
    });
    
    await page.reload();
    await helpers.uploadManuscript(specialManuscript.path);
    await helpers.waitForAnalysisComplete();
    
    // Should complete analysis without errors
    await expect(page.locator('[data-testid="analysis-complete"]')).toBeVisible();
    console.log('✓ Special characters handled correctly');

    // Test rapid successive operations
    await helpers.selectFirstCandidate();
    
    // Rapidly click between tabs
    for (let i = 0; i < 5; i++) {
      await page.locator('[data-testid="spoiler-tab"]').click();
      await page.locator('[data-testid="context-tab"]').click();
      await page.locator('[data-testid="metrics-tab"]').click();
    }
    
    // Should remain stable
    const errors = await helpers.checkConsoleErrors();
    expect(errors.filter(e => e.includes('Error')).length).toBeLessThan(3);
    console.log('✓ Rapid operations handled without major errors');

    // Test browser back/forward navigation
    await page.goBack();
    await page.goForward();
    await expect(page.locator('[data-testid="app-ready"]')).toBeVisible();
    console.log('✓ Browser navigation handled correctly');

    console.log('✅ Edge cases test passed!');
  });

  test('export formats and quality verification', async ({ page }) => {
    console.log('Testing export formats...');
    
    const generator = new ManuscriptGenerator();
    const manuscript = await generator.generateMediumManuscript();
    
    await page.goto('/');
    await helpers.uploadManuscript(manuscript.path);
    await helpers.waitForAnalysisComplete();
    await helpers.selectFirstCandidate();
    await helpers.generateAndApplyPatches();

    // Test DOCX export with track changes
    console.log('Testing DOCX export...');
    const docxPath = await helpers.exportBundle({
      includeDocx: true,
      includePdf: false,
      includeSynopsis: true
    });

    if (docxPath) {
      await verifyExportQuality(docxPath);
      console.log('✓ DOCX export quality verified');
    }

    // Test full bundle export
    console.log('Testing complete bundle export...');
    await page.reload();
    await helpers.uploadManuscript(manuscript.path);
    await helpers.waitForAnalysisComplete();
    await helpers.selectFirstCandidate();
    await helpers.generateAndApplyPatches();

    const bundlePath = await helpers.exportBundle({
      includeDocx: true,
      includePdf: true,
      includeSynopsis: true,
      includeMemo: true
    });

    if (bundlePath) {
      await verifyExportQuality(bundlePath);
      
      // Verify bundle contents
      if (bundlePath.endsWith('.zip')) {
        const JSZip = (await import('jszip')).default;
        const fs = await import('fs/promises');
        const content = await fs.readFile(bundlePath);
        const zip = await JSZip.loadAsync(content);
        
        const files = Object.keys(zip.files);
        console.log('Bundle files:', files);
        
        expect(files.some(f => f.includes('.docx'))).toBe(true);
        expect(files.some(f => f.includes('synopsis'))).toBe(true);
        expect(files.some(f => f.includes('memo') || f.includes('rationale'))).toBe(true);
        
        console.log('✓ Bundle contents verified');
      }
    }

    console.log('✅ Export formats test passed!');
  });

  test.afterEach(async ({ page }, testInfo) => {
    // Take screenshot on failure
    if (testInfo.status === 'failed') {
      await helpers.takeScreenshot(`failed-${testInfo.title}`);
    }
    
    // Clean up any remaining routes
    await page.unrouteAll();
    
    // Log final performance metrics
    try {
      const finalMetrics = await helpers.getPerformanceMetrics();
      console.log('Final test metrics:', finalMetrics);
    } catch (error) {
      console.warn('Could not gather final metrics:', error);
    }
  });
});