import Link from "next/link";

/** Revenue Nomad wordmark + Benchmark tag (visual system carried from v2). */
export default function Brand() {
  return (
    <Link href="/" className="brand">
      <svg className="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M16 13 L7 27" stroke="#2e7d43" strokeWidth="3.6" strokeLinecap="round" />
        <path d="M16 13 L25 27" stroke="#8cc063" strokeWidth="3.6" strokeLinecap="round" />
        <path d="M16 5 L10.5 13.5" stroke="#8cc063" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M16 5 L21.5 13.5" stroke="#2e7d43" strokeWidth="3.2" strokeLinecap="round" />
      </svg>
      <span className="wordmark">
        REVENUE<em>NOMAD</em>
      </span>
      <span className="brand-sub">Benchmark</span>
    </Link>
  );
}
