# Project instructions

## Source of truth

This Margined fork is the application codebase. Follow `docs/MVP_BUILD_SPEC.md` and the reuse matrix in `docs/MVP_REUSE_AUDIT.md`. Retain useful upstream components and make targeted extensions. The standalone Next.js prototype is archived separately; do not replace this application with it.

## Preserve every completed change on GitHub

The user explicitly requests that every change be preserved on GitHub. At each completed, reviewable work checkpoint:

1. Inspect changes and run the checks appropriate to them.
2. Commit source, migrations, tests, documentation, dependency lockfiles and required configuration to the current `codex/` development branch.
3. Push to `origin` (`aroramit17/margined`) and verify that the remote branch SHA matches local HEAD. Do this before reporting the work as complete. Commit-and-push authorization persists across turns.
4. Keep secrets, live environment files, credentials, dependency directories and generated build output out of Git. Preserve safe example configuration and setup documentation instead.
5. Do not force-push, discard unrelated work or merge to `main` merely to synchronize. If synchronization fails, keep the local commits and clearly report the unsynced state.

Use the independent Git checkout in this directory for product work. Changes to the archived prototype outside this checkout belong on its archive branch, not in the active application tree.
