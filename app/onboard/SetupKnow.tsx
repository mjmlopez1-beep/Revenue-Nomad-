"use client";

/**
 * The set-up's step 4 and step 5 (Setup.tsx):
 *
 *   Who you know   three sources, each on its own or together (the owner's decision), all optional:
 *       Google contacts and calendar (Connect Google, read-only: the member comes back to this step),
 *       the member's own LinkedIn connections file and any contacts CSV (the same LinkedInAct and
 *       CsvAct as Settings / Connections and the People page). What Merlin reads and never reads, in
 *       the words of network/ConnectPanel.tsx SOURCE_TEXT. Google stays private to the member: only
 *       they see what it brings in, and it never adds anyone to Merlin (Google's Limited Use rules).
 *   Open your first company   the profile is in (Setup.tsx), so Crystal Ball has its companies:
 *       three of them, each opened as Crystal Ball opens it (Me.crystal: free on Trial and Pro, Free's
 *       one a day, else the company's own price, quoted first), or the first view's top three when
 *       Crystal Ball is empty. Opened, it says who held the seat (free once the company is open), who
 *       decides (name and title, 1 credit, asked first) and the way in, with Add to pipeline.
 */
import { useEffect, useMemo, useState } from "react";
import { IconCheck, type Act, type View } from "../ui/shared";
import { COMPANY_PRICE } from "@/lib/tableFields";
import type { RadarRow } from "@/lib/radar/types";
import { bestBuyer, moveWhy } from "@/lib/moves";
import { shown, type CoInfo } from "@/app/post/model";
import { GoogleG, startGoogle } from "@/app/post/network/Network";
import { useNetwork } from "@/app/post/network/useNetwork";
import { useKnown, usePaths } from "@/app/post/network/usePaths";
import { CsvAct, LinkedInAct, SOURCE_TEXT, type SourceKey } from "@/app/post/network/ConnectPanel";
import { buyerLabel, wayInSeatsOf } from "@/app/post/company/sections/WayIn";
import type { FirstView } from "./firstView";
import { Head } from "./setupParts";
import { SETUP_STEPS, companyLabel, factsLine, type FirstRow } from "./setupModel";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** What the member brought in so far, for the stepper and the side column. */
export function useKnowCounts(): { any: boolean; line: string; people: number } {
  const { view: paths } = usePaths();
  const net = useNetwork();
  const known = useKnown();
  const google = !!net.view?.google && net.view.google.status !== "reconnect";
  const people = (known.known?.people ?? []).filter((p) => !p.away && p.company).length;
  const srcs = [google ? "Google" : "", paths?.linkedin ? "LinkedIn file" : "", paths?.csv ? "CSV" : ""].filter(Boolean);
  const any = srcs.length > 0;
  return { any, people, line: any ? (people ? `${plural(people, "person", "people")} you know` : srcs.join(", ")) : "" };
}

/* ---------- step 4: who you know ---------- */

const ICON: Record<SourceKey, string> = { google: "M4 6h16v12H4zM4 7l8 6 8-6", linkedin: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4", csv: "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14" };

export function KnowScreen({ onLeave }: { onLeave: () => void }) {
  const { view: paths } = usePaths();
  const net = useNetwork();
  const known = useKnown();
  const [open, setOpen] = useState<SourceKey | null>(null);
  const g = net.view?.google ?? null;
  const googleOn = !net.off && !!net.view;
  const googleReady = googleOn && !!net.view?.configured;
  const googleIn = !!g && g.status !== "reconnect";
  const people = (known.known?.people ?? []).filter((p) => !p.away && p.company);
  const ways = paths ? Object.keys(paths.counts).length : 0;
  const status = (k: SourceKey): string | null => {
    if (k === "google") return googleIn ? `Connected${g?.syncedAt ? `. Read ${new Date(g.syncedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}. Merlin reads it again once a day.` : null;
    const info = k === "linkedin" ? paths?.linkedin : paths?.csv;
    return info ? `${plural(info.rows, k === "linkedin" ? "connection" : "contact", k === "linkedin" ? "connections" : "contacts")} read, ${info.matched.toLocaleString("en-US")} at companies on Merlin.` : null;
  };
  // The three sources' words (ConnectPanel.tsx SOURCE_TEXT), said once for all three.
  const reads = ["Names, companies and titles of your contacts", "Who was in your calendar meetings, and in which months", "The rows of a file you choose to add, and for a CSV only the columns you pick"];
  const nevers = ["The text of any email or message", "Meeting titles, notes or attachments", "Anything in your contacts' own accounts", "Your contacts are never shown to another member, and nobody on them is contacted"];
  return (
    <>
      <Head eyebrow={`Step 4 of ${SETUP_STEPS} · Optional`} title="Who you know">
        Bring in your contacts and Merlin finds the people who can open a door at the companies that fit. Each source works on its own or with the others. Only you see your network.
      </Head>
      <div className="su-count" aria-live="polite">
        <strong className="su-count-n num">{people.length.toLocaleString("en-US")}</strong>
        <span className="su-count-t">
          <strong>{people.length === 1 ? "person you know at a company on Merlin" : "people you know at companies on Merlin"}</strong>
          <span>{ways ? `${plural(ways, "company", "companies")} with a way in so far` : "Bring in a source and this counts up."}{known.known?.locked ? ` ${plural(known.known.locked, "more is at a locked company", "more are at locked companies")}: they show once you open it.` : ""}</span>
        </span>
      </div>
      <div className="su-sources">
        {(["google", "linkedin", "csv"] as SourceKey[]).map((k) => {
          const t = SOURCE_TEXT[k];
          const st = status(k);
          const off = k === "google" && !googleReady;
          return (
            <article key={k} className={`su-src${st ? " in" : ""}`} aria-label={t.name}>
              <span className="su-src-top">
                <span className="su-src-i" aria-hidden>
                  {k === "google" ? (
                    <GoogleG size={18} />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d={ICON[k]} />
                    </svg>
                  )}
                </span>
                <span className="su-src-t">
                  <strong>{t.name}</strong>
                  <span>{k === "google" ? "Your contacts and calendar, read only. Merlin sees who you met and in which months, then matches them to companies." : k === "linkedin" ? "The Connections.csv from your own LinkedIn data export. It arrives by email a few minutes after you ask for it." : "Any list with a name and a company in it: a CRM export, a conference list, your own spreadsheet."}</span>
                </span>
              </span>
              {st ? (
                <span className="su-ok" role="status">
                  <IconCheck size={14} /> {st}
                </span>
              ) : null}
              {k === "google" ? (
                off ? (
                  <span className="su-small">Google isn&apos;t on for Merlin yet. Your LinkedIn file or a CSV works without it.</span>
                ) : googleIn ? null : (
                  <span className="su-src-acts">
                    <button
                      type="button"
                      className="su-pine"
                      onClick={() => {
                        onLeave();
                        startGoogle("onboard");
                      }}
                    >
                      Connect Google
                    </button>
                    <span className="su-small">You come back to this step after Google asks you.</span>
                  </span>
                )
              ) : open === k ? (
                k === "linkedin" ? (
                  <LinkedInAct paths={paths} onAdded={() => setOpen(null)} />
                ) : (
                  <CsvAct paths={paths} wide={false} onAdded={() => setOpen(null)} />
                )
              ) : (
                <span className="su-src-acts">
                  <button type="button" className={st ? "su-ghost" : "su-pine"} onClick={() => setOpen(k)}>
                    {st ? "Manage it" : k === "linkedin" ? "Add Connections.csv" : "Add a CSV"}
                  </button>
                  <span className="su-small">{k === "linkedin" ? "No file yet? Skip, and add it later in Settings." : "Columns are matched for you, and you see a preview first."}</span>
                </span>
              )}
              {k === "google" ? (
                <span className="su-small">
                  Google stays private: only you see what it brings in, and Merlin never uses it to add anyone to Merlin or to show anyone else.{" "}
                  <a className="su-a" href="/privacy#google" target="_blank" rel="noreferrer">
                    How Merlin uses your Google data
                  </a>
                </span>
              ) : null}
            </article>
          );
        })}
      </div>
      <section className="su-reads" aria-label="What Merlin reads">
        <div>
          <strong>What Merlin reads</strong>
          {reads.map((x) => (
            <span key={x} className="su-read">
              <IconCheck size={13} /> {x}
            </span>
          ))}
        </div>
        <div>
          <strong>What Merlin never does</strong>
          {nevers.map((x) => (
            <span key={x} className="su-read su-never">
              <span aria-hidden>×</span> {x}
            </span>
          ))}
        </div>
      </section>
      {!people.length ? (
        <p className="su-small">Nothing here yet. If you skip, Merlin still shows the fractional who held each seat as a way in, and you can bring your contacts in later from Settings.</p>
      ) : null}
    </>
  );
}

/* ---------- step 5: the first company ---------- */

/** How this member opens a company from here, and what it costs (the server checks it again). */
function openMode(me: NonNullable<View["me"]>, crystal: boolean): { cost: number; from?: "crystal"; label: string } {
  if (crystal && me.crystal === "all") return { cost: 0, from: "crystal", label: "Open free" };
  if (crystal && me.crystal === "one") return { cost: 0, from: "crystal", label: "Open free · 1 a day" };
  if (me.proOpens && me.proOpens.left > 0) return { cost: 0, label: "Open free" };
  return { cost: COMPANY_PRICE, label: `Open · ${COMPANY_PRICE} credits` };
}

export function FirstScreen(p: {
  view: View;
  act: Act;
  infos: CoInfo[];
  fn: string | null;
  fv: FirstView | null;
  /** The profile is in: Crystal Ball has the member's companies. */
  ready: boolean;
  ideal: boolean;
  opened: string | null;
  setOpened: (id: string) => void;
  knownAny: boolean;
  onKnow: () => void;
  onPage: (id: string) => void;
}) {
  const me = p.view.me!;
  const [ball, setBall] = useState<RadarRow[] | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!p.ready || ball) return;
    let live = true;
    void fetch("/api/table?radar=1&range=auto", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { rows?: RadarRow[] } | null) => live && setBall(Array.isArray(j?.rows) ? j!.rows : []))
      .catch(() => live && setBall([]));
    return () => {
      live = false;
    };
  }, [p.ready, ball]);
  const byId = useMemo(() => new Map(p.infos.map((i) => [i.c.id, i])), [p.infos]);
  const fromBall = !!ball && ball.length > 0;
  // Three from Crystal Ball; when it has fewer, the first view tops them up (each says where it is from and opens at its own price).
  const rows: FirstRow[] = useMemo(() => {
    const out: FirstRow[] = (ball ?? []).slice(0, 3).map((r) => {
      const i = byId.get(r.id);
      return { id: r.id, crystal: true, name: r.name ?? (i && !i.c.hidden ? i.c.name : null), meta: i ? factsLine(i) : "", band: r.band ?? null, why: moveWhy(r) };
    });
    for (const r of p.fv?.rows ?? []) {
      if (out.length >= 3) break;
      if (out.some((x) => x.id === r.i.c.id)) continue;
      const hired = r.i.fnState.hired.filter((f) => f !== "Other");
      out.push({ id: r.i.c.id, crystal: false, name: r.i.c.hidden ? null : r.i.c.name, meta: factsLine(r.i), band: null, why: hired.length ? `From your first view: hired fractional ${hired.slice(0, 2).join(" and ")}` : "From your first view: has hired fractionals before" });
    }
    return out;
  }, [ball, byId, p.fv]);
  const modeOf = (r: FirstRow) => openMode(me, r.crystal);
  const wayShort = (id: string) => {
    const i = byId.get(id);
    if (!i) return "Seen once it is open";
    if (wayInSeatsOf(i, p.fn).length) return "Through the fractional who held a seat";
    if (bestBuyer(i.c, p.fn)) return "Who decides is on file";
    return "No path yet";
  };
  const open = async (id: string) => {
    setErr(null);
    const mode = modeOf(rows.find((x) => x.id === id) ?? { id, crystal: false, name: null, meta: "", band: null, why: "" });
    if (mode.cost > 0 && asking !== id) return setAsking(id);
    setBusy(id);
    const r = await p.act({ type: "unlock", entity: "company", id, field: "identity", ...(mode.from ? { from: mode.from } : {}) }, { quiet: true, silentError: true });
    setBusy(null);
    setAsking(null);
    if (r.ok) p.setOpened(id);
    else setErr(r.message);
  };
  const cur = p.opened ? byId.get(p.opened) ?? null : null;
  return (
    <>
      <Head eyebrow={`Step 5 of ${SETUP_STEPS}`} title="Open your first company">
        {fromBall
          ? `${ball!.length >= 3 ? "Three" : ball!.length === 1 ? "One" : "Two"} from your Crystal Ball: companies likely to need ${p.fn && p.fn !== "Other" ? p.fn : "you"} next${p.ideal ? ", inside your ideal client" : ""}.${me.crystal === "all" ? " Each opens free and does not count toward your 15 a day." : ""}${ball!.length < 3 && rows.length > ball!.length ? " Your first view fills in the rest." : ""}`
          : "Three companies from your first view: they hired a fractional before and fit what you picked."}
      </Head>
      {!p.ready || !ball ? (
        <div role="status" aria-busy className="su-skel-rows">
          <span className="sr-only">Finding the companies most likely to hire you next</span>
          {[0, 1, 2].map((k) => (
            <span key={k} className="su-skel-row" aria-hidden />
          ))}
        </div>
      ) : (
        <div className="su-first" role="table" aria-label="Three companies to open">
          <div className="su-first-row su-first-head" role="row">
            <span role="columnheader">Company</span>
            <span role="columnheader">Why now</span>
            <span role="columnheader">Your way in</span>
            <span role="columnheader">Open</span>
          </div>
          {rows.map((r, k) => {
            const i = byId.get(r.id);
            const mode = modeOf(r);
            const isOpen = p.opened === r.id || (!!i && !i.c.hidden && r.id === p.opened);
            const named = i && !i.c.hidden ? i.c.name : r.name;
            return (
              <div key={r.id} className={`su-first-row${p.opened === r.id ? " cur" : ""}`} role="row">
                <span role="cell" className="su-like-co">
                  <span className="su-tile-q" aria-hidden>
                    {named ? named.slice(0, 1) : "?"}
                  </span>
                  <span>
                    <strong>{named ?? (i ? companyLabel(i) : "A locked company")}</strong>
                    <span>{r.meta}</span>
                  </span>
                </span>
                <span role="cell" className="su-why-cell">
                  {r.band ? <span className={`su-band ${r.band.toLowerCase()}`}>{r.band}</span> : null}
                  <span>{r.why}</span>
                </span>
                <span role="cell">{wayShort(r.id)}</span>
                <span role="cell">
                  {isOpen ? (
                    <span className="su-ok">
                      <IconCheck size={13} /> Open
                    </span>
                  ) : p.opened ? null : asking === r.id ? (
                    <span className="su-acts">
                      <button type="button" className="su-pine" disabled={busy === r.id} onClick={() => void open(r.id)}>
                        {busy === r.id ? "Opening" : `Yes, spend ${mode.cost}`}
                      </button>
                      <button type="button" className="su-link" onClick={() => setAsking(null)}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="su-pine" aria-label={`${mode.label}: company ${k + 1}`} disabled={!!busy} onClick={() => void open(r.id)}>
                      {busy === r.id ? "Opening" : mode.label}
                    </button>
                  )}
                </span>
              </div>
            );
          })}
          {!rows.length ? <p className="su-small">No company to offer here yet. Crystal Ball fills in as Merlin reads new signals.</p> : null}
        </div>
      )}
      {asking ? <p className="su-small" role="status">Opening costs {COMPANY_PRICE} credits. You have {me.credits}. It shows the company&apos;s name and website, and stays open for you.</p> : null}
      {err ? (
        <p className="su-err" role="alert">
          {err}
        </p>
      ) : null}
      {!p.opened ? (
        <p className="su-small">Pick one to open. You will see its name, who held the seat, who decides and your way in.{rows.every((r) => modeOf(r).cost === 0) ? " Opening costs 0 credits here." : ""}</p>
      ) : cur ? (
        <Opened i={cur} fn={p.fn} act={p.act} credits={me.credits} onPage={() => p.onPage(cur.c.id)} />
      ) : null}
      {p.opened && !p.knownAny ? (
        <p className="su-small">
          You skipped Who you know, so this way in comes from Merlin&apos;s data alone.{" "}
          <button type="button" className="su-a" onClick={p.onKnow}>
            Bring in your contacts
          </button>{" "}
          to see if you know someone closer.
        </p>
      ) : null}
    </>
  );
}

/** The company just opened: who held the seat (free), who decides (1 credit, asked first), the way in, Add to pipeline. */
function Opened({ i, fn, act, credits, onPage }: { i: CoInfo; fn: string | null; act: Act; credits: number; onPage: () => void }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [piped, setPiped] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seat = wayInSeatsOf(i, fn)[0] ?? null;
  const holderCell = seat?.cells.operator;
  const holder = holderCell?.s === "value" ? holderCell.v : null;
  const holderRole = seat ? shown(seat.cells.role) ?? shown(seat.cells.function) : null;
  const buyer = bestBuyer(i.c, fn);
  const dmName = buyer ? shown(buyer.p.cells.name) : null;
  const dmTitle = buyer ? shown(buyer.p.cells.title) : null;
  const dmLocked = !!buyer && buyer.p.cells.name?.s === "locked";
  const showDm = async () => {
    if (!buyer) return;
    if (!ask) return setAsk(true);
    setBusy(true);
    setErr(null);
    const r = await act({ type: "unlock", entity: "contact", id: buyer.p.id, field: "name" }, { quiet: true, silentError: true });
    setBusy(false);
    setAsk(false);
    if (!r.ok) setErr(r.message);
  };
  const pipe = async () => {
    setBusy(true);
    const r = await act({ type: "pipeline.add", companyIds: [i.c.id] }, { quiet: true, silentError: true });
    setBusy(false);
    if (r.ok) setPiped(true);
    else setErr(r.message);
  };
  const way = holder
    ? { head: `Through ${holder}`, line: `${holder} held ${holderRole ? `the ${holderRole} seat` : "a seat"} here and can tell you why it ended and who to talk to.` }
    : seat
      ? { head: "Through the fractional who held the seat", line: holderCell?.s === "locked" ? "Who held it is on file. The company page shows it, 1 credit, or free when they are in the Fractionals directory." : "Nobody is named on the seat yet." }
      : dmName
        ? { head: `Write to ${dmName}`, line: "Nobody you know is on file here yet. Merlin drafts a first note for you to edit and send yourself, on the company page." }
        : { head: "No path yet", line: "Nobody you know is on file here. Merlin drafts a first note for you to edit and send yourself, on the company page." };
  return (
    <section className="su-opened" aria-label="The company you opened" aria-live="polite">
      <div className="su-opened-top">
        <span className="su-tile-q big" aria-hidden>
          {i.c.name.slice(0, 2)}
        </span>
        <span className="su-opened-t">
          <strong>{i.c.name}</strong>
          <span>{[factsLine(i), "website and job posting now open"].filter(Boolean).join(" · ")}</span>
        </span>
        <span className="su-ok">Open · yours to keep</span>
      </div>
      <div className="su-opened-grid">
        <div>
          <span className="su-k">Who held the seat · free</span>
          <strong>{holder ?? (seat ? (holderCell?.s === "locked" ? "On file" : "Nobody named yet") : "No seat on file")}</strong>
          <span>{holderRole ?? ""}</span>
        </div>
        <div>
          <span className="su-k">Who decides</span>
          {buyer && dmName ? (
            <>
              <strong>{dmName}</strong>
              <span>
                {[dmTitle, buyerLabel(buyer)].filter(Boolean).join(" · ")}. Email is 1 more credit, on the company page.
              </span>
            </>
          ) : dmLocked ? (
            <>
              {ask ? <span>Spend 1 credit to see the name and title? You have {credits}. A name and title are one purchase.</span> : null}
              <span className="su-acts">
                <button type="button" className="su-pine" disabled={busy} aria-busy={busy} onClick={() => void showDm()}>
                  {ask ? (busy ? "Opening" : "Yes, spend 1 credit") : "Show name and title · 1 credit"}
                </button>
                {ask ? (
                  <button type="button" className="su-link" onClick={() => setAsk(false)}>
                    Cancel
                  </button>
                ) : null}
              </span>
            </>
          ) : (
            <span>Nobody on file yet. The company page shows where to look.</span>
          )}
        </div>
        <div>
          <span className="su-k">Your way in</span>
          <strong>{way.head}</strong>
          <span>{way.line}</span>
        </div>
      </div>
      <div className="su-acts">
        <button type="button" className={piped ? "su-ghost" : "su-pine"} aria-pressed={piped} disabled={busy || piped} onClick={() => void pipe()}>
          {piped ? "In your pipeline, at To reach out" : "Add to pipeline"}
        </button>
        <button type="button" className="su-ghost" onClick={onPage}>
          See the full company page
        </button>
      </div>
      {err ? (
        <span className="su-err" role="alert">
          {err}
        </span>
      ) : null}
    </section>
  );
}
