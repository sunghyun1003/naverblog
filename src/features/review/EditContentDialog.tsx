import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { approvalNumber, validApprovalNumber } from "../../../shared/compliance-footer";

const minimumTitleLength = 5;
const minimumBodyLength = 20;

export function EditContentDialog({
  open,
  busy = false,
  initialTitle,
  initialBody,
  initialApprovalNumber,
  error,
  onReload,
  onClose,
  onSave,
}: {
  open: boolean;
  busy?: boolean;
  initialTitle: string;
  initialBody: string;
  initialApprovalNumber?: string;
  error?: string;
  onReload?: () => Promise<void>;
  onClose: () => void;
  onSave: (input: { title: string; body: string; reason: string | null; approvalNumber: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [reason, setReason] = useState("");
  const [approval, setApproval] = useState(() => approvalNumber(initialApprovalNumber));

  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle);
    setBody(initialBody);
    setReason("");
    setApproval(approvalNumber(initialApprovalNumber));
  }, [initialBody, initialTitle, initialApprovalNumber, open]);

  const normalizedTitle = title.trim();
  const normalizedBody = body.trim();
  const valid = normalizedTitle.length >= minimumTitleLength && normalizedBody.length >= minimumBodyLength && validApprovalNumber(approval);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid || busy) return;
    try {
      await onSave({ title: normalizedTitle, body: normalizedBody, reason: reason.trim() || null, approvalNumber: approval.trim() });
    } catch {
      // 상위 화면이 오류를 표시하고 재시도를 위해 모달을 유지한다.
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      title="원고 직접 수정"
      description="대시보드 원고를 수정합니다. 기존 생성 원고·적용 이미지·발행 기록은 유지되며, 네이버에 게시된 글은 자동으로 변경되지 않습니다. 저장 시 최신 원본과 충돌 여부를 확인합니다."
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
        {error ? <div role="alert"><p>{error}</p>{onReload ? <Button type="button" disabled={busy} onClick={() => void onReload()}>최신 원고로 다시 열기</Button> : null}</div> : null}
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
          <span className="field__label">심의필 문구</span>
          <input aria-label="심의필 문구" value={approval} onChange={event => setApproval(event.target.value)} maxLength={200} disabled={busy} required />
          <span className="field__helper">하단 안내 이미지 아래에 공통으로 표시됩니다. 심의 완료 후 번호와 유효기간을 변경하세요. 기본 양식은 실제 심의 완료를 의미하지 않습니다.</span>
        </label>
        <label className="field">
          <span className="field__label">수정 메모 <small>(선택)</small></span>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={3} disabled={busy} placeholder="예: ‘조건’ 대신 보장 범위와 특약을 구체적으로 표현" />
        </label>
      </form>
    </Modal>
  );
}
