import Link from "next/link";

/** Revenue Nomad wordmark: two-tone green mark + REVENUE (bold) NOMAD (light). Colors come from app/tokens.css. */
export default function Brand({ className = "brand" }: { className?: string }) {
  return (
    <Link href="/" className={className} aria-label="Revenue Nomad home">
      <svg className="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M16 13 L7 27" stroke="var(--rn-forest)" strokeWidth="3.6" strokeLinecap="round" />
        <path d="M16 13 L25 27" stroke="var(--rn-leaf-strong)" strokeWidth="3.6" strokeLinecap="round" />
        <path d="M16 5 L10.5 13.5" stroke="var(--rn-leaf-strong)" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M16 5 L21.5 13.5" stroke="var(--rn-forest)" strokeWidth="3.2" strokeLinecap="round" />
      </svg>
      <span className="wordmark">
        REVENUE<em>NOMAD</em>
      </span>
    </Link>
  );
}
