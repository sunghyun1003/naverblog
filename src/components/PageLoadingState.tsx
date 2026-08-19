interface PageLoadingStateProps {
  label: string;
  compact?: boolean;
}

export function PageLoadingState({ label, compact = false }: PageLoadingStateProps) {
  return (
    <div className={`page-loading${compact ? " page-loading--compact" : ""}`} role="status" aria-live="polite">
      <span className="page-loading__spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
