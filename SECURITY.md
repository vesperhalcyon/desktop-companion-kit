# Security and privacy

## Supported surface

Desktop Companion Kit is a local macOS app. Page sight uses macOS Automation to read the active browser tab only when the user enables the visible toggle.

## Invariants

- Page sight defaults off.
- Page content stays local in the bundled implementation.
- The renderer has no Node access and runs with context isolation and sandboxing.
- Character profile values are sanitized before entering the renderer.
- Scheduled lines enter through a bounded local JSONL inbox.
- Private profile files and application artifacts are ignored by Git.

Report vulnerabilities privately to the repository maintainer. Do not include real browser content, credentials, or personal files in a report.
