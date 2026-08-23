# Security and privacy

## Supported surface

Desktop Companion Kit is a local macOS and Windows app. Page sight activates only when the user enables the visible toggle.

- macOS uses Automation for content-level active-tab sight.
- Windows uses local PowerShell and Win32 APIs for browser-title sight only.
- Watch With Me is macOS-only, separately opt-in, and restricted to active Hulu/Netflix window sources.

## Invariants

- Page sight defaults off.
- Page content stays local in the bundled implementation.
- Watch With Me has no display/whole-desktop fallback and refuses non-Hulu/Netflix URLs before asking macOS for capture sources.
- Watch media may leave the machine only through an explicitly enabled local vision-bridge configuration. Temporary clips are mode `0600` and deleted in a `finally` path.
- Visual descriptions are untrusted data. Prompt-like text in a frame cannot issue commands to the companion or widen capture scope.
- Windows does not enable remote debugging or install a browser extension.
- The renderer has no Node access and runs with context isolation and sandboxing.
- Character profile values are sanitized before entering the renderer.
- Scheduled lines enter through a bounded local JSONL inbox.
- Private profile/model files and application artifacts are ignored by Git.
- Private vision configuration is ignored by Git. The public bridge is disabled by default.

Report vulnerabilities privately to the repository maintainer. Do not include real browser content, credentials, or personal files in a report.
