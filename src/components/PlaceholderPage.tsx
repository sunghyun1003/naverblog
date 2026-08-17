import { ArrowLeft, Construction } from "lucide-react";
import { Link } from "react-router-dom";

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <section className="placeholder-page">
      <div className="placeholder-page__icon" aria-hidden="true">
        <Construction size={32} />
      </div>
      <h1>{title}</h1>
      <p>{description}</p>
      <Link className="button button--brand button--medium" to="/contents">
        <ArrowLeft size={18} />
        <span>콘텐츠로 돌아가기</span>
      </Link>
    </section>
  );
}
