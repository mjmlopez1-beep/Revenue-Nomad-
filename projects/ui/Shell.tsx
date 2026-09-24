import { useEffect, useMemo, useRef, useState } from "react";
import { ADMIN, BUYERS, OPERATORS, buyerById, displayName, operatorById } from "../lib/data";
import { advanceClock, nowOf, resetDemo, setSession, useSession, useStore } from "../lib/store";
import { dayLabel, timeLabel, shortDate } from "../lib/format";
import { Link, followLink, href, navigate, useLocation } from "../lib/router";
import type { OutboxEntry, Role } from "../lib/types";

const THEME_KEY = "rnp:theme";

function applyTheme(t: string) {
  const root = document.documentElement;
  if (t === "light" || t === "dark") root.setAttribute("data-theme", t);
  else root.removeAttribute("data-theme");
}

export const ROLE_HOME: Record<Role, string> = {
  buyer: "/buyer/projects",
  operator: "/dashboard",
  admin: "/admin/today",
};

export function ProtoBar() {
  const s = useStore();
  const sess = useSession();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState("system");
  const [opQuery, setOpQuery] = useState("");
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    try {
      const t = localStorage.getItem(THEME_KEY) || "system";
      setTheme(t);
      applyTheme(t);
    } catch {
      /* per-viewer convenience only */
    }
  }, []);

  const currentOp = operatorById(sess.operatorId);
  useEffect(() => {
    setOpQuery(currentOp ? displayName(currentOp) : "");
  }, [currentOp]);

  const switchRole = (role: Role) => {
    setSession({ role });
    navigate(ROLE_HOME[role]);
  };

  const pickOperator = (v: string) => {
    setOpQuery(v);
    const op = OPERATORS.find((o) => displayName(o).toLowerCase() === v.trim().toLowerCase());
    if (op && op.id !== sess.operatorId) {
      setSession({ role: "operator", operatorId: op.id });
      navigate(ROLE_HOME.operator);
    }
  };

  const unread = s.outbox.length;

  return (
    <>
      <div className="proto" role="group" aria-label="Prototype controls">
        <span className="proto-label">Prototype</span>
        <span className="proto-tabs" role="group" aria-label="Role">
          {(["buyer", "operator", "admin"] as Role[]).map((r) => (
            <button key={r} type="button" aria-pressed={sess.role === r} onClick={() => switchRole(r)} data-testid={`role-${r}`}>
              {r === "buyer" ? "Buyer" : r === "operator" ? "Operator" : "Admin"}
              <small>
                {r === "buyer" ? buyerById(sess.buyerId)?.contactName : r === "operator" ? (currentOp ? displayName(currentOp) : "") : ADMIN.name}
              </small>
            </button>
          ))}
        </span>
        {sess.role === "buyer" && (
          <label className="proto-field">
            <span className="sr-only">Buyer account</span>
            <select value={sess.buyerId} onChange={(e) => (setSession({ buyerId: e.target.value }), navigate(ROLE_HOME.buyer))} aria-label="Buyer account">
              {BUYERS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.contactName} at {b.company}
                </option>
              ))}
            </select>
          </label>
        )}
        {sess.role === "operator" && (
          <label className="proto-field">
            <span className="sr-only">Operator</span>
            <input
              list="rnp-operator-list"
              value={opQuery}
              onChange={(e) => pickOperator(e.target.value)}
              onFocus={(e) => e.target.select()}
              aria-label="Operator"
              placeholder="Search 100 operators"
              data-testid="operator-picker"
            />
            <datalist id="rnp-operator-list">
              {OPERATORS.map((o) => (
                <option key={o.id} value={displayName(o)}>
                  {o.role}
                </option>
              ))}
            </datalist>
          </label>
        )}
        <span className="proto-sep" aria-hidden="true" />
        <button type="button" className="proto-btn" onClick={() => setOpen(true)} data-testid="open-outbox">
          Outbox <b data-testid="outbox-count">{unread}</b>
        </button>
        <span className="proto-clock" role="group" aria-label="Simulated clock">
          <span data-testid="clock">{dayLabel(nowOf(s))}</span>
          <button type="button" className="proto-btn" onClick={() => (advanceClock(1), setAnnounce("Clock moved forward 1 day"))} data-testid="clock-1d">
            +1 day
          </button>
          <button type="button" className="proto-btn" onClick={() => (advanceClock(7), setAnnounce("Clock moved forward 7 days"))} data-testid="clock-7d">
            +7 days
          </button>
        </span>
        <label className="proto-field">
          <span className="sr-only">Theme</span>
          <select
            aria-label="Theme"
            value={theme}
            data-testid="theme"
            onChange={(e) => {
              setTheme(e.target.value);
              applyTheme(e.target.value);
              try {
                localStorage.setItem(THEME_KEY, e.target.value);
              } catch {
                /* ignore */
              }
            }}
          >
            <option value="system">System theme</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <button
          type="button"
          className="proto-btn proto-reset"
          data-testid="reset-demo"
          onClick={() => {
            resetDemo();
            setAnnounce("Demo data reset");
            navigate(ROLE_HOME[sess.role]);
          }}
        >
          Reset demo data
        </button>
        <span className="sr-only" aria-live="polite">
          {announce}
        </span>
      </div>
      {open && <OutboxPanel entries={s.outbox} onClose={() => setOpen(false)} />}
    </>
  );
}

const KIND_LABEL: Record<OutboxEntry["kind"], string> = {
  invite: "Invite",
  profile: "Profile nudge",
  alert: "Role alert",
  digest: "Alert digest",
  question: "Question",
  answer: "Answer",
  intro: "Intro request",
  selected: "Selected",
  close: "Close",
  nudge: "Nudge",
  pulse: "Availability pulse",
  shortlist: "Shortlist",
  booking: "Booking",
  reply: "Reply",
  suggestions: "Suggestion",
  signup: "Sign-up invite",
  message: "Message",
  checkin: "Check in",
  client: "From client",
};

function OutboxPanel({ entries, onClose }: { entries: OutboxEntry[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const list = useMemo(() => {
    const t = q.toLowerCase().trim();
    return [...entries]
      .reverse()
      .filter((m) => (kind === "all" || m.kind === kind) && (!t || `${m.to.name} ${m.to.email} ${m.subject} ${m.body}`.toLowerCase().includes(t)));
  }, [entries, q, kind]);
  const shown = list.slice(0, 150);
  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div className="drawer" role="dialog" aria-modal="true" aria-label="Outbox" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()} data-testid="outbox">
        <div className="drawer-head">
          <div>
            <div className="eyebrow">Prototype</div>
            <h2>Outbox</h2>
            <p className="muted">Every email and alert the system sent. Links sign you in as the recipient, no password.</p>
          </div>
          <button type="button" className="btn ghost" onClick={onClose} aria-label="Close outbox">
            Close
          </button>
        </div>
        <div className="drawer-filters">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by recipient or subject" aria-label="Filter outbox" data-testid="outbox-filter" />
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Message type" data-testid="outbox-kind">
            <option value="all">All types ({entries.length})</option>
            {Object.entries(KIND_LABEL).map(([k, l]) => {
              const n = entries.filter((m) => m.kind === k).length;
              return n ? (
                <option key={k} value={k}>
                  {l} ({n})
                </option>
              ) : null;
            })}
          </select>
        </div>
        {!list.length && <div className="empty">{entries.length ? "Nothing matches that filter." : "Nothing sent yet. Post a project to send invites and alerts."}</div>}
        <ol className="mail-list">
          {shown.map((m) => (
            <li key={m.id} className="mail" data-testid="outbox-entry" data-kind={m.kind} data-to={m.to.name}>
              <div className="mail-top">
                <span className={`mail-kind mk-${m.kind}`}>{KIND_LABEL[m.kind]}</span>
                <span className="muted">
                  {shortDate(m.at)}, {timeLabel(m.at)}
                </span>
              </div>
              <div className="mail-to">
                To <b>{m.to.name}</b> <span className="muted">&lt;{m.to.email}&gt;</span>
              </div>
              <div className="mail-subject">{m.subject}</div>
              <p className="mail-body">{m.body}</p>
              {m.links.length > 0 && (
                <div className="mail-links">
                  {m.links.map((l, i) => (
                    <a
                      key={i}
                      href={href(l.path)}
                      className={`btn ${i === 0 ? "primary" : ""} btn-sm`}
                      onClick={(e) => {
                        e.preventDefault();
                        onClose();
                        followLink(l.path, l.as);
                      }}
                    >
                      {l.label}
                    </a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
        {list.length > shown.length && <p className="muted">Showing the newest {shown.length} of {list.length}. Filter to narrow.</p>}
      </div>
    </div>
  );
}

export function SiteHeader() {
  const sess = useSession();
  const { path } = useLocation();
  const nav: { to: string; label: string }[] =
    sess.role === "buyer"
      ? [
          { to: "/operators", label: "Find operator" },
          { to: "/buyer/projects", label: "Projects" },
          { to: "/buyer/intros", label: "Intro requests" },
          { to: "/buyer/company", label: "Company profile" },
        ]
      : sess.role === "operator"
        ? [
            { to: "/operator/projects", label: "Projects" },
            { to: "/operator/roles", label: "Open roles" },
            { to: "/operator/availability", label: "Availability" },
            { to: `/operators/${operatorById(sess.operatorId)?.slug}`, label: "My profile" },
          ]
        : [
            { to: "/admin/projects", label: "Projects" },
            { to: "/admin/operators", label: "Operators" },
            { to: "/admin/reports", label: "Reports" },
            { to: "/admin/intros", label: "Intro requests" },
          ];
  const who =
    sess.role === "buyer" ? buyerById(sess.buyerId)?.contactName || "" : sess.role === "operator" ? displayName(operatorById(sess.operatorId)!) : ADMIN.name;
  return (
    <header className="site">
      <a className="logo" href="https://www.revenuenomad.com" aria-label="Revenue Nomad home">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M10 2 L18 17 H2 Z" />
          <path d="M10 8 V17" />
        </svg>
        <b>REVENUE</b>
        <span>NOMAD</span>
      </a>
      <nav aria-label="Main">
        {nav.map((n) => (
          <Link key={n.to} to={n.to} aria-current={path === n.to || (n.to !== "/operators" && path.startsWith(n.to)) ? "page" : undefined}>
            {n.label}
          </Link>
        ))}
        <span className="me" data-testid="signed-in-as">
          <span className="me-dot">{who.slice(0, 1)}</span>
          {who}
        </span>
      </nav>
    </header>
  );
}
