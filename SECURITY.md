# Security

This is an early-release local tool, not an OS sandbox. Do not use it on a production workstation containing unrestricted credentials or sensitive client data without a separate review.

Use a private task queue, narrow allowed authors, and the inspect profile. Review every task before running and every result before publishing. Keep Claude Code current. Never put credentials in issues, logs, or bug reports.

If you suspect a local compromise, stop the extension, revoke the queue token in GitHub, stop any running Claude process, and inspect local file changes before continuing. Removing a token from VS Code does not revoke it at GitHub.

For a bug report, include a minimal synthetic example, version information, and expected behavior. Do not post exploit material containing personal data, tokens, or customer files in public issues.
