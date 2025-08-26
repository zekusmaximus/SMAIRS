# Search Features Guide

This guide provides comprehensive information about the search functionality in the SMAIRS project, including full-text search, character search, indexing, and performance optimization.

## Overview

The search system is built on Tantivy, a high-performance search engine library written in Rust. It provides fast, accurate full-text search across manuscript content with advanced features like fuzzy matching, phrase search, and character name resolution.

## Architecture

### Core Components

#### Search Index (Rust/Tantivy)
- **Location**: `src-tauri/src/search.rs`
- **Technology**: Tantivy search engine
- **Features**: Full-text indexing, fuzzy search, phrase queries
- **Storage**: Local filesystem (`.smairs/index/`)

#### Search API (TypeScript)
- **Location**: `src/features/search/searchApi.ts`
- **Purpose**: Frontend interface to search functionality
- **Features**: Caching, result formatting, Tauri integration

#### Search Panel (React)
- **Location**: `src/ui/panels/SearchPanel.tsx`
- **Purpose**: User interface for search functionality
- **Features**: Query input, filtering, result display

## Index Structure

### Schema Definition
The search index uses the following schema:

```rust
Schema {
    scene_id: TEXT | STORED,        // Scene identifier
    chapter_id: TEXT | STORED,      // Chapter identifier
    text: TEXT | STORED,            // Full scene text with positions
    offset: U64 | STORED,           // Scene start offset in manuscript
    character_names: TEXT           // Extracted character names
}
```

### Indexing Process
1. **Scene Extraction**: Manuscript is segmented into scenes
2. **Character Detection**: Automatic extraction of character names using regex
3. **Document Creation**: Each scene becomes a searchable document
4. **Index Building**: Incremental updates with Tantivy

## Search Capabilities

### Full-Text Search

#### Basic Search
```typescript
import { searchAPI } from './searchApi';

// Simple text search
const results = await searchAPI.search("protagonist confronts antagonist", {
  limit: 50
});

console.log(results[0]);
// {
//   sceneId: "scene-123",
//   offset: 15420,
//   snippet: "...protagonist finally confronts the antagonist in the darkened alley...",
//   score: 0.85,
//   highlights: [[25, 36], [45, 55]]
// }
```

#### Query Types
- **Phrase Search**: Use quotes for exact phrases
  - `"exact phrase match"`
- **Wildcard Search**: Use `*` and `?` for wildcards
  - `protagonist*`, `confront?`
- **Fuzzy Search**: Automatic fuzzy matching for typos
  - `confront` matches `confrontation`

### Character Search
```typescript
// Find all mentions of a character
const mentions = await searchAPI.findCharacter("Bob");

// Includes name variations and aliases
// Bob, Robert, Bobby, Mr. Smith, etc.
```

### Advanced Queries
The search supports complex boolean queries:

```rust
// Multiple terms with fuzzy matching
"protagonist confronts antagonist"
// → Fuzzy search for each term

// Phrase with fuzzy terms
"\"exact phrase\" fuzzy term"
// → Exact phrase + fuzzy matching
```

## Result Processing

### Snippet Generation
- **Context**: 60 characters before and after match
- **Highlighting**: Precise character positions
- **Length**: Maximum 160 characters

### Scoring
- **Relevance**: TF-IDF based scoring
- **Position**: Boost for matches near beginning
- **Frequency**: Term frequency weighting

### Filtering
```typescript
// Filter by chapter
const chapterResults = results.filter(r =>
  manuscript.scenes.find(s => s.id === r.sceneId)?.chapterId === "chapter-5"
);

// Filter by character
const characterResults = await searchAPI.findCharacter("Alice");
```

## Performance Characteristics

### Benchmarks
- **Index Build**: ~2 seconds for 120k-word manuscript
- **Search Latency**: p95 < 120ms
- **Memory Usage**: ~50MB index size
- **Concurrent Searches**: 2 simultaneous queries

### Optimization Features
- **Incremental Indexing**: Update only changed scenes
- **Query Caching**: Frontend result caching
- **Background Processing**: Non-blocking index operations

## Usage Examples

### Basic Search Workflow
```typescript
// 1. Build index from manuscript scenes
await searchAPI.buildIndex(scenes);

// 2. Perform search
const results = await searchAPI.search("key plot point", { limit: 20 });

// 3. Display results with navigation
results.forEach(result => {
  console.log(`Scene: ${result.sceneId}`);
  console.log(`Snippet: ${result.snippet}`);
  console.log(`Score: ${result.score}`);

  // Navigate to location
  jumpToScene(result.sceneId);
  highlightText(result.offset, result.highlights[0]);
});
```

### Character Analysis
```typescript
// Find character development arc
const characterMentions = await searchAPI.findCharacter("protagonist");

// Group by chapter
const byChapter = characterMentions.reduce((acc, mention) => {
  const chapter = getChapterForScene(mention.sceneId);
  acc[chapter] = (acc[chapter] || 0) + 1;
  return acc;
}, {});

// Analyze character presence
console.log("Character mentions by chapter:", byChapter);
```

### Complex Queries
```typescript
// Search for emotional scenes
const emotionalScenes = await searchAPI.search(
  '"tears" OR "cried" OR "sobbing" OR "heartbreak"',
  { limit: 100 }
);

// Find dialogue-heavy scenes
const dialogueScenes = await searchAPI.search(
  '"said" OR "asked" OR "replied" OR "whispered"',
  { limit: 50 }
);

// Locate plot twists
const plotTwists = await searchAPI.search(
  '"suddenly" OR "unexpectedly" OR "shock" OR "revelation"',
  { limit: 30 }
);
```

## Integration with Editor

### CodeMirror Integration
```typescript
// Set highlights in editor
function highlightSearchResult(result: SearchResult) {
  if (result.highlights.length > 0) {
    const [start, end] = result.highlights[0];
    const absoluteStart = result.offset + start;
    const absoluteEnd = result.offset + end;

    editor.setHighlights([{
      from: absoluteStart,
      to: absoluteEnd
    }]);

    editor.scrollTo(absoluteStart);
  }
}
```

### Navigation
```typescript
// Jump to scene and highlight
function navigateToResult(result: SearchResult) {
  // Switch to scene
  manuscriptStore.jumpToScene(result.sceneId);

  // Clear previous highlights
  editor.clearHighlights();

  // Apply new highlights
  highlightSearchResult(result);

  // Scroll to position
  editor.scrollTo(result.offset);
}
```

## Configuration

### Index Settings
```rust
// Index writer configuration
let writer = index.writer(50_000_000)?; // 50MB buffer

// Searcher configuration
let searcher = reader.searcher();
```

### Query Configuration
```typescript
// Search options
const searchOptions = {
  limit: 100,           // Maximum results
  offset: 0,            // Pagination offset
  fuzzyDistance: 2,     // Fuzzy matching distance
  boostPhrase: 2.0      // Phrase match boost
};
```

## Character Name Resolution

### Automatic Extraction
```rust
// Regex-based character detection
let re = Regex::new(r"\b([A-Z][a-z]{2,})(?:\s+[A-Z][a-z]{2,})*\b")?;
for capture in re.find_iter(text) {
    characters.push(capture.as_str().to_string());
}
```

### Alias Resolution
```rust
// Name normalization
fn canonical_name(name: &str) -> Option<Vec<String>> {
    match name.to_lowercase().as_str() {
        "bob" => Some(vec!["robert".into(), "bobby".into()]),
        "rob" => Some(vec!["robert".into()]),
        _ => None
    }
}
```

### Title Handling
```rust
// Handle titles and honorifics
if name.split_whitespace().count() == 2 {
    let last = name.split_whitespace().last()?;
    variants.push(format!("Mr {}", last));
    variants.push(format!("Mrs {}", last));
    variants.push(format!("Ms {}", last));
}
```

## Error Handling

### Index Errors
```rust
// Handle index building failures
match searchAPI.buildIndex(scenes) {
    Ok(_) => println!("Index built successfully"),
    Err(e) => {
        println!("Index build failed: {}", e);
        // Fallback to simple text search
    }
}
```

### Search Errors
```typescript
// Graceful degradation
try {
    const results = await searchAPI.search(query);
    displayResults(results);
} catch (error) {
    console.error("Search failed:", error);
    // Show cached results or empty state
    showCachedResults();
}
```

## Testing and Benchmarking

### Performance Testing
```bash
# Run search benchmarks
npm run search:benchmark

# Output:
# {
#   scenes: 245,
#   tIndex: 1850,    // ms to build index
#   tSearch: 45,     // ms for search
#   res: [...]       // Sample results
# }
```

### Unit Testing
```typescript
// Test search functionality
describe('SearchAPI', () => {
  it('should find exact matches', async () => {
    const results = await searchAPI.search("specific phrase");
    expect(results.length).toBeGreaterThan(0);
  });

  it('should handle fuzzy matches', async () => {
    const results = await searchAPI.search("spesific frase");
    expect(results[0].score).toBeGreaterThan(0.5);
  });
});
```

## Best Practices

### Query Optimization
1. **Use Phrases**: Quote exact phrases for precision
2. **Combine Terms**: Use multiple terms for broader results
3. **Character Search**: Use dedicated character search for names
4. **Limit Results**: Set reasonable limits to avoid performance issues

### Index Management
1. **Incremental Updates**: Only rebuild changed scenes
2. **Regular Cleanup**: Remove old indexes periodically
3. **Monitor Size**: Keep index size reasonable (< 100MB)
4. **Backup**: Backup important indexes

### Performance Tuning
1. **Cache Results**: Use frontend caching for repeated queries
2. **Batch Operations**: Group multiple searches when possible
3. **Background Processing**: Build indexes asynchronously
4. **Resource Limits**: Set memory limits for index building

## Future Enhancements

### Planned Features
- **Semantic Search**: Vector-based similarity search
- **Cross-Reference**: Link related scenes and characters
- **Timeline Search**: Search within specific time periods
- **Advanced Filtering**: By scene type, character relationships
- **Export Integration**: Include search results in exports

### Performance Improvements
- **Parallel Indexing**: Multi-threaded index building
- **Compressed Storage**: Reduce index size
- **Distributed Search**: Multi-node search capability
- **Real-time Updates**: Live index updates during editing

This search system provides fast, accurate, and flexible text search capabilities essential for manuscript analysis and navigation in the SMAIRS application.
