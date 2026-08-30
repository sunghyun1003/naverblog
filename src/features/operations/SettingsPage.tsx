import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { getAutomationSettings, getCapabilities, updateAutomationSettings } from "../../api/client";
import type { ApiAutomationFrequency, ApiAutomationSchedule, ApiAutomationSettings, ApiCapabilities } from "../../api/types";
import { readRuntimeCache, writeRuntimeCache } from "../../api/runtimeCache";
import { Button } from "../../components/Button";
import { PageLoadingState } from "../../components/PageLoadingState";

const labels: Record<string, string> = {
  ai: "Codex 원고 생성",
  naverSearch: "네이버 블로그 수집",
  automation: "GitHub Actions",
  publisher: "네이버 복사용 발행 패키지",
  database: "운영 데이터 저장",
};

const integrationOrder = ["ai", "naverSearch", "publisher", "database", "automation"];
const weekdayLabels = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
const defaultSettings: ApiAutomationSettings = {
  schemaVersion: 1,
  timezone: "Asia/Seoul",
  collection: { enabled: true, frequency: "daily", time: "06:30", weekday: 1 },
  generation: { enabled: true, frequency: "daily", time: "07:00", weekday: 1, count: 1 },
};

function ScheduleFields({ value, onChange, count, onCountChange }: {
  value: ApiAutomationSchedule;
  onChange: (value: ApiAutomationSchedule) => void;
  count?: number;
  onCountChange?: (value: number) => void;
}) {
  const change = <Key extends keyof ApiAutomationSchedule>(key: Key, next: ApiAutomationSchedule[Key]) => onChange({ ...value, [key]: next });
  return (
    <div className={`automation-setting ${value.enabled ? "" : "automation-setting--disabled"}`}>
      <label className="automation-toggle"><input type="checkbox" checked={value.enabled} onChange={(event) => change("enabled", event.target.checked)} /><span>{value.enabled ? "자동 실행 사용" : "자동 실행 중지"}</span></label>
      <label><span>주기</span><select value={value.frequency} disabled={!value.enabled} onChange={(event) => change("frequency", event.target.value as ApiAutomationFrequency)}><option value="daily">매일</option><option value="weekdays">평일</option><option value="weekly">매주</option></select></label>
      {value.frequency === "weekly" ? <label><span>요일</span><select value={value.weekday} disabled={!value.enabled} onChange={(event) => change("weekday", Number(event.target.value))}>{weekdayLabels.map((label, index) => <option value={index} key={label}>{label}</option>)}</select></label> : null}
      <label><span>시작 시각</span><input type="time" value={value.time} disabled={!value.enabled} onChange={(event) => change("time", event.target.value)} /></label>
      {count !== undefined && onCountChange ? <label><span>한 번에 생성</span><select value={count} disabled={!value.enabled} onChange={(event) => onCountChange(Number(event.target.value))}><option value={1}>1건</option><option value={2}>2건</option><option value={3}>3건</option></select></label> : null}
    </div>
  );
}

export function SettingsPage() {
  const cachedCapabilities = readRuntimeCache<ApiCapabilities>("capabilities");
  const cachedSettings = readRuntimeCache<ApiAutomationSettings>("automation:settings");
  const [capabilities, setCapabilities] = useState<ApiCapabilities | null>(cachedCapabilities);
  const [settings, setSettings] = useState<ApiAutomationSettings>(cachedSettings ?? defaultSettings);
  const [loading, setLoading] = useState(!cachedCapabilities || !cachedSettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled([getCapabilities(controller.signal), getAutomationSettings(controller.signal)]).then(([capabilityResult, settingsResult]) => {
      if (controller.signal.aborted) return;
      if (capabilityResult.status === "fulfilled") {
        setCapabilities(capabilityResult.value);
        writeRuntimeCache("capabilities", capabilityResult.value);
      }
      if (settingsResult.status === "fulfilled" && settingsResult.value.settings) {
        setSettings(settingsResult.value.settings);
        writeRuntimeCache("automation:settings", settingsResult.value.settings);
      }
      setLoading(false);
    });
    return () => controller.abort();
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const response = await updateAutomationSettings(settings);
      setSettings(response.settings);
      writeRuntimeCache("automation:settings", response.settings);
      setMessage("자동 실행 설정을 저장했습니다. 다음 예약부터 적용됩니다.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "자동 실행 설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="operations-page">
      <header className="operations-heading"><div><h1>설정</h1><p>자동화 연결과 실행 일정을 관리하세요.</p></div></header>
      <section className="operations-section">
        <header><h2>자동화 연결</h2><p>민감한 값은 화면에서 수정하지 않고 Google Secret Manager에서 관리합니다.</p></header>
        {loading && !capabilities ? <PageLoadingState label="연동 상태를 확인하는 중입니다." compact /> : (
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
      <section className="operations-section automation-settings-section">
        <header><h2>자동 실행 설정</h2><p>Asia/Seoul 기준이며, 여러 건 생성은 OAuth 충돌을 막기 위해 10분 간격으로 직렬 실행합니다.</p></header>
        <div className="automation-setting-card"><div><strong>콘텐츠 수집</strong><small>네이버 블로그 후보와 검색어 트렌드를 갱신합니다.</small></div><ScheduleFields value={settings.collection} onChange={(collection) => setSettings((current) => ({ ...current, collection }))} /></div>
        <div className="automation-setting-card"><div><strong>원고 자동 생성</strong><small>최신 수집 자료를 이용해 이미지 포함 원고를 만듭니다.</small></div><ScheduleFields value={settings.generation} count={settings.generation.count} onCountChange={(count) => setSettings((current) => ({ ...current, generation: { ...current.generation, count } }))} onChange={(generation) => setSettings((current) => ({ ...current, generation: { ...current.generation, ...generation } }))} /></div>
        <div className="automation-setting-actions"><span className={message.includes("못했습니다") || message.includes("오류") ? "settings-message settings-message--error" : "settings-message"} role="status">{message}</span><Button variant="brand" icon={<Save size={17} />} disabled={saving} onClick={() => void save()}>{saving ? "저장 중..." : "설정 저장"}</Button></div>
      </section>
      <section className="operations-section"><header><h2>로그인</h2><p>현재는 1인 운영용 계정입니다.</p></header><div className="settings-note"><strong>carrot</strong><span>관리자 권한 · 향후 Google Workspace 로그인으로 교체 예정</span></div></section>
    </div>
  );
}
