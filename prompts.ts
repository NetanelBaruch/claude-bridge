import { IssueComment, RunOutcome, TaskIssue } from "./types";
import { BRIDGE_MARKER } from "./github";

export function buildTaskPrompt(issue: TaskIssue): string {
  return [
    `You are running as a local coding agent on the maintainer's machine, inside the project folder.`,
    `Work on the following task from GitHub issue #${issue.number}: "${issue.title}".`,
    ``,
    issue.body.trim() || "(no description provided)",
    ``,
    `When done, reply with a concise summary of what you changed or found. The summary will be shown locally for review before any upload.`
  ].join("\n");
}

export function buildFollowupPrompt(comments: IssueComment[]): string {
  const text = comments.map((c) => `${c.author || "commenter"}: ${c.body}`).join("\n\n");
  return [
    `Follow-up on the task you just completed. New comments on the issue:`,
    ``,
    text,
    ``,
    `Respond to the follow-up. If it asks for changes, make them. Reply with a concise summary for the issue.`
  ].join("\n");
}

export function formatResultComment(
  outcome: RunOutcome,
  meta: { issueNumber: number; durationSeconds: number; maxChars: number }
): string {
  const status = outcome.interrupted ? "⏹️ Stopped" : outcome.ok ? "✅ Done" : "❌ Failed";
  let body = outcome.resultText || outcome.errorMessage || "(no output)";
  if (body.length > meta.maxChars) {
    body = body.slice(0, meta.maxChars) + `\n\n…(truncated, ${body.length - meta.maxChars} more characters)`;
  }
  const details: string[] = [];
  details.push(`duration ${Math.round(meta.durationSeconds)}s`);
  if (outcome.costUsd !== undefined) details.push(`reported cost $${outcome.costUsd.toFixed(4)} (client-side estimate)`);
  if (outcome.sessionId) details.push(`session \`${outcome.sessionId}\``);
  return [
    BRIDGE_MARKER,
    `### ${status} - Claude Bridge`,
    ``,
    body,
    ``,
    `---`,
    `_${details.join(" · ")}_`
  ].join("\n");
}
