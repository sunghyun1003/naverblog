import { useEffect, useId, useState, type FormEvent } from "react";
import { getComplianceFeedback, saveComplianceFeedback } from "../../api/client";
import { Button } from "../../components/Button";
import { feedbackScopes, suggestFeedbackScope, type ComplianceFeedback, type ComplianceFeedbackDocument, type ComplianceFeedbackInput } from "../../../shared/compliance-feedback";
import "./compliance-feedback.css";

const fields = (item: ComplianceFeedbackInput): ComplianceFeedbackInput => ({ excerpt: item.excerpt, guidance: item.guidance,
  replacement: item.replacement, scope: item.scope, kind: item.kind, active: item.active });
const blank = (topic: string): ComplianceFeedbackInput => ({ excerpt: "", guidance: "", replacement: "",
  scope: suggestFeedbackScope(topic), kind: "wording", active: true });

export default function ComplianceFeedbackPanel({ contentId, topic }: { contentId: string; topic: string }) {
  const fieldId = useId();
  const [document, setDocument] = useState<ComplianceFeedbackDocument | null>(null);
  const [form, setForm] = useState(() => blank(topic));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newId, setNewId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getComplianceFeedback(contentId, controller.signal).then(setDocument).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "피드백을 불러오지 못했습니다.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [contentId]);

  async function reload() {
    setLoading(true); setError("");
    try { setDocument(await getComplianceFeedback(contentId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "피드백을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }
  function reset() { setForm(blank(topic)); setEditingId(null); setNewId(crypto.randomUUID()); }
  async function save(id: string, input: ComplianceFeedbackInput, resetForm: boolean) {
    if (!document || busy || loading) return;
    setBusy(true); setError(""); setMessage("");
    try {
      setDocument(await saveComplianceFeedback(contentId, id, document.revision, input));
      if (resetForm) reset();
      setMessage(input.active ? "저장했습니다. 이후 새로 시작하는 원고에서 적용 범위에 맞춰 참고합니다. 기존 원고는 변경하지 않습니다." : "적용을 중지했습니다. 기록은 보존되며 이후 신규 원고에서는 제외됩니다.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "저장하지 못했습니다. 입력은 유지됩니다."); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void save(editingId ?? newId, form, true); }
  function edit(item: ComplianceFeedback) { setForm(fields(item)); setEditingId(item.id); setMessage(""); }
  const disabled = busy || loading || !document;

  return <section className="compliance-feedback" aria-label="준법심의 피드백">
    <header><div><h2>준법심의 피드백</h2><p>심의에서 받은 표현 수정 의견을 기록하세요. 같은 보종과 공통 피드백을 신규 원고 작성·말투 보정에 참고합니다.</p></div>
      <Button type="button" size="small" disabled={busy || loading} onClick={() => void reload()}>목록 새로고침</Button></header>
    <p className="compliance-feedback__notice">이 기록은 심의 승인 처리가 아닙니다. 기존 원고·Word 파일은 자동 수정하지 않습니다. 개인정보·고객 정보는 입력하지 마세요.</p>
    {error ? <div role="alert" className="compliance-feedback__error">{error}</div> : null}
    {message ? <p role="status" className="compliance-feedback__saved">{message}</p> : null}
    {loading ? <p role="status">피드백을 불러오는 중입니다.</p> : null}
    <form onSubmit={submit}>
      <h3>{editingId ? "피드백 수정" : "피드백 추가"}</h3>
      <fieldset disabled={disabled}>
        <label><span id={`${fieldId}-excerpt`}>문제된 문장·단어</span><textarea aria-labelledby={`${fieldId}-excerpt`} required maxLength={500} rows={2} value={form.excerpt} placeholder="심의에서 지적받은 원문을 입력하세요."
          onChange={event => setForm({ ...form, excerpt: event.target.value })} /></label>
        <label><span id={`${fieldId}-guidance`}>받은 피드백</span><textarea aria-labelledby={`${fieldId}-guidance`} required minLength={3} maxLength={1000} rows={3} value={form.guidance} placeholder="수정 이유와 적용 조건을 함께 적으면 유사 표현에도 도움이 됩니다."
          onChange={event => setForm({ ...form, guidance: event.target.value })} /></label>
        <label><span id={`${fieldId}-replacement`}>권장 표현 (선택)</span><textarea aria-labelledby={`${fieldId}-replacement`} maxLength={500} rows={2} value={form.replacement} placeholder="심의에서 제안한 대체 표현이 있으면 입력하세요."
          onChange={event => setForm({ ...form, replacement: event.target.value })} /></label>
        <div className="compliance-feedback__options">
          <label>적용할 보종<select value={form.scope} onChange={event => setForm({ ...form, scope: event.target.value as ComplianceFeedbackInput["scope"] })}>
            {Object.entries(feedbackScopes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label>피드백 유형<select value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value as ComplianceFeedbackInput["kind"] })}>
            <option value="wording">표현·조건 수정</option><option value="avoid">사용하지 않을 표현</option>
          </select></label>
        </div>
        <label className="compliance-feedback__check"><input type="checkbox" checked={form.active} onChange={event => setForm({ ...form, active: event.target.checked })} />앞으로 생성할 원고에 반영</label>
        <div className="compliance-feedback__actions"><Button type="submit" variant="brand">{busy ? "저장 중…" : editingId ? "수정 저장" : "피드백 저장"}</Button>
          {editingId ? <Button type="button" onClick={reset}>수정 취소</Button> : null}</div>
      </fieldset>
    </form>
    <h3>이 원고의 피드백 {document?.items.length ?? 0}개</h3>
    {!loading && document?.items.length === 0 ? <p>아직 등록된 피드백이 없습니다.</p> : null}
    {[...(document?.items ?? [])].reverse().map(item => <article key={item.id} className="compliance-feedback__item">
      <div className="compliance-feedback__meta"><strong>{item.active ? "신규 원고 반영" : "적용 중지"}</strong><span>{feedbackScopes[item.scope]} · {item.kind === "avoid" ? "사용하지 않을 표현" : "표현·조건 수정"}</span></div>
      <blockquote>{item.excerpt}</blockquote><p>{item.guidance}</p>
      {item.replacement ? <p><strong>권장 표현</strong><br />{item.replacement}</p> : null}
      <small>원고 v{item.contentVersion} 기준 · {new Date(item.updatedAt).toLocaleDateString("ko-KR")} 수정</small>
      <div className="compliance-feedback__actions"><Button type="button" size="small" disabled={disabled} onClick={() => edit(item)}>피드백 수정</Button>
        <Button type="button" size="small" disabled={disabled || editingId === item.id} onClick={() => void save(item.id, { ...fields(item), active: !item.active }, false)}>{item.active ? "적용 중지" : "다시 적용"}</Button></div>
    </article>)}
  </section>;
}
