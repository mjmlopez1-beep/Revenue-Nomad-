/* Answer posts for the Guides, in the Content Engine Playbook's answer-post template (Oct 10, 2026).
   Generated Oct 11, 2026 from the Content Bank (Nov 2026 to Jan 2027), the Site pages copy and the plan documents.
   - kind 'rewrite': a live blog post on the playbook's refresh list, rebuilt here. The three cost posts merge into one,
     and the sixteen sales city pages fold into the hiring guide (visibility plan #9). The live posts' text could not be
     read from this environment, so each rewrite is built from the Content Bank and plan data, not from the old copy.
   - kind 'new': a drafted Content Bank post (posts 1, 2, 4, 5 and 7), converted faithfully. Post 2 also takes the two
     marketing city pages and the part-time CMO hiring guide, since its URL already owns "how to hire a fractional CMO".
   Body text uses the function pages' tokens: a pending chip ([[gap:what|Owner]], written with no space before it, so
   a visitor never sees a stray " ." where it hides), [[link:route|label]], [[url:https://…|label]], **bold** and
   [[net]]. Money figures that have a canonical record use [[cost:key.field]] (RN.costs, js/data/costs.js; research.js
   resolves it, |lower and |bare as modifiers), so a guide quotes the same number as every other page.
   Blocks: p, ul, ol, quote, table (with an optional note, its source caption) and stats, a row of figure tiles
   ({ stats: [{ v, l, src, url }], note }) for a paragraph that would otherwise be mostly arithmetic (design pass, Oct 14).
   Voice: Revenue Nomad writes as a company ("we", "our team"); no founder first person. GoFractional is never named.
   replaces[] is the 301 list with Search Console figures from the May 2026 export (null = not in it).
   aliases maps a prototype guide a post replaced to that post, so its old link still lands. */
(function () {
  'use strict';
  const RN = window.RN;
  RN.data = RN.data || {};
  RN.data.posts = {
    "asOf": "2026-10-11",
    "aliases": {
      "fractional-vs-full-time-vp-of-sales": "interim-vs-fractional-vs-full-time-sales-leader",
      "transition-out-of-founder-led-sales": "how-to-stop-running-sales-as-a-founder",
      "fractional-cmo-vs-marketing-agency": "fractional-cmo-vs-agency"
    },
    "candidates": [
      {
        "url": "/post/fractional-cmo-vs-traditional-cmo-which-marketing-leadership-model-fits-you",
        "impressions": 7800,
        "to": "fractional-cmo-vs-agency"
      },
      {
        "url": "/post/fractional-sales-leadership-scale-without-full-time-cost",
        "impressions": 26241,
        "to": "fractional-vp-of-sales-cost"
      },
      {
        "url": "/post/fractional-marketing-team-for-tech-companies-hiring-cost-and-roi",
        "impressions": 2806,
        "to": "fractional-cmo-cost"
      },
      {
        "url": "/post/mastering-the-first-90-days-as-cro",
        "impressions": 2435,
        "to": "fractional-vp-of-sales-first-90-days"
      },
      {
        "url": "/post/your-complete-guide-to-fractional-marketing-directors-how-revenue-nomad-makes-hiring-easier",
        "impressions": 390,
        "to": "how-to-hire-a-fractional-cmo"
      },
      {
        "url": "/post/fractional-sales-leadership-roi-what-you-gain-vs-what-you-spend",
        "impressions": 204,
        "to": "fractional-vp-of-sales-cost"
      },
      {
        "url": "/post/how-revenue-nomad-helps-you-hire-fractional-vp-of-sales",
        "impressions": 174,
        "to": "how-to-hire-a-fractional-vp-of-sales"
      },
      {
        "url": "/post/how-revenue-nomad-helps-you-choose-the-best-fractional-marketing-director",
        "impressions": 53,
        "to": "how-to-hire-a-fractional-cmo"
      },
      {
        "url": "/post/define-sales-operations-roles-responsibilities",
        "impressions": 53244,
        "to": "revops-vs-sales-ops"
      },
      {
        "url": "/post/cmo-as-a-service",
        "impressions": 17196,
        "to": "how-to-hire-a-fractional-cmo"
      },
      {
        "url": "/post/what-is-a-fractional-revenue-leader",
        "impressions": 5365,
        "to": "fractional-cro-vs-full-time-cro"
      },
      {
        "url": "/post/fractional-chief-sales-officer-cso-job-description-responsibilities-skills-salary-and-hiring-guide",
        "impressions": 3473,
        "to": "fractional-cro-vs-full-time-cro"
      },
      {
        "url": "/post/how-to-annouce-an-interim-or-fractional-leader",
        "impressions": 2974,
        "to": "fractional-vp-of-sales-first-90-days"
      },
      {
        "url": "/post/fractional-sales-leadership-a-detailed-guide-for-businesses",
        "impressions": 2917,
        "to": "how-to-hire-a-fractional-vp-of-sales"
      },
      {
        "url": "/post/whats-included-in-fractional-cmo-services-deliverables-processes-and-the-outcomes-to-expect",
        "impressions": 1828,
        "to": "how-to-hire-a-fractional-cmo"
      },
      {
        "url": "/post/how-to-fix-the-top-3-revenue-leaks-in-b2b-saas",
        "impressions": 780,
        "to": "how-to-fix-sales-forecast-accuracy"
      }
    ],
    "list": [
      {
        "slug": "how-to-hire-a-fractional-vp-of-sales",
        "kind": "rewrite",
        "kindL": "How to hire",
        "template": "answer",
        "fn": "sales",
        "cat": "sales_leadership",
        "need": "sales_motion",
        "persona": "P1 and P2",
        "q": "How do you hire a fractional VP of Sales in 2026?",
        "metaTitle": "How to Hire a Fractional VP of Sales in 2026, Step by Step",
        "metaDescription": "How to hire a fractional VP of Sales in 2026. The steps from first call to contract, how to vet operators, the terms and what happens in week one.",
        "term": "hire a fractional vp of sales",
        "prompt": "How do I hire a fractional VP of Sales, step by step?",
        "publish": null,
        "updated": "2026-10-11",
        "base": "No draft exists. This is the visibility plan's #9 (How to Hire a Fractional VP of Sales in 2026, step by step, absorbs the city pages) and the playbook's rebuild of /post/how-to-select-a-fractional-vp-of-sales for P1 and P2",
        "words": 1718,
        "opsQ": "VP of Sales",
        "stat": {
          "v": "48 hours",
          "l": "Often, to a role profile and 2 to 3 vetted operators"
        },
        "related": [
          "fractional-vp-of-sales-cost",
          "fractional-vp-of-sales-first-90-days"
        ],
        "replaces": [
          {
            "url": "/post/how-to-select-a-fractional-vp-of-sales",
            "title": "How to Select a Fractional VP of Sales",
            "clicks": 12,
            "impressions": 16245,
            "position": 32.1,
            "action": "rebuild"
          },
          {
            "url": "/post/hiring-a-fractional-vp-of-sales-in-charlotte-everything-you-need-to-know-in-2026",
            "title": "Hiring a Fractional VP of Sales in Charlotte",
            "clicks": 3,
            "impressions": 2449,
            "position": 7.6,
            "action": "city"
          },
          {
            "url": "/post/guide-to-hire-a-fractional-vp-of-sales-in-los-angeles-in-2026",
            "title": "Guide to Hire a Fractional VP of Sales in Los Angeles in 2026",
            "clicks": 1,
            "impressions": 1448,
            "position": 6.9,
            "action": "city"
          },
          {
            "url": "/post/hiring-a-fractional-head-of-sales-in-chicago-everything-you-need-to-know-in-2026",
            "title": "Hiring a Fractional Head of Sales in Chicago",
            "clicks": 3,
            "impressions": 1434,
            "position": 9.1,
            "action": "city"
          },
          {
            "url": "/post/hiring-a-fractional-head-of-sales-in-nashville-everything-you-need-to-know-in-2026",
            "title": "Hiring a Fractional Head of Sales in Nashville",
            "clicks": 2,
            "impressions": 1174,
            "position": 10,
            "action": "city"
          },
          {
            "url": "/post/hiring-a-fractional-head-of-sales-in-baltimore-everything-you-need-to-know-in-2026",
            "title": "Hiring a Fractional Head of Sales in Baltimore",
            "clicks": 0,
            "impressions": 733,
            "position": 10.4,
            "action": "city"
          },
          {
            "url": "/post/hiring-a-fractional-head-of-sales-in-austin-everything-you-need-to-know-in-2026",
            "title": "Hiring a Fractional Head of Sales in Austin",
            "clicks": 0,
            "impressions": 573,
            "position": 9.1,
            "action": "city"
          },
          {
            "url": "/post/hiring-a-fractional-head-of-sales-in-san-francisco-everything-you-need-to-know-in-2025",
            "title": "Hiring a Fractional Head of Sales in San Francisco",
            "clicks": 3,
            "impressions": 498,
            "position": 8.7,
            "action": "city"
          },
          {
            "url": "/post/hiring-a-fractional-head-of-sales-in-seattle-everything-you-need-to-know-in-2026",
            "title": "Hiring a Fractional Head of Sales in Seattle",
            "clicks": 1,
            "impressions": 224,
            "position": 9.1,
            "action": "city"
          },
          {
            "url": "/post/hiring-a-fractional-head-of-sales-in-houston",
            "title": "Hiring a Fractional Head of Sales in Houston? (You Need to Know this)",
            "clicks": 0,
            "impressions": 184,
            "position": 11.3,
            "action": "city"
          },
          {
            "url": "/post/hiring-a-fractional-head-of-sales-in-new-york-everything-you-need-to-know-in-2025",
            "title": "Hiring a Fractional Head of Sales in New York",
            "clicks": 0,
            "impressions": 178,
            "position": 7.9,
            "action": "city"
          },
          {
            "url": "/post/hiring-a-fractional-head-of-sales-in-miami-everything-you-need-to-know-in-2026",
            "title": "Hiring a Fractional Head of Sales in Miami",
            "clicks": 1,
            "impressions": 30,
            "position": 7.3,
            "action": "city"
          },
          {
            "url": null,
            "title": "Hiring a Fractional Head of Sales in Dallas: Everything You Need to Know in 2026",
            "clicks": null,
            "impressions": null,
            "position": null,
            "action": "city"
          },
          {
            "url": null,
            "title": "Hiring a Fractional Head of Sales in Kansas City: Everything You Need to Know in 2026",
            "clicks": null,
            "impressions": null,
            "position": null,
            "action": "city"
          },
          {
            "url": null,
            "title": "Hiring a Fractional Head of Sales in Portland: Everything You Need to Know in 2026",
            "clicks": null,
            "impressions": null,
            "position": null,
            "action": "city"
          },
          {
            "url": null,
            "title": "Everything You Need to Know in 2026 to Hire a Fractional VP of Sales in Atlanta",
            "clicks": null,
            "impressions": null,
            "position": null,
            "action": "city"
          },
          {
            "url": null,
            "title": "Hiring a Fractional VP of Sales in Denver: Everything You Need to Know in 2025",
            "clicks": null,
            "impressions": null,
            "position": null,
            "action": "city"
          }
        ],
        "answer": "Name the seat, then fill in Talk to us. We send a role profile and 2 to 3 vetted operators, often within 48 hours. Contracts start with a 3 to 4 month initial term.",
        "keys": [
          {
            "k": "Time to a role profile and 2 to 3 vetted operators",
            "v": "Often within 48 hours",
            "src": "Revenue Nomad process, 2026",
            "url": ""
          },
          {
            "k": "Fractional director or VP of Sales, team under 5 to 8 reps",
            "v": "[[cost:vp-sales.hourly]], [[cost:vp-sales.hours]]",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Operators in the network",
            "v": "[[net]], all dedicated fractional, with 50+ data points tracked on each",
            "src": "Revenue Nomad network",
            "url": ""
          },
          {
            "k": "Initial term on every contract",
            "v": "3 to 4 months, then month-to-month with 30 days notice",
            "src": "Revenue Nomad engagement terms",
            "url": ""
          },
          {
            "k": "Cost of replacing a sales leader",
            "v": "[[cost:vp-sales.replace]], with 3+ months of ramp",
            "src": "Skaled",
            "url": "https://skaled.com/services/fractional-vp-of-sales/"
          }
        ],
        "sections": [
          {
            "id": "steps",
            "h": "What are the steps to hire a fractional VP of Sales?",
            "blocks": [
              {
                "p": "Seven steps take you from the decision to the operator's first week. With us, profiles often arrive within 48 hours and you meet candidates in week 1 to 2."
              },
              {
                "ol": [
                  "**Name the problem and the seat.** Write down what is broken, who you think fixes it and how many hours a month it needs. The next section helps you choose.",
                  "**Fill in Talk to us.** Four short questions. What you need help with, how big the business is today, when you need someone to start and where to reply. Only name and email are required.",
                  "**Discovery call.** We turn it into a written role profile and set reporting lines before we source.",
                  "**Shortlist.** A draft scope of work and 2 to 3 vetted operator profiles, often within 48 hours.",
                  "**Meet the finalists.** Week 1 to 2. You talk to each one before anything is signed.",
                  "**Test them if you want.** Some clients add a short working assignment, such as reviewing a recorded call and answering 3 questions.",
                  "**Sign, then start.** A contract, a monthly retainer billed upfront for a set block of hours and a 3 to 4 month initial term. The first week is covered below."
                ]
              },
              {
                "p": "The steps are the same for a founder-CEO at $5M to $20M who still closes deals and for a CEO at $20M to $75M whose growth has stalled. What changes is the seat. The [[link:hire-fractional-sales-vp|sales leadership page]] shows the same process next to our 2026 rates."
              }
            ]
          },
          {
            "id": "which-seat",
            "h": "Do you need a director, a VP of Sales or a CRO?",
            "blocks": [
              {
                "p": "It depends on team size and how far the problem reaches. For a 5-rep team, a tactical director often beats a strategic VP, and a CRO fits when sales, marketing, comp and the CRM all feed the miss."
              },
              {
                "table": {
                  "head": [
                    "Seat",
                    "When it fits",
                    "Hours a month in our 2026 engagements"
                  ],
                  "rows": [
                    [
                      "Director of sales",
                      "Under 5 to 8 reps, no repeatable process, reps who need weekly coaching",
                      "20 to 40"
                    ],
                    [
                      "VP of Sales",
                      "A director runs the team, but nobody designs the system above them",
                      "20 to 40, and 40 at a ~$9M agency"
                    ],
                    [
                      "CRO",
                      "People, process, comp, the CRM and goals all need work at once",
                      "50 at a ~$55M company, after a 45-day assessment"
                    ]
                  ]
                }
              },
              {
                "p": "Hours have to fit the job. One client bought 20 hours a month for $3,000 and missed target every month. Start from the [[link:blueprint.vp-sales|VP of Sales Blueprint]], then read [[link:guide.how-to-scope-a-fractional-sales-engagement|how to scope a fractional sales engagement]]."
              }
            ]
          },
          {
            "id": "how-to-vet",
            "h": "How do you vet a fractional VP of Sales?",
            "blocks": [
              {
                "p": "Score each finalist on CORE, check they have done this job at your stage and team size, then test them on your own pipeline before you sign. We run the first two checks before you see a profile."
              },
              {
                "ul": [
                  "**Communication.** They tell you what is happening before you ask.",
                  "**Ownership.** They treat the number as theirs.",
                  "**Results Focus.** Measured by revenue and conversion.",
                  "**Expertise.** Deep experience at your stage and in your kind of sale."
                ]
              },
              {
                "p": "We place only dedicated fractional operators. Anyone holding a full-time job is excluded. We also match seniority to the team. A great CRO from a $500M company will likely struggle at a $30M one, so we track 50+ data points on each of our [[net]] operators. Each [[link:browse.sales_leadership|sales leadership profile]] shows the seat, fit tags, revenue bands and availability. Read [[link:levels|how CORE feeds the Reputation Index]]."
              },
              {
                "p": "Then run your own checks in the meetings."
              },
              {
                "ol": [
                  "Ask whether they will manage reps day to day or only advise.",
                  "Ask what number they would report to you in week 4. Good answers come in numbers.",
                  "Ask for a 30/60/90-day plan in writing before the retainer starts.",
                  "If two finalists look close, add the working assignment."
                ]
              },
              {
                "p": "[[link:guide.evaluate-fractional-operator-track-record|How to evaluate a fractional operator's track record]] goes deeper on proof."
              }
            ]
          },
          {
            "id": "your-city",
            "h": "Does the operator need to live in your city?",
            "blocks": [
              {
                "p": "Only if the job needs someone in the room every week. Fit at your stage and in your kind of sale comes first."
              },
              {
                "p": "When founders and CEOs told us what mattered most, they named price that fits the team, industry familiarity, directness and culture fit, meeting the person before signing, and a plan before a retainer. Where the operator lives was not on the list."
              },
              {
                "p": "This guide replaces the separate fractional VP of Sales and head of sales guides we used to run for 16 metros. Atlanta, Austin, Baltimore, Charlotte, Chicago, Dallas, Denver, Houston, Kansas City, Los Angeles, Miami, Nashville, New York, Portland, San Francisco and Seattle. The steps and the terms are the same in each."
              },
              {
                "p": "Location only matters through the cadence. The work is weekly and hands-on, with pipeline reviews, sitting in on calls, coaching reps and role-play. Agree in the scope which of those happen in person and how often.[[gap:how many 2026 sales engagements ran remote, hybrid or on-site|Matt]][[gap:operator count by metro for these 16 cities|Matt]]"
              }
            ]
          },
          {
            "id": "contract-and-first-week",
            "h": "What should the contract and the first week look like?",
            "blocks": [
              {
                "p": "A signed contract for a set block of hours, then a first week spent on access and cadence. These are the terms at Revenue Nomad."
              },
              {
                "table": {
                  "head": [
                    "Term",
                    "How it works"
                  ],
                  "rows": [
                    [
                      "Billing",
                      "Monthly retainer billed upfront for a set number of hours"
                    ],
                    [
                      "Initial term",
                      "3 to 4 months, then month-to-month with 30 days notice"
                    ],
                    [
                      "Overage",
                      "Hours tracked and flagged before an overage happens"
                    ],
                    [
                      "Fit",
                      "If the fit is wrong, you can swap the operator"
                    ],
                    [
                      "Fees",
                      "No platform fee. You pay the operator's rate and nothing more"
                    ],
                    [
                      "Full-time conversion",
                      "20% of annual salary"
                    ],
                    [
                      "Larger seats",
                      "Can start with a fixed-fee assessment, for example 45 days for $27,500 before a CRO retainer"
                    ]
                  ]
                }
              },
              {
                "p": "The initial term is a floor. At Ferry, a hospitality tip management platform, our team signed for 4 months and stayed about 18."
              },
              {
                "p": "Three jobs are yours in the first week."
              },
              {
                "ol": [
                  "Tell the team who the operator reports to and what they decide.",
                  "Give access. Call recordings, the CRM, your 10 biggest won deals and your honest view of each rep.",
                  "Book the weekly meeting, and route the team's sales questions to the operator from then on."
                ]
              },
              {
                "p": "By day 30 you should hold a rep-by-rep view and a 30/60/90-day plan built on it. [[link:guide.fractional-vp-of-sales-first-90-days|What a fractional VP of Sales should deliver in 90 days]] covers the rest."
              }
            ]
          },
          {
            "id": "real-company",
            "h": "What this looked like at a real company",
            "blocks": [
              {
                "p": "**The company.** A founder-led water damage restoration marketing agency.[[gap:revenue band for the restoration marketing agency|Matt]]"
              },
              {
                "p": "**Before.** 278 appointments booked year to date and 134 showed, about half. In one month 19 were booked, 13 showed and none closed. The founder had carried every one of those calls while running the company, and wanted out of running revenue."
              },
              {
                "p": "**How they hired.** Two finalists reached the end. Each reviewed a recorded BDR call and a Loom walkthrough of the business, then answered 3 written questions. One was a strategic builder with broad experience. The other was more tactical and had worked with agencies. The founder picked the tactical one, as a fractional sales director."
              },
              {
                "p": "**The first month.** 20 hours a month at $4,000, spent on SDR pay, talk tracks, role-play, the booking system and channel choices. [[link:guide.sales-meetings-not-converting|Why booked sales meetings are not turning into deals]] has the full plan."
              },
              {
                "p": "**After.** It started in September 2026, so there are no results yet.[[gap:90-day results at the restoration marketing agency, with the client's OK|Operator]]"
              },
              {
                "quote": "[[gap:quote from the operator on what they looked for in the working assignment, with permission|Operator]]"
              }
            ]
          },
          {
            "id": "not-right",
            "h": "When this is not the right move",
            "blocks": [
              {
                "p": "Do not hire a fractional VP of Sales in five cases."
              },
              {
                "ul": [
                  "**Your calendar is empty.** If nobody is booking meetings, the gap is demand. Start with [[link:fractional-marketing-leadership|fractional marketing leadership]].",
                  "**The process works and you are short a seller.** Hire a rep. A fractional VP builds and manages the motion and is not an extra closer.",
                  "**No repeatable sale yet.** If you still close every deal and have not written down why clients buy, document that before you bring in a leader.",
                  "**You want someone on call all week.** Expecting full-time availability at a fractional rate is the most common mismatch we see. Hire full time.",
                  "**The playbook is proven and funded.** A full-time leader will own it longer. Hire carefully, because replacing a sales leader can cost up to 1.5x salary."
                ]
              }
            ]
          }
        ],
        "faq": [
          {
            "q": "How long does it take to hire a fractional VP of Sales?",
            "a": "A role profile and 2 to 3 vetted operators often arrive within 48 hours, and you meet candidates in week 1 to 2. The start date depends on your interviews and whether you add a working assignment."
          },
          {
            "q": "What does a fractional VP of Sales cost?",
            "a": "Across our 2026 engagements, a director or VP for a team under 5 to 8 reps ran $200 to $250 an hour for 20 to 40 hours a month. [[link:guide.fractional-vp-of-sales-cost|What a fractional VP of Sales costs]] covers every seat."
          },
          {
            "q": "Is there a fee besides the operator's rate?",
            "a": "No platform fee. You pay the operator's rate and nothing more. If you later hire the operator full time, the conversion fee is 20% of annual salary."
          },
          {
            "q": "What if the operator is the wrong fit?",
            "a": "You can swap the operator. Once the 3 to 4 month initial term ends, the contract runs month-to-month with 30 days notice."
          },
          {
            "q": "Will a fractional VP clash with my current sales leader?",
            "a": "We set reporting lines before we source. At a ~$9M physical therapy marketing agency, the fractional VP sits above the existing Director of Sales as strategist and process builder."
          }
        ],
        "talk": "If you still carry the number and want one person to own it, [[link:talk.sales_motion|tell us about your sales team]]. Four short questions, then a role profile and 2 to 3 vetted operators, often within 48 hours, that you meet before you sign anything.",
        "gaps": [
          {
            "what": "reviewing operator name and sign-off (shown in the byline, not in the text)",
            "owner": "Matt"
          },
          {
            "what": "final Talk to us URL, ships Oct 30 (the post links talk.sales_motion in the prototype)",
            "owner": "Rapid Neuron"
          },
          {
            "what": "revenue band for the restoration marketing agency",
            "owner": "Matt"
          },
          {
            "what": "90-day results at the restoration marketing agency, with the client's OK",
            "owner": "Operator"
          },
          {
            "what": "quote from the operator on what they looked for in the working assignment, with permission",
            "owner": "Operator"
          },
          {
            "what": "how many 2026 sales engagements ran remote, hybrid or on-site",
            "owner": "Matt"
          },
          {
            "what": "operator count by metro for the 16 cities the old city pages covered",
            "owner": "Matt"
          },
          {
            "what": "301 redirects into this post from /post/how-to-select-a-fractional-vp-of-sales and the 11 city posts with live URLs (Charlotte, Los Angeles, Chicago, Nashville, Baltimore, Austin, San Francisco, Seattle, Houston, New York, Miami), plus the Dallas, Kansas City, Portland, Atlanta and Denver posts once their URLs are found",
            "owner": "Rapid Neuron"
          }
        ],
        "flags": [
          "Decision, not a calculation. The which-seat section repeats the unattributed lesson that one client bought 20 hours a month for $3,000 and missed target every month, as G1 and G4 already do. The Content Bank overview still lists this lesson as a pending decision for posts 9, 10 and 12, so Matt should confirm it here too.",
          "Decision. The city section answers 'Only if the job needs someone in the room every week' and advises agreeing in-person work in the scope. No source says how often operators work on-site or remotely, so Matt should confirm the stance and fill the two gaps under it (remote, hybrid or on-site share of 2026 engagements, and operator counts by metro).",
          "Data conflict, needs Matt. Every Content Bank piece gives the restoration agency as 278 booked and 134 showed, 'a 52% show rate', but 134 of 278 is 48%. 52% is the no-show share. The real-company section now says '134 showed, about half', which is true either way, matching the sales-meetings post. Matt should confirm the counts or the rate before 52% runs anywhere."
        ]
      },
      {
        "slug": "fractional-vp-of-sales-cost",
        "kind": "rewrite",
        "kindL": "Cost",
        "template": "cost",
        "fn": "sales",
        "cat": "sales_leadership",
        "need": "sales_motion",
        "persona": "P1 and P2",
        "q": "What does a fractional VP of Sales cost in 2026?",
        "metaTitle": "Fractional VP of Sales Cost and Hourly Rate in 2026",
        "metaDescription": "Fractional VP of Sales cost from our 2026 engagements. $200 to $250 an hour, $4,000 to $10,000 a month, the terms and the full-time comparison.",
        "term": "fractional vp of sales cost",
        "prompt": "How much does a fractional VP of Sales cost per month in 2026?",
        "publish": null,
        "updated": "2026-10-11",
        "base": "Content Bank Post 6 (bank-dec.md), rewritten for 2026: keep every 2026 engagement figure, turn each 2027 survey figure into a GAP",
        "words": 1792,
        "opsQ": "VP of Sales",
        "headline": {
          "rate": "[[cost:vp-sales.hourly|bare]]",
          "rateL": "An hour",
          "month": "[[cost:vp-sales.monthly|bare]]",
          "monthL": "A month, 20 to 40 hrs",
          "basis": "2026 engagements, teams under 5 to 8 reps"
        },
        "stat": {
          "v": "[[cost:vp-sales.hourly]]",
          "l": "For a director or VP, teams under 5 to 8 reps"
        },
        "related": [
          "interim-vs-fractional-vs-full-time-sales-leader",
          "how-to-hire-a-fractional-vp-of-sales"
        ],
        "replaces": [
          {
            "url": "/post/fractional-vp-of-sales-hourly-rate",
            "title": "Fractional VP of Sales Hourly Rate",
            "clicks": 76,
            "impressions": 19347,
            "position": 10.8,
            "action": "merge"
          },
          {
            "url": "/post/your-complete-guide-to-the-cost-of-a-fractional-vp-of-sales-in-2026",
            "title": "Your Complete Guide to the Cost of a Fractional VP of Sales in 2026",
            "clicks": null,
            "impressions": null,
            "position": null,
            "action": "merge"
          },
          {
            "url": "/post/fractional-vice-president-of-sales-and-marketing-cost-and-expected-roi",
            "title": "Fractional Vice President of Sales and Marketing: When to Hire, Cost, and Expected ROI",
            "clicks": 4,
            "impressions": 2567,
            "position": 9.1,
            "action": "merge"
          }
        ],
        "answer": "[[cost:vp-sales.answer]]",
        "keys": [
          {
            "k": "Fractional director or VP of Sales, team under 5 to 8 reps",
            "v": "[[cost:vp-sales.hourly]], [[cost:vp-sales.hours]], [[cost:vp-sales.monthly]]",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Embedded fractional CRO, ~$55M company",
            "v": "[[cost:cro.monthly]], [[cost:cro.hours]]",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Median fractional VP of Sales monthly retainer, 2027",
            "v": "[[gap:2027 survey figure, median VP of Sales retainer|Survey]]",
            "src": "State of Fractional GTM 2027, Revenue Nomad network",
            "url": ""
          },
          {
            "k": "Average total full-time VP of Sales compensation",
            "v": "[[cost:vp-sales.fullTime]], average tenure [[cost:vp-sales.tenure|lower]]",
            "src": "Glassdoor 2026 via Stealth Agents, secondary source",
            "url": "https://stealthagents.com/research/cost-of-hiring-a-vp-of-sales-2026"
          },
          {
            "k": "Fractional VP of Sales arrangements commonly cited",
            "v": "$8k - $20k/month",
            "src": "Stealth Agents, secondary source",
            "url": "https://stealthagents.com/research/cost-of-hiring-a-vp-of-sales-2026"
          }
        ],
        "sections": [
          {
            "id": "rates-by-seat",
            "h": "What does each sales seat cost per hour and per month?",
            "blocks": [
              {
                "p": "Price follows scope, team size and hours. Here is what each sales seat ran in our engagements."
              },
              {
                "table": {
                  "head": [
                    "Seat",
                    "Hourly rate",
                    "Hours a month",
                    "Monthly cost"
                  ],
                  "rows": [
                    [
                      "Sales coach, ~$10M company",
                      "[[cost:sales-coach.hourly|bare]]",
                      "[[cost:sales-coach.hours|bare]]",
                      "[[cost:sales-coach.monthly|bare]]"
                    ],
                    [
                      "Sales manager",
                      "[[gap:sales manager rate and hours, from a 2026 engagement or the 2027 survey|Matt]]",
                      "",
                      ""
                    ],
                    [
                      "Director or VP of Sales, team under 5 to 8 reps",
                      "[[cost:vp-sales.hourly|bare]]",
                      "[[cost:vp-sales.hours|bare]]",
                      "[[cost:vp-sales.monthly|bare]]"
                    ],
                    [
                      "VP of Sales, larger teams",
                      "[[gap:2027 survey figure, VP of Sales rate, hours and monthly cost for larger teams|Survey]]",
                      "",
                      ""
                    ],
                    [
                      "Embedded fractional CRO, ~$55M media and marketing services company",
                      "[[cost:cro.hourly|bare]]",
                      "[[cost:cro.hours|bare]]",
                      "[[cost:cro.monthly|bare]]"
                    ]
                  ]
                },
                "note": "[[cost:vp-sales.basis]]. What clients paid or were quoted, GTM leadership seats only; the [[link:fractional-cost|cost hub]] adds RevOps and marketing. The CRO rate is its [[cost:cro.monthly|bare]] retainer divided by 50 hours, after a 45-day assessment at [[cost:sales-assessment.fixed|bare]]."
              },
              {
                "p": "Medians by seat from the [[link:report|State of Fractional GTM]] survey land in the [[link:rates.sales_leadership|Rate Index for sales leadership]] once the survey closes.[[gap:2027 Rate Index medians by seat, with sample size and survey dates|Survey]]"
              }
            ]
          },
          {
            "id": "price-drivers",
            "h": "What moves the price up or down?",
            "blocks": [
              {
                "p": "Four things. Seniority against team size, the scope of the job, the hours it needs and how the company is funded."
              },
              {
                "ul": [
                  "**Seniority against team size.** For a small team, a tactical director often beats a strategic VP, and costs less. A director for a 5-rep team ran $4,000 a month. More in [[link:guide.how-to-hire-a-fractional-vp-of-sales|how to hire a fractional VP of Sales]].",
                  "**Scope.** CRM admin, revenue leadership and pipeline work are three different jobs. Asking one person to cover all three raises the rate or breaks the engagement.",
                  "**Hours.** Price follows the hour block. 20 hours and 50 hours a month are different jobs.",
                  "**Funding.** Venture-backed companies accepted about $300 an hour at around $5M ARR. Bootstrapped peers pushed back on that number, and operators who over-anchored lost deals without hearing why."
                ]
              },
              {
                "p": "Price has to fit the team, and cheap and thin is the most expensive option. More in [[link:guide.how-to-scope-a-fractional-sales-engagement|how to scope a fractional sales engagement]]."
              },
              {
                "stats": [
                  {
                    "v": "$6k - $12k",
                    "l": "A month: other quotes one founder-led client had, which felt like overkill for their team"
                  },
                  {
                    "v": "$4k/month",
                    "l": "Our 20-hour retainer, in the founder's words \"a no-brainer\""
                  },
                  {
                    "v": "$3k/month",
                    "l": "A 20-hour placement that did not hit targets in any month"
                  }
                ],
                "note": "From 2026 Revenue Nomad engagements."
              }
            ]
          },
          {
            "id": "engagement-models",
            "h": "How do you pay for a fractional VP of Sales?",
            "blocks": [
              {
                "p": "You pay a monthly retainer upfront for a set block of hours. Every engagement runs on a signed contract."
              },
              {
                "table": {
                  "head": [
                    "Model",
                    "How it works",
                    "When it fits",
                    "Example from 2026"
                  ],
                  "rows": [
                    [
                      "Monthly retainer",
                      "Set hours a month, billed upfront",
                      "You know the seat and the scope",
                      "Director of sales, 20 hours, $4k a month"
                    ],
                    [
                      "Fixed project",
                      "Defined deliverable, fixed fee",
                      "One problem with a clear end",
                      "30-day RevOps project, [[cost:revops-project.fixed|lower]]"
                    ],
                    [
                      "Assessment then retainer",
                      "Fixed-fee diagnosis, then the operator executes",
                      "You need a diagnosis before you commit",
                      "45-day assessment at [[cost:sales-assessment.fixed|bare]], then a CRO at [[cost:cro.monthly]]"
                    ]
                  ]
                }
              },
              {
                "p": "These are the usual terms across our network of [[net]] dedicated fractional operators."
              },
              {
                "table": {
                  "head": [
                    "Term",
                    "How it works"
                  ],
                  "rows": [
                    [
                      "Initial term",
                      "3 to 4 months, then month-to-month with 30 days notice"
                    ],
                    [
                      "Hours",
                      "Tracked and flagged before an overage happens. Small overages, for example up to 15%, may be agreed in the contract without extra consent"
                    ],
                    [
                      "Fit",
                      "You can swap the operator if the fit is wrong"
                    ],
                    [
                      "Fees",
                      "None. You pay the operator's rate and nothing more"
                    ],
                    [
                      "Full-time hire",
                      "A conversion fee of 20% of annual salary"
                    ]
                  ]
                }
              },
              {
                "p": "\"Fractional rate, full-time availability\" is the most common expectation mismatch we see. Fix it upfront with a set hour block and a weekly cadence."
              }
            ]
          },
          {
            "id": "full-time-comparison",
            "h": "How does the cost compare with a full-time VP of Sales salary?",
            "blocks": [
              {
                "stats": [
                  {
                    "v": "[[cost:vp-sales.pct]]",
                    "l": "Of full-time pay: a fractional VP at [[cost:vp-sales.monthly]] against [[cost:vp-sales.fullTimeMonthly]] for a full-time VP",
                    "src": "Our 2026 engagements; full-time pay from Glassdoor 2026 via Stealth Agents",
                    "url": "https://stealthagents.com/research/cost-of-hiring-a-vp-of-sales-2026"
                  },
                  {
                    "v": "[[cost:vp-sales.replace]]",
                    "l": "To replace a sales leader who leaves, plus 3+ months of ramp. Average full-time tenure is [[cost:vp-sales.tenure|lower]]",
                    "src": "Skaled; tenure from Glassdoor 2026 via Stealth Agents",
                    "url": "https://skaled.com/services/fractional-vp-of-sales/"
                  }
                ]
              },
              {
                "table": {
                  "head": [
                    "Option",
                    "A month",
                    "A year",
                    "What else to count"
                  ],
                  "rows": [
                    [
                      "Full-time VP of Sales",
                      "[[cost:vp-sales.fullTimeMonthly]]",
                      "[[cost:vp-sales.fullTime|bare]]",
                      "Average tenure [[cost:vp-sales.tenure|lower]]"
                    ],
                    [
                      "Fractional VP of Sales, 20 to 40 hours",
                      "[[cost:vp-sales.monthly]]",
                      "[[cost:vp-sales.yearly]]",
                      "A 3 to 4 month initial term, then 30 days notice"
                    ],
                    [
                      "Embedded fractional CRO, 50 hours",
                      "[[cost:cro.monthly]]",
                      "[[cost:cro.firstYear]] in year one, with the 45-day assessment",
                      "The client's own full-time CRO benchmark was up to about $800K all in"
                    ]
                  ]
                },
                "note": "[[cost:vp-sales.basis]]. Full-time pay and tenure: [[url:https://stealthagents.com/research/cost-of-hiring-a-vp-of-sales-2026|Stealth Agents citing Glassdoor 2026]], a secondary source; it also cites $8k - $20k/month for fractional VP of Sales arrangements, a range that fits larger teams and more hours. Replacement cost: [[url:https://skaled.com/services/fractional-vp-of-sales/|Skaled]]."
              },
              {
                "p": "Full-time wins once the team is large, the process works and the job is running it every day, and converting your operator costs 20% of annual salary instead of a new search.[[gap:outside search fee for hiring a full-time VP of Sales, with a source|Matt]] More in [[link:guide.interim-vs-fractional-vs-full-time-sales-leader|interim, fractional or full-time sales leader]].[[gap:2027 survey figure on when clients convert to full time|Survey]]"
              }
            ]
          },
          {
            "id": "sales-and-marketing",
            "h": "Can one fractional leader cover sales and marketing?",
            "blocks": [
              {
                "p": "Sometimes. It works when one person can truly cover the combined scope, and it breaks when one retainer hides several jobs."
              },
              {
                "p": "Our 2026 marketing searches treated demand gen and brand as different jobs, and we score marketing leaders on sales enablement as its own factor. Some can support sales. Tell us whether you need brand strategy, enablement or both, and we will tell you when one person cannot cover it."
              },
              {
                "p": "For scale, a fractional CMO search for a PE-backed platform was quoted [[cost:cmo.hourly]], the same band as our small-team sales leaders. More on [[link:fractional-marketing-leadership|fractional marketing leadership]]."
              },
              {
                "p": "It can work. At Ferry, a hospitality tip management platform, our team took the fractional GTM strategy seat in February 2025 on a 4-month term and stayed about 18 months[[gap:Ferry revenue band|Matt]]. We built Ferry's first digital demand generation program, closed the deals that doubled its client base and hired its first AE.[[gap:hours, monthly cost and ROI of the Ferry seat, cleared to publish|Matt]]"
              },
              {
                "stats": [
                  {
                    "v": "20",
                    "l": "First inbound leads, from Ferry's first digital demand generation program"
                  },
                  {
                    "v": "2 deals",
                    "l": "Closed by our team, doubling the client base"
                  },
                  {
                    "v": "60 days",
                    "l": "For the first AE our team hired to close a deal"
                  }
                ],
                "note": "Revenue Nomad engagement at Ferry, from February 2025."
              },
              {
                "p": "If the miss runs across sales, marketing, comp and the CRM at once, that is a CRO job."
              }
            ]
          },
          {
            "id": "real-company",
            "h": "What this looked like at a real company",
            "blocks": [
              {
                "p": "**The company.** A ~$9M physical therapy marketing agency, run by its founder-CEO, who wants to grow it to $15M."
              },
              {
                "p": "**Before.** Close rate had fallen from 30 to 40% into the teens. The sales cycle ran 6 to 8 weeks. The agency closed 2 to 4 new clients a month against a goal of 10 or more."
              },
              {
                "p": "**What the operator does.** The agency kept its Director of Sales and added a fractional VP of Sales above the role as strategist and process builder. Scope is 40 hours a month for the first 3 months, $10,000 a month, about $250 an hour."
              },
              {
                "quote": "[[gap:quote from the operator on sitting above an existing Director of Sales, with permission|Operator]]"
              },
              {
                "p": "**After.** It started in September 2026, and there are no results yet. We are tracking close rate, sales cycle length and new clients closed per month against the goal of 10.[[gap:90-day result at the physical therapy marketing agency, with the client's OK|Operator]]"
              },
              {
                "p": "**The low end of the range.** A founder-led healthcare services company with 8 commission-only reps, about half not performing, took a 90-day build at 20 hours a month for $4,000[[gap:revenue band for the healthcare services company|Matt]]. The scope covers rep assessment, process, scripts, training, a CRM audit and personnel calls. It also started in September 2026."
              },
              {
                "p": "More client stories are on the [[link:hire-fractional-sales-vp|fractional sales leadership page]]."
              }
            ]
          },
          {
            "id": "not-right",
            "h": "When this is not the right move",
            "blocks": [
              {
                "p": "A fractional VP of Sales is the wrong hire in five cases."
              },
              {
                "ul": [
                  "**You need one more seller.** If the process works and you are short a closer, hire a rep. That is a different hire at a different price.",
                  "**You have fewer than 3 reps and still close most deals.** Start with a sales coach or a player-coach. A sales coach at a ~$10M company ran about $6,000 a month in our 2026 engagements.",
                  "**You cannot fund the hours.** If the job needs 40 hours and the budget covers 20, wait or narrow the scope.",
                  "**You want someone on call all week.** If you need a leader in the building 50+ hours a week for years, hire full time.",
                  "**The miss runs across departments.** If marketing, comp and the CRM all feed it, a VP of Sales cannot fix it alone. Read [[link:guide.fractional-cro-vs-full-time-cro|fractional CRO or full-time CRO]]."
                ]
              }
            ]
          }
        ],
        "faq": [
          {
            "q": "What is the hourly rate for a fractional VP of Sales?",
            "a": "About $200 to $250 an hour for teams under 5 to 8 reps, across our 2026 engagements. Venture-backed clients at around $5M ARR accepted about $300."
          },
          {
            "q": "Is a fractional VP of Sales paid a salary?",
            "a": "No. You pay the operator's rate for a set block of hours, billed monthly. That came to $4,000 to $10,000 a month in our 2026 engagements. A full-time VP averages about $334K a year in total comp, per Glassdoor data cited by Stealth Agents."
          },
          {
            "q": "How many hours a month does a fractional VP of Sales need?",
            "a": "Usually 20 to 40 for teams under 5 to 8 reps. Below what the job needs, results suffer."
          },
          {
            "q": "Is there a minimum term?",
            "a": "Yes. Every engagement has a contract with a 3 to 4 month initial term, then month-to-month with 30 days notice."
          },
          {
            "q": "Does Revenue Nomad add a fee to the operator's rate?",
            "a": "No. You pay the operator's rate and nothing more. Hiring the operator full time later carries a conversion fee of 20% of annual salary."
          }
        ],
        "talk": "Answer four short questions, with only your name and email required. We reply with a role profile and 2 to 3 vetted operators priced for your team size, often within 48 hours, and you meet them before you sign. [[link:talk.sales_motion|Talk to us about your sales team]]",
        "gaps": [
          {
            "what": "reviewing operator name and sign-off",
            "owner": "Matt"
          },
          {
            "what": "final Talk to us URL on the live site (the prototype links talk.sales_motion)",
            "owner": "Rapid Neuron"
          },
          {
            "what": "301 redirects into this post from /post/fractional-vp-of-sales-hourly-rate, /post/your-complete-guide-to-the-cost-of-a-fractional-vp-of-sales-in-2026 and /post/fractional-vice-president-of-sales-and-marketing-cost-and-expected-roi",
            "owner": "Rapid Neuron"
          }
        ],
        "flags": [
          "Calculated, not quoted. About $464 an hour for the embedded CRO is the $23,200 retainer divided by 50 hours. Kept from the post 6 draft seat table. Needs Matt's OK.",
          "Calculated, not quoted. The full-time comparison reads the canonical cost record (js/data/costs.js): $48k - $120k a year is 12 x the $4k - $10k monthly range, 14% to 36% is that range against $27.8k a month ($334K / 12), and $305.9k is the CRO's first year, the $27.5k assessment plus 12 months at $23.2k. Needs Matt's OK.",
          "Removed in the Oct 14 design pass: the cost-of-a-miss arithmetic (about $529K in pay for a $334K hire who leaves at 19 months, plus roughly $501K to replace), which applied Skaled's 1.5x-of-salary multiple to a total-comp figure. The section now shows the share of full-time pay and Skaled's multiple as published.",
          "Monthly range derived from hourly rates. $4,000 to $10,000 a month is 20 to 40 hours at $200 to $250 an hour (answer, key numbers, seat table, FAQ). Both ends match real 2026 retainers, $4,000 for 20 hours and $10,000 for 40 hours, and the physical therapy agency's 'about $250 an hour' is $10,000 divided by 40. Needs Matt's OK.",
          "Possibly derived. The sales coach row (about $150 an hour, about 40 hours, about $6,000 a month) comes from the G1 and G4 cost copy, not the post 6 draft. If the $6,000 was computed from the hourly rate it needs the same OK.",
          "Decision. The $3,000 for 20 hours lesson runs unattributed in the price section. The overview's open question on unattributed use names posts 9, 10, 12 and the Jan 28 post, and post 6 already carried it, but confirm.",
          "Decision. The anonymized founder quote 'a no-brainer' is kept from the post 6 draft. The inbound plan ties it to a named client that HubSpot lists as won, so confirm it is cleared to publish unattributed.",
          "Decision. The sales-and-marketing section uses Ferry (in company voice since Oct 14) as proof that one leader can cover both. The overview still asks Matt whether the Dec 22 marketing lesson should use Ferry or a marketing operator's story, so confirm Ferry for this use too."
        ]
      },
      {
        "slug": "fractional-vp-of-sales-first-90-days",
        "kind": "rewrite",
        "kindL": "First 90 days",
        "template": "answer",
        "fn": "sales",
        "cat": "sales_leadership",
        "need": "sales_motion",
        "persona": "P2",
        "q": "What should a fractional VP of Sales deliver in 90 days?",
        "metaTitle": "Fractional VP of Sales First 90 Days, What to Expect",
        "metaDescription": "Fractional VP of Sales first 90 days. A plan by day 30, a playbook by day 60, a right-sized team by day 90, and what to measure along the way.",
        "term": "fractional vp of sales first 90 days",
        "prompt": "What should a fractional VP of Sales deliver in the first 90 days, and how do I measure it?",
        "publish": null,
        "updated": "2026-10-11",
        "base": "No draft exists. The playbook's rebuild of /post/what-your-first-90-days-with-a-fractional-vp-of-sales-should-look-like for P2, answering the question bank's 'What should a fractional leader deliver in 90 days, and how do I measure it?'",
        "words": 1316,
        "opsQ": "sales process",
        "stat": {
          "v": "3 to 4 months",
          "l": "Initial term, then month to month with 30 days notice"
        },
        "related": [
          "how-to-hire-a-fractional-vp-of-sales",
          "how-to-stop-running-sales-as-a-founder"
        ],
        "replaces": [
          {
            "url": "/post/what-your-first-90-days-with-a-fractional-vp-of-sales-should-look-like",
            "title": "What your first 90 days with a fractional VP of Sales should look like",
            "clicks": 0,
            "impressions": 58,
            "position": 5.2,
            "action": "rebuild"
          }
        ],
        "answer": "By day 30, a rep-by-rep view and a 30/60/90-day plan. By day 60, a playbook the team uses. By day 90, a right-sized team and a hiring brief. Measure close rate and new clients monthly.",
        "keys": [
          {
            "k": "Initial term on every engagement",
            "v": "3 to 4 months, then month-to-month with 30 days notice",
            "src": "Revenue Nomad engagement terms",
            "url": ""
          },
          {
            "k": "Fractional VP or director of sales, team under 5 to 8 reps",
            "v": "[[cost:vp-sales.hourly]], [[cost:vp-sales.hours]]",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Starting point at a ~$9M physical therapy marketing agency, Sep 2026",
            "v": "Close rate in the teens, down from 30 to 40%",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Starting point at a founder-led healthcare services company, Sep 2026",
            "v": "8 commission-only reps, about 4 performing. The plan expects a team of 4 to 5",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Cost and ramp to replace a sales leader",
            "v": "[[cost:vp-sales.replace]], with 3+ months of ramp",
            "src": "Skaled",
            "url": "https://skaled.com/services/fractional-vp-of-sales/"
          }
        ],
        "sections": [
          {
            "id": "day-30-60-90",
            "h": "What should you have at day 30, 60 and 90?",
            "blocks": [
              {
                "p": "A plan at day 30, a playbook at day 60 and a right-sized team at day 90. One named operator owns the result, on a fixed weekly cadence."
              },
              {
                "table": {
                  "head": [
                    "When",
                    "What the operator does",
                    "What you receive",
                    "What to check"
                  ],
                  "rows": [
                    [
                      "Days 1 to 30",
                      "Assesses reps, audits the CRM, sits in on calls, fixes comp and talk tracks",
                      "A 30/60/90-day plan and a rep-by-rep view",
                      "Talk tracks written, pay changes made, starting numbers recorded"
                    ],
                    [
                      "Days 31 to 60",
                      "Documents the process, writes scripts, trains the team, sets a weekly cadence",
                      "A playbook your team uses",
                      "The weekly meeting happens and reps use the scripts on live calls"
                    ],
                    [
                      "Days 61 to 90",
                      "Makes personnel calls, runs pipeline reviews, makes hiring decisions",
                      "A right-sized team and a hiring brief",
                      "Close rate and new clients a month against the starting point"
                    ]
                  ]
                }
              },
              {
                "p": "For the month-by-month detail of a real handoff, read [[link:guide.how-to-stop-running-sales-as-a-founder|the 90-day founder handoff plan]]."
              },
              {
                "p": "Ask finalists for a draft plan in writing before you sign. The scaling CEOs we talk to want a 30/60/90-day plan before a retainer starts, and they want to meet the operator first. Both are steps in [[link:guide.how-to-hire-a-fractional-vp-of-sales|how to hire a fractional VP of Sales]]."
              },
              {
                "p": "The 90 days fit inside the 3 to 4 month initial term, so book a day-90 review now. The [[link:blueprint.vp-sales|VP of Sales Blueprint]] has a plan template, and the [[link:hire-fractional-sales-vp|sales leadership page]] shows this timeline next to our rates."
              }
            ]
          },
          {
            "id": "measure",
            "h": "How do you measure whether it is working?",
            "blocks": [
              {
                "p": "Pick three to five numbers in week one, record where they start and review them with the operator every week. Process changes should show in the first 30 days, and conversion should move within 90."
              },
              {
                "p": "These are the numbers we track at three sales engagements that started in September 2026."
              },
              {
                "table": {
                  "head": [
                    "Company",
                    "Starting point",
                    "What we track"
                  ],
                  "rows": [
                    [
                      "~$9M physical therapy marketing agency",
                      "Close rate in the teens, 2 to 4 new clients a month against a goal of 10+",
                      "Close rate, sales cycle length, new clients closed a month"
                    ],
                    [
                      "Founder-led healthcare services company",
                      "8 commission-only reps, about 4 performing",
                      "Rep-level activity and close rates, rep count against 4 to 5, process documented, founder hours on sales each week"
                    ],
                    [
                      "Founder-led restoration marketing agency[[gap:revenue band for the restoration marketing agency|Matt]]",
                      "In one month 19 meetings booked, 13 showed, 0 closed",
                      "Show rate, close rate on held meetings, booking system use by week 2, cost per closed client by channel"
                    ]
                  ]
                }
              },
              {
                "p": "No results yet.[[gap:90-day results at the three September 2026 engagements, with each client's OK|Operator]]"
              },
              {
                "p": "A bigger seat runs on a longer clock. At a ~$55M media and marketing services company, the fractional CRO plan starts with a 45-day assessment and expects meaningful progress by month 3 and traction by month 6."
              },
              {
                "p": "Every sales leader among our [[net]] operators is scored on [[link:levels|CORE]], and Results Focus is measured by revenue and conversion. Hold yours to the same numbers."
              }
            ]
          },
          {
            "id": "current-sales-leader",
            "h": "How do you bring one in without upsetting your sales leader?",
            "blocks": [
              {
                "p": "Decide the reporting line before anyone is sourced, and tell both people what each one decides. We set reporting lines before we source."
              },
              {
                "p": "A ~$9M physical therapy marketing agency kept its Director of Sales and added a fractional VP of Sales above the role as strategist and process builder, 40 hours a month for the first 3 months. The director runs the team day to day. The VP builds the system the team runs on, from discovery and qualification to the close and the follow-up. Nobody was replaced."
              },
              {
                "p": "That split works when the director can execute but nobody is designing the system. It breaks when nobody says who decides. Write the decision rights into the role profile and agree them before the start date."
              },
              {
                "quote": "[[gap:quote from the operator on sitting above an existing Director of Sales without replacing them, with permission|Operator]]"
              },
              {
                "p": "Watch the opposite risk too, an operator who cannot stand up to long-tenured leaders. Ask each finalist how they would handle a sales leader who disagrees with the plan."
              }
            ]
          },
          {
            "id": "real-company",
            "h": "What this looked like at a real company",
            "blocks": [
              {
                "p": "**The company.** A healthcare services company, still run by its founder.[[gap:revenue band for the healthcare services company|Matt]]"
              },
              {
                "p": "**Before.** 8 commission-only reps, about half not performing. No repeatable process and no accountability rhythm. The founder was stretched across the whole business, and sales got whatever hours were left."
              },
              {
                "p": "**What the operator is doing.** A 90-day build at 20 hours a month for $4,000, under a contract for a set block of hours. The founder met the operator before signing, and the plan was agreed up front. Assess every rep. Document the process that closes. Write scripts and run training. Audit the CRM. Make the personnel calls."
              },
              {
                "p": "**The number to watch.** Rep count. The plan expects 8 reps to become 4 or 5. With commission-only reps who are not closing, most of that headcount was never capacity."
              },
              {
                "p": "**After.** The engagement started in September 2026, so there is nothing to report yet. We track rep-level close rates, rep count, process documentation and the founder's weekly hours on sales.[[gap:90-day results at the healthcare services company, rep count after the review and any close rate change, with the client's OK|Operator]]"
              }
            ]
          },
          {
            "id": "not-right",
            "h": "When this is not the right move",
            "blocks": [
              {
                "p": "A fractional VP's 90-day plan is the wrong tool in three cases."
              },
              {
                "ul": [
                  "**The miss runs across sales, marketing, comp and the CRM.** That is a CRO job, and it starts with a diagnosis. Read [[link:guide.fractional-cro-vs-full-time-cro|fractional CRO or full-time CRO]].",
                  "**You cannot fund the hours.** One client bought 20 hours a month for $3,000 and missed target every month. Match the hours to the job.",
                  "**The playbook is proven and the budget is there.** Hire a full-time leader. A fractional plan fits while the system still needs building."
                ]
              },
              {
                "p": "If you do go fractional, set the hour block and the weekly meeting before day one. Asking for full-time availability at a fractional rate is the mismatch we see most."
              }
            ]
          }
        ],
        "faq": [
          {
            "q": "How fast should a fractional VP of Sales show results?",
            "a": "Process changes come first, within 30 days, such as written talk tracks and new pay plans. Conversion numbers like close rate should start to move within 90 days."
          },
          {
            "q": "How many hours do the first 90 days take?",
            "a": "20 to 40 hours a month for teams under 5 to 8 reps in our 2026 engagements. The ~$9M agency bought 40 a month for the first 3 months. [[link:guide.fractional-vp-of-sales-cost|What a fractional VP of Sales costs]] has the rates."
          },
          {
            "q": "What happens when the 90 days are up?",
            "a": "The engagement runs to the end of its 3 to 4 month initial term, then month-to-month with 30 days notice. You can keep the operator, hire full time into the system, or convert the operator for a fee of 20% of annual salary."
          },
          {
            "q": "What if the operator is the wrong fit?",
            "a": "You can swap the operator. Every engagement runs on a signed contract, with a monthly retainer billed upfront for a set block of hours."
          }
        ],
        "talk": "If your growth has stalled and you want one person to own the next 90 days, [[link:talk.sales_motion|tell us about your sales team]]. Four short questions, only name and email required. You get a role profile and 2 to 3 vetted operators, often within 48 hours, and meet them before you sign.",
        "gaps": [
          {
            "what": "reviewing operator name and sign-off",
            "owner": "Matt"
          },
          {
            "what": "final Talk to us URL on the live site (the prototype links talk.sales_motion)",
            "owner": "Rapid Neuron"
          },
          {
            "what": "301 redirect from /post/what-your-first-90-days-with-a-fractional-vp-of-sales-should-look-like to this post",
            "owner": "Rapid Neuron"
          },
          {
            "what": "revenue band for the restoration marketing agency",
            "owner": "Matt"
          },
          {
            "what": "revenue band for the healthcare services company",
            "owner": "Matt"
          },
          {
            "what": "90-day results at the three September 2026 engagements, with each client's OK",
            "owner": "Operator"
          },
          {
            "what": "quote from the operator on sitting above an existing Director of Sales without replacing them, with permission",
            "owner": "Operator"
          },
          {
            "what": "90-day results at the healthcare services company, rep count after the review and any close rate change, with the client's OK",
            "owner": "Operator"
          }
        ],
        "flags": [
          "Decision, not a calculation. The not-right section repeats the unattributed lesson that one client bought 20 hours a month for $3,000 and missed target every month, as G1 and G4 already do. The Content Bank overview still lists this lesson as a pending decision for posts 9, 10 and 12, so Matt should confirm it here too."
        ]
      },
      {
        "slug": "interim-vs-fractional-vs-full-time-sales-leader",
        "kind": "rewrite",
        "kindL": "Comparison",
        "template": "comparison",
        "fn": "sales",
        "cat": "sales_leadership",
        "need": "sales_motion",
        "persona": "P1 and P2",
        "q": "Interim, fractional or full-time sales leader, which fits?",
        "metaTitle": "Interim vs Fractional Sales Leader vs Full-Time Hire",
        "metaDescription": "Interim vs fractional sales leader vs a full-time hire or consulting firm, compared on cost, time to start and who owns results, with 2026 numbers.",
        "term": "interim vs fractional sales leader",
        "prompt": "Should I hire an interim, fractional or full-time sales leader, or a consulting firm?",
        "publish": null,
        "updated": "2026-10-11",
        "base": "No draft exists. The playbook's comparison rebuild of /post/interim-sales-leadership-vs-fractional-sales-leadership, widened to the visibility plan's #3 decision framework (fractional vs interim vs consultant vs full-time)",
        "words": 1697,
        "opsQ": "interim",
        "stat": {
          "v": "Up to about $800K",
          "l": "One client's full-time CRO benchmark, all in"
        },
        "related": [
          "fractional-vp-of-sales-cost",
          "fractional-cro-vs-full-time-cro"
        ],
        "replaces": [
          {
            "url": "/post/interim-sales-leadership-vs-fractional-sales-leadership",
            "title": "Interim Sales Leadership vs Fractional Sales Leadership",
            "clicks": 0,
            "impressions": 63,
            "position": 22.9,
            "action": "rebuild"
          }
        ],
        "answer": "Start fractional if you still carry the number and cannot yet name the full-time seat. Pick interim for near full-time cover for a set period. Hire full time once the system works.",
        "keys": [
          {
            "k": "Full-time CRO benchmark at a ~$55M client",
            "v": "Up to about $800K all in",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Fractional director or VP of Sales, team under 5 to 8 reps",
            "v": "[[cost:vp-sales.hourly]], [[cost:vp-sales.hours]]",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Time to a role profile and 2 to 3 vetted operators",
            "v": "Often within 48 hours",
            "src": "Revenue Nomad process, 2026",
            "url": ""
          },
          {
            "k": "Large consultancy quote to one enterprise SaaS client",
            "v": "About $230K for a 6-week assessment",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Average total full-time VP of Sales compensation and tenure",
            "v": "[[cost:vp-sales.fullTime|bare]], about 19 months in seat",
            "src": "Glassdoor 2026 via Stealth Agents, secondary source",
            "url": "https://stealthagents.com/research/cost-of-hiring-a-vp-of-sales-2026"
          }
        ],
        "sections": [
          {
            "id": "side-by-side",
            "h": "How do interim, fractional, full-time and a consulting firm compare?",
            "blocks": [
              {
                "p": "They differ most on hours, term and who is on the hook when the number moves. VP of Sales pay and tenure come from [[url:https://stealthagents.com/research/cost-of-hiring-a-vp-of-sales-2026|a secondary source citing Glassdoor]] and ramp from [[url:https://skaled.com/services/fractional-vp-of-sales/|Skaled]]. The rest comes from our 2026 engagements."
              },
              {
                "table": {
                  "head": [
                    "",
                    "Fractional",
                    "Interim",
                    "Full-time",
                    "Consulting firm"
                  ],
                  "rows": [
                    [
                      "Cost",
                      "$200 to $250 an hour, 20 to 40 hours a month, for a director or VP. $23,200 a month for an embedded CRO at 50 hours",
                      "[[gap:interim sales leader cost, from our records or a cited source|Matt]]",
                      "About $334K average total comp for a VP of Sales. One client benchmarked a full-time CRO at up to about $800K all in",
                      "About $230K for a 6-week assessment, in one 2026 quote"
                    ],
                    [
                      "Time to start",
                      "A role profile and 2 to 3 vetted operators often within 48 hours, then meetings in week 1 to 2",
                      "[[gap:typical time to start an interim sales leader|Matt]]",
                      "A search, then 3+ months of ramp",
                      "Findings after 6 weeks in that quote"
                    ],
                    [
                      "Commitment",
                      "A contract with a 3 to 4 month initial term, then month-to-month with 30 days notice",
                      "Close to full time, for a defined period",
                      "Permanent, though average VP of Sales tenure is about 19 months",
                      "One fixed project"
                    ],
                    [
                      "Who owns results",
                      "One named operator, on a fixed weekly cadence",
                      "The interim leader, for that period",
                      "The hire, once ramped",
                      "The firm owns the findings. Your team owns the fix"
                    ],
                    [
                      "Best fit",
                      "Founder or CEO still runs sales, and the system is broken",
                      "A seat that needs someone close to full time for a set period",
                      "A working system that needs running every day",
                      "Findings your own team will execute"
                    ]
                  ]
                }
              },
              {
                "p": "The [[link:fractional-cost|cost hub]] breaks rates down by seat, and network-wide 2027 rates arrive with our survey[[gap:2027 survey figure for fractional sales leader rates|Survey]]."
              }
            ]
          },
          {
            "id": "interim-vs-fractional",
            "h": "What is an interim sales leader, and how is fractional different?",
            "blocks": [
              {
                "p": "An interim sales leader works close to full time for a defined period. A fractional sales leader works a set block of hours each month, 20 to 50 in our 2026 sales engagements, under a contract that runs month-to-month after the initial term."
              },
              {
                "p": "Interim covers a leadership seat for a set time. Fractional is the bridge from diagnosis to a built system. Our standard sales plan ends at day 90 with a right-sized team and a hiring brief."
              },
              {
                "p": "The most common mismatch we see is expecting full-time availability at a fractional rate. If the job needs a leader in the building all week, fractional is the wrong model. Choose interim if you need that for a defined period, such as while you search for a permanent hire."
              },
              {
                "p": "We place only dedicated fractional operators, and retainers run on a set block of hours."
              },
              {
                "p": "Fractional can run long, too. Our team signed with Ferry, a hospitality tip management platform, for 4 months in its fractional GTM strategy seat and stayed about 18."
              }
            ]
          },
          {
            "id": "when-fractional",
            "h": "When should you choose a fractional sales leader?",
            "blocks": [
              {
                "p": "When the founder or CEO still carries the number and the revenue system under it is broken. That is the job [[link:hire-fractional-sales-vp|fractional sales leadership]] is built for."
              },
              {
                "ul": [
                  "**A director or VP of Sales** fits a team under 5 to 8 reps, at 20 to 40 hours a month and $200 to $250 an hour. A founder-led healthcare services company with 8 commission-only reps, about half not performing, runs a 90-day build at 20 hours a month for $4,000[[gap:revenue band for the healthcare services company|Matt]].",
                  "**A CRO** fits when sales, marketing, comp and the CRM all feed the miss. A ~$55M media and marketing services company ran a 45-day assessment at $27,500, then embedded a fractional CRO at 50 hours a month for $23,200."
                ]
              },
              {
                "p": "Buy enough hours. One client took 20 hours a month for $3,000 and missed target every month."
              },
              {
                "p": "Fractional also tells you which full-time seat you need, because a leader at month 6 can write that job description with real data. More in [[link:guide.fractional-cro-vs-full-time-cro|fractional CRO or full-time CRO]] and [[link:guide.fractional-vp-of-sales-cost|what a fractional VP of Sales costs]]."
              }
            ]
          },
          {
            "id": "when-full-time",
            "h": "When is a full-time sales leader the right hire?",
            "blocks": [
              {
                "p": "Once the system works and the daily job is running it. At that point you know which leader to hire."
              },
              {
                "p": "Full time costs more than the salary line, and a wrong hire costs more again. [[link:guide.fractional-cro-vs-full-time-cro|Fractional CRO or full-time CRO at $30M]] runs those numbers."
              },
              {
                "p": "Hire full time if you need someone in the building 50+ hours a week for years. Or use both in sequence, fractional first, then a full-time hire or a conversion of the operator."
              }
            ]
          },
          {
            "id": "when-consulting-firm",
            "h": "When does a consulting firm make sense?",
            "blocks": [
              {
                "p": "When you want findings and your own team will carry out the fix. A firm sells the diagnosis, and the execution stays with you."
              },
              {
                "p": "In 2026 a large consultancy quoted one of our enterprise software clients about $230K for a 6-week assessment. The fee covered findings, with nobody from the firm staying to run the fix."
              },
              {
                "p": "Clients tell us they want the diagnosis to lead into execution. You can buy it from a fractional operator and keep the same person for the fix, as the ~$55M media company above did. We have sat in both seats: our team spent about 10 years in B2B sales consulting and still does fractional work."
              }
            ]
          },
          {
            "id": "when-none",
            "h": "When should you hire none of them?",
            "blocks": [
              {
                "p": "When the team is too small for a leader, the budget cannot buy the hours the job needs, or your leaders will not give an outsider real authority."
              },
              {
                "ul": [
                  "**Fewer than 3 reps, and the founder still closes most deals.** A sales coach or a player-coach fits better. At a ~$10M company, a sales coach ran about $150 an hour for about 40 hours a month in 2026.",
                  "**You need one more rep to sell.** That is a different hire at a different price.",
                  "**The budget buys half the hours the job needs.** Narrow the scope until it fits, or wait.",
                  "**Nobody will give an outside leader real authority.** The engagement turns into a report. Settle decision rights first."
                ]
              }
            ]
          },
          {
            "id": "what-we-see",
            "h": "What does Revenue Nomad see across its placements?",
            "blocks": [
              {
                "p": "Across every kind of client we serve, the trigger is the same. An overloaded founder or executive, and a revenue system that is broken."
              },
              {
                "ul": [
                  "**Clients meet the operator first.** Every deal we have won included a conversation with the candidate before the contract.",
                  "**Price has to fit the team.** One founder-led client had fractional quotes of $6,000 to $12,000 a month that were too much for their team. $4,000 for 20 hours fit.",
                  "**Seniority has to fit the stage.** For a 5-rep team, a tactical director often beats a strategic VP. A great CRO from a $500M company will likely struggle at a $30M one, so we track 50+ data points on each of our [[net]] [[link:browse.sales_leadership|operators]].",
                  "**Fractional works past early stage.** At about $400M ARR, the President of Workforce Software brought in fractional help to stand up a RevOps function from zero."
                ]
              },
              {
                "p": "Network-wide data on when fractional clients convert to a full-time hire lands with the [[link:report|State of Fractional GTM report]][[gap:2027 survey figure on when clients convert to full time|Survey]]."
              }
            ]
          },
          {
            "id": "real-company",
            "h": "What this looked like at a real company",
            "blocks": [
              {
                "p": "An enterprise billing software company had flat pipeline[[gap:revenue band for the enterprise billing software company|Matt]]. Meeting conversion was the lowest the CEO had seen, and \"no decision\" was the leading loss reason. Nobody could show the bridge from the bookings goal to pipeline. The forecast needed 3 to 4 deals of about $1M each, and the CRO and CMO had been in seat for 6+ years."
              },
              {
                "p": "The CEO weighed three of the options on this page. A full-time hire, a large consultancy that quoted about $230K for a 6-week assessment, and a fractional operator."
              },
              {
                "p": "The company chose a fractional lead revenue architect who reports to the CFO, about 2.5 days a week at $27,000 a month flat. The same person diagnoses and then builds. A point of view lands by day 14, and days 31 to 90 deploy a KPI framework, a forecast the leadership team can defend and pipeline coverage targets. Reporting to the CFO lets the operator question pipeline assumptions without reporting to the leaders who set them."
              },
              {
                "p": "Work starts October 19, 2026, so nothing has moved yet. We will judge it on forecast accuracy, pipeline coverage against the bridge math and how many losses still end in \"no decision.\"[[gap:day-90 result, with the client's OK|Operator]]"
              },
              {
                "quote": "[[gap:quote from the operator on choosing fractional over a large consultancy, with permission|Operator]]"
              }
            ]
          }
        ],
        "faq": [
          {
            "q": "What are the alternatives to a full-time sales leader?",
            "a": "An interim leader close to full time for a defined period, a fractional leader on a set block of hours, or a consulting firm that delivers findings. With under 3 reps and the founder still closing most deals, start with a sales coach."
          },
          {
            "q": "Can a fractional sales leader become our full-time hire?",
            "a": "Yes. Some clients convert the operator once the system works. The full-time conversion fee is 20% of annual salary."
          },
          {
            "q": "Is there a fee besides the operator's rate?",
            "a": "No. Clients pay no platform fee. You pay the operator's rate and nothing more."
          },
          {
            "q": "What if the operator is the wrong fit?",
            "a": "You can swap the operator. Every contract starts with a 3 to 4 month initial term, then goes month-to-month with 30 days notice."
          }
        ],
        "talk": "Not sure which fits? [[link:talk.sales_motion|Tell us about your sales team]] in four short questions, covering what you need, how big the business is, when someone should start and where to reply. Only name and email are required. We reply with a role profile and 2 to 3 vetted operators, often within 48 hours, and you meet them before you sign.",
        "gaps": [
          {
            "what": "reviewing operator name and sign-off (shown in the byline, not in the text)",
            "owner": "Matt"
          },
          {
            "what": "final Talk to us URL, ships Oct 30 (the post links talk.sales_motion in the prototype)",
            "owner": "Rapid Neuron"
          },
          {
            "what": "interim sales leader cost, from Revenue Nomad records or a cited outside source (comparison table)",
            "owner": "Matt"
          },
          {
            "what": "typical time to start an interim sales leader (comparison table)",
            "owner": "Matt"
          },
          {
            "what": "2027 survey figure for network-wide fractional sales leader rates",
            "owner": "Survey"
          },
          {
            "what": "2027 survey figure on when fractional clients convert to full time",
            "owner": "Survey"
          },
          {
            "what": "revenue band for the healthcare services company",
            "owner": "Matt"
          },
          {
            "what": "revenue band for the enterprise billing software company",
            "owner": "Matt"
          },
          {
            "what": "day-90 result at the enterprise billing software company, with the client's OK",
            "owner": "Operator"
          },
          {
            "what": "quote from the operator on choosing fractional over a large consultancy, with permission",
            "owner": "Operator"
          },
          {
            "what": "301 redirect from /post/interim-sales-leadership-vs-fractional-sales-leadership to this post (the spec rebuilds that URL here)",
            "owner": "Rapid Neuron"
          }
        ],
        "flags": [
          "Decision, not a calculation. The fractional section repeats the unattributed lesson that one client bought 20 hours a month for $3,000 and missed target every month, as G1 and G4 already do. The Content Bank overview still lists this lesson as a pending decision for posts 9, 10 and 12, so Matt should confirm it here too.",
          "Decision. The interim column has no Revenue Nomad numbers, and the page says Revenue Nomad places only dedicated fractional operators. Matt should decide whether Revenue Nomad ever staffs a near full-time interim seat, then fill or cut the two interim gaps in the table (cost and time to start)."
        ]
      },
      {
        "slug": "how-to-stop-running-sales-as-a-founder",
        "kind": "rewrite",
        "kindL": "Playbook",
        "template": "answer",
        "fn": "sales",
        "cat": "sales_leadership",
        "need": "sales_motion",
        "persona": "P1",
        "q": "How do I stop running sales as a founder?",
        "metaTitle": "How to Stop Running Sales as a Founder in 90 Days",
        "metaDescription": "How to stop running sales as a founder in 90 days. What to document, who to bring in, what it costs and what to measure, from real 2026 engagements.",
        "term": "how to stop running sales as a founder",
        "prompt": "How do I get out of running sales myself as a founder?",
        "publish": "2026-11-16",
        "updated": "2026-10-11",
        "base": "Content Bank Post 3 (bank-nov.md), the playbook's merge target for /post/founder-led-sales-vs-fractional-vp-of-inside-sales",
        "words": 1350,
        "opsQ": "founder-led",
        "stat": {
          "v": "$4k/month",
          "l": "For 20 hours with a founder-led team"
        },
        "related": [
          "sales-meetings-not-converting",
          "fractional-vp-of-sales-first-90-days"
        ],
        "replaces": [
          {
            "url": "/post/founder-led-sales-vs-fractional-vp-of-inside-sales",
            "title": "Founder Led Sales vs Fractional VP of Inside Sales: When and Why to Make the Transition",
            "clicks": 0,
            "impressions": 376,
            "position": 11.1,
            "action": "merge"
          }
        ],
        "answer": "Hand the sales system to one accountable owner, not another rep. For a founder-CEO at a $5M to $20M services firm that takes 90 days and ends with you out of the weekly pipeline call.",
        "keys": [
          {
            "k": "Fractional sales leader scope for a founder-led team",
            "v": "$4k/month, for 20 hours",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Days for the first AE hired at Ferry to close a deal",
            "v": "Within 60 days",
            "src": "Revenue Nomad engagement at Ferry",
            "url": ""
          },
          {
            "k": "Ferry engagement length vs initial term",
            "v": "About 18 months vs a 4-month initial term",
            "src": "Revenue Nomad engagement at Ferry",
            "url": ""
          },
          {
            "k": "Commission-only reps at one founder-led company, and how many were performing",
            "v": "8 reps, about half not performing",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Cost of replacing a sales leader",
            "v": "[[cost:vp-sales.replace]], with 3+ months of ramp",
            "src": "Skaled",
            "url": "https://skaled.com/services/fractional-vp-of-sales/"
          }
        ],
        "sections": [
          {
            "id": "time-to-stop",
            "h": "How do I know it is time to stop running sales myself?",
            "blocks": [
              {
                "p": "It is time when your calendar is the bottleneck on revenue. If deals stall when you travel, you are the sales process."
              },
              {
                "p": "The clients who come to us rarely have an empty seat. They have founder overload plus a broken revenue system. Look for these signs."
              },
              {
                "ul": [
                  "Reps wait on you to join late-stage calls.",
                  "Nobody but you can explain why the last 5 deals were won or lost.",
                  "Rep performance is a feeling, not a number.",
                  "You spend more hours in pipeline reviews than in the rest of the business."
                ]
              },
              {
                "p": "One founder-led healthcare services company we work with had 8 commission-only reps[[gap:revenue band for the healthcare services company|Matt]]. About half were not performing. The founder was stretched across the whole business. There was no repeatable process and no accountability. Hiring rep number 9 would not have fixed any of that."
              },
              {
                "p": "If your meetings get booked but never close, start with [[link:guide.sales-meetings-not-converting|why booked sales meetings are not turning into deals]]."
              },
              {
                "quote": "[[gap:quote from the operator on the signs a founder waited too long to hand off sales, with permission|Operator]]"
              }
            ]
          },
          {
            "id": "who-owns-sales",
            "h": "Who should own sales after me?",
            "blocks": [
              {
                "p": "One named owner who builds the system, then manages it. For most founder-led teams under 5 to 8 reps, that is a [[link:hire-fractional-sales-vp|fractional sales director or VP]], not a full-time CRO."
              },
              {
                "p": "You want a builder, someone who sells to prove what works, then writes it down, hires and manages. That is a different person from a pure closer. It is also a different person from a consultant who hands you a deck."
              },
              {
                "p": "Seniority matters. For small teams, we have seen a tactical director beat a strategic VP. One founder ran a working assignment with two finalists. Each reviewed a recorded call and answered 3 written questions. The founder picked the more tactical operator who knew the industry."
              },
              {
                "p": "Across our 2026 engagements, this seat ran about $200 to $250 an hour, 20 to 40 hours a month. One founder-led client told us $4,000 for 20 hours was a no-brainer next to quotes of $6,000 to $12,000 a month that felt like overkill for their team size. To scope the seat, start from the [[link:blueprint.vp-sales|Fractional VP of Sales Blueprint]]."
              }
            ]
          },
          {
            "id": "days-1-to-30",
            "h": "What happens in days 1 to 30?",
            "blocks": [
              {
                "p": "Diagnose, then write it down. By day 30 the team should have talk tracks they did not get from you in a hallway."
              },
              {
                "p": "Two first-month plans from 2026 engagements show the pattern."
              },
              {
                "p": "At a water damage restoration marketing agency, the fractional sales director's first month covers SDR compensation, discovery and close talk tracks, role-play training, booking system adoption by week 2, and cutting or doubling down on channels based on conversion[[gap:revenue band for the restoration marketing agency|Matt]]."
              },
              {
                "p": "At the healthcare services company, the plan starts with assessing every rep, documenting the sales process, and auditing the CRM."
              },
              {
                "p": "Your job in month one is access. Give the operator your call recordings, your CRM, your 10 biggest won deals and your honest view of each rep. Then stop answering the team's sales questions yourself. Route them to the operator."
              },
              {
                "quote": "[[gap:quote from the operator on the first 30 days, with permission|Operator]]"
              }
            ]
          },
          {
            "id": "days-31-to-60",
            "h": "What happens in days 31 to 60?",
            "blocks": [
              {
                "p": "People and process. This is where the hard calls get made."
              },
              {
                "p": "At the healthcare services company, month two covers scripts, training and personnel decisions. The working expectation is a cut from 8 reps to 4 or 5. Smaller and accountable beats larger and unmanaged."
              },
              {
                "p": "In this window the operator should run the weekly pipeline call. You attend and stay quiet. If you jump in, the team learns that the real decision-maker is still you."
              },
              {
                "p": "Expect friction. Reps who were managed by relationship will now be managed by number. Some leave. That is part of the plan, not a sign it failed."
              },
              {
                "quote": "[[gap:quote from the operator on making personnel calls inside a founder-led team, with permission|Operator]]"
              }
            ]
          },
          {
            "id": "days-61-to-90",
            "h": "What happens in days 61 to 90?",
            "blocks": [
              {
                "p": "The handoff. You leave the weekly pipeline call, and the operator owns the number."
              },
              {
                "p": "By day 90 you should have a documented process, trained reps on clear talk tracks, a CRM that reflects reality and one owner accountable for the forecast. Then decide what comes next. Keep the operator on a defined hour block, hire a full-time leader into a working system, or hire your first AE under the operator."
              },
              {
                "p": "That last path is what happened at Ferry, a hospitality tip management platform where our team held the fractional GTM strategy seat from February 2025. We built Ferry's first digital demand generation program, which produced its first 20 inbound leads. We closed 2 deals that doubled the client base. Then we hired and onboarded Ferry's first AE, who closed a deal within 60 days."
              },
              {
                "p": "To check progress at day 30, 60 and 90, read [[link:guide.fractional-vp-of-sales-first-90-days|what a fractional VP of Sales should deliver in 90 days]]."
              },
              {
                "quote": "[[gap:quote from the operator on what a clean handoff looks like at day 90, with permission|Operator]]"
              }
            ]
          },
          {
            "id": "real-company",
            "h": "What this looked like at a real company",
            "blocks": [
              {
                "p": "**The company.** A founder-led healthcare services company.[[gap:revenue band for the healthcare services company|Matt]]"
              },
              {
                "p": "**Before.** 8 commission-only reps, about half not performing. The founder was stretched across the business. No repeatable process. No accountability."
              },
              {
                "p": "**What the operator is doing.** A fractional sales leader is running a 90-day build at 20 hours a month for $4,000. Assess every rep. Document the sales process. Write scripts and run training. Audit the CRM. Make personnel calls, likely cutting to 4 to 5 reps."
              },
              {
                "p": "**What is being measured.** The engagement started in September 2026. No results yet. We are tracking rep-level activity and close rates, rep count against the 4 to 5 target, process documentation completed, and founder hours spent on sales each week.[[gap:90-day results at the healthcare services company, with the client's OK|Operator]]"
              }
            ]
          },
          {
            "id": "not-right",
            "h": "When this is not the right move",
            "blocks": [
              {
                "p": "Do not run this plan in three cases."
              },
              {
                "ul": [
                  "**You have not found a repeatable sale yet.** If you are still the only person who can close and you do not know why, keep selling and write down what works first.",
                  "**You want full-time availability at a fractional rate.** It is the mismatch we see most often. Set a fixed block of hours and a weekly meeting, or hire full-time.",
                  "**You can fund a full-time leader and the playbook is proven.** Then hire full-time. Fractional fits when the system still needs building."
                ]
              },
              {
                "p": "And do not go thin. One client placed at 20 hours a month for $3,000 missed target every month."
              }
            ]
          }
        ],
        "faq": [
          {
            "q": "How long does it take to hand off sales as a founder?",
            "a": "Plan on 90 days for a team under 5 to 8 reps."
          },
          {
            "q": "When should a founder hand sales to a fractional VP of Sales?",
            "a": "When you still run sales and the revenue system is broken. The trigger is usually overload, not an empty seat. If the playbook is proven and you can fund a full-time leader, hire full-time instead."
          },
          {
            "q": "Do I need a full-time VP of Sales to stop running sales?",
            "a": "Not usually at $5M to $20M. A fractional director or VP at 20 to 40 hours a month is often enough to build the system."
          },
          {
            "q": "What if the operator is the wrong fit?",
            "a": "Our engagements let the client swap the operator if fit is wrong."
          },
          {
            "q": "Can the fractional leader become full-time later?",
            "a": "Yes. Conversion carries a fee of 20% of annual salary."
          }
        ],
        "talk": "Ready to hand off sales? Answer four short questions on the [[link:talk.sales_motion|Talk to us form]]. Only name and email are required. We come back with a role profile and 2 to 3 vetted operators who have built sales at your stage, often within 48 hours, and you meet them before you sign anything.",
        "gaps": [
          {
            "what": "reviewing operator name and sign-off",
            "owner": "Matt"
          },
          {
            "what": "final Talk to us URL ships Oct 30 (the prototype links talk.sales_motion)",
            "owner": "Rapid Neuron"
          },
          {
            "what": "301 redirect from /post/founder-led-sales-vs-fractional-vp-of-inside-sales to this post",
            "owner": "Rapid Neuron"
          },
          {
            "what": "interview 1 quote from the operator on the signs a founder waited too long to hand off sales, with permission",
            "owner": "Operator"
          },
          {
            "what": "interview 1 quote from the operator on the first 30 days, with permission",
            "owner": "Operator"
          },
          {
            "what": "interview 1 quote from the operator on making personnel calls inside a founder-led team, with permission",
            "owner": "Operator"
          },
          {
            "what": "interview 1 quote from the operator on what a clean handoff looks like at day 90, with permission",
            "owner": "Operator"
          },
          {
            "what": "revenue band for the healthcare services company",
            "owner": "Matt"
          },
          {
            "what": "revenue band for the restoration marketing agency",
            "owner": "Matt"
          },
          {
            "what": "90-day results at the healthcare services company, with the client's OK",
            "owner": "Operator"
          }
        ],
        "flags": [
          "Decision, not a calculation. The not-right section keeps the draft's unattributed lesson that one client bought 20 hours a month for $3,000 and missed target every month (G1 and G4 carry it too). The Content Bank overview lists this lesson as a pending decision for posts 9, 10 and 12 and the Jan 28 post but not post 3, so Matt should confirm it here as well."
        ]
      },
      {
        "slug": "sales-meetings-not-converting",
        "kind": "new",
        "kindL": "Diagnosis",
        "template": "answer",
        "fn": "sales",
        "cat": "sales_leadership",
        "need": "sales_motion",
        "persona": "P1",
        "q": "Why are booked sales meetings not turning into deals?",
        "metaTitle": "Sales Meetings Not Converting? Find Where Deals Leak",
        "metaDescription": "Sales meetings not converting? How founder-led firms find the leak between booked meeting and closed deal, with real numbers from 2026 engagements.",
        "term": "sales meetings not converting",
        "prompt": "Why are my booked sales meetings not turning into closed deals, and who should fix it?",
        "publish": "2026-11-02",
        "updated": "2026-10-11",
        "base": "Content Bank Post 1 (bank-nov.md)",
        "words": 1433,
        "opsQ": "sales process",
        "stat": {
          "v": "19 booked, 0 closed",
          "l": "One month at one agency"
        },
        "related": [
          "how-to-stop-running-sales-as-a-founder",
          "fractional-vp-of-sales-cost"
        ],
        "replaces": [],
        "answer": "Booked meetings stall for three reasons. Prospects do not show, discovery finds no real problem, or nobody asks for a decision. Measure show rate and close rate by stage before you buy more leads.",
        "keys": [
          {
            "k": "One month at the same agency",
            "v": "19 booked, 13 showed, 0 closed",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Meetings booked year to date at one agency, and how many showed",
            "v": "278 booked, 134 showed, about half",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Close rate drop at a ~$9M agency",
            "v": "From 30 to 40% down into the teens",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Fractional sales director for a team under 5 to 8 reps",
            "v": "[[cost:vp-sales.monthly]], for 20 to 40 hours",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Cost of replacing a sales leader",
            "v": "[[cost:vp-sales.replace]], with 3+ months of ramp",
            "src": "Skaled",
            "url": "https://skaled.com/services/fractional-vp-of-sales/"
          }
        ],
        "sections": [
          {
            "id": "why-meetings-stall",
            "h": "Why do booked meetings stop turning into deals?",
            "blocks": [
              {
                "p": "The leak almost always sits between the booking and the decision, inside your own process. More leads just pour more water into the same leak."
              },
              {
                "p": "Break the funnel into three steps and look at each one on its own."
              },
              {
                "ul": [
                  "**Booked to showed.** A low show rate usually means a weak reason to attend, no confirmation sequence, or the wrong person on the invite.",
                  "**Showed to qualified.** If held meetings rarely turn into a real opportunity, check targeting and check how your SDRs are paid. Pay per booking and you get bookings.",
                  "**Qualified to closed.** If good-fit prospects still do not sign, the problem is discovery, the close conversation, pricing confidence, or follow-up that nobody owns."
                ]
              },
              {
                "p": "At one restoration marketing agency we work with, 19 meetings were booked in a single month[[gap:revenue band for the restoration marketing agency|Matt]]. 13 showed. None closed. The calendar looked full. The pipeline was empty. The founder had been carrying every one of those calls while also running the company."
              }
            ]
          },
          {
            "id": "lead-or-sales-problem",
            "h": "Is this a lead problem or a sales problem?",
            "blocks": [
              {
                "p": "Check conversion before volume. If your close rate on held meetings fell while lead volume held steady, fix the sales motion first."
              },
              {
                "p": "A ~$9M physical therapy marketing agency came to us with exactly this pattern. Its close rate had been 30 to 40%. It had slipped into the teens. The sales cycle ran 6 to 8 weeks. The team closed 2 to 4 new clients a month against a goal of 10 or more, and the founder wanted to grow from about $9M to $15M."
              },
              {
                "p": "Run the math on a goal like that. At a 15% close rate, 10 new clients a month takes about 67 held meetings. At 35%, it takes about 29. Recovering the old close rate cuts the meeting load by more than half. No new lead source does that for you."
              },
              {
                "p": "The tell is history. If the same channels used to convert and now do not, the channel is rarely the cause."
              }
            ]
          },
          {
            "id": "what-to-measure",
            "h": "What should I measure before I change anything?",
            "blocks": [
              {
                "p": "Track five numbers every week, by source and by rep. Booked, showed, qualified, closed, and cost per closed client."
              },
              {
                "p": "Most founder-led teams can tell you how many meetings they booked. Few can tell you the show rate by source or the cost of each closed client. Without those, every fix is a guess."
              },
              {
                "p": "The restoration agency had the first numbers. 278 appointments booked year to date. 134 showed, about half. That program was producing about $60K of MRR on about $80K of cost. Every no-show was a meeting the business had already paid for."
              },
              {
                "p": "Add two more once the basics are clean."
              },
              {
                "ul": [
                  "**Days from first meeting to signed deal.** If the cycle stretches, deals are dying of neglect.",
                  "**Close rate by who ran the meeting.** If the founder closes and nobody else does, the leak is the handoff."
                ]
              },
              {
                "p": "Do not wait for a perfect dashboard. A shared sheet updated every Friday beats a CRM report nobody trusts."
              }
            ]
          },
          {
            "id": "first-30-days",
            "h": "What does a fractional sales leader fix in the first 30 days?",
            "blocks": [
              {
                "p": "The first month is about the process around the meeting. Scripts, pay, the booking system and channel decisions."
              },
              {
                "p": "Here is the first-month plan the restoration agency's fractional sales director is running."
              },
              {
                "ol": [
                  "Rebuild SDR compensation so reps are paid for meetings that show and qualify.",
                  "Write discovery and close talk tracks.",
                  "Run role-play training against those tracks.",
                  "Get the booking system adopted by the whole team by week 2.",
                  "Cut or double down on each demand channel based on conversion, not volume."
                ]
              },
              {
                "p": "That scope runs at 20 hours a month for $4,000 a month. It is small on purpose because the team is small. One founder-led client told us other quotes of $6,000 to $12,000 a month felt like overkill for their team size."
              },
              {
                "p": "The physical therapy agency took a different shape. It kept its Director of Sales and added [[link:hire-fractional-sales-vp|a fractional VP of Sales]] above that role as strategist and process builder, at 40 hours a month for the first 3 months."
              },
              {
                "quote": "[[gap:quote from the operator on the first 30 days at the restoration marketing agency, with permission|Operator]]"
              }
            ]
          },
          {
            "id": "full-time-or-fractional",
            "h": "Should I hire a full-time VP of Sales or go fractional?",
            "blocks": [
              {
                "p": "If the system is broken and you have fewer than 5 to 8 reps, fractional usually fits. If the scope is proven and funded, hire full-time."
              },
              {
                "p": "Across our 2026 engagements, [[link:browse.sales_leadership|fractional sales directors and VPs]] for small teams ran about $200 to $250 an hour, 20 to 40 hours a month. Public estimates put average total VP of Sales compensation near $334K, with average tenure around 19 months ([[url:https://stealthagents.com/research/cost-of-hiring-a-vp-of-sales-2026|Stealth Agents, secondary source citing Glassdoor 2026]]). [[link:guide.fractional-vp-of-sales-cost|What a fractional VP of Sales costs]] breaks down every seat."
              },
              {
                "p": "Two warnings from our own work."
              },
              {
                "ul": [
                  "**Thin hours fail.** One client placed at 20 hours a month for $3,000 did not hit target in any month. Match the hours to the job.",
                  "**Match seniority to the team.** For small teams, a tactical director has beaten a strategic VP."
                ]
              },
              {
                "p": "[[gap:2027 survey figure on median fractional sales leader monthly retainer|Survey]]"
              }
            ]
          },
          {
            "id": "real-company",
            "h": "What this looked like at a real company",
            "blocks": [
              {
                "p": "**The company.** A water damage restoration marketing agency, founder-led.[[gap:revenue band for the restoration marketing agency|Matt]]"
              },
              {
                "p": "**Before.** 278 appointments booked year to date, 134 showed. About $60K of MRR on about $80K of cost. In one month, 19 booked, 13 showed and 0 closed. The founder wanted out of running revenue. That move has its own [[link:guide.how-to-stop-running-sales-as-a-founder|90-day founder handoff plan]]."
              },
              {
                "p": "**What the operator did.** The founder ran a short working assignment with two finalists. Each reviewed a recorded BDR call and a Loom video, then answered 3 written questions. The founder chose the more tactical, agency-familiar operator over the more strategic builder. The engagement runs 20 hours a month at $4,000, with the first-month plan above."
              },
              {
                "p": "**What is being measured.** The engagement started in September 2026. No results yet. We are tracking show rate, close rate on held meetings, booking system adoption by week 2, and cost per closed client by channel.[[gap:90-day results at the restoration marketing agency, with the client's OK|Operator]]"
              }
            ]
          },
          {
            "id": "not-right",
            "h": "When this is not the right move",
            "blocks": [
              {
                "p": "A fractional sales leader is the wrong hire in four cases."
              },
              {
                "ul": [
                  "**Meetings are not getting booked at all.** That is a demand problem. Start with [[link:fractional-marketing-leadership|marketing leadership]], not a sales leader.",
                  "**You need one more closer.** If the process works and you are short a seller, hire a rep.",
                  "**You expect full-time availability at a fractional rate.** That is the most common mismatch we see. Agree a fixed hour block and a weekly cadence, or hire full-time.",
                  "**The scope is proven and the budget is there.** If you know the playbook works and you can fund a full-time leader, a full-time hire will own it longer."
                ]
              }
            ]
          }
        ],
        "faq": [
          {
            "q": "What is a normal show rate for booked sales meetings?",
            "a": "It varies by channel and deal size. One agency we work with saw 134 of 278 bookings show, about half.[[gap:2027 survey figure on typical show rate|Survey]]"
          },
          {
            "q": "How fast should a fractional sales leader show results?",
            "a": "Expect process changes in the first 30 days, such as talk tracks, pay changes and booking system use. Expect conversion data to move within the first 90 days."
          },
          {
            "q": "Will a fractional leader replace my current sales manager?",
            "a": "Not necessarily. One ~$9M agency kept its Director of Sales and added a fractional VP above the role as strategist and process builder."
          },
          {
            "q": "How many hours a month do I need?",
            "a": "Across our 2026 engagements, small teams ran 20 to 40 hours a month. Below that, results suffer."
          }
        ],
        "talk": "If your calendar is full and your pipeline is not, tell us what you are trying to fix through the [[link:talk.sales_motion|Talk to us form]]. It asks four short questions, and only name and email are required. We reply with a role profile and a vetted shortlist of 2 to 3 operators matched to your stage and team size, often within 48 hours, and you meet each operator before you sign anything.",
        "gaps": [
          {
            "what": "reviewing operator name and sign-off (shown in the byline, not in the text)",
            "owner": "Matt"
          },
          {
            "what": "final Talk to us URL, ships Oct 30 (the post links talk.sales_motion in the prototype)",
            "owner": "Rapid Neuron"
          },
          {
            "what": "quote from the operator on the first 30 days at the restoration marketing agency, with permission",
            "owner": "Operator"
          },
          {
            "what": "2027 survey figure on median fractional sales leader monthly retainer",
            "owner": "Survey"
          },
          {
            "what": "revenue band for the restoration marketing agency",
            "owner": "Matt"
          },
          {
            "what": "90-day results at the restoration marketing agency, with the client's OK",
            "owner": "Operator"
          },
          {
            "what": "2027 survey figure on typical show rate",
            "owner": "Survey"
          }
        ],
        "flags": [
          "Calculated, not quoted. The meeting math in 'Is this a lead problem or a sales problem?'. At a 15% close rate, 10 new clients a month takes about 67 held meetings, at 35% about 29, so recovering the old close rate cuts the meeting load by more than half. Kept from the draft. Needs Matt's OK.",
          "Calculated, not quoted. $4,000 to $10,000 a month for 20 to 40 hours (key numbers) is a monthly range derived from the $200 to $250 hourly rate. Kept from the draft, and G1 shows the same range. Needs Matt's OK.",
          "Data conflict, needs Matt. Every Content Bank piece says 134 of 278 booked appointments showed, a 52% show rate, but 134 of 278 is 48%. 52% is the no-show share. This post now says '134 showed, about half' in the key numbers, the measuring section and the FAQ, which is true either way. Matt should confirm the counts or the rate before 52% runs anywhere. bank-jan post 10 and several LinkedIn posts repeat it.",
          "Decision, not a calculation. 'Should I hire a full-time VP of Sales or go fractional?' keeps the draft's unattributed lesson that one client placed at 20 hours a month for $3,000 did not hit target in any month. The overview lists this lesson as a pending decision for posts 9, 10 and 12 and the Jan 28 post, not post 1, so Matt should confirm it here too."
        ]
      },
      {
        "slug": "fractional-cro-vs-full-time-cro",
        "kind": "new",
        "kindL": "Comparison",
        "template": "comparison",
        "fn": "sales",
        "cat": "sales_leadership",
        "need": "sales_motion",
        "persona": "P2",
        "q": "Fractional CRO or full-time CRO at $30M?",
        "metaTitle": "Fractional CRO vs Full-Time CRO at $30M",
        "metaDescription": "Fractional CRO vs full time at $30M. A full-time CRO can run up to about $800K all in. An embedded fractional CRO ran $23,200 a month in 2026.",
        "term": "fractional cro vs full time",
        "prompt": "Should a $30M company hire a fractional CRO or a full-time CRO?",
        "publish": "2026-11-30",
        "updated": "2026-10-11",
        "base": "Content Bank Post 5 (bank-dec.md)",
        "words": 1576,
        "opsQ": "CRO",
        "bp": "cro",
        "stat": {
          "v": "[[cost:cro.monthly]]",
          "l": "For an embedded fractional CRO, 50 hours"
        },
        "related": [
          "interim-vs-fractional-vs-full-time-sales-leader",
          "fractional-vp-of-sales-cost"
        ],
        "replaces": [],
        "answer": "At $30M with stalled growth, start fractional and hire a full-time CRO once the system works. In one 2026 engagement, an embedded fractional CRO cost [[cost:cro.monthly]] against a full-time benchmark of up to $800K.",
        "keys": [
          {
            "k": "Embedded fractional CRO at a ~$55M company",
            "v": "[[cost:cro.monthly]], [[cost:cro.hours]]",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Revenue maturity assessment before the CRO seat",
            "v": "[[cost:sales-assessment.fixed]], for 45 days",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Full-time CRO benchmark the same client used",
            "v": "Up to about $800K all in",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Average total VP of Sales compensation and tenure",
            "v": "[[cost:vp-sales.fullTime|bare]], about 19 months in seat",
            "src": "Glassdoor 2026 via Stealth Agents, secondary source",
            "url": "https://stealthagents.com/research/cost-of-hiring-a-vp-of-sales-2026"
          },
          {
            "k": "Cost of replacing a sales leader",
            "v": "[[cost:vp-sales.replace]], with 3+ months of ramp",
            "src": "Skaled",
            "url": "https://skaled.com/services/fractional-vp-of-sales/"
          }
        ],
        "sections": [
          {
            "id": "side-by-side",
            "h": "How does a fractional CRO compare with a full-time CRO?",
            "blocks": [
              {
                "p": "They differ most on cost, commitment and what a wrong hire costs you. The fractional cost comes from our 2026 engagement at a ~$55M company, and the terms are the ones every Revenue Nomad engagement uses. The full-time column uses that client's benchmark, [[url:https://skaled.com/services/fractional-vp-of-sales/|Skaled]] on replacement cost and ramp, and [[url:https://stealthagents.com/research/cost-of-hiring-a-vp-of-sales-2026|a secondary source citing Glassdoor]] on tenure."
              },
              {
                "table": {
                  "head": [
                    "",
                    "Fractional CRO",
                    "Full-time CRO"
                  ],
                  "rows": [
                    [
                      "Cost",
                      "$23,200 a month for 50 hours, after a 45-day assessment at $27,500",
                      "Up to about $800K all in, the same client's benchmark"
                    ],
                    [
                      "Time to start",
                      "A role profile and 2 to 3 vetted operators, often within 48 hours. You meet them in week 1 to 2, then sign",
                      "A search, then 3+ months of ramp before the new hire is productive"
                    ],
                    [
                      "Commitment",
                      "A contract with a 3 to 4 month initial term, then month-to-month with 30 days notice. You can swap the operator",
                      "A full-time salary. Average VP of Sales tenure is about 19 months, and replacing a sales leader can cost up to 1.5x salary"
                    ],
                    [
                      "Who owns results",
                      "One named operator, on a defined hour block and a weekly cadence",
                      "The CRO you hire"
                    ],
                    [
                      "Best fit",
                      "Growth has stalled and you do not yet know what is broken",
                      "The system works and the job is running it at scale"
                    ]
                  ]
                }
              }
            ]
          },
          {
            "id": "need-a-cro",
            "h": "When does a $30M company actually need a CRO?",
            "blocks": [
              {
                "p": "You need a CRO when the problem crosses department lines. If sales, marketing, compensation and the CRM all contribute to the miss, a VP of Sales cannot fix it alone."
              },
              {
                "p": "The trigger we hear on discovery calls is rarely an empty seat. More often a CEO is carrying the revenue number personally while the system underneath it is broken. Reps wait for leads. Marketing reports on volume nobody trusts. Comp plans pay for activity that does not close. The CRM cannot show the bridge from the bookings goal to pipeline."
              },
              {
                "p": "One person has to own the number and every system that feeds it. That is [[link:blueprint.cro|the CRO job]]. The open question is whether that person needs to be full time on day one."
              }
            ]
          },
          {
            "id": "full-time-cost",
            "h": "What does a full-time CRO really cost at this size?",
            "blocks": [
              {
                "p": "More than the salary line suggests. One client we worked with in 2026 benchmarked a full-time CRO at up to about $800K all in."
              },
              {
                "p": "Public data points the same way. Average total VP of Sales compensation sits around $334K, and average VP of Sales tenure is about 19 months, according to [[url:https://stealthagents.com/research/cost-of-hiring-a-vp-of-sales-2026|a secondary source citing Glassdoor]]. A CRO costs more than a VP."
              },
              {
                "p": "Then add the cost of getting it wrong. [[url:https://skaled.com/services/fractional-vp-of-sales/|Skaled]] puts the cost of replacing a sales leader at up to 1.5x salary, with 3+ months of ramp before the new hire is productive. If you hire a full-time CRO before you know what is broken, you are betting $800K and a year of runway on a guess."
              }
            ]
          },
          {
            "id": "fractional-cost",
            "h": "What does a fractional CRO cost, and what do you get for it?",
            "blocks": [
              {
                "p": "In our 2026 engagements, an embedded fractional CRO ran 50 hours a month at $23,200. Over 12 months that is $278,400."
              },
              {
                "p": "That client also paid $27,500 for a 45-day revenue maturity assessment before the CRO seat started. The first-year total comes to about $305,900. That is well under half of the $800K full-time benchmark they had in mind."
              },
              {
                "p": "For that money the client got two things in sequence. First, a diagnosis across six pillars, which were people, process, playbooks, compensation, CRM and goals. Second, the same operator embedded to run the fixes the diagnosis found."
              },
              {
                "p": "The 50 hours matter. We have seen thin scopes fail. One 2026 client placed at 20 hours a month for $3,000 did not hit targets in any month. A CRO seat at a company with $40M or more in recurring revenue needs enough hours to sit in pipeline reviews, coach leaders and rebuild comp, not just advise."
              },
              {
                "p": "Read more about the seat on our [[link:hire-fractional-sales-vp|fractional sales leadership page]][[gap:fractional CRO page URL|Rapid Neuron]]."
              }
            ]
          },
          {
            "id": "deck-or-fix",
            "h": "How do you avoid paying for a deck instead of a fix?",
            "blocks": [
              {
                "p": "Insist that the person who diagnoses is the person who executes. Clients tell us they want a diagnosis that turns into execution. They do not want a deck."
              },
              {
                "p": "A large consultancy quoted one of our 2026 clients about $230K for a 6-week assessment. That buys you findings. It does not buy you someone in your Monday pipeline review in month 4."
              },
              {
                "p": "Three things keep a fractional CRO accountable."
              },
              {
                "ol": [
                  "A 30/60/90-day plan before the retainer starts, with named outcomes.",
                  "A defined hour block and a weekly cadence. \"Fractional rate, full-time availability\" is the most common expectation mismatch we see.",
                  "One named owner. The operator, not a firm, is on the hook."
                ]
              },
              {
                "p": "Every Revenue Nomad engagement has a contract. You pay a monthly retainer billed upfront for a set number of hours. The initial term is 3 to 4 months, then month-to-month with 30 days notice. If the fit is wrong, you can swap the operator."
              }
            ]
          },
          {
            "id": "when-full-time",
            "h": "When should a fractional CRO become a full-time hire?",
            "blocks": [
              {
                "p": "Once the system works and the job becomes running it, not building it. By then you know exactly what kind of CRO you need."
              },
              {
                "p": "A fractional CRO at month 6 can write the full-time job description with real data. They know the comp plan, the pipeline math and the leadership gaps. Some clients convert the operator. The full-time conversion fee through Revenue Nomad is 20% of annual salary. On a $300K base that is $60,000, a fraction of a bad hire at 1.5x salary."
              }
            ]
          },
          {
            "id": "real-company",
            "h": "What this looked like at a real company",
            "blocks": [
              {
                "p": "A ~$55M media and marketing services company, 40 years in business, with about $40M in recurring revenue. Sales was its weakest division."
              },
              {
                "p": "The symptoms were specific. Reps waited for appointments instead of prospecting. Comp was about 85% base and 15% commission, with some reps on bases near $200K. The CRM had been built as a customer-service database, not a pipeline system. Product understanding across the team was estimated at 35 to 40%. Training had stopped when times were good. Most clients bought 1 of 5 products at a $12K a year entry point, against up to $60K for full adoption. Between 20 and 30% of cancelled clients were judged recoverable."
              },
              {
                "p": "The CEO looked at a full-time CRO at up to about $800K. Instead the company ran a 45-day assessment across six pillars at $27,500, then embedded a fractional CRO at 50 hours a month for $23,200. Comp is moving toward 50/50."
              },
              {
                "p": "The CEO gave one caution we now pass on to every operator. Listen before pushing an ROI-only view, and understand what makes the product different."
              },
              {
                "p": "The plan expects meaningful progress by month 3 and traction by month 6. We will report what moved once there is something to report[[gap:engagement start date and month 3 results|Matt]]."
              },
              {
                "quote": "[[gap:quote from the operator on going from the 45-day assessment to running the fix, with permission|Operator]]"
              }
            ]
          },
          {
            "id": "not-right",
            "h": "When this is not the right move",
            "blocks": [
              {
                "p": "Skip the fractional CRO if your problem lives only inside the sales team. If marketing, comp and CRM are sound and reps simply need coaching and process, a fractional VP of Sales at 20 to 40 hours a month costs less and fits better. See [[link:guide.fractional-vp-of-sales-cost|what a fractional VP of Sales costs]]."
              },
              {
                "p": "Skip it if you already know exactly what is broken and need a full-time leader to run a working system at scale. Hire full time, and compare the options in [[link:guide.interim-vs-fractional-vs-full-time-sales-leader|interim, fractional or full-time sales leader]]."
              },
              {
                "p": "Skip it if your leadership team will not give an outside operator real authority. A CRO who cannot stand up to incumbent leaders fails, fractional or not. Settle decision rights first."
              }
            ]
          }
        ],
        "faq": [
          {
            "q": "How many hours does a fractional CRO need at a $30M company?",
            "a": "Plan for about 50 hours a month if the operator is embedded and running fixes. Thinner scopes fail. Match hours to the job."
          },
          {
            "q": "Is an assessment required before a fractional CRO starts?",
            "a": "No, but it helps when the CEO cannot say which system is broken. Our 2026 example used 45 days at $27,500."
          },
          {
            "q": "Can I convert a fractional CRO to full time?",
            "a": "Yes. The conversion fee through Revenue Nomad is 20% of annual salary."
          },
          {
            "q": "What if the operator is the wrong fit?",
            "a": "You can swap the operator. After the 3 to 4 month initial term the engagement runs month-to-month with 30 days notice."
          }
        ],
        "talk": "If growth has stalled and you are weighing a CRO, start with the [[link:talk.sales_motion|Talk to us form]]. Four short questions, and name and email are the only required fields. Often within 48 hours you get a role profile and 2 to 3 vetted operators who have done this job at your stage, and you meet each one before you sign anything.",
        "gaps": [
          {
            "what": "reviewing operator name and sign-off (shown in the byline, not in the text)",
            "owner": "Matt"
          },
          {
            "what": "final Talk to us URL, ships Oct 30 (the post links talk.sales_motion in the prototype)",
            "owner": "Rapid Neuron"
          },
          {
            "what": "fractional CRO page URL (the post links hire-fractional-sales-vp until it exists)",
            "owner": "Rapid Neuron"
          },
          {
            "what": "engagement start date and month 3 results at the ~$55M media company",
            "owner": "Matt"
          },
          {
            "what": "quote from the operator on going from the 45-day assessment to running the fix, with permission",
            "owner": "Operator"
          }
        ],
        "flags": [
          "Calculated, not quoted. $278,400 a year, 12 months of the $23,200 retainer, in 'What does a fractional CRO cost, and what do you get for it?'. Kept from the draft. Needs Matt's OK.",
          "Calculated, not quoted. About $305,900 in year one, the $27,500 assessment plus 12 months at $23,200, and the line that this is well under half of the $800K benchmark, in the same section. Kept from the draft, with 'was' changed to 'comes to' because the engagement has not run a year. Needs Matt's OK.",
          "Calculated, not quoted. A $60,000 conversion fee on an assumed $300K base (20% of annual salary), set against a bad hire at 1.5x salary, in 'When should a fractional CRO become a full-time hire?'. The draft computed a range from the older fee, so only the 20% figure stays. Needs Matt's OK.",
          "Decision, not a calculation. 'What does a fractional CRO cost' keeps the draft's unattributed lesson that one 2026 client placed at 20 hours a month for $3,000 did not hit targets in any month. The overview lists this lesson as a pending decision for posts 9, 10 and 12 and the Jan 28 post, not post 5, so Matt should confirm it here too."
        ]
      },
      {
        "slug": "revops-vs-sales-ops",
        "kind": "rewrite",
        "kindL": "Comparison",
        "template": "comparison",
        "fn": "revops",
        "cat": "revenue_operations",
        "need": "systems",
        "persona": "P3",
        "q": "RevOps vs sales ops, which one do we need?",
        "metaTitle": "RevOps vs Sales Ops, the Difference and Which You Need",
        "metaDescription": "RevOps vs sales ops in plain words. Scope, reporting line, cost and time to start side by side, with real 2026 rates and when you need neither.",
        "term": "revops vs sales ops",
        "prompt": "What is the difference between RevOps and sales ops, and which one does a $25M to $100M SaaS company need?",
        "publish": null,
        "updated": "2026-10-11",
        "base": "No draft exists. The playbook's comparison rebuild of /post/fractional-revenue-ops-vs-sales-ops-scope-differences, which also absorbs the near-duplicate /post/revops-vs-sales-ops-how-each-impacts-pipeline-conversion-and-retention",
        "words": 1672,
        "opsQ": "RevOps",
        "stat": {
          "v": "[[cost:revops-retainer.hourly]]",
          "l": "For execution-level RevOps help"
        },
        "related": [
          "fractional-revops-consultant",
          "how-to-fix-sales-forecast-accuracy"
        ],
        "replaces": [
          {
            "url": "/post/fractional-revenue-ops-vs-sales-ops-scope-differences",
            "title": "Fractional Revenue Ops vs Sales Ops (Scope & Differences)",
            "clicks": 0,
            "impressions": 518,
            "position": 14,
            "action": "rebuild"
          },
          {
            "url": "/post/revops-vs-sales-ops-how-each-impacts-pipeline-conversion-and-retention",
            "title": "RevOps vs Sales Ops: How Each Impacts Pipeline, Conversion, and Retention",
            "clicks": 5,
            "impressions": 4744,
            "position": 8.3,
            "action": "merge"
          }
        ],
        "answer": "Pick sales ops when leaders trust the numbers and sales needs cleaner tools. Pick RevOps when leaders cannot agree on them. At $25M to $100M SaaS, start RevOps fractional and hire once scope is proven.",
        "keys": [
          {
            "k": "Execution-level RevOps help",
            "v": "[[cost:revops-retainer.hourly]], [[cost:revops-retainer.hours]]",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Fractional RevOps assessment",
            "v": "[[cost:revops-assessment.fixed]], about 40 hours over 60 days",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Senior revenue architect, enterprise SaaS",
            "v": "[[cost:revops-architect.monthly]], up to 85 hours a month",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Jobs often packed into one RevOps retainer",
            "v": "3, CRM admin, revenue leadership and pipeline specialist work",
            "src": "Revenue Nomad 2026 RevOps searches",
            "url": ""
          }
        ],
        "sections": [
          {
            "id": "side-by-side",
            "h": "How do RevOps and sales ops compare side by side?",
            "blocks": [
              {
                "p": "Sales ops serves one team. RevOps owns the revenue system across marketing, sales and customer success. Costs are from Revenue Nomad's 2026 engagements."
              },
              {
                "table": {
                  "head": [
                    "",
                    "Sales ops",
                    "RevOps"
                  ],
                  "rows": [
                    [
                      "Scope",
                      "The sales team. CRM fields, workflows, reports and stage hygiene",
                      "Marketing, sales and customer success, run as one system"
                    ],
                    [
                      "Reports to",
                      "The head of sales",
                      "Whoever owns the number and the budget, the CFO in one 2026 engagement"
                    ],
                    [
                      "Owns",
                      "Clean data, working reports and tools reps actually use",
                      "The bridge from bookings goal to pipeline, the forecast method, the KPI framework and shared definitions"
                    ],
                    [
                      "Cost",
                      "$150 to $175 an hour for execution-level help, 40 to 80 hours a month",
                      "$6,000 to $7,500 for an assessment. $12,000 to $15,000 a month for a hands-on director. $27,000 a month for a senior revenue architect"
                    ],
                    [
                      "Time to start",
                      "Shortlist often within 48 hours, then work on the build list you already have",
                      "Shortlist often within 48 hours, a point of view by day 14, visible impact around day 90"
                    ],
                    [
                      "Best fit",
                      "Leadership trusts the numbers, and reps need cleaner data and tools they use",
                      "Leadership cannot agree on the numbers, or RevOps has to be built from zero"
                    ]
                  ]
                }
              },
              {
                "p": "Rates by seat are on the [[link:fractional-cost|cost hub]]. Network-wide 2027 rates arrive with the [[link:report|State of Fractional GTM report]][[gap:2027 survey figure on median fractional RevOps rate|Survey]]."
              }
            ]
          },
          {
            "id": "definitions",
            "h": "What is sales ops, and what is RevOps, in plain words?",
            "blocks": [
              {
                "p": "Sales ops makes the sales team's system work. RevOps decides what the whole revenue team measures and makes those numbers add up to the plan."
              },
              {
                "p": "**Sales ops** keeps CRM fields, workflows and reports clean, keeps deal stages honest and handles the sales team's requests."
              },
              {
                "p": "**RevOps** decides what gets measured, sets the definitions every team reports on, owns the forecast method and drives change across marketing, sales and customer success. Its first question is how much pipeline you need to hit the bookings goal, created when, at what conversion rate and from which source."
              },
              {
                "p": "The line between them is the handoff. If marketing counts MQLs and sales counts bookings, the conversion between them has no owner, which is where most forecasts break. Many companies already have a part-time RevOps resource doing sales ops work, building dashboards with no mandate to change how the team works."
              }
            ]
          },
          {
            "id": "pipeline-conversion-retention",
            "h": "How does each one affect pipeline, conversion and retention?",
            "blocks": [
              {
                "p": "Sales ops keeps the pipeline readable. RevOps sizes it, fixes conversion between teams and carries the system past the signed deal."
              },
              {
                "ul": [
                  "**Pipeline.** Sales ops keeps stages and fields clean, so the report is accurate. RevOps builds the bridge from the bookings goal back to required pipeline, then right-sizes it, separating real deals from hope.",
                  "**Conversion.** Sales ops can report conversion inside sales. RevOps fixes how deals enter each stage. A run of \"no decision\" losses means deals were never qualified, and they pad coverage until the quarter ends.",
                  "**Retention.** Sales ops work mostly stops at the signed deal. RevOps carries the same definitions into customer success, which matters when expansion carries more of the number. One enterprise billing software company is building a ~$50K wedge offer to land and expand, against a historic entry deal near $500K, which changes its pipeline math.[[gap:retention or expansion result from a RevOps engagement, with the client's OK|Matt]]"
                ]
              },
              {
                "p": "More in [[link:guide.how-to-fix-sales-forecast-accuracy|what a forecast diagnosis finds]]."
              }
            ]
          },
          {
            "id": "which-one",
            "h": "When do you need sales ops, and when do you need RevOps?",
            "blocks": [
              {
                "p": "Sales ops is enough when the forecast holds up and the gaps sit inside sales. RevOps is the call when the numbers themselves are in dispute, at any revenue size."
              },
              {
                "p": "**Sales ops is enough** in two cases."
              },
              {
                "ul": [
                  "The build list is basic and clear, such as deal stages, win-probability benchmarks for each stage, dashboards leaders actually open and a CRM taxonomy everyone reads the same way.",
                  "All you need is CRM admin work. Hire an admin and keep leadership rates for leadership work."
                ]
              },
              {
                "p": "**You need RevOps** when nobody can show the bridge from bookings goal to pipeline, the forecast rides on a few large deals or the function has to be built from zero. [[link:guide.fractional-revops-consultant|When a $25M SaaS company needs RevOps]] walks through every sign."
              },
              {
                "p": "If you are a CRO, VP Sales or CFO holding a RevOps job description, sort each line into three buckets, CRM admin, revenue leadership and pipeline specialist work. A list mostly in the first bucket is sales ops. Real weight in the second is RevOps. If all three are full, you are hiring more than one role."
              }
            ]
          },
          {
            "id": "neither",
            "h": "When do you need neither?",
            "blocks": [
              {
                "p": "When the forecast is fine and the real problem is rep execution. A [[link:hire-fractional-sales-vp|fractional sales leader]] will get you further than any ops hire."
              },
              {
                "ul": [
                  "**One rep or one manager is the problem.** Send it to sales leadership, because no ops hire will fix it.",
                  "**Nobody will act on the findings.** Without an executive who owns the roadmap, an assessment turns into a report nobody reads. Name that person first."
                ]
              }
            ]
          },
          {
            "id": "fractional-full-time-agency",
            "h": "Should RevOps be fractional, full-time or an agency?",
            "blocks": [
              {
                "p": "Fractional while the work is diagnosis and design, full-time once the system is defined and needs running every day. [[link:guide.fractional-revops-consultant|Fractional RevOps consultant or full-time hire]] covers that choice in detail."
              },
              {
                "p": "An agency or a large consultancy fits when the deliverable is defined and your own team will run it. The catch is who stays for the fix. One enterprise SaaS client chose a fractional revenue architect over a large consultancy's quote of about $230K for a 6-week assessment, so the person who finds the problem also builds the fix."
              },
              {
                "p": "Company size does not decide it. Workforce Software was at about $400M ARR when its President brought in fractional help to build RevOps from zero. Engagement types are on the [[link:fractional-revops|fractional RevOps page]][[gap:what Workforce Software built and a result, with sign-off|Matt]]."
              }
            ]
          },
          {
            "id": "what-we-see",
            "h": "What does Revenue Nomad see across its RevOps engagements?",
            "blocks": [
              {
                "p": "The lesson we see most often in RevOps searches is about scope. One retainer works only if one person can truly cover CRM admin, revenue leadership and pipeline specialist work, and that person is rare."
              },
              {
                "p": "More often the client pays a senior rate for admin work, or gets an admin trying to run the forecast. A $27,000 a month revenue architect should not spend hours on picklists, and a $150 an hour admin is the wrong person to redesign the forecast."
              },
              {
                "p": "So we split the scope before we source anyone. A transactional SaaS company with 50 to 100 sellers got a fixed-fee assessment, about 40 hours over 60 days, with a red, yellow and green scorecard, specs and a roadmap its internal CRM admins could run[[gap:revenue band for the transactional SaaS company|Matt]]."
              },
              {
                "p": "Every RevOps operator is scored on CORE, Communication, Ownership, Results Focus and Expertise. Ownership means they own the forecast as well as the dashboard. We place only dedicated fractional operators, so anyone holding a full-time job is excluded. Browse [[link:browse.revenue_operations|RevOps operators]] from our network of [[net]]."
              }
            ]
          },
          {
            "id": "real-company",
            "h": "What this looked like at a real company",
            "blocks": [
              {
                "p": "An enterprise billing software company already had reporting[[gap:revenue band for the enterprise billing software company|Matt]]. A part-time RevOps resource built dashboards, but nothing changed because of them."
              },
              {
                "p": "The symptoms crossed teams. Pipeline was flat, meeting conversion hit a low the CEO had not seen before, and \"no decision\" led the loss reasons. Measurement stopped at MQLs, and nobody could show how pipeline added up to a forecast that needed 3 to 4 deals of about $1M each."
              },
              {
                "p": "The CEO weighed a full-time hire, a fractional operator and a large consultancy that quoted about $230K for 6 weeks. The company chose a fractional lead revenue architect at about 2.5 days a week for $27,000 a month flat, reporting to the CFO. With the CRO and CMO in seat 6+ years, that line lets an outside operator question pipeline and MQL assumptions without reporting to the people who set them."
              },
              {
                "p": "The plan is a 30-day diagnosis with a point of view by day 14, then a 60-day deploy of a KPI framework, a credible forecast, pipeline coverage targets and a customer-journey redesign. It begins October 19, 2026, so nothing is measured yet. Success will be judged on forecast accuracy, pipeline coverage, meeting-to-opportunity conversion and how many losses end in \"no decision.\"[[gap:day-90 result at the enterprise billing software company, with the client's OK|Operator]]"
              },
              {
                "quote": "[[gap:quote from the operator on where sales ops work ends and RevOps work starts, with permission|Operator]]"
              }
            ]
          }
        ],
        "faq": [
          {
            "q": "Is RevOps just sales ops with a bigger title?",
            "a": "No. Sales ops serves the sales team. RevOps owns the revenue system across marketing, sales and customer success, including the forecast method and the bridge from bookings goal to pipeline."
          },
          {
            "q": "Will a fractional RevOps leader replace our sales ops admin?",
            "a": "No. The operator sets the system and the priorities. Your admins keep building against a roadmap."
          },
          {
            "q": "How is fractional RevOps billed?",
            "a": "Every engagement runs on a signed contract. Assessments and projects are fixed fees. Ongoing work is a monthly retainer billed upfront for a set block of hours, with a 3 to 4 month initial term, then month-to-month with 30 days notice. You pay the operator's rate and nothing more."
          },
          {
            "q": "Can we hire the operator full time later?",
            "a": "Yes. The conversion fee is 20% of annual salary. You can also swap the operator if the fit is wrong."
          }
        ],
        "talk": "Not sure which one you have? [[link:talk.systems|Tell us where your revenue system breaks]] in four short questions, what you need help with, how big the business is today, when you need someone to start and where to reply. Only name and email are required. We reply with a role profile and 2 to 3 vetted RevOps operators, often within 48 hours, and you meet them before you sign.",
        "gaps": [
          {
            "what": "reviewing operator name and sign-off (shown in the byline, not in the text)",
            "owner": "Matt"
          },
          {
            "what": "final Talk to us URL, ships Oct 30 (the post links talk.systems in the prototype)",
            "owner": "Rapid Neuron"
          },
          {
            "what": "2027 survey figure on median fractional RevOps rate",
            "owner": "Survey"
          },
          {
            "what": "retention or expansion result from a RevOps engagement, with the client's OK",
            "owner": "Matt"
          },
          {
            "what": "what Workforce Software built and a result, with sign-off",
            "owner": "Matt"
          },
          {
            "what": "revenue band for the enterprise billing software company",
            "owner": "Matt"
          },
          {
            "what": "revenue band for the transactional SaaS company (50 to 100 sellers)",
            "owner": "Matt"
          },
          {
            "what": "day-90 result at the enterprise billing software company, with the client's OK",
            "owner": "Operator"
          },
          {
            "what": "quote from the operator on where sales ops work ends and RevOps work starts, with permission",
            "owner": "Operator"
          },
          {
            "what": "301 redirects into this post from /post/fractional-revenue-ops-vs-sales-ops-scope-differences and /post/revops-vs-sales-ops-how-each-impacts-pipeline-conversion-and-retention",
            "owner": "Rapid Neuron"
          }
        ],
        "flags": [
          "Decision. No source prices sales ops. The table's sales ops cost cell and the second key number use the execution-level RevOps rate, $150 to $175 an hour for 40 to 80 hours a month (site-pages.md G2 and G4, bank-nov Post 4, bank-dec Post 7, bank-jan Post 11). The closest support is Post 4's line about a $150 an hour admin. Matt should confirm that sales ops-level work bills at that rate, or give a sales ops rate.",
          "Decision. No source defines sales ops. Everything the page says about sales ops is general knowledge mapped onto the sources' CRM admin and pipeline specialist work. That covers the plain-words definition, the table's sales ops cells (scope, reports to the head of sales, owns, time to start, best fit), the verdict's sales ops sentence, 'sales ops is enough when the forecast holds up and the gaps sit inside sales', 'sales ops can report conversion inside sales', the line that sales ops work mostly stops at the signed deal, the bucket test's reading (a list mostly in the CRM admin bucket is sales ops, real weight in revenue leadership is RevOps) and the FAQ that says 'sales ops admin' where G2 says 'RevOps admin'. Matt or the reviewing operator should confirm them.",
          "Decision. No source says when an agency or a large consultancy is the right pick. 'An agency or a large consultancy fits when the deliverable is defined and your own team will run it' is judgment, written because the spec asks the page to cover agencies. Sources only show clients comparing against a RevOps agency (inbound-plan P3) and the $230K consultancy quote. Matt should confirm or rewrite it."
        ]
      },
      {
        "slug": "fractional-revops-consultant",
        "kind": "new",
        "kindL": "When to hire",
        "template": "answer",
        "fn": "revops",
        "cat": "revenue_operations",
        "need": "systems",
        "persona": "P3",
        "q": "When does a $25M SaaS company need RevOps?",
        "metaTitle": "Fractional RevOps Consultant or Full-Time Hire at $25M?",
        "metaDescription": "When a $25M to $100M SaaS company needs RevOps, what a fractional RevOps consultant costs, and when a full-time hire is the better call. Real 2026 rates.",
        "term": "fractional revops consultant",
        "prompt": "When does a $25M SaaS company need RevOps, and should it be fractional?",
        "publish": "2026-11-23",
        "updated": "2026-10-11",
        "base": "Content Bank Post 4 (bank-nov.md). Its working title runs past 65 characters, so the H1 is shortened and the answer still covers whether it should be fractional",
        "words": 1261,
        "opsQ": "RevOps",
        "stat": {
          "v": "[[cost:revops-assessment.fixed]]",
          "l": "For a 60-day RevOps assessment"
        },
        "related": [
          "revops-vs-sales-ops",
          "how-to-fix-sales-forecast-accuracy"
        ],
        "replaces": [],
        "answer": "A $25M SaaS company needs RevOps when nobody can show the math from bookings goal to pipeline, or the forecast leans on a few large deals. Start fractional with a fixed-fee assessment.",
        "keys": [
          {
            "k": "Fixed-fee fractional RevOps assessment",
            "v": "[[cost:revops-assessment.fixed]], about 40 hours over 60 days",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Senior fractional revenue architect at an enterprise SaaS company",
            "v": "[[cost:revops-architect.monthly]], up to 85 hours a month, about 2.5 days a week",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Large consultancy quote to the same client",
            "v": "About $230K for a 6-week assessment",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Hands-on director-level fractional RevOps",
            "v": "[[cost:revops-director.monthly]], about 2 days a week",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          }
        ],
        "sections": [
          {
            "id": "signs",
            "h": "What are the signs a $25M SaaS company needs RevOps?",
            "blocks": [
              {
                "p": "You need RevOps when leadership cannot agree on the numbers. Revenue size alone is not the trigger."
              },
              {
                "p": "Look for these signs."
              },
              {
                "ul": [
                  "**Nobody can show the bridge from bookings goal to pipeline.** The board asks how much pipeline you need and the answer changes by who you ask.",
                  "**The forecast leans on a few large deals.** One slip and the quarter is gone.",
                  "**\"No decision\" is the most common loss reason.** Deals stall without a clear next step.",
                  "**Measurement stops at MQLs.** Marketing reports volume, sales reports bookings, and nobody owns the middle.",
                  "**A part-time reporting resource builds dashboards but drives no change.**"
                ]
              },
              {
                "p": "That list comes almost word for word from an enterprise billing software company we work with. Pipeline was flat. Meeting conversion was the lowest the CEO had seen. The plan needed 3 to 4 deals in the $1M class plus singles and doubles. Nobody could show how the pipeline added up to that."
              }
            ]
          },
          {
            "id": "crm-admin",
            "h": "Is RevOps just CRM administration?",
            "blocks": [
              {
                "p": "No. CRM admin, revenue leadership and pipeline work are three different jobs. Know which one you are hiring for. [[link:guide.revops-vs-sales-ops|RevOps vs sales ops]] shows where each one sits."
              },
              {
                "p": "This is the lesson we see most often in RevOps searches."
              },
              {
                "ul": [
                  "**CRM admin** keeps fields, workflows and reports clean.",
                  "**Revenue leadership** sets the KPI framework, owns the forecast method and decides what gets measured.",
                  "**Pipeline specialist work** fixes stages, coverage and customer-journey design."
                ]
              },
              {
                "p": "One retainer only works if one person can truly cover the combined scope. Most cannot. A senior revenue architect billed at about $315 an hour should not be cleaning up picklists. A $150 an hour admin should not be redesigning your forecast."
              },
              {
                "p": "A practical split for many $25M to $100M teams is a senior fractional lead who designs the system, plus internal CRM admins who run it. One of our assessments for a 50 to 100 seller transactional SaaS company was built that way on purpose[[gap:revenue band for the transactional SaaS company|Matt]]. It produced a scorecard plus specs and a roadmap that the internal admins could run."
              }
            ]
          },
          {
            "id": "assessment",
            "h": "What does a fractional RevOps assessment deliver?",
            "blocks": [
              {
                "p": "A [[link:fractional-revops|fixed-fee assessment]] gives you a red, yellow and green scorecard, specs and a roadmap in about 60 days. It does not include the build."
              },
              {
                "p": "Across our 2026 engagements, assessments ran $6,000 to $7,500 for about 40 hours over 60 days. Follow-on execution ran $150 to $175 an hour at 40 to 80 hours a month."
              },
              {
                "p": "The billing software company took a larger path. It considered a full-time hire, a fractional lead and a big consultancy. The consultancy quoted about $230K for a 6-week assessment. The company chose a fractional lead revenue architect reporting to the CFO, at about 2.5 days a week for $27,000 a month flat."
              },
              {
                "p": "That plan runs in two phases."
              },
              {
                "ol": [
                  "**Days 1 to 30, diagnostic.** Bridge math, funnel leaks, right-size the pipeline, force-rank the fixes, and a point of view by day 14.",
                  "**Days 31 to 90, deploy.** KPI framework, a credible forecast, pipeline coverage and customer-journey redesign. Visible impact around day 90."
                ]
              },
              {
                "quote": "[[gap:quote from the operator on what a day 14 point of view includes, with permission|Operator]]"
              }
            ]
          },
          {
            "id": "fractional-or-full-time",
            "h": "Should RevOps be fractional or full-time?",
            "blocks": [
              {
                "p": "Fractional when the problem is diagnosis and design. Full-time when the system is defined and needs someone every day to run it."
              },
              {
                "p": "Fractional fits when you cannot yet write the job description. A [[link:browse.revenue_operations|senior operator]] can tell you within 30 days what you need, then help you hire it."
              },
              {
                "p": "Full-time fits when the scope is proven, the build is mapped and the budget is approved. At that point, a full-time owner will hold the system longer than any part-time operator."
              },
              {
                "p": "Size does not settle it. Workforce Software, at about $400M ARR, had its President bring in fractional help to stand up a RevOps function from zero. Fractional is not only for early stage."
              },
              {
                "p": "[[gap:2027 survey figure on median fractional RevOps hourly rate|Survey]]"
              }
            ]
          },
          {
            "id": "cost",
            "h": "What should I expect to pay?",
            "blocks": [
              {
                "p": "Expect $6,000 to $7,500 for an assessment, $12,000 to $15,000 a month for hands-on director-level work, and up to $27,000 a month for a senior revenue architect."
              },
              {
                "p": "Here is what we saw across [[link:fractional-cost|our 2026 engagements]]."
              },
              {
                "ul": [
                  "**Assessment.** $6,000 to $7,500 fixed, about 40 hours over 60 days.",
                  "**Execution after an assessment.** $150 to $175 an hour, 40 to 80 hours a month.",
                  "**Hands-on director-level RevOps.** $12,000 to $15,000 a month for 2 days a week. A fixed 30-day project covering multi-threading, decision committee, research process and training ran about $7,000 to $8,000.",
                  "**Senior revenue architect.** $27,000 a month flat for up to 85 hours, about $315 an hour."
                ]
              },
              {
                "p": "Pricing also depends on funding. Venture-backed companies accept higher rates than bootstrapped peers at the same size."
              }
            ]
          },
          {
            "id": "real-company",
            "h": "What this looked like at a real company",
            "blocks": [
              {
                "p": "**The company.** An enterprise billing software company.[[gap:ARR band for this company|Matt]]"
              },
              {
                "p": "**Before.** Flat pipeline. Meeting conversion at a low. \"No decision\" as the most common loss reason. No bridge from bookings goal to pipeline. A forecast that needed 3 to 4 $1M-class deals. MQL-centered measurement. A part-time RevOps resource doing reporting with no change. The CRO and CMO had been in seat 6+ years. The company was also building a ~$50K wedge offer to land and expand, against a historic entry point near $500K."
              },
              {
                "p": "**What the operator is doing.** A fractional lead revenue architect reporting to the CFO, about 2.5 days a week at $27,000 a month flat, running the 30-day diagnostic and 60-day deploy plan above."
              },
              {
                "p": "**What is being measured.** The engagement starts October 19, 2026. No results yet. We will track pipeline coverage against the bookings goal, [[link:guide.how-to-fix-sales-forecast-accuracy|forecast accuracy]], the share of losses to \"no decision\", and progress on the KPI framework by day 90.[[gap:90-day results|Operator]]"
              }
            ]
          },
          {
            "id": "not-right",
            "h": "When this is not the right move",
            "blocks": [
              {
                "p": "Skip fractional RevOps in three cases."
              },
              {
                "ul": [
                  "**You only need a CRM admin.** Hire an admin. Do not pay leadership rates for field cleanup.",
                  "**The system is defined and needs daily running.** Hire full-time.",
                  "**Nobody will act on the findings.** An assessment without an owner becomes a deck on a shelf. Name the executive who owns the roadmap before you start."
                ]
              }
            ]
          }
        ],
        "faq": [
          {
            "q": "How long does a fractional RevOps assessment take?",
            "a": "About 60 days and 40 hours in our 2026 engagements."
          },
          {
            "q": "Who should fractional RevOps report to?",
            "a": "Whoever owns the number. One enterprise SaaS client had its revenue architect report to the CFO."
          },
          {
            "q": "Can a fractional RevOps lead also do CRM admin?",
            "a": "Only if one person can truly cover both scopes. Usually they cannot."
          },
          {
            "q": "Is fractional RevOps only for early-stage companies?",
            "a": "No. Workforce Software brought in fractional help at about $400M ARR."
          }
        ],
        "talk": "Not sure you need RevOps yet? Describe what you are trying to fix on the [[link:talk.systems|Talk to us form]]. It is four short questions, and only your name and email are required. We answer with a role profile and 2 to 3 vetted operators matched to your stack and stage, often within 48 hours, and you meet them before you sign anything.",
        "gaps": [
          {
            "what": "reviewing operator name and sign-off (shown in the byline, not in the text)",
            "owner": "Matt"
          },
          {
            "what": "RevOps home URL on the live site, planned /operators/revops not built yet (the prototype links fractional-revops and browse.revenue_operations)",
            "owner": "Rapid Neuron"
          },
          {
            "what": "quote from the operator on what a day 14 point of view includes, with permission",
            "owner": "Operator"
          },
          {
            "what": "2027 survey figure on median fractional RevOps hourly rate",
            "owner": "Survey"
          },
          {
            "what": "ARR band for this company (the enterprise billing software company)",
            "owner": "Matt"
          },
          {
            "what": "revenue band for the transactional SaaS company (50 to 100 sellers). Added in the fact check. Anonymized clients carry a revenue band, G2 card 2 has the same gap, and the Content Bank overview lists Post 4 among the posts waiting on these bands",
            "owner": "Matt"
          },
          {
            "what": "90-day results (the enterprise billing software engagement, which starts Oct 19, 2026)",
            "owner": "Operator"
          },
          {
            "what": "final Talk to us URL, ships Oct 30 (the prototype links talk.systems)",
            "owner": "Rapid Neuron"
          }
        ],
        "flags": [
          "Calculated, not quoted. About $315 an hour is the $27,000 flat month divided by up to 85 hours. bank-linkedin says it 'works out to about $315 an hour' (the exact figure is about $318). It appears twice, as in the draft, in the picklist line and the price list, and G2 and G4 show it too. It is not on the overview's list but is the same kind of figure as the $464 CRO rate. Needs Matt's OK. If cut, the picklist line can read 'A senior revenue architect at $27,000 a month' and the price list item can end at '85 hours'."
        ]
      },
      {
        "slug": "how-to-fix-sales-forecast-accuracy",
        "kind": "new",
        "kindL": "Diagnosis",
        "template": "answer",
        "fn": "revops",
        "cat": "revenue_operations",
        "need": "systems",
        "persona": "P2 and P3",
        "q": "Why is our forecast wrong, and what does a diagnosis find?",
        "metaTitle": "How to Fix Sales Forecast Accuracy, a 30-Day Diagnosis",
        "metaDescription": "How to fix sales forecast accuracy. Most bad forecasts trace to missing bridge math, a few big deals and MQL-only metrics. What a 30-day diagnosis finds.",
        "term": "how to fix sales forecast accuracy",
        "prompt": "Why is our sales forecast wrong, and what does a 30-day RevOps diagnosis find?",
        "publish": "2026-12-14",
        "updated": "2026-10-11",
        "base": "Content Bank Post 7 (bank-dec.md)",
        "words": 1280,
        "opsQ": "forecast",
        "stat": {
          "v": "Day 14",
          "l": "Point of view due in a 30-day diagnostic"
        },
        "related": [
          "revops-vs-sales-ops",
          "fractional-revops-consultant"
        ],
        "replaces": [],
        "answer": "Your forecast is wrong because nobody can show the math from bookings goal to pipeline, it leans on a few large deals and it measures leads, not revenue. A 30-day RevOps diagnosis ranks the fixes.",
        "keys": [
          {
            "k": "Point of view due in a 30-day diagnostic",
            "v": "By day 14",
            "src": "Revenue Nomad 2026 engagement plan",
            "url": ""
          },
          {
            "k": "Fractional RevOps assessment",
            "v": "[[cost:revops-assessment.fixed]], about 40 hours over 60 days",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Senior fractional revenue architect, enterprise software",
            "v": "[[cost:revops-architect.monthly]], up to 85 hours a month, about 2.5 days a week",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Large consultancy quote to the same client",
            "v": "About $230K for a 6-week assessment",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          }
        ],
        "sections": [
          {
            "id": "why-wrong",
            "h": "Why is our forecast wrong when the team works hard?",
            "blocks": [
              {
                "p": "Effort does not fix missing math. Most bad forecasts we see share three causes. There is no bridge from goal to pipeline, the number rides on a few big deals, and the team measures leads instead of revenue."
              },
              {
                "p": "Ask your team one question. To hit next year's bookings goal, how much pipeline do we need, created when, at what conversion rate, from which source? If nobody can answer in one page, the forecast is a guess dressed up as a number."
              },
              {
                "p": "The second cause is concentration. If the plan needs 3 to 4 deals worth about $1M each, plus singles and doubles, one slipped signature moves the quarter. A forecast built that way is fragile no matter how good the reps are."
              },
              {
                "p": "The third cause is measuring the wrong thing. When marketing reports MQLs and sales reports bookings, nobody owns the conversion in between. That is where most forecasts break."
              }
            ]
          },
          {
            "id": "no-decision",
            "h": "What does \"no decision\" as the leading loss reason tell you?",
            "blocks": [
              {
                "p": "It tells you deals were never qualified. Prospects did not pick a competitor. They picked nothing."
              },
              {
                "p": "When \"no decision\" leads your loss reasons, the pipeline holds deals that should not count. Those deals inflate coverage, so the forecast looks safe until the quarter ends. A diagnosis looks at how deals enter each stage, who on the customer side has agreed to what, and how long deals sit before they die."
              },
              {
                "p": "Fixing it usually shrinks pipeline on paper first. That feels bad. It is also the first time the number is real."
              }
            ]
          },
          {
            "id": "revops-person",
            "h": "Why doesn't our RevOps person fix this already?",
            "blocks": [
              {
                "p": "Because reporting and change are different jobs. Many companies have a part-time RevOps resource who builds dashboards but has no mandate to change how the team works."
              },
              {
                "p": "We often find a CRM that was built for something else. At one ~$55M services company, the CRM had been set up as a customer-service database, not a pipeline system. No dashboard fixes that. Someone has to redesign the stages, the fields and the rules for what counts."
              },
              {
                "p": "We separate three kinds of work. CRM admin, revenue leadership and pipeline specialist work. One retainer only works if one person can truly cover all three. Most of the time the diagnosis decides which one you need first, and [[link:guide.revops-vs-sales-ops|RevOps vs sales ops]] shows how they split."
              }
            ]
          },
          {
            "id": "diagnosis",
            "h": "What happens in a 30-day RevOps diagnosis?",
            "blocks": [
              {
                "p": "The operator builds the bridge math, finds the funnel leaks, right-sizes the pipeline and force-ranks the fixes. You get a point of view by day 14, not day 30."
              },
              {
                "p": "One way to lay out those 30 days looks like this."
              },
              {
                "ul": [
                  "**Days 1 to 7.** Pull CRM data, bookings history and loss reasons. Interview sales, marketing and finance.",
                  "**Days 8 to 14.** Build the goal-to-pipeline bridge. Deliver a point of view on where the forecast breaks.",
                  "**Days 15 to 30.** Right-size pipeline coverage, test the fixes against the data and rank them by impact."
                ]
              },
              {
                "quote": "[[gap:quote from the operator on what the day 14 point of view shows about where the forecast breaks, with permission|Operator]]"
              },
              {
                "p": "A lighter version also exists. Our fixed-fee RevOps assessment runs about 40 hours over 60 days for $6,000 to $7,500. It delivers a red, yellow and green scorecard, specifications and a roadmap that internal CRM admins can run. It does not include the build. [[link:guide.fractional-revops-consultant|When a $25M SaaS company needs RevOps]] covers when to start there."
              }
            ]
          },
          {
            "id": "vs-consultancy",
            "h": "How is this different from hiring a consultancy?",
            "blocks": [
              {
                "p": "You get the same person for the diagnosis and the fix. Clients tell us they want a diagnosis that turns into execution, not a deck."
              },
              {
                "p": "A large consultancy quoted one 2026 client about $230K for a 6-week assessment. A senior fractional revenue architect cost that client $27,000 a month flat for up to 85 hours, about $315 an hour. The same operator who finds the problem then stays to build the KPI framework, the forecast and the pipeline coverage model."
              },
              {
                "p": "Execution help after an assessment ran $150 to $175 an hour, 40 to 80 hours a month, across our 2026 engagements. A hands-on director-level RevOps operator ran $12,000 to $15,000 a month for 2 days a week."
              }
            ]
          },
          {
            "id": "real-company",
            "h": "What this looked like at a real company",
            "blocks": [
              {
                "p": "An enterprise billing software company. Pipeline was flat[[gap:revenue band for the enterprise billing software company|Matt]]. Meeting conversion was the lowest the CEO had seen. The most common loss reason was \"no decision.\" Nobody could show the bridge from the bookings goal to pipeline. The forecast needed 3 to 4 $1M-class deals plus singles and doubles. Measurement centered on MQLs. A part-time RevOps resource did reporting but drove no change. The CRO and CMO had been in seat 6+ years."
              },
              {
                "p": "Historic entry deals ran about $500K. The company is developing a ~$50K wedge offer to land and expand."
              },
              {
                "p": "The CEO weighed a full-time hire, a fractional operator and a big consultancy at about $230K for 6 weeks. The company chose a [[link:blueprint.vp-revops|fractional lead revenue architect]] who reports to the CFO, about 2.5 days a week at $27,000 a month flat."
              },
              {
                "p": "The plan runs in two phases. Days 1 to 30 are the diagnostic, with a point of view by day 14. Days 31 to 90 deploy a KPI framework, a credible forecast, pipeline coverage and a customer-journey redesign. Visible impact is expected around day 90."
              },
              {
                "p": "The engagement starts October 19, 2026, so there are no results yet. We will measure forecast accuracy against actual bookings, pipeline coverage against the bridge math, meeting-to-opportunity conversion and the share of losses tagged \"no decision.\"[[gap:day-90 results at the enterprise billing software company, with the client's OK|Operator]]"
              }
            ]
          },
          {
            "id": "not-right",
            "h": "When this is not the right move",
            "blocks": [
              {
                "p": "Skip a diagnosis if you already know what is broken and only need hands to build it. Hire an [[link:fractional-revops|execution-level RevOps operator]] at an hourly rate instead."
              },
              {
                "p": "Skip it if your problem is one rep or one manager. That is a [[link:hire-fractional-sales-vp|sales leadership issue]], not a forecasting one."
              },
              {
                "p": "Skip it if nobody on your leadership team will act on the findings. A diagnosis with no owner becomes the deck you were trying to avoid. Name the executive the operator reports to first."
              }
            ]
          }
        ],
        "faq": [
          {
            "q": "How long does it take to fix forecast accuracy?",
            "a": "A point of view in about 14 days, a ranked plan by day 30 and visible impact around day 90 in our current engagement plan."
          },
          {
            "q": "What does a fractional RevOps diagnosis cost?",
            "a": "From $6,000 to $7,500 fixed for a light assessment, up to $27,000 a month for a senior revenue architect, across our 2026 engagements."
          },
          {
            "q": "Who should the RevOps operator report to?",
            "a": "Someone with authority over both sales and marketing numbers. In our enterprise example it was the CFO."
          },
          {
            "q": "Do we need new software?",
            "a": "Usually not first. Most fixes start with stage definitions, fields and the bridge math in the CRM you already have."
          }
        ],
        "talk": "If your forecast keeps missing, [[link:talk.systems|tell us where it breaks]]. The form asks four short questions and requires only your name and email. A role profile and 2 to 3 vetted RevOps operators who have run this diagnosis often follow within 48 hours, and you meet each one before you sign anything.",
        "gaps": [
          {
            "what": "reviewing operator name and sign-off (shown in the byline, not in the text)",
            "owner": "Matt"
          },
          {
            "what": "/operators/revops page URL on the live site (the prototype links fractional-revops and blueprint.vp-revops)",
            "owner": "Rapid Neuron"
          },
          {
            "what": "revenue band for the enterprise billing software company (the enterprise billing software company)",
            "owner": "Matt"
          },
          {
            "what": "final Talk to us URL, ships Oct 30 (the prototype links talk.systems)",
            "owner": "Rapid Neuron"
          },
          {
            "what": "quote from the operator on what the day 14 point of view shows about where the forecast breaks, with permission (added, the template needs one operator quote)",
            "owner": "Operator"
          },
          {
            "what": "day-90 results at the enterprise billing software company, with the client's OK (added, the real-company section needs an after)",
            "owner": "Operator"
          }
        ],
        "flags": [
          "Calculated, not quoted. About $315 an hour is the $27,000 flat month divided by up to 85 hours (bank-linkedin says it 'works out to about $315 an hour', and the exact figure is about $318). It appears once, as in the draft, in the consultancy section. Needs Matt's OK. If cut, end that sentence at '85 hours'."
        ]
      },
      {
        "slug": "how-to-hire-a-fractional-cmo",
        "kind": "new",
        "kindL": "How to hire",
        "template": "answer",
        "fn": "marketing",
        "cat": "marketing",
        "need": "pipeline",
        "persona": "P4",
        "q": "How do you vet a fractional CMO before you hire one?",
        "metaTitle": "How to Hire a Fractional CMO, a 7-Factor Scorecard",
        "metaDescription": "How to hire a fractional CMO. The weighted 7-factor scorecard, disqualifiers and interview process we use when lead costs rise and agencies go unmanaged.",
        "term": "how to hire a fractional cmo",
        "prompt": "How do I vet and hire a fractional CMO?",
        "publish": "2026-11-09",
        "updated": "2026-10-11",
        "base": "Content Bank Post 2 (bank-nov.md). It is also the merge target for the two marketing city pages and the part-time CMO hiring guide, because its URL already owns 'how to hire a fractional CMO'",
        "words": 1376,
        "opsQ": "CMO",
        "stat": {
          "v": "60%",
          "l": "Scorecard weight on demand gen, analytics and agency accountability"
        },
        "related": [
          "fractional-cmo-cost",
          "fractional-cmo-vs-agency"
        ],
        "replaces": [
          {
            "url": "/post/hiring-a-fractional-cmo-in-denver-everything-you-need-to-know-in-2025",
            "title": "Hiring a Fractional CMO in Denver: Everything You Need to Know in 2025",
            "clicks": 3,
            "impressions": 1743,
            "position": 8.5,
            "action": "city"
          },
          {
            "url": "/post/guide-to-hiring-a-fractional-head-of-marketing-in-san-diego-in-2026",
            "title": "Guide to Hiring a Fractional Head of Marketing in San Diego in 2026",
            "clicks": 0,
            "impressions": 340,
            "position": 9.8,
            "action": "city"
          },
          {
            "url": "/post/part-time-cmo-hiring-guide",
            "title": "Part Time CMO Hiring Guide",
            "clicks": 2,
            "impressions": 1648,
            "position": 19.5,
            "action": "merge"
          }
        ],
        "answer": "Vet a fractional CMO against the problem you have, not the title. Score demand gen depth, analytical rigor and agency accountability first, weight them at 60% of the decision and screen out brand-first profiles.",
        "keys": [
          {
            "k": "Share of the scorecard weight on demand gen, analytics and agency accountability",
            "v": "60%",
            "src": "Revenue Nomad 2026 fractional CMO search",
            "url": ""
          },
          {
            "k": "Scope for a fractional CMO at a PE-backed platform",
            "v": "[[cost:cmo.hourly]], [[cost:cmo.hours]]",
            "src": "Revenue Nomad 2026 fractional CMO search",
            "url": ""
          },
          {
            "k": "Operators in the Revenue Nomad network",
            "v": "[[net]], with 50+ data points tracked per operator",
            "src": "Revenue Nomad network",
            "url": ""
          }
        ],
        "sections": [
          {
            "id": "which-cmo",
            "h": "What kind of fractional CMO do I actually need?",
            "blocks": [
              {
                "p": "Most companies with rising lead costs need a demand gen operator, not a brand CMO. Decide which one before you look at a single profile."
              },
              {
                "p": "The CMO title covers two very different people. One builds brand, story and positioning. The other runs paid channels, owns cost per lead, manages agencies and ties spend to booked revenue. Both are good at their jobs. Only one fixes a lead cost problem."
              },
              {
                "p": "Signs you need the operator profile."
              },
              {
                "ul": [
                  "Cost per lead has risen for two or more quarters.",
                  "You rely on lead aggregators for a large share of volume.",
                  "You pay one or more agencies and nobody inside holds them to a number.",
                  "Marketing data exists but nobody uses it to make spend decisions."
                ]
              },
              {
                "p": "That was the situation at a PE-backed home services platform with two brands we ran a fractional CMO search for. Lead cost and lead quality were both getting worse. Agencies were not managed tightly. The data was there and sat unused. So the first factor on the scorecard, and the heaviest, was demand gen operator versus brand CMO."
              }
            ]
          },
          {
            "id": "scorecard",
            "h": "What does the seven-factor scorecard look like?",
            "blocks": [
              {
                "p": "Seven factors, weighted to the problem. Each candidate gets a score per factor, multiplied by the weight."
              },
              {
                "table": {
                  "head": [
                    "Factor",
                    "Weight",
                    "What we look for"
                  ],
                  "rows": [
                    [
                      "Demand gen operator vs brand CMO",
                      "25%",
                      "Has owned pipeline targets and paid channel budgets"
                    ],
                    [
                      "Analytical rigor",
                      "20%",
                      "Talks fluently in CPL, attribution and CAC"
                    ],
                    [
                      "Agency and aggregator accountability",
                      "15%",
                      "Has put agencies on scorecards and changed or cut them"
                    ],
                    [
                      "Funnel fluency in your vertical",
                      "15%",
                      "Knows how leads in your category become revenue"
                    ],
                    [
                      "Opinionated enough to manage brand marketers",
                      "10%",
                      "Will push back on creative that does not convert"
                    ],
                    [
                      "Sales enablement straddle, including call center",
                      "10%",
                      "Has worked the handoff from lead to sales call"
                    ],
                    [
                      "Channel diversification instinct",
                      "5%",
                      "Has a plan to reduce reliance on one source"
                    ]
                  ]
                }
              },
              {
                "p": "The weights follow the problem. A company repositioning after acquisitions would weight narrative and brand far higher. For a lead cost problem, the first three factors carry 60% of the score on purpose."
              },
              {
                "quote": "[[gap:quote from the operator on how they would score themselves on factor 1, with permission|Operator]]"
              }
            ]
          },
          {
            "id": "rule-out-and-interview",
            "h": "Who should I rule out, and how should interviews run?",
            "blocks": [
              {
                "p": "Rule out four profiles before anyone gets on a call. It saves weeks. These were the disqualifiers on the home services search."
              },
              {
                "ol": [
                  "**Brand-heavy CMOs.** Strong storytellers who have never owned a cost per lead number.",
                  "**Backgrounds that do not match the funnel.** Someone who has only run enterprise account-based programs will struggle with high-volume consumer lead flow, and the reverse is also true.",
                  "**Anyone already carrying 3 or more engagements.** At 3 or more, your agency reviews compete with someone else's board meeting.",
                  "**Any self-reported background the public record contradicts.** If the profile says they ran a $20M budget and nothing public supports it, ask. If the answer does not hold up, move on."
                ]
              },
              {
                "p": "The engagement cap matters most here. Unmanaged agencies are the problem you are hiring against. An operator spread across too many clients reproduces it."
              },
              {
                "p": "Keep the interviews to 2 to 4 weeks. Score first, meet a short list, then test with a real scenario. Here is the plan from the home services search."
              },
              {
                "ol": [
                  "**Score 7 candidates** on the weighted scorecard.",
                  "**The client picks 3** to meet.",
                  "**30 to 60 minute calls** with each finalist.",
                  "**A first-90-days scenario exercise.** Each finalist walks through what they would do in their first 90 days with the client's actual situation.",
                  "**A weekly 30-minute check-in** with the client while the search runs, so the criteria can move if the picture changes."
                ]
              },
              {
                "p": "The scenario exercise does most of the work. Ask each finalist where they would cut spend first, which agency they would review first, and what number they would report in week 4. A demand gen operator answers in numbers. A brand CMO answers in themes."
              }
            ]
          },
          {
            "id": "hours-and-budget",
            "h": "How many hours and what budget should I plan for?",
            "blocks": [
              {
                "p": "Plan for 40 to 80 hours a month. Below that, a CMO cannot manage agencies and fix data at the same time."
              },
              {
                "p": "On the home services search, candidates were at $200 to $250 an hour. [[link:guide.fractional-cmo-cost|What a fractional CMO costs]] covers the monthly budget, the other marketing seats and the terms.[[gap:2027 survey figure on median fractional CMO hourly rate|Survey]]"
              }
            ]
          },
          {
            "id": "local",
            "h": "Does a fractional CMO need to be local?",
            "blocks": [
              {
                "p": "Not on our scorecard. Location is not one of its seven factors, while funnel fluency in your vertical carries 15%. Look first for someone who knows how leads in your category become revenue, and use that lens when you [[link:browse.marketing|browse marketing operators]]."
              },
              {
                "p": "This guide replaces our separate Denver and San Diego hiring pages. The scorecard, the disqualifiers and the interviews work the same way in both cities. Every candidate is someone the client meets before signing. That is how Revenue Nomad runs every search."
              },
              {
                "p": "If any of the work needs someone in the room, such as agency reviews, agree it in the scope before you sign.[[gap:how often marketing operators work on-site with clients|Matt]][[gap:marketing operators on the bench near Denver and San Diego|Matt]]"
              }
            ]
          },
          {
            "id": "real-company",
            "h": "What this looked like at a real company",
            "blocks": [
              {
                "p": "**The company.** A PE-backed home services platform with two brands.[[gap:revenue band for this platform|Matt]]"
              },
              {
                "p": "**Before.** Lead cost and quality were getting worse. The business leaned on lead aggregators. Agencies were not managed tightly. Marketing data was underused."
              },
              {
                "p": "**What we did.** We built the weighted 7-factor scorecard above, applied the four disqualifiers, and scored 7 candidates. The plan was for the client to pick 3, hold 30 to 60 minute calls, and run a first-90-days scenario exercise, with a weekly 30-minute check-in, over 2 to 4 weeks. Scope was 40 to 80 hours a month."
              },
              {
                "p": "**What happened.** The client changed strategy before making a hire. No fractional CMO was placed on this search. The scorecard still holds for any [[link:fractional-marketing-leadership|marketing leadership]] search where lead cost is the problem."
              }
            ]
          },
          {
            "id": "not-right",
            "h": "When this is not the right move",
            "blocks": [
              {
                "p": "A fractional CMO is the wrong call in three situations."
              },
              {
                "ul": [
                  "**You need channel execution, not leadership.** If strategy is sound and you need someone to run paid search, hire a specialist or a good agency with a clear scorecard. [[link:guide.fractional-cmo-vs-agency|Fractional CMO, agency or full-time hire]] compares the options.",
                  "**The real problem is narrative.** If you are repositioning after acquisitions, you need a brand or product marketing lead. Brand strategy and sales enablement are different jobs.",
                  "**The scope is proven and funded.** If you know the plan and can fund a full-time CMO, hire one."
                ]
              },
              {
                "p": "Also agree on decision rights before you start. The person who asks for a CMO is not always the one who decides."
              }
            ]
          }
        ],
        "faq": [
          {
            "q": "How long does it take to hire a fractional CMO?",
            "a": "Our search process runs 2 to 4 weeks from scorecard to decision."
          },
          {
            "q": "How many engagements is too many for a fractional CMO?",
            "a": "We screen out anyone carrying 3 or more engagements."
          },
          {
            "q": "Should a fractional CMO manage our agencies?",
            "a": "Yes, if agency accountability is part of the problem. It is 15% of our scorecard."
          },
          {
            "q": "What does a fractional CMO cost?",
            "a": "On a recent PE-backed search, 40 to 80 hours a month at $200 to $250 an hour."
          }
        ],
        "talk": "Want candidates scored against your problem? Tell us what you are trying to fix in marketing through the [[link:talk.pipeline|Talk to us form]]. Four short questions, and only your name and email are required. Often within 48 hours we send a role profile and 2 to 3 vetted operators, and you meet each one before you sign anything.",
        "gaps": [
          {
            "what": "reviewing operator name and sign-off (shown in the byline, not in the text)",
            "owner": "Matt"
          },
          {
            "what": "final Talk to us URL, ships Oct 30 (the prototype links talk.pipeline)",
            "owner": "Rapid Neuron"
          },
          {
            "what": "quote from the operator on how they would score themselves on factor 1, with permission",
            "owner": "Operator"
          },
          {
            "what": "2027 survey figure on median fractional CMO hourly rate",
            "owner": "Survey"
          },
          {
            "what": "revenue band for this platform (the PE-backed home services platform)",
            "owner": "Matt"
          },
          {
            "what": "how often marketing operators work on-site with clients (new, local section)",
            "owner": "Matt"
          },
          {
            "what": "marketing operators on the bench near Denver and San Diego (new, local section)",
            "owner": "Matt"
          },
          {
            "what": "301 redirects into this post from /post/hiring-a-fractional-cmo-in-denver-everything-you-need-to-know-in-2025, /post/guide-to-hiring-a-fractional-head-of-marketing-in-san-diego-in-2026 and /post/part-time-cmo-hiring-guide",
            "owner": "Rapid Neuron"
          }
        ],
        "flags": [
          "Decision. The new local section (spec note) rests on one sourced fact, that location is not one of the seven scorecard factors while funnel fluency in your vertical carries 15%. It adds that the vetting runs the same way in Denver and San Diego, and advises agreeing any in-room work, such as agency reviews, in the scope. No source says whether marketing operators work on-site or how many sit near either city, so two Matt gaps hold that. Confirm the stance."
        ]
      },
      {
        "slug": "fractional-cmo-cost",
        "kind": "rewrite",
        "kindL": "Cost",
        "template": "cost",
        "fn": "marketing",
        "cat": "marketing",
        "need": "pipeline",
        "persona": "P4",
        "q": "What does a fractional CMO cost in 2026?",
        "metaTitle": "Fractional CMO Cost in 2026, Hourly Rate and Retainer",
        "metaDescription": "Fractional CMO cost from our 2026 searches. $200 to $250 an hour for 40 to 80 hours a month, plus the demand gen seat, terms and when to go full time.",
        "term": "fractional cmo cost",
        "prompt": "How much does a fractional CMO cost per hour and per month in 2026?",
        "publish": null,
        "updated": "2026-10-11",
        "base": "No draft exists. The playbook's refresh of /post/fractional-cmo-cost-in-2026-what-you-should-expect-before-hiring, the blog's strongest ranking post (average position 6.5 on 30,967 impressions). Survey data lands in December, so every 2027 survey figure is a GAP",
        "words": 1763,
        "opsQ": "CMO",
        "headline": {
          "rate": "[[cost:cmo.hourly|bare]]",
          "rateL": "An hour, quoted",
          "month": "[[cost:cmo.monthly|bare]]",
          "monthL": "A month, 40 to 80 hrs",
          "basis": "2026 CMO search, quoted rates"
        },
        "stat": {
          "v": "[[cost:cmo.hourly]]",
          "l": "Quoted in a 2026 CMO search"
        },
        "related": [
          "fractional-cmo-vs-agency",
          "how-to-hire-a-fractional-cmo"
        ],
        "replaces": [
          {
            "url": "/post/fractional-cmo-cost-in-2026-what-you-should-expect-before-hiring",
            "title": "Fractional CMO Cost in 2026 (Hourly and Monthly Rates)",
            "clicks": 16,
            "impressions": 30967,
            "position": 6.5,
            "action": "rebuild"
          }
        ],
        "answer": "[[cost:cmo.answer]]",
        "keys": [
          {
            "k": "Fractional CMO, PE-backed home services platform",
            "v": "[[cost:cmo.hourly]], [[cost:cmo.hours]], [[cost:cmo.monthly]]",
            "src": "Revenue Nomad 2026 marketing searches, quoted rates",
            "url": ""
          },
          {
            "k": "Brand and product marketing leader, launch scope",
            "v": "[[cost:marketing-launch.hourly]], [[cost:marketing-launch.hours]]",
            "src": "Revenue Nomad 2026 marketing searches, quoted rates",
            "url": ""
          },
          {
            "k": "Median fractional CMO hourly rate and monthly retainer, 2027",
            "v": "[[gap:2027 survey figure, median fractional CMO hourly rate and monthly retainer|Survey]]",
            "src": "State of Fractional GTM 2027, Revenue Nomad network",
            "url": ""
          },
          {
            "k": "Fee added to the operator's rate",
            "v": "None. Full-time conversion is 20% of annual salary",
            "src": "Revenue Nomad terms, October 2026",
            "url": ""
          }
        ],
        "sections": [
          {
            "id": "rates-by-seat",
            "h": "What does each marketing seat cost per hour and per month?",
            "blocks": [
              {
                "p": "A fractional CMO was quoted at $200 to $250 an hour for 40 to 80 hours a month in our 2026 CMO search. A brand and product marketing leader for a launch was quoted $220 to $400 an hour for 60 to 80 hours."
              },
              {
                "table": {
                  "head": [
                    "Seat or scope",
                    "Hours a month",
                    "Hourly rate",
                    "Monthly"
                  ],
                  "rows": [
                    [
                      "Fractional CMO, PE-backed home services platform",
                      "40 to 80",
                      "$200 to $250",
                      "$8,000 to $20,000"
                    ],
                    [
                      "Brand and product marketing leader, launch scope, PE-backed public-sector software company",
                      "60 to 80",
                      "$220 to $400",
                      "$13,200 to $32,000"
                    ],
                    [
                      "Demand gen operator",
                      "[[gap:demand gen operator rate and hours, from a 2026 engagement or the 2027 survey|Matt]]",
                      "",
                      ""
                    ],
                    [
                      "Head of growth or VP Marketing",
                      "[[gap:head of growth and VP Marketing rate and hours, from a 2026 engagement or the 2027 survey|Matt]]",
                      "",
                      ""
                    ]
                  ]
                }
              },
              {
                "p": "These are the rates clients were quoted. We ran marketing leadership searches in 2026 and have no closed marketing placement to report yet. Both searches in the table were PE-backed.[[gap:revenue band and current status of the public-sector software search, cleared for publishing|Matt]]"
              },
              {
                "p": "Our rates cover GTM leadership seats only. Broader published averages also take in tactical and non-GTM work, so they run lower."
              },
              {
                "p": "**Source.** Revenue Nomad 2026 marketing searches. Medians by seat from our [[link:report|State of Fractional GTM]] survey land in the [[link:rates.marketing|Rate Index for marketing]] once the survey closes, and this page updates then.[[gap:2027 Rate Index medians for marketing seats, with sample size and survey dates|Survey]]"
              }
            ]
          },
          {
            "id": "demand-gen-seat",
            "h": "What does a fractional demand gen operator cost?",
            "blocks": [
              {
                "p": "We have no 2026 engagement for a standalone demand gen operator, head of growth or VP Marketing. So we do not publish a rate for those seats yet. The closest number is the home services CMO search below. Demand gen carried the heaviest weight on its scorecard, and candidates were quoted $200 to $250 an hour."
              },
              {
                "p": "Title inflation costs real money. Pay for the problem you actually have."
              },
              {
                "ul": [
                  "**Demand gen operator.** Owns channels, campaigns, cost per lead and agency management. Right when pipeline is the constraint and you need leads that convert now.",
                  "**Head of growth.** Demand gen plus experimentation across the funnel, often into conversion and retention. Right when channels work but growth has stalled.",
                  "**VP Marketing.** Runs the marketing team, budget, plan and handoff to sales. Right when several marketers and agencies have nobody running them as one team.",
                  "**Fractional CMO.** Owns strategy, positioning, brand and the board-level plan. Right when the story is broken, or brand marketers and agencies need a senior leader."
                ]
              },
              {
                "p": "If cost per lead keeps rising, lead quality keeps falling or lead aggregators carry the volume, start with the demand gen operator. Skipping rungs is how you end up with a positioning deck and the same lead problem 90 days later. More in [[link:guide.how-to-hire-a-fractional-cmo|how to vet a fractional CMO]]."
              },
              {
                "quote": "[[gap:quote from the operator on when a company needs a demand gen operator before a CMO, with permission|Operator]]"
              }
            ]
          },
          {
            "id": "price-drivers",
            "h": "What moves the price up or down?",
            "blocks": [
              {
                "p": "Three things. The kind of job, the hours it needs and how much one retainer is asked to cover."
              },
              {
                "ul": [
                  "**Brand or demand gen.** The brand and product launch scope was quoted up to $400 an hour. The home services CMO seat, scored mainly on demand gen, was quoted up to $250.",
                  "**Hours.** A CMO seat needs 40 to 80 hours a month to manage agencies and fix data at the same time. Thin hours fail in sales too. One client who bought a sales leader at 20 hours a month for $3,000 missed target every month.",
                  "**Several jobs in one retainer.** In the software search, the repositioning pulled toward brand strategy and the sales kickoff toward enablement, two different jobs. One person can sometimes cover both. Usually one side gets shortchanged, so one retainer only works if one person can truly cover the combined scope."
                ]
              },
              {
                "p": "Check load before you compare rates. We screen fractional CMOs out if they already carry 3 or more engagements. Unmanaged agencies are the problem you are hiring against, and an operator spread across too many clients reproduces it. We also place only dedicated fractional operators. Anyone holding a full-time job is excluded."
              }
            ]
          },
          {
            "id": "how-you-pay",
            "h": "How do you pay for a fractional CMO?",
            "blocks": [
              {
                "p": "A fractional CMO is paid by monthly retainer, billed upfront for a set block of hours, under a signed contract."
              },
              {
                "ul": [
                  "**Initial term.** 3 to 4 months, then month-to-month with 30 days notice.",
                  "**Overage.** Hours are tracked and flagged before an overage happens, and you decide whether to extend.",
                  "**Fit.** If the fit is wrong, you can swap the operator.",
                  "**Fees.** No platform fee. Clients pay the operator's rate and nothing more.",
                  "**Conversion.** A later full-time hire of the operator carries a fee of 20% of annual salary."
                ]
              },
              {
                "p": "Monthly beats hourly. A fixed block with a weekly cadence sets clear expectations on both sides. Larger seats can start with a fixed-fee assessment. You get a scorecard and roadmap, then the option to keep the same operator to deliver it. Assessment prices from our sales and RevOps work are on the [[link:fractional-cost|cost hub]]."
              },
              {
                "p": "**What 90 days should buy.** A cost and quality view by channel by day 30, then agency plans and a budget mix tied to customer acquisition cost by day 90."
              }
            ]
          },
          {
            "id": "full-time",
            "h": "How does that compare with a full-time CMO?",
            "blocks": [
              {
                "p": "If nobody owns the marketing number, hire an owner for the hours the job needs. If the function already runs and needs a permanent head, go full time."
              },
              {
                "p": "We do not have a sourced full-time CMO pay figure yet, and we will not guess one. What we can compare is commitment[[gap:full-time CMO total compensation, time to hire and search fee benchmarks|Survey]]. A fractional CMO comes with a 3 to 4 month initial term, then month-to-month with 30 days notice, and you can swap the operator if the fit is wrong."
              },
              {
                "p": "Stage decides a lot of it. Ferry, a hospitality tip management platform, had no digital demand generation program when our team took its fractional GTM strategy seat in February 2025[[gap:Ferry revenue band|Matt]]. The one we built produced its first 20 inbound leads, and a 4-month initial term turned into about 18 months. A full-time CMO would have been the wrong shape at that stage. Too much cost for a function that did not exist yet.[[gap:hours and monthly cost of the Ferry seat, cleared to publish|Matt]]"
              },
              {
                "p": "The most common mismatch we see is expecting full-time availability at a fractional rate. Fix it upfront with a set hour block and a weekly cadence. More in [[link:guide.fractional-cmo-vs-agency|fractional CMO, agency or full-time hire]]."
              }
            ]
          },
          {
            "id": "real-company",
            "h": "What this looked like at a real company",
            "blocks": [
              {
                "p": "**The company.** A PE-backed home services platform that runs two brands.[[gap:revenue band for the home services platform|Matt]]"
              },
              {
                "p": "**Before.** Leads were getting more expensive and lower in quality. Aggregators supplied much of the volume, nobody held the agencies to a number, and the marketing data sat unused."
              },
              {
                "p": "**What we did.** The client asked for a fractional CMO at 40 to 80 hours a month, and candidates were at $200 to $250 an hour. Before we sourced anyone, we built a weighted 7-factor scorecard. Demand gen operator versus brand CMO carried 25%. With analytical rigor and agency accountability, the first three factors carried 60%. We ruled out brand-heavy CMOs, mismatched funnel backgrounds, anyone carrying 3 or more engagements and any self-reported background the public record contradicted. Then we scored 7 candidates. The client was to pick 3 for 30 to 60 minute calls and a first-90-days scenario exercise. The search was planned at 2 to 4 weeks, with a weekly 30-minute check-in."
              },
              {
                "p": "**After.** The client changed strategy before hiring. No one was placed, so there is no result to report. The scorecard still did its job. It forced the client to say which job it was hiring for, and it is the one we would hand any operating partner or president today."
              },
              {
                "p": "More on the [[link:fractional-marketing-leadership|fractional marketing leadership page]]."
              }
            ]
          },
          {
            "id": "not-right",
            "h": "When this is not the right move",
            "blocks": [
              {
                "p": "A fractional CMO is the wrong spend in five cases."
              },
              {
                "ul": [
                  "**One channel, one agency and a working plan.** You can hold that agency to a number yourself.",
                  "**The strategy is sound and you need hands.** Running paid search is a job for a specialist or an agency, held to a clear scorecard.",
                  "**Nobody runs demand gen today.** A strategist with no operator below them produces a plan nobody runs. Hire the demand gen operator first.",
                  "**Good leads stall in the sales process.** Fix that with [[link:hire-fractional-sales-vp|fractional sales leadership]] before you spend more on marketing.",
                  "**You need a marketing leader in the seat every day for years.** Hire a full-time CMO."
                ]
              },
              {
                "p": "And if the person asking for a CMO is not the one who decides, settle that and set a review date before anyone sources a candidate."
              }
            ]
          }
        ],
        "faq": [
          {
            "q": "What is a fractional CMO's hourly rate?",
            "a": "$200 to $250 an hour, as quoted in our 2026 CMO search for a PE-backed platform. Brand and product marketing leaders for a launch were quoted $220 to $400."
          },
          {
            "q": "How many hours a month does a fractional CMO need?",
            "a": "40 to 80 in our 2026 searches. Fewer hours leave no room to manage agencies and fix the data at once."
          },
          {
            "q": "Is a fractional CMO cheaper than an agency?",
            "a": "It depends on the agency, and the two do different jobs. An agency executes. A fractional CMO decides what to execute and holds the agencies to the number."
          },
          {
            "q": "Is there a minimum term?",
            "a": "Yes. The contract starts with a 3 to 4 month initial term. After that it runs month-to-month with 30 days notice."
          },
          {
            "q": "Do you add a fee to the operator's rate?",
            "a": "No. Clients pay the operator's rate with no platform fee added. Converting the operator to a full-time hire later carries a fee of 20% of annual salary."
          }
        ],
        "talk": "Tell us what your marketing is costing you. The form takes four short questions and needs only your name and email. Often within 48 hours you get a role profile and 2 to 3 vetted marketing operators to meet before you sign. [[link:talk.pipeline|Talk to us about your marketing]]",
        "gaps": [
          {
            "what": "reviewing operator name and sign-off",
            "owner": "Matt"
          },
          {
            "what": "final Talk to us URL on the live site (the prototype links talk.pipeline)",
            "owner": "Rapid Neuron"
          },
          {
            "what": "301 redirect into this post from /post/fractional-cmo-cost-in-2026-what-you-should-expect-before-hiring",
            "owner": "Rapid Neuron"
          }
        ],
        "flags": [
          "Monthly range derived from hourly rates. About $8,000 to $20,000 a month is 40 to 80 hours at $200 to $250 an hour (answer, key numbers, seat table). Not computed here. G3, G4 and bank-nov Post 2 already state it. Needs Matt's OK.",
          "Monthly range derived from hourly rates. $13,200 to $32,000 a month is 60 to 80 hours at $220 to $400 an hour (seat table only). G3 and G4 already state it, no post draft does. Needs Matt's OK. If derived monthly ranges are cut, both monthly cells, the answer's monthly sentence and key 1's monthly figure go.",
          "Decision. The headline rates are quotes from 2026 searches that closed no marketing placement, as G3 says. The post says so in the rates section and the story. Confirm you are comfortable leading the cost answer with quoted rates until the survey lands.",
          "Decision. The $3,000 for 20 hours lesson runs unattributed in the price section, framed as a client who bought a sales leader, which is how bank-nov Post 2 frames it. The overview's open question names posts 9, 10, 12 and the Jan 28 post. Posts 2 and 12, both sources here, already carry it. Confirm.",
          "Decision. Ferry carries the full-time section as a marketing lesson in Matt's first person, from the Dec 22 LinkedIn draft. The overview asks whether that lesson should use Ferry or a marketing operator's story. Confirm, or swap in an operator story once one is cleared."
        ]
      },
      {
        "slug": "fractional-cmo-vs-agency",
        "kind": "rewrite",
        "kindL": "Comparison",
        "template": "comparison",
        "fn": "marketing",
        "cat": "marketing",
        "need": "pipeline",
        "persona": "P4",
        "q": "Fractional CMO, agency or full-time hire when leads cost more?",
        "metaTitle": "Fractional CMO vs Agency When Lead Costs Rise",
        "metaDescription": "Fractional CMO vs agency vs a full-time hire when lead costs keep rising. Who owns the agencies and the data, what each costs and when to pick each.",
        "term": "fractional cmo vs agency",
        "prompt": "Should I hire a fractional CMO, a marketing agency or a full-time CMO when lead costs keep rising?",
        "publish": "2026-12-21",
        "updated": "2026-10-11",
        "base": "Content Bank Post 8 (bank-dec.md), the playbook's merge target for /post/hiring-a-fractional-cmo-vs-marketing-agency-which-delivers-better-roi",
        "words": 1243,
        "opsQ": "CMO",
        "stat": {
          "v": "25%",
          "l": "Largest scorecard weight, demand gen operator vs brand CMO"
        },
        "related": [
          "fractional-cmo-cost",
          "how-to-hire-a-fractional-cmo"
        ],
        "replaces": [
          {
            "url": "/post/hiring-a-fractional-cmo-vs-marketing-agency-which-delivers-better-roi",
            "title": "Hiring a Fractional CMO vs Marketing Agency: Which Delivers Better ROI?",
            "clicks": null,
            "impressions": null,
            "position": null,
            "action": "merge"
          }
        ],
        "answer": "When lead costs rise and quality falls, hire someone to own the agencies and the data before another agency. For most PE-backed and growth-stage companies that is a fractional demand gen leader or CMO.",
        "keys": [
          {
            "k": "Weight on demand gen operator vs brand CMO in one client's scorecard",
            "v": "25%, the largest of 7 factors",
            "src": "Revenue Nomad 2026 fractional CMO search",
            "url": ""
          },
          {
            "k": "Fractional CMO scope and rate, PE-backed platform",
            "v": "[[cost:cmo.hourly]], [[cost:cmo.hours]]",
            "src": "Revenue Nomad 2026 marketing searches, quoted rates",
            "url": ""
          },
          {
            "k": "Fractional brand and product marketing leaders",
            "v": "[[cost:marketing-launch.hourly]], [[cost:marketing-launch.hours]] for launch-type scopes",
            "src": "Revenue Nomad 2026 marketing searches, quoted rates",
            "url": ""
          },
          {
            "k": "Median fractional CMO monthly retainer, 2027",
            "v": "[[gap:2027 survey figure, median fractional CMO monthly retainer|Survey]]",
            "src": "State of Fractional GTM 2027, Revenue Nomad network",
            "url": ""
          }
        ],
        "sections": [
          {
            "id": "why-costs-rise",
            "h": "Why do lead costs keep rising even after we switch agencies?",
            "blocks": [
              {
                "p": "Because nobody inside owns the agencies, the aggregators and the data. The agency is rarely the root problem."
              },
              {
                "p": "The pattern we see repeats. Lead cost goes up. Lead quality goes down. The company leans harder on lead aggregators to hit volume. Agencies are not managed tightly, so each one reports its own wins. Marketing data sits in reports nobody acts on."
              },
              {
                "p": "Switching agencies resets the clock for a quarter. Then the same pattern returns, because the missing piece is an owner with the analytical rigor to hold vendors to cost per lead, attribution and customer acquisition cost."
              }
            ]
          },
          {
            "id": "side-by-side",
            "h": "What is the difference between a fractional CMO, an agency and a full-time CMO?",
            "blocks": [
              {
                "p": "An agency executes. A CMO decides what to execute and holds the agencies to the number. A demand gen operator does a narrower version of the CMO job, focused on pipeline."
              },
              {
                "table": {
                  "head": [
                    "Option",
                    "Cost",
                    "Time to start",
                    "Commitment",
                    "Who owns results",
                    "Fits when"
                  ],
                  "rows": [
                    [
                      "Fractional CMO",
                      "$200 to $250 an hour, 40 to 80 hours a month (Revenue Nomad 2026 search)",
                      "Search planned at 2 to 4 weeks in our 2026 example",
                      "Contract with a 3 to 4 month initial term, then month-to-month with 30 days notice",
                      "The operator, against agreed metrics",
                      "Several agencies or brands, data underused, no senior marketing owner"
                    ],
                    [
                      "Agency",
                      "[[gap:typical agency retainer range|Survey]]",
                      "[[gap:typical agency onboarding time|Survey]]",
                      "[[gap:typical agency contract term|Survey]]",
                      "The agency reports on its own channel",
                      "A clear strategy already exists and you need hands"
                    ],
                    [
                      "Full-time CMO",
                      "[[gap:full-time CMO total comp benchmark|Survey]]",
                      "[[gap:full-time CMO time to hire|Survey]]",
                      "Full-time employment, no set end date",
                      "The CMO, full time",
                      "Large marketing team that needs daily leadership"
                    ],
                    [
                      "Fractional demand gen operator",
                      "[[gap:2027 survey figure, fractional demand gen operator cost|Survey]]",
                      "[[gap:2027 survey figure, fractional demand gen operator time to start|Survey]]",
                      "Same contract terms as a fractional CMO",
                      "The operator, on pipeline metrics",
                      "One brand, one funnel, a cost per lead problem"
                    ]
                  ]
                }
              },
              {
                "p": "Revenue Nomad has turned around a SOW plus 2 to 3 candidate profiles within 48 hours. In our example, the 2 to 4 weeks were planned for scoring, calls and a scenario exercise. Rates by seat are on the [[link:fractional-cost|cost hub]]."
              }
            ]
          },
          {
            "id": "brand-or-demand-gen",
            "h": "Do we need a brand CMO or a demand gen operator?",
            "blocks": [
              {
                "p": "If the problem is cost per lead, you need a demand gen operator first. One client we worked with in 2026 disqualified brand-heavy CMOs outright."
              },
              {
                "p": "That PE-backed home services client weighted demand gen operator versus brand CMO at 25%, the heaviest of 7 factors on its scorecard. [[link:guide.how-to-hire-a-fractional-cmo|How to vet a fractional CMO]] shows the full scorecard."
              },
              {
                "quote": "[[gap:quote from the operator on which numbers show whether a company needs a demand gen operator or a brand CMO, with permission|Operator]]"
              }
            ]
          },
          {
            "id": "wrong-leader",
            "h": "How do we avoid hiring the wrong marketing leader?",
            "blocks": [
              {
                "p": "Agree who decides and what the job is before anyone sources a candidate. Brand strategy and sales enablement are different jobs, and the person who asks for help is not always the person who decides."
              },
              {
                "p": "We learned this on a repositioning search for a PE-backed public-sector software company. The ask mixed one narrative across fragmented products with sales kickoff readiness[[gap:revenue band for the public-sector software company, and its status cleared for publishing|Matt]]. Those need different people. We now agree decision rights and a review date before sourcing."
              },
              {
                "p": "The same home services client used clear disqualifiers. Brand-heavy CMOs, backgrounds that do not match the funnel, anyone already carrying 3 or more engagements, and any self-reported background the public record contradicts. The plan was for the client to pick 3 of 7 scored candidates for 30 to 60 minute calls and a first-90-days scenario exercise."
              },
              {
                "p": "Before you meet anyone, every marketing operator in our network has been scored on CORE, Communication, Ownership, Results Focus and Expertise. [[link:browse.marketing|Browse marketing operators]], or read [[link:guide.how-to-hire-a-fractional-cmo|how to hire a fractional CMO]]."
              }
            ]
          },
          {
            "id": "first-90-days",
            "h": "What should a fractional CMO deliver in the first 90 days?",
            "blocks": [
              {
                "p": "A clear owner for every agency and aggregator, one view of cost per lead and acquisition cost by channel, and a decision on which channels to cut or grow."
              },
              {
                "p": "That means a weekly check-in with each agency against shared numbers. It means attribution you trust enough to move budget. It means a plan to reduce reliance on aggregators, channel by channel, rather than in one jump."
              },
              {
                "p": "Scope it in hours. Our 2026 CMO search was scoped at 40 to 80 hours a month. Launch-type brand and product marketing scopes were 60 to 80 hours a month, with candidates at about $220 to $400 an hour. Too few hours for the scope fail. Match hours to the job. More in [[link:guide.fractional-cmo-cost|what a fractional CMO costs]]."
              }
            ]
          },
          {
            "id": "real-company",
            "h": "What this looked like at a real company",
            "blocks": [
              {
                "p": "A PE-backed home services platform with two brands. Lead cost and lead quality were getting worse[[gap:revenue band for the home services platform|Matt]]. The company relied heavily on lead aggregators. Agencies were not managed tightly. Marketing data was underused."
              },
              {
                "p": "The client scoped a fractional CMO search at 40 to 80 hours a month. We built a weighted 7-factor scorecard and scored 7 candidates against it. Under the plan, the client would pick 3 for calls and a first-90-days scenario exercise, with a weekly 30-minute check-in, over 2 to 4 weeks."
              },
              {
                "p": "The client changed strategy before hiring. No one was placed. The scorecard and the disqualifiers are what we would reuse, and they are the part worth copying. The full scorecard is on our [[link:fractional-marketing-leadership|fractional marketing leadership page]]."
              }
            ]
          },
          {
            "id": "not-right",
            "h": "When this is not the right move",
            "blocks": [
              {
                "p": "Do not hire a fractional CMO if you have one channel, one agency and a clear plan that is working. Keep the agency and manage it yourself."
              },
              {
                "p": "Do not hire one if you need a large in-house marketing team led every day. Hire a full-time CMO."
              },
              {
                "p": "Do not hire a brand CMO to fix cost per lead. Hire a demand gen operator."
              },
              {
                "p": "Do not hire a marketing leader or a new agency if sales cannot close the leads you already get. Look at [[link:hire-fractional-sales-vp|fractional sales leadership]] first."
              },
              {
                "p": "Do not start a search until you know who decides. If the requester and the decider are different people, settle that first."
              }
            ]
          }
        ],
        "faq": [
          {
            "q": "Is a fractional CMO cheaper than an agency?",
            "a": "It depends on the agency. The two do different jobs. The CMO owns the number and manages agencies.[[gap:typical agency retainer range|Survey]]"
          },
          {
            "q": "How many hours does a fractional CMO work?",
            "a": "Our 2026 CMO search was scoped at 40 to 80 hours a month."
          },
          {
            "q": "Can a fractional CMO manage our existing agencies?",
            "a": "Yes. Agency and aggregator accountability is one of the core things to screen for."
          },
          {
            "q": "How fast can we start?",
            "a": "Shortlists can arrive within 48 hours. Plan on 2 to 4 weeks for a scored search with calls and a scenario exercise."
          }
        ],
        "talk": "Tell us what you are trying to fix through the [[link:talk.pipeline|Talk to us form]], four short questions where only name and email are required. We reply with a role profile and 2 to 3 vetted marketing operators matched to your funnel, often within 48 hours, and you meet each one before you sign anything.",
        "gaps": [
          {
            "what": "reviewing operator name and sign-off (shown in the byline, not in the text)",
            "owner": "Matt"
          },
          {
            "what": "final Talk to us URL, ships Oct 30 (the post links talk.pipeline in the prototype)",
            "owner": "Rapid Neuron"
          },
          {
            "what": "/operators/marketing page URL on the live site (the post links browse.marketing in the prototype)",
            "owner": "Rapid Neuron"
          },
          {
            "what": "cost hub URL on the live site (the post links fractional-cost in the prototype)",
            "owner": "Rapid Neuron"
          },
          {
            "what": "301 redirect from /post/hiring-a-fractional-cmo-vs-marketing-agency-which-delivers-better-roi to this post",
            "owner": "Rapid Neuron"
          },
          {
            "what": "2027 survey figure, median fractional CMO monthly retainer (key numbers)",
            "owner": "Survey"
          },
          {
            "what": "typical agency retainer range (comparison table and FAQ)",
            "owner": "Survey"
          },
          {
            "what": "typical agency onboarding time (comparison table)",
            "owner": "Survey"
          },
          {
            "what": "typical agency contract term (comparison table, new commitment column)",
            "owner": "Survey"
          },
          {
            "what": "full-time CMO total comp benchmark (comparison table)",
            "owner": "Survey"
          },
          {
            "what": "full-time CMO time to hire (comparison table)",
            "owner": "Survey"
          },
          {
            "what": "2027 survey figure, fractional demand gen operator cost (comparison table)",
            "owner": "Survey"
          },
          {
            "what": "2027 survey figure, fractional demand gen operator time to start (comparison table)",
            "owner": "Survey"
          },
          {
            "what": "revenue band for the home services platform",
            "owner": "Matt"
          },
          {
            "what": "revenue band for the public-sector software company, and its status cleared for publishing",
            "owner": "Matt"
          },
          {
            "what": "quote from the operator on which numbers show whether a company needs a demand gen operator or a brand CMO, with permission (interview 2, tailored follow-up 3)",
            "owner": "Operator"
          }
        ],
        "flags": [
          "Decision on a story fact, not a calculation. Post 8 says the home services client picked 3 of 7 scored candidates for calls and a first-90-days scenario exercise, and that the search ran or took 2 to 4 weeks. bank-nov Post 2 ('The plan was for the client to pick 3') and bank-jan ('planned at 2 to 4 weeks') say this was the plan, and G3 stops at scoring 7 candidates before the client changed strategy. This post now says planned in all five places (the table's time-to-start cell, the line under the table, the disqualifier paragraph, the real-company section and the 'How fast can we start?' answer). That matches the fractional CMO cost guide and the hiring guide. inbound-plan.md says the home services search took about 4 weeks to a no-decision, which backs the duration but not the calls or the exercise. If the calls and the exercise did happen, restore the draft's wording in all three posts.",
          "Decision. The public-sector software repositioning story in 'How do we avoid hiring the wrong marketing leader?' needs Matt's clearance before this post publishes. G3 marks its revenue band and current status as not yet cleared for publishing."
        ]
      }
    ]
  };
})();
