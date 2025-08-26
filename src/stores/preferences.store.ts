import { create } from "zustand";

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface UserPreferences {
  theme: ThemeMode;
  editorFontSize: number; // px
  autoSave: boolean;
  llmProvider: 'anthropic' | 'openai';
  exportFormat: 'docx' | 'pdf' | 'markdown';
}

export interface PreferencesStore extends UserPreferences {
  set: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
  load: () => void;
}

const LS_KEY = 'smairs.preferences.v1';

const defaults: UserPreferences = {
  theme: 'auto',
  editorFontSize: 15,
  autoSave: true,
  llmProvider: 'anthropic',
  exportFormat: 'markdown',
};

function readPrefs(): UserPreferences {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(LS_KEY) : null;
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

function writePrefs(p: UserPreferences) {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

export const usePreferences = create<PreferencesStore>((set, get) => ({
  ...readPrefs(),
  set(key, value) {
    const next = { ...get(), [key]: value } as UserPreferences;
    set({ [key]: value } as Partial<UserPreferences>);
    writePrefs(next);
    // side effects
    if (key === 'theme') applyTheme(value as ThemeMode);
  },
  load() {
    const p = readPrefs();
    set(p);
    applyTheme(p.theme);
  },
}));

export function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('theme-light', 'theme-dark');
  if (mode === 'light') root.classList.add('theme-light');
  else if (mode === 'dark') root.classList.add('theme-dark');
  else {
    // auto: prefer OS scheme
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (mq?.matches) root.classList.add('theme-dark');
    else root.classList.add('theme-light');
  }
}
