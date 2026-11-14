import Link from "next/link";

/** Revenue Nomad logo: the official mark + wordmark (public/brand/logo.png, dark text for light backgrounds). */
export default function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Revenue Nomad home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-logo" src="/brand/logo.png" alt="Revenue Nomad" width={425} height={48} />
    </Link>
  );
}
