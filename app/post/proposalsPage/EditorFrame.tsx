"use client";

/**
 * One proposal in the new look (ProposalEditor.dc.html), in three columns under the shell's header:
 *
 *   the top       the title (edited in place), the status, the company, the version and whether it
 *                 is saved; See it as the client will; More (Duplicate, Delete, Void); the one main
 *                 button (Send for signature, Countersign, or Sent to them)
 *   the outline   every section with its state (Ready, 2 blanks, Changed, Evidence Bank is coming),
 *                 the picked one moves up or down or goes; Add a block with why; what good looks like
 *                 for the picked one; the linked deal
 *   the document  as the client reads it: tap a section to edit it in place; the options and add-ons
 *                 after the investment; Proof says Evidence Bank is coming (it fills Proof once it opens)
 *   the right     Change it (Merlin; the versions with Compare and Bring back; what was kept from the
 *                 call), Pricing (what to charge, the options and add-ons), Send (who signs, your
 *                 signature, the link's length, reminders, alerts) or, once sent, its status and activity
 *
 * The saving, the revision check and the two-tab banner, the offline retry and the leave guards are
 * the editor's own (Proposals.tsx Editor); this file only places what it hands over.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ProposalBlock, ProposalRec, ProposalsView } from "@/lib/proposals/types";
import { priced } from "@/lib/proposals/pricing";
import { PRICES, TRIAL_NAME } from "@/lib/billing/rules";
import { useAppMaybe } from "../shell/pages";
import { ProposalStatus } from "../ProposalParts";
import { openPlans } from "../Billing";
import { IconChevron, IconPlus, IconX } from "../../ui/shared";
import { blockState, firstName } from "./model";
import { ClientPreview } from "./ClientPreview";
import "./proposalsPage.css";

export type SideTab = "change" | "pricing" | "send";

export interface EditorFrameProps {
  p: ProposalRec;
  data: ProposalsView;
  readOnly: boolean;
  locked: boolean;
  signed: boolean;
  out: boolean;
  changing: boolean;
  save: "saved" | "saving" | "retrying" | "error";
  /** The blocks as they read now (with a change shown, as they would after it), the fields they fill from, the ones a change marks. */
  blocks: ProposalBlock[];
  fields: Record<string, string>;
  marked: Set<string>;
  previewing: boolean;
  editing: string | null;
  setEditing: (id: string | null) => void;
  onTitle: (v: string) => void;
  move: (from: number, to: number) => void;
  removeBlock: (id: string) => void;
  /** The section, as the editor draws it (read, or open to edit in place). */
  section: (b: ProposalBlock) => ReactNode;
  guide: (b: ProposalBlock) => ReactNode;
  /** Add a block, with why (AddBlock), and the peers' Your team offer, and Add a section. */
  addBlock: ReactNode;
  teamOffer: ReactNode;
  onAddSection: () => void;
  /** The banners above the columns: the two-tab conflict, not linked, Close, read only, signed, a change saved. */
  banners: ReactNode;
  fixLine: ReactNode;
  changeIt: ReactNode;
  versions: ReactNode;
  callPanel: ReactNode;
  rates: ReactNode;
  pricing: ReactNode;
  /** Send's form while it can go; its status and activity once it went. */
  sendPanel: ReactNode;
  sentPanel: ReactNode;
  tab: SideTab | null;
  onBack: () => void;
  act: (op: "void" | "duplicate" | "delete") => void;
  /** Make a new version of one out for signature (the old link stops working). */
  onChangeIt: () => void;
}

export function EditorFrame(x: EditorFrameProps) {
  const { p, data } = x;
  const c = useAppMaybe();
  const [tab, setTab] = useState<SideTab>(x.tab ?? (p.status === "client_signed" || x.out ? "send" : "change"));
  useEffect(() => {
    if (x.tab) setTab(x.tab);
  }, [x.tab]);
  const [sel, setSel] = useState<string | null>(null);
  const [client, setClient] = useState(false);
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!more) return;
    const off = (e: MouseEvent) => !moreRef.current?.contains(e.target as Node) && setMore(false);
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [more]);
  const picked = x.blocks.find((b) => b.id === (x.editing ?? sel)) ?? null;
  const who = firstName(p.send?.signer.name || p.signer?.name || p.fields["client.signerName"]) || "the client";
  const Who = who === "the client" ? "The client" : who;
  const canSendNow = !x.locked && !x.signed && (!x.out || x.changing);
  const go = (id: string) => {
    setSel(id);
    document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const opts = p.pricing?.options ?? [];
  const adds = p.pricing?.addOns ?? [];
  const rec = opts.find((o) => o.recommended) ?? opts[0];
  const pricingCard =
    opts.length > 0 ? (
      <section className="pz-doc-price" aria-label="Options to pick from">
        <p className="pz-note">{opts.length > 1 ? `${Who} picks one option and any add-ons, sees the total, and signs that choice.` : "One price, with its total."}</p>
        <div className="pz-opts-grid" data-n={opts.length}>
          {opts.map((o, i) => (
            <div key={o.id} className="pz-opt" data-rec={(opts.length > 1 && o.id === rec?.id) || undefined}>
              <span className="pz-tag">{opts.length > 1 && o.id === rec?.id ? "Recommended" : `Option ${i + 1}`}</span>
              <strong>{o.name || "No name yet"}</strong>
              <span className="pz-opt-price">{o.price ? priced(o.price, o.billing) : "No price yet"}</span>
              {o.note && <span className="pz-note">{o.note}</span>}
              {o.included.map((t) => (
                <span key={t} className="pz-inc">
                  {t}
                </span>
              ))}
            </div>
          ))}
        </div>
        {adds.length > 0 && (
          <div className="pz-adds">
            <strong>Add-ons, if you want them</strong>
            {adds.map((a) => (
              <span key={a.id}>
                <strong>{a.name || "No name yet"}</strong>
                {a.about && <span className="pz-note"> {a.about}</span>}
                <strong className="pz-add-p">{a.price ? priced(a.price, a.billing) : "No price yet"}</strong>
              </span>
            ))}
          </div>
        )}
        {!x.readOnly && (
          <button type="button" className="btn btn-sm" onClick={() => setTab("pricing")}>
            Edit options
          </button>
        )}
      </section>
    ) : null;
  const hasInvestment = x.blocks.some((b) => b.blockId === "investment");
  const sentWords = p.status === "client_signed" ? `${Who} signed. Your turn to countersign` : x.signed ? "Signed by both" : x.out ? `Sent, waiting for ${who} to sign` : "";
  const plan = c?.me.plan;
  const planText = plan?.name === "trial" && plan.trialDaysLeft != null ? `Proposals are part of Close. Included in your ${TRIAL_NAME}: ${plan.trialDaysLeft} ${plan.trialDaysLeft === 1 ? "day" : "days"} left, then $${PRICES.closeMonth} a month.` : data.canBuild ? "Close plan · proposals, contracts and signing" : "";

  return (
    <div className="pz-ed">
      <div className="pz-ed-top">
        <button type="button" className="pz-back" onClick={x.onBack}>
          <IconChevron dir="left" /> All proposals
        </button>
        <div className="pz-ed-title">
          <input className="pz-title" aria-label="Proposal title" value={p.title} readOnly={x.readOnly} maxLength={160} onChange={(e) => x.onTitle(e.target.value.replace(/\s*\n\s*/g, " "))} />
          <span className="pz-ed-meta">
            <ProposalStatus status={p.status} />
            {p.company.id && c ? (
              <a href={`/?c=${encodeURIComponent(p.company.id)}`} onClick={(e) => (e.preventDefault(), c.openCompany(p.company.id!))}>
                {p.company.name}
              </a>
            ) : (
              <span>{p.company.name || "No company yet"}</span>
            )}
            <span>
              Version {p.version} · {x.save === "saving" ? "Saving" : x.save === "retrying" ? "Not saved, retrying" : x.save === "error" ? "Not saved" : x.previewing ? "change not saved yet" : x.readOnly ? "read only" : "Saved"}
            </span>
          </span>
        </div>
        <span className="pz-ed-acts">
          <button type="button" className="btn" onClick={() => setClient(true)}>
            See it as {who} will
          </button>
          <div className="pz-more" ref={moreRef}>
            <button type="button" className="btn" aria-expanded={more} onClick={() => setMore((m) => !m)}>
              More
            </button>
            {more && (
              <div className="pz-more-menu" role="menu">
                {!x.locked && (
                  <button type="button" role="menuitem" onClick={() => (setMore(false), x.act("duplicate"))}>
                    Duplicate
                  </button>
                )}
                {x.out && (
                  <button type="button" role="menuitem" onClick={() => (setMore(false), x.act("void"))}>
                    Void
                  </button>
                )}
                {!x.signed && (
                  <button type="button" role="menuitem" onClick={() => (setMore(false), x.act("delete"))}>
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
          {p.status === "client_signed" ? (
            <button type="button" className="btn btn-pine btn-lg" onClick={() => setTab("send")}>
              Countersign
            </button>
          ) : x.out && !x.changing ? (
            <button type="button" className="btn btn-lg" onClick={() => setTab("send")}>
              Sent to {who}
            </button>
          ) : canSendNow ? (
            <button type="button" className="btn btn-pine btn-lg" onClick={() => setTab("send")}>
              Send for signature
            </button>
          ) : null}
        </span>
      </div>
      {x.banners}
      {x.fixLine}
      <div className="pz-ed-cols">
        <aside className="pz-ed-left" aria-label="Sections">
          <div className="pz-ol">
            <span className="pz-ol-h">
              <strong>Sections</strong>
              <span className="pz-note">{x.readOnly ? "As it was sent" : "Pick one to move it"}</span>
            </span>
            <ol>
              {x.blocks.map((b, i) => {
                const st = blockState(b, p, x.fields, { marked: x.marked.has(b.id), editing: x.editing === b.id });
                const on = picked?.id === b.id;
                return (
                  <li key={b.id} data-on={on || undefined}>
                    <button type="button" className="pz-ol-go" aria-current={on || undefined} onClick={() => go(b.id)}>
                      <span className="pz-ol-t">
                        {i + 1}. {b.title}
                      </span>
                      <span className="pz-ol-s" data-tone={st.tone}>
                        <span className="pz-ol-dot" aria-hidden />
                        {st.text}
                      </span>
                    </button>
                    {on && !x.readOnly && !x.previewing && (
                      <span className="pz-ol-acts">
                        <button type="button" className="tp-iconbtn tp-iconbtn-sm" aria-label={`Move ${b.title} up`} disabled={i === 0} onClick={() => x.move(i, i - 1)}>
                          <IconChevron dir="up" />
                        </button>
                        <button type="button" className="tp-iconbtn tp-iconbtn-sm" aria-label={`Move ${b.title} down`} disabled={i === x.blocks.length - 1} onClick={() => x.move(i, i + 1)}>
                          <IconChevron dir="down" />
                        </button>
                        <button type="button" className="tp-iconbtn tp-iconbtn-sm" aria-label={`Remove ${b.title}`} onClick={() => (x.removeBlock(b.id), setSel(null))}>
                          <IconX size={14} />
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
            {!x.readOnly && !x.previewing && x.addBlock}
          </div>
          {picked && x.guide(picked)}
          <section className="pz-deal" aria-label="Linked deal">
            <strong>Linked deal</strong>
            {p.company.id ? (
              <>
                <span className="pz-note">
                  {p.company.name} is in your pipeline{x.out ? ", at Proposal" : ""}. When {who} signs, the deal moves to Won by itself.
                </span>
                <span className="pz-deal-acts">
                  <a href={c?.hrefOf("pipeline") ?? "/?p=pipeline"} onClick={(e) => c && (e.preventDefault(), c.openPage("pipeline"))}>
                    Open the deal
                  </a>
                </span>
              </>
            ) : (
              <span className="pz-note">Not linked to a company yet, so your pipeline won&#39;t move when they sign. Pick the company above the document.</span>
            )}
          </section>
        </aside>

        <section className="pz-ed-doc" aria-label="The proposal as the client reads it">
          {x.previewing && (
            <div className="pz-banner" role="status">
              You are looking at the change. The changed sections are marked. Nothing is saved until you accept it.
            </div>
          )}
          <article className="pz-paper sg-doc">
            <span className="pz-k">Proposal</span>
            <h1 className="pz-doc-h">{p.title}</h1>
            <span className="pz-note">
              Prepared for {[p.signer?.name || p.fields["client.signerName"], p.signer?.title || p.fields["client.signerTitle"]].filter(Boolean).join(", ") || "the person who signs"}
              {p.company.name ? `, ${p.company.name}` : ""} · by {[data.me.name, data.me.title].filter(Boolean).join(", ")}
            </span>
            {x.blocks.map((b) => (
              <div key={b.id} className="pz-blk" data-on={picked?.id === b.id || undefined} onFocusCapture={() => setSel(b.id)}>
                {x.section(b)}
                {b.blockId === "proof" && (
                  <div className="pz-proof" role="note">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M4 5h16v14H4zM8 9h8M8 13h5" />
                    </svg>
                    <span>
                      <strong>Evidence Bank is coming.</strong> Your own case studies, matched to {p.company.name || "this client"}, will fill Proof here, with the client&#39;s name hidden unless you show it. Until then, write it in your own words, or leave it out.
                    </span>
                    {!x.readOnly && !x.previewing && (
                      <button type="button" className="btn btn-sm" onClick={() => x.removeBlock(b.id)}>
                        Send without Proof
                      </button>
                    )}
                  </div>
                )}
                {b.blockId === "investment" && pricingCard}
              </div>
            ))}
            {!hasInvestment && pricingCard}
            {x.teamOffer}
            {!x.readOnly && !x.previewing && (
              <button type="button" className="pp-addsec" onClick={x.onAddSection}>
                <IconPlus /> Add a section
              </button>
            )}
          </article>
        </section>

        <aside className="pz-ed-right" aria-label="Change, price and send">
          <div className="pz-tabs" role="tablist" aria-label="Proposal tools">
            {(
              [
                ["change", "Change it"],
                ["pricing", "Pricing"],
                ["send", x.signed || (x.out && !x.changing) || p.status === "client_signed" ? "Signing" : "Send"],
              ] as [SideTab, string][]
            ).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>
          <div className="pz-side" role="tabpanel">
            {tab === "change" && (
              <>
                {x.out && !x.changing && !x.signed && (
                  <div className="pz-banner">
                    <span>
                      It is out for signature, so it stays as it was sent. Changing it makes version {p.version + 1}, and the link {who} has stops working.
                    </span>
                    <button type="button" className="btn btn-sm" onClick={x.onChangeIt}>
                      Change it anyway
                    </button>
                  </div>
                )}
                {!(x.out && !x.changing) && x.changeIt}
                {x.versions}
                {x.callPanel}
              </>
            )}
            {tab === "pricing" && (
              <>
                {x.rates}
                {x.pricing}
              </>
            )}
            {tab === "send" && (
              <>
                {p.send && x.sentPanel}
                {canSendNow ? x.sendPanel : !p.send && <span className="pz-note">{x.locked ? "Sending for signature is on Close." : "It is signed, so there is nothing to send."}</span>}
              </>
            )}
          </div>
        </aside>
      </div>
      <div className="pz-ed-foot">
        <span>
          Version {p.version} · {x.blocks.length} sections{sentWords ? ` · ${sentWords}` : ""}
        </span>
        {planText && (
          <span>
            {planText}{" "}
            {plan?.name === "trial" && (
              <button type="button" className="tp-flink" onClick={() => openPlans("proposals")}>
                Upgrade
              </button>
            )}
          </span>
        )}
      </div>
      {client && <ClientPreview p={p} close={data.canSend} me={data.me} onClose={() => setClient(false)} />}
    </div>
  );
}
