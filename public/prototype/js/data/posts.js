/* Answer posts for the Guides, in the Content Engine Playbook's answer-post template (Oct 10, 2026).
   Generated Oct 11, 2026 from the Content Bank (Nov 2026 to Jan 2027), the Site pages copy and the plan documents.
   - kind 'rewrite': a live blog post on the playbook's refresh list, rebuilt here. The three cost posts merge into one,
     and the sixteen sales city pages fold into the hiring guide (visibility plan #9). The live posts' text could not be
     read from this environment, so each rewrite is built from the Content Bank and plan data, not from the old copy.
   - kind 'new': a drafted Content Bank post (posts 1, 2, 4, 5 and 7), converted faithfully. Post 2 also takes the two
     marketing city pages and the part-time CMO hiring guide, since its URL already owns "how to hire a fractional CMO".
   Body text uses the function pages' tokens: [[gap:what|Owner]] pending chip, [[link:route|label]], [[url:https://…|label]],
   **bold** and [[net]]. replaces[] is the 301 list with Search Console figures from the May 2026 export (null = not in it).
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
        "words": 1731,
        "opsQ": "VP of Sales",
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
        "answer": "Pick the seat and the hours first. If you run a $5M to $75M company and still carry the number, the rest is a discovery call, a role profile, 2 to 3 vetted operators often within 48 hours, meetings in week 1 to 2, an optional working assignment, and a contract with a 3 to 4 month initial term.",
        "keys": [
          {
            "k": "Time to a role profile and 2 to 3 vetted operators",
            "v": "Often within 48 hours",
            "src": "Revenue Nomad process, 2026",
            "url": ""
          },
          {
            "k": "Operators in the network",
            "v": "[[net]], all dedicated fractional, with 50+ data points tracked on each",
            "src": "Revenue Nomad network",
            "url": ""
          },
          {
            "k": "Fractional director or VP of Sales, team under 5 to 8 reps",
            "v": "$200 to $250 an hour, 20 to 40 hours a month",
            "src": "Revenue Nomad 2026 engagements",
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
            "v": "Up to 1.5x salary, with 3+ months of ramp",
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
                "p": "Location only matters through the cadence. The work is weekly and hands-on, with pipeline reviews, sitting in on calls, coaching reps and role-play. Agree in the scope which of those happen in person and how often. [[gap:how many 2026 sales engagements ran remote, hybrid or on-site|Matt]] [[gap:operator count by metro for these 16 cities|Matt]]"
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
                "p": "The initial term is a floor. At Ferry, a hospitality tip management platform, I signed for 4 months and stayed about 18."
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
                "p": "**The company.** A founder-led water damage restoration marketing agency. [[gap:revenue band for the restoration marketing agency|Matt]]"
              },
              {
                "p": "**Before.** 278 appointments booked year to date and 134 showed, a 52% show rate. In one month 19 were booked, 13 showed and none closed. The founder had carried every one of those calls while running the company, and wanted out of running revenue."
              },
              {
                "p": "**How they hired.** Two finalists reached the end. Each reviewed a recorded BDR call and a Loom walkthrough of the business, then answered 3 written questions. One was a strategic builder with broad experience. The other was more tactical and had worked with agencies. The founder picked the tactical one, as a fractional sales director."
              },
              {
                "p": "**The first-month plan.** 20 hours a month at $4,000. Rebuild SDR pay around meetings that show and qualify, write discovery and close talk tracks, run role-play training, get the booking system adopted by week 2, and cut or double down on each channel based on conversion."
              },
              {
                "p": "**After.** The engagement started in September 2026. No results yet. We track show rate, close rate on held meetings and cost per closed client by channel. [[gap:90-day results at the restoration marketing agency, with the client's OK|Operator]]"
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
                  "**Meetings are not getting booked at all.** That is a demand problem. Start with [[link:fractional-marketing-leadership|fractional marketing leadership]].",
                  "**You need one more closer.** If the process works and you are short a seller, hire a rep.",
                  "**Nobody has found a repeatable sale yet.** If only you can close and you do not know why, keep selling and write down what works first.",
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
            "a": "Across our 2026 engagements, a director or VP for a team under 5 to 8 reps ran $200 to $250 an hour for 20 to 40 hours a month. [[link:guide.fractional-vp-of-sales-cost|The cost guide]] covers every seat."
          },
          {
            "q": "Is there a fee besides the operator's rate?",
            "a": "No platform fee. You pay the operator's rate and nothing more. If you later hire the operator full time, the conversion fee is 20% of annual salary."
          },
          {
            "q": "What if the operator is the wrong fit?",
            "a": "You can swap the operator. After the 3 to 4 month initial term, the engagement runs month-to-month with 30 days notice."
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
          }
        ],
        "flags": [
          "Decision, not a calculation. The which-seat section repeats the unattributed lesson that one client bought 20 hours a month for $3,000 and missed target every month, as G1 and G4 already do. The Content Bank overview still lists this lesson as a pending decision for posts 9, 10 and 12, so Matt should confirm it here too.",
          "Decision. The city section answers 'Only if the job needs someone in the room every week' and advises agreeing in-person work in the scope. No source says how often operators work on-site or remotely, so Matt should confirm the stance and fill the two gaps under it (remote, hybrid or on-site share of 2026 engagements, and operator counts by metro)."
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
        "words": 1771,
        "opsQ": "VP of Sales",
        "headline": {
          "rate": "$200 to $250",
          "rateL": "An hour",
          "month": "$4,000 to $10,000",
          "monthL": "A month, 20 to 40 hrs",
          "basis": "2026 engagements, teams under 5 to 8 reps"
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
        "answer": "A fractional VP of Sales cost $200 to $250 an hour across Revenue Nomad's 2026 engagements, or $4,000 to $10,000 a month for 20 to 40 hours. That covers founder-led and growth-stage companies with teams under 5 to 8 reps. Venture-backed companies at around $5M ARR accepted about $300 an hour. Larger teams pay more.",
        "keys": [
          {
            "k": "Fractional director or VP of Sales, team under 5 to 8 reps",
            "v": "$200 to $250 an hour, 20 to 40 hours, $4,000 to $10,000 a month",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Embedded fractional CRO, ~$55M company",
            "v": "50 hours a month at $23,200",
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
            "v": "About $334K a year, average tenure about 19 months",
            "src": "Glassdoor 2026 via Stealth Agents, secondary source",
            "url": "https://stealthagents.com/research/cost-of-hiring-a-vp-of-sales-2026"
          },
          {
            "k": "Fractional VP of Sales arrangements commonly cited",
            "v": "$8,000 to $20,000 a month",
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
                "p": "A fractional director or VP of Sales for a team under 5 to 8 reps ran $200 to $250 an hour in our 2026 engagements, or $4,000 to $10,000 a month. Price follows scope, team size and hours."
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
                      "About $150",
                      "About 40",
                      "About $6,000"
                    ],
                    [
                      "Sales manager",
                      "[[gap:sales manager rate and hours, from a 2026 engagement or the 2027 survey|Matt]]",
                      "",
                      ""
                    ],
                    [
                      "Director or VP of Sales, team under 5 to 8 reps",
                      "$200 to $250",
                      "20 to 40",
                      "$4,000 to $10,000"
                    ],
                    [
                      "VP of Sales, larger teams",
                      "[[gap:2027 survey figure, VP of Sales rate, hours and monthly cost for larger teams|Survey]]",
                      "",
                      ""
                    ],
                    [
                      "Embedded fractional CRO, ~$55M media and marketing services company",
                      "About $464",
                      "50",
                      "$23,200"
                    ]
                  ]
                }
              },
              {
                "p": "The CRO rate is the $23,200 retainer divided by 50 hours. That client ran a 45-day assessment at $27,500 first."
              },
              {
                "p": "Published averages measure different work. [[url:https://gofractional.com/insights|Go Fractional]] puts the average fractional rate at $161 an hour as of July 23 2026, across every function and seniority. [[url:https://stealthagents.com/research/cost-of-hiring-a-vp-of-sales-2026|Stealth Agents]], a secondary source, cites $8,000 to $20,000 a month for fractional VP of Sales arrangements, a range that fits larger teams and more hours."
              },
              {
                "p": "**Source.** What clients paid or were quoted in 2026 Revenue Nomad engagements, GTM leadership seats only. Medians by seat from the [[link:report|State of Fractional GTM]] survey land in the [[link:rates.sales_leadership|Rate Index for sales leadership]] in early December. [[gap:2027 Rate Index medians by seat, with sample size and survey dates|Survey]]"
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
                  "**Seniority against team size.** For a small team, a tactical director often beats a strategic VP, and costs less. A director for a 5-rep team ran $4,000 a month.",
                  "**Scope.** CRM admin, revenue leadership and pipeline work are three different jobs. Asking one person to cover all three raises the rate or breaks the engagement.",
                  "**Hours.** Price follows the hour block. 20 hours and 50 hours a month are different jobs.",
                  "**Funding.** Venture-backed companies accepted about $300 an hour at around $5M ARR. Bootstrapped peers pushed back on that number, and operators who over-anchored lost deals without hearing why."
                ]
              },
              {
                "p": "Price has to fit the team. One founder-led client had other quotes of $6,000 to $12,000 a month that felt like overkill for their team. A $4,000 retainer for 20 hours was, in the founder's words, \"a no-brainer.\""
              },
              {
                "p": "Cheap and thin is the most expensive option. One 2026 client placed at 20 hours a month for $3,000 did not hit targets in any month. More in [[link:guide.how-to-scope-a-fractional-sales-engagement|how to scope a fractional sales engagement]]."
              }
            ]
          },
          {
            "id": "engagement-models",
            "h": "How do you pay for a fractional VP of Sales?",
            "blocks": [
              {
                "p": "Most clients pay a monthly retainer, billed upfront, for a set block of hours. Every engagement runs on a signed contract."
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
                      "Director of sales, 20 hours, $4,000 a month"
                    ],
                    [
                      "Fixed project",
                      "Defined deliverable, fixed fee",
                      "One problem with a clear end",
                      "30-day RevOps project, about $7,000 to $8,000"
                    ],
                    [
                      "Assessment then retainer",
                      "Fixed-fee diagnosis, then the operator executes",
                      "You need a diagnosis before you commit",
                      "45-day assessment at $27,500, then a CRO at $23,200 a month"
                    ]
                  ]
                }
              },
              {
                "p": "These are the usual terms across our network of [[net]] operators."
              },
              {
                "ul": [
                  "A 3 to 4 month initial term, then month-to-month with 30 days notice.",
                  "Hours tracked and flagged before an overage happens. Small overages, for example up to 15%, may be agreed in the contract without extra consent.",
                  "If the fit is wrong, you can swap the operator.",
                  "You pay the operator's rate and nothing more. There is no platform fee.",
                  "Hiring the operator full time carries a conversion fee of 20% of annual salary."
                ]
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
                "p": "A full-time VP of Sales averages about $334K a year in total compensation, per [[url:https://stealthagents.com/research/cost-of-hiring-a-vp-of-sales-2026|Stealth Agents citing Glassdoor 2026]], a secondary source. A fractional VP at $10,000 a month, the high end of our small-team range, is $120,000 a year."
              },
              {
                "p": "Pay is only part of it. Average VP of Sales tenure is about 19 months, per the same source. [[url:https://skaled.com/services/fractional-vp-of-sales/|Skaled]] puts the cost of replacing a sales leader at about 1.5x salary, with 3+ months of ramp."
              },
              {
                "p": "Run the math on a miss. A $334K hire who leaves at 19 months costs about $529K in pay. Replacement at 1.5x adds roughly $501K. Then you lose another 3+ months to ramp."
              },
              {
                "p": "The CRO seat follows the same pattern. One ~$55M client benchmarked a full-time CRO at up to about $800K all in, then chose a 45-day assessment at $27,500 and an embedded fractional CRO at $23,200 a month."
              },
              {
                "p": "Full-time wins once the team is large, the process works and the job is running it every day. If you convert the operator instead of starting a new search, the fee is 20% of annual salary. [[gap:2027 survey figure on when clients convert to full time|Survey]] More in [[link:guide.interim-vs-fractional-vs-full-time-sales-leader|interim, fractional or full-time sales leader]]."
              }
            ]
          },
          {
            "id": "sales-and-marketing",
            "h": "Can one fractional VP cover sales and marketing?",
            "blocks": [
              {
                "p": "Sometimes. It works when one person can truly cover the combined scope, and it breaks when one retainer hides several jobs."
              },
              {
                "p": "Our 2026 marketing searches treated demand gen and brand as different jobs, and we score marketing leaders on sales enablement as its own factor. Some can support sales. Tell us whether you need brand strategy, enablement or both, and we will tell you when one person cannot cover it."
              },
              {
                "p": "For scale, a fractional CMO search for a PE-backed platform was scoped at 40 to 80 hours a month at $200 to $250 an hour, the same band as our small-team sales leaders. More on [[link:fractional-marketing-leadership|fractional marketing leadership]]."
              },
              {
                "p": "It can work. At Ferry, a hospitality tip management platform [[gap:Ferry revenue band|Matt]], I came in as fractional GTM strategy leader in February 2025 on a 4-month term and stayed about 18 months. I built the first digital demand generation program, which produced the first 20 inbound leads. I closed 2 deals that doubled the client base, then hired the first AE, who closed a deal within 60 days. [[gap:hours, monthly cost and ROI of the Ferry seat, cleared to publish|Matt]]"
              },
              {
                "p": "If the miss runs across sales, marketing, comp and the CRM at once, that is a CRO job. One person owns the number and every system that feeds it."
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
                "p": "**After.** It started in September 2026, and there are no results yet. We are tracking close rate, sales cycle length and new clients closed per month against the goal of 10. [[gap:90-day result at the physical therapy marketing agency, with the client's OK|Matt]]"
              },
              {
                "p": "**The low end of the range.** A founder-led healthcare services company [[gap:revenue band for the healthcare services company|Matt]] with 8 commission-only reps, about half not performing, took a 90-day build at 20 hours a month for $4,000. The scope covers rep assessment, process, scripts, training, a CRM audit and personnel calls. It also started in September 2026."
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
                  "**You have fewer than 3 reps and still close most deals.** Start with a sales coach or a player-coach. The coach seat ran about $6,000 a month in our 2026 engagements.",
                  "**You cannot fund the hours.** If the job needs 40 hours and the budget covers 20, wait or narrow the scope.",
                  "**You want someone on call all week.** If you need a leader in the building 50+ hours a week for years, hire full time.",
                  "**The miss runs across departments.** If marketing, comp and the CRM all feed it, a VP of Sales cannot fix it alone. Look at a [[link:guide.fractional-cro-vs-full-time-cro|fractional CRO]] instead."
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
            "a": "No. You pay the operator's rate for a set block of hours, billed monthly. That came to $4,000 to $10,000 a month in our 2026 engagements. A full-time VP averages about $334K a year in total comp."
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
        "flags": []
      }
    ]
  };
})();
