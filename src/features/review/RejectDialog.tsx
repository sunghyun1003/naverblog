import { useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";

const minimumReasonLength = 5;
const maximumReasonLength = 1000;

export function RejectDialog({ open, busy = false, onClose, onReject }: { open: boolean; busy?: boolean; onClose: () => void; onReject: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const normalizedReason = reason.trim();
  const validReason = normalizedReason.length >= minimumReasonLength && normalizedReason.length <= maximumReasonLength;
  const processing = submitting || busy;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validReason || processing) return;
    setSubmitting(true);
    try {
      await onReject(normalizedReason);
      setReason("");
    } catch {
      // 상위 화면이 오류를 표시하며, 작성한 사유는 재시도를 위해 보존한다.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { if (!processing) onClose(); }}
      title="원고 반려"
      description="반려 의견을 저장합니다. 의견을 반영한 자동 재작성은 아직 실행되지 않습니다."
      footer={
        <>
          <Button type="button" onClick={onClose} disabled={processing}>취소</Button>
          <Button type="submit" form="reject-form" variant="danger" disabled={!validReason || processing}>
            {processing ? "반려 처리 중" : "반려하기"}
          </Button>
        </>
      }
    >
      <form id="reject-form" onSubmit={submit}>
        <label className="field">
          <span className="field__label">반려 사유</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="수정해야 할 문장과 이유를 구체적으로 적어주세요."
            rows={5}
            minLength={minimumReasonLength}
            maxLength={maximumReasonLength}
            aria-describedby="reject-reason-help"
            disabled={processing}
            autoFocus
            data-modal-initial-focus="true"
          />
          <span className="field__helper" id="reject-reason-help">
            공백을 제외하고 5자 이상 입력해주세요. ({normalizedReason.length}/{maximumReasonLength})
          </span>
        </label>
      </form>
    </Modal>
  );
}
