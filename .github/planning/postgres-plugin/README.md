# PostgreSQL Plugin Migration — Phase Docs Index

**Master Plan:** [postgres-plugin-migration-alt.md](../postgres-plugin-migration-alt.md)

## Phase Documents

| Phase | Document | Status |
| ----- | -------- | ------ |
| Prerequisites | [00-prerequisites.md](./00-prerequisites.md) | ✅ Complete (PR #576) |
| Phase 0 | [01-phase-0-baseline-tests.md](./01-phase-0-baseline-tests.md) | ✅ Complete |
| Phase 1 | [02-phase-1-plugin-build.md](./02-phase-1-plugin-build.md) | Planning |
| Phase 2 | [03-phase-2-issue-16.md](./03-phase-2-issue-16.md) | Planning |
| Phase 3 | [04-phase-3-deprecate-builtin.md](./04-phase-3-deprecate-builtin.md) | Planning |

## Checkpoints & Release Gates

| Checkpoint | When | Stakeholders | Ship? |
| ---------- | ---- | ------------ | ----- |
| CP-1 | After Prerequisites merged | Core team review | No (internal only) |
| CP-2 | After Phase 0 complete | Core team + QA | No (test infra only) |
| CP-3 | Phase 1 at 25/55 tests green | Core team sync | No (progress check) |
| CP-4 | Phase 1 at 55/55 tests green | Core team + QA | **Yes — beta release** |
| CP-5 | After Phase 2 features complete | Core team + community | **Yes — stable release** |
| CP-6 | Phase 3 decision | Full team consensus | Depends on decision |
