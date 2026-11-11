export interface TaskIssue {
  number: number;
  title: string;
  body: string;
  url: string;
  labels: string[];
  updatedAt: string;
  author?: string;
}

export interface IssueComment {
  id: number;
  body: string;
  createdAt: string;
  author: string;
}

export interface RunOutcome {
  ok: boolean;
  resultText: string;
  sessionId?: string;
  costUsd?: number;
  exitCode: number | null;
  errorMessage?: string;
  interrupted?: boolean;
}

export interface BridgeConfig {
  owner: string;
  repo: string;
  taskLabel: string;
  pollIntervalSeconds: number;
  projectFolder: string;
  allowedAuthors: string[];
  runMode: "inspect" | "edit";
  claudeCommand: string;
  maxResultChars: number;
}
