import { useEffect, useState } from "react";
import { getCapabilities } from "../../api/client";
import type { ApiCapabilities } from "../../api/types";
import { PageLoadingState } from "../../components/PageLoadingState";
import { readRuntimeCache, writeRuntimeCache } from "../../api/runtimeCache";

const labels: Record<string, string> = {
  ai: "Codex 원고 생성",
  naverSearch: "네이버 블로그 수집",
  automation: "GitHub Actions",
  publisher: "네이버 복사용 발행 패키지",
  database: "운영 데이터 저장",
};

const integrationOrder = ["ai", "naverSearch", "publisher", "database", "automation"];

export function SettingsPage() {
  const cached = readRuntimeCache<ApiCapabilities>("capabilities");
  const [capabilities, setCapabilities] = useState<ApiCapabilities | null>(cached);
  const [loading, setLoading] = useState(!cached);
  useEffect(() => { void getCapabilities().then((next) => { setCapabilities(next); writeRuntimeCache("capabilities", next); }).finally(() => setLoading(false)); }, []);
  return (
    <div className="operations-page">
      <header className="operations-heading"><div><h1>설정</h1><p>현재 운영 환경과 외부 연동 준비 상태를 확인하세요.</p></div></header>
      <section className="operations-section">
        <header><h2>자동화 연결</h2><p>민감한 값은 화면에서 수정하지 않고 Google Secret Manager에서 관리합니다.</p></header>
        {loading ? <PageLoadingState label="연동 상태를 확인하는 중입니다." compact /> : (
          <div className="settings-list">
            {integrationOrder.flatMap((name) => {
              const value = capabilities?.integrations[name];
              return value ? [[name, value] as const] : [];
            }).map(([name, value]) => (
              <div key={name}><div><strong>{labels[name] ?? name}</strong><small>{value.provider}</small></div><span className={value.configured ? "setting-state setting-state--on" : "setting-state"}>{value.configured ? "연결됨" : "미연동"}</span></div>
            ))}
          </div>
        )}
      </section>
      <section className="operations-section"><header><h2>자동 실행 시간</h2><p>Asia/Seoul 기준</p></header><dl className="schedule-definition"><div><dt>콘텐츠 수집</dt><dd>매일 오전 6시 30분</dd></div><div><dt>원고 생성</dt><dd>매일 오전 7시</dd></div></dl></section>
      <section className="operations-section"><header><h2>로그인</h2><p>현재는 1인 운영용 계정입니다.</p></header><div className="settings-note"><strong>carrot</strong><span>관리자 권한 · 향후 Google Workspace 로그인으로 교체 예정</span></div></section>
    </div>
  );
}
