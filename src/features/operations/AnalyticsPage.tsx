import { BarChart3 } from "lucide-react";

export function AnalyticsPage() {
  return (
    <div className="operations-page">
      <header className="operations-heading"><h1>성과</h1></header>
      <section className="operations-section analytics-empty">
        <BarChart3 size={30} aria-hidden="true" />
        <strong>아직 집계된 성과가 없습니다</strong>
        <span>발행한 콘텐츠의 성과 데이터가 쌓이면 이곳에 표시됩니다.</span>
      </section>
    </div>
  );
}
