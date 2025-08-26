# Security Policy

## Scope

Local desktop application for manuscript analysis with LLM integration. Primary risks include manuscript content leakage, API key exposure, LLM prompt injection, dependency vulnerabilities, local data persistence issues, and export-related data handling.

## Reporting a Vulnerability

1. Do **not** open a public issue for undisclosed vulnerabilities.
2. Send a private report via GitHub security advisory or direct email to the maintainer (add contact when available).
3. Include: description, reproduction steps, potential impact, suggested mitigation.

## Handling

1. Triage & confirm within 5 business days.
2. Fix & prepare patch (avoid leaking sensitive info in commit messages).
3. Publish advisory once patch released.

## Secret Management

- Never commit `.env` files or API keys.
- Use environment variables & OS keychain for LLM provider credentials.
- API keys limited to Anthropic, OpenAI, and Google (Gemini) providers.
- No persistent remote storage or cloud sync.
- Secure handling of API keys in provider factories and retry mechanisms.

## Data Protection

- **Manuscript Storage**: Local-only in `data/` directory (gitignored, encrypted at rest via OS).
- **Analysis Results**: Generated reports, caches, and exports in `out/`, `.smairs/`, and export directories (gitignored).
- **LLM Interactions**: All API calls are outbound-only with explicit user consent, including caching and retry logic.
- **Export Features**: Secure handling of submission bundles, synopsis generation, and patch application without exposing sensitive data.
- **Search and Version Management**: Local indexing and versioning with no external data sharing.
- **No Data Collection**: No telemetry, analytics, or usage tracking.

## LLM Security Considerations

- **Prompt Injection Protection**: Input sanitization and validation before LLM calls, including bridge generation and refinement.
- **Content Filtering**: No sensitive manuscript content in system prompts; structured prompts for analysis.
- **Rate Limiting**: Built-in request queuing, exponential backoff, and cost optimization.
- **Mock Mode**: Complete offline mode (`LLM_OFFLINE=1`) for development and testing.
- **Provider Isolation**: Multi-provider support with capability profile abstraction and provider-specific security measures.
- **Caching and Bridge Management**: Secure local caching of LLM responses and bridge data to minimize API exposure.

## Dependencies

- **Rust Dependencies**: Regular `cargo audit` checks for vulnerabilities in Tauri backend.
- **Node.js Dependencies**: `npm audit` integration in CI pipeline for frontend components.
- **Tauri Framework**: Stay current with security updates; leverage Rust's memory safety.
- **LLM SDKs**: Use official provider SDKs (Anthropic, OpenAI, Google) with latest security patches.
- **Additional Libraries**: Secure handling in export tools (Pandoc), search indexing (Tantivy), and database operations.

## Local Data Security

- **SQLite Database**: Encrypted storage for scene/reveal metadata, manuscript analysis, and version history.
- **File Permissions**: Restrictive permissions on manuscript, cache, and export files.
- **Memory Safety**: Rust backend prevents buffer overflows and memory corruption.
- **No Network Exposure**: Localhost-only operation, no network services or remote APIs beyond LLM providers.
- **Job Queue and Workers**: Secure background processing without external dependencies.

## Threat Model

### In Scope
- Local manuscript content exposure through UI, file system, or export processes
- API key leakage through logs, environment, memory dumps, or provider interactions
- LLM prompt injection affecting analysis quality or export generation
- Dependency vulnerabilities in Rust/Node.js ecosystem and third-party tools
- Local data persistence corruption or unauthorized access in database or cache files
- Export-related data leakage during synopsis generation or submission bundle creation

### Out of Scope
- Multi-user server scenarios or networked collaboration
- Cloud infrastructure attacks (no cloud components)
- Physical hardware tampering
- Supply chain attacks on LLM providers themselves
- Network-based attacks on local operation

## Security Testing

- **Dependency Scanning**: Automated vulnerability detection in CI for Rust and Node.js dependencies
- **Static Analysis**: CodeQL and clippy for security issues in codebase
- **Memory Safety**: Rust's ownership system prevents common vulnerabilities
- **Input Validation**: Comprehensive validation of manuscript, analysis inputs, and export parameters
- **Integration Testing**: Security-focused tests for LLM providers, export pipelines, and data handling
