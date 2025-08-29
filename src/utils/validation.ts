import { z } from 'zod';
import { globalErrorReporter, ErrorCategory, ErrorSeverity } from './error-reporter';

// Base validation schemas
export const SceneSchema = z.object({
  id: z.string().min(1, 'Scene ID is required'),
  chapterId: z.string().min(1, 'Chapter ID is required'),
  text: z.string().min(1, 'Scene text is required'),
  hookScore: z.number().min(0).max(1),
  tensionScore: z.number().min(0).max(1),
  clarityScore: z.number().min(0).max(1)
});

export const OpeningCandidateSchema = z.object({
  id: z.string().min(1, 'Candidate ID is required'),
  sceneIds: z.array(z.string().min(1)).min(1, 'At least one scene ID is required'),
  type: z.string().min(1, 'Candidate type is required')
});

export const OpeningAnalysisSchema = z.object({
  id: z.string().min(1, 'Analysis ID is required'),
  candidateId: z.string().min(1, 'Candidate ID is required'),
  confidence: z.number().min(0).max(1),
  spoilerCount: z.number().int().min(0),
  editBurdenPercent: z.number().min(0).max(1),
  rationale: z.string().min(1, 'Analysis rationale is required')
});

export const SpoilerViolationSchema = z.object({
  id: z.string().min(1, 'Violation ID is required'),
  revealId: z.string().min(1, 'Reveal ID is required'),
  location: z.string().min(1, 'Violation location is required'),
  severity: z.string().min(1, 'Violation severity is required'),
  suggestedFix: z.string().min(1, 'Suggested fix is required')
});

export const DecisionVerdictSchema = z.enum(['Accept', 'Revise', 'Reject']);

export const DecisionSchema = z.object({
  verdict: DecisionVerdictSchema,
  whyItWorks: z.array(z.string().min(1)).min(1, 'At least one reason is required'),
  riskNotes: z.string().optional()
});

// Manuscript-related schemas
export const ManuscriptSchema = z.object({
  rawText: z.string().min(1, 'Manuscript text is required'),
  title: z.string().optional(),
  author: z.string().optional(),
  wordCount: z.number().int().min(0).optional(),
  chapterCount: z.number().int().min(0).optional()
});

// Store state validation schemas
export const ManuscriptStoreStateSchema = z.object({
  manuscript: ManuscriptSchema.optional(),
  fullText: z.string(),
  scenes: z.array(SceneSchema),
  reveals: z.array(z.any()), // RevealGraphEntry type not fully defined
  selectedSceneId: z.string().optional(),
  loadingState: z.enum(['idle', 'loading', 'loaded', 'error']),
  loadingError: z.string().nullable(),
  parseProgress: z.number().min(0).max(100),
  operationStage: z.enum(['parsing', 'segmenting', 'analyzing', 'indexing']).nullable(),
  progressStartTime: z.number().nullable(),
  progressMessage: z.string().nullable()
});

export const AnalysisStoreStateSchema = z.object({
  candidates: z.record(z.string(), OpeningCandidateSchema),
  analyses: z.record(z.string(), OpeningAnalysisSchema),
  selectedCandidateId: z.string().optional(),
  comparisonIds: z.array(z.string())
});

// Validation result type
export type ValidationResult<T> = {
  success: true;
  data: T;
} | {
  success: false;
  errors: z.ZodError;
  data?: T;
};

// Validation utilities
export class DataValidator {
  /**
   * Validate data against a schema with error reporting
   */
  static validate<T>(
    schema: z.ZodSchema<T>,
    data: unknown,
    context?: {
      operation?: string;
      dataType?: string;
      userId?: string;
    }
  ): ValidationResult<T> {
    try {
      const result = schema.safeParse(data);

      if (result.success) {
        return {
          success: true,
          data: result.data
        };
      } else {
        // Report validation error
        globalErrorReporter.report(
          new Error(`Data validation failed: ${result.error.message}`),
          {
            category: ErrorCategory.VALIDATION,
            severity: ErrorSeverity.MEDIUM,
            context: {
              operation: context?.operation || 'data-validation',
              dataType: context?.dataType || 'unknown',
              validationErrors: result.error.errors.map(e => ({
                path: e.path.join('.'),
                message: e.message,
                code: e.code
              })),
              ...context
            },
            recoveryActions: [{
              label: 'Use Default Values',
              action: () => {
                console.log('Attempting to use default values for invalid data');
              }
            }, {
              label: 'Report Validation Issue',
              action: () => {
                console.log('Reporting validation issue to developers');
              }
            }]
          }
        );

        return {
          success: false,
          errors: result.error,
          data: data as T // Return original data for recovery attempts
        };
      }
    } catch (error) {
      // Report unexpected validation error
      globalErrorReporter.report(error as Error, {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.HIGH,
        context: {
          operation: context?.operation || 'data-validation',
          dataType: context?.dataType || 'unknown',
          phase: 'validation-execution',
          ...context
        }
      });

      return {
        success: false,
        errors: new z.ZodError([]),
        data: data as T
      };
    }
  }

  /**
   * Validate and sanitize data with automatic recovery
   */
  static validateAndRecover<T>(
    schema: z.ZodSchema<T>,
    data: unknown,
    recoveryFn?: (originalData: unknown, errors: z.ZodError) => T,
    context?: {
      operation?: string;
      dataType?: string;
      userId?: string;
      itemIndex?: number;
    }
  ): T {
    const result = this.validate(schema, data, context);

    if (result.success) {
      return result.data;
    }

    // Attempt recovery
    if (recoveryFn) {
      try {
        const recoveredData = recoveryFn(data, result.errors);
        console.log('Data recovery successful', { operation: context?.operation });

        // Validate recovered data
        const recoveryResult = this.validate(schema, recoveredData, {
          ...context,
          operation: `${context?.operation || 'unknown'}-recovery`
        });

        if (recoveryResult.success) {
          return recoveryResult.data;
        }
      } catch (recoveryError) {
        globalErrorReporter.report(recoveryError as Error, {
          category: ErrorCategory.DATA_CORRUPTION,
          severity: ErrorSeverity.HIGH,
          context: {
            operation: context?.operation || 'data-recovery',
            phase: 'recovery-execution',
            ...context
          }
        });
      }
    }

    // Return original data if recovery fails
    console.warn('Data validation and recovery failed, using original data', {
      operation: context?.operation,
      errors: result.errors?.message
    });

    return data as T;
  }

  /**
   * Create a partial schema for updates
   */
  static createPartialSchema<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
    return schema.partial();
  }

  /**
   * Validate array of items
   */
  static validateArray<T>(
    schema: z.ZodSchema<T>,
    items: unknown[],
    context?: {
      operation?: string;
      dataType?: string;
      userId?: string;
    }
  ): { valid: T[]; invalid: { index: number; error: z.ZodError }[] } {
    const valid: T[] = [];
    const invalid: { index: number; error: z.ZodError }[] = [];

    items.forEach((item, index) => {
      const result = this.validate(schema, item, context);

      if (result.success) {
        valid.push(result.data);
      } else {
        invalid.push({ index, error: result.errors });
      }
    });

    return { valid, invalid };
  }
}

// Convenience validation functions
export function validateScene(data: unknown): ValidationResult<z.infer<typeof SceneSchema>> {
  return DataValidator.validate(SceneSchema, data, { dataType: 'scene' });
}

export function validateOpeningCandidate(data: unknown): ValidationResult<z.infer<typeof OpeningCandidateSchema>> {
  return DataValidator.validate(OpeningCandidateSchema, data, { dataType: 'opening-candidate' });
}

export function validateOpeningAnalysis(data: unknown): ValidationResult<z.infer<typeof OpeningAnalysisSchema>> {
  return DataValidator.validate(OpeningAnalysisSchema, data, { dataType: 'opening-analysis' });
}

export function validateManuscript(data: unknown): ValidationResult<z.infer<typeof ManuscriptSchema>> {
  return DataValidator.validate(ManuscriptSchema, data, { dataType: 'manuscript' });
}

// Recovery functions for common data types
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function recoverScene(originalData: unknown, _errors: z.ZodError): z.infer<typeof SceneSchema> {
  const data = originalData as Record<string, unknown>;

  const inRangeOrDefault = (value: unknown): number => {
    if (typeof value === 'number' && value >= 0 && value <= 1) return value;
    return 0.5;
  };

  return {
    id: (data.id as string) || `scene-${Date.now()}`,
    chapterId: (data.chapterId as string) || 'unknown',
    text: (data.text as string) || '',
    hookScore: inRangeOrDefault(data.hookScore),
    tensionScore: inRangeOrDefault(data.tensionScore),
    clarityScore: inRangeOrDefault(data.clarityScore)
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function recoverOpeningCandidate(originalData: unknown, _errors: z.ZodError): z.infer<typeof OpeningCandidateSchema> {
  const data = originalData as Record<string, unknown>;

  return {
    id: (data.id as string) || `candidate-${Date.now()}`,
    sceneIds: Array.isArray(data.sceneIds) ? (data.sceneIds as string[]).filter((id: string) => typeof id === 'string' && id.length > 0) : [],
    type: (data.type as string) || 'unknown'
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function recoverOpeningAnalysis(originalData: unknown, _errors: z.ZodError): z.infer<typeof OpeningAnalysisSchema> {
  const data = originalData as Record<string, unknown>;

  return {
    id: (data.id as string) || `analysis-${Date.now()}`,
    candidateId: (data.candidateId as string) || 'unknown',
    confidence: typeof data.confidence === 'number' ? Math.max(0, Math.min(1, data.confidence)) : 0.5,
    spoilerCount: typeof data.spoilerCount === 'number' ? Math.max(0, Math.floor(data.spoilerCount)) : 0,
    editBurdenPercent: typeof data.editBurdenPercent === 'number' ? Math.max(0, Math.min(1, data.editBurdenPercent)) : 0.3,
    rationale: (data.rationale as string) || 'Analysis data was corrupted and has been recovered with default values.'
  };
}

// Export all schemas for external use
export {
  SceneSchema as Scene,
  OpeningCandidateSchema as OpeningCandidate,
  OpeningAnalysisSchema as OpeningAnalysis,
  SpoilerViolationSchema as SpoilerViolation,
  DecisionSchema as Decision,
  ManuscriptSchema as Manuscript,
  ManuscriptStoreStateSchema as ManuscriptStoreState,
  AnalysisStoreStateSchema as AnalysisStoreState
};
