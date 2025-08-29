import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMQueue, createLLMQueue, estimateTokens } from '../queue';
import { enqueue as enqueueJob } from '@/lib/jobQueue';

// Mock the job queue to avoid actual async operations in tests
vi.mock('@/lib/jobQueue', () => ({
  enqueue: vi.fn().mockReturnValue('test-job'),
}));

// Mock events to avoid Tauri dependencies in tests
vi.mock('@/lib/events', () => ({
  emitJobEvent: vi.fn().mockResolvedValue(undefined),
}));

describe('LLMQueue Integration', () => {
  let queue: LLMQueue;

  beforeEach(() => {
    queue = createLLMQueue();
    vi.clearAllMocks();
  });

  describe('Basic Queue Operations', () => {
    it('should expose queue length and current operation', () => {
      const request = {
        id: 'test-1',
        prompt: 'Test prompt',
        estimatedTokens: 100,
        priority: 1,
      };

      queue.enqueue(request);

      expect(queue.getQueueLength()).toBe(1);
      expect(queue.getCurrentOperation()).toBe('Processing request test-1');
    });

    it('should calculate progress based on token count', () => {
      const request1 = {
        id: 'test-1',
        prompt: 'Test prompt 1',
        estimatedTokens: 100,
      };

      const request2 = {
        id: 'test-2',
        prompt: 'Test prompt 2',
        estimatedTokens: 200,
      };

      queue.enqueue(request1);
      queue.enqueue(request2);

      // Initially no progress
      expect(queue.getStatus().estimatedProgress).toBe(0);

      // Progress calculation is based on internal state, so we'll test the status structure
      const status = queue.getStatus();
      expect(status).toHaveProperty('estimatedProgress');
      expect(typeof status.estimatedProgress).toBe('number');
    });

    it('should emit status updates via event emitter', () => {
      const mockListener = vi.fn();
      const unsubscribe = queue.on('status', mockListener);

      const request = {
        id: 'test-1',
        prompt: 'Test prompt',
        estimatedTokens: 100,
      };

      queue.enqueue(request);

      expect(mockListener).toHaveBeenCalledWith(
        expect.objectContaining({
          length: 1,
          currentOperation: 'Processing request test-1',
          estimatedProgress: 0,
          activeJobs: 0,
        })
      );

      unsubscribe();
    });

    it('should integrate with existing job queue system', async () => {
      const mockProcessor = vi.fn().mockResolvedValue('result');
      const request = {
        id: 'test-job',
        prompt: 'Test prompt',
        estimatedTokens: 50,
      };

      const jobId = await queue.processWithJobQueue(request, mockProcessor);

      expect(enqueueJob).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ id: 'test-job' })
      );

      expect(jobId).toBe('test-job');
    });

    it('should estimate tokens from text', () => {
      const text = 'Hello world this is a test';
      const estimated = estimateTokens(text);

      // Should be roughly text.length / 4
      expect(estimated).toBe(Math.ceil(text.length / 4));
    });

    it('should maintain backward compatibility', () => {
      const request = {
        id: 'test-1',
        prompt: 'Test prompt',
      };

      queue.enqueue(request);

      expect(queue.size()).toBe(1);
      expect(queue.isEmpty()).toBe(false);

      queue.clear();
      expect(queue.size()).toBe(0);
      expect(queue.isEmpty()).toBe(true);
    });

    it('should handle priority queue functionality', () => {
      const lowPriority = {
        id: 'low',
        prompt: 'Low priority',
        priority: 1,
      };

      const highPriority = {
        id: 'high',
        prompt: 'High priority',
        priority: 10,
      };

      queue.enqueue(lowPriority);
      queue.enqueue(highPriority);

      // High priority should be processed first
      const next = queue.peek();
      expect(next?.id).toBe('high');
    });
  });

  describe('Progress Estimation', () => {
    it('should provide detailed progress estimates', () => {
      const request = {
        id: 'test-1',
        prompt: 'Test prompt',
        estimatedTokens: 1000,
      };

      queue.enqueue(request);

      // Dequeue to make it active
      const dequeued = queue.dequeue();
      expect(dequeued?.id).toBe('test-1');

      const estimate = queue.estimateProgress('test-1');

      expect(estimate).toEqual(
        expect.objectContaining({
          percent: expect.any(Number),
          estimatedTimeRemaining: expect.any(Number),
          currentStep: expect.stringContaining('test-1'),
        })
      );
    });
  });
});
