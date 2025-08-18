# Data Contracts & Invariants

All interfaces are illustrative TypeScript shapes (final code may refine). Invariants listed beneath related entities.

```ts
// Core Scene Entity
export interface Scene {
  id: string;
  chapterId: string;
  text: string; // Plain text body
  summary: string; // LLM or heuristic summary
  # Data Contracts

  This document defines the TypeScript interfaces and data structures used throughout SMAIRS.

  ## Core Interfaces

  ### Scene
  ```typescript
  interface Scene {
    id: string;
    chapterId: string;
    text: string;
    summary: string;
    anchorHash: string;
  
    // Scoring
    hookScore: number;
    tensionScore: number;
    clarityScore: number;
  
    // Content tracking
    characters: string[];
    reveals: RevealRef[];
    requires: string[];
  
    // Metadata
    beats: StoryBeat[];
    location?: string;
    timeRef?: string;
  }
  ```

  ### Reveal
  ```typescript
  interface Reveal {
    id: string;
    description: string;
    firstExposureSceneId: string;
    preReqs: string[];
    type: 'plot' | 'character' | 'world' | 'backstory';
  }
  ```

  ### TextAnchor
  ```typescript
  interface TextAnchor {
    quotedSpan: string;
    hash: string;
    context: string;
  }
  ```

  *Additional interfaces to be defined as implementation progresses.*
  contextSuffix: string; // ≤64 chars
