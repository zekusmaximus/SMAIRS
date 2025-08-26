# Development Setup Guide

This guide provides comprehensive instructions for setting up the SMAIRS development environment, including prerequisites, installation, configuration, and development workflows.

## Overview

SMAIRS is a Tauri application built with React, TypeScript, and Rust. The development environment requires both Node.js and Rust toolchains, along with several optional tools for enhanced functionality.

## Prerequisites

### Required Software

#### Node.js 20 LTS
- **Version**: 20.x (LTS)
- **Purpose**: Frontend development, build tools, package management
- **Installation**:
  ```bash
  # Using nvm (recommended)
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
  nvm install 20
  nvm use 20

  # Using fnm (alternative)
  curl -fsSL https://fnm.vercel.app/install | bash
  fnm install 20
  fnm use 20

  # Verify installation
  node --version  # Should show v20.x.x
  npm --version   # Should show 10.x.x
  ```

#### Rust Stable
- **Version**: 1.70+ (stable)
- **Purpose**: Tauri backend, system integration, performance-critical operations
- **Installation**:
  ```bash
  # Install Rust toolchain
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

  # Add to PATH (follow installer instructions)
  source $HOME/.cargo/env

  # Verify installation
  rustc --version  # Should show 1.7x.x
  cargo --version  # Should show 1.7x.x
  ```

#### Tauri CLI
- **Purpose**: Desktop application development and building
- **Installation**:
  ```bash
  # Install globally via Cargo
  cargo install tauri-cli@2

  # Or add as dev dependency
  npm install @tauri-apps/cli --save-dev

  # Verify installation
  tauri --version
  ```

### Optional Software

#### Pandoc
- **Version**: 2.0+
- **Purpose**: Document export functionality (DOCX, PDF)
- **Installation**:
  ```bash
  # macOS
  brew install pandoc

  # Ubuntu/Debian
  sudo apt-get install pandoc

  # Windows (Chocolatey)
  choco install pandoc

  # Verify installation
  pandoc --version
  ```

#### LaTeX Distribution (for PDF export)
- **Purpose**: High-quality PDF generation
- **Installation**:
  ```bash
  # macOS
  brew install mactex

  # Ubuntu/Debian
  sudo apt-get install texlive-latex-recommended texlive-latex-extra

  # Windows
  # Download and install MiKTeX or TeX Live
  ```

## Project Setup

### 1. Clone and Initialize
```bash
# Clone the repository
git clone <repository-url>
cd smairs

# Install Node.js dependencies
npm ci

# Verify Node version matches .nvmrc
node --version  # Should match .nvmrc (20)
```

### 2. Environment Configuration
```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# At minimum, set LLM_OFFLINE=1 for development without API keys
```

### 3. Rust Dependencies
```bash
# Install Rust dependencies (usually automatic)
cd src-tauri
cargo build
cd ..
```

### 4. Type Generation
```bash
# Generate TypeScript types from Rust
npm run generate:types
```

## Development Workflows

### Frontend Development (Vite Dev Server)
```bash
# Start development server
npm run dev

# Server will be available at http://localhost:5173
# Hot reload enabled for React components
```

### Desktop Application Development
```bash
# Start Tauri development mode
npm run tauri:dev

# This will:
# 1. Start Vite dev server
# 2. Build Rust backend
# 3. Launch desktop application
# 4. Enable hot reload for both frontend and backend
```

### CLI Tool Development
```bash
# Run CLI tools for testing
npm run cli -- data/manuscript.txt out/scene-inventory.md

# Analyze opening with mock LLM
LLM_OFFLINE=1 npm run analyze:opening -- data/manuscript.txt out/opening-analysis

# With real LLM integration
npm run analyze:opening -- data/manuscript.txt out/opening-analysis
```

## Testing

### Unit and Component Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm test -- --coverage
```

### Integration Tests
```bash
# Run integration tests
npm run test:integration

# End-to-end test pipeline
npm run test:e2e
```

### Manual Testing
```bash
# Validate manuscript
npm run manuscript:validate

# Fix manuscript formatting
npm run manuscript:fix
```

## Building

### Development Build
```bash
# Build for development
npm run build
npm run tauri:build -- --debug
```

### Production Build
```bash
# Build optimized production version
npm run build
npm run tauri:build

# Output will be in src-tauri/target/release/bundle/
```

## Code Quality

### Type Checking
```bash
# Strict TypeScript validation
npm run typecheck
```

### Linting
```bash
# ESLint with React and TypeScript rules
npm run lint

# Auto-fix linting issues
npm run lint -- --fix
```

### Formatting
```bash
# Prettier code formatting
npm run format
```

## Environment Variables

### Required for LLM Integration
```bash
# Anthropic Claude
ANTHROPIC_API_KEY=your_anthropic_key_here

# OpenAI GPT
OPENAI_API_KEY=your_openai_key_here

# Google Gemini
GOOGLE_API_KEY=your_google_key_here
GEMINI_API_KEY=your_gemini_key_here
```

### Development Configuration
```bash
# Enable offline/mock mode
LLM_OFFLINE=1

# Enable debug logging
DEBUG=1

# Override model profiles
LLM_PROFILE__STRUCTURE=anthropic:claude-3-5-sonnet
LLM_PROFILE__FAST=openai:gpt-4o-mini
LLM_PROFILE__JUDGE=google:gemini-2.0-flash-exp

# Enable long context
LLM_LONGCTX_ENABLE=1

# Configure retry behavior
LLM_RETRIES=2
```

### Performance Tuning
```bash
# Cache configuration
LLM_CACHE_MAX_AGE=3600000

# Request timeouts
LLM_REQUEST_TIMEOUT=30000

# Concurrent requests
LLM_MAX_CONCURRENT=2
```

## Project Structure

### Frontend (`src/`)
```
src/
├── App.tsx              # Main React application
├── main.tsx             # Application entry point
├── features/            # Feature modules
│   ├── llm/            # LLM integration
│   ├── export/         # Export functionality
│   ├── search/         # Search features
│   └── manuscript/     # Manuscript processing
├── ui/                 # UI components and layouts
├── stores/             # State management (Zustand)
├── lib/                # Utilities and helpers
├── types/              # TypeScript type definitions
└── styles/             # CSS and styling
```

### Backend (`src-tauri/`)
```
src-tauri/
├── src/
│   ├── main.rs         # Application entry point
│   ├── lib.rs          # Library interface
│   ├── commands/       # Tauri commands
│   ├── db.rs           # Database operations
│   ├── search.rs       # Search indexing
│   └── types.rs        # Shared types
├── Cargo.toml          # Rust dependencies
└── tauri.conf.json5    # Tauri configuration
```

## Debugging

### Frontend Debugging
```bash
# Enable React DevTools
# Open browser dev tools in Vite dev server
# React components will show in Components tab
```

### Backend Debugging
```bash
# Enable debug logging
DEBUG=1 npm run tauri:dev

# View logs in terminal or application console
```

### LLM Debugging
```bash
# Enable LLM debug output
DEBUG=1 LLM_OFFLINE=0 npm run analyze:opening -- data/manuscript.txt out/debug

# View detailed request/response logs
```

## Performance Optimization

### Development Performance
```bash
# Enable faster builds
TAURI_RUST_LOG=error npm run tauri:dev

# Use development optimizations
NODE_ENV=development npm run dev
```

### Production Performance
```bash
# Enable release optimizations
npm run tauri:build -- --release

# Bundle analysis
npm run build -- --mode analyze
```

## Troubleshooting

### Common Issues

#### Node Version Mismatch
```bash
# Use correct Node version
nvm use 20

# Update npm
npm install -g npm@latest
```

#### Rust Build Failures
```bash
# Clean and rebuild
cd src-tauri
cargo clean
cargo build

# Update Rust toolchain
rustup update stable
```

#### Tauri Development Issues
```bash
# Reinstall Tauri CLI
cargo install tauri-cli@2 --force

# Clear Tauri cache
rm -rf src-tauri/target
```

#### LLM API Issues
```bash
# Test with offline mode
LLM_OFFLINE=1 npm run analyze:opening -- data/manuscript.txt out/test

# Check API key configuration
echo $ANTHROPIC_API_KEY
```

### Getting Help
1. Check existing issues in the repository
2. Review documentation in `docs/` folder
3. Test with `LLM_OFFLINE=1` to isolate LLM issues
4. Use `DEBUG=1` for detailed logging

## Contributing

### Development Workflow
1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make changes with tests
4. Run quality checks: `npm run typecheck && npm run lint && npm test`
5. Submit pull request

### Code Standards
- Use TypeScript for all new code
- Follow existing naming conventions
- Add tests for new functionality
- Update documentation for API changes
- Keep commits focused and atomic

## Deployment

### Local Testing
```bash
# Test production build locally
npm run build
npm run tauri:build -- --no-bundle

# Run the built application
./src-tauri/target/release/smairs
```

### Distribution
```bash
# Create distributable packages
npm run build
npm run tauri:build

# Output packages will be in:
# - macOS: src-tauri/target/release/bundle/macos/
# - Windows: src-tauri/target/release/bundle/msi/
# - Linux: src-tauri/target/release/bundle/appimage/
```

## Security Considerations

### API Keys
- Never commit API keys to version control
- Use environment variables or secure key management
- Rotate keys regularly
- Limit API key permissions to required operations

### Local Data
- Manuscript files are processed locally
- No data is sent to external servers (except LLM APIs)
- Cache files contain analysis results only
- SQLite database stores local application state

### Development Security
- Use `LLM_OFFLINE=1` for development without API keys
- Test with mock data to avoid API costs
- Clear caches regularly: `npm run cache:clear`
- Use secure coding practices for any new features

## Performance Benchmarks

### Target Metrics
- **Cold Start**: ≤ 4 seconds
- **Manuscript Open**: ≤ 800ms for 120k words
- **Search Latency**: p95 ≤ 120ms
- **Export Generation**: ≤ 30 seconds for full bundle

### Monitoring
```bash
# Run performance benchmarks
npm run perf:baseline

# Search performance testing
npm run search:benchmark
```

This setup guide covers the complete development environment for SMAIRS. Follow the prerequisites section first, then proceed with project setup and your preferred development workflow.
