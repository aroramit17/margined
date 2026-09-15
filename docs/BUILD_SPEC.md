# Active build specification

**First clone and audit Margined. Produce a reuse-vs-rebuild matrix before writing any new application code.**

The product's source code is the [Margined fork](https://github.com/aroramit17/margined), in the independent local Git checkout at `margined/` under the workspace root.

- [Completed reuse audit and matrix](../margined/docs/MVP_REUSE_AUDIT.md)
- [Active Margined-first build specification](../margined/docs/MVP_BUILD_SPEC.md)
- [Original product brief](MVP_BRIEF.md), retained as product requirements and historical context

The earlier standalone Next.js scaffold and its live-setup instructions are superseded. Preserve useful prototype work for selective reuse; make future application changes inside Margined. OpenLIT is a secondary infrastructure source only if a concrete instrumentation or telemetry limitation warrants it.
