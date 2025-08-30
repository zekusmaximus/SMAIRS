# SMAIRS UI Usage Guide

This guide explains how to use the SMAIRS (Single Manuscript AI Revision System) desktop application based on the actual implemented features.

## Getting Started

### Loading a Manuscript
1. Launch SMAIRS
2. Click **File > Open** or use `Ctrl+O` (Windows) / `Cmd+O` (Mac)
3. Select your manuscript file (.txt, .docx, .md formats supported)
4. Wait for the manuscript to load and process into scenes

### Understanding the Interface

SMAIRS has a three-panel layout:

#### Left Panel: Scene Navigator
- Shows all scenes in your manuscript with automatic segmentation
- Click any scene to jump to it in the editor
- Filter scenes using the search box at the top
- Virtual scrolling for performance with large manuscripts
- Shows opening candidate indicators when relevant

#### Center Panel: Manuscript Editor
- CodeMirror-based editor with syntax highlighting
- Make edits directly in the manuscript
- Auto-save functionality
- Dialogue and character highlighting
- Supports standard editing shortcuts

#### Right Panel: Analysis Details
- Shows detailed analysis for selected opening candidates
- Six tabs: Decision, Metrics, Spoilers, Context, Edits, Preview
- Only appears when an opening candidate is selected
- Lazy-loaded components for performance

### Top Toolbar: Decision Bar
- **SMAIRS** title and version selector on the left
- **Preflight Pills** in the center showing real-time analysis status:
  - **Confidence**: AI confidence level (≥60% to pass)
  - **Spoilers**: Spoiler count (0 to pass)
  - **Burden**: Edit burden percentage (≤20% to pass)
  - **Rationale**: Analysis quality check
- **Action buttons** on the right:
  - **G** (Generate): Create opening candidates *(partially implemented)*
  - **C** (Compare): Compare multiple candidates
  - **E** (Export): Export final results (enabled when all checks pass)
- **Theme and font size controls**

## Opening Lab Features (Currently Implemented)

### Candidate Management System
The Opening Lab has a fully implemented candidate analysis system:

**CandidateGrid Component:**
- Displays opening candidates in a responsive grid
- Shows candidate cards with preview text, metrics, and status
- Job progress tracking for candidate generation
- Staggered animations for visual feedback
- Loading skeletons during generation

**Analysis Store Integration:**
- Zustand-based state management for candidates and analyses
- Real-time updates when new candidates are added
- Persistent candidate selection across UI interactions
- Full analysis data tracking (confidence, spoilers, edit burden, rationale)

**AnalysisDetails Panel:**
Six specialized tabs for comprehensive analysis:
1. **Decision Tab**: Accept/Revise/Reject with reasoning documentation
2. **Metrics Tab**: Detailed scoring with threshold comparisons
3. **Spoilers Tab**: Spoiler detection and analysis results
4. **Context Tab**: Context gap analysis with bridge generation
5. **Edits Tab**: Edit requirements and burden assessment
6. **Preview Tab**: Preview of final candidate implementation

### Analysis Features Currently Working

**Real-time Analysis:**
- Confidence scoring with 70% threshold
- Spoiler detection with automatic flagging
- Edit burden calculation as percentage
- Rationale quality assessment

**Decision Making:**
- Three-tier verdict system (Accept/Revise/Reject)
- Up to 3 "why it works" reasons
- Risk notes documentation
- Auto-save decision state

**Comparison System:**
- Multi-candidate selection support
- Side-by-side comparison interface
- Metric comparison across candidates
- Analysis state persistence

### Version Management
**Full versioning system with:**
- Snapshot creation and restoration
- Analysis state preservation
- Candidate data persistence
- Version history tracking

### Export System
**Comprehensive export functionality:**
- Multiple format support
- Bundle generation with analysis data
- Progress tracking during export
- Conditional enablement based on analysis completion

## Currently Functional Workflows

### 1. Manuscript Analysis Workflow
1. Load manuscript → automatic scene segmentation
2. Scene navigation and editing in CodeMirror editor
3. Search and filter scenes in navigator
4. Real-time syntax highlighting and decorations

### 2. Opening Analysis Workflow (When Triggered)
1. Opening candidates are generated (through backend/API calls)
2. Candidates appear in CandidateGrid with metrics
3. Select candidate → detailed analysis in right panel
4. Navigate through 6 analysis tabs
5. Make decisions and document reasoning
6. Compare multiple candidates
7. Export when analysis is complete

### 3. Version Management Workflow
1. Create snapshots at key decision points
2. Switch between manuscript versions
3. Analysis state follows version changes
4. Restore previous states as needed

## Keyboard Shortcuts (Fully Implemented)

### Global Shortcuts
- `Ctrl+O` / `Cmd+O`: Open manuscript
- `Ctrl+S` / `Cmd+S`: Save manuscript
- `Ctrl+Shift+E` / `Cmd+Shift+E`: Export
- `Ctrl+K` / `Cmd+K`: Focus search
- `Ctrl+/` / `Cmd+/`: Show keyboard help
- `?`: Show keyboard help
- `Escape`: Close dialogs
- `Ctrl+Alt+C` / `Cmd+Alt+C`: Toggle high contrast mode

### Panel Navigation
- `1`: Focus Scene Navigator (left panel)
- `2`: Focus Manuscript Editor (center panel)  
- `3`: Focus Analysis Details (right panel)

### Quick Actions
- `G`: Generate candidates *(button exists, handler needs implementation)*
- `C`: Compare candidates
- `E`: Export results

### Analysis Tabs (when candidate selected)
- `1`: Decision tab
- `2`: Metrics tab
- `3`: Spoilers tab
- `4`: Context tab
- `5`: Edits tab
- `6`: Preview tab

## Search Features (Implemented)

### Scene Search
- Real-time filtering in Scene Navigator
- Search by scene content and metadata
- Virtual list performance optimization

### Manuscript Search
- Tauri-backend search with graceful fallback
- Full-text search across manuscript
- Search API with error handling

## Current Implementation Status

### ✅ Fully Implemented
- Scene Navigator with virtual scrolling
- CodeMirror manuscript editor
- Analysis Details panel with all 6 tabs
- Decision making and documentation system
- Version management and snapshots
- Export system with progress tracking
- Keyboard shortcuts and accessibility
- Theme and preference management
- Error boundaries and recovery
- Loading states and progress indicators

### 🔄 Partially Implemented
- Opening candidate generation (UI ready, needs backend integration)
- Generate button functionality (UI exists, needs click handler)
- Tauri API integration (has fallbacks for non-Tauri environments)

### 📋 Ready for Integration
- CandidateGrid component ready for candidate data
- Analysis store ready for analysis results
- Query system ready for backend calls
- Progress tracking ready for long operations

## Tips for Current Usage

1. **Manuscript Editing**: The editor is fully functional for manuscript editing and review
2. **Scene Navigation**: Use the navigator to quickly move between manuscript sections
3. **Analysis Preparation**: The analysis UI is ready - when candidates are generated, full analysis workflow is available
4. **Version Control**: Use snapshots before making major changes
5. **Export System**: Works when analysis data is available

## Development Mode

If running in development mode:
- Use `npm run tauri:dev` (not both npm run dev and tauri:dev)
- Hot reloading enabled for React components
- Console shows detailed error information
- Fallback behaviors for non-Tauri environments

## Integration Points Needed

The UI is essentially complete and waiting for:

1. **Generate Button Handler**: Connect the "G" button to trigger candidate generation
2. **Backend API Integration**: Complete the Tauri command handlers for:
   - `generate_candidates`
   - `analyze_candidate` 
   - `export_bundle`
3. **Data Flow**: Ensure generated candidates flow into the analysis store

Once these integration points are complete, the full Opening Lab workflow will be functional in the UI.
