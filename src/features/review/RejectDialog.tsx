import { useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";

const minimumReasonLength = 5;
const maximumReasonLength = 1000;

export function RejectDialog({ open, onClose, onReject }: { open: boolean; onClose: () => void; onReject: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const normalizedReason = reason.trim();
  const validReason = normalizedReason.length >= minimumReasonLength && normalizedReason.length <= maximumReasonLength;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validReason || submitting) return;
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
      onClose={onClose}
      title="원고 반려"
      description="수정이 필요한 이유를 작성하면 담당자에게 전달됩니다."
      footer={
        <>
          <Button type="button" onClick={onClose} disabled={submitting}>취소</Button>
          <Button type="submit" form="reject-form" variant="danger" disabled={!validReason || submitting}>
            {submitting ? "반려 처리 중" : "반려하기"}
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
            disabled={submitting}
            autoFocus
          />
          <span className="field__helper" id="reject-reason-help">
            공백을 제외하고 5자 이상 입력해주세요. ({normalizedReason.length}/{maximumReasonLength})
          </span>
        </label>
      </form>
    </Modal>
  );
}
