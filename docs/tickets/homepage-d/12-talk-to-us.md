# 12: Talk to us at /talk

**What to build:** A visitor opens Talk to us from any header or footer, answers four questions (need, company
size, start date, contact) and sees a sent state with a booking link and their request summary. The request
reaches HubSpot (or the local store) and a person replies within 24 hours.

**Blocked by:** None

**Status:** done

- [x] `app/talk/content.ts`, `actions.ts`, `Talk.tsx`, `Talk.css`, `page.tsx`; `/talk` removed from the stub list
- [x] Shared lead recorder `app/leads/record.ts`; the check's action refactored onto it
- [x] Number-key shortcuts, answer chips, Back, focus management, validation alerts, pending state
- [x] Book a call defaults to the firm's Calendly page; overridable by `NEXT_PUBLIC_BOOK_CALL_URL`
- [x] `check:home` covers `/talk` (0 axe violations at 1440 and 390); browser run of the whole flow with a local
      record written and no page errors
- [ ] HubSpot: properties and the "Talk to us" form, then `HUBSPOT_TALK_FORM_ID` (owner; see the spec)
