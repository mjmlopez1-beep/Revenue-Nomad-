/**
 * Find (Find.dc.html), the pure parts: what each kind lists, the quick filters and the full filter
 * browser with a live count on every value (applyFilters' facets, from the member's real table),
 * the preview rows as the member may see them (a locked name is never shown), "Inside these N
 * companies", and the save step's cost. No React, so it can be checked without a browser.
 *
 * Kinds: Companies, People, Seats, Open roles, Fractionals, and Lookalikes only as BUILD_PLAN part 6
 * allows it: "same industry and size band as companies where you held a seat", counted from the
 * table, and shown only once the member has such a seat.
 */
import type { CompanyRec, FractionalRec, Me } from "@/lib/tableTypes";
import { COMPANY_PRICE } from "@/lib/tableFields";
import {
  EMPTY_FILTERS, ENDED_WINDOWS, FIT_STEPS, LIST_OPTIONS, SIGNAL_LABEL, TOGGLE_LABEL, applyFilters, endedLabel, endedTest, icpEmpty, icpMatch, isOpenRole, known, listedDays,
  mySeats, notMineLabel, rowsFor, shown, signalTest, sortRows, sortsFor,
  type CoInfo, type Facets, type Filters, type ListKey, type RecordType, type Row, type SignalKey, type SortKey, type ToggleKey,
} from "../model";
import type { AskFilters, AskKind } from "@/lib/ask";
import { HIRED_WINDOWS } from "@/lib/hired";

export type FindKind = AskKind | "lookalikes";
export const KIND_LABEL: Record<FindKind, string> = { companies: "Companies", people: "People", seats: "Seats", roles: "Open roles", fractionals: "Fractionals", lookalikes: "Lookalikes" };
export const KIND_NOUN: Record<FindKind, [string, string]> = {
  companies: ["company", "companies"],
  people: ["person", "people"],
  seats: ["seat", "seats"],
  roles: ["open role", "open roles"],
  fractionals: ["fractional", "fractionals"],
  lookalikes: ["lookalike", "lookalikes"],
};
/** The table's record type for a kind (Fractionals filter the companies their seats are at). */
export const KIND_TYPE: Record<FindKind, RecordType> = { companies: "companies", people: "people", seats: "engagements", roles: "engagements", fractionals: "companies", lookalikes: "companies" };
export const nounOf = (k: FindKind, n: number) => `${n.toLocaleString("en-US")} ${KIND_NOUN[k][n === 1 ? 0 : 1]}`;

/* ---------- lookalikes: same industry and size band as a company where the member held a seat ---------- */

export interface LookalikeBase {
  /** The member's own seat companies (named: they held a seat there), with the industry and size band read. */
  from: { id: string; name: string; industry: string; employees: string }[];
}
export function lookalikeBase(infos: CoInfo[], me: Me): LookalikeBase {
  const seen = new Set<string>();
  const from: LookalikeBase["from"] = [];
  for (const s of mySeats(infos, me)) {
    const c = s.i.c;
    const industry = shown(c.cells.industry);
    const employees = shown(c.cells.employees);
    if (!industry || !employees || seen.has(c.id)) continue;
    seen.add(c.id);
    from.push({ id: c.id, name: c.hidden ? "" : c.name, industry, employees });
  }
  return { from };
}
/** The seat company a company looks like, or null. Never the member's own seat company. */
export function lookalikeOf(base: LookalikeBase, c: CompanyRec): LookalikeBase["from"][number] | null {
  if (base.from.some((f) => f.id === c.id)) return null;
  const ind = shown(c.cells.industry);
  const emp = shown(c.cells.employees);
  return base.from.find((f) => f.industry === ind && f.employees === emp) ?? null;
}

/* ---------- the rows a kind lists ---------- */

export interface KindRows {
  rows: Row[];
  /** Fractionals: the directory's records whose seats are at these rows' companies. */
  fractionals?: FractionalRec[];
}

/** Every row of a kind before filters (the filters apply to these). */
export function baseRows(kind: FindKind, infos: CoInfo[], base: LookalikeBase): Row[] {
  if (kind === "seats") return rowsFor("engagements", infos).filter((r) => !!r.e && !isOpenRole(r.e));
  if (kind === "roles") return rowsFor("engagements", infos).filter((r) => !!r.e && isOpenRole(r.e));
  if (kind === "lookalikes") return rowsFor("companies", infos).filter((r) => !!lookalikeOf(base, r.i.c));
  return rowsFor(KIND_TYPE[kind], infos);
}

/** Fellow fractionals who held seats at companies these rows list (free on every plan). */
export function fractionalsAt(records: FractionalRec[], rows: Row[]): FractionalRec[] {
  const ids = new Set(rows.map((r) => r.i.c.id));
  return records.filter((f) => !f.you && f.seats.some((s) => ids.has(s.co)));
}

/** The member's filters from Ask's: the table's own keys, spread over no filters. */
export const filtersFromAsk = (a: AskFilters, keepIcp: boolean): Filters => {
  const out: Filters = { ...EMPTY_FILTERS, icp: keepIcp };
  for (const [k, v] of Object.entries(a)) if (v !== undefined && k in out) (out as unknown as Record<string, unknown>)[k] = v;
  return out;
};

/* ---------- quick filters and the full browser ---------- */

/** One value in a filter: its words, how many rows have it now (its own group lifted), on, and the filters with it flipped. */
export interface FilterValue {
  key: string;
  label: string;
  n: number | null;
  on: boolean;
  flip: (f: Filters) => Filters;
  /** It can't list anything yet, and why ("Bring in who you know first"). */
  off?: string;
}
export interface FilterDef {
  name: string;
  hint?: string;
  values: FilterValue[];
}
export interface FilterGroup {
  name: string;
  filters: FilterDef[];
}

const listValue = (k: ListKey, v: string, f: Filters, fc: Facets, label = v): FilterValue => ({
  key: `${k}:${v}`,
  label,
  n: fc.lists[k]?.[v] ?? 0,
  on: f[k].includes(v),
  flip: (x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }),
});
const toggleValue = (k: ToggleKey, f: Filters, fc: Facets, label = TOGGLE_LABEL[k]): FilterValue => ({ key: k, label, n: fc.toggles[k], on: f[k], flip: (x) => ({ ...x, [k]: !x[k] }) });
const signalValue = (k: SignalKey, f: Filters, fc: Facets, off?: string): FilterValue => ({ key: k, label: SIGNAL_LABEL[k], n: off ? null : fc.signals[k], on: f[k], flip: (x) => ({ ...x, [k]: !x[k] }), ...(off ? { off } : {}) });
const endedValue = (w: number, f: Filters, fc: Facets): FilterValue => ({ key: `ended:${w}`, label: w === 3 ? "In the last 90 days" : `In the last ${w} months`, n: fc.ended[w] ?? 0, on: f.endedWithin === w, flip: (x) => ({ ...x, endedWithin: x.endedWithin === w ? 0 : w }) });
/** A list's values with a count, most first, the picked ones always kept; `max` of the rest. */
function topValues(k: ListKey, f: Filters, fc: Facets, max: number, order?: readonly string[]): FilterValue[] {
  const counts = fc.lists[k] ?? {};
  const all = order ? [...order] : Object.keys(counts);
  const picked = all.filter((v) => f[k].includes(v));
  const rest = all.filter((v) => !f[k].includes(v) && (counts[v] ?? 0) > 0);
  const shownRest = order ? rest.slice(0, max) : rest.sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0)).slice(0, max);
  const keep = order ? order.filter((v) => picked.includes(v) || shownRest.includes(v)) : [...picked, ...shownRest];
  return keep.map((v) => listValue(k, v, f, fc));
}

export interface Sets {
  /** The member's pipeline is loaded; Where you can get in is on (RN_GOOGLE) and loaded. */
  pipeline: boolean;
  wayIn: boolean | "off";
}

/** Every filter Find offers, grouped as the mockup groups them, each value counted from the member's table. */
export function filterGroups(f: Filters, fc: Facets, me: Me, sets: Sets): FilterGroup[] {
  const myFn = me.function && me.function !== "Other" && me.function !== "Executive" ? me.function : null;
  const wayOff = sets.wayIn === "off" ? "Bring in who you know first (Google, or your LinkedIn connections file)" : sets.wayIn ? undefined : "Loading";
  const pipeOff = sets.pipeline ? undefined : "Loading";
  const hiredFnValues: FilterValue[] = (LIST_OPTIONS.fn as string[])
    .filter((x) => x !== "Other" && ((fc.hiredFn[x] ?? 0) > 0 || f.hiredFn.includes(x)))
    .map((x) => ({ key: `hiredFn:${x}`, label: x, n: fc.hiredFn[x] ?? 0, on: f.hiredFn.includes(x), flip: (y: Filters) => ({ ...y, hiredFn: y.hiredFn.includes(x) ? y.hiredFn.filter((z) => z !== x) : [...y.hiredFn, x] }) }));
  return [
    {
      name: "Company",
      filters: [
        { name: "Industry", hint: "Software (all) picks SaaS, enterprise software, small business software and developer tools together.", values: topValues("industry", f, fc, 14) },
        { name: "Employees", values: topValues("employees", f, fc, 9, LIST_OPTIONS.employees) },
        { name: "Revenue", values: topValues("revenue", f, fc, 9, LIST_OPTIONS.revenue) },
        { name: "Ownership", values: topValues("ownership", f, fc, 9, LIST_OPTIONS.ownership) },
        { name: "Business model", values: topValues("businessModel", f, fc, 9, LIST_OPTIONS.businessModel) },
        {
          name: "Fit score",
          hint: "How often a company hires fractionals, from 0 to 100: its seats on file, how recent they are and how many functions.",
          values: FIT_STEPS.filter((s) => s > 0).map((s) => ({ key: `fit:${s}`, label: `${s} or more`, n: fc.fit[s] ?? 0, on: f.fitMin === s, flip: (x: Filters) => ({ ...x, fitMin: x.fitMin === s ? 0 : s }) })),
        },
      ],
    },
    {
      name: "Where and how they sell",
      filters: [
        { name: "Country", values: topValues("country", f, fc, 8) },
        { name: "State or region", hint: "The states or regions of the countries you picked.", values: topValues("region", f, fc, 10) },
        { name: "HQ city", values: topValues("hq", f, fc, 8) },
        { name: "Sales motion", values: topValues("motion", f, fc, 9, LIST_OPTIONS.motion) },
        { name: "Average deal size", values: topValues("dealSize", f, fc, 9, LIST_OPTIONS.dealSize) },
        { name: "Average sales cycle", values: topValues("salesCycle", f, fc, 9, LIST_OPTIONS.salesCycle) },
      ],
    },
    {
      name: "Fractional history",
      filters: [
        { name: "Hired a fractional in", hint: "A hire is a fractional leader seat on file. Full-time seats, open roles and titles below Lead do not count.", values: hiredFnValues },
        {
          name: "In the last",
          hint: "The seat started in this window.",
          values: HIRED_WINDOWS.map((w) => ({ key: `hiredWithin:${w}`, label: `${w} months`, n: fc.hiredWithin[w] ?? 0, on: f.hiredWithin === w, flip: (x: Filters) => ({ ...x, hiredWithin: x.hiredWithin === w ? 0 : w }) })),
        },
        { name: "Seat or open role in", hint: "Any seat in the function: hired, open or mentioned.", values: topValues("fn", f, fc, 9, (LIST_OPTIONS.fn as string[]).filter((x) => x !== "Other")) },
        { name: "Repeat hirer", hint: "2 or more fractional hires on file, or hires in 2 or more functions. Open roles do not count.", values: [signalValue("repeatHirer", f, fc)] },
        { name: "A seat ended", hint: "By the end month where you can see it, else by when Merlin recorded it ended. An ended seat's end date is 1 credit.", values: ENDED_WINDOWS.map((w) => endedValue(w, f, fc)) },
        { name: "No fractional in your function yet", hint: `Hired fractionals in other functions and none in ${myFn ?? "yours"}. Often the next hire.`, values: [toggleValue("notMine", f, fc, notMineLabel(me.function ?? null))] },
      ],
    },
    {
      name: "Seat",
      filters: [
        { name: "Type", values: topValues("type", f, fc, 9, LIST_OPTIONS.type) },
        { name: "Why they hired", values: topValues("reason", f, fc, 9, LIST_OPTIONS.reason) },
        { name: "Pricing model", values: topValues("pricing", f, fc, 9, LIST_OPTIONS.pricing) },
        { name: "Status on file", values: [toggleValue("statusKnown", f, fc)] },
        { name: "Rate on file", hint: "Shows which seats have a rate on file, never the rate. Seeing a rate is 1 credit.", values: [toggleValue("rateKnown", f, fc)] },
        { name: "Source", values: topValues("source", f, fc, 9, LIST_OPTIONS.source) },
      ],
    },
    {
      name: "Decision makers",
      filters: [
        { name: "Relationship", values: topValues("relationship", f, fc, 9, LIST_OPTIONS.relationship) },
        { name: "Seat holder on file", values: [toggleValue("fractionalNamed", f, fc)] },
        { name: "Email on file", hint: "Shows who has an email on file, never the address. Seeing an email is 1 credit.", values: [toggleValue("emailKnown", f, fc)] },
        { name: "Hiring contact on file", values: [toggleValue("contactKnown", f, fc)] },
      ],
    },
    {
      name: "Signals",
      filters: [
        { name: "Open roles", hint: "Open now is every open fractional role on file. Closed roles stay on file with their dates.", values: [signalValue("hiringNow", f, fc), ...topValues("roleState", f, fc, 2, LIST_OPTIONS.roleState).filter((v) => v.label === "Closed")] },
        { name: "New executive", hint: "From company websites Merlin reads (US companies).", values: [signalValue("newLeader", f, fc)] },
      ],
    },
    {
      name: "You",
      filters: [
        ...(icpEmpty(me.icp) ? [] : [{ name: "Fits your ideal client", hint: "Change it in Your profile.", values: [{ key: "icp", label: "Fits your ideal client", n: null, on: f.icp, flip: (x: Filters) => ({ ...x, icp: !x.icp }) }] }]),
        { name: "You have a way in", hint: "Someone you know, or a fractional who held a seat there, can get you in.", values: [signalValue("wayIn", f, fc, wayOff)] },
        { name: "You follow it", values: [signalValue("followed", f, fc)] },
        { name: "You opened it", values: [signalValue("opened", f, fc)] },
        { name: "In your pipeline", values: [signalValue("inPipeline", f, fc, pipeOff)] },
      ],
    },
  ];
}

/** The quick filters (the mockup's left column): a few from the groups, by name and value. */
export function quickGroups(groups: FilterGroup[], f: Filters, me: Me, first: boolean): { name: string; items: FilterValue[] }[] {
  const val = (g: string, filter: string, key?: string) => {
    const d = groups.find((x) => x.name === g)?.filters.find((x) => x.name === filter);
    return d ? (key ? d.values.find((v) => v.key === key) : d.values[0]) ?? null : null;
  };
  const myFn = me.function && me.function !== "Other" && me.function !== "Executive" ? me.function : null;
  const hiredMine: FilterValue | null = myFn
    ? { key: `hiredFn:${myFn}`, label: `Hired a fractional in ${myFn}`, n: null, on: f.hiredFn.length === 1 && f.hiredFn[0] === myFn, flip: (x) => ({ ...x, hiredFn: x.hiredFn.length === 1 && x.hiredFn[0] === myFn ? [] : [myFn] }) }
    : null;
  const software: FilterValue = {
    key: "software",
    label: "SaaS or software",
    n: null,
    on: ["SaaS", "Enterprise Software", "SMB Software", "Developer Tools"].every((v) => f.industry.includes(v)),
    flip: (x) => {
      const sw = ["SaaS", "Enterprise Software", "SMB Software", "Developer Tools"];
      const all = sw.every((v) => x.industry.includes(v));
      return { ...x, industry: all ? x.industry.filter((v) => !sw.includes(v)) : [...new Set([...x.industry, ...sw])] };
    },
  };
  const us = val("Where and how they sell", "Country", "country:United States") ?? {
    key: "country:United States",
    label: "United States",
    n: 0,
    on: f.country.includes("United States"),
    flip: (x: Filters) => ({ ...x, country: x.country.includes("United States") ? x.country.filter((y) => y !== "United States") : [...x.country, "United States"] }),
  };
  const sized: FilterValue = {
    key: "size",
    label: "11 to 500 people",
    n: null,
    on: ["11–50", "51–200", "201–500"].every((v) => f.employees.includes(v)),
    flip: (x) => {
      const b = ["11–50", "51–200", "201–500"];
      const all = b.every((v) => x.employees.includes(v));
      return { ...x, employees: all ? x.employees.filter((v) => !b.includes(v)) : [...new Set([...x.employees, ...b])] };
    },
  };
  const revenue: FilterValue = {
    key: "rev",
    label: "$5M to $50M revenue",
    n: null,
    on: ["$5M–$20M", "$20M–$50M"].every((v) => f.revenue.includes(v)),
    flip: (x) => {
      const b = ["$5M–$20M", "$20M–$50M"];
      const all = b.every((v) => x.revenue.includes(v));
      return { ...x, revenue: all ? x.revenue.filter((v) => !b.includes(v)) : [...new Set([...x.revenue, ...b])] };
    },
  };
  const ended = val("Fractional history", "A seat ended", "ended:3");
  const out = [
    { name: "Company", items: [sized, { ...us, label: "United States" }, revenue, software] },
    { name: "Fractional history", items: [hiredMine, val("Fractional history", "Repeat hirer"), ended ? { ...ended, label: endedLabel(3) } : null, val("Fractional history", "No fractional in your function yet")] },
    { name: "Signals", items: [val("Signals", "Open roles", "hiringNow"), val("Signals", "New executive")] },
    { name: "You", items: first ? [] : [val("You", "You have a way in"), val("You", "In your pipeline")] },
  ];
  return out.map((g) => ({ name: g.name, items: g.items.filter((x): x is FilterValue => !!x) })).filter((g) => g.items.length);
}

/* ---------- a search on the kind, counted ---------- */

export interface FindResult {
  rows: Row[];
  facets: Facets;
  /** Fractionals: the records, in place of rows. */
  fractionals: FractionalRec[] | null;
  /** How many the kind lists with these filters. */
  n: number;
}

export function findRun(kind: FindKind, infos: CoInfo[], me: Me, f: Filters, q: string, sort: SortKey, base: LookalikeBase, directory: FractionalRec[] | null): FindResult {
  const all = baseRows(kind, infos, base);
  const { rows, facets } = applyFilters(all, f, "all", q, me);
  const sorted = sortRows(rows, sortsFor(KIND_TYPE[kind]).some((s) => s.key === sort) ? sort : "best", false, q, { me });
  if (kind === "fractionals") {
    const fr = directory ? fractionalsAt(directory, rows) : null;
    return { rows: sorted, facets, fractionals: fr, n: fr?.length ?? 0 };
  }
  return { rows: sorted, facets, fractionals: null, n: sorted.length };
}

/** "Inside these N companies": how many of the rows have each, and the filter each turns on. */
export function insideStats(rows: Row[], f: Filters, first: boolean): { key: string; n: number; label: string; on: boolean; flip: (x: Filters) => Filters }[] {
  const cos = new Map<string, Row>();
  for (const r of rows) if (!cos.has(r.i.c.id)) cos.set(r.i.c.id, r);
  const list = [...cos.values()];
  const count = (t: (r: Row) => boolean) => list.filter(t).length;
  const sig = (k: SignalKey, label: string) => ({ key: k, n: count(signalTest(k)), label, on: f[k], flip: (x: Filters) => ({ ...x, [k]: !x[k] }) });
  const ended = endedTest(3, f.fn);
  return [
    sig("hiringNow", "hiring a fractional now"),
    { key: "ended", n: count(ended), label: "had a seat end in the last 90 days", on: f.endedWithin === 3, flip: (x: Filters) => ({ ...x, endedWithin: x.endedWithin === 3 ? 0 : 3 }) },
    sig("repeatHirer", "are repeat hirers"),
    first ? { key: "opened", n: count(signalTest("opened")), label: "you opened", on: f.opened, flip: (x: Filters) => ({ ...x, opened: !x.opened }) } : sig("wayIn", "you have a way into"),
  ];
}

/** The ideal client's line: "64 companies fit: 41 confirmed, 23 where a part is not on file." */
export function icpLine(infos: CoInfo[], me: Me): { match: number; maybe: number } {
  let match = 0;
  let maybe = 0;
  if (icpEmpty(me.icp)) return { match, maybe };
  for (const i of infos) {
    const m = icpMatch(me.icp, i.c);
    if (m === "match") match++;
    else if (m === "maybe") maybe++;
  }
  return { match, maybe };
}

/* ---------- preview cells ---------- */

/** A company as the member may see it: its name once open, else "Locked company" and its free facts. Never the hidden name. */
export function coLine(i: CoInfo): { open: boolean; name: string; facts: string } {
  const c = i.c;
  const facts = [shown(c.cells.industry), shown(c.cells.employees) ? `${shown(c.cells.employees)} people` : null].filter(Boolean).join(" · ");
  return c.hidden ? { open: false, name: "Locked company", facts } : { open: true, name: c.name, facts };
}

const yearOf = (v: string | null) => (v ? v.slice(0, 4) : null);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthWords = (v: string | null) => {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})/.exec(v);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : v.slice(0, 4);
};

export interface PreviewRow {
  key: string;
  /** For the record (null for a fractional). */
  companyId: string | null;
  open: boolean;
  name: string;
  sub: string;
  pill: string | null;
  c2: string;
  c3: string;
  c3muted: boolean;
  sig: string | null;
}

/** What opening a locked company costs this member now: free on the trial and Pro while free opens are left, else 2 credits. */
export const openWord = (me: Me) => (me.proOpens && me.proOpens.left > 0 ? "Free" : `${COMPANY_PRICE} credits`);

export function previewRow(kind: FindKind, r: Row, me: Me, base: LookalikeBase): PreviewRow {
  const co = coLine(r.i);
  const price = openWord(me);
  const fnOf = (e: { cells: Record<string, { s: string; v?: string }> }) => shown(e.cells.function as never) ?? "";
  if (kind === "people" && r.p) {
    const p = r.p;
    const name = shown(p.cells.name);
    const title = shown(p.cells.title);
    const rel = shown(p.cells.relationship) ?? "";
    const onFile = known(p.cells.email) ? "Email on file" : known(p.cells.phone) ? "Phone on file" : null;
    return {
      key: r.key,
      companyId: r.i.c.id,
      open: !!name,
      name: name ?? "Locked person",
      sub: name ? title ?? "" : "Name and title hidden",
      pill: name ? null : r.i.c.hidden ? "After the company" : "1 credit",
      c2: co.open ? co.name : co.facts,
      c3: rel,
      c3muted: false,
      sig: onFile,
    };
  }
  if ((kind === "seats" || kind === "roles") && r.e) {
    const e = r.e;
    const fn = fnOf(e as never);
    const role = shown(e.cells.role) ?? (fn ? `Fractional ${fn} leader` : "Fractional seat");
    if (kind === "roles") {
      const days = listedDays(e);
      const posting = r.i.c.hidden ? "Opens with the company" : known(e.cells.posting) ? (shown(e.cells.posting) ? "On file" : "Opens for 1 credit") : "No posting on file";
      return {
        key: r.key,
        companyId: r.i.c.id,
        open: true,
        name: role,
        sub: [fn, days > 0 ? `listed ${days === 1 ? "1 day" : `${days} days`} ago` : null].filter(Boolean).join(" · "),
        pill: null,
        c2: co.open ? co.name : co.facts,
        c3: posting,
        c3muted: posting !== "On file",
        sig: known(e.cells.rate) ? "Rate on file" : "No rate posted",
      };
    }
    const status = shown(e.cells.status);
    const end = shown(e.cells.end);
    const hours = shown(e.cells.hours);
    const when = status === "Ended" ? (end ? `Ended ${monthWords(end)}` : "Ended") : shown(e.cells.start) ? `Since ${yearOf(shown(e.cells.start))}` : status ?? "";
    const holder = r.i.c.hidden ? "Opens with the company" : e.yours ? "You" : shown(e.cells.operator) ?? (e.cells.operator?.s === "locked" ? "1 credit" : "Nobody named yet");
    const rate = e.yours ? "Yours" : e.cells.rate?.s === "locked" ? "1 credit" : shown(e.cells.rate) ? "On file" : "No rate shared";
    return {
      key: r.key,
      companyId: r.i.c.id,
      open: true,
      name: role,
      sub: [when, hours ? `${hours} hours a week` : null].filter(Boolean).join(" · "),
      pill: null,
      c2: co.open ? co.name : co.facts,
      c3: holder,
      c3muted: r.i.c.hidden || holder === "Nobody named yet",
      sig: rate,
    };
  }
  // Companies and lookalikes.
  const latest = r.i.latest;
  const lfn = latest ? fnOf(latest as never) : "";
  const lstatus = latest ? shown(latest.cells.status) : null;
  const seat = latest ? [lfn ? `${lfn} seat` : "A seat", lstatus === "Ended" ? `ended${shown(latest.cells.end) ? ` ${monthWords(shown(latest.cells.end))}` : ""}` : shown(latest.cells.start) ? `since ${yearOf(shown(latest.cells.start))}` : ""].filter(Boolean).join(" · ") : "No seat on file";
  const sig = r.i.c.friendly.open > 0 ? "Hiring now" : endedTest(3, [])(r) ? "Seat ended" : signalTest("newLeader")(r) ? "New leader" : null;
  if (kind === "lookalikes") {
    const like = lookalikeOf(base, r.i.c);
    return { key: r.key, companyId: r.i.c.id, open: co.open, name: co.name, sub: co.facts, pill: co.open ? null : price, c2: like?.name || "A company where you held a seat", c3: "Same industry and size", c3muted: false, sig };
  }
  return { key: r.key, companyId: r.i.c.id, open: co.open, name: co.name, sub: co.facts, pill: co.open ? null : price, c2: seat, c3: r.i.fnState.hired.join(", ") || "None on file yet", c3muted: !r.i.fnState.hired.length, sig };
}

export function fractionalRow(x: FractionalRec): PreviewRow {
  const seats = x.now + x.past;
  return {
    key: x.id,
    companyId: null,
    open: !x.locked,
    name: x.locked ? "A fractional who keeps out of the directory" : x.name ?? "A fractional",
    sub: x.title ?? (x.fn ? `Fractional ${x.fn}` : ""),
    pill: x.locked ? "1 credit" : null,
    c2: `${seats} ${seats === 1 ? "seat" : "seats"} on file`,
    c3: x.clients?.line ?? "",
    c3muted: !x.clients,
    sig: x.onMerlin ? "Member" : "Not on Merlin yet",
  };
}

export const HEADS: Record<FindKind, [string, string, string, string]> = {
  companies: ["Company", "Latest seat", "Functions hired", "Signal"],
  people: ["Person", "Company", "Relationship", "On file"],
  seats: ["Seat", "Company", "Held by", "Rate"],
  roles: ["Open role", "Company", "Job posting", "Posted rate"],
  fractionals: ["Fractional", "Seats on file", "Works with", "On Merlin"],
  lookalikes: ["Company", "Looks like", "Why", "Signal"],
};

export const NOTES: Record<FindKind, (first: boolean) => string> = {
  companies: (first) =>
    first
      ? "Names stay hidden in the preview. Save the list, then open your first company from the table. It is free on the trial, up to 15 a day."
      : "Names stay hidden in the preview. Saving the list keeps them locked until you choose what to open.",
  people: () => "A name and title open together for 1 credit, once the company is open. An email or a phone number is 1 credit each.",
  seats: () => "Function, dates and hours are free. Who held a seat opens with the company. A rate is 1 credit where a member shared one.",
  roles: () => "Titles and dates are free. The job posting, with its rate and hours when they were posted, opens with the company.",
  fractionals: () => "Fellow fractionals are free to see on every plan. These are the ones who held seats at companies that match your filters.",
  lookalikes: () => "Same industry and size band as a company where you held a seat. Add more of your seats and Merlin matches against those too.",
};

/* ---------- the save step ---------- */

export interface SaveCost {
  /** Locked companies in the first `take` rows, and how many of them open free today. */
  locked: number;
  free: number;
  /** Credits for the company names, and for decision makers (1 each, at companies that are or will be open). */
  names: number;
  deciders: number;
  /** Decision makers whose name and title are locked, at companies in the run. */
  deciderN: number;
}

/** What "Add data now" costs for the first `take` rows' companies. Free opens come first (Trial and Pro, Me.proOpens). */
export function saveCost(rows: Row[], take: number, me: Me): SaveCost {
  const cos: CoInfo[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.i.c.id)) continue;
    seen.add(r.i.c.id);
    cos.push(r.i);
    if (cos.length >= take) break;
  }
  const locked = cos.filter((i) => i.c.hidden).length;
  const free = Math.min(locked, me.proOpens?.left ?? 0);
  const deciderN = cos.reduce((n, i) => n + deciderRefs(i).length, 0);
  return { locked, free, names: (locked - free) * COMPANY_PRICE, deciders: deciderN, deciderN };
}

/** A company's decision makers whose name and title are still locked (one purchase each: the name). */
export function deciderRefs(i: CoInfo): { entity: "contact"; id: string; field: string }[] {
  return i.people
    .filter(({ p }) => shown(p.cells.relationship) === "Decision maker" && p.cells.name?.s === "locked")
    .map(({ p }) => ({ entity: "contact" as const, id: p.id, field: "name" }));
}

/** The companies in the run, in order, at most `take`. */
export function runCompanies(rows: Row[], take: number): CoInfo[] {
  const out: CoInfo[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.i.c.id)) continue;
    seen.add(r.i.c.id);
    out.push(r.i);
    if (out.length >= take) break;
  }
  return out;
}

/* ---------- a list's fill rate (Home's "Filled in") ---------- */

const FILL: Record<RecordType, string[]> = {
  companies: ["website", "industry", "employees", "revenue", "ownership", "hq", "linkedin"],
  engagements: ["role", "status", "operator", "start", "end", "rate", "hours"],
  people: ["name", "title", "email", "relationship"],
};
/**
 * How much of a list is on file: the share of its rows' main facts Merlin has, a locked value
 * counting as on file (the workbench's fill-rate rule: "filled" is a live or a locked value).
 * Null for a list with no rows.
 */
export function fillRate(rows: Row[], type: RecordType, cap = 400): number | null {
  if (!rows.length) return null;
  const fields = FILL[type];
  let have = 0;
  let all = 0;
  for (const r of rows.slice(0, cap)) {
    const cells = type === "people" ? r.p?.cells : type === "engagements" ? r.e?.cells : r.i.c.cells;
    if (!cells) continue;
    for (const k of fields) {
      all++;
      if (known(cells[k])) have++;
    }
  }
  return all ? Math.round((have / all) * 100) : null;
}
