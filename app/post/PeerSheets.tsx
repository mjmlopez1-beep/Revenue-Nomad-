"use client";

/**
 * Working with peers, from wherever a company is (lib/peers.ts, lib/peersCore.ts):
 *
 *  - PassSheet: "Refer it to a peer". Pick a peer (the best fits for the function
 *    the company needs come first), say which open role when there is one, add a note. It opens free
 *    for them, lands in their Messages and on their Home, and they can take it into their pipeline.
 *  - TeamSheet: "Team up": ask a peer to pursue the company with you.
 *  - PeerActions: the two buttons, and the team already there, for a record, a deal or a Crystal Ball card.
 *  - TeamSpace: a team's shared space: where each deal stands, the shared note draft, the shared
 *    thread, the proposal, and Leave.
 *
 * Everything here is the member's own view: the server decides who can be picked and what is named.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { PASS_CREDIT, passNote, type PassFrom, type PeerPick, type PeerPicks, type TeamRec } from "@/lib/peersCore";
import { IconUsers, IconX, useToast } from "../ui/shared";
import { Chip } from "../ui/system";
import { Sheet, useUi } from "./ui";
import { loadPicks, peersAct, usePeers } from "./peersStore";
import { openConversation } from "./Messages";
import { isOpenSeat, type CoInfo } from "./model";
import { makeBlock } from "@/lib/proposals/library";
import type { ProposalBlock } from "@/lib/proposals/types";
import "./peers.css";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export function Avatar({ name, initials: ini, small }: { name: string; initials?: string; small?: boolean }) {
  return (
    <span className={`pe-av${small ? " pe-av-sm" : ""}`} aria-hidden>
      {ini ?? initials(name)}
    </span>
  );
}

/** A company to work on: from a record, a deal, a Crystal Ball card, or picked from a person's card. */
function CompanyPick({ infos, onPick }: { infos: CoInfo[]; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const id = useId();
  const named = useMemo(() => infos.filter((i) => !i.c.hidden && i.c.name), [infos]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const hits = t ? named.filter((i) => i.c.name.toLowerCase().includes(t)) : named.filter((i) => i.engs.some(isOpenSeat));
    return hits.slice(0, 8);
  }, [q, named]);
  return (
    <div className="pe-cpick">
      <label className="pe-label" htmlFor={id}>
        Which company?
      </label>
      <input id={id} className="input" placeholder="Search the companies you can see" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {list.length ? (
        <ul className="pe-cpick-list">
          {list.map((i) => (
            <li key={i.c.id}>
              <button type="button" className="pe-cpick-b" onClick={() => onPick(i.c.id)}>
                <b>{i.c.name}</b>
                <span>{i.teaser || i.fns.join(", ")}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pe-muted">{q.trim() ? "No company you can see by that name. Open it first, then refer it." : "Companies you've opened that are hiring show here. Search for any other."}</p>
      )}
    </div>
  );
}

function PickList({ picks, value, onPick, label }: { picks: PeerPick[]; value: string | null; onPick: (p: PeerPick) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="pe-picks">
      {picks.map((p) => (
        <button key={p.id} type="button" role="radio" aria-checked={value === p.id} className={`pe-pick${value === p.id ? " on" : ""}`} onClick={() => onPick(p)} disabled={p.teamed}>
          <Avatar name={p.name} initials={p.initials} small />
          <span className="pe-pick-t">
            <b>{p.name}</b>
            <span>{[p.title || (p.fn ? `Fractional ${p.fn}` : ""), p.why].filter(Boolean).join(" · ")}</span>
          </span>
          {p.best && (
            <Chip tone="pine" className="pe-chip">
              Best fit
            </Chip>
          )}
          {p.passed && <Chip className="pe-chip">Referred before</Chip>}
          {p.teamed && <Chip className="pe-chip">On a team here</Chip>}
        </button>
      ))}
    </div>
  );
}

/**
 * "Refer it to a peer." `company` (a public id) when it comes from a record, a deal,
 * a role or a Crystal Ball card; without it, the member picks one first (from a person's card, `to`).
 */
export function PassSheet({ company: company0, role: role0, from, to, infos, onClose }: { company?: string | null; role?: string | null; from: PassFrom; to?: { id: string; first: string } | null; infos?: CoInfo[]; onClose: () => void }) {
  const toast = useToast();
  const [company, setCompany] = useState<string | null>(company0 ?? null);
  const [role, setRole] = useState<string | null>(role0 ?? null);
  const [data, setData] = useState<PeerPicks | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [peer, setPeer] = useState<string | null>(to?.id ?? null);
  const [note, setNote] = useState("");
  const [typed, setTyped] = useState(false);
  const [busy, setBusy] = useState(false);
  const noteId = useId();
  useEffect(() => {
    if (!company) return;
    let live = true;
    void loadPicks(company, role, false).then((r) => {
      if (!live) return;
      if ("error" in r) return setErr(r.error);
      setData(r);
      if (!role0 && r.role) setRole(r.role.id);
    });
    return () => {
      live = false;
    };
  }, [company, role]); // eslint-disable-line react-hooks/exhaustive-deps
  const picked = data?.picks.find((p) => p.id === peer) ?? null;
  const toName = picked?.first ?? to?.first ?? "";
  useEffect(() => {
    if (typed || !data) return;
    setNote(toName ? passNote({ peer: toName, company: data.name ?? "This company", fn: data.needs }) : "");
  }, [toName, data, typed]);
  const send = async () => {
    if (!company || !peer || busy) return;
    setBusy(true);
    const r = await peersAct({ type: "peer.pass", companyId: company, memberId: peer, note: note.trim(), roleId: role, from });
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    toast(r.message);
    onClose();
  };
  const list = data ? (to ? data.picks.filter((p) => p.id === to.id).concat(data.picks.filter((p) => p.id !== to.id)) : data.picks) : [];
  return (
    <Sheet
      title={<span className="pe-sheet-t">Refer it to a peer</span>}
      onClose={onClose}
      dialog
      className="pe-sheet"
      footer={
        company ? (
          <div className="pe-sheet-foot">
            <span className="pe-muted num">{data ? `${data.passesLeft} of 10 referrals left today` : ""}</span>
            <button type="button" className="btn btn-pine" onClick={() => void send()} disabled={!peer || busy || !data?.passesLeft} aria-busy={busy}>
              {toName ? `Refer it to ${toName}` : "Refer it"}
            </button>
          </div>
        ) : null
      }
    >
      {!company ? (
        <CompanyPick infos={infos ?? []} onPick={setCompany} />
      ) : !data ? (
        <p className="pe-muted" role="status">
          {err ?? "Finding the best peers for it…"}
        </p>
      ) : (
        <>
          <p className="pe-lead">
            <b>{data.name ?? "This company"}</b>
            {data.needs ? ` needs a ${data.needs} leader.` : "."} It opens free for the peer you pick, a gift from you. You earn {PASS_CREDIT} credits when they take it.
          </p>
          {data.roles.length > 0 && (
            <label className="pe-label">
              About
              <select className="input" value={role ?? ""} onChange={(e) => setRole(e.target.value || null)}>
                <option value="">The company</option>
                {data.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    Its open {r.fn ?? ""} role{r.title ? `: ${r.title}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {list.length ? (
            <PickList picks={list} value={peer} onPick={(p) => setPeer(p.id)} label="Refer it to" />
          ) : (
            <p className="pe-muted">No peer in that function yet. Invite one from Peers, or message someone you know.</p>
          )}
          <label className="pe-label" htmlFor={noteId}>
            A note from you
          </label>
          <textarea id={noteId} className="input pe-note" rows={4} value={note} maxLength={600} onChange={(e) => (setNote(e.target.value), setTyped(true))} placeholder="What you know, and why you thought of them." />
          {err && (
            <p className="pe-err" role="alert">
              {err}
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}

/** "Team up": ask a peer to pursue this company with you (a CMO and a VP Sales, say). */
export function TeamSheet({ company: company0, to, infos, onClose }: { company?: string | null; to?: { id: string; first: string } | null; infos?: CoInfo[]; onClose: () => void }) {
  const toast = useToast();
  const [company, setCompany] = useState<string | null>(company0 ?? null);
  const [data, setData] = useState<PeerPicks | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [peer, setPeer] = useState<string | null>(to?.id ?? null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const noteId = useId();
  useEffect(() => {
    if (!company) return;
    let live = true;
    void loadPicks(company, null, true).then((r) => live && ("error" in r ? setErr(r.error) : setData(r)));
    return () => {
      live = false;
    };
  }, [company]);
  const picked = data?.picks.find((p) => p.id === peer) ?? null;
  const send = async () => {
    if (!company || !peer || busy) return;
    setBusy(true);
    const r = await peersAct({ type: "peer.team", companyId: company, memberId: peer, note: note.trim() });
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    toast(r.message);
    onClose();
  };
  const list = data ? (to ? data.picks.filter((p) => p.id === to.id).concat(data.picks.filter((p) => p.id !== to.id)) : data.picks) : [];
  return (
    <Sheet
      title={<span className="pe-sheet-t">Team up with a peer</span>}
      onClose={onClose}
      dialog
      className="pe-sheet"
      footer={
        company ? (
          <div className="pe-sheet-foot">
            <span className="pe-muted">You share a thread, a note draft and the proposal.</span>
            <button type="button" className="btn btn-pine" onClick={() => void send()} disabled={!peer || busy} aria-busy={busy}>
              Ask {picked?.first ?? to?.first ?? "them"} to team up
            </button>
          </div>
        ) : null
      }
    >
      {!company ? (
        <CompanyPick infos={infos ?? []} onPick={setCompany} />
      ) : !data ? (
        <p className="pe-muted" role="status">
          {err ?? "Finding peers to pitch with…"}
        </p>
      ) : (
        <>
          <p className="pe-lead">
            Pursue <b>{data.name ?? "this company"}</b> together. Peers in functions that work beside yours come first.
          </p>
          {list.length ? <PickList picks={list} value={peer} onPick={(p) => setPeer(p.id)} label="Team up with" /> : <p className="pe-muted">No peer fits this one yet.</p>}
          <label className="pe-label" htmlFor={noteId}>
            A note (optional)
          </label>
          <textarea id={noteId} className="input pe-note" rows={3} value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} placeholder="Want to pitch this one together? I'd take the sales side." />
          {err && (
            <p className="pe-err" role="alert">
              {err}
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}

/**
 * The proposal builder's Team block: at a company the member is pursuing with a teammate, one tap
 * adds "Team and rates" listing both of them, each with their function, to fill in and price. No
 * split of the fee: that is theirs to agree.
 */
export function TeamBlockOffer({ company, has, onAdd }: { company: string | null; has: boolean; onAdd: (b: ProposalBlock) => void }) {
  const ui = useUi();
  const { view } = usePeers(!!company);
  const t = company ? view?.teams.find((x) => x.company === company && x.status === "active") : undefined;
  if (!t || has) return null;
  const add = () => {
    const b = makeBlock("team_rates");
    const line = (name: string, fn: string | null) => `- ${name}${fn ? `, fractional ${fn} lead` : ""}: what you'll own, and the hours or days each month.`;
    onAdd({ ...b, title: "Your team", body: [`One proposal, one team. ${t.with.first} and I work as one, each leading our own part.`, line(ui.me.name, t.me.fn), line(t.with.name, t.with.fn), "Price: state the team's monthly fee, and each person's share of the work."].join("\n") });
  };
  return (
    <button type="button" className="btn pp-wide pe-teamblock" onClick={add}>
      <IconUsers size={14} /> Add your team: you and {t.with.first}
    </button>
  );
}

/** One small "Refer it to a peer" button (a Crystal Ball card, a deal's row): the referral sheet for that company. */
export function PassButton({ company, role, from, className = "btn btn-sm" }: { company: string; role?: string | null; from: PassFrom; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} title="Not your fit? Refer it to a peer, free for them.">
        Refer it to a peer
      </button>
      {open && <PassSheet company={company} role={role ?? null} from={from} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The two ways to work on a company with a peer, and the team already there. */
export function PeerActions({ company, role, from, compact }: { company: string; role?: string | null; from: PassFrom; compact?: boolean }) {
  const ui = useUi();
  const { view } = usePeers();
  const [sheet, setSheet] = useState<"pass" | "team" | null>(null);
  const team = view?.teams.find((t) => t.company === company && (t.status === "active" || t.status === "invited"));
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <div className={`pe-acts${compact ? " pe-acts-compact" : ""}`}>
      <button ref={btn} type="button" className="btn btn-sm" onClick={() => setSheet("pass")}>
        Refer it to a peer
      </button>
      {team ? (
        <button type="button" className="btn btn-sm pe-teamed" onClick={() => ui.openPage("peers")}>
          <IconUsers size={13} /> {team.status === "active" ? `Teamed with ${team.with.first}` : `Asked ${team.with.first} to team up`}
        </button>
      ) : (
        <button type="button" className="btn btn-sm" onClick={() => setSheet("team")}>
          <IconUsers size={13} /> Team up
        </button>
      )}
      {sheet === "pass" && <PassSheet company={company} role={role ?? null} from={from} onClose={() => setSheet(null)} />}
      {sheet === "team" && <TeamSheet company={company} onClose={() => setSheet(null)} />}
    </div>
  );
}

/** A team's shared space: both deals, the shared draft, the thread, the proposal, Leave. */
export function TeamSpace({ t, onClose, openCompany }: { t: TeamRec; onClose: () => void; openCompany: (id: string) => void }) {
  const ui = useUi();
  const toast = useToast();
  const [draft, setDraft] = useState(t.draft?.text ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => setDraft(t.draft?.text ?? ""), [t.draft?.text]);
  const run = async (what: string, action: Parameters<typeof peersAct>[0]) => {
    setBusy(what);
    const r = await peersAct(action);
    setBusy(null);
    toast(r.message, !r.ok);
    return r.ok;
  };
  const company = t.name ?? (t.kind ? `A ${t.kind}` : "A locked company");
  const invitedMe = !t.invited && t.status === "invited";
  return (
    <Sheet title={<span className="pe-sheet-t">Team space</span>} onClose={onClose} dialog className="pe-sheet pe-space">
      <div className="pe-space-head">
        <div>
          <p className="pe-eyebrow">{t.status === "active" ? "Pursuing together" : t.status === "invited" ? (t.invited ? `Waiting for ${t.with.first}` : `${t.with.first} asked you to team up`) : "This team is closed"}</p>
          <h3 className="pe-space-co">
            <button type="button" className="pe-linkish" onClick={() => openCompany(t.company)}>
              {company}
            </button>
          </h3>
          {!t.name && <p className="pe-muted">Locked for you. Unlock it to see the name.</p>}
        </div>
        <div className="pe-pair" aria-label="The team">
          <span className="pe-pair-one">
            <Avatar name={ui.me.name} small />
            <span>
              <b>You</b>
              <span>{t.me.fn ?? ""}</span>
            </span>
          </span>
          <span className="pe-pair-plus" aria-hidden>
            +
          </span>
          <span className="pe-pair-one">
            <Avatar name={t.with.name} small />
            <span>
              <b>{t.with.name}</b>
              <span>{t.with.fn ?? t.with.title}</span>
            </span>
          </span>
        </div>
      </div>
      {invitedMe ? (
        <div className="pe-space-ask">
          <p>Say yes and the company goes in your pipeline, marked Teamed with {t.with.first}. You share this thread, a note draft and the proposal. Either of you can leave.</p>
          <div className="pe-row">
            <button type="button" className="btn btn-pine" aria-busy={busy === "join"} onClick={() => void run("join", { type: "peer.teamAnswer", id: t.id, join: true })}>
              Team up
            </button>
            <button type="button" className="btn" aria-busy={busy === "no"} onClick={() => void run("no", { type: "peer.teamAnswer", id: t.id, join: false }).then((ok) => ok && onClose())}>
              Not now
            </button>
          </div>
        </div>
      ) : null}
      {t.status === "active" && (
        <>
          <section className="pe-space-sec" aria-label="Your deals">
            <h4 className="pe-h4">Your deals here</h4>
            <ul className="pe-stages">
              <li>
                <span>You</span>
                <b>{t.stages.you ?? "Not in your pipeline"}</b>
              </li>
              <li>
                <span>{t.with.first}</span>
                <b>{t.stages.them ?? "Not in their pipeline"}</b>
              </li>
            </ul>
          </section>
          <section className="pe-space-sec" aria-label="Your shared note">
            <h4 className="pe-h4">Your shared note</h4>
            <p className="pe-muted">{t.draft ? `Last edited by ${t.draft.by === "you" ? "you" : t.with.first}.` : "Write the first note to them together."} Both of you can change it.</p>
            <textarea className="input pe-draft" rows={8} value={draft} maxLength={2000} onChange={(e) => setDraft(e.target.value)} aria-label="The shared note draft" />
            <div className="pe-row">
              <button type="button" className="btn btn-pine btn-sm" disabled={!draft.trim() || draft === t.draft?.text} aria-busy={busy === "draft"} onClick={() => void run("draft", { type: "peer.teamDraft", id: t.id, text: draft })}>
                Save the draft
              </button>
              <button type="button" className="btn btn-sm" onClick={() => void navigator.clipboard?.writeText(draft).then(() => toast("Copied."))}>
                Copy
              </button>
            </div>
          </section>
          <div className="pe-row pe-space-go">
            <button type="button" className="btn btn-sm" onClick={() => (onClose(), openConversation(ui.openPage, t.conversationId))}>
              Open your shared thread
            </button>
            <button type="button" className="btn btn-sm" onClick={() => (onClose(), ui.openPage("proposals"))}>
              Write the proposal together
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost pe-leave"
              aria-busy={busy === "leave"}
              onClick={() => window.confirm(`Leave the team? ${t.with.first} keeps their own deal there.`) && void run("leave", { type: "peer.teamLeave", id: t.id }).then((ok) => ok && onClose())}
            >
              <IconX size={12} /> Leave the team
            </button>
          </div>
        </>
      )}
      {t.status === "invited" && t.invited && (
        <div className="pe-row">
          <button type="button" className="btn btn-sm" onClick={() => (onClose(), openConversation(ui.openPage, t.conversationId))}>
            Open your thread
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => void run("leave", { type: "peer.teamLeave", id: t.id }).then((ok) => ok && onClose())}>
            Take the ask back
          </button>
        </div>
      )}
    </Sheet>
  );
}
