import { useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";

interface CreateContentDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (title: string, strategy: "trend" | "original") => Promise<void> | void;
  busy?: boolean;
}

export function CreateContentDialog({ open, onClose, onCreate, busy = false }: CreateContentDialogProps) {
  const [title, setTitle] = useState("");
  const [strategy, setStrategy] = useState("trend");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    await onCreate(trimmedTitle, strategy as "trend" | "original");
    setTitle("");
    setStrategy("trend");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="콘텐츠 만들기"
      description="입력한 주제와 최근 수집된 네이버 블로그 소재 후보를 함께 참고해 기획합니다."
      footer={
        <>
          <Button type="button" onClick={onClose} disabled={busy}>취소</Button>
          <Button type="submit" form="create-content-form" variant="brand" disabled={!title.trim() || busy}>
            {busy ? "자동화 실행 중..." : "기획 시작하기"}
          </Button>
        </>
      }
    >
      <form id="create-content-form" className="create-form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">콘텐츠 주제</span>
          <input
            autoFocus
            aria-label="콘텐츠 주제"
            disabled={busy}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="예: 실손보험 청구 전 확인할 서류"
          />
          <span className="field__helper">구체적인 독자 질문 형태로 입력하면 기획 품질이 좋아집니다.</span>
        </label>

        <fieldset className="strategy-fieldset">
          <legend>생성 방식</legend>
          <label className={`strategy-option ${strategy === "trend" ? "strategy-option--selected" : ""}`}>
            <input type="radio" name="strategy" value="trend" checked={strategy === "trend"} disabled={busy} onChange={() => setStrategy("trend")} />
            <span>
              <strong>최근 소재 재기획</strong>
              <small>여러 검색어에 반복 노출된 최근 소재의 공통 관심사를 새 관점으로 구성합니다.</small>
            </span>
          </label>
          <label className={`strategy-option ${strategy === "original" ? "strategy-option--selected" : ""}`}>
            <input
              type="radio"
              name="strategy"
              value="original"
              checked={strategy === "original"}
              disabled={busy}
              onChange={() => setStrategy("original")}
            />
            <span>
              <strong>새 기획으로 시작</strong>
              <small>입력한 주제를 중심으로 기획하고, 수집 후보는 참고 근거로만 사용합니다.</small>
            </span>
          </label>
        </fieldset>
      </form>
    </Modal>
  );
}
