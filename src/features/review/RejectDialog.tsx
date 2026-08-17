import { useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";

export function RejectDialog({ open, onClose, onReject }: { open: boolean; onClose: () => void; onReject: (reason: string) => void }) {
  const [reason, setReason] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reason.trim()) return;
    onReject(reason.trim());
    setReason("");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="원고 반려"
      description="수정이 필요한 이유를 작성하면 담당자에게 전달됩니다."
      footer={
        <>
          <Button type="button" onClick={onClose}>취소</Button>
          <Button type="submit" form="reject-form" variant="danger" disabled={!reason.trim()}>반려하기</Button>
        </>
      }
    >
      <form id="reject-form" onSubmit={submit}>
        <label className="field">
          <span className="field__label">반려 사유</span>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="수정해야 할 문장과 이유를 구체적으로 적어주세요." rows={5} autoFocus />
        </label>
      </form>
    </Modal>
  );
}
