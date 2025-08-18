# Security Policy

## Scope
Local desktop application analyzing a single manuscript. Primary risks: leakage of manuscript text, exposure of API keys, dependency vulnerabilities.

## Reporting a Vulnerability
1. Do **not** open a public issue for undisclosed vulnerabilities.
2. Send a private report via GitHub security advisory or direct email to the maintainer (add contact when available).
3. Include: description, reproduction steps, potential impact, suggested mitigation.

## Handling
1. Triage & confirm within 5 business days.
2. Fix & prepare patch (avoid leaking sensitive info in commit messages).
3. Publish advisory once patch released.

## Secret Management
- Never commit `.env` files or keys.
- Use environment variables & OS keychain.
- API keys limited to LLM providers; no persistent remote storage.

## Data Protection
- Manuscript stored locally in `data/` (gitignored)
- Generated analyses & reports in `out/` (gitignored)

## Dependencies
- Keep Rust & JS deps updated (use `pnpm audit` / `cargo audit` in future).

## Out of Scope
Threat models involving multi-user servers or networked collaboration.
