import { useEffect, useState, useCallback } from 'react';

// Minimal helper types to avoid explicit 'any' while keeping dependencies light
type LongTaskEntry = PerformanceEntry & { attribution?: Array<{ name?: string }>; duration: number };
type LayoutShiftEntry = PerformanceEntry & { value?: number };
type FirstInputEntry = PerformanceEntry & { processingStart?: number };
type PerfWithMemory = { memory?: { usedJSHeapSize: number } };

export interface PerformanceMetrics {
  // Core performance metrics
  fps: number[];
  memoryUsage: number[];
  loadTimes: Record<string, number>;
  renderTimes: Record<string, number>;

  // Network metrics
  networkRequests: number;
  networkLatency: number[];
  failedRequests: number;

  // User interaction metrics
  inputLatency: number[];
  scrollPerformance: number[];

  // Application-specific metrics
  manuscriptProcessingTime: Record<string, number>;
  exportTimes: Record<string, number>;
  analysisPerformance: Record<string, number>;

  // Quality settings (auto-adjusted based on performance)
  qualitySettings: QualitySettings;
}

export interface QualitySettings {
  virtualScrollOverscan: number;
  searchChunkSize: number;
  cacheSize: number;
  renderThrottle: number;
  memoryThreshold: number;
  enableAdvancedFeatures: boolean;
}

export interface PerformanceReport {
  // Summary metrics
  averageFPS: number;
  memoryPeak: number;
  averageMemory: number;
  slowTasks: number;
  totalLoadTime: number;

  // Performance scores (0-100)
  overallScore: number;
  performanceScore: number;
  memoryScore: number;
  networkScore: number;

  // Recommendations
  suggestions: string[];
  criticalIssues: string[];

  // Detailed breakdown
  breakdown: {
    import: PerformanceBreakdown;
    analysis: PerformanceBreakdown;
    export: PerformanceBreakdown;
    ui: PerformanceBreakdown;
  };
}

interface PerformanceBreakdown {
  duration: number;
  score: number;
  issues: string[];
  optimizations: string[];
}

export class PerformanceMonitor {
  private observers: PerformanceObserver[] = [];
  private metrics: PerformanceMetrics;
  private isMonitoring = false;
  private frameCount = 0;
  private lastFrameTime = performance.now();
  private memoryCheckInterval?: number;
  private networkStartTimes = new Map<string, number>();

  constructor() {
    this.metrics = {
      fps: [],
      memoryUsage: [],
      loadTimes: {},
      renderTimes: {},
      networkRequests: 0,
      networkLatency: [],
      failedRequests: 0,
      inputLatency: [],
      scrollPerformance: [],
      manuscriptProcessingTime: {},
      exportTimes: {},
      analysisPerformance: {},
      qualitySettings: {
        virtualScrollOverscan: 20,
        searchChunkSize: 50000,
        cacheSize: 100,
        renderThrottle: 16,
        memoryThreshold: 200,
        enableAdvancedFeatures: true
      }
    };
  }

  startMonitoring(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    console.log('🔍 Starting performance monitoring...');

    this.setupPerformanceObservers();
    this.monitorFrameRate();
    this.monitorMemoryUsage();
    this.monitorNetworkRequests();
    this.monitorUserInteractions();
    this.setupCustomMarkers();
  }

  stopMonitoring(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    console.log('⏹️ Stopping performance monitoring...');

    // Clean up observers
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];

    // Clear intervals
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = undefined;
    }
  }

  private setupPerformanceObservers(): void {
    // Monitor long tasks (tasks > 50ms)
    if ('PerformanceObserver' in window) {
      try {
        const longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) {
              this.logSlowTask(entry);
            }
          }
        });
        longTaskObserver.observe({ entryTypes: ['longtask'] });
        this.observers.push(longTaskObserver);
      } catch (error) {
        console.warn('Long task monitoring not available:', error);
      }

      // Monitor layout shifts
      try {
        const layoutShiftObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const ls = entry as LayoutShiftEntry;
            if ((ls.value ?? 0) > 0.1) {
              console.warn('Layout shift detected:', entry);
            }
          }
        });
        layoutShiftObserver.observe({ entryTypes: ['layout-shift'] });
        this.observers.push(layoutShiftObserver);
      } catch (error) {
        console.warn('Layout shift monitoring not available:', error);
      }

      // Monitor largest contentful paint
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.metrics.loadTimes['lcp'] = entry.startTime;
          }
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        this.observers.push(lcpObserver);
      } catch (error) {
        console.warn('LCP monitoring not available:', error);
      }

      // Monitor first input delay
      try {
        const fidObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const fie = entry as FirstInputEntry;
            const start = typeof fie.processingStart === 'number' ? fie.processingStart : entry.startTime;
            this.metrics.inputLatency.push(start - entry.startTime);
          }
        });
        fidObserver.observe({ entryTypes: ['first-input'] });
        this.observers.push(fidObserver);
      } catch (error) {
        console.warn('FID monitoring not available:', error);
      }
    }
  }

  private monitorFrameRate(): void {
    let frameCount = 0;
    let startTime = performance.now();
    let qualityCheckCount = 0;

    const measureFPS = () => {
      if (!this.isMonitoring) return;

      frameCount++;
      const currentTime = performance.now();

      if (currentTime >= startTime + 1000) {
        const fps = Math.round((frameCount * 1000) / (currentTime - startTime));
        this.metrics.fps.push(fps);

        // Keep only last 60 seconds of data
        if (this.metrics.fps.length > 60) {
          this.metrics.fps = this.metrics.fps.slice(-60);
        }

        if (fps < 30) {
          this.warnLowFrameRate(fps);
        }

        // Auto-adjust quality settings every 10 seconds
        qualityCheckCount++;
        if (qualityCheckCount >= 10) {
          this.adjustQualitySettings();
          qualityCheckCount = 0;
        }

        frameCount = 0;
        startTime = currentTime;
      }

      requestAnimationFrame(measureFPS);
    };

    requestAnimationFrame(measureFPS);
  }

  private monitorMemoryUsage(): void {
  if (!('memory' in (performance as object))) {
      console.warn('Memory monitoring not available in this browser');
      return;
    }

    this.memoryCheckInterval = window.setInterval(() => {
      if (!this.isMonitoring) return;

  const memory = (performance as unknown as PerfWithMemory).memory;
  if (!memory || typeof memory.usedJSHeapSize !== 'number') return;
  const memoryMB = memory.usedJSHeapSize / (1024 * 1024);

      this.metrics.memoryUsage.push(memoryMB);

      // Keep only last 5 minutes of data
      if (this.metrics.memoryUsage.length > 300) {
        this.metrics.memoryUsage = this.metrics.memoryUsage.slice(-300);
      }

      if (memoryMB > 250) {
        this.warnHighMemory(memoryMB);
      }

      // Trigger garbage collection warning if memory growth is too rapid
      if (this.metrics.memoryUsage.length >= 10) {
        const recent = this.metrics.memoryUsage.slice(-10);
        const growth = recent[recent.length - 1]! - recent[0]!;
        if (growth > 50) { // More than 50MB growth in 10 checks
          console.warn(`⚠️ Rapid memory growth detected: +${growth.toFixed(1)}MB`);
        }
      }
    }, 1000);
  }

  private monitorNetworkRequests(): void {
    // Intercept fetch requests
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const startTime = performance.now();
      const url = args[0] instanceof Request ? args[0].url : args[0].toString();

      this.metrics.networkRequests++;
      this.networkStartTimes.set(url, startTime);

      try {
        const response = await originalFetch(...args);
        const endTime = performance.now();
        const latency = endTime - startTime;

        this.metrics.networkLatency.push(latency);
        this.networkStartTimes.delete(url);

        if (latency > 5000) {
          console.warn(`🐌 Slow network request: ${url} took ${latency.toFixed(0)}ms`);
        }

        return response;
      } catch (error) {
        this.metrics.failedRequests++;
        this.networkStartTimes.delete(url);
        throw error;
      }
    };
  }

  private monitorUserInteractions(): void {
    let scrollStartTime = 0;
    let isScrolling = false;

    // Monitor scroll performance
    const handleScrollStart = () => {
      if (!isScrolling) {
        scrollStartTime = performance.now();
        isScrolling = true;
      }
    };

    const handleScrollEnd = () => {
      if (isScrolling) {
        const scrollDuration = performance.now() - scrollStartTime;
        this.metrics.scrollPerformance.push(scrollDuration);
        isScrolling = false;
      }
    };

    let scrollTimer: number;
    const handleScroll = () => {
      handleScrollStart();
      clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(handleScrollEnd, 150);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    // Monitor input latency
  const handleInput = () => {
      const startTime = performance.now();
      requestAnimationFrame(() => {
        const endTime = performance.now();
        this.metrics.inputLatency.push(endTime - startTime);
      });
    };

    document.addEventListener('input', handleInput);
    document.addEventListener('click', handleInput);
  }

  private setupCustomMarkers(): void {
    // Override performance.mark to track custom application markers
    const originalMark = performance.mark.bind(performance);
    const originalMeasure = performance.measure.bind(performance);

    performance.mark = (markName: string) => {
      // Track application-specific marks
      if (markName.includes('manuscript')) {
        console.log(`📝 Manuscript operation: ${markName}`);
      } else if (markName.includes('export')) {
        console.log(`📦 Export operation: ${markName}`);
      } else if (markName.includes('analysis')) {
        console.log(`🔍 Analysis operation: ${markName}`);
      }

      return originalMark(markName);
    };

    performance.measure = (measureName: string, startMark?: string, endMark?: string) => {
      const result = originalMeasure(measureName, startMark, endMark);

      // Store custom measurements
      if (measureName.includes('manuscript')) {
        this.metrics.manuscriptProcessingTime[measureName] = result.duration;
      } else if (measureName.includes('export')) {
        this.metrics.exportTimes[measureName] = result.duration;
      } else if (measureName.includes('analysis')) {
        this.metrics.analysisPerformance[measureName] = result.duration;
      } else {
        this.metrics.renderTimes[measureName] = result.duration;
      }

      // Log slow operations
      if (result.duration > 1000) {
        console.warn(`🐌 Slow operation: ${measureName} took ${result.duration.toFixed(0)}ms`);
      }

      return result;
    };
  }

  private logSlowTask(entry: PerformanceEntry): void {
    console.warn(`🐌 Long task detected: ${entry.duration.toFixed(0)}ms`, entry);

    // Try to identify the source
    const longTask = entry as LongTaskEntry;
    if (longTask.attribution && longTask.attribution.length > 0) {
      console.warn('Task attribution:', longTask.attribution[0]);
    }
  }

  private warnLowFrameRate(fps: number): void {
    console.warn(`⚠️ Low frame rate detected: ${fps}fps`);

    // Provide specific suggestions based on current activity
    if (this.metrics.memoryUsage.length > 0) {
      const currentMemory = this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1]!;
      if (currentMemory > 200) {
        console.warn('💡 High memory usage may be causing frame drops');
      }
    }
  }

  private warnHighMemory(memoryMB: number): void {
    console.warn(`⚠️ High memory usage: ${memoryMB.toFixed(1)}MB`);

    if (memoryMB > 300) {
      console.warn('🚨 Critical memory usage! Consider refreshing the page.');
    }
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  generateReport(): PerformanceReport {
    const avgFPS = this.getAverage(this.metrics.fps);
    const memoryPeak = Math.max(...this.metrics.memoryUsage, 0);
    const averageMemory = this.getAverage(this.metrics.memoryUsage);

    // Calculate performance scores (0-100)
    const performanceScore = Math.min(100, Math.max(0, (avgFPS / 60) * 100));
    const memoryScore = Math.min(100, Math.max(0, 100 - (memoryPeak / 500) * 100));
    const networkScore = this.calculateNetworkScore();
    const overallScore = Math.round((performanceScore + memoryScore + networkScore) / 3);

    const suggestions = this.generateSuggestions();
    const criticalIssues = this.identifyCriticalIssues();

    return {
      averageFPS: Math.round(avgFPS),
      memoryPeak: Math.round(memoryPeak),
      averageMemory: Math.round(averageMemory),
      slowTasks: this.metrics.fps.filter(fps => fps < 30).length,
      totalLoadTime: this.getTotalLoadTime(),

      overallScore,
      performanceScore: Math.round(performanceScore),
      memoryScore: Math.round(memoryScore),
      networkScore: Math.round(networkScore),

      suggestions,
      criticalIssues,

      breakdown: {
        import: this.analyzeImportPerformance(),
        analysis: this.analyzeAnalysisPerformance(),
        export: this.analyzeExportPerformance(),
        ui: this.analyzeUIPerformance()
      }
    };
  }

  private getAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateNetworkScore(): number {
    const avgLatency = this.getAverage(this.metrics.networkLatency);
    const failureRate = this.metrics.failedRequests / Math.max(this.metrics.networkRequests, 1);

    let score = 100;

    // Penalize high latency
    if (avgLatency > 1000) score -= 30;
    else if (avgLatency > 500) score -= 15;

    // Penalize failed requests
    score -= failureRate * 50;

    return Math.max(0, score);
  }

  private getTotalLoadTime(): number {
    return Object.values(this.metrics.loadTimes).reduce((sum, time) => sum + time, 0);
  }

  private generateSuggestions(): string[] {
    const suggestions: string[] = [];
    const avgFPS = this.getAverage(this.metrics.fps);
    const memoryPeak = Math.max(...this.metrics.memoryUsage, 0);
    const avgLatency = this.getAverage(this.metrics.networkLatency);

    if (avgFPS < 30) {
      suggestions.push('Consider reducing visual complexity or enabling hardware acceleration');
      suggestions.push('Close other browser tabs to free up system resources');
    }

    if (memoryPeak > 250) {
      suggestions.push('High memory usage detected - consider processing smaller sections');
      suggestions.push('Try refreshing the page periodically during long sessions');
    }

    if (avgLatency > 1000) {
      suggestions.push('Network latency is high - check your internet connection');
      suggestions.push('Consider working offline when possible');
    }

    if (this.metrics.failedRequests > this.metrics.networkRequests * 0.1) {
      suggestions.push('Multiple network failures detected - check server connectivity');
    }

    // Application-specific suggestions
    const exportTimes = Object.values(this.metrics.exportTimes);
    if (exportTimes.some(time => time > 10000)) {
      suggestions.push('Export operations are slow - consider exporting smaller sections');
    }

    const analysisTimes = Object.values(this.metrics.analysisPerformance);
    if (analysisTimes.some(time => time > 30000)) {
      suggestions.push('Analysis is taking longer than expected - manuscript may be very large');
    }

    return suggestions;
  }

  private identifyCriticalIssues(): string[] {
    const issues: string[] = [];
    const avgFPS = this.getAverage(this.metrics.fps);
    const memoryPeak = Math.max(...this.metrics.memoryUsage, 0);

    if (avgFPS < 15) {
      issues.push('Severe performance degradation detected (FPS < 15)');
    }

    if (memoryPeak > 400) {
      issues.push('Critical memory usage - application may become unstable');
    }

    if (this.metrics.failedRequests > this.metrics.networkRequests * 0.5) {
      issues.push('Majority of network requests are failing');
    }

    return issues;
  }

  private analyzeImportPerformance(): PerformanceBreakdown {
    const importTimes = Object.entries(this.metrics.manuscriptProcessingTime)
      .filter(([key]) => key.includes('import'))
      .map(([, duration]) => duration);

    const avgDuration = this.getAverage(importTimes);
    const score = avgDuration < 5000 ? 100 : Math.max(0, 100 - ((avgDuration - 5000) / 5000) * 50);

    return {
      duration: avgDuration,
      score: Math.round(score),
      issues: avgDuration > 10000 ? ['Import taking longer than 10 seconds'] : [],
      optimizations: avgDuration > 5000 ? ['Consider processing smaller files', 'Enable file streaming'] : []
    };
  }

  private analyzeAnalysisPerformance(): PerformanceBreakdown {
    const analysisTimes = Object.values(this.metrics.analysisPerformance);
    const avgDuration = this.getAverage(analysisTimes);
    const score = avgDuration < 10000 ? 100 : Math.max(0, 100 - ((avgDuration - 10000) / 20000) * 50);

    return {
      duration: avgDuration,
      score: Math.round(score),
      issues: avgDuration > 30000 ? ['Analysis taking longer than 30 seconds'] : [],
      optimizations: avgDuration > 15000 ? ['Consider processing in chunks', 'Enable progressive analysis'] : []
    };
  }

  private analyzeExportPerformance(): PerformanceBreakdown {
    const exportTimes = Object.values(this.metrics.exportTimes);
    const avgDuration = this.getAverage(exportTimes);
    const score = avgDuration < 8000 ? 100 : Math.max(0, 100 - ((avgDuration - 8000) / 8000) * 50);

    return {
      duration: avgDuration,
      score: Math.round(score),
      issues: avgDuration > 15000 ? ['Export taking longer than 15 seconds'] : [],
      optimizations: avgDuration > 10000 ? ['Enable incremental export', 'Compress output files'] : []
    };
  }

  private analyzeUIPerformance(): PerformanceBreakdown {
    const avgFPS = this.getAverage(this.metrics.fps);
    const avgInputLatency = this.getAverage(this.metrics.inputLatency);

    let score = 100;
    if (avgFPS < 60) score -= (60 - avgFPS) * 2;
    if (avgInputLatency > 16) score -= (avgInputLatency - 16) * 2;

    return {
      duration: avgInputLatency,
      score: Math.round(Math.max(0, score)),
      issues: [
        ...(avgFPS < 30 ? ['Low frame rate affecting user experience'] : []),
        ...(avgInputLatency > 100 ? ['High input latency detected'] : [])
      ],
      optimizations: [
        ...(avgFPS < 60 ? ['Optimize rendering performance'] : []),
        ...(avgInputLatency > 50 ? ['Reduce main thread blocking'] : [])
      ]
    };
  }

  // Auto-adjust quality settings based on performance
  adjustQualitySettings(): void {
    const avgFPS = this.getAverage(this.metrics.fps);
    const memoryPeak = Math.max(...this.metrics.memoryUsage, 0);
    const avgInputLatency = this.getAverage(this.metrics.inputLatency);

    let needsAdjustment = false;
    const settings = { ...this.metrics.qualitySettings };

    // Adjust based on FPS
    if (avgFPS < 30 && settings.enableAdvancedFeatures) {
      settings.enableAdvancedFeatures = false;
      settings.virtualScrollOverscan = Math.max(5, settings.virtualScrollOverscan - 5);
      needsAdjustment = true;
    } else if (avgFPS > 50 && !settings.enableAdvancedFeatures) {
      settings.enableAdvancedFeatures = true;
      settings.virtualScrollOverscan = Math.min(30, settings.virtualScrollOverscan + 5);
      needsAdjustment = true;
    }

    // Adjust based on memory usage
    if (memoryPeak > 300) {
      settings.cacheSize = Math.max(25, settings.cacheSize - 25);
      settings.memoryThreshold = Math.max(150, settings.memoryThreshold - 50);
      needsAdjustment = true;
    } else if (memoryPeak < 150 && settings.cacheSize < 100) {
      settings.cacheSize = Math.min(100, settings.cacheSize + 25);
      settings.memoryThreshold = Math.min(250, settings.memoryThreshold + 25);
      needsAdjustment = true;
    }

    // Adjust based on input latency
    if (avgInputLatency > 50) {
      settings.renderThrottle = Math.max(32, settings.renderThrottle * 2);
      settings.searchChunkSize = Math.max(25000, settings.searchChunkSize - 10000);
      needsAdjustment = true;
    } else if (avgInputLatency < 16 && settings.renderThrottle > 16) {
      settings.renderThrottle = Math.max(16, settings.renderThrottle / 2);
      settings.searchChunkSize = Math.min(100000, settings.searchChunkSize + 10000);
      needsAdjustment = true;
    }

    if (needsAdjustment) {
      this.metrics.qualitySettings = settings;
      console.log('🔧 Auto-adjusted quality settings:', settings);
      this.onQualitySettingsChange?.(settings);
    }
  }

  // Callback for quality settings changes
  onQualitySettingsChange?: (settings: QualitySettings) => void;

  setQualitySettingsCallback(callback: (settings: QualitySettings) => void): void {
    this.onQualitySettingsChange = callback;
  }

  getQualitySettings(): QualitySettings {
    return { ...this.metrics.qualitySettings };
  }

  // Manual quality adjustment
  setQualityLevel(level: 'low' | 'medium' | 'high'): void {
    const settings: QualitySettings = {
      low: {
        virtualScrollOverscan: 5,
        searchChunkSize: 25000,
        cacheSize: 25,
        renderThrottle: 32,
        memoryThreshold: 150,
        enableAdvancedFeatures: false
      },
      medium: {
        virtualScrollOverscan: 15,
        searchChunkSize: 50000,
        cacheSize: 50,
        renderThrottle: 16,
        memoryThreshold: 200,
        enableAdvancedFeatures: true
      },
      high: {
        virtualScrollOverscan: 25,
        searchChunkSize: 75000,
        cacheSize: 100,
        renderThrottle: 8,
        memoryThreshold: 300,
        enableAdvancedFeatures: true
      }
    }[level];

    this.metrics.qualitySettings = settings;
    this.onQualitySettingsChange?.(settings);
  }

  destroy(): void {
    this.stopMonitoring();
  }
}

// Global performance monitor instance
export const globalPerformanceMonitor = new PerformanceMonitor();

/**
 * React hook for performance monitoring
 */
export function usePerformanceMonitor() {
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    return () => {
      globalPerformanceMonitor.destroy();
    };
  }, []);

  const startMonitoring = useCallback(() => {
    globalPerformanceMonitor.startMonitoring();
    setIsMonitoring(true);
  }, []);

  const stopMonitoring = useCallback(() => {
    globalPerformanceMonitor.stopMonitoring();
    setIsMonitoring(false);
  }, []);

  const generateReport = useCallback(() => {
    const newReport = globalPerformanceMonitor.generateReport();
    setReport(newReport);
    return newReport;
  }, []);

  const getMetrics = useCallback(() => {
    return globalPerformanceMonitor.getMetrics();
  }, []);

  return {
    report,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    generateReport,
    getMetrics
  };
}

/**
 * Performance benchmark utilities
 */
export class PerformanceBenchmark {
  private benchmarks: Map<string, number[]> = new Map();

  async benchmark<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const startTime = performance.now();

    try {
      const result = await operation();
      const duration = performance.now() - startTime;

      if (!this.benchmarks.has(name)) {
        this.benchmarks.set(name, []);
      }
      this.benchmarks.get(name)!.push(duration);

      console.log(`⏱️ ${name}: ${duration.toFixed(2)}ms`);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`❌ ${name} failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  getBenchmarkResults(name: string) {
    const results = this.benchmarks.get(name) || [];
    if (results.length === 0) return null;

    const sorted = [...results].sort((a, b) => a - b);
    return {
      count: results.length,
      average: results.reduce((sum, val) => sum + val, 0) / results.length,
      median: sorted[Math.floor(sorted.length / 2)] || 0,
      min: Math.min(...results),
      max: Math.max(...results),
      p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
      p99: sorted[Math.floor(sorted.length * 0.99)] || 0
    };
  }

  getAllBenchmarks() {
    const results: Record<string, ReturnType<typeof this.getBenchmarkResults>> = {};
    for (const name of this.benchmarks.keys()) {
      results[name] = this.getBenchmarkResults(name);
    }
    return results;
  }

  clearBenchmarks(name?: string) {
    if (name) {
      this.benchmarks.delete(name);
    } else {
      this.benchmarks.clear();
    }
  }
}

export const globalBenchmark = new PerformanceBenchmark();
