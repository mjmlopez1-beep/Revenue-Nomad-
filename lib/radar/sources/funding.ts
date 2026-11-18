/**
 * Funding and growth events for the radar: a company in a member's Ideal Fractional Profile raised
 * money (or grew in a way a provider reports). THERE IS NO DATA SOURCE YET.
 *
 * The radar asks `fundingSource()` for events between its last run and now, about the companies on
 * Merlin, and turns each one that matches a member's profile into a "funding" signal (every
 * function: a raise is news for any fractional). Until a provider is added, the source returns
 * nothing, so no funding signal is ever made. Nothing here is made up.
 *
 * To add a provider: write a FundingSource whose `events` fetches from it (with a timeout, and an
 * empty list on any failure: a down provider must never stop the radar), and return it from
 * fundingSource() when its key is set, e.g. `process.env.RN_FUNDING_PROVIDER === "x"`. Match each
 * event to a company by its website domain (`domain` below), else its exact name.
 */

/** A company on Merlin, as a provider is asked about it. `id` is internal and never leaves the server. */
export interface FundingCompany {
  id: string;
  name: string;
  /** The website domain ("acme.com"), when one is on file. */
  domain: string | null;
}

/** One event a provider reports, matched to a company on Merlin. */
export interface FundingEvent {
  /** The company's internal id (FundingCompany.id). */
  companyId: string;
  /** When it was announced (ISO). */
  at: string;
  /** "Series A", "Seed", "Growth round". Null when the provider doesn't say. */
  round: string | null;
  /** "$12M". Null when the provider doesn't say. */
  amount: string | null;
  /** The provider's name, for the pilot metrics and the record. */
  source: string;
}

export interface FundingSource {
  name: string;
  /** Events announced after `sinceMs` and by `nowMs`, for these companies. Never throws: [] on failure. */
  events(opts: { sinceMs: number; nowMs: number; companies: FundingCompany[] }): Promise<FundingEvent[]>;
}

/** No provider: no events. */
export const NO_FUNDING: FundingSource = {
  name: "none",
  events: async () => [],
};

/** The source the radar reads. No provider is configured yet, so it is always NO_FUNDING. */
export function fundingSource(): FundingSource {
  return NO_FUNDING;
}
