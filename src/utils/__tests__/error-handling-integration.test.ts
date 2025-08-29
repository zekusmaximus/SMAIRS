import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { globalErrorReporter, ErrorCategory, ErrorSeverity } from '../error-reporter';
import { globalErrorRecovery } from '../error-recovery';
import { DataValidator, validateScene, recoverScene } from '../validation';
import { z, ZodError } from 'zod';

// Mock console methods to avoid noise in tests
const originalConsole = { ...console };
beforeEach(() => {
  console.log = vi.fn();
  console.warn = vi.fn();
  console.error = vi.fn();
  console.group = vi.fn();
  console.groupEnd = vi.fn();
});

afterEach(() => {
  Object.assign(console, originalConsole);
  // Clear any error reports between tests
  vi.clearAllMocks();
});

describe('Error Handling Integration', () => {
  describe('Error Reporter', () => {
    it('should report errors with proper categorization', () => {
      const error = new Error('Test network error');
      const report = globalErrorReporter.report(error, {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: 'test' }
      });

      expect(report).toBeDefined();
      expect(report.category).toBe(ErrorCategory.NETWORK);
      expect(report.severity).toBe(ErrorSeverity.MEDIUM);
      expect(report.originalError).toBe(error);
      expect(report.context).toEqual({ operation: 'test' });
    });

    it('should auto-categorize errors based on message', () => {
      const networkError = new Error('Failed to fetch');
      const report = globalErrorReporter.report(networkError);

      expect(report.category).toBe(ErrorCategory.NETWORK);
    });

    it('should provide user-friendly messages', () => {
      const error = new Error('Some technical error');
      const report = globalErrorReporter.report(error, {
        category: ErrorCategory.NETWORK
      });

      expect(report.userMessage.title).toBeDefined();
      expect(report.userMessage.message).toBeDefined();
      expect(report.userMessage.suggestions).toBeInstanceOf(Array);
      expect(report.userMessage.suggestions.length).toBeGreaterThan(0);
    });

    it('should include recovery actions for recoverable errors', () => {
      const error = new Error('Network timeout');
      const report = globalErrorReporter.report(error, {
        category: ErrorCategory.NETWORK,
        recoveryActions: [{
          label: 'Retry',
          action: () => console.log('Retrying...'),
          primary: true
        }]
      });

      expect(report.recoveryActions).toBeDefined();
      expect(report.recoveryActions?.[0]?.label).toBe('Retry');
      expect(report.recoveryActions?.[0]?.primary).toBe(true);
    });
  });

  describe('Error Recovery', () => {
    it('should execute operations with retry logic', async () => {
      let attempts = 0;
      const operation = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      const result = await globalErrorRecovery.withRetry(
        'test-operation',
        operation,
        { maxRetries: 3 }
      );

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries exceeded', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Persistent failure'));

      await expect(
        globalErrorRecovery.withRetry('test-operation', operation, { maxRetries: 2 })
      ).rejects.toThrow('Persistent failure');

      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should not retry non-retryable errors', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('404 Not Found'));

      await expect(
        globalErrorRecovery.withRetry('test-operation', operation, { maxRetries: 3 })
      ).rejects.toThrow('404 Not Found');

      expect(operation).toHaveBeenCalledTimes(1); // Only initial call, no retries
    });
  });

  describe('Data Validation', () => {
    it('should validate correct scene data', () => {
      const validScene = {
        id: 'scene-1',
        chapterId: 'chapter-1',
        text: 'This is a scene',
        hookScore: 0.8,
        tensionScore: 0.6,
        clarityScore: 0.9
      };

      const result = validateScene(validScene);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('scene-1');
        expect(result.data.hookScore).toBe(0.8);
      }
    });

    it('should reject invalid scene data', () => {
      const invalidScene = {
        id: '', // Invalid: empty string
        chapterId: 'chapter-1',
        text: 'This is a scene',
        hookScore: 1.5, // Invalid: > 1
        tensionScore: 0.6,
        clarityScore: 0.9
      };

      const result = validateScene(invalidScene);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors).toBeDefined();
      }
    });

    it('should recover corrupted scene data', () => {
      const corruptedScene = {
        id: null, // Invalid
        chapterId: undefined, // Invalid
        text: '', // Invalid
        hookScore: -0.5, // Invalid: < 0
        tensionScore: 1.2, // Invalid: > 1
        clarityScore: 'invalid' // Invalid: not a number
      };

      // Create a proper mock ZodError
      const mockZodError = new ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'null',
          path: ['id'],
          message: 'Expected string, received null'
        }
      ]);

      const recovered = recoverScene(corruptedScene, mockZodError);
      expect(recovered.id).toMatch(/^scene-\d+$/);
      expect(recovered.chapterId).toBe('unknown');
      expect(recovered.text).toBe('');
      expect(recovered.hookScore).toBe(0.5); // Clamped to valid range
      expect(recovered.tensionScore).toBe(0.5); // Clamped to valid range
      expect(recovered.clarityScore).toBe(0.5); // Default value
    });

    it('should validate and recover data automatically', () => {
      const invalidData = { id: '', text: 'test' };

      // Create a proper Zod schema for testing
      const testSchema = z.object({
        id: z.string().min(1, 'ID is required'),
        text: z.string().min(1, 'Text is required')
      });

      const result = DataValidator.validateAndRecover(
        testSchema,
        invalidData,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        (original, _errors) => ({
          id: 'recovered-id',
          text: (original as { text?: string }).text || 'default'
        }),
        { dataType: 'test' }
      );

      expect(result.id).toBe('recovered-id');
      expect(result.text).toBe('test');
    });
  });

  describe('Error Statistics', () => {
    it('should track error statistics', () => {
      // Report several errors
      globalErrorReporter.report(new Error('Network error'), { category: ErrorCategory.NETWORK });
      globalErrorReporter.report(new Error('Validation error'), { category: ErrorCategory.VALIDATION });
      globalErrorReporter.report(new Error('Another network error'), { category: ErrorCategory.NETWORK });

      const stats = globalErrorReporter.getStats();

      expect(stats.totalErrors).toBe(3);
      expect(stats.errorsByCategory[ErrorCategory.NETWORK]).toBe(2);
      expect(stats.errorsByCategory[ErrorCategory.VALIDATION]).toBe(1);
      expect(stats.recentErrors).toHaveLength(3);
    });

    it('should provide error insights', () => {
      globalErrorReporter.report(new Error('Test error 1'));
      globalErrorReporter.report(new Error('Test error 1')); // Duplicate
      globalErrorReporter.report(new Error('Test error 2'));

      const stats = globalErrorReporter.getStats();

      expect(stats.topErrorMessages).toHaveLength(2);
      const topError = stats.topErrorMessages[0];
      if (topError) {
        expect(topError.message).toBe('Test error 1');
        expect(topError.count).toBe(2);
      }
    });
  });

  describe('Integration Scenarios', () => {
    it('should integrate error reporting with recovery', async () => {
      let errorReported = false;
      const originalReport = globalErrorReporter.report;

      // Mock the report method to track calls
      globalErrorReporter.report = vi.fn().mockImplementation((error, options) => {
        errorReported = true;
        return originalReport.call(globalErrorReporter, error, options);
      });

      // Trigger validation error with a proper schema
      const mockSchema = z.object({
        requiredField: z.string().min(1, 'Required field is missing')
      });

      const result = DataValidator.validate(
        mockSchema,
        { optionalField: 'value' }, // Missing requiredField
        { operation: 'integration-test' }
      );

      expect(result.success).toBe(false);
      expect(errorReported).toBe(true);

      // Restore original method
      globalErrorReporter.report = originalReport;
    });

    it('should handle end-to-end error flow', () => {
      // Report an error
      const error = new Error('Test error');
      const report = globalErrorReporter.report(error, {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM
      });

      // Verify the report was created
      expect(report.id).toBeDefined();
      expect(report.category).toBe(ErrorCategory.NETWORK);
      expect(report.severity).toBe(ErrorSeverity.MEDIUM);

      // Verify error statistics are updated
      const stats = globalErrorReporter.getStats();
      expect(stats.totalErrors).toBeGreaterThan(0);
      expect(stats.errorsByCategory[ErrorCategory.NETWORK]).toBeGreaterThan(0);
    });
  });
});
