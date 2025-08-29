import { z } from 'zod';

// Error categories for better organization and handling
export enum ErrorCategory {
  NETWORK = 'network',
  PARSING = 'parsing',
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  RATE_LIMIT = 'rate_limit',
  TIMEOUT = 'timeout',
  STORAGE = 'storage',
  MEMORY = 'memory',
  FILE_SYSTEM = 'file_system',
  LLM_PROVIDER = 'llm_provider',
  DATA_CORRUPTION = 'data_corruption',
  CONFIGURATION = 'configuration',
  UNKNOWN = 'unknown'
}

// Error severity levels
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// User-friendly error message templates
const ERROR_MESSAGES = {
  [ErrorCategory.NETWORK]: {
    title: 'Connection Error',
    message: 'Unable to connect to the service. Please check your internet connection and try again.',
    suggestions: ['Check your internet connection', 'Try again in a few moments', 'Contact support if the issue persists']
  },
  [ErrorCategory.PARSING]: {
    title: 'Data Processing Error',
    message: 'There was an issue processing the data. The file may be corrupted or in an unsupported format.',
    suggestions: ['Try uploading a different file', 'Check if the file is corrupted', 'Ensure the file format is supported']
  },
  [ErrorCategory.VALIDATION]: {
    title: 'Data Validation Error',
    message: 'The provided data does not meet the required format or constraints.',
    suggestions: ['Review the data requirements', 'Correct any invalid entries', 'Try re-entering the information']
  },
  [ErrorCategory.AUTHENTICATION]: {
    title: 'Authentication Required',
    message: 'You need to sign in to access this feature.',
    suggestions: ['Sign in to your account', 'Check your credentials', 'Reset your password if needed']
  },
  [ErrorCategory.AUTHORIZATION]: {
    title: 'Access Denied',
    message: 'You do not have permission to perform this action.',
    suggestions: ['Contact your administrator', 'Check your account permissions', 'Try signing in with a different account']
  },
  [ErrorCategory.RATE_LIMIT]: {
    title: 'Rate Limit Exceeded',
    message: 'Too many requests have been made. Please wait before trying again.',
    suggestions: ['Wait a few minutes before retrying', 'Reduce the frequency of requests', 'Upgrade your plan for higher limits']
  },
  [ErrorCategory.TIMEOUT]: {
    title: 'Request Timeout',
    message: 'The request took too long to complete. This may be due to network issues or high server load.',
    suggestions: ['Try again in a few moments', 'Check your internet connection', 'Try during off-peak hours']
  },
  [ErrorCategory.STORAGE]: {
    title: 'Storage Error',
    message: 'There was an issue with data storage. Your changes may not have been saved.',
    suggestions: ['Try saving again', 'Check available storage space', 'Clear browser cache and try again']
  },
  [ErrorCategory.MEMORY]: {
    title: 'Memory Error',
    message: 'The application is running low on memory. Some features may be limited.',
    suggestions: ['Close other applications', 'Restart the application', 'Try processing smaller amounts of data']
  },
  [ErrorCategory.FILE_SYSTEM]: {
    title: 'File System Error',
    message: 'There was an issue accessing or modifying files.',
    suggestions: ['Check file permissions', 'Ensure the file is not in use by another application', 'Try a different location']
  },
  [ErrorCategory.LLM_PROVIDER]: {
    title: 'AI Service Error',
    message: 'The AI service is currently unavailable or returned an unexpected response.',
    suggestions: ['Try again in a few moments', 'Switch to offline mode if available', 'Contact support if the issue persists']
  },
  [ErrorCategory.DATA_CORRUPTION]: {
    title: 'Data Corruption',
    message: 'The stored data appears to be corrupted and cannot be loaded.',
    suggestions: ['Try loading a backup', 'Re-upload the original file', 'Contact support for data recovery']
  },
  [ErrorCategory.CONFIGURATION]: {
    title: 'Configuration Error',
    message: 'There is a configuration issue preventing the application from working properly.',
    suggestions: ['Try refreshing the page', 'Clear browser cache', 'Contact support for assistance']
  },
  [ErrorCategory.UNKNOWN]: {
    title: 'Unexpected Error',
    message: 'An unexpected error occurred. Please try again or contact support.',
    suggestions: ['Try refreshing the page', 'Clear browser cache', 'Contact support if the issue persists']
  }
};

// Recovery action types
export interface RecoveryAction {
  label: string;
  action: () => Promise<void> | void;
  primary?: boolean;
}

// Enhanced error information
export interface ErrorReport {
  id: string;
  timestamp: Date;
  category: ErrorCategory;
  severity: ErrorSeverity;
  originalError: Error;
  context?: Record<string, unknown>;
  userMessage: {
    title: string;
    message: string;
    suggestions: string[];
  };
  recoveryActions?: RecoveryAction[];
  stackTrace?: string;
  userAgent?: string;
  url?: string;
  sessionId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

// Error reporting configuration
export interface ErrorReporterConfig {
  enableConsoleLogging?: boolean;
  enableRemoteReporting?: boolean;
  remoteEndpoint?: string;
  maxStoredReports?: number;
  enableUserFeedback?: boolean;
  environment?: 'development' | 'staging' | 'production';
}

// Error statistics for monitoring
export interface ErrorStats {
  totalErrors: number;
  errorsByCategory: Record<ErrorCategory, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  recentErrors: ErrorReport[];
  topErrorMessages: Array<{ message: string; count: number }>;
}

// Zod schema for error report validation
const ErrorReportSchema = z.object({
  id: z.string(),
  timestamp: z.date(),
  category: z.nativeEnum(ErrorCategory),
  severity: z.nativeEnum(ErrorSeverity),
  originalError: z.instanceof(Error),
  context: z.record(z.unknown()).optional(),
  userMessage: z.object({
    title: z.string(),
    message: z.string(),
    suggestions: z.array(z.string())
  }),
  recoveryActions: z.array(z.object({
    label: z.string(),
    action: z.function(),
    primary: z.boolean().optional()
  })).optional(),
  stackTrace: z.string().optional(),
  userAgent: z.string().optional(),
  url: z.string().optional(),
  sessionId: z.string().optional(),
  userId: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

/**
 * Centralized error reporting and management system
 */
export class ErrorReporter {
  private reports: ErrorReport[] = [];
  private config: ErrorReporterConfig;
  private eventTarget = new EventTarget();
  private sessionId: string;

  constructor(config: ErrorReporterConfig = {}) {
    this.config = {
      enableConsoleLogging: true,
      enableRemoteReporting: false,
      maxStoredReports: 100,
      enableUserFeedback: true,
      environment: 'development',
      ...config
    };

    this.sessionId = this.generateSessionId();

    // Clean up old reports periodically
    setInterval(() => this.cleanupOldReports(), 60000); // Every minute
  }

  /**
   * Report a new error with automatic categorization and user-friendly messaging
   */
  report(
    error: Error,
    options: {
      category?: ErrorCategory;
      severity?: ErrorSeverity;
      context?: Record<string, unknown>;
      recoveryActions?: RecoveryAction[];
      metadata?: Record<string, unknown>;
    } = {}
  ): ErrorReport {
    const category = options.category || this.categorizeError(error);
    const severity = options.severity || this.determineSeverity(error, category);
    const userMessage = ERROR_MESSAGES[category];

    const report: ErrorReport = {
      id: this.generateErrorId(),
      timestamp: new Date(),
      category,
      severity,
      originalError: error,
      context: options.context,
      userMessage,
      recoveryActions: options.recoveryActions,
      stackTrace: error.stack,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      sessionId: this.sessionId,
      metadata: options.metadata
    };

    // Validate the report
    try {
      ErrorReportSchema.parse(report);
    } catch (validationError) {
      console.error('Error report validation failed:', validationError);
      // Continue with the report even if validation fails
    }

    // Store the report
    this.reports.push(report);

    // Keep only the most recent reports
    if (this.reports.length > this.config.maxStoredReports!) {
      this.reports = this.reports.slice(-this.config.maxStoredReports!);
    }

    // Log to console if enabled
    if (this.config.enableConsoleLogging) {
      this.logToConsole(report);
    }

    // Send to remote endpoint if enabled
    if (this.config.enableRemoteReporting && this.config.remoteEndpoint) {
      this.sendToRemote(report);
    }

    // Emit event for UI components to react
    this.emit('error-reported', report);

    return report;
  }

  /**
   * Categorize an error based on its message and type
   */
  private categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Network errors
    if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      return ErrorCategory.NETWORK;
    }

    // Timeout errors
    if (message.includes('timeout') || name.includes('timeout')) {
      return ErrorCategory.TIMEOUT;
    }

    // Authentication/Authorization
    if (message.includes('unauthorized') || message.includes('forbidden') || message.includes('401') || message.includes('403')) {
      return ErrorCategory.AUTHENTICATION;
    }

    // Rate limiting
    if (message.includes('rate limit') || message.includes('429') || message.includes('too many requests')) {
      return ErrorCategory.RATE_LIMIT;
    }

    // File system errors
    if (message.includes('file') || message.includes('permission') || message.includes('access')) {
      return ErrorCategory.FILE_SYSTEM;
    }

    // Memory errors
    if (message.includes('memory') || message.includes('out of memory') || message.includes('heap')) {
      return ErrorCategory.MEMORY;
    }

    // Storage errors
    if (message.includes('storage') || message.includes('quota') || message.includes('database')) {
      return ErrorCategory.STORAGE;
    }

    // LLM provider errors
    if (message.includes('llm') || message.includes('ai') || message.includes('openai') || message.includes('anthropic') || message.includes('claude')) {
      return ErrorCategory.LLM_PROVIDER;
    }

    // Data corruption
    if (message.includes('corrupt') || message.includes('invalid') || message.includes('malformed')) {
      return ErrorCategory.DATA_CORRUPTION;
    }

    // Parsing errors
    if (message.includes('parse') || message.includes('json') || message.includes('syntax')) {
      return ErrorCategory.PARSING;
    }

    // Validation errors
    if (message.includes('validation') || message.includes('schema') || message.includes('zod')) {
      return ErrorCategory.VALIDATION;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Determine error severity based on error type and context
   */
  private determineSeverity(error: Error, category: ErrorCategory): ErrorSeverity {
    const message = error.message.toLowerCase();

    // Critical errors
    if (
      category === ErrorCategory.DATA_CORRUPTION ||
      message.includes('critical') ||
      message.includes('fatal')
    ) {
      return ErrorSeverity.CRITICAL;
    }

    // High severity
    if (
      category === ErrorCategory.AUTHENTICATION ||
      category === ErrorCategory.AUTHORIZATION ||
      category === ErrorCategory.MEMORY ||
      message.includes('high')
    ) {
      return ErrorSeverity.HIGH;
    }

    // Medium severity
    if (
      category === ErrorCategory.NETWORK ||
      category === ErrorCategory.TIMEOUT ||
      category === ErrorCategory.RATE_LIMIT ||
      message.includes('medium')
    ) {
      return ErrorSeverity.MEDIUM;
    }

    // Low severity (default)
    return ErrorSeverity.LOW;
  }

  /**
   * Generate a unique error ID
   */
  private generateErrorId(): string {
    return `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log error to console with appropriate formatting
   */
  private logToConsole(report: ErrorReport): void {
    const logMethod = report.severity === ErrorSeverity.CRITICAL ? 'error' :
                     report.severity === ErrorSeverity.HIGH ? 'error' :
                     report.severity === ErrorSeverity.MEDIUM ? 'warn' : 'info';

    console.group(`🚨 ${report.userMessage.title} (${report.category})`);
    console[logMethod]('Error:', report.originalError);
    console.info('User Message:', report.userMessage.message);
    console.info('Suggestions:', report.userMessage.suggestions);
    if (report.context) {
      console.info('Context:', report.context);
    }
    if (report.recoveryActions?.length) {
      console.info('Recovery Actions:', report.recoveryActions.map(a => a.label));
    }
    console.groupEnd();
  }

  /**
   * Send error report to remote endpoint
   */
  private async sendToRemote(report: ErrorReport): Promise<void> {
    try {
      await fetch(this.config.remoteEndpoint!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...report,
          originalError: {
            name: report.originalError.name,
            message: report.originalError.message,
            stack: report.originalError.stack
          }
        })
      });
    } catch (error) {
      console.error('Failed to send error report to remote endpoint:', error);
    }
  }

  /**
   * Clean up old error reports to prevent memory leaks
   */
  private cleanupOldReports(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    this.reports = this.reports.filter(report => report.timestamp > oneHourAgo);
  }

  /**
   * Event emitter helpers
   */
  private emit(eventType: string, detail: unknown): void {
    this.eventTarget.dispatchEvent(
      new CustomEvent(eventType, { detail })
    );
  }

  addEventListener(eventType: string, listener: EventListener): void {
    this.eventTarget.addEventListener(eventType, listener);
  }

  removeEventListener(eventType: string, listener: EventListener): void {
    this.eventTarget.removeEventListener(eventType, listener);
  }

  /**
   * Get error statistics
   */
  getStats(): ErrorStats {
    const errorsByCategory = Object.values(ErrorCategory).reduce((acc, category) => {
      acc[category] = this.reports.filter(r => r.category === category).length;
      return acc;
    }, {} as Record<ErrorCategory, number>);

    const errorsBySeverity = Object.values(ErrorSeverity).reduce((acc, severity) => {
      acc[severity] = this.reports.filter(r => r.severity === severity).length;
      return acc;
    }, {} as Record<ErrorSeverity, number>);

    const messageCounts = new Map<string, number>();
    this.reports.forEach(report => {
      const message = report.originalError.message;
      messageCounts.set(message, (messageCounts.get(message) || 0) + 1);
    });

    const topErrorMessages = Array.from(messageCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([message, count]) => ({ message, count }));

    return {
      totalErrors: this.reports.length,
      errorsByCategory,
      errorsBySeverity,
      recentErrors: this.reports.slice(-10),
      topErrorMessages
    };
  }

  /**
   * Get all stored error reports
   */
  getReports(filters?: {
    category?: ErrorCategory;
    severity?: ErrorSeverity;
    since?: Date;
  }): ErrorReport[] {
    let filtered = this.reports;

    if (filters?.category) {
      filtered = filtered.filter(r => r.category === filters.category);
    }

    if (filters?.severity) {
      filtered = filtered.filter(r => r.severity === filters.severity);
    }

    if (filters?.since) {
      filtered = filtered.filter(r => r.timestamp >= filters.since!);
    }

    return filtered;
  }

  /**
   * Clear all stored error reports
   */
  clearReports(): void {
    this.reports = [];
  }

  /**
   * Export error reports for debugging
   */
  exportReports(): string {
    return JSON.stringify(this.reports, null, 2);
  }
}

// Global error reporter instance
export const globalErrorReporter = new ErrorReporter({
  enableConsoleLogging: process.env.NODE_ENV === 'development',
  enableRemoteReporting: process.env.NODE_ENV === 'production',
  environment: (process.env.NODE_ENV as 'development' | 'staging' | 'production') || 'development'
});

// Convenience function for quick error reporting
export function reportError(
  error: Error,
  options?: Parameters<ErrorReporter['report']>[1]
): ErrorReport {
  return globalErrorReporter.report(error, options);
}

// Hook for React components to access error reporter
export function useErrorReporter() {
  return {
    reportError,
    getStats: () => globalErrorReporter.getStats(),
    getReports: (filters?: Parameters<ErrorReporter['getReports']>[0]) =>
      globalErrorReporter.getReports(filters),
    clearReports: () => globalErrorReporter.clearReports(),
    exportReports: () => globalErrorReporter.exportReports()
  };
}
