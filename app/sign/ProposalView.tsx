/**
 * A proposal as the client reads it, at full depth: the header with both parties, then 01 Scope
 * (the situation, the math, team and reporting, the plan with workstreams that open and close,
 * milestones, commitments, success measures, assumptions and out of scope), 02 Timeline and
 * investment (the options to pick from, side by side, the add-ons and the total; or one price),
 * 03 the agreement in parts that open, then the signatures. Where each section goes is
 * lib/proposals/sections.ts; a section the proposal doesn't have is absent, so a short proposal
 * reads right too.
 *
 * No hooks: the signing page (Sign.tsx) passes what the client picked and the handlers; the
 * signed copy (server-rendered) passes the choice signed and none. Every section and every option
 * carries a stable data-section id ("scope", "the_math", "option-<id>", "addon-<id>", "terms-2",
 * "sign"), for anything that needs to know which part of the page is in view.
 */
import type { ReactNode } from "react";
import { choiceRec, includedRows, money, priced, startOption } from "@/lib/proposals/pricing";
import { arrange, leadCards, milestones, phases, readMinutes, statCards, type Placed } from "@/lib/proposals/sections";
import { BILLING_SAY, type Choice, type ChoiceRec, type FrozenDoc, type Pricing } from "@/lib/proposals/types";
import { DocText, dayOf } from "./doc";

const TEAM = new Set(["reporting_structure", "team_rates", "operating_cadence", "role_profile"]);
const SIDE = new Set(["assumptions", "out_of_scope"]);
const first = (name: string) => name.trim().split(/\s+/)[0] || name;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 2);
const monthOf = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** What the total line says for a choice: "$15,000 a month", with the once part under it. */
export function totalWords(r: ChoiceRec): { line: string; sub: string } {
  if (r.monthly && r.once) return { line: priced(r.monthly, "month"), sub: `Plus ${priced(r.once, "once")}.` };
  if (r.monthly) return { line: priced(r.monthly, "month"), sub: r.addOns.length ? `${r.option} with ${r.addOns.map((a) => a.name).join(", ")}.` : `${r.option}.` };
  return { line: priced(r.once, "once"), sub: r.addOns.length ? `${r.option} with ${r.addOns.map((a) => a.name).join(", ")}.` : `${r.option}.` };
}

export interface ProposalViewProps {
  doc: FrozenDoc;
  /** The link's last day while it can still be signed; "none" when it has no end date. */
  openUntil?: string | null;
  /** What's picked (open), or what was signed. */
  choice: Choice | null;
  /** Picking: absent once signed, or on the signed copy. */
  onPick?: (optionId: string) => void;
  onAddOn?: (addOnId: string, on: boolean) => void;
  /** The signatures section's content. */
  sign: ReactNode;
  /** The top bar's "Review and sign", while it can be signed. */
  canSign?: boolean;
}

export function ProposalView({ doc: d, openUntil, choice, onPick, onAddOn, sign, canSign }: ProposalViewProps) {
  const g = arrange(d);
  const p = d.pricing;
  const pick: Choice | null = p ? choice ?? { optionId: startOption(p), addOnIds: [] } : null;
  const rec = p && pick ? choiceRec(p, pick) : null;
  const many = !!p && p.options.length > 1;
  const live = !!onPick;
  const nav: [string, string][] = [];
  if (g.scope.length) nav.push(["scope", "01 Scope"]);
  for (const [k, label] of [
    ["the_math", "The math"],
    ["team", "Team"],
    ["phases_workstreams", "The plan"],
    ["commitments", "Deliverables"],
    ["success_measures", "Success"],
    ["assumptions", "Assumptions"],
  ] as const)
    if (g.scope.some((b) => (k === "team" ? TEAM.has(b.kind) : k === "assumptions" ? SIDE.has(b.kind) : b.kind === k))) nav.push([k === "team" ? "team" : k === "assumptions" ? "assume" : k, label]);
  if (p || g.invest.length) nav.push(["invest", `02 ${many ? "Options" : "Investment"}`]);
  if (g.terms.length) nav.push(["terms", "03 Agreement"]);
  nav.push(["sign", "Sign"]);

  return (
    <div className="cv">
      <div className="cv-bar">
        <span className="cv-bar-l">
          Sent to {d.to.name} by {d.from.name}
          {openUntil === "none" ? " · no end date" : openUntil ? ` · open until ${dayOf(openUntil)}` : ""} · about {readMinutes(d)} {readMinutes(d) === 1 ? "minute" : "minutes"} to read
        </span>
        {canSign && (
          <a className="cv-bar-go" href="#sign">
            Review and sign
          </a>
        )}
      </div>

      <article className="cv-doc" aria-label="The proposal">
        <header className="cv-head" data-section="header">
          <span className="cv-kicker-l">Proposal · Version {d.version}</span>
          <h1 className="cv-h1">{d.title}</h1>
          <span className="cv-parties">
            {d.from.name}
            {d.from.title ? `, ${d.from.title}` : ""} · prepared for {d.to.name}
            {d.to.title ? `, ${d.to.title}` : ""}
            {d.company ? `, ${d.company}` : ""} · {monthOf(d.preparedAt)}
          </span>
          {g.cover?.lead && (
            <div className="cv-lead">
              <DocText text={g.cover.lead} />
            </div>
          )}
          <div className="cv-chips">
            <span className="cv-chip">Sent {dayOf(d.preparedAt)}</span>
            {openUntil && <span className="cv-chip">{openUntil === "none" ? "No end date" : `Open until ${dayOf(openUntil)}`}</span>}
            {rec && <span className="cv-chip">{many && live ? `${p!.options.length} options to pick from` : live ? priced(rec.price, rec.billing) : rec.total}</span>}
          </div>
        </header>

        {nav.length > 2 && (
          <nav className="cv-nav" aria-label="Sections">
            {nav.map(([id, label]) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
          </nav>
        )}

        <div className="cv-body">
          {g.scope.length > 0 && <Scope blocks={g.scope} from={d.from} />}

          {(p || g.invest.length > 0) && (
            <section id="invest" className="cv-part" data-section="invest">
              <span className="cv-kicker">02 · Timeline and investment</span>
              <div className="cv-titles">
                <h2 className="cv-h2">{many ? "Choose how we work together" : "Hours and investment"}</h2>
                {p && (
                  <span className="cv-sub">
                    {many ? "Each option covers the scope above to a different depth. Pick one, then add anything useful." : p.addOns.length ? "One plan. Add anything useful below." : "One plan, one price."}
                  </span>
                )}
              </div>
              {p && pick && rec && <Options p={p} pick={pick} rec={rec} from={d.from.name} onPick={onPick} onAddOn={onAddOn} live={live} />}
              {g.invest.map((b) => (
                <InvestText key={b.id} b={b} />
              ))}
            </section>
          )}

          {g.terms.length > 0 && (
            <section id="terms" className="cv-part" data-section="terms">
              <span className="cv-kicker">03 · Consulting agreement</span>
              <h2 className="cv-h2">The agreement terms</h2>
              <span className="cv-sub">
                {d.company ? `The terms between ${d.company} and ${d.from.name}.` : `The terms of this proposal.`} Open any section to read it in full.
              </span>
              {g.terms.map((b, bi) => (
                <div key={b.id} className="cv-legal" data-section={b.id}>
                  {g.terms.length > 1 && <h3 className="cv-h3">{b.title}</h3>}
                  {b.sections[0] && !b.sections[0].title && b.sections.length > 1 && (
                    <div className="cv-text cv-legal-intro">
                      <DocText text={b.sections[0].body} />
                    </div>
                  )}
                  {b.sections
                    .filter((s) => s.title)
                    .map((s, i) => (
                      <details key={i} className="cv-legal-part" open={bi === 0 && i === 0} data-section={`terms-${bi + 1}-${i + 1}`}>
                        <summary>
                          {b.sections.length > 1 ? `${i + 1}. ` : ""}
                          {s.title}
                        </summary>
                        <div className="cv-text">
                          <DocText text={s.body} />
                        </div>
                      </details>
                    ))}
                </div>
              ))}
            </section>
          )}

          <section id="sign" className="cv-part cv-sign" data-section="sign">
            {g.sign.map((b) => (
              <div key={b.id} className="cv-text cv-sign-text" data-section={b.id}>
                <DocText text={b.text} />
              </div>
            ))}
            {sign}
          </section>
        </div>
      </article>
    </div>
  );
}

/* ---------- 01 Scope ---------- */

function Scope({ blocks, from }: { blocks: Placed[]; from: FrozenDoc["from"] }) {
  const out: ReactNode[] = [];
  let i = 0;
  let firstDone = false;
  while (i < blocks.length) {
    const b = blocks[i];
    const kicker = !firstDone ? <span className="cv-kicker">01 · Scope</span> : null;
    firstDone = true;
    if (TEAM.has(b.kind)) {
      const team: Placed[] = [];
      while (i < blocks.length && TEAM.has(blocks[i].kind)) team.push(blocks[i++]);
      out.push(
        <section key={b.id} id="team" className="cv-sec" data-section="team">
          {kicker}
          <h3 className="cv-h3">Team and reporting</h3>
          <div className="cv-grid cv-grid-260">
            <div className="cv-card cv-person">
              <span className="cv-avatar" aria-hidden>
                {initials(from.name)}
              </span>
              <span className="cv-person-t">
                <strong>
                  {from.name}
                  {from.title ? ` · ${from.title}` : ""}
                </strong>
                <span>Leads this work and owns every deliverable.</span>
              </span>
            </div>
            {team.map((t) => (
              <div key={t.id} className="cv-card" data-section={t.id}>
                <strong className="cv-card-h">{t.title}</strong>
                <div className="cv-text cv-small">
                  <DocText text={t.text} />
                </div>
              </div>
            ))}
          </div>
        </section>,
      );
      continue;
    }
    if (SIDE.has(b.kind)) {
      const side: Placed[] = [];
      while (i < blocks.length && SIDE.has(blocks[i].kind)) side.push(blocks[i++]);
      out.push(
        <section key={b.id} id="assume" className="cv-sec cv-grid cv-grid-300" data-section="assume">
          {kicker}
          {side.map((s) => (
            <div key={s.id} className="cv-col" data-section={s.id}>
              <h3 className="cv-h3">{s.title}</h3>
              <div className="cv-text">
                <DocText text={s.text} />
              </div>
            </div>
          ))}
        </section>,
      );
      continue;
    }
    i++;
    out.push(<ScopeBlock key={b.id} b={b} kicker={kicker} lead={out.length === 0} />);
  }
  return (
    <div id="scope" className="cv-part cv-scope" data-section="scope">
      {out}
    </div>
  );
}

function ScopeBlock({ b, kicker, lead }: { b: Placed; kicker: ReactNode; lead: boolean }) {
  const H = lead ? "h2" : "h3";
  const head = (
    <>
      {kicker}
      <H className={lead ? "cv-h2" : "cv-h3"}>{b.title}</H>
    </>
  );
  if (b.kind === "the_math") {
    const s = statCards(b.text);
    return (
      <section id="the_math" className="cv-sec" data-section={b.id}>
        {head}
        {s.rest && (
          <div className="cv-text cv-muted">
            <DocText text={s.rest} />
          </div>
        )}
        {s.cards.length > 0 && (
          <div className="cv-grid cv-grid-240">
            {s.cards.map((c, i) => (
              <div key={i} className="cv-stat">
                <span className="cv-stat-v">{c.value}</span>
                <span className="cv-stat-l">{c.label}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }
  if (b.kind === "phases_workstreams") {
    const ph = phases(b.text);
    if (ph)
      return (
        <section id="phases_workstreams" className="cv-sec" data-section={b.id}>
          {head}
          {ph.map((x, pi) => (
            <div key={pi} className="cv-phase">
              {(x.badge || x.title) && (
                <div className="cv-phase-h">
                  {x.badge && <span className={pi === 0 ? "cv-badge" : "cv-badge cv-badge-o"}>{x.badge}</span>}
                  {x.title && <strong>{x.title.replace(/^\w/, (c) => c.toUpperCase())}</strong>}
                </div>
              )}
              {x.text && (
                <div className="cv-text">
                  <DocText text={x.text} />
                </div>
              )}
              {x.streams.map((w, wi) => (
                <details key={wi} className="cv-stream" open={pi === 0 && wi === 0} data-section={`${b.id}-${pi + 1}-${wi + 1}`}>
                  <summary>
                    <span>{w.title}</span>
                    {w.when && <span className="cv-when">{w.when}</span>}
                  </summary>
                  <div className="cv-stream-b">
                    {w.items.length > 0 && (
                      <ul className="cv-list">
                        {w.items.map((t, k) => (
                          <li key={k}>{t}</li>
                        ))}
                      </ul>
                    )}
                    {w.deliverable && (
                      <div className="cv-deliv">
                        <strong>Deliverable.</strong> {w.deliverable}
                      </div>
                    )}
                  </div>
                </details>
              ))}
              {x.items.length > 0 && (
                <ul className="cv-list">
                  {x.items.map((t, k) => (
                    <li key={k}>{t}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      );
  }
  if (b.kind === "milestones") {
    const m = milestones(b.text);
    if (m)
      return (
        <section id="milestones" className="cv-sec cv-ruled" data-section={b.id}>
          {kicker}
          <strong className="cv-h4">{b.title}</strong>
          {m.rest && (
            <div className="cv-text">
              <DocText text={m.rest} />
            </div>
          )}
          <div className="cv-grid cv-grid-200">
            {m.items.map((x, i) => (
              <div key={i} className="cv-mile">
                <span className="cv-mile-w">{x.when}</span>
                <span>{x.text}</span>
              </div>
            ))}
          </div>
        </section>
      );
  }
  if (b.kind === "success_measures") {
    const c = leadCards(b.text);
    if (c)
      return (
        <section id="success_measures" className="cv-sec" data-section={b.id}>
          {head}
          {c.rest && (
            <div className="cv-text">
              <DocText text={c.rest} />
            </div>
          )}
          <div className="cv-grid cv-grid-240">
            {c.items.map((x, i) => (
              <div key={i} className="cv-card cv-small">
                <strong className="cv-ink">{x.lead}.</strong> {x.text}
              </div>
            ))}
          </div>
        </section>
      );
  }
  return (
    <section id={b.id === b.kind ? b.kind : b.id} className="cv-sec" data-section={b.id}>
      {head}
      <div className={lead ? "cv-text cv-text-lg" : "cv-text"}>
        <DocText text={b.text} />
      </div>
    </section>
  );
}

/* ---------- 02 Timeline and investment ---------- */

function Options({ p, pick, rec, from, onPick, onAddOn, live }: { p: Pricing; pick: Choice; rec: ChoiceRec; from: string; onPick?: (id: string) => void; onAddOn?: (id: string, on: boolean) => void; live: boolean }) {
  const many = p.options.length > 1;
  const rows = many ? includedRows(p) : [];
  const t = totalWords(rec);
  return (
    <>
      {many ? (
        <div className={`cv-opts cv-opts-${p.options.length}`} role={live ? "radiogroup" : undefined} aria-label={live ? "Options" : undefined}>
          {p.options.map((o) => {
            const on = o.id === pick.optionId;
            const inner = (
              <>
                <span className="cv-opt-top">
                  <span className="cv-opt-name">{o.name}</span>
                  <span className="cv-dot" data-on={on} aria-hidden />
                </span>
                {o.recommended && <span className="cv-rec">{first(from)} recommends</span>}
                <span className="cv-opt-price">
                  {money(o.price)}
                  <span> {BILLING_SAY[o.billing]}</span>
                </span>
                {o.note && <span className="cv-opt-note">{o.note}</span>}
                {o.about && <span className="cv-opt-about">{o.about}</span>}
                {o.included.length > 0 && (
                  <ul className="cv-opt-inc">
                    {o.included.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                )}
                {!live && on && <span className="cv-chosen">Chosen</span>}
              </>
            );
            return live ? (
              <button key={o.id} type="button" role="radio" aria-checked={on} className="cv-opt" data-on={on} data-section={`option-${o.id}`} onClick={() => onPick?.(o.id)}>
                {inner}
              </button>
            ) : (
              <div key={o.id} className="cv-opt" data-on={on} data-section={`option-${o.id}`}>
                {inner}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="cv-one" data-section={`option-${p.options[0].id}`}>
          <div className="cv-one-h">
            <span className="cv-opt-name">{p.options[0].name}</span>
            <span className="cv-opt-price">
              {money(p.options[0].price)}
              <span> {BILLING_SAY[p.options[0].billing]}</span>
            </span>
          </div>
          {p.options[0].note && <span className="cv-opt-note">{p.options[0].note}</span>}
          {p.options[0].about && <span className="cv-opt-about">{p.options[0].about}</span>}
          {p.options[0].included.length > 0 && (
            <ul className="cv-list">
              {p.options[0].included.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {rows.length > 0 && (
        <div className="cv-table-wrap">
          <table className="cv-table">
            <thead>
              <tr>
                <th scope="col">What&#39;s included</th>
                {p.options.map((o) => (
                  <th key={o.id} scope="col">
                    {o.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <th scope="row">{r.label}</th>
                  {r.cells.map((c, k) => (
                    <td key={k}>{c ? <span aria-label="Included">✓</span> : <span aria-label="Not included">—</span>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {p.addOns.length > 0 && (
        <div className="cv-adds">
          <span className="cv-h4">{live ? "Add if useful" : "Add-ons"}</span>
          {p.addOns.map((a) => {
            const on = pick.addOnIds.includes(a.id);
            return (
              <label key={a.id} className="cv-add" htmlFor={`cv-add-${a.id}`} data-section={`addon-${a.id}`}>
                <input id={`cv-add-${a.id}`} type="checkbox" checked={on} disabled={!live} readOnly={!live} onChange={live ? (e) => onAddOn?.(a.id, e.target.checked) : undefined} />
                <span className="cv-add-t">
                  <span className="cv-add-n">
                    {a.name} · {priced(a.price, a.billing)}
                  </span>
                  {a.about && <span className="cv-add-a">{a.about}</span>}
                </span>
              </label>
            );
          })}
        </div>
      )}
      <div className="cv-total" aria-live="polite">
        <span className="cv-total-l">{live ? "Your investment" : "The investment signed"}</span>
        <span className="cv-total-v">{t.line}</span>
        <span className="cv-total-s">{t.sub}</span>
      </div>
    </>
  );
}

/** The investment's own words under the options: "Term: …" lines as a two-column list, else paragraphs. */
function InvestText({ b }: { b: Placed }) {
  const lines = b.text.split("\n").filter((l) => l.trim());
  const pairs = lines.map((l) => l.trim().replace(/^[-•]\s+/, "").match(/^([^:]{2,40}):\s+(.+)$/));
  const allPairs = lines.length >= 2 && pairs.every(Boolean);
  return (
    <div className="cv-sec" data-section={b.id}>
      <h3 className="cv-h3">{b.title}</h3>
      {allPairs ? (
        <div className="cv-grid cv-grid-260 cv-terms">
          {pairs.map((m, i) => (
            <div key={i}>
              <strong className="cv-ink">{m![1]}.</strong> {m![2]}
            </div>
          ))}
        </div>
      ) : (
        <div className="cv-text">
          <DocText text={b.text} />
        </div>
      )}
    </div>
  );
}

/* ---------- the parties, for the signatures ---------- */

type Sig = { kind: "typed" | "drawn"; typed: string | null; img: string | null };
/** A signature as signed: the drawing, or the words in the script face. */
const SigMark = ({ sig, name }: { sig: Sig | null; name: string }) => (
  <span className="cv-sigmark">{sig?.kind === "drawn" && sig.img ? <img src={sig.img} alt={`${name}'s signature`} className="cv-sigimg" /> : <span className="cv-script">{sig?.typed ?? name}</span>}</span>
);

/**
 * Both sides' signature cards, as each stands: the client's "Signs here" or their signature; the
 * member's signature (signed as sent, or countersigned), "Countersigns after you", "Countersigns
 * next" once the client signed, or "Prepared and sent by" when they don't sign.
 */
export function Parties({
  doc: d,
  client,
  member,
}: {
  doc: FrozenDoc;
  /** The person who signs on this link (the addressee, or who it was passed to), with their title. */
  client: { state: "here" | "signed"; name?: string | null; title?: string | null; at?: string | null };
  member: { state: "signed" | "after" | "waiting" | "none"; sig?: (Sig & { name: string; title: string; at: string; how: string }) | null };
}) {
  const ms = member.state === "signed" ? member.sig ?? null : null;
  return (
    <div className="cv-grid cv-grid-260">
      <div className="cv-party" data-state={client.state === "here" ? "here" : "signed"}>
        <span className="cv-party-co">{d.company || "For the client"}</span>
        {client.state === "signed" && <SigMark sig={null} name={client.name ?? d.to.name} />}
        <strong>
          {client.name ?? d.to.name}
          {(client.title ?? d.to.title) ? `, ${client.title ?? d.to.title}` : ""}
        </strong>
        <span className="cv-party-s">{client.state === "here" ? "Signs here" : `Signed ${dayOf(client.at ?? null)}`}</span>
      </div>
      <div className="cv-party" data-state={member.state}>
        <span className="cv-party-co">{member.state === "none" ? "Prepared and sent by" : d.from.name}</span>
        {ms && <SigMark sig={ms} name={ms.name} />}
        <strong>
          {ms ? ms.name : d.from.name}
          {(ms ? ms.title : d.from.title) ? `, ${ms ? ms.title : d.from.title}` : ""}
        </strong>
        <span className="cv-party-s">
          {ms
            ? `${ms.how === "saved_at_send" ? "Signed" : "Countersigned"} ${dayOf(ms.at)}`
            : member.state === "after"
              ? "Countersigns after you"
              : member.state === "waiting"
                ? `Countersigns next`
                : `Sent ${dayOf(d.preparedAt)}`}
        </span>
      </div>
    </div>
  );
}

/** The member's card state for a send. */
export const memberState = (mode: "now" | "after" | "none", member: unknown, clientSigned: boolean): "signed" | "after" | "waiting" | "none" =>
  member ? "signed" : mode === "after" ? (clientSigned ? "waiting" : "after") : "none";

/* ---------- the seal ---------- */

/** "Sealed by Merlin": who signed, how they were checked, the audit trail, the download and Check a copy. */
export function SealCard({ at, signers, events, pdf, check }: { at: string; signers: string[]; events: number; pdf: string | null; check: string }) {
  return (
    <section className="cv-seal" aria-labelledby="cv-seal-h">
      <div className="cv-seal-top">
        <span className="cv-seal-ic" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </span>
        <span className="cv-seal-t">
          <span id="cv-seal-h" className="cv-seal-h">
            Sealed by Merlin
          </span>
          <span className="cv-seal-at">{sealStamp(at)}</span>
        </span>
      </div>
      <p className="cv-seal-p">Any change to the PDF after signing breaks the seal. Check a copy shows whether a file is the one that was signed.</p>
      <dl className="cv-seal-dl">
        <div>
          <dt>Signed by</dt>
          <dd>{signers.join(", ")}</dd>
        </div>
        <div>
          <dt>Identity check</dt>
          <dd>Code to each email</dd>
        </div>
        <div>
          <dt>Audit trail</dt>
          <dd>{events} events, last page</dd>
        </div>
      </dl>
      <div className="cv-seal-go">
        {pdf && (
          <a className="cv-btn cv-btn-pine" href={pdf}>
            Download the signed PDF
          </a>
        )}
        <a className="cv-btn" href={check}>
          Check a copy
        </a>
      </div>
    </section>
  );
}
const sealStamp = (iso: string) =>
  `${new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}, ${new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })} UTC`;
