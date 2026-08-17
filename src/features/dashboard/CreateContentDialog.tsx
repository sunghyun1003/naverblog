import { useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";

interface CreateContentDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (title: string) => void;
}

export function CreateContentDialog({ open, onClose, onCreate }: CreateContentDialogProps) {
  const [title, setTitle] = useState("");
  const [strategy, setStrategy] = useState("trend");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    onCreate(trimmedTitle);
    setTitle("");
    setStrategy("trend");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="콘텐츠 만들기"
      description="주제를 직접 입력하거나 수집된 인기 소재를 바탕으로 기획할 수 있어요."
      footer={
        <>
          <Button type="button" onClick={onClose}>취소</Button>
          <Button type="submit" form="create-content-form" variant="brand" disabled={!title.trim()}>
            기획 시작하기
          </Button>
        </>
      }
    >
      <form id="create-content-form" className="create-form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">콘텐츠 주제</span>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="예: 실손보험 청구 전 확인할 서류"
          />
          <span className="field__helper">구체적인 독자 질문 형태로 입력하면 기획 품질이 좋아집니다.</span>
        </label>

        <fieldset className="strategy-fieldset">
          <legend>생성 방식</legend>
          <label className={`strategy-option ${strategy === "trend" ? "strategy-option--selected" : ""}`}>
            <input type="radio" name="strategy" value="trend" checked={strategy === "trend"} onChange={() => setStrategy("trend")} />
            <span>
              <strong>인기 소재 재기획</strong>
              <small>최근 블로그·커뮤니티·YouTube에서 관심 포인트를 모아 새 관점으로 구성합니다.</small>
            </span>
          </label>
          <label className={`strategy-option ${strategy === "original" ? "strategy-option--selected" : ""}`}>
            <input
              type="radio"
              name="strategy"
              value="original"
              checked={strategy === "original"}
              onChange={() => setStrategy("original")}
            />
            <span>
              <strong>새 기획으로 시작</strong>
              <small>공식 자료와 내부 아이디어를 바탕으로 처음부터 기획합니다.</small>
            </span>
          </label>
        </fieldset>
      </form>
    </Modal>
  );
}
