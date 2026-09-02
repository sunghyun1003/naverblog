import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { getAutomationSettings, updateAutomationSettings } from "../../api/client";
import type { ApiAutomationFrequency, ApiAutomationSchedule, ApiAutomationSettings } from "../../api/types";
import { readRuntimeCache, writeRuntimeCache } from "../../api/runtimeCache";
import { Button } from "../../components/Button";
import { PageLoadingState } from "../../components/PageLoadingState";
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
      <label className="automation-toggle"><input type="checkbox" checked={value.enabled} onChange={(event) => change("enabled", event.target.checked)} /><span>{value.enabled ? "사용" : "중지"}</span></label>
      <label><span>주기</span><select value={value.frequency} disabled={!value.enabled} onChange={(event) => change("frequency", event.target.value as ApiAutomationFrequency)}><option value="daily">매일</option><option value="weekdays">평일</option><option value="weekly">매주</option></select></label>
      {value.frequency === "weekly" ? <label><span>요일</span><select value={value.weekday} disabled={!value.enabled} onChange={(event) => change("weekday", Number(event.target.value))}>{weekdayLabels.map((label, index) => <option value={index} key={label}>{label}</option>)}</select></label> : null}
      <label><span>실행 시각</span><input type="time" value={value.time} disabled={!value.enabled} onChange={(event) => change("time", event.target.value)} /></label>
      {count !== undefined && onCountChange ? <label><span>생성 개수</span><select value={count} disabled={!value.enabled} onChange={(event) => onCountChange(Number(event.target.value))}><option value={1}>1건</option><option value={2}>2건</option><option value={3}>3건</option></select></label> : null}
    </div>
  );
}

export function SettingsPage() {
  const cachedSettings = readRuntimeCache<ApiAutomationSettings>("automation:settings");
  const [settings, setSettings] = useState<ApiAutomationSettings>(cachedSettings ?? defaultSettings);
  const [loading, setLoading] = useState(!cachedSettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void getAutomationSettings(controller.signal).then((response) => {
      if (controller.signal.aborted || !response.settings) return;
      setSettings(response.settings);
      writeRuntimeCache("automation:settings", response.settings);
    }).catch((reason) => {
      if (!controller.signal.aborted) setMessage(reason instanceof Error ? reason.message : "설정을 불러오지 못했습니다.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
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
    <div className="operations-page settings-page">
      <header className="operations-heading settings-heading" aria-hidden="true" />
      <section className="operations-section automation-settings-section">
        <header className="settings-section-heading"><div><h2>자동 실행</h2><p>수집과 원고 생성을 한 화면에서 관리합니다.</p></div><span className="settings-timezone">한국 시간 기준</span></header>
        {loading ? <PageLoadingState label="설정을 불러오는 중입니다." compact /> : null}
        {!loading ? <><div className="automation-setting-card"><div><strong>콘텐츠 수집</strong><small>네이버 블로그 후보를 모읍니다.</small></div><ScheduleFields value={settings.collection} onChange={(collection) => setSettings((current) => ({ ...current, collection }))} /></div>
        <div className="automation-setting-card"><div><strong>원고 생성</strong><small>수집된 후보를 바탕으로 원고를 만듭니다.</small></div><ScheduleFields value={settings.generation} count={settings.generation.count} onCountChange={(count) => setSettings((current) => ({ ...current, generation: { ...current.generation, count } }))} onChange={(generation) => setSettings((current) => ({ ...current, generation: { ...current.generation, ...generation } }))} /></div></> : null}
        <div className="automation-setting-actions"><span className={message.includes("실패") || message.includes("못했습니다") || message.includes("오류") || message.includes("권한") ? "settings-message settings-message--error" : "settings-message"} role="status">{message}</span><Button variant="brand" icon={<Save size={17} />} disabled={loading || saving} onClick={() => void save()}>{saving ? "저장 중..." : "설정 저장"}</Button></div>
      </section>
    </div>
  );
}
