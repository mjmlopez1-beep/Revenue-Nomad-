// Revenue Nomad Projects prototype — data model (BUILD_BRIEF.md section 4).

export type Role = "buyer" | "operator" | "admin";

export type Category =
  | "Sales Leadership"
  | "Revenue Operations"
  | "Sales Enablement"
  | "Customer Success & Growth"
  | "Marketing"
  | "Partnerships"
  | "AI GTM"
  | "Sellers";

/** One record from seed/operators.json. Every field is kept; only the ones the app reads are typed. */
export interface Operator {
  id: string;
  slug: string;
  name: string;
  first: string;
  initials: string;
  role: string;
  cat: string;
  headline: string;
  loc: string;
  rate: number | null;
  hrs: number;
  avail: string;
  tags: string[];
  ntags: number;
  industries: string[];
  eng: number;
  rev: number;
  allTags: string[];
  verifiedTags: string[];
  photo: string | null;
  profileUrl: string;
  explorerUrl: string;
  lastConfirmedAt: string | null;
  availableFrom: string | null;
  timezone: string | null;
  reputation: number;
  allIndustries: string[];
  profile?: {
    bio?: string;
    reviews?: { reviewer: string; role: string; company: string; date: string; overall: number; quote: string }[];
    details?: { engagements?: { company: string; role: string; start: string; end: string; months: number }[] };
  };
  [k: string]: unknown;
}

/** Mutable per-operator state layered over the seed record. */
export interface OperatorState {
  lastConfirmedAt: string | null;
  alertPrefs: string[];
  availability: "open" | "from" | "unavailable" | null;
  availableFrom?: string | null;
  hoursPerMonth?: number | null;
}

export interface Buyer {
  id: string;
  company: string;
  companyDescriptor: string;
  contactName: string;
  contactTitle: string;
  email: string;
}

export type ProjectStatus = "draft" | "live" | "paused" | "closed_to_responses" | "staffed" | "closed_unfilled";
export type Visibility = "invite_only" | "invites_plus_open";

export interface Project {
  id: string;
  origin: "buyer" | "revenue_nomad";
  ownerBuyerId?: string;
  ownerAdminId?: string;
  status: ProjectStatus;
  title: string;
  successIn90Days: string;
  hoursPerMonthMin: number;
  hoursPerMonthMax: number;
  term: string;
  startTarget: string;
  location: string;
  budgetMin?: number | null;
  budgetMax?: number | null;
  mustHaves: string[];
  screeningQuestions: string[];
  companyDescriptor: string;
  hideCompanyUntilIntro: boolean;
  visibility: Visibility;
  wantsRnSuggestions: boolean;
  clientName?: string;
  billRate?: number | null;
  operatorRate?: number | null;
  revealClientOnShortlist?: boolean;
  postedAt: number | null;
  staffedAt: number | null;
  closedAt: number | null;
  pausedAt?: number | null;
  createdAt: number;
  updatedAt: number;
  selectedOperatorId?: string | null;
  adminNote?: string;
  lastNudgedAt?: number | null;
  fitBrief?: string;
  /** GTM problem / scope in the client's words, shown to operators (live layout L2, L3). */
  scope?: string;
  /** Soft respond-by date shown on invites ("Closes Sep 28"). Set when the project is posted. */
  respondBy?: number | null;
  /** Operators picked on B3 / A3 before posting. Invites go out when the project is posted. */
  draftInvites?: string[];
}

export type InviteSource = "buyer" | "rn_suggested" | "admin";
export interface Invite {
  id: string;
  projectId: string;
  operatorId: string;
  source: InviteSource;
  createdAt: number;
  sentAt: number;
  /** True when the invite was added after the operator had already responded (X-03): no email went out. */
  silent?: boolean;
}

export interface Alert {
  id: string;
  projectId: string;
  operatorId: string;
  sentAt: number;
  digest: boolean;
}

export type Decision = "none" | "intro_requested" | "not_a_fit" | "selected";
export type RnStage = "invited" | "responded" | "shortlisted" | "with_client" | "selected" | "not_selected";

export interface Response {
  id: string;
  projectId: string;
  operatorId: string;
  interest: "interested" | "declined";
  declineReason?: string | null;
  /** Optional free text with a pass (L3 "Anything else"). Only Revenue Nomad sees it. */
  declineNote?: string | null;
  /** Engagements from the operator's profile attached as proof (L3 "Attach proof"). */
  proof?: string[];
  rate: number | null;
  hoursPerMonth: number | null;
  canStart: string | null;
  answers: string[];
  note: string;
  submittedAt: number | null;
  draft: boolean;
  createdAt: number;
  updatedAt: number;
  viaSource: "invite" | "rn_suggested" | "admin" | "alert" | "browse";
  decision: Decision;
  notAFitReason?: string | null;
  decisionAt?: number | null;
  viewedAt?: number | null;
  closeEmailSentAt?: number | null;
  withdrawn?: boolean;
  simulated?: boolean;
}

export interface PipelineEntry {
  projectId: string;
  operatorId: string;
  stage: RnStage;
  note: string;
  updatedAt: number;
}

export interface Question {
  id: string;
  projectId: string;
  operatorId: string;
  text: string;
  askedAt: number;
  answer?: string | null;
  answeredAt?: number | null;
  answeredBy?: Role | null;
}

export interface IntroRequest {
  id: string;
  projectId: string;
  operatorId: string;
  buyerId: string | null;
  createdAt: number;
  /** Auto-approved for the prototype (gap G14). */
  status: "approved" | "withdrawn";
  withdrawnAt?: number | null;
  /** Times offered to the operator with the intro, from the buyer's default availability. */
  slots?: string[];
  /** The slot the operator booked with one tap. */
  bookedSlot?: string | null;
  bookedAt?: number | null;
}

export interface Shortlist {
  id: string;
  projectId: string;
  sentAt: number;
  operators: { operatorId: string; name: string; role: string; fit: number; billRate: number | null }[];
}

export interface OutboxLink {
  label: string;
  path: string;
  /** Magic-link sign in (gap G12): "operator:<id>", "buyer:<id>", "admin:<id>" or "client". */
  as?: string;
}

export interface OutboxEntry {
  id: string;
  at: number;
  kind:
    | "invite"
    | "alert"
    | "digest"
    | "question"
    | "answer"
    | "intro"
    | "selected"
    | "close"
    | "nudge"
    | "pulse"
    | "shortlist"
    | "booking"
    | "reply"
    | "suggestions";
  to: { role: Role | "client"; id: string; name: string; email: string };
  subject: string;
  body: string;
  links: OutboxLink[];
  projectId?: string;
  operatorId?: string;
}

export interface AppEvent {
  id: string;
  at: number;
  type: string;
  actorRole: Role | "system" | "client";
  actorId: string;
  actorName: string;
  projectId?: string;
  operatorId?: string;
  meta?: Record<string, unknown>;
}

export interface Session {
  role: Role;
  buyerId: string;
  operatorId: string;
  adminId: string;
}

export interface State {
  version: number;
  clockOffsetMs: number;
  opState: Record<string, OperatorState>;
  projects: Project[];
  invites: Invite[];
  alerts: Alert[];
  responses: Response[];
  pipeline: PipelineEntry[];
  questions: Question[];
  intros: IntroRequest[];
  shortlists: Shortlist[];
  outbox: OutboxEntry[];
  events: AppEvent[];
  seq: number;
}
