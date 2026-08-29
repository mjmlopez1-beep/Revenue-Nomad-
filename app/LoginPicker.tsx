"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface Op {
  id: string;
  name: string;
  funcLabel: string;
  foundingFifty: boolean;
}

export default function LoginPicker({ operators }: { operators: Op[] }) {
  const [q, setQ] = useState("");
  const router = useRouter();
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? operators.filter((o) => o.name.toLowerCase().includes(needle) || o.funcLabel.toLowerCase().includes(needle))
      : operators;
    return list.slice(0, 60);
  }, [q, operators]);

  async function signIn(id: string) {
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operatorId: id }),
    });
    if (res.ok) router.push("/dashboard");
  }

  return (
    <div>
      <input
        placeholder="Search 300 operators by name or function…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ maxWidth: 380 }}
      />
      <div className="login-grid">
        {shown.map((o) => (
          <button key={o.id} className="login-op" onClick={() => signIn(o.id)}>
            <b>
              {o.name} {o.foundingFifty && <span className="chip" style={{ fontSize: 10, padding: "1px 7px" }}>F50</span>}
            </b>
            <span>{o.funcLabel}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
