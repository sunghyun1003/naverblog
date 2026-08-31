import type { ApiAutomationHistoryItem } from "./types";

// Reference rates for the connected GPT-5.6 Luna workload. The dashboard
// stores token counts rather than billing invoices, so this is intentionally
// labelled as an estimate. Cached input is priced at 10% of regular input.
const LUNA_INPUT_PER_MILLION = 0.2;
const LUNA_CACHED_INPUT_PER_MILLION = 0.02;
const LUNA_OUTPUT_PER_MILLION = 1.2;

export function estimateTokenCostUsd(item: ApiAutomationHistoryItem): number | null {
  if (!item.codex.calls) return item.workflow === "collect" ? 0 : null;
  const inputTokens = Math.max(0, item.codex.inputTokens - item.codex.cachedInputTokens);
  return (
    (inputTokens / 1_000_000) * LUNA_INPUT_PER_MILLION
    + (item.codex.cachedInputTokens / 1_000_000) * LUNA_CACHED_INPUT_PER_MILLION
    + (item.codex.outputTokens / 1_000_000) * LUNA_OUTPUT_PER_MILLION
  );
}

export function formatUsd(value: number | null): string {
  if (value === null) return "비용 기록 없음";
  return `$${value.toFixed(2)}`;
}
