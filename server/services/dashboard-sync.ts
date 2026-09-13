import type { AutomationRepository } from "../repositories/contracts.js";
import type { GitHubAutomationService } from "./github-automation.js";
import { draftToDetail } from "./github-content-mapper.js";
import { persistGitHubDraftSummaries } from "./github-persistence.js";

/** Called by a signed Actions callback, not on page navigation. Each call is bounded. */
export class DashboardSync {
  private pending: Promise<{ updated: number; remaining: number }> | null = null;
  constructor(private readonly repository: AutomationRepository, private readonly github: GitHubAutomationService) {}

  run() {
    if (this.pending) return this.pending;
    this.pending = this.sync().finally(() => { this.pending = null; });
    return this.pending;
  }

  private async sync(): Promise<{ updated: number; remaining: number }> {
    const { repository, github } = this;
    if (!repository.getSnapshot || !repository.saveSnapshot) throw new Error("Dashboard snapshot storage is not configured");
    const revisions = await github.draftRevisions();
    const saved = (await repository.getSnapshot<Record<string, string>>("sync:revisions"))?.value ?? {};
    const changed = Object.entries(revisions).filter(([id, revision]) => saved[id] !== revision);
    // Only rebuild a maximum of five changed draft packages per request; the
    // authenticated caller continues the next batch until remaining is zero.
    for (const [id, revision] of changed.slice(0, 5)) {
      const draft = await github.getDraft(id);
      const detail = draftToDetail(draft);
      const current = await repository.getContent(id);
      // A dashboard edit that occurred during the fetch must not be overwritten.
      if (current && Date.parse(current.updatedAt) > Date.parse(detail.content.updatedAt)) { saved[id] = revision; continue; }
      await persistGitHubDraftSummaries(repository, [draft]);
      await repository.saveSnapshot(`detail:${id}`, detail);
      saved[id] = revision;
    }
    await repository.saveSnapshot("sync:revisions", saved);
    {
      const tasks = [
        ["automation:runs", () => github.listWorkflowRuns()],
        ["automation:history", () => github.listAutomationHistory()],
        ["automation:settings", () => github.getAutomationSettings()],
        ["trends", () => github.getTrends(true)],
      ] as const;
      // Metadata is small once persisted. Keep independent successful snapshots
      // even when one upstream fails; fail the callback so Actions retries it.
      const results = await Promise.allSettled(tasks.map(async ([key, load]) => repository.saveSnapshot!(key, await load())));
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
      await repository.saveSnapshot("sync:metadata", { checkedAt: new Date().toISOString() });
    }
    const remaining = Object.entries(revisions).filter(([id, revision]) => saved[id] !== revision).length;
    return { updated: changed.length - remaining, remaining };
  }
}
