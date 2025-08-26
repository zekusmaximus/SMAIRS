# Security Policy

## Scope

Local desktop application analyzing a single manuscript with LLM integration. Primary risks: manuscript content leakage, API key exposure, LLM prompt injection, dependency vulnerabilities, and local data persistence issues.

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

## Data Protection

- **Manuscript Storage**: Local-only in `data/` directory (gitignored, encrypted at rest via OS).
- **Analysis Results**: Generated reports and caches in `out/` and `.smairs/` (gitignored).
- **LLM Interactions**: All API calls are outbound-only with explicit user consent.
- **No Data Collection**: No telemetry, analytics, or usage tracking.

## LLM Security Considerations

- **Prompt Injection Protection**: Input sanitization and validation before LLM calls.
- **Content Filtering**: No sensitive manuscript content in system prompts.
- **Rate Limiting**: Built-in request queuing and exponential backoff.
- **Mock Mode**: Complete offline mode (`LLM_OFFLINE=1`) for development.
- **Provider Isolation**: Multi-provider support with capability profile abstraction.

## Dependencies

- **Rust Dependencies**: Regular `cargo audit` checks for vulnerabilities.
- **Node.js Dependencies**: `npm audit` integration in CI pipeline.
- **Tauri Framework**: Stay current with security updates.
- **LLM SDKs**: Use official provider SDKs with latest security patches.

## Local Data Security

- **SQLite Database**: Encrypted storage for scene/reveal metadata.
- **File Permissions**: Restrictive permissions on manuscript and cache files.
- **Memory Safety**: Rust backend prevents buffer overflows and memory corruption.
- **No Network Exposure**: Localhost-only operation, no network services.

## Threat Model

### In Scope
- Local manuscript content exposure through UI or file system
- API key leakage through logs, environment, or memory dumps
- LLM prompt injection affecting analysis quality
- Dependency vulnerabilities in Rust/Node.js ecosystem
- Local data persistence corruption or unauthorized access

### Out of Scope
- Multi-user server scenarios or networked collaboration
- Cloud infrastructure attacks (no cloud components)
- Physical hardware tampering
- Supply chain attacks on LLM providers themselves

## Security Testing

- **Dependency Scanning**: Automated vulnerability detection in CI
- **Static Analysis**: CodeQL and clippy for security issues
- **Memory Safety**: Rust's ownership system prevents common vulnerabilities
- **Input Validation**: Comprehensive validation of manuscript and analysis inputs
