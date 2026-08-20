import type { OpenIssue } from "../core/types";

export interface GiteaConfig {
  baseUrl: string;
  owner: string;
  repo: string;
  token: string;
}

export interface CreateIssueInput {
  title: string;
  body: string;
  labels: string[];
}

export interface CreatedIssue {
  number: number;
  url: string;
}

// Narrow port the orchestrator depends on - the real implementation calls the Gitea API,
// tests inject a fake that records calls in memory with no network access.
export interface GiteaClient {
  listOpenIssues(): Promise<OpenIssue[]>;
  createIssue(input: CreateIssueInput): Promise<CreatedIssue>;
  commentOnIssue(issueNumber: number, body: string): Promise<void>;
}

interface GiteaLabel {
  id: number;
  name: string;
}

interface GiteaIssueResponse {
  number: number;
  html_url: string;
}

interface GiteaOpenIssueResponse {
  number: number;
  title: string;
  body: string | null;
}

// Real Gitea API client. Not exercised by the orchestrator's fake-based tests by design -
// see .scratch/bug-triage-cli/spec.md "Testing Decisions" for the chosen seam.
export class GiteaApiClient implements GiteaClient {
  // Gitea's create-issue API takes label IDs, not names, so cache the repo's name->id map.
  private labelIdsByName: Map<string, number> | undefined;

  constructor(private readonly config: GiteaConfig) {}

  async listOpenIssues(): Promise<OpenIssue[]> {
    // type=issues excludes pull requests, which Gitea otherwise returns from the same endpoint.
    const issues = await this.request<GiteaOpenIssueResponse[]>(
      "GET",
      // TODO: add pagination in real prod environment, but that would require more complex dedupe logic.
      "/issues?state=open&type=issues&limit=50",
    );
    return issues.map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body ?? "",
    }));
  }

  async createIssue(input: CreateIssueInput): Promise<CreatedIssue> {
    const labelIds = await this.resolveLabelIds(input.labels);
    const issue = await this.request<GiteaIssueResponse>("POST", "/issues", {
      title: input.title,
      body: input.body,
      labels: labelIds,
    });
    return { number: issue.number, url: issue.html_url };
  }

  async commentOnIssue(issueNumber: number, body: string): Promise<void> {
    await this.request("POST", `/issues/${issueNumber}/comments`, { body });
  }

  private async resolveLabelIds(names: string[]): Promise<number[]> {
    if (!this.labelIdsByName) {
      const labels = await this.request<GiteaLabel[]>("GET", "/labels");
      this.labelIdsByName = new Map(labels.map((label) => [label.name, label.id]));
    }

    return names.map((name) => {
      const id = this.labelIdsByName!.get(name);
      if (id === undefined) {
        throw new Error(`Unknown Gitea label "${name}" - has the repo been seeded?`);
      }
      return id;
    });
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.config.baseUrl}/api/v1/repos/${this.config.owner}/${this.config.repo}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `token ${this.config.token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(
        `Gitea API ${method} ${path} failed: ${response.status} ${await response.text()}`,
      );
    }

    return (await response.json()) as T;
  }
}
