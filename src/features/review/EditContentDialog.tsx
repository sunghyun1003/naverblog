import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";

const minimumTitleLength = 5;
const minimumBodyLength = 20;

export function EditContentDialog({
  open,
  busy = false,
  initialTitle,
  initialBody,
  onClose,
  onSave,
}: {
  open: boolean;
  busy?: boolean;
  initialTitle: string;
  initialBody: string;
  onClose: () => void;
  onSave: (input: { title: string; body: string; reason: string | null }) => Promise<void>;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle);
    setBody(initialBody);
    setReason("");
  }, [initialBody, initialTitle, open]);

  const normalizedTitle = title.trim();
  const normalizedBody = body.trim();
  const valid = normalizedTitle.length >= minimumTitleLength && normalizedBody.length >= minimumBodyLength;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid || busy) return;
    await onSave({ title: normalizedTitle, body: normalizedBody, reason: reason.trim() || null });
  };

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      title="원고 직접 수정"
      description="수정본은 새 버전으로 저장되고 검토 대기 상태로 돌아갑니다. 기존 자동 생성 원고와 이력은 보존됩니다."
      footer={(
        <>
          <Button type="button" onClick={onClose} disabled={busy}>취소</Button>
          <Button type="submit" form="edit-content-form" variant="brand" disabled={!valid || busy}>
            {busy ? "저장 중" : "수정 저장"}
          </Button>
        </>
      )}
    >
      <form id="edit-content-form" className="edit-content-form" onSubmit={submit}>
        <label className="field">
          <span className="field__label">제목</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            minLength={minimumTitleLength}
            maxLength={120}
            disabled={busy}
            data-modal-initial-focus="true"
          />
          <span className="field__helper">{normalizedTitle.length}/120자</span>
        </label>
        <label className="field">
          <span className="field__label">본문</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            minLength={minimumBodyLength}
            maxLength={100_000}
            rows={14}
            disabled={busy}
          />
          <span className="field__helper">마크다운 형식을 유지하며 필요한 문장만 수정하세요. {normalizedBody.length.toLocaleString()}자</span>
        </label>
        <label className="field">
          <span className="field__label">수정 메모 <small>(선택)</small></span>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={3} disabled={busy} placeholder="예: ‘조건’ 대신 보장 범위와 특약을 구체적으로 표현" />
        </label>
      </form>
    </Modal>
  );
}
