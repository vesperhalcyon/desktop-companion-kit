# Security and privacy

## Supported surface

Desktop Companion Kit is a local macOS and Windows app. Page sight activates only when the user enables the visible toggle.

- macOS uses Automation for content-level active-tab sight.
- Windows uses local PowerShell and Win32 APIs for browser-title sight only.

## Invariants

- Page sight defaults off.
- Page content stays local in the bundled implementation.
- Windows does not enable remote debugging or install a browser extension.
- The renderer has no Node access and runs with context isolation and sandboxing.
- Character profile values are sanitized before entering the renderer.
- Scheduled lines enter through a bounded local JSONL inbox.
- Private profile/model files and application artifacts are ignored by Git.

Report vulnerabilities privately to the repository maintainer. Do not include real browser content, credentials, or personal files in a report.
