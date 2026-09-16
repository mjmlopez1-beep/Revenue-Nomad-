# Revenue Nomad — Phase One mockup

Interactive, self-contained mockup of the Phase One spec (availability pulse, project invites, admin pipeline, operator project view). No build step — open `index.html` in a browser.

Three vantage points via the switcher in the header:

- **Admin** — project list, six-stage pipeline board (with the selected → staffed auto-close rules), board/list toggle, new-project flow with filtered vs whole-pool audience picker and email preview, and the first reports off the event log.
- **Operator** — Projects tab in its three groups, project page with interest + vetting answers, ask-a-question, and decline-with-reason; availability editor.
- **Emails** — all six templates (8.1–8.6) with the one-tap pulse buttons wired to the no-login confirmation page.

All data is sample data held in-page; interactions (stage moves, interest, declines, questions, pulse taps) update the mock state live so the flows can be clicked end to end.
