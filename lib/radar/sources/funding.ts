/**
 * Funding and growth events for the radar: a company in a member's Ideal Fractional Profile raised
 * money (or grew in a way a provider reports). The provider is SEC Form D filings (lib/funding),
 * on with RN_FUNDING=1: the daily funding run matches each filing to a company on file and keeps
 * the event, and this source gives back the ones recorded in the radar's window. Off, the source
 * returns nothing, so no funding signal is ever made. Nothing here is made up.
 *
 * The radar asks `fundingSource()` for events between its last run and now, about the companies on
 * Merlin, and turns each one that matches a member's profile into a "funding" signal (every
 * function: a raise is news for any fractional).
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
  /** Where and when, as the card says it after the amount: "SEC filing, Oct 2026". Then `amount` reads "about $5M". */
  note?: string | null;
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

/** SEC Form D filings, as the daily funding run kept them (lib/funding/run.ts). Never throws. */
export const SEC_FILINGS: FundingSource = {
  name: "SEC filings",
  events: async (opts) => {
    try {
      return await (await import("../../funding/run")).storedFundingEvents(opts);
    } catch (e) {
      console.error("funding events not read", e);
      return [];
    }
  },
};

/** The source the radar reads: SEC filings with RN_FUNDING=1, else NO_FUNDING. */
export function fundingSource(): FundingSource {
  return process.env.RN_FUNDING === "1" ? SEC_FILINGS : NO_FUNDING;
}
