# Contributing Guide

This project is a focused, single-use application. Scope discipline is essential. Please read before opening a Pull Request.

## Principles
- Single manuscript, single submission cycle
- Optimize opening selection + minimal precise revisions
- Local-first, privacy-preserving
- Maintain performance & anchor stability

## Workflow
1. Create a branch from `main` using `feat/`, `fix/`, `chore/`, or `docs/` prefixes.
2. Keep changes atomic. One logical concern per PR.
3. Update or add docs (`docs/*`) when design or contracts change.
4. Add/adjust tests for any behavioral change (once test harness implemented).
5. Ensure no secrets or manuscript text are included.

## Commit Message Convention (lightweight)
`<type>(optional scope): <short imperative summary>`
Types: feat, fix, chore, docs, refactor, test, perf.

## Definition of Ready (DoR)
- Problem & rationale documented
- Acceptance criteria enumerated
- Non-negotiables unaffected or explicitly justified

## Definition of Done (DoD)
- Implementation + tests green
- Contracts & runbooks updated
- Performance budgets not regressed
- No unhandled promise rejections / console warnings
- Anchors & invariants preserved

## PR Checklist (initial)
- [ ] Problem statement included
- [ ] Solution summary
- [ ] Tests added/updated (future)
- [ ] Docs updated
- [ ] No secrets / PII
- [ ] Performance unaffected or improved

## Architectural Changes
Open an issue labeled `design` first; include motivation, alternatives, impact.

## Questions / Discussion
Use GitHub Issues; tag with `question` or `discussion`.

## License
By contributing you agree your work is licensed under the MIT License.
