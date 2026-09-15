<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Active application and GitHub preservation

The application is now the independent Margined checkout in `margined/`. Follow its `AGENTS.md` and `docs/MVP_BUILD_SPEC.md` for product work. This outer Next.js repository is the preserved prototype and workspace history only.

The user requires every completed change to be committed and pushed to GitHub. Product changes belong on the Margined development branch; edits to this outer reference repository belong on `codex/standalone-prototype-archive`. Verify the remote branch SHA after pushing. Keep secrets, local environment files, dependencies and generated output excluded. Do not force-push or merge to main just to synchronize.
