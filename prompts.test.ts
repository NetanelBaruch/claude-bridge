import { describe, expect, it } from "vitest";
import { BRIDGE_MARKER } from "./github";
import { buildFollowupPrompt, buildTaskPrompt, formatResultComment } from "./prompts";

describe("buildTaskPrompt", () => {
  it("includes issue number, title and body", () => {
    const p = buildTaskPrompt({ number: 12, title: "Add tests", body: "Cover utils.ts", url: "u", labels: [], updatedAt: "" });
    expect(p).toContain("#12");
    expect(p).toContain("Add tests");
    expect(p).toContain("Cover utils.ts");
  });
  it("handles an empty body", () => {
    const p = buildTaskPrompt({ number: 1, title: "t", body: "  ", url: "u", labels: [], updatedAt: "" });
    expect(p).toContain("(no description provided)");
  });
});

describe("buildFollowupPrompt", () => {
  it("lists authors and bodies", () => {
    const p = buildFollowupPrompt([
      { id: 1, body: "change the color", createdAt: "", author: "alice" },
      { id: 2, body: "and bump version", createdAt: "", author: "bob" }
    ]);
    expect(p).toContain("alice: change the color");
    expect(p).toContain("bob: and bump version");
  });
});

describe("formatResultComment", () => {
  const base = { ok: true, resultText: "done thing", exitCode: 0, sessionId: "s", costUsd: 0.01 };
  it("carries the marker, status and details", () => {
    const c = formatResultComment(base as any, { issueNumber: 3, durationSeconds: 12, maxChars: 1000 });
    expect(c.startsWith(BRIDGE_MARKER)).toBe(true);
    expect(c).toContain("✅ Done");
    expect(c).toContain("done thing");
    expect(c).toContain("`s`");
    expect(c).toContain("$0.0100");
  });
  it("marks failures", () => {
    const c = formatResultComment({ ...base, ok: false, errorMessage: "nope", resultText: "nope" } as any, {
      issueNumber: 3,
      durationSeconds: 1,
      maxChars: 1000
    });
    expect(c).toContain("❌ Failed");
  });
  it("marks interruptions", () => {
    const c = formatResultComment({ ...base, interrupted: true } as any, { issueNumber: 3, durationSeconds: 1, maxChars: 1000 });
    expect(c).toContain("⏹️ Stopped");
  });
  it("truncates long results", () => {
    const long = "x".repeat(5000);
    const c = formatResultComment({ ...base, resultText: long } as any, { issueNumber: 3, durationSeconds: 1, maxChars: 100 });
    expect(c).toContain("truncated");
    expect(c.length).toBeLessThan(600);
  });
});
