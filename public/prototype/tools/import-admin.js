/* Regenerates js/data/operators.js (RN.data.rawOps) and js/data/ops_extra.js (RN.data.opLocations) from the
   admin portal operator export (GET /api/v1/admin/operators, scope status=approved AND is_searchable=true).
   usage: node tools/import-admin.js <admin-operators-YYYY-MM-DD.json> [--out <dir>] [--prev <operators.js>]
     --out   where to write operators.js and ops_extra.js (default js/data)
     --prev  the previous operators.js to carry forward fields the export does not hold (default <out>/operators.js,
             falling back to js/data/operators.js): local photo paths, slugs, review text (quote, reviewer role,
             verified tags, hire again) and the per-tag axis / stage / group the earlier export assigned.

   The export is untrusted data: nothing in it is evaluated, only read field by field.
   Privacy: email, phone, user_id, approved_by, LinkedIn URLs, remote photo URLs, video URLs, terms and
   onboarding flags and the role-detail "notes" are never copied. Anonymous engagements keep their role and dates
   but not the company name. Do not commit the export file itself.

   Mapping rules (validated field by field against the Sep 24 Operator Profile Explorer records, see the import
   diff report):
   - rate: operator.hourly_rate (else hourly_rate_usd), rounded. Monthly retainers never become a rate; they are
     kept separately as `retainer`. No hourly rate means rate null (the UI shows "Rate on request").
   - standard.revenueBuckets / employeeBuckets: the exact bucket slugs the operator picked (gaps kept, pre_revenue
     kept), which RN.model reads as op.revenueRanges / employeeRanges. standard.revRange / empRange keep the span
     from the lowest to the highest selected bucket, written the way the earlier export wrote it ("Up to $20M",
     "$5M+", "$1M–$20M", "51–200"), only as a fallback for records without the bucket arrays (en dash: data, not copy).
   - hours (a month): availability_hours_per_month, else availability_hours_per_week x 52 / 12, rounded (a weekly
     figure is never shown as a monthly one). hoursPerWeek keeps the weekly answer when that was the source.
   - availability.startDate: "Available now" reads the from date when it is on or before the prototype's today
     (RN.BASE_NOW in js/core/rn.js), else that today, so "Available now" never shows a later start; later
     starts keep available_from_date.
   - reputationIndex: summary.reputation_score rounded, as exported (no floor). reputationLabel: tier_label.
   - tags: verification_tier "verified" -> tier verified, everything else claimed; r = verified_review_count;
     score = expertise_score. Axis, stage and group: the earlier record's values for that tag name, then the fit
     tag library (taxonomy.js), then the category's axis.
   - engagements: only is_published and not deleted, one per engagement_history_id (the company-corroborated
     copy wins). clientVerified = buyer corroborated or co-signed. Currently active ones have no end ("Present").
   - reviews: only moderation_status approved and is_displayed. The export has no review text, so quote, role and
     tags come from the earlier record for the same reviewer and company (empty for a review not seen before).
   - engagementTypes, capacity (slots_available) and retainer are read by RN.model instead of being made up. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
const outDir = path.resolve(flag('--out') || path.join(__dirname, '..', 'js', 'data'));
let prevPath = flag('--prev');
const src = args[0];
if (!src) { console.error('usage: node tools/import-admin.js <export.json> [--out <dir>] [--prev <operators.js>]'); process.exit(1); }
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'js', 'data');
if (!prevPath) prevPath = fs.existsSync(path.join(outDir, 'operators.js')) ? path.join(outDir, 'operators.js') : path.join(DATA, 'operators.js');

/* ---------- Inputs ---------- */
const EXP = JSON.parse(fs.readFileSync(src, 'utf8'));
if (!EXP || !Array.isArray(EXP.operators)) { console.error('Not an admin operators export (no operators array)'); process.exit(1); }
const EXPORT_DAY = String(EXP.exported_at || new Date().toISOString()).slice(0, 10);
const EXPORT_MONTH = EXPORT_DAY.slice(0, 7);
// The prototype's clock (RN.BASE_NOW): "Available now" start dates are clamped to it so the page never reads
// "Available now" next to a later start date
const BASE_NOW_DAY = ((fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'rn.js'), 'utf8').match(/RN\.BASE_NOW = new Date\('(\d{4}-\d{2}-\d{2})/) || [])[1]) || EXPORT_DAY;

function loadData(files) {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of files) if (fs.existsSync(f)) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
  return (ctx.RN && ctx.RN.data) || {};
}
const prevData = fs.existsSync(prevPath) ? loadData([prevPath]) : {};
const prevOps = prevData.rawOps || [];
const prevById = new Map(prevOps.map((o) => [o.id, o]));
const lib = loadData([path.join(DATA, 'taxonomy.js')]).tagLibrary || [];
const libBy = new Map(lib.map((t) => [t.v.toLowerCase(), t]));

/* ---------- Vocabularies (the same ones RN.fields and build-taxonomy.js use) ---------- */
const CAT = { sales_leadership: 'Sales Leadership', marketing: 'Marketing', revenue_operations: 'Revenue Operations', sales_enablement: 'Sales Enablement', customer_success_growth: 'Customer Success & Growth', ai_gtm: 'AI GTM', partnerships: 'Partnerships', sellers: 'Sellers' };
const AX = { sales_leadership: 'Win deals', sellers: 'Win deals', marketing: 'Generate demand', partnerships: 'Generate demand', revenue_operations: 'Systems & data', ai_gtm: 'Systems & data', sales_enablement: 'Build the team', customer_success_growth: 'Retain & expand' };
const AVAIL = { available_now: 'Available now', available_2_weeks: 'Available in 2 weeks', available_2_plus_weeks: 'Available in 2+ weeks' };
const ENG_TYPE = { fractional_gtm: 'fractional', fractional: 'fractional', advisory: 'advisory', interim: 'interim', project_based: 'project', project: 'project' };
const MOTION = { inside_sales: 'Inside Sales', enterprise_sales: 'Enterprise Sales', channel: 'Channel', plg: 'PLG' };
const CRM = { salesforce: 'Salesforce', hubspot: 'HubSpot', pipedrive: 'Pipedrive', zoho: 'Zoho', netsuite: 'NetSuite', dynamics: 'Dynamics', microsoft_dynamics: 'Dynamics' };
const REV = [['pre_revenue', 0, 0], ['under_1m', 0, 1], ['1m_5m', 1, 5], ['5m_20m', 5, 20], ['20m_50m', 20, 50], ['50m_plus', 50, Infinity]];
const EMP = [['1_10', 1, 10], ['11_50', 11, 50], ['51_200', 51, 200], ['201_500', 201, 500], ['501_1000', 501, 1000], ['1001_plus', 1001, Infinity]];
const MATT_ID = '89623cd5-5362-4859-86f0-3f2e03f6b6ba';

/* ---------- Helpers ---------- */
const str = (v) => (v == null ? '' : String(v).trim());
const num = (v) => (v == null || v === '' || isNaN(+v) ? null : +v);
// Postgres array text "{a,b}" (or a real array) -> ['a','b']
const pgArr = (v) => (Array.isArray(v) ? v : String(v == null ? '' : v).replace(/^\{|\}$/g, '').split(',')).map((x) => String(x).replace(/^"|"$/g, '').trim()).filter((x) => x && x !== 'null');
const cap = (s) => str(s).split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
// First and last name ("Jill Clark Fulmer" -> "JF"), as the earlier records had them
// (words in brackets, such as a maiden name or nickname, are skipped: "Christine Souza (Morrison)" -> "CS")
const initials = (name) => { const w = String(name || '').split(/\s+/).filter((x) => /^\p{L}/u.test(x)); return (w.length > 1 ? [w[0], w[w.length - 1]] : w).map((x) => x[0].toUpperCase()).join(''); };
// Free text never carries contact details: email addresses and phone numbers are cut out (a bio that was only an
// email address becomes empty)
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE_RE = /(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g;
let redactions = 0;
// Links are contact details too (a personal booking link such as calendly.com/<name>): the line that carries one is dropped
const URL_RE = /(?:https?:\/\/|www\.)\S+|\b(?:calendly\.com|cal\.com|meetings\.hubspot\.com)\/\S*/i;
const dropUrlLines = (s) => (URL_RE.test(s) ? s.split('\n').filter((line) => !URL_RE.test(line)).join('\n').trim() : s);
const clean = (v) => { const s0 = str(v); const s1 = dropUrlLines(s0.replace(EMAIL_RE, '').replace(PHONE_RE, '')); if (s1 === s0) return s0; redactions++; const s2 = s1.replace(/[ \t]{2,}/g, ' ').trim(); return /^[\s\p{P}]*$/u.test(s2) ? '' : s2; };
const ym = (iso) => (iso ? String(iso).slice(0, 7) : '');
const monthsBetween = (a, b) => { if (!a || !b) return 0; const [y1, m1] = a.split('-').map(Number); const [y2, m2] = b.split('-').map(Number); return Math.max(0, (y2 - y1) * 12 + (m2 - m1)); };
// Industry value the way the live export stored it ("SaaS" -> "Saas", "Hardware / IoT" -> "Hardware / Iot", but
// "Deep Tech / AI" and "SMB Software" as RN.fields stores them); RN.fields.industries maps each back to its label
const fieldsSrc = fs.readFileSync(path.join(DATA, 'fields.js'), 'utf8');
const indBlock = fieldsSrc.slice(fieldsSrc.indexOf('const IND = ['), fieldsSrc.indexOf('];', fieldsSrc.indexOf('const IND = [')));
const IND = new Map([...indBlock.matchAll(/\['([^']+)', '([^']+)'\]/g)].map((m) => [m[1].toLowerCase(), m[1]]));
const unknownInd = new Map();
const indLabel = (s) => { const t = str(s).toLowerCase().replace(/-/g, ' ').replace(/(^|\s)(\S)/g, (m, a, c) => a + c.toUpperCase()); const hit = IND.get(t.toLowerCase()); if (!hit && t) unknownInd.set(t, str(s)); return hit || t; };

function revRange(v) {
  const sel = REV.filter(([k]) => pgArr(v).includes(k));
  if (!sel.length) return null;
  const lo = sel[0], hi = sel[sel.length - 1];
  if (lo[0] === 'pre_revenue' && hi[0] === 'pre_revenue') return 'Pre-revenue';
  if (lo[2] <= 1) { // starts at pre-revenue or under $1M
    if (hi[0] === 'under_1m' || hi[0] === 'pre_revenue') return 'Under $1M';
    if (hi[2] === Infinity) return 'Under $1M to $50M+';
    return `Up to $${hi[2]}M`;
  }
  return hi[2] === Infinity ? `$${lo[1]}M+` : `$${lo[1]}M–$${hi[2]}M`;
}
function empRange(v) {
  const sel = EMP.filter(([k]) => pgArr(v).includes(k));
  if (!sel.length) return null;
  const lo = sel[0], hi = sel[sel.length - 1];
  if (hi[2] === Infinity) return lo === hi ? '1,000+' : `${lo[1]}–1,000+`;
  return `${lo[1]}–${hi[2]}`;
}
function crmOf(rd) {
  if (str(rd.primary_crm)) return str(rd.primary_crm);
  const list = Array.isArray(rd.primary_crm_platforms) ? rd.primary_crm_platforms : String(rd.primary_crm_platforms || '').split(',');
  const keys = list.map((x) => str(x).toLowerCase()).filter(Boolean);
  const k = keys.find((x) => x === 'salesforce' || x === 'hubspot') || keys.find((x) => CRM[x]);
  return k ? CRM[k] : '';
}
// Locations: the operator's own label, tidied the way build-taxonomy.js tidied the earlier dataset
const LOC_FIX = { 'uk london': 'London, UK', 'atlanta, ga': 'Atlanta, GA', 'chicago, il': 'Chicago, IL', 'boston ma': 'Boston, MA', 'philadephia, pa': 'Philadelphia, PA', 'houston,tx': 'Houston, TX', 'singapore, 01, singapore': 'Singapore', 'singapore, 01': 'Singapore', 'lafayette, ca': 'Lafayette, CA', 'oceanside ca': 'Oceanside, CA', nyc: 'New York, NY', 'nyc metro': 'New York, NY', 'new york city': 'New York, NY', 'new york city, ny': 'New York, NY', chicago: 'Chicago, IL', 'cghicago, il': 'Chicago, IL', 'atlanta ga & nashville tn usa': 'Atlanta, GA & Nashville, TN', 'boston, massachusetts': 'Boston, MA', 'london, united kingdom': 'London, UK', 'london, england': 'London, UK', 'london, eng, united kingdom': 'London, UK', toronto: 'Toronto, ON', 'toronto, ontario': 'Toronto, ON', 'mtn. view, ca': 'Mountain View, CA', 'santa monica, ca (los angeles)': 'Santa Monica, CA', 'denver,  co': 'Denver, CO', 'south lake tahoe ca': 'South Lake Tahoe, CA', 'san francisco, ca': 'San Francisco, CA', 'london until september, then sydney from september onwards.': 'London / Sydney', 'raleigh nc and miami fl': 'Raleigh, NC & Miami, FL', 'savannah, ga and salt lake city, utah': 'Savannah, GA & Salt Lake City, Utah', 'los angeles, ca usa': 'Los Angeles, CA', 'norwalk, ct usa': 'Norwalk, CT', 'montreal quebec, canada': 'Montreal, Quebec', 'franklin ma': 'Franklin, MA', 'raleigh nc': 'Raleigh, NC', 'atlanta ga': 'Atlanta, GA', 'jacksonville fl': 'Jacksonville, FL', 'orlando florida': 'Orlando, Florida', 'westchester county ny': 'Westchester County, NY', 'liverpool uk': 'Liverpool, UK', 'bucharest, romania, europe': 'Bucharest, Romania', 'lagos, la, nigeria': 'Lagos, Nigeria', 'washington dc': 'Washington, DC', 'jersey city, nj (greater nyc area)': 'Jersey City, NJ', atlanta: 'Atlanta, GA', charlotte: 'Charlotte, NC', 'las vegas': 'Las Vegas, NV', 'los angeles': 'Los Angeles, CA', miami: 'Miami, FL', minneapolis: 'Minneapolis, MN', 'new york': 'New York, NY', bangkok: 'Bangkok, Thailand' };
function tidyLoc(label) {
  let s = str(label).replace(/\s+/g, ' ');
  if (!s) return '';
  s = s.replace(/,\s*(United States|USA|US)$/i, '');
  const fix = LOC_FIX[s.toLowerCase()];
  if (fix) return fix;
  s = s.replace(/\s*,\s*/g, ', ');
  // "Victoria, BC, Canada" -> "Victoria, BC" (a province code already says Canada)
  s = s.replace(/^(.+, (?:ON|QC|BC|AB|MB|SK|NS|NB|NL|PE)), Canada$/, '$1');
  // Two-letter region codes in capitals ("Chicago, Il" -> "Chicago, IL"); all-lower words capitalized
  s = s.replace(/, ([A-Za-z]{2})(?=$| \/|,)/g, (m, c) => ', ' + c.toUpperCase());
  s = s.split(' ').map((w) => (/^[a-z]/.test(w) && w === w.toLowerCase() && !/^(and|of|de|la|the)$/.test(w) ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
  return s;
}

/* ---------- Tag geometry carried from the earlier records (one value per tag name) ---------- */
const tagGeo = new Map();
for (const o of prevOps) for (const t of ((o.profile || {}).tags || [])) { const k = String(t.t).toLowerCase(); if (!tagGeo.has(k)) tagGeo.set(k, { g: t.g, axis: t.axis, stage: t.stage }); }
const unknownTags = new Set();
function tagOf(x) {
  const t = str(x.display_name) || str(x.slug);
  const catKey = str(x.category) || '';
  const c = CAT[catKey] || cap(catKey.replace(/_/g, ' '));
  const prev = tagGeo.get(t.toLowerCase());
  const L = libBy.get(t.toLowerCase());
  if (!prev && !L) unknownTags.add(t);
  const geo = prev || (L ? { g: L.g || c, axis: L.axis || AX[catKey] || '', stage: L.stage || '' } : { g: c, axis: AX[catKey] || '', stage: '' });
  const r = Math.max(0, num(x.verified_review_count) || 0);
  return { t, c, g: geo.g || c, score: num(x.expertise_score) || 0, tier: x.verification_tier === 'verified' ? 'verified' : 'claimed', axis: geo.axis || '', stage: geo.stage || '', r, e: [], _v: x.verification_tier, _o: num(x.display_order) || 0 };
}
const TIER_ORDER = { verified: 0, self_claimed: 1, unverified: 2 };

// "Available now": the from date if it is on or before the prototype's today, else that today. Later starts keep
// their date (none: null)
function startDate(x) {
  const from = x.available_from_date ? String(x.available_from_date).slice(0, 10) : '';
  if (!x.availability_status || x.availability_status === 'available_now') return from && from <= BASE_NOW_DAY ? from : BASE_NOW_DAY;
  return from || null;
}

/* ---------- One operator ---------- */
const photoFile = (id) => path.join(ROOT, 'assets', 'photos', id + '.jpg');
const stats = { reviewsCarried: 0, reviewsNew: 0, engDeduped: 0, engAnon: 0 };
function convert(rec) {
  const x = rec.operator || {};
  const s = rec.summary || {};
  const id = str(x.id);
  const prev = prevById.get(id) || null;
  const prevP = (prev && prev.profile) || {};
  const name = [cap(x.first_name), cap(x.last_name)].filter(Boolean).join(' ');
  const roleSlug = str(s.primary_role_slug || x.primary_role_slug);
  const catKey = str(s.role_category || x.role_category);
  const role = str(s.primary_role_display || x.primary_role_display) || cap(roleSlug.replace(/_/g, ' '));
  const cat = CAT[catKey] || cap(catKey.replace(/_/g, ' '));
  const rate = num(s.hourly_rate != null ? s.hourly_rate : x.hourly_rate) || num(x.hourly_rate_usd);
  const photo = prev && prev.photo && fs.existsSync(path.join(ROOT, prev.photo)) ? prev.photo : fs.existsSync(photoFile(id)) ? `assets/photos/${id}.jpg` : '';

  // Role details: the category's answers as exported, minus free-text notes, plus the aliases the views read
  const rdSrc = (rec.role_details || []).find((r) => r.role_category === catKey) || (rec.role_details || [])[0] || { details: {} };
  const rd = Object.assign({}, rdSrc.details || {});
  delete rd.notes;
  if (!('largest_team_managed' in rd) && 'salespeople_managed' in rd) rd.largest_team_managed = rd.salespeople_managed;
  if (!('largest_team_quota_managed' in rd) && 'largest_team_quota_usd' in rd) rd.largest_team_quota_managed = rd.largest_team_quota_usd;

  let industries = [...new Set((rec.industries || []).map((i) => indLabel(i.display_name || i.slug)).filter(Boolean))];
  // Same set as before: keep the earlier order (the admin export lists them in another order)
  const prevInd = (prev && prev.standard && prev.standard.industries) || null;
  if (prevInd && prevInd.length === industries.length && prevInd.every((v) => industries.includes(v))) industries = prevInd.slice();
  // Hours a month: the monthly answer, else the weekly one converted (52 weeks / 12 months)
  const perWeek = num(x.availability_hours_per_month) ? null : num(x.availability_hours_per_week) || null;
  const hours = num(x.availability_hours_per_month) || (perWeek ? Math.round((perWeek * 52) / 12) : null);
  const buckets = (v, list) => { const sel = pgArr(v); return list.map(([k]) => k).filter((k) => sel.includes(k)); };
  const standard = { revRange: revRange(x.revenue_size_bucket), empRange: empRange(x.employee_size_bucket), revenueBuckets: buckets(x.revenue_size_bucket, REV), employeeBuckets: buckets(x.employee_size_bucket, EMP), crm: crmOf(rd), hours, industries };

  // Reviews: approved and displayed only; text carried from the earlier record
  const prevRev = prevP.reviews || [];
  const key = (a, b) => str(a).toLowerCase() + '|' + str(b).toLowerCase();
  const reviews = (rec.reviews || []).filter((r) => r.moderation_status === 'approved' && r.is_displayed === true)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map((r) => {
      const old = prevRev.find((p) => key(p.reviewer, p.company) === key(r.reviewer_name, r.reviewer_company));
      if (old) stats.reviewsCarried++; else stats.reviewsNew++;
      return Object.assign({ reviewer: str(r.reviewer_name), role: '', company: str(r.reviewer_company), date: '', overall: null, core: null, hireAgain: null, tags: [], quote: '' }, old || {},
        { reviewer: str(r.reviewer_name), company: str(r.reviewer_company), date: String(r.created_at || '').slice(0, 10), overall: num(r.overall_rating) });
    });
  const hire = reviews.filter((r) => r.hireAgain != null);
  const avg = num(s.avg_overall_rating != null ? s.avg_overall_rating : x.avg_overall_rating);

  // Engagements: published, one per engagement history entry, anonymous ones without the company
  const pub = (rec.engagements || []).filter((e) => e.is_published === true && !e.deleted_at);
  const groups = new Map();
  for (const e of pub) { const k = e.engagement_history_id || e.id; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
  const rank = (e) => (e.verification_status === 'buyer_corroborated' || e.buyer_cosigned ? 0 : 2) + (e.is_company_anonymous ? 1 : 0);
  const engagements = [...groups.values()].map((list) => {
    if (list.length > 1) stats.engDeduped += list.length - 1;
    const e = list.slice().sort((a, b) => rank(a) - rank(b) || String(b.updated_at).localeCompare(String(a.updated_at)))[0];
    if (e.is_company_anonymous) stats.engAnon++;
    const start = ym(e.start_date), end = ym(e.end_date);
    return {
      company: e.is_company_anonymous ? 'Confidential company' : str(e.company_name) || 'Confidential company',
      role: str(e.role_held), start, end,
      months: start ? monthsBetween(start, end || EXPORT_MONTH) : 0,
      revenueBand: str(e.company_revenue_bucket),
      clientVerified: e.verification_status === 'buyer_corroborated' || e.buyer_cosigned === true,
    };
  }).sort((a, b) => String(b.start).localeCompare(String(a.start)));

  const tags = (rec.tags || []).map(tagOf)
    .map((t, i) => Object.assign(t, { _i: i }))
    // Client-verified first, then the operator's display order; ties: self-claimed before unverified, then export order
    .sort((a, b) => (a._v === 'verified' ? 0 : 1) - (b._v === 'verified' ? 0 : 1) || a._o - b._o || (TIER_ORDER[a._v] ?? 3) - (TIER_ORDER[b._v] ?? 3) || a._i - b._i)
    .map((t) => { delete t._v; delete t._i; delete t._o; return t; });

  const methods = rd.methodologies != null ? rd.methodologies : [];
  const tz = str(x.timezone);
  const repRaw = num(s.reputation_score != null ? s.reputation_score : x.reputation_score);
  const out = {
    standard,
    id,
    slug: (prev && prev.slug) || [slugify(name), roleSlug.replace(/_/g, '-'), id].filter(Boolean).join('-'),
    name,
    role,
    cat,
    rate: rate ? Math.round(rate) : null,
    isMatt: id === MATT_ID || !!(prev && prev.isMatt),
    photo,
    initials: initials(name),
    roleDetails: rd,
    profile: {
      name,
      title: role,
      desc: clean(x.one_line_positioning) || clean(x.profile_headline),
      bio: clean(x.bio),
      sample: false,
      core: { n: reviews.length, v: [null, null, null, null], overall: reviews.length ? avg || null : null },
      profile: {
        reputationIndex: repRaw == null ? null : Math.round(repRaw),
        reputationLabel: str(x.tier_label),
        engagements: engagements.length,
        wouldHireAgain: hire.length ? Math.round((hire.filter((r) => r.hireAgain).length / hire.length) * 100) / 100 : null,
        totalTags: tags.length,
      },
      reviews,
      details: {
        photo: '',
        timezone: tz || 'Not provided',
        availability: Object.assign({ status: AVAIL[x.availability_status] || 'Available now', startDate: startDate(x), hoursPerMonth: hours }, perWeek ? { hoursPerWeek: perWeek } : null),
        industries,
        snapshot: {
          largestTeam: str(rd.largest_team_managed != null ? rd.largest_team_managed : rd.salespeople_managed),
          largestQuota: '',
          motions: pgArr(x.sales_motions).map((m) => MOTION[m]).filter(Boolean),
          salesCycle: str(rd.avg_sales_cycle_days),
          methodologies: methods,
        },
        bestFor: [],
        engagements,
        standard,
      },
      tags,
    },
    // Read by RN.model (were illustrative before this export carried them)
    engagementTypes: [...new Set(pgArr(x.engagement_types).map((t) => ENG_TYPE[t]).filter(Boolean))],
    capacity: num(x.slots_available),
    retainer: num(x.monthly_retainer_min) || num(x.monthly_retainer_max) ? { min: num(x.monthly_retainer_min), max: num(x.monthly_retainer_max) } : null,
  };
  return out;
}

/* ---------- Run ---------- */
const recs = EXP.operators.filter((r) => r && r.operator && r.operator.id && r.operator.status === 'approved' && r.operator.is_searchable !== false && !r.operator.deleted_at);
const ops = recs.map(convert);
// Matt first (existing views read M.ops order in places), then the earlier order, then new operators by approval date
const prevIdx = new Map(prevOps.map((o, i) => [o.id, i]));
const approved = new Map(recs.map((r) => [r.operator.id, String(r.operator.approved_at || r.operator.created_at || '')]));
ops.sort((a, b) => (b.isMatt - a.isMatt) || ((prevIdx.has(a.id) ? prevIdx.get(a.id) : 1e6) - (prevIdx.has(b.id) ? prevIdx.get(b.id) : 1e6)) || approved.get(a.id).localeCompare(approved.get(b.id)) || a.name.localeCompare(b.name));

// Guard: nothing private may reach the page
const blob = JSON.stringify(ops);
const leaks = [/[\w.+-]+@[\w-]+\.[a-z]{2,}/i, /linkedin\.com/i, /revenuenomad\.com/i, /acrform\.ai/i, /storage\/operators/i, /https?:\/\//i, /calendly\.com/i, /"(?:user_id|approved_by|email\w*|phone\w*|linkedin\w*|\w*token\w*|password\w*|secret\w*)":/i];
const hit = leaks.find((re) => re.test(blob));
if (hit) { console.error('Refusing to write: private-looking value matched', hit); process.exit(2); }
// Phone numbers in free text (bio, headline, review quotes)
const phoneIn = ops.find((o) => [o.profile.bio, o.profile.desc, ...o.profile.reviews.map((r) => r.quote)].some((t) => /(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/.test(t || '')));
if (phoneIn) { console.error('Refusing to write: a phone number appears in the text of', phoneIn.id); process.exit(2); }

const srcName = path.basename(src);
const head = `/* Generated by tools/import-admin.js from the admin portal operator export ${srcName} (exported ${EXPORT_DAY}, scope ${str(EXP.scope) || 'approved and searchable'}). Do not edit by hand. */\n`;
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'operators.js'), head + 'window.RN = window.RN || {}; RN.data = RN.data || {};\nRN.data.rawOps = ' + JSON.stringify(ops) + ';\n');
const loc = {};
for (const r of recs) loc[r.operator.id] = tidyLoc(r.operator.location_label || r.operator.location);
fs.writeFileSync(path.join(outDir, 'ops_extra.js'), `/* Generated by tools/import-admin.js: operator locations (location_label, tidied) from ${srcName}. The one source for real operators' locations. */\nwindow.RN = window.RN || {}; RN.data = RN.data || {};\nRN.data.opLocations = ` + JSON.stringify(loc) + ';\n');

const overlap = ops.filter((o) => prevById.has(o.id)).length;
const dropped = prevOps.filter((o) => !ops.some((n) => n.id === o.id)).map((o) => o.name);
console.log(`operators ${ops.length} (export count ${EXP.count}), carried from previous ${overlap}, new ${ops.length - overlap}, removed ${dropped.length}${dropped.length ? ' (' + dropped.join(', ') + ')' : ''}`);
console.log(`with photo ${ops.filter((o) => o.photo).length}, with rate ${ops.filter((o) => o.rate).length}, with reviews ${ops.filter((o) => o.profile.reviews.length).length}, reviews carried ${stats.reviewsCarried} new ${stats.reviewsNew}, engagements ${ops.reduce((a, o) => a + o.profile.details.engagements.length, 0)} (deduped ${stats.engDeduped}, anonymous ${stats.engAnon})`);
if (unknownInd.size) console.log(`industries not in RN.fields.industries (${unknownInd.size}): ${[...unknownInd.keys()].sort().join('; ')}`);
if (unknownTags.size) console.log(`tags not in the fit tag library or earlier records (${unknownTags.size}): ${[...unknownTags].sort().join('; ')}`);
if (redactions) console.log(`contact details removed from ${redactions} text field(s)`);
console.log('->', path.join(outDir, 'operators.js'), path.join(outDir, 'ops_extra.js'));
