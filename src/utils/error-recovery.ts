import { useState, useCallback, useEffect } from 'react';

export interface RetryableOperation<T = any> {
  id: string;
  operation: () => Promise<T>;
  attempts: number;
  maxRetries: number;
  backoffStrategy: 'exponential' | 'linear' | 'fixed';
  lastError?: Error;
  nextRetryAt?: Date;
  context?: Record<string, any>;
}

export interface RecoverableErrorOptions {
  attempts: number;
  canRetry: boolean;
  suggestions: string[];
  context?: Record<string, any>;
  recoveryActions?: Array<{
    label: string;
    action: () => Promise<void> | void;
  }>;
}

export class RecoverableError extends Error {
  constructor(
    originalError: Error,
    public readonly options: RecoverableErrorOptions
  ) {
    super(originalError.message);
    this.name = 'RecoverableError';
    this.stack = originalError.stack;
  }
}

export class ErrorRecovery {
  private retryQueue: Map<string, RetryableOperation> = new Map();
  private eventEmitter = new EventTarget();
  private isProcessingQueue = false;

  constructor(
    private options: {
      defaultMaxRetries?: number;
      defaultBackoffStrategy?: 'exponential' | 'linear' | 'fixed';
      queueProcessingInterval?: number;
    } = {}
  ) {
    const {
      queueProcessingInterval = 1000
    } = options;

    // Start queue processing
    setInterval(() => this.processQueue(), queueProcessingInterval);
  }

  /**
   * Execute an operation with automatic retry logic
   */
  async withRetry<T>(
    operationId: string,
    operation: () => Promise<T>,
    options: {
      maxRetries?: number;
      backoffStrategy?: 'exponential' | 'linear' | 'fixed';
      initialDelay?: number;
      onError?: (error: Error, attempt: number) => void;
      onRetry?: (attempt: number, nextDelay: number) => void;
      shouldRetry?: (error: Error) => boolean;
      context?: Record<string, any>;
    } = {}
  ): Promise<T> {
    const {
      maxRetries = this.options.defaultMaxRetries ?? 3,
      backoffStrategy = this.options.defaultBackoffStrategy ?? 'exponential',
      initialDelay = 1000,
      onError,
      onRetry,
      shouldRetry = this.defaultShouldRetry,
      context = {}
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        
        // Remove from retry queue if successful
        this.retryQueue.delete(operationId);
        
        // Emit success event
        this.emit('operation-success', {
          operationId,
          attempt,
          result,
          context
        });

        return result;
      } catch (error) {
        lastError = error as Error;
        onError?.(lastError, attempt);

        // Check if we should retry this error
        if (!shouldRetry(lastError)) {
          throw new RecoverableError(lastError, {
            attempts: attempt,
            canRetry: false,
            suggestions: this.getSuggestions(lastError),
            context
          });
        }

        if (attempt < maxRetries) {
          const delay = this.calculateDelay(attempt, backoffStrategy, initialDelay);
          
          onRetry?.(attempt, delay);
          
          // Add to retry queue for later processing
          this.retryQueue.set(operationId, {
            id: operationId,
            operation,
            attempts: attempt,
            maxRetries,
            backoffStrategy,
            lastError,
            nextRetryAt: new Date(Date.now() + delay),
            context
          });

          // Emit retry event
          this.emit('operation-retry', {
            operationId,
            attempt,
            delay,
            error: lastError,
            context
          });

          await this.delay(delay);
        }
      }
    }

    // All retries exhausted
    this.retryQueue.delete(operationId);
    
    throw new RecoverableError(lastError!, {
      attempts: maxRetries,
      canRetry: true,
      suggestions: this.getSuggestions(lastError!),
      context,
      recoveryActions: this.getRecoveryActions(lastError!, context)
    });
  }

  /**
   * Add an operation to the retry queue for background processing
   */
  async queueOperation<T>(
    operationId: string,
    operation: () => Promise<T>,
    options: {
      maxRetries?: number;
      backoffStrategy?: 'exponential' | 'linear' | 'fixed';
      context?: Record<string, any>;
    } = {}
  ): Promise<void> {
    const {
      maxRetries = this.options.defaultMaxRetries ?? 3,
      backoffStrategy = this.options.defaultBackoffStrategy ?? 'exponential',
      context = {}
    } = options;

    this.retryQueue.set(operationId, {
      id: operationId,
      operation,
      attempts: 0,
      maxRetries,
      backoffStrategy,
      nextRetryAt: new Date(),
      context
    });

    this.emit('operation-queued', { operationId, context });
  }

  /**
   * Process queued operations in background
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.retryQueue.size === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      const now = new Date();
      const readyOperations = Array.from(this.retryQueue.values())
        .filter(op => !op.nextRetryAt || op.nextRetryAt <= now)
        .slice(0, 3); // Process max 3 at a time

      await Promise.allSettled(
        readyOperations.map(async (op) => {
          try {
            const result = await op.operation();
            
            this.retryQueue.delete(op.id);
            this.emit('operation-success', {
              operationId: op.id,
              attempt: op.attempts + 1,
              result,
              context: op.context
            });
          } catch (error) {
            op.attempts++;
            op.lastError = error as Error;

            if (op.attempts >= op.maxRetries) {
              this.retryQueue.delete(op.id);
              this.emit('operation-failed', {
                operationId: op.id,
                error: error as Error,
                attempts: op.attempts,
                context: op.context
              });
            } else {
              const delay = this.calculateDelay(op.attempts, op.backoffStrategy, 1000);
              op.nextRetryAt = new Date(Date.now() + delay);
              
              this.emit('operation-retry', {
                operationId: op.id,
                attempt: op.attempts,
                delay,
                error: error as Error,
                context: op.context
              });
            }
          }
        })
      );
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Get suggestions for handling specific errors
   */
  getSuggestions(error: Error): string[] {
    const message = error.message.toLowerCase();
    const suggestions: string[] = [];

    if (message.includes('network') || message.includes('fetch')) {
      suggestions.push(
        'Check your internet connection',
        'Try again in a few moments',
        'Check if the server is accessible'
      );
    } else if (message.includes('memory') || message.includes('out of memory')) {
      suggestions.push(
        'Close other applications to free up memory',
        'Try processing a smaller section of the manuscript',
        'Restart the application'
      );
    } else if (message.includes('file') || message.includes('upload')) {
      suggestions.push(
        'Check if the file exists and is readable',
        'Try a different file format',
        'Ensure the file is not corrupted'
      );
    } else if (message.includes('timeout') || message.includes('slow')) {
      suggestions.push(
        'Wait a moment and try again',
        'Check your internet connection speed',
        'Try processing during off-peak hours'
      );
    } else if (message.includes('storage') || message.includes('quota')) {
      suggestions.push(
        'Clear browser cache and storage',
        'Free up disk space',
        'Try using a different browser'
      );
    } else if (message.includes('permission') || message.includes('unauthorized')) {
      suggestions.push(
        'Check your login status',
        'Verify you have the necessary permissions',
        'Try refreshing the page'
      );
    } else {
      suggestions.push(
        'Try refreshing the page',
        'Check the browser console for more details',
        'Contact support if the issue persists'
      );
    }

    return suggestions;
  }

  /**
   * Get contextual recovery actions
   */
  private getRecoveryActions(error: Error, context: Record<string, any>) {
    const actions: Array<{ label: string; action: () => Promise<void> | void }> = [];
    const message = error.message.toLowerCase();

    if (message.includes('network')) {
      actions.push({
        label: 'Retry with offline mode',
        action: async () => {
          // Switch to offline mode if available
          this.emit('request-offline-mode', {});
        }
      });
    }

    if (message.includes('file')) {
      actions.push({
        label: 'Choose different file',
        action: async () => {
          this.emit('request-file-selection', {});
        }
      });
    }

    if (context.canUseCache) {
      actions.push({
        label: 'Use cached data',
        action: async () => {
          this.emit('request-cache-usage', { context });
        }
      });
    }

    actions.push({
      label: 'Report issue',
      action: async () => {
        this.emit('request-error-report', { error, context });
      }
    });

    return actions;
  }

  /**
   * Default retry condition
   */
  private defaultShouldRetry(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Don't retry permanent errors
    if (
      message.includes('404') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('invalid') ||
      message.includes('malformed')
    ) {
      return false;
    }

    // Retry temporary errors
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('connection') ||
      message.includes('503') ||
      message.includes('502') ||
      message.includes('500')
    );
  }

  /**
   * Calculate retry delay
   */
  private calculateDelay(
    attempt: number,
    strategy: 'exponential' | 'linear' | 'fixed',
    baseDelay: number
  ): number {
    switch (strategy) {
      case 'exponential':
        return Math.min(baseDelay * Math.pow(2, attempt - 1), 30000); // Max 30s
      case 'linear':
        return Math.min(baseDelay * attempt, 30000);
      case 'fixed':
      default:
        return baseDelay;
    }
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Event emitter helpers
   */
  private emit(eventType: string, detail: any): void {
    this.eventEmitter.dispatchEvent(
      new CustomEvent(eventType, { detail })
    );
  }

  addEventListener(eventType: string, listener: EventListener): void {
    this.eventEmitter.addEventListener(eventType, listener);
  }

  removeEventListener(eventType: string, listener: EventListener): void {
    this.eventEmitter.removeEventListener(eventType, listener);
  }

  /**
   * Get current queue status
   */
  getQueueStatus() {
    return {
      queueSize: this.retryQueue.size,
      operations: Array.from(this.retryQueue.values()).map(op => ({
        id: op.id,
        attempts: op.attempts,
        maxRetries: op.maxRetries,
        nextRetryAt: op.nextRetryAt,
        lastError: op.lastError?.message,
        context: op.context
      }))
    };
  }

  /**
   * Clear the retry queue
   */
  clearQueue(operationIds?: string[]): void {
    if (operationIds) {
      operationIds.forEach(id => this.retryQueue.delete(id));
    } else {
      this.retryQueue.clear();
    }
  }

  /**
   * Destroy the error recovery instance
   */
  destroy(): void {
    this.retryQueue.clear();
    this.eventEmitter.dispatchEvent(new CustomEvent('destroy'));
  }
}

// Global error recovery instance
export const globalErrorRecovery = new ErrorRecovery({
  defaultMaxRetries: 3,
  defaultBackoffStrategy: 'exponential',
  queueProcessingInterval: 2000
});

/**
 * React hook for error recovery
 */
export function useErrorRecovery() {
  const [errors, setErrors] = useState<RecoverableError[]>([]);
  const [isRetrying, setIsRetrying] = useState(false);
  const [queueStatus, setQueueStatus] = useState(globalErrorRecovery.getQueueStatus());

  // Update queue status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setQueueStatus(globalErrorRecovery.getQueueStatus());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Listen to error recovery events
  useEffect(() => {
    const handleRetry = () => setIsRetrying(true);
    const handleSuccess = () => {
      setIsRetrying(false);
      setErrors(prev => prev.slice(0, -1));
    };
    const handleFailure = (event: Event) => {
      setIsRetrying(false);
      const customEvent = event as CustomEvent;
      const error = new RecoverableError(customEvent.detail.error, {
        attempts: customEvent.detail.attempts,
        canRetry: true,
        suggestions: globalErrorRecovery.getSuggestions(customEvent.detail.error)
      });
      setErrors(prev => [...prev, error]);
    };

    globalErrorRecovery.addEventListener('operation-retry', handleRetry);
    globalErrorRecovery.addEventListener('operation-success', handleSuccess);
    globalErrorRecovery.addEventListener('operation-failed', handleFailure);

    return () => {
      globalErrorRecovery.removeEventListener('operation-retry', handleRetry);
      globalErrorRecovery.removeEventListener('operation-success', handleSuccess);
      globalErrorRecovery.removeEventListener('operation-failed', handleFailure);
    };
  }, []);

  const retryOperation = useCallback(async (operationId: string, operation: () => Promise<any>) => {
    try {
      return await globalErrorRecovery.withRetry(operationId, operation);
    } catch (error) {
      if (error instanceof RecoverableError) {
        setErrors(prev => [...prev, error]);
      }
      throw error;
    }
  }, []);

  const clearError = useCallback((index: number) => {
    setErrors(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearAllErrors = useCallback(() => {
    setErrors([]);
  }, []);

  return {
    errors,
    isRetrying,
    queueStatus,
    retryOperation,
    clearError,
    clearAllErrors
  };
}