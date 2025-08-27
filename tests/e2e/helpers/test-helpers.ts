/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import { Page, expect } from '@playwright/test';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';

export interface TestContext {
  page: Page;
  startTime: number;
  metrics: PerformanceMetrics;
}

export interface PerformanceMetrics {
  importTime?: number;
  analysisTime?: number;
  exportTime?: number;
  memoryUsage: number[];
  renderTimes: number[];
  networkRequests: number;
}

export class TestHelpers {
  constructor(private page: Page) {}

  async setupPerformanceMonitoring(): Promise<PerformanceMetrics> {
    const metrics: PerformanceMetrics = {
      memoryUsage: [],
      renderTimes: [],
      networkRequests: 0
    };

    // Monitor network requests
    this.page.on('request', () => {
      metrics.networkRequests++;
    });

    // Monitor performance
    await this.page.addInitScript(() => {
      (window as any).performanceData = {
        marks: [],
        measures: []
      };
      
      // Override performance.mark
      const originalMark = performance.mark;
      performance.mark = function(markName: string) {
        (window as any).performanceData.marks.push({
          name: markName,
          time: performance.now()
        });
        return originalMark.call(performance, markName);
      };

      // Override performance.measure
      const originalMeasure = performance.measure;
      performance.measure = function(measureName: string, startMark?: string, endMark?: string) {
        const result = originalMeasure.call(performance, measureName, startMark, endMark);
        (window as any).performanceData.measures.push({
          name: measureName,
          duration: result.duration,
          startTime: result.startTime
        });
        return result;
      };
    });

    return metrics;
  }

  async waitForElementWithTimeout(selector: string, timeout = 10000) {
    return this.page.waitForSelector(selector, { timeout });
  }

  async uploadManuscript(filePath: string) {
    await this.page.locator('[data-testid="import-button"]').click();
    await this.page.setInputFiles('input[type="file"]', filePath);
    
    // Wait for upload to complete
    await this.waitForElementWithTimeout('[data-testid="import-success"]', 15000);
  }

  async waitForAnalysisComplete() {
    // Start timing analysis
    await this.page.evaluate(() => performance.mark('analysis-start'));
    
    await this.waitForElementWithTimeout('[data-testid="analysis-complete"]', 60000);
    
    // End timing analysis
    await this.page.evaluate(() => {
      performance.mark('analysis-end');
      performance.measure('analysis-time', 'analysis-start', 'analysis-end');
    });
  }

  async selectFirstCandidate() {
    await this.page.locator('[data-testid="opening-lab-tab"]').click();
    
    // Wait for candidates to load
    const candidates = this.page.locator('[data-testid="candidate-card"]');
    await expect(candidates.first()).toBeVisible();
    
    // Select first candidate
    await candidates.nth(0).click();
    await this.page.locator('[data-testid="select-candidate-btn"]').click();
  }

  async reviewSpoilerAnalysis() {
    await this.waitForElementWithTimeout('[data-testid="spoiler-heatmap"]');
    
    const violations = await this.page.locator('[data-testid="spoiler-violation"]').count();
    return violations;
  }

  async generateAndApplyPatches() {
    // Generate patches
    await this.page.evaluate(() => performance.mark('patch-generation-start'));
    
    await this.page.locator('[data-testid="generate-patches-btn"]').click();
    await this.waitForElementWithTimeout('[data-testid="patches-ready"]', 30000);
    
    await this.page.evaluate(() => {
      performance.mark('patch-generation-end');
      performance.measure('patch-generation-time', 'patch-generation-start', 'patch-generation-end');
    });

    // Apply patches
    await this.page.locator('[data-testid="apply-all-patches-btn"]').click();
    await this.waitForElementWithTimeout('[data-testid="patches-applied"]', 20000);
  }

  async exportBundle(options: {
    includeDocx?: boolean;
    includePdf?: boolean;
    includeSynopsis?: boolean;
    includeMemo?: boolean;
  } = {}) {
    const {
      includeDocx = true,
      includePdf = false,
      includeSynopsis = true,
      includeMemo = true
    } = options;

    await this.page.evaluate(() => performance.mark('export-start'));

    await this.page.locator('[data-testid="export-bundle-btn"]').click();
    
    // Configure export options
    if (includeDocx) {
      await this.page.locator('[data-testid="export-format-docx"]').check();
    }
    if (includePdf) {
      await this.page.locator('[data-testid="export-format-pdf"]').check();
    }
    if (includeSynopsis) {
      await this.page.locator('[data-testid="include-synopsis"]').check();
    }
    if (includeMemo) {
      await this.page.locator('[data-testid="include-memo"]').check();
    }

    await this.page.locator('[data-testid="start-export-btn"]').click();
    
    // Wait for export to complete
    await this.waitForElementWithTimeout('[data-testid="export-complete"]', 60000);
    
    await this.page.evaluate(() => {
      performance.mark('export-end');
      performance.measure('export-time', 'export-start', 'export-end');
    });

    // Get export path
    const exportPath = await this.page.locator('[data-testid="export-path"]').textContent();
    return exportPath;
  }

  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    return this.page.evaluate(() => {
      const data = (window as any).performanceData;
      const measures = data.measures.reduce((acc: any, measure: any) => {
        acc[measure.name] = measure.duration;
        return acc;
      }, {});

      return {
        importTime: measures['import-time'],
        analysisTime: measures['analysis-time'],
        exportTime: measures['export-time'],
        memoryUsage: (performance as any).memory ? [(performance as any).memory.usedJSHeapSize] : [],
        renderTimes: [],
        networkRequests: data.networkRequests || 0
      };
    });
  }

  async checkMemoryUsage(): Promise<number> {
    const memory = await this.page.evaluate(() => {
      return (performance as any).memory ? (performance as any).memory.usedJSHeapSize : 0;
    });
    return memory;
  }

  async measureFrameRate(durationMs = 5000): Promise<number> {
    return this.page.evaluate((duration) => {
      return new Promise((resolve) => {
        let frames = 0;
        const startTime = performance.now();
        
        function countFrame() {
          frames++;
          const elapsed = performance.now() - startTime;
          
          if (elapsed < duration) {
            requestAnimationFrame(countFrame);
          } else {
            const fps = (frames / elapsed) * 1000;
            resolve(Math.round(fps));
          }
        }
        
        requestAnimationFrame(countFrame);
      });
    }, durationMs);
  }

  async simulateSlowNetwork() {
    await this.page.route('**/api/**', async route => {
      // Add 2-5 second delay to simulate slow network
      const delay = 2000 + Math.random() * 3000;
      await new Promise(resolve => setTimeout(resolve, delay));
      route.continue();
    });
  }

  async simulateNetworkFailure() {
    await this.page.route('**/api/**', route => {
      route.abort('connectionrefused');
    });
  }

  async testOfflineCapabilities() {
    // Check offline indicator
    await this.waitForElementWithTimeout('[data-testid="offline-indicator"]');
    
    // Test that basic functionality still works
    const buttons = await this.page.locator('button:not([disabled])').count();
    expect(buttons).toBeGreaterThan(0);
    
    // Test local storage functionality
    const hasLocalData = await this.page.evaluate(() => {
      return localStorage.length > 0;
    });
    
    return hasLocalData;
  }

  async checkConsoleErrors(): Promise<string[]> {
    const errors: string[] = [];
    
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    return errors;
  }

  async checkAccessibility() {
    // Check basic accessibility requirements
    const missingAltText = await this.page.locator('img:not([alt])').count();
    const missingLabels = await this.page.locator('input:not([aria-label]):not([aria-labelledby])').count();
    const lowContrast = await this.page.evaluate(() => {
      // Simple contrast check (would need more sophisticated implementation)
      const elements = document.querySelectorAll('[style*="color"]');
      return elements.length;
    });

    return {
      missingAltText,
      missingLabels,
      potentialContrastIssues: lowContrast
    };
  }

  async takeScreenshot(name: string) {
    await this.page.screenshot({ 
      path: `tests/e2e/screenshots/${name}.png`,
      fullPage: true 
    });
  }
}

export async function verifyExportQuality(exportPath: string | null) {
  if (!exportPath) {
    throw new Error('Export path is null');
  }

  try {
    // Check if file exists
    const stats = await stat(exportPath);
    expect(stats.size).toBeGreaterThan(1000); // At least 1KB
    
    // For ZIP files, check internal structure
    if (exportPath.endsWith('.zip')) {
      const JSZip = (await import('jszip')).default;
      const content = await readFile(exportPath);
      const zip = await JSZip.loadAsync(content);
      
      const files = Object.keys(zip.files);
      expect(files.length).toBeGreaterThan(0);
      
      // Check for expected files
      const hasManuscript = files.some(f => f.includes('manuscript') || f.includes('opening'));
      expect(hasManuscript).toBe(true);
    }
    
    return true;
  } catch (error) {
    throw new Error(`Export quality verification failed: ${error}`);
  }
}

export async function setupTestEnvironment(page: Page) {
  // Set viewport for consistent testing
  await page.setViewportSize({ width: 1280, height: 720 });
  
  // Set up error handling
  page.on('pageerror', error => {
    console.error('Page error:', error);
  });
  
  // Set up request logging
  page.on('requestfailed', request => {
    console.warn('Request failed:', request.url(), request.failure()?.errorText);
  });
  
  return new TestHelpers(page);
}