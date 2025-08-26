# SMAIRS Architecture

## Overview

Single Manuscript AI Revision System (SMAIRS) is a Tauri-based desktop application that provides AI-powered manuscript analysis with a focus on opening optimization. The system processes a single manuscript to identify optimal opening scenes, detect spoilers, calculate edit burden, and generate submission-ready revisions.

## System Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│                    SMAIRS Desktop App                       │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                 React Frontend (UI)                     │  │
│  │  • Main Layout with 3-panel design                      │  │
│  │  • Scene Navigator, Candidate Grid, Analysis Details    │  │
│  │  • Decision Bar with keyboard shortcuts                 │  │
│  │  • Lazy-loaded panels with error boundaries             │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                 Tauri Runtime                           │  │
│  │  • Rust core with WebView                                │  │
│  │  • IPC communication layer                               │  │
│  │  • File system access                                    │  │
│  │  • SQLite persistence                                    │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                 Analysis Engine                         │  │
│  │  • Manuscript processing pipeline                       │  │
│  │  • Scene segmentation & anchoring                       │  │
│  │  • Reveal graph construction                            │  │
│  │  • LLM orchestration                                    │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Core Data Flow

### 1. Manuscript Ingestion
```
Manuscript File → Import Module → Chapter Segmentation → Scene Analysis
```

### 2. Analysis Pipeline
```
Scenes → Character Extraction → Reveal Graph → Opening Candidates → Spoiler Detection → Edit Burden → LLM Scoring
```

### 3. Output Generation
```
Analysis Results → Report Generation → Export Templates → Submission Bundle
```

## Component Details

### Frontend Architecture (React + TypeScript)

#### State Management
- **Zustand**: Global state management for manuscript data, analysis results, and UI state
- **React Query**: Server state management for async operations and caching
- **Context Providers**: Scoped state for specific features

#### UI Components
- **Main Layout**: 3-panel responsive design with keyboard navigation
- **Scene Navigator**: Tree view of manuscript structure with scene details
- **Candidate Grid**: Comparison view of opening candidates with metrics
- **Analysis Details**: Tabbed interface for spoilers, context, metrics, and decisions
- **Decision Bar**: Global action bar with keyboard shortcuts

#### Key Features
- **Virtual Scrolling**: CodeMirror 6 for large document performance
- **Error Boundaries**: Graceful error handling with recovery options
- **Lazy Loading**: Code splitting for optimal bundle size
- **Accessibility**: ARIA labels, keyboard navigation, high contrast mode

### Backend Architecture (Rust + Tauri)

#### Core Modules
- **Manuscript Processing**: File I/O, text parsing, chapter/scene segmentation
- **Database Layer**: SQLite with scene/reveal metadata persistence
- **Analysis Engine**: Character extraction, reveal graph construction
- **LLM Integration**: Provider abstraction with capability profiles
- **Export System**: Pandoc integration for multiple output formats

#### IPC Commands
- `analyze_manuscript`: Full manuscript analysis pipeline
- `generate_candidates`: Opening candidate identification
- `detect_spoilers`: Spoiler violation analysis
- `calculate_burden`: Edit burden computation
- `export_bundle`: Generate submission package

### Analysis Engine

#### Scene Processing Pipeline
```
Raw Text → Chapter Detection → Scene Segmentation → Character Extraction → Reveal Mapping → Anchor Generation
```

#### Reveal Graph Construction
```
Scenes → Reveal Extraction → Dependency Analysis → Graph Building → Spoiler Detection → Context Gap Analysis
```

#### LLM Integration
```
Capability Profiles → Provider Selection → Prompt Construction → Response Parsing → Result Caching
```

## Data Models

### Core Entities

#### Manuscript
```typescript
interface Manuscript {
  id: string;
  title: string;
  chapters: Chapter[];
  wordCount: number;
  metadata: ManuscriptMetadata;
}
```

#### Scene
```typescript
interface Scene {
  id: string;
  chapterId: string;
  text: string;
  summary: string;
  anchorHash: string;
  characters: string[];
  reveals: RevealRef[];
  requires: string[];
  hookScore: number;
  tensionScore: number;
  clarityScore: number;
}
```

#### Reveal
```typescript
interface Reveal {
  id: string;
  description: string;
  firstExposureSceneId: string;
  preReqs: string[];
  type: 'plot' | 'character' | 'world' | 'backstory';
}
```

#### OpeningCandidate
```typescript
interface OpeningCandidate {
  id: string;
  sceneIds: string[];
  type: 'single' | 'composite' | 'sequence';
  hookScore: number;
  totalWords: number;
  dialogueRatio: number;
}
```

#### AnchoredEdit
```typescript
interface AnchoredEdit {
  anchor: TextAnchor;
  original: string;
  suggested: string;
  reason: string;
  type: 'replace' | 'insert' | 'delete';
  priority: 'critical' | 'important' | 'optional';
}
```

## Performance Architecture

### Caching Strategy
- **Multi-Level Caching**: Memory → File → SQLite
- **Delta Tracking**: Incremental updates with change detection
- **TTL-Based Expiration**: Configurable cache lifetimes
- **Size Limits**: Automatic cache pruning

### Performance Budgets
- **Cold Start**: ≤ 4 seconds
- **Manuscript Load**: ≤ 800ms (120k words)
- **Search Latency**: p95 ≤ 120ms
- **Memory Usage**: ≤ 200MB heap growth
- **Anchor Preservation**: ≥ 90% after edits

## Security Architecture

### Data Protection
- **Local-First**: No cloud storage or sync
- **File Encryption**: OS-level encryption for manuscript files
- **Memory Safety**: Rust prevents buffer overflows
- **Input Validation**: Comprehensive sanitization

### LLM Security
- **Prompt Injection Protection**: Input validation and sanitization
- **Provider Isolation**: Abstracted provider interfaces
- **Mock Mode**: Complete offline operation
- **Rate Limiting**: Built-in request throttling

### Secret Management
- **Environment Variables**: API keys via `.env` files
- **OS Keychain**: Secure credential storage
- **No Persistence**: Keys never written to disk

## Deployment Architecture

### Development
- **Vite**: Fast development server with HMR
- **ESLint + Prettier**: Code quality and formatting
- **Vitest**: Unit and integration testing
- **TypeScript**: Strict type checking

### Production
- **Tauri Bundler**: Native desktop packages
- **Tree Shaking**: Optimized bundle sizes
- **Code Splitting**: Lazy-loaded components
- **Minification**: Production optimizations

## Integration Points

### External Dependencies
- **LLM Providers**: Anthropic, OpenAI, Google (configurable)
- **Pandoc**: Document conversion and export
- **SQLite**: Local data persistence
- **CodeMirror**: Text editing and display

### File System Integration
- **Manuscript Input**: `.txt` files from `data/` directory
- **Cache Storage**: `.smairs/` directory for analysis results
- **Export Output**: `out/` directory for generated reports
- **Templates**: `templates/` directory for export formats

## Monitoring and Observability

### Performance Monitoring
- **Memory Tracking**: Heap usage and garbage collection
- **Timing Metrics**: Operation duration tracking
- **Cache Hit Rates**: Effectiveness monitoring
- **Error Tracking**: Comprehensive error logging

### Development Tools
- **React DevTools**: Component inspection and profiling
- **Tauri DevTools**: IPC and performance monitoring
- **Performance Benchmarks**: Automated performance testing
- **Memory Leak Detection**: Development-time leak detection

## Future Architecture Considerations

### Phase 3: Patch Packs
- **Diff Engine**: Advanced text comparison algorithms
- **Bridge Paragraph Generation**: AI-powered content creation
- **Batch Processing**: Multiple revision workflows

### Phase 4: Export & Validation
- **Continuity Checking**: Automated fact verification
- **Version Management**: Revision history and comparison
- **Submission Tracking**: Agent response and revision cycles

This architecture provides a solid foundation for manuscript analysis while maintaining performance, security, and extensibility for future enhancements.
