import { PriorityQueue, QueuedItem } from './request-queue';
import { emitJobEvent } from '@/lib/events';
import { enqueue as enqueueJob, JobOptions } from '@/lib/jobQueue';

export interface LLMRequest extends QueuedItem {
  prompt: string;
  estimatedTokens?: number;
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface QueueStatus {
  length: number;
  currentOperation?: string;
  estimatedProgress?: number;
  activeJobs: number;
}

export interface ProgressEstimate {
  percent: number;
  estimatedTimeRemaining?: number;
  currentStep?: string;
}

export class LLMQueue {
  private priorityQueue: PriorityQueue<LLMRequest>;
  private activeJobs = new Map<string, LLMRequest>();
  private completedJobs = new Set<string>();
  private totalEstimatedTokens = 0;
  private processedTokens = 0;
  private eventListeners = new Map<string, Set<(data: unknown) => void>>();

  constructor(compareFn?: (a: LLMRequest, b: LLMRequest) => number) {
    // Default priority comparison (higher priority number = higher priority)
    const defaultCompare = compareFn || ((a, b) => (b.priority || 0) - (a.priority || 0));
    this.priorityQueue = new PriorityQueue(defaultCompare);
  }

  // Queue management
  enqueue(request: LLMRequest): string {
    this.priorityQueue.push(request);

    // Update token estimates
    if (request.estimatedTokens) {
      this.totalEstimatedTokens += request.estimatedTokens;
    }

    // Emit queue status update
    this.emitStatusUpdate();

    return request.id;
  }

  dequeue(): LLMRequest | undefined {
    const request = this.priorityQueue.pop();
    if (request) {
      this.activeJobs.set(request.id, request);
      this.emitStatusUpdate();
    }
    return request;
  }

  peek(): LLMRequest | undefined {
    return this.priorityQueue.peek();
  }

  // Status and progress tracking
  getStatus(): QueueStatus {
    const current = this.peek();
    return {
      length: this.priorityQueue.size(),
      currentOperation: current ? `Processing request ${current.id}` : undefined,
      estimatedProgress: this.calculateProgress(),
      activeJobs: this.activeJobs.size,
    };
  }

  getQueueLength(): number {
    return this.priorityQueue.size();
  }

  getCurrentOperation(): string | undefined {
    const current = this.peek();
    return current ? `Processing request ${current.id}` : undefined;
  }

  // Progress estimation based on token count
  private calculateProgress(): number {
    if (this.totalEstimatedTokens === 0) return 0;

    const completedTokens = Array.from(this.completedJobs)
      .reduce((sum, jobId) => {
        const job = this.activeJobs.get(jobId);
        return sum + (job?.estimatedTokens || 0);
      }, 0);

    return Math.min(100, Math.round((completedTokens / this.totalEstimatedTokens) * 100));
  }

  // Event emission system
  private emitStatusUpdate(): void {
    const status = this.getStatus();
    this.emit('status', status);
  }

  private emit(event: string, data: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => listener(data));
    }
  }

  on(event: string, listener: (data: unknown) => void): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);

    // Return unsubscribe function
    return () => {
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.eventListeners.delete(event);
        }
      }
    };
  }

  // Integration with existing job queue system
  async processWithJobQueue(
    request: LLMRequest,
    processor: (request: LLMRequest) => Promise<unknown>,
    jobOptions: JobOptions = {}
  ): Promise<string> {
    const jobId = this.enqueue(request);

    // Create job function that integrates with our progress tracking
    const jobFn = async () => {
      try {
        // Emit progress start
        await emitJobEvent(jobId, 'progress', {
          id: jobId,
          percent: 0,
          step: 'Starting LLM request'
        });

        // Process the request
        const result = await processor(request);

        // Mark as completed and update progress
        this.completedJobs.add(jobId);
        this.activeJobs.delete(jobId);

        if (request.estimatedTokens) {
          this.processedTokens += request.estimatedTokens;
        }

        // Emit completion progress
        await emitJobEvent(jobId, 'progress', {
          id: jobId,
          percent: 100,
          step: 'LLM request completed'
        });

        // Emit status update
        this.emitStatusUpdate();

        return result;
      } catch (error) {
        // Clean up on error
        this.activeJobs.delete(jobId);
        this.emitStatusUpdate();
        throw error;
      }
    };

    // Enqueue with the existing job queue system
    return enqueueJob(jobFn, {
      id: jobId,
      ...jobOptions,
    });
  }

  // Utility methods for progress estimation
  estimateProgress(requestId: string): ProgressEstimate | undefined {
    const request = this.activeJobs.get(requestId) || this.peek();
    if (!request || !request.estimatedTokens) return undefined;

    const processedPercent = this.calculateProgress();
    const estimatedTimeRemaining = request.estimatedTokens * 0.1; // Rough estimate: 100ms per token

    return {
      percent: processedPercent,
      estimatedTimeRemaining,
      currentStep: `Processing ${request.id}`,
    };
  }

  // Backward compatibility methods
  size(): number {
    return this.priorityQueue.size();
  }

  clear(): void {
    this.priorityQueue.clear();
    this.activeJobs.clear();
    this.completedJobs.clear();
    this.totalEstimatedTokens = 0;
    this.processedTokens = 0;
    this.emitStatusUpdate();
  }

  isEmpty(): boolean {
    return this.priorityQueue.size() === 0;
  }
}

// Export enhanced version that maintains backward compatibility
export { PriorityQueue } from './request-queue';

// Factory function for creating LLM queue with common configurations
export function createLLMQueue(options: {
  priorityFn?: (a: LLMRequest, b: LLMRequest) => number;
} = {}): LLMQueue {
  return new LLMQueue(options.priorityFn);
}

// Utility function to estimate tokens from text (rough approximation)
export function estimateTokens(text: string): number {
  // Rough approximation: ~4 characters per token for English text
  return Math.ceil(text.length / 4);
}
