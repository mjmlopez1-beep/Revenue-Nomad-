/**
 * Who can use integrations (alerts in Slack and webhooks). Free for every member during the
 * pilot. To limit them to a paid plan later, set INTEGRATIONS_FREE to false and fill in
 * `onPaidPlan`: the API route and the sender both ask `integrationsAllowed`, and the page shows
 * the locked state from IntegrationsView.allowed, so nothing else needs to change.
 */
export const INTEGRATIONS_FREE = true;

/** The paid plan check, for later. No member is on a paid plan yet. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const onPaidPlan = (_memberId: string): boolean => false;

export const integrationsAllowed = (memberId: string): boolean => INTEGRATIONS_FREE || onPaidPlan(memberId);
