# Preserved standalone prototype

This branch preserves the earlier Next.js prototype, original product brief, setup notes, tests and SDK for reference. It is not the active product architecture.

The active application is the [Margined development branch](https://github.com/aroramit17/margined/tree/codex/margined-audit). Read its [build spec](https://github.com/aroramit17/margined/blob/codex/margined-audit/docs/MVP_BUILD_SPEC.md), [audit](https://github.com/aroramit17/margined/blob/codex/margined-audit/docs/MVP_REUSE_AUDIT.md) and [hardening report](https://github.com/aroramit17/margined/blob/codex/margined-audit/docs/INGESTION_HARDENING.md).

The two codebases have independent Git histories in this repository's separate branches. To reconstruct the local workspace layout, clone this archive branch, then clone the active development branch into a `margined/` subdirectory. That subdirectory is deliberately ignored by the outer archive repository.

Source files and safe configuration examples are preserved. Live `.env.local` files, credentials, dependencies and generated build output remain local and excluded from Git.
