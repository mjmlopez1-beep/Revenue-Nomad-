import type { OperatorRole, TimingSignal } from "../types";
import type { UniverseCompany } from "./universe";

/**
 * Per-role signal library (Match Engine spec §7). Every role category scans
 * at least 10 unique signals; each answers one question: "what makes a
 * company uniquely ready to hire {role} right now?"
 *
 * Signals here are the context-based detectors (company record, careers
 * board, website probe). Role-tuned news signals (departures, funding,
 * leader appointments) and daily-diff events (started hiring, headcount
 * jump, repositioned, just launched) are separate sources gated per role —
 * ROLE_SIGNAL_DOCS below documents the complete set per role.
 */

export interface BoardPosting {
  title: string;
  url: string;
}

/** Cheap website observations for one company (homepage + /pricing + feed). */
export interface WebProbe {
  pricingFound: boolean;
  pricingContactSalesOnly: boolean;
  pricingFreeTrial: boolean;
  pricingEnterpriseTier: boolean;
  techTags: string[]; // embedded tools spotted on the homepage
  hasIntegrationsPage: boolean;
  hasApiDocs: boolean;
  blogStaleDays: number | null; // null = no feed found, -1 = fresh
  /** True only when the homepage actually returned HTML — absence signals
   * (no content, no proof) are only claimable when we could really look. */
  homepageFetched: boolean;
  /** Content footprint — content is more than a blog. */
  contentSurfaces: string[]; // e.g. ["blog","resources","case studies","webinars"]
  hasCaseStudies: boolean; // case studies / customers page linked
  hasNewsletterCapture: boolean; // email capture / subscribe present
  socialChannels: string[]; // linkedin / x / youtube linked from homepage
  sitemapContentPages: number | null; // content URLs in sitemap; null = no sitemap
}

export interface CompanyContext {
  company: UniverseCompany;
  text: string; // lowercased description + industry + tags
  board: BoardPosting[] | null; // null = no discoverable board
  web: WebProbe | null; // null = not probed
}

interface SignalDef {
  id: string;
  type: TimingSignal["type"];
  question: string;
  weight: number;
  halfLifeDays: number | null; // null = standing condition
  detect: (ctx: CompanyContext) => Omit<TimingSignal, "type" | "detectedOn"> | null;
}

/* ---------- shared title matchers ---------- */

const SALES_LEAD_RE = /\b((vp|vice president|head|director|chief)[^,]{0,25}(sales|revenue)|cro)\b/i;
const MKT_LEAD_RE = /\b((vp|vice president|head|director|chief)[^,]{0,25}(marketing|brand|demand|content)|cmo)\b/i;
const OPS_RE = /\b(revenue operations|revops|sales operations|marketing operations|gtm operations|deal desk|sales analyst|gtm analyst)\b/i;
const ENABLE_RE = /\b(enablement|sales trainer)\b/i;
const CS_RE = /\b(customer success|csm|chief customer|onboarding specialist|implementation)\b/i;
const CS_LEAD_RE = /\b((vp|vice president|head|director|chief)[^,]{0,30}(customer success|customer experience)|cco)\b/i;
const PARTNER_RE = /\b(partner|channel|alliances)\b/i;
const AI_ROLE_RE = /\b(machine learning|ml engineer|ai engineer|data scientist|llm|gtm engineer)\b/i;
const SALES_IC_RE = /\b(account executive|sdr|bdr|sales development|sales rep)\b/i;
const MKT_IC_RE = /\b(marketing|demand gen|growth marketer|content|seo|paid media)\b/i;
const ANALYST_RE = /\b(business analyst|data analyst|bi analyst)\b/i;
const AI_TEXT_RE = /\bai\b|artificial intelligence|machine learning|llm/i;

const count = (b: BoardPosting[] | null, re: RegExp) => (b || []).filter((p) => re.test(p.title));
const ageYears = (c: UniverseCompany) => {
  const m = c.batch.match(/(\d{4})/) || c.batch.match(/^[A-Z]{1,2}(\d{2})$/i);
  if (!m) return null;
  const y = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
  return new Date().getFullYear() - y;
};

/* ---------- per-role libraries ---------- */

const LIBRARY: Record<OperatorRole, SignalDef[]> = {
  "Sales Leadership": [
    {
      id: "sl_seat_req", type: "leadership-gap", weight: 0.8, halfLifeDays: 45,
      question: "Are they hiring a full-time sales leader right now (a 4–6 month search you can bridge)?",
      detect: (c) => {
        const reqs = count(c.board, SALES_LEAD_RE);
        return reqs.length ? { id: "sl_seat_req", label: `Hiring your seat full-time: ${reqs[0].title}`, detail: "The search runs 4–6 months — pitch fractional/interim coverage now.", evidenceUrl: reqs[0].url, weight: 0.8, halfLifeDays: 45 } : null;
      },
    },
    {
      id: "sl_reps_no_leader", type: "team-without-leader", weight: 0.75, halfLifeDays: 60,
      question: "Are they hiring reps with no sales leadership posted to run them?",
      detect: (c) => {
        const ics = count(c.board, SALES_IC_RE);
        return ics.length >= 2 && count(c.board, SALES_LEAD_RE).length === 0
          ? { id: "sl_reps_no_leader", label: `Hiring ${ics.length} reps with no sales leadership posted`, detail: `Open: ${ics.slice(0, 3).map((p) => p.title).join("; ")}`, evidenceUrl: ics[0].url, weight: 0.75, halfLifeDays: 60 } : null;
      },
    },
    {
      id: "sl_quota_burst", type: "hiring-role", weight: 0.7, halfLifeDays: 60,
      question: "Is there a quota-carrier hiring burst that needs a playbook before the reps land?",
      detect: (c) => {
        const ics = count(c.board, SALES_IC_RE);
        return ics.length >= 4 ? { id: "sl_quota_burst", label: `${ics.length} quota-carrier reqs open at once`, detail: "A rep cohort without a leader-built playbook burns 2 quarters.", evidenceUrl: ics[0].url, weight: 0.7, halfLifeDays: 60 } : null;
      },
    },
    {
      id: "sl_founder_ceiling", type: "function-gap", weight: 0.65, halfLifeDays: null,
      question: "Is founder-led sales at its ceiling (15–60 people, no sales leadership anywhere)?",
      detect: (c) => {
        const t = c.company.teamSize ?? 0;
        return c.board !== null && t >= 15 && t <= 60 && count(c.board, SALES_LEAD_RE).length === 0 && count(c.board, SALES_IC_RE).length === 0
          ? { id: "sl_founder_ceiling", label: "Founder-led sales at the ceiling", detail: `${t} people with no sales org or postings — the founder is still selling.`, evidenceUrl: c.company.url, weight: 0.65, halfLifeDays: null } : null;
      },
    },
    {
      id: "sl_hiring_composition", type: "function-gap", weight: 0.6, halfLifeDays: null,
      question: "Are they scaling headcount with zero sales hiring (a revenue org that should exist by now)?",
      detect: (c) => {
        const total = (c.board || []).length;
        const t = c.company.teamSize ?? 0;
        return c.board !== null && total >= 4 && t >= 15 && t <= 80 && count(c.board, SALES_IC_RE).length === 0 && count(c.board, SALES_LEAD_RE).length === 0
          ? { id: "sl_hiring_composition", label: `${total} open roles, none in sales`, detail: `Scaling at ${t} people with no revenue hires — the sales org a company this size needs doesn't exist yet.`, evidenceUrl: c.board[0].url, weight: 0.6, halfLifeDays: null } : null;
      },
    },
    {
      id: "sl_upmarket_move", type: "function-gap", weight: 0.55, halfLifeDays: 90,
      question: "Did a self-serve product just add an enterprise/sales-led motion nobody has run before?",
      detect: (c) => c.web?.pricingFreeTrial && c.web?.pricingEnterpriseTier
        ? { id: "sl_upmarket_move", label: "Self-serve product adding an enterprise motion", detail: "Free trial plus enterprise tier on pricing — a sales-led motion with no sales leader is a stall waiting to happen.", evidenceUrl: `https://${c.company.domain}/pricing`, weight: 0.55, halfLifeDays: 90 } : null,
    },
  ],
  Marketing: [
    {
      id: "mk_seat_req", type: "leadership-gap", weight: 0.8, halfLifeDays: 45,
      question: "Are they hiring a full-time marketing leader right now?",
      detect: (c) => {
        const reqs = count(c.board, MKT_LEAD_RE);
        return reqs.length ? { id: "mk_seat_req", label: `Hiring your seat full-time: ${reqs[0].title}`, detail: "The search runs 4–6 months — pitch fractional/interim coverage now.", evidenceUrl: reqs[0].url, weight: 0.8, halfLifeDays: 45 } : null;
      },
    },
    {
      id: "mk_ics_no_leader", type: "team-without-leader", weight: 0.75, halfLifeDays: 60,
      question: "Are they hiring marketing ICs with nobody senior to direct them?",
      detect: (c) => {
        const ics = count(c.board, MKT_IC_RE).filter((p) => !MKT_LEAD_RE.test(p.title));
        return ics.length >= 2 && count(c.board, MKT_LEAD_RE).length === 0
          ? { id: "mk_ics_no_leader", label: `Hiring ${ics.length} marketing ICs with no leadership posted`, detail: `Open: ${ics.slice(0, 3).map((p) => p.title).join("; ")}`, evidenceUrl: ics[0].url, weight: 0.75, halfLifeDays: 60 } : null;
      },
    },
    {
      id: "mk_sales_ahead", type: "function-gap", weight: 0.7, halfLifeDays: 60,
      question: "Did they hire sellers ahead of any marketing (a pipeline gap forming)?",
      detect: (c) => {
        const sales = count(c.board, SALES_IC_RE);
        return sales.length >= 2 && count(c.board, MKT_IC_RE).length === 0
          ? { id: "mk_sales_ahead", label: "Sales hired ahead of marketing", detail: `${sales.length} quota-carrier reqs, zero marketing — reps will outrun pipeline in a quarter.`, evidenceUrl: sales[0].url, weight: 0.7, halfLifeDays: 60 } : null;
      },
    },
    {
      id: "mk_content_dormant", type: "content-gap", weight: 0.75, halfLifeDays: 120,
      question: "Did their content engine go dormant (blog silent 60+ days)?",
      detect: (c) => c.web && c.web.blogStaleDays !== null && c.web.blogStaleDays > 60
        ? { id: "mk_content_dormant", label: `Blog silent for ${c.web.blogStaleDays} days`, detail: "The engine exists but nobody is running it.", evidenceUrl: `https://${c.company.domain}`, weight: 0.75, halfLifeDays: 120 } : null,
    },
    {
      id: "mk_no_content_footprint", type: "content-gap", weight: 0.7, halfLifeDays: null,
      question: "Do they have no content footprint at all — no blog, resources, case studies, or webinars?",
      detect: (c) => c.web?.homepageFetched && c.web.blogStaleDays === null && c.web.contentSurfaces.length === 0 && (c.web.sitemapContentPages ?? 0) === 0 && (c.company.teamSize ?? 0) >= 15
        ? { id: "mk_no_content_footprint", label: "No content footprint at all", detail: "No blog, resources, case studies, or webinars anywhere on the site — the organic channel is unbuilt.", evidenceUrl: `https://${c.company.domain}`, weight: 0.7, halfLifeDays: null } : null,
    },
    {
      id: "mk_thin_content", type: "content-gap", weight: 0.55, halfLifeDays: null,
      question: "Is their content footprint thin for their size (a handful of pages at 20+ people)?",
      detect: (c) => c.web && c.web.sitemapContentPages !== null && c.web.sitemapContentPages > 0 && c.web.sitemapContentPages < 10 && (c.company.teamSize ?? 0) >= 20
        ? { id: "mk_thin_content", label: `Thin content footprint: ${c.web.sitemapContentPages} content pages`, detail: `${c.company.teamSize} people with under 10 content URLs in the sitemap — publishing never became a motion.`, evidenceUrl: `https://${c.company.domain}`, weight: 0.55, halfLifeDays: null } : null,
    },
    {
      id: "mk_no_social_proof", type: "content-gap", weight: 0.5, halfLifeDays: null,
      question: "Are they selling with no public customer proof (no case studies or customers page)?",
      detect: (c) => c.web?.homepageFetched && !c.web.hasCaseStudies && (c.company.teamSize ?? 0) >= 25
        ? { id: "mk_no_social_proof", label: "No public customer proof", detail: "No case studies or customers page — every deal starts from zero trust.", evidenceUrl: `https://${c.company.domain}`, weight: 0.5, halfLifeDays: null } : null,
    },
    {
      id: "mk_no_capture", type: "content-gap", weight: 0.4, halfLifeDays: null,
      question: "Are they publishing content with no email capture (audience leaking away)?",
      detect: (c) => c.web && c.web.contentSurfaces.length > 0 && !c.web.hasNewsletterCapture
        ? { id: "mk_no_capture", label: "Content published, no email capture", detail: `Surfaces live (${c.web.contentSurfaces.join(", ")}) but no newsletter/signup — the audience isn't being kept.`, evidenceUrl: `https://${c.company.domain}`, weight: 0.4, halfLifeDays: null } : null,
    },
    {
      id: "mk_org_gap", type: "function-gap", weight: 0.7, halfLifeDays: null,
      question: "At their size, should a marketing function exist that simply doesn't — roles you could fill?",
      detect: (c) => {
        const total = (c.board || []).length;
        return c.board !== null && total >= 2 && (c.company.teamSize ?? 0) >= 25 && count(c.board, MKT_IC_RE).length === 0 && count(c.board, MKT_LEAD_RE).length === 0
          ? { id: "mk_org_gap", label: `No marketing function at ${c.company.teamSize} people`, detail: `${total} open roles, none in marketing — the demand engine a company this size needs doesn't exist yet.`, evidenceUrl: c.board[0].url, weight: 0.7, halfLifeDays: null } : null;
      },
    },
    {
      id: "mk_plg_no_marketing", type: "function-gap", weight: 0.6, halfLifeDays: 90,
      question: "Is a self-serve motion live with no demand engine behind it?",
      detect: (c) => c.web?.pricingFreeTrial && (c.company.teamSize ?? 0) >= 10 && count(c.board, MKT_IC_RE).length === 0
        ? { id: "mk_plg_no_marketing", label: "Self-serve motion with no marketing hires posted", detail: "Free trial live, zero marketing reqs — top of funnel is unowned.", evidenceUrl: `https://${c.company.domain}/pricing`, weight: 0.6, halfLifeDays: 90 } : null,
    },
  ],
  "Revenue Operations": [
    {
      id: "ro_ops_req", type: "hiring-role", weight: 0.8, halfLifeDays: 45,
      question: "Is an ops seat or ops IC req open right now?",
      detect: (c) => {
        const reqs = count(c.board, OPS_RE);
        return reqs.length ? { id: "ro_ops_req", label: `Ops role open: ${reqs[0].title}`, detail: "Deliver outcomes fractionally while the req sits unfilled.", evidenceUrl: reqs[0].url, weight: 0.8, halfLifeDays: 45 } : null;
      },
    },
    {
      id: "ro_gtm_burst_no_ops", type: "function-gap", weight: 0.75, halfLifeDays: 60,
      question: "Is GTM hiring scaling with no ops role posted (nobody owns the connective tissue)?",
      detect: (c) => {
        const gtm = count(c.board, SALES_IC_RE).length + count(c.board, MKT_IC_RE).length;
        return gtm >= 3 && count(c.board, OPS_RE).length === 0
          ? { id: "ro_gtm_burst_no_ops", label: "Scaling GTM hiring with no ops role posted", detail: `${gtm} GTM reqs open, zero ops/analytics.`, evidenceUrl: c.board![0].url, weight: 0.75, halfLifeDays: 60 } : null;
      },
    },
    {
      id: "ro_three_functions", type: "function-gap", weight: 0.7, halfLifeDays: 60,
      question: "Are sales, marketing, and CS all hiring with no ops function between them?",
      detect: (c) => count(c.board, SALES_IC_RE).length > 0 && count(c.board, MKT_IC_RE).length > 0 && count(c.board, CS_RE).length > 0 && count(c.board, OPS_RE).length === 0
        ? { id: "ro_three_functions", label: "Three GTM functions hiring, no connective tissue", detail: "Sales, marketing, and CS reqs all open — nobody owns the system between them.", evidenceUrl: c.board![0].url, weight: 0.7, halfLifeDays: 60 } : null,
    },
    {
      id: "ro_rep_line", type: "hiring-role", weight: 0.65, halfLifeDays: 90,
      question: "Is the rep count crossing the line where forecasting by spreadsheet breaks (~8 quota carriers)?",
      detect: (c) => {
        const reps = count(c.board, SALES_IC_RE);
        return reps.length >= 3 ? { id: "ro_rep_line", label: `Rep base crossing the forecasting line (${reps.length} reqs open)`, detail: "Past ~8 quota carriers, pipeline management by spreadsheet fails.", evidenceUrl: reps[0].url, weight: 0.65, halfLifeDays: 90 } : null;
      },
    },
    {
      id: "ro_stack_no_owner", type: "function-gap", weight: 0.7, halfLifeDays: null,
      question: "Is a multi-tool GTM stack live with nobody posted to own it?",
      detect: (c) => {
        const gtmTools = (c.web?.techTags || []).filter((t) => ["hubspot", "marketo", "segment", "intercom", "drift"].includes(t));
        return gtmTools.length >= 2 && count(c.board, OPS_RE).length === 0 && (c.company.teamSize ?? 0) >= 20
          ? { id: "ro_stack_no_owner", label: `GTM stack detected (${gtmTools.join(", ")}) with no ops owner`, detail: "Tools without an operator become shelfware and dirty data.", evidenceUrl: `https://${c.company.domain}`, weight: 0.7, halfLifeDays: null } : null;
      },
    },
    {
      id: "ro_size_no_ops", type: "function-gap", weight: 0.6, halfLifeDays: null,
      question: "At their size, should an ops function exist that doesn't (roles you could fill)?",
      detect: (c) => c.board !== null && c.board.length >= 2 && (c.company.teamSize ?? 0) >= 40 && count(c.board, OPS_RE).length === 0
        ? { id: "ro_size_no_ops", label: `No ops function at ${c.company.teamSize} people`, detail: "Companies this size run on process — nobody here owns it or is hiring for it.", evidenceUrl: c.board[0].url, weight: 0.6, halfLifeDays: null } : null,
    },
    {
      id: "ro_analyst_wrong_hire", type: "function-gap", weight: 0.6, halfLifeDays: 60,
      question: "Are they hiring a generic analyst for what is actually a RevOps problem?",
      detect: (c) => {
        const analysts = count(c.board, ANALYST_RE);
        return analysts.length > 0 && count(c.board, SALES_IC_RE).length >= 1
          ? { id: "ro_analyst_wrong_hire", label: `Hiring ${analysts[0].title} alongside sales reqs`, detail: "An analyst req next to sales hiring is usually a RevOps problem mislabeled.", evidenceUrl: analysts[0].url, weight: 0.6, halfLifeDays: 60 } : null;
      },
    },
  ],
  "Sales Enablement": [
    {
      id: "en_seat_req", type: "leadership-gap", weight: 0.8, halfLifeDays: 45,
      question: "Is an enablement seat open right now?",
      detect: (c) => {
        const reqs = count(c.board, ENABLE_RE);
        return reqs.length ? { id: "en_seat_req", label: `Enablement role open: ${reqs[0].title}`, detail: "Bridge the gap fractionally while they search.", evidenceUrl: reqs[0].url, weight: 0.8, halfLifeDays: 45 } : null;
      },
    },
    {
      id: "en_rep_scaling", type: "hiring-role", weight: 0.75, halfLifeDays: 90,
      question: "Is the rep base scaling fast enough that ramp time is the bottleneck?",
      detect: (c) => {
        const reps = count(c.board, SALES_IC_RE);
        return reps.length >= 3 ? { id: "en_rep_scaling", label: `Scaling the rep base: ${reps.length} quota-carrier reqs`, detail: "Every unramped rep is a quarter of lost quota — enablement compounds now.", evidenceUrl: reps[0].url, weight: 0.75, halfLifeDays: 90 } : null;
      },
    },
    {
      id: "en_first_hire_language", type: "function-gap", weight: 0.6, halfLifeDays: 60,
      question: "Are they posting 'first' or 'founding' sales roles (no playbook exists yet)?",
      detect: (c) => {
        const firsts = (c.board || []).filter((p) => /\b(first|founding)\b/i.test(p.title) && /sales|account executive/i.test(p.title));
        return firsts.length ? { id: "en_first_hire_language", label: `Posting founding sales roles: ${firsts[0].title}`, detail: "First hires with no playbook — enablement from day one beats rework later.", evidenceUrl: firsts[0].url, weight: 0.6, halfLifeDays: 60 } : null;
      },
    },
    {
      id: "en_tooling_no_owner", type: "function-gap", weight: 0.7, halfLifeDays: null,
      question: "Did they buy revenue tooling (Gong/Outreach class) with nobody posted to run it?",
      detect: (c) => {
        const tools = (c.web?.techTags || []).filter((t) => ["gong", "outreach", "salesloft", "highspot"].includes(t));
        return tools.length > 0 && count(c.board, ENABLE_RE).length === 0
          ? { id: "en_tooling_no_owner", label: `Revenue tooling detected (${tools.join(", ")}) with no enablement owner`, detail: "Tooling bought, adoption unowned.", evidenceUrl: `https://${c.company.domain}`, weight: 0.7, halfLifeDays: null } : null;
      },
    },
    {
      id: "en_size_no_enablement", type: "function-gap", weight: 0.55, halfLifeDays: null,
      question: "At their size and sales hiring pace, should enablement exist that doesn't?",
      detect: (c) => c.board !== null && (c.company.teamSize ?? 0) >= 40 && count(c.board, SALES_IC_RE).length >= 1 && count(c.board, ENABLE_RE).length === 0
        ? { id: "en_size_no_enablement", label: `No enablement function at ${c.company.teamSize} people`, detail: "A rep org this size without enablement re-learns every lesson per rep.", evidenceUrl: c.board[0].url, weight: 0.55, halfLifeDays: null } : null,
    },
    {
      id: "en_perpetual_backfill", type: "hiring-role", weight: 0.6, halfLifeDays: 90,
      question: "Are they re-posting the same seller role (a ramp/retention problem, not a hiring problem)?",
      detect: (c) => {
        const aes = count(c.board, /account executive/i);
        return aes.length >= 2 ? { id: "en_perpetual_backfill", label: `${aes.length} concurrent AE reqs — backfill pattern`, detail: "Multiple identical seller reqs usually mean ramp or retention is broken.", evidenceUrl: aes[0].url, weight: 0.6, halfLifeDays: 90 } : null;
      },
    },
  ],
  "Customer Success": [
    {
      id: "cs_seat_req", type: "leadership-gap", weight: 0.8, halfLifeDays: 45,
      question: "Is a CS leadership seat open right now?",
      detect: (c) => {
        const reqs = count(c.board, CS_LEAD_RE);
        return reqs.length ? { id: "cs_seat_req", label: `Hiring your seat full-time: ${reqs[0].title}`, detail: "Bridge the search with fractional coverage.", evidenceUrl: reqs[0].url, weight: 0.8, halfLifeDays: 45 } : null;
      },
    },
    {
      id: "cs_sales_no_postsale", type: "function-gap", weight: 0.8, halfLifeDays: 60,
      question: "Are they signing customers with nobody owning what happens after the sale?",
      detect: (c) => count(c.board, SALES_IC_RE).length >= 2 && count(c.board, CS_RE).length === 0 && count(c.board, CS_LEAD_RE).length === 0
        ? { id: "cs_sales_no_postsale", label: "Hiring sellers with no post-sale function posted", detail: "New logos landing with nobody owning renewals and expansion.", evidenceUrl: c.board![0].url, weight: 0.8, halfLifeDays: 60 } : null,
    },
    {
      id: "cs_ics_no_leader", type: "team-without-leader", weight: 0.7, halfLifeDays: 60,
      question: "Are CS ICs being hired with no CS leadership posted?",
      detect: (c) => {
        const ics = count(c.board, CS_RE).filter((p) => !CS_LEAD_RE.test(p.title));
        return ics.length >= 2 && count(c.board, CS_LEAD_RE).length === 0
          ? { id: "cs_ics_no_leader", label: `Hiring ${ics.length} CS ICs with no leadership posted`, detail: `Open: ${ics.slice(0, 3).map((p) => p.title).join("; ")}`, evidenceUrl: ics[0].url, weight: 0.7, halfLifeDays: 60 } : null;
      },
    },
    {
      id: "cs_support_tool_no_cs", type: "function-gap", weight: 0.65, halfLifeDays: null,
      question: "Is support tooling live (Intercom/Zendesk class) with no CS function behind it?",
      detect: (c) => {
        const tools = (c.web?.techTags || []).filter((t) => ["intercom", "zendesk", "crisp", "freshdesk"].includes(t));
        return tools.length > 0 && count(c.board, CS_RE).length === 0 && (c.company.teamSize ?? 0) >= 15
          ? { id: "cs_support_tool_no_cs", label: `Support tooling live (${tools.join(", ")}) with no CS function`, detail: "Reactive support without proactive success leaves renewals to chance.", evidenceUrl: `https://${c.company.domain}`, weight: 0.65, halfLifeDays: null } : null;
      },
    },
    {
      id: "cs_size_no_cs", type: "function-gap", weight: 0.55, halfLifeDays: null,
      question: "At their size, should a CS function exist that doesn't (roles you could fill)?",
      detect: (c) => c.board !== null && c.board.length >= 2 && (c.company.teamSize ?? 0) >= 30 && count(c.board, CS_RE).length === 0 && count(c.board, CS_LEAD_RE).length === 0
        ? { id: "cs_size_no_cs", label: `No CS function at ${c.company.teamSize} people`, detail: "Revenue retention at this size needs an owner — none exists or is being hired.", evidenceUrl: c.board[0].url, weight: 0.55, halfLifeDays: null } : null,
    },
    {
      id: "cs_onboarding_language", type: "hiring-role", weight: 0.6, halfLifeDays: 60,
      question: "Is onboarding/implementation language showing up in their reqs (complexity rising)?",
      detect: (c) => {
        const reqs = (c.board || []).filter((p) => /onboarding|implementation|adoption/i.test(p.title));
        return reqs.length ? { id: "cs_onboarding_language", label: `Implementation complexity rising: ${reqs[0].title}`, detail: "Onboarding reqs mean deployments are getting heavier.", evidenceUrl: reqs[0].url, weight: 0.6, halfLifeDays: 60 } : null;
      },
    },
    {
      id: "cs_first_renewals", type: "function-gap", weight: 0.7, halfLifeDays: null,
      question: "Is their first real renewal cohort about to land (12–24 months after launch)?",
      detect: (c) => {
        const age = ageYears(c.company);
        return age !== null && age >= 1 && age <= 2 && (c.company.teamSize ?? 0) >= 10
          ? { id: "cs_first_renewals", label: "First renewal cohort landing", detail: `~${age} year(s) post-launch — the first annual contracts are coming due now.`, evidenceUrl: c.company.url, weight: 0.7, halfLifeDays: null } : null;
      },
    },
    {
      id: "cs_enterprise_no_support", type: "function-gap", weight: 0.6, halfLifeDays: 90,
      question: "Did they add an enterprise tier without an enterprise support model?",
      detect: (c) => c.web?.pricingEnterpriseTier && count(c.board, CS_RE).length === 0 && count(c.board, CS_LEAD_RE).length === 0
        ? { id: "cs_enterprise_no_support", label: "Enterprise tier with no CS function posted", detail: "Enterprise buyers expect a success model that doesn't exist yet.", evidenceUrl: `https://${c.company.domain}/pricing`, weight: 0.6, halfLifeDays: 90 } : null,
    },
  ],
  "AI GTM": [
    {
      id: "ai_pitch_no_builders", type: "function-gap", weight: 0.85, halfLifeDays: 60,
      question: "Do they market AI but post no AI roles (the most reliable fractional-technical buyer)?",
      detect: (c) => c.board !== null && c.board.length > 0 && AI_TEXT_RE.test(c.text) && count(c.board, AI_ROLE_RE).length === 0
        ? { id: "ai_pitch_no_builders", label: "AI in the pitch, no AI roles posted", detail: "They market AI but aren't hiring AI builders.", evidenceUrl: c.board[0].url, weight: 0.85, halfLifeDays: 60 } : null,
    },
    {
      id: "ai_req_open", type: "hiring-role", weight: 0.8, halfLifeDays: 60,
      question: "Is an AI/ML req open (a scarce hire you can bridge or scope)?",
      detect: (c) => {
        const reqs = count(c.board, AI_ROLE_RE).filter((p) => !/gtm engineer/i.test(p.title));
        return reqs.length ? { id: "ai_req_open", label: `AI/ML role open: ${reqs[0].title}`, detail: "AI reqs age badly — fractional coverage keeps the roadmap moving.", evidenceUrl: reqs[0].url, weight: 0.8, halfLifeDays: 60 } : null;
      },
    },
    {
      id: "ai_gtm_engineer_req", type: "hiring-role", weight: 0.8, halfLifeDays: 60,
      question: "Are they explicitly hiring a GTM engineer (they already believe in the category)?",
      detect: (c) => {
        const reqs = count(c.board, /gtm engineer/i);
        return reqs.length ? { id: "ai_gtm_engineer_req", label: `Hiring a GTM engineer: ${reqs[0].title}`, detail: "They already buy the AI-GTM thesis — the fastest close in the book.", evidenceUrl: reqs[0].url, weight: 0.8, halfLifeDays: 60 } : null;
      },
    },
    {
      id: "ai_api_docs", type: "function-gap", weight: 0.5, halfLifeDays: null,
      question: "Is a technical product (public API/docs) selling without a technical GTM motion?",
      detect: (c) => c.web?.hasApiDocs && count(c.board, AI_ROLE_RE).length === 0
        ? { id: "ai_api_docs", label: "Technical product, no technical GTM hires", detail: "Public API docs with no AI/technical GTM roles posted.", evidenceUrl: `https://${c.company.domain}`, weight: 0.5, halfLifeDays: null } : null,
    },
  ],
  Partnerships: [
    {
      id: "pt_seat_req", type: "leadership-gap", weight: 0.8, halfLifeDays: 45,
      question: "Is a partnerships seat open right now?",
      detect: (c) => {
        const reqs = count(c.board, PARTNER_RE).filter((p) => /vp|head|director/i.test(p.title));
        return reqs.length ? { id: "pt_seat_req", label: `Hiring your seat full-time: ${reqs[0].title}`, detail: "Bridge the search with fractional coverage.", evidenceUrl: reqs[0].url, weight: 0.8, halfLifeDays: 45 } : null;
      },
    },
    {
      id: "pt_channel_language", type: "hiring-role", weight: 0.75, halfLifeDays: 60,
      question: "Is channel/partner language appearing in their reqs for the first time?",
      detect: (c) => {
        const reqs = count(c.board, PARTNER_RE).filter((p) => !/vp|head|director/i.test(p.title));
        return reqs.length ? { id: "pt_channel_language", label: `Partner-facing role open: ${reqs[0].title}`, detail: "Channel language in reqs means the program is being willed into existence.", evidenceUrl: reqs[0].url, weight: 0.75, halfLifeDays: 60 } : null;
      },
    },
    {
      id: "pt_integrations_no_owner", type: "function-gap", weight: 0.75, halfLifeDays: null,
      question: "Does an integrations/marketplace page exist with nobody posted to own partnerships?",
      detect: (c) => c.web?.hasIntegrationsPage && count(c.board, PARTNER_RE).length === 0
        ? { id: "pt_integrations_no_owner", label: "Integrations page live with no partnerships owner", detail: "An ecosystem exists; nobody is monetizing it.", evidenceUrl: `https://${c.company.domain}`, weight: 0.75, halfLifeDays: null } : null,
    },
    {
      id: "pt_api_shipped", type: "function-gap", weight: 0.6, halfLifeDays: null,
      question: "Did they ship a public API (the raw material of a partner ecosystem)?",
      detect: (c) => c.web?.hasApiDocs && count(c.board, PARTNER_RE).length === 0
        ? { id: "pt_api_shipped", label: "Public API shipped, no partner function", detail: "APIs without a partner program leave ecosystem revenue on the table.", evidenceUrl: `https://${c.company.domain}`, weight: 0.6, halfLifeDays: null } : null,
    },
    {
      id: "pt_direct_at_scale", type: "function-gap", weight: 0.6, halfLifeDays: null,
      question: "Are they direct-only at a size where a channel program compounds (50+ people)?",
      detect: (c) => (c.company.teamSize ?? 0) >= 50 && c.board !== null && c.board.length > 0 && count(c.board, PARTNER_RE).length === 0
        ? { id: "pt_direct_at_scale", label: "Direct-only motion at 50+ people", detail: "At this size a channel program is the cheapest growth lever left.", evidenceUrl: c.company.url, weight: 0.6, halfLifeDays: null } : null,
    },
    {
      id: "pt_sales_scaling_no_channel", type: "function-gap", weight: 0.65, halfLifeDays: 60,
      question: "Is direct sales scaling with zero partner motion (CAC pressure building)?",
      detect: (c) => count(c.board, SALES_IC_RE).length >= 3 && count(c.board, PARTNER_RE).length === 0
        ? { id: "pt_sales_scaling_no_channel", label: "Scaling direct sales with no partner function", detail: "Every rep added raises CAC; channel bends the curve.", evidenceUrl: c.board![0].url, weight: 0.65, halfLifeDays: 60 } : null,
    },
  ],
  Sellers: [
    {
      id: "se_ae_req", type: "hiring-role", weight: 0.8, halfLifeDays: 45,
      question: "Is an AE seat open right now that a fractional seller can fill this week?",
      detect: (c) => {
        const reqs = count(c.board, /account executive|enterprise sales/i);
        return reqs.length ? { id: "se_ae_req", label: `Seller seat open: ${reqs[0].title}`, detail: "Pipeline doesn't wait for a hiring process.", evidenceUrl: reqs[0].url, weight: 0.8, halfLifeDays: 45 } : null;
      },
    },
    {
      id: "se_capacity_gap", type: "hiring-role", weight: 0.7, halfLifeDays: 60,
      question: "Are multiple seller reqs open at once (a capacity gap today, not a plan)?",
      detect: (c) => {
        const reqs = count(c.board, SALES_IC_RE);
        return reqs.length >= 2 ? { id: "se_capacity_gap", label: `${reqs.length} seller reqs open at once`, detail: "Demand exists now; seats are empty now.", evidenceUrl: reqs[0].url, weight: 0.7, halfLifeDays: 60 } : null;
      },
    },
    {
      id: "se_leader_no_reps", type: "function-gap", weight: 0.65, halfLifeDays: 60,
      question: "Did they hire a sales leader who has no reps yet?",
      detect: (c) => count(c.board, SALES_LEAD_RE).length > 0 && count(c.board, SALES_IC_RE).length === 0
        ? { id: "se_leader_no_reps", label: "Sales leadership posted with no rep seats", detail: "A leader without reps needs immediate carrying capacity.", evidenceUrl: c.board![0].url, weight: 0.65, halfLifeDays: 60 } : null,
    },
    {
      id: "se_founder_selling", type: "function-gap", weight: 0.6, halfLifeDays: null,
      question: "Is the founder still doing all the selling at 5–25 people?",
      detect: (c) => {
        const t = c.company.teamSize ?? 0;
        const age = ageYears(c.company);
        return c.board !== null && t >= 5 && t <= 25 && age !== null && age <= 3 && count(c.board, SALES_IC_RE).length === 0 && count(c.board, SALES_LEAD_RE).length === 0
          ? { id: "se_founder_selling", label: "Founder still carrying the bag", detail: `${t} people, no sales hires posted — first-seller opening.`, evidenceUrl: c.company.url, weight: 0.6, halfLifeDays: null } : null;
      },
    },
    {
      id: "se_enterprise_tier", type: "function-gap", weight: 0.6, halfLifeDays: 90,
      question: "Did an enterprise/sales-led tier appear that needs closers?",
      detect: (c) => (c.web?.pricingEnterpriseTier || c.web?.pricingContactSalesOnly) && count(c.board, SALES_IC_RE).length === 0
        ? { id: "se_enterprise_tier", label: "Sales-led pricing with no sellers posted", detail: "Contact-sales pricing needs someone to answer the contact.", evidenceUrl: `https://${c.company.domain}/pricing`, weight: 0.6, halfLifeDays: 90 } : null,
    },
  ],
};

/** Evaluate the operator's role library against one company's context. */
export function evaluateRoleSignals(role: OperatorRole, ctx: CompanyContext): TimingSignal[] {
  const now = new Date().toISOString();
  const out: TimingSignal[] = [];
  for (const def of LIBRARY[role] || []) {
    try {
      const hit = def.detect(ctx);
      if (hit) out.push({ ...hit, type: def.type, detectedOn: def.halfLifeDays === null ? undefined : now });
    } catch {
      /* one detector failing never blocks the rest */
    }
  }
  return out;
}

/**
 * Complete per-role signal documentation: library detectors above plus the
 * role-tuned news and daily-diff sources gated via ALLOWED_SIGNALS. Rendered
 * in the portal so operators can see exactly what their role scans for.
 */
const SHARED_DOCS: Record<string, string> = {
  departure: "Did the leader in this seat just depart (news)?",
  funding: "Did they raise in the last 30 days (budget + urgency)?",
  "leader-appointed": "Did a new GTM leader just take the seat (rebuild moment)?",
  "started-hiring": "Did they flip to hiring mode this week (directory diff)?",
  "headcount-jump": "Did headcount jump 20%+ (growth outrunning the org)?",
  "positioning-shift": "Did they just reposition (new message needs new motion)?",
  "newly-launched": "Did they just launch publicly (first-mover window)?",
  "ai-native": "Is leadership publicly committing to AI-native GTM?",
};

export function roleSignalDocs(role: OperatorRole, allowed: string[]): { label: string; question: string }[] {
  const docs = (LIBRARY[role] || []).map((d) => ({ label: d.id, question: d.question }));
  for (const type of allowed) {
    if (SHARED_DOCS[type]) docs.push({ label: type, question: SHARED_DOCS[type] });
  }
  return docs;
}
