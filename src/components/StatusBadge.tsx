import { contentStatusLabel } from "../data/content";
import type { ContentStatus } from "../types/content";

export function StatusBadge({ status }: { status: ContentStatus }) {
  return <span className={`status status--${status}`}>{contentStatusLabel[status]}</span>;
}
