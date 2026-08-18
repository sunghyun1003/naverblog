import { LockKeyhole, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { BrandMark } from "../../components/BrandMark";
import { Button } from "../../components/Button";
import { useAuth } from "./AuthProvider";

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await login(username.trim(), password);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "로그인에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <header className="login-panel__header">
          <BrandMark />
          <div>
            <h1 id="login-title">블로그 운영센터</h1>
            <p>자동화 워크플로와 원고를 관리하려면 로그인하세요.</p>
          </div>
        </header>
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field__label">아이디</span>
            <span className="login-input">
              <UserRound size={18} aria-hidden="true" />
              <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} disabled={submitting} />
            </span>
          </label>
          <label className="field">
            <span className="field__label">비밀번호</span>
            <span className="login-input">
              <LockKeyhole size={18} aria-hidden="true" />
              <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting} />
            </span>
          </label>
          {error ? <p className="login-error" role="alert">{error}</p> : null}
          <Button type="submit" variant="brand" disabled={!username.trim() || !password || submitting}>
            {submitting ? "로그인 중..." : "로그인"}
          </Button>
        </form>
        <p className="login-panel__notice">초기 운영 계정입니다. 팀 사용 전 Google 로그인으로 전환할 예정입니다.</p>
      </section>
    </main>
  );
}
