import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useManuscriptStore } from '../manuscript.store';
import type { ManuscriptStoreState } from '../manuscript.store';

// Mock Tauri API
const mockInvoke = vi.fn();
const mockDialogOpen = vi.fn();

vi.mock('@tauri-apps/api', () => ({
  invoke: mockInvoke,
  dialog: {
    open: mockDialogOpen,
  },
}));

// Mock fs module for Node.js fallback
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

// Mock search API
vi.mock('@/features/search/searchApi', () => ({
  searchAPI: {
    buildIndex: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('ManuscriptStore', () => {
  let store: ManuscriptStoreState;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    store = useManuscriptStore.getState();
    store.clearAll?.();
    store.setLoadingState?.('idle');
    store.setLoadingError?.(null);
  });

  afterEach(() => {
    store.clearAll?.();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      expect(store.manuscript).toBeUndefined();
      expect(store.fullText).toBe('');
      expect(store.scenes).toEqual([]);
      expect(store.reveals).toEqual([]);
      expect(store.selectedSceneId).toBeUndefined();
      expect(store.loadingState).toBe('idle');
      expect(store.loadingError).toBeNull();
    });
  });

  describe('Loading State Transitions', () => {
    it('should transition from idle to loading when loadManuscript is called', async () => {
      mockInvoke.mockResolvedValue('Sample manuscript text');

      const loadPromise = store.loadManuscript('/path/to/manuscript.txt');

      expect(store.loadingState).toBe('loading');
      expect(store.loadingError).toBeNull();

      await loadPromise;
    });

    it('should transition to loaded state on successful manuscript load', async () => {
      const sampleText = 'CHAPTER 1\n\nThis is a test manuscript.';
      mockInvoke.mockResolvedValue(sampleText);

      await store.loadManuscript('/path/to/manuscript.txt');

      expect(store.loadingState).toBe('loaded');
      expect(store.loadingError).toBeNull();
      expect(store.fullText).toBe(sampleText);
      expect(store.manuscript).toBeDefined();
    });

    it('should transition to error state on failed manuscript load', async () => {
      const errorMessage = 'File not found';
      mockInvoke.mockRejectedValue(new Error(errorMessage));

      await expect(store.loadManuscript('/nonexistent/path.txt')).rejects.toThrow();

      expect(store.loadingState).toBe('error');
      expect(store.loadingError).toBe(errorMessage);
    });

    it('should handle Tauri invoke fallback to fs.readFileSync', async () => {
      const { readFileSync } = await import('fs');
      const sampleText = 'Fallback manuscript text';

      mockInvoke.mockRejectedValue(new Error('Tauri not available'));
      vi.mocked(readFileSync).mockReturnValue(sampleText);

      await store.loadManuscript('/path/to/manuscript.txt');

      expect(store.loadingState).toBe('loaded');
      expect(store.fullText).toBe(sampleText);
    });
  });

  describe('File Dialog Functionality', () => {
    it('should open file dialog successfully', async () => {
      const selectedPath = '/path/to/selected/manuscript.txt';
      mockDialogOpen.mockResolvedValue(selectedPath);
      mockInvoke.mockResolvedValue('Manuscript content');

      const result = await store.openManuscriptDialog();

      expect(result).toBe(selectedPath);
      expect(mockDialogOpen).toHaveBeenCalledWith({
        multiple: false,
        directory: false,
        filters: [
          {
            name: 'Manuscript Files',
            extensions: ['txt', 'md', 'manuscript'],
          },
          {
            name: 'Text Files',
            extensions: ['txt'],
          },
          {
            name: 'Markdown Files',
            extensions: ['md'],
          },
          {
            name: 'All Files',
            extensions: ['*'],
          },
        ],
      });
    });

    it('should return null when dialog is cancelled', async () => {
      mockDialogOpen.mockResolvedValue(null);

      const result = await store.openManuscriptDialog();

      expect(result).toBeNull();
    });

    it('should handle dialog errors', async () => {
      const errorMessage = 'Dialog failed';
      mockDialogOpen.mockRejectedValue(new Error(errorMessage));

      await expect(store.openManuscriptDialog()).rejects.toThrow(errorMessage);

      expect(store.loadingState).toBe('error');
      expect(store.loadingError).toBe(errorMessage);
    });

    it('should handle Tauri API not available', async () => {
      mockDialogOpen.mockImplementation(() => {
        throw new Error('Tauri dialog API not available');
      });

      await expect(store.openManuscriptDialog()).rejects.toThrow('Tauri dialog API not available');
    });
  });

  describe('Scene Management', () => {
    beforeEach(async () => {
      const sampleText = `CHAPTER 1

[SCENE: CH01_S01 | POV: Protagonist | Location: Forest]

The protagonist walked through the forest.

[SCENE: CH01_S02 | POV: Protagonist | Location: Cave]

They found a hidden cave.`;
      mockInvoke.mockResolvedValue(sampleText);
      await store.loadManuscript('/path/to/manuscript.txt');
    });

    it('should select scene correctly', () => {
      const sceneId = store.scenes[0]?.id;
      store.selectScene(sceneId);

      expect(store.selectedSceneId).toBe(sceneId);
    });

    it('should get scene by id', () => {
      const sceneId = store.scenes[0]?.id;
      const scene = store.getSceneById(sceneId!);

      expect(scene).toBeDefined();
      expect(scene?.id).toBe(sceneId);
    });

    it('should return undefined for non-existent scene id', () => {
      const scene = store.getSceneById('non-existent-id');

      expect(scene).toBeUndefined();
    });

    it('should get scene text correctly', () => {
      const sceneId = store.scenes[0]?.id;
      const sceneText = store.getSceneText(sceneId!);

      expect(sceneText).toBeDefined();
      expect(typeof sceneText).toBe('string');
    });

    it('should return empty string for non-existent scene', () => {
      const sceneText = store.getSceneText('non-existent-id');

      expect(sceneText).toBe('');
    });

    it('should get scene jump offset', () => {
      const sceneId = store.scenes[0]?.id;
      const offset = store.jumpToScene(sceneId!);

      expect(typeof offset).toBe('number');
      expect(offset).toBeGreaterThanOrEqual(0);
    });

    it('should return -1 for non-existent scene jump', () => {
      const offset = store.jumpToScene('non-existent-id');

      expect(offset).toBe(-1);
    });
  });

  describe('State Management', () => {
    it('should set loading state correctly', () => {
      store.setLoadingState('loading');
      expect(store.loadingState).toBe('loading');

      store.setLoadingState('loaded');
      expect(store.loadingState).toBe('loaded');

      store.setLoadingState('error');
      expect(store.loadingState).toBe('error');
    });

    it('should set loading error correctly', () => {
      const errorMessage = 'Test error';
      store.setLoadingError(errorMessage);

      expect(store.loadingError).toBe(errorMessage);

      store.setLoadingError(null);
      expect(store.loadingError).toBeNull();
    });

    it('should clear all state correctly', () => {
      // Set up some state first
      store.setLoadingState?.('loaded');
      store.setLoadingError?.('Some error');
      store.selectScene?.('test-scene');

      store.clearAll?.();

      expect(store.loadingState).toBe('idle');
      expect(store.loadingError).toBeNull();
      expect(store.selectedSceneId).toBeUndefined();
      expect(store.manuscript).toBeUndefined();
      expect(store.fullText).toBe('');
      expect(store.scenes).toEqual([]);
      expect(store.reveals).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should handle Tauri invoke errors', async () => {
      const errorMessage = 'File not found';
      mockInvoke.mockRejectedValue(new Error(errorMessage));

      try {
        await store.loadManuscript('/nonexistent/path.txt');
      } catch {
        // Expected to throw
      }

      expect(store.loadingState).toBe('error');
      expect(store.loadingError).toBe(errorMessage);
    });
  });

  describe('Path Resolution', () => {
    it('should handle default manuscript path', async () => {
      mockInvoke.mockResolvedValue('Default manuscript content');

      await store.loadManuscript('data/manuscript.txt');

      expect(mockInvoke).toHaveBeenCalledWith('load_manuscript_text', { path: 'data/manuscript.txt' });
    });

    it('should handle absolute paths', async () => {
      const absolutePath = 'C:\\Users\\test\\manuscript.txt';
      mockInvoke.mockResolvedValue('Absolute path content');

      await store.loadManuscript(absolutePath);

      expect(mockInvoke).toHaveBeenCalledWith('load_manuscript_text', { path: absolutePath });
    });

    it('should handle relative paths', async () => {
      const relativePath = './manuscripts/test.txt';
      mockInvoke.mockResolvedValue('Relative path content');

      await store.loadManuscript(relativePath);

      expect(mockInvoke).toHaveBeenCalledWith('load_manuscript_text', { path: relativePath });
    });
  });
});
