# Buyer usability audit

The buyer's job: get quick requirements down, push the role to as many operators as possible, sort the good responses from the rest quickly, and get calls booked. This audit counts clicks and keystrokes for that job before and after the changes on this branch.

Scenario: post a Fractional VP of Sales seat, send it to every matching operator, sort 8 responses (2 strong, 3 possible, 3 weak), and book calls with the 2 strong fits.

## Before and after

| Step | Before | After |
|---|---|---|
| Write the brief | 1 click to start, then about 290 keystrokes and 10 field clicks. Title, success line, budget, 3 must-haves and 2 screening questions all typed by hand | 2 clicks: **Post a project**, then a template. 0 keystrokes. Hours and budget change with one-click presets; must-haves add from one-click suggestions |
| Send it out | 2 more clicks on a second screen (Continue, then Post project) | 1 click: **Post now, open to all** on the same screen. The invite step is optional |
| Get more reach | Revenue Nomad suggestions were off by default and set on the second screen | On by default for new projects, with the checkbox next to the post button |
| Invite specific people | Search and click each operator | Unchanged, plus **Invite the top 5 matches** in one click |
| Pass on the 3 weak fits | 1 click (bulk) | 1 click (bulk), now with Undo |
| Pass on one more | 2 clicks: Not a fit, then pick a reason and confirm | 1 click: **Pass**. The reason is optional and can be set afterwards in the Not a fit view |
| Intros with the 2 strong fits | 2 clicks, one per row | 1 click: **Request intros with all strong fits**. Or tick any rows and use the bulk bar |
| Book the calls | The operator picked from three fixed times unrelated to the buyer, and the booked call never appeared on the buyer's screens, only as an email | Each intro email carries the buyer's next three weekday times as one-tap links. The operator taps once and it is booked. The buyer sees **Call booked Tue, Sep 29, 10:00 am ET** on the response row and on Intro requests |
| Read answers | Hidden behind View response | The first answer is shown inline on every row; one click shows all |
| Dashboard | Counts only | Each live project shows **N to review** |

**Totals for the scenario, buyer side:** before, about 20 clicks and 290 keystrokes. After, 6 clicks and 0 keystrokes: Post a project, template, Post now, Pass on all weak fits, Pass, Request intros with all strong fits. Operators book with 1 tap each instead of 2.

## Findings and what changed

1. **Blank-page start (high).** Every brief started empty, and typing was the biggest cost. Fixed: six role templates (VP of Sales, CRO, RevOps, Demand Gen, Customer Success, Enablement) fill every field. Paste-a-JD prefill is still there as a second option.
2. **Two screens to post (high).** Posting required a separate invite and visibility screen, even though "open to all" was already the default. Fixed: Post now from the brief. The invite screen is labeled optional.
3. **Number fields for common ranges (medium).** Hours and budget were four empty number boxes. Fixed: preset chips (10-20, 20-30, 30-40, 40-60 hrs; $125-175 up to $250-350) fill both ends at once.
4. **Must-haves typed from memory (medium).** Fixed: the six skills most listed by operators in that category show as one-click chips, so the must-haves match how operators describe themselves, which also helps the fit score.
5. **Passing took a form (high).** A reason picker and confirm on every pass slowed sorting. Fixed: one-click Pass with Undo. The reason is optional afterwards.
6. **No bulk actions beyond weak fits (high).** Fixed: checkboxes on every row, a select-all bulk bar (Request intros, Pass), and Request intros with all strong fits.
7. **Scheduling was disconnected (high).** Fixed: intro requests carry the buyer's times as one-tap booking links; booked calls show on the response row and on Intro requests; the buyer gets a "Call booked" email.
8. **Answers were one click away from the sort decision (medium).** Fixed: the first answer is previewed on each row.
9. **Sort took a row of four buttons (low).** It is now a single "Sort" dropdown, which frees the toolbar for the actions that matter.

## Left for later

- **Buyer calendar.** Offered times are the next three weekdays at 10 am, 1 pm and 4 pm ET. A real version would read the buyer's calendar through Calendly or Google Calendar and put a meeting link on the invite.
- **Keyboard shortcuts for triage** (for example I for intro, P for pass, J/K to move) would speed up large lists further. They are left out because shortcuts are invisible to most buyers.
- **Editing a posted brief.** Posted briefs stay locked so every responder saw the same seat. Buyers who need a change would currently close and repost.
- **Operator side.** Screening answers are still required, which is the biggest typing cost for operators. Making them optional, or allowing a short voice or video answer, would raise response rates.

Tests: `tests/projects/usability.spec.ts` (U-01 to U-07) covers every fast path above, alongside the original 49 QA scenarios.
