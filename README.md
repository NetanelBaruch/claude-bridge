# Claude Bridge

A local-first VS Code extension that turns GitHub issues into reviewed Claude Code tasks. Open-source, MIT-licensed, and not affiliated with Anthropic, GitHub, or Microsoft.

GitHub task -> local task preview -> your approval -> Claude Code in the selected project -> local result review -> optional GitHub comment.

## What it does

- Reads open issues with a chosen label from one task-queue repository.
- Accepts tasks and comments only from your allowed GitHub authors. By default, only the token owner's login is accepted.
- Shows the exact task snapshot, folder, CLI executable, and tool profile before you approve a run. Rechecks the task after approval; changes invalidate approval.
- Runs Claude Code locally, including access to uncommitted project files. It does not join a currently open Claude chat.
- Shows results in an editable local document. Nothing is uploaded until you separately approve the reviewed document.
- Supports explicit follow-up comments with the session ID saved by a previous bridge run.

This is an **early release**, not a security sandbox or a real-time remote desktop. Nothing executes merely because someone creates an issue.

## Install

Download the `.vsix` release asset, then use VS Code -> Extensions -> `...` -> **Install from VSIX**. Alternatively:

```sh
code --install-extension path/to/downloaded-file.vsix
```

Requirements:

- Local desktop VS Code 1.95 or newer. Remote/WSL windows are rejected in this release.
- Claude Code installed, locally authenticated, and on your PATH, or configured with an absolute executable path. Version 2.1.259+ and the required safety flags must be present; the extension checks both before running.
- A trusted local workspace. Restricted Mode blocks the extension.
- A dedicated **private** GitHub task-queue repository. Keep the public source repository separate from private task traffic.

Your CLI's configured provider/login determines usage and billing. The extension cannot guarantee subscription coverage or a dollar cap. Reported costs are client estimates, not bills. Each run has a 12-turn limit and ten-minute timeout.

## Setup

1. Create a fine-grained GitHub PAT restricted to the queue repository, with **Issues: read and write**. GitHub includes basic metadata read access. Do not grant Contents, Administration, or broad account scopes.
2. Run **Claude Bridge: Set GitHub Token** in VS Code's Command Palette. Enter the token only in that local password input. It is stored in VS Code SecretStorage, not project files. **Clear GitHub Token** removes it; revoke it at GitHub when no longer needed.
3. In **User Settings**, set `claudeBridge.owner` and `claudeBridge.repo` to the private queue. Repository `.vscode/settings.json` cannot override bridge settings.
4. Open the local project folder, or set an absolute `claudeBridge.projectFolder` in User Settings.
5. Create the queue label `claude-task`. Create an issue with that label and a clear description.
6. Click the status bar or run **Claude Bridge: Check for Tasks Now**. Choose a task, inspect the full preview, and approve only if the folder, author, profile, and instructions are correct.

Background checks only update pending status. They never start a run or automatically approve an upload. The default check cadence is five minutes; the minimum is one minute.

## Tool profiles

| Profile | Available built-in tools | Default |
| --- | --- | --- |
| `inspect` | Read, Glob, Grep | Yes |
| `edit` | Read, Edit, Write | No |

Neither profile exposes Bash, web tools, or MCP tools. The inspect profile can read files and discover them with Glob and Grep, but cannot change anything. Editing tasks can change files, but builds/tests that need shell commands must be run separately by you. The extension uses `--tools` for actual tool restriction, not merely `--allowedTools` auto-approval. Restricted mode confines built-in file tools to working directories according to Claude Code's rules. Safe mode suppresses ordinary project/user customizations; managed policies may still apply. This reduces risk but **is not OS-level isolation**.

If the installed CLI does not support required flags, the bridge fails closed. It never retries with weaker permissions.

## Results and follow-ups

After a run, a local result document opens. Review and edit it before choosing **Publish Reviewed Document**. The entire current document is sent to the displayed queue issue. Choose **Keep Local** to upload nothing.

Only final JSON result text is shown; raw stderr and malformed stdout are not uploaded. Local checkpoints store session IDs and processed comment IDs, not result bodies. If VS Code closes before an upload, the bridge does not rerun the completed task automatically. Unsaved result documents should be saved locally if needed.

Add an allowed author's follow-up comment to continue a task. Comments already approved are checkpointed, while new comments arriving during a run remain pending. A changed issue body alone does not rerun a completed task: add a follow-up comment or create a new issue.

There is one run per project folder across bridge windows. An interrupted/crashed host may leave a local lock file; inspect whether a process is still running before manually removing the lock under the extension's global storage. The bridge does not auto-steal locks.

## Security boundaries

- An allowed author can still submit a dangerous prompt. Author allowlisting is not a substitute for reviewing the full task.
- HTML in task previews is escaped, scripts are disabled, and a restrictive Content Security Policy prevents active content.
- Task text goes through stdin to an executable with `shell: false`, never through shell interpolation.
- Local project context is sent to the Claude provider selected by your CLI. Project secrets may still be readable if they are inside accessible folders. Use a clean project copy with secrets removed. The bridge does not promise secret detection or redact every secret.
- A result can expose private project data. Review every line before uploading, and prefer a dedicated private queue. The public source repo is not a safe destination for customer work.
- The token is not passed into the Claude child process. Inherited GitHub token environment variables are removed. Claude's own configured authentication is used.
- Stop Current Run sends an interrupt, followed by a forced stop after three seconds if needed. Process-group cancellation is implemented on macOS/Linux; Windows descendant-process cleanup is not verified.
- The GitHub client uses request timeouts and surfaces rate-limit failures. Large queues (50+ open tasks) or threads (100+ comments) fail with an instruction to narrow/split them rather than silently dropping context.

## Settings

All are User Settings; workspace overrides are ignored.

| Setting | Default |
| --- | --- |
| `claudeBridge.owner`, `claudeBridge.repo` | empty |
| `claudeBridge.taskLabel` | `claude-task` |
| `claudeBridge.allowedAuthors` | empty = authenticated token owner |
| `claudeBridge.projectFolder` | first workspace folder |
| `claudeBridge.runMode` | `inspect` |
| `claudeBridge.claudeCommand` | `claude` |
| `claudeBridge.pollIntervalSeconds` | `300` (minimum `60`) |
| `claudeBridge.maxResultChars` | `50000` maximum |

## Build and checks

```sh
npm install
npm run compile
npm test
npm run package
```

Tests cover author restrictions, approval snapshots, HTML escaping, queue/project isolation, shell-injection handling, child-process cancellation using a fake CLI, parser failures, and result formatting. An extension-host smoke test verifies activation, registered commands, queue preview rendering, and declined approval without runs/uploads using dummy credentials and a mocked GitHub response.

Real GitHub transport, real Claude authentication, actual model behavior, install on your machine, and Windows/macOS-specific behavior still require end-to-end verification. The smoke test does not spend Claude credits or access a user's projects.

Official references:
- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/cli-reference
- https://code.visualstudio.com/api/references/vscode-api

## License

MIT. See LICENSE.
