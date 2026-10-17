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
   aliases maps a prototype guide a post replaced to that post, so its old link still lands.
   Oct 17, 2026: eight guides from the buyer questions backlog, section (b), kind 'new', live (publish null). Each answers
   bank questions from Revenue Nomad's 2026 agreements, statements of work and buyer calls, generalized so no company,
   person or deal value tied to a company appears. High-confidence answers read as policy, medium ones as "what we have
   seen", low and none are left out. The legacy scoping guide now aliases to what-should-a-fractional-engagement-fix-first. */
(function () {
  'use strict';
  const RN = window.RN;
  RN.data = RN.data || {};
  RN.data.posts = {
    "asOf": "2026-10-11",
    "aliases": {
      "fractional-vs-full-time-vp-of-sales": "interim-vs-fractional-vs-full-time-sales-leader",
      "transition-out-of-founder-led-sales": "how-to-stop-running-sales-as-a-founder",
      "fractional-cmo-vs-marketing-agency": "fractional-cmo-vs-agency",
      "how-to-scope-a-fractional-sales-engagement": "what-should-a-fractional-engagement-fix-first"
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
                      "No platform fee on top of the rate in your agreement"
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
            "a": "Across our 2026 engagements, a director or VP for a team under 5 to 8 reps ran [[cost:vp-sales.hourly]] for [[cost:vp-sales.hours]], with no platform fee added. If you later hire the operator full time, the conversion fee is 20% of annual salary. [[link:guide.fractional-vp-of-sales-cost|What a fractional VP of Sales costs]] covers every seat."
          },
          {
            "q": "Does the operator need experience in our exact industry?",
            "a": "Not always. The same kind of sale and the same stage come first, and we check both before you see a profile. Industry familiarity still helps, and one founder picked the finalist who knew the industry. Several of our 2026 sales engagements are services businesses, and you can filter [[link:browse.sales_leadership|sales leadership profiles]] by industry and sales motion."
          },
          {
            "q": "What if the operator is the wrong fit?",
            "a": "You can swap the operator. We present replacement candidates and move the work over at no added cost. Once the 3 to 4 month initial term ends, the contract runs month-to-month with 30 days notice."
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
                      "None on top of the rate in your agreement"
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
            "a": "No. Revenue Nomad's share is built into the rate, so there is no separate platform fee. Travel and other expenses are billed at cost only when you approve them in advance in writing, and any software a plan recommends is bought by you, in your name. Hiring the operator full time later carries a conversion fee of 20% of annual salary."
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
            "a": "You can swap the operator. We present replacement candidates and move the work over at no added cost. Every engagement runs on a signed contract, with a monthly retainer billed upfront for a set block of hours."
          },
          {
            "q": "What does the first month usually cover?",
            "a": "The first-month plans in our 2026 sales engagements cover paying SDRs for meetings that show and qualify, written discovery and close talk tracks with role-play, one booking system the whole team uses, a rep-by-rep assessment and a CRM audit. They should show within 30 days. Results from those engagements are not in yet, so judge them against the numbers you record in week one."
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
            "a": "An interim leader close to full time for a defined period, a fractional leader on a set block of hours, or a consulting firm that delivers findings. With under 3 reps and the founder still closing most deals, start with a sales coach. If the process works and you only need hands, hire a rep."
          },
          {
            "q": "Can a fractional sales leader become our full-time hire, or hand over to one?",
            "a": "Yes, either way. Some companies convert the operator once the system works, for a fee of 20% of annual salary. Others hire a full-time leader into the system the operator built, and a leader at month 6 can write that job description with real data."
          },
          {
            "q": "We're comparing several options. How should we judge them?",
            "a": "On the same three things, hours, term and who is on the hook when the number moves. Meet the person who will do the work before you sign, ask for a written 30/60/90-day plan before a retainer starts, and check whether whoever diagnoses also stays for the fix."
          },
          {
            "q": "We tried fractional help before and it didn't work. What should be different?",
            "a": "Check which of four things failed. Hours were too thin, full-time availability was expected at a fractional rate, the operator lacked authority, or one retainer covered several jobs. Fix each before sourcing, with enough hours, a weekly cadence, written decision rights and a scope one person can cover."
          },
          {
            "q": "What if the operator is the wrong fit?",
            "a": "You can swap the operator. We present replacement candidates and move the work over at no added cost. Every contract starts with a 3 to 4 month initial term, then goes month-to-month with 30 days notice."
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
            "a": "You can swap the operator. We present replacement candidates and move the work over at no added cost."
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
            "a": "You can swap the operator. We present replacement candidates and move the work over at no added cost. After the 3 to 4 month initial term the engagement runs month-to-month with 30 days notice."
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
            "a": "Every engagement runs on a signed contract. Assessments and projects are fixed fees. Ongoing work is a monthly retainer billed upfront for a set block of hours, with a 3 to 4 month initial term, then month-to-month with 30 days notice. There is no separate platform fee, and travel or other expenses are billed at cost only when you approve them in advance in writing."
          },
          {
            "q": "Can we hire the operator full time later?",
            "a": "Yes. The conversion fee is 20% of annual salary. You can also swap the operator if the fit is wrong."
          },
          {
            "q": "How do we get marketing, sales and customer success working from the same numbers?",
            "a": "Give one owner the definitions every team reports on. That is the RevOps job, shared definitions across marketing, sales and customer success, and an owner for the conversion between teams. If marketing counts MQLs and sales counts bookings, the handoff between them has no owner, which is where most forecasts break."
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
                  "**Fees.** No platform fee on top of the rate in your agreement.",
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
            "a": "No. Our share is built into the rate, so there is no separate platform fee. Travel and other expenses are billed at cost only when you approve them in advance in writing, and any software a plan recommends is bought by you, in your name. Converting the operator to a full-time hire later carries a fee of 20% of annual salary."
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
      },
      {
        "slug": "how-a-fractional-leader-works-with-your-team",
        "kind": "new",
        "kindL": "How it works",
        "template": "answer",
        "fn": "sales",
        "cat": "sales_leadership",
        "need": "sales_motion",
        "persona": "P1 and P2",
        "q": "How does a fractional leader work with your team week to week?",
        "metaTitle": "How a Fractional Leader Works With Your Team Week to Week",
        "metaDescription": "What a week with a fractional sales leader looks like. The meetings, your own time, who owns what next to your team and vendors, and what Revenue Nomad does.",
        "term": "how a fractional sales leader works with your team",
        "prompt": "How does a fractional sales leader work with my existing team each week?",
        "publish": null,
        "updated": "2026-10-17",
        "base": "Proposed guide b1 in the buyer questions backlog (Oct 17, 2026), answered from Revenue Nomad's 2026 agreements, statements of work and buyer calls, generalized with no company named",
        "words": 1317,
        "opsQ": "sales process",
        "stat": {
          "v": "30 to 60 minutes",
          "l": "A week with the person the operator reports to, through the first 90 days"
        },
        "related": [
          "keep-what-an-operator-builds",
          "what-should-a-fractional-engagement-fix-first"
        ],
        "replaces": [],
        "answer": "Expect a standing weekly session with the person the operator reports to, a weekly pipeline meeting and regular rep one-to-ones. Who owns what is written into the scope before day one.",
        "keys": [
          {
            "k": "Weekly working session with the person the operator reports to",
            "v": "30 to 60 minutes, through the first 90 days",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Director or VP of Sales seat",
            "v": "[[cost:vp-sales.hours]], for [[cost:vp-sales.monthly]]",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Intake in the first week",
            "v": "3 to 6 short sessions, plus CRM and call recording access",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Notice to change the monthly hour block",
            "v": "30 days, by a short addendum",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "On-site visits, when a company wants them",
            "v": "Every 6 to 8 weeks, each trip approved in advance",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          }
        ],
        "sections": [
          {
            "id": "your-week",
            "h": "What does a normal week look like?",
            "blocks": [
              {
                "p": "Most engagements run on a weekly rhythm. The hours go into building the plan, the process and the playbooks, not into meetings."
              },
              {
                "table": {
                  "head": [
                    "Meeting",
                    "How often",
                    "Who is in it"
                  ],
                  "rows": [
                    [
                      "Working session",
                      "Weekly, 30 to 60 minutes",
                      "The person the operator reports to, usually the CEO"
                    ],
                    [
                      "Pipeline or forecast review",
                      "Weekly",
                      "Your sellers and their manager"
                    ],
                    [
                      "Rep one-to-ones",
                      "Every week or two",
                      "Each rep"
                    ],
                    [
                      "Written update",
                      "Weekly, once the build is done",
                      "Leadership"
                    ],
                    [
                      "On-site visit",
                      "Every 6 to 8 weeks, if you want it",
                      "The team"
                    ]
                  ]
                },
                "note": "The rhythm in our 2026 statements of work and delivery calls. Larger programs add a monthly executive review."
              },
              {
                "p": "The first 90 days are deliberately light on meetings. One statement of work we wrote called the weekly session with the CEO the single largest factor in how fast the process gets built. Keep that slot, even when the quarter gets busy."
              },
              {
                "p": "In-person work is optional. When a company wants it, the usual pattern is two days on site in the first week, then a visit every 6 to 8 weeks around milestones, each trip approved by you in advance."
              }
            ]
          },
          {
            "id": "your-time",
            "h": "How much of our own time will this take?",
            "blocks": [
              {
                "p": "Plan on a standing 30 to 60 minute session a week through the first 90 days. The first one to two weeks take more."
              },
              {
                "p": "In week one the operator interviews you, your sales and marketing leads and a few people on the team, usually in 3 to 6 short intake sessions. Our statements of work set a 30-minute weekly session, and in practice most run 45 to 60 minutes."
              },
              {
                "p": "The usual delay is access, not the CEO's calendar. Email accounts, CRM, call recordings, org charts and comp history arrive late, and the first deliverables wait on them. Name one person inside to coordinate scheduling and materials, and have these ready for week one."
              },
              {
                "ol": [
                  "CRM access and a data export",
                  "Call recordings",
                  "Comp plans",
                  "Funnel data by stage and source",
                  "Sales decks and proposals",
                  "An org chart",
                  "Onboarding documents",
                  "A calendar of stakeholder interviews"
                ]
              },
              {
                "p": "After the build phase, most of the time comes from your managers, not from you."
              }
            ]
          },
          {
            "id": "alongside-your-team",
            "h": "How does the operator work alongside our team and vendors?",
            "blocks": [
              {
                "p": "We write the split into the statement of work before anyone starts, with a reporting line and an out-of-scope list."
              },
              {
                "ul": [
                  "**The operator owns** the plan, the process, the operating cadence and the weekly numbers.",
                  "**Your team and vendors keep** the work they already do, such as CRM builds, campaigns and content. The operator specifies what that work needs to deliver.",
                  "**Both sides share** one scoreboard, and the operator holds a standing session on handoffs with the team or vendor involved."
                ]
              },
              {
                "p": "Our sales leader agreements use a simple rule for systems. The operator specifies what the CRM needs to do, and your admin or vendor configures it. That keeps a senior leader from turning into an admin. Personally closing deals, recruiting, CRM administration and marketing execution sit out of scope unless the agreement adds them."
              },
              {
                "p": "Where an existing sales leader stays, the scope says the engagement is there to raise their effectiveness, not to replace them. Say that out loud at kickoff. The fear we hear most on calls is that the outside leader will take over someone's function."
              }
            ]
          },
          {
            "id": "earning-trust",
            "h": "How does an outside leader earn the trust of a long-tenured team?",
            "blocks": [
              {
                "p": "By earning the right to change things before changing them. What we have seen work follows the same order."
              },
              {
                "ol": [
                  "**Start with facts.** Interviews and a look at the real data and recorded calls come first, so the first proposals rest on numbers the team recognizes.",
                  "**Write down what already wins.** Documenting what your strongest performers already do is often the fastest way to credibility.",
                  "**Back the role from the start.** The CEO introduces the operator as a leadership-backed role.",
                  "**Report around the resistance.** The operator reports to the CEO or CFO, not to the leaders whose habits may need to change.",
                  "**Treat existing leaders as partners.** They help redesign the process, one topic at a time, in small working sessions."
                ]
              },
              {
                "p": "The failure mode is an outside leader who reports to the very person resisting the change. Fix the reporting line before day one."
              }
            ]
          },
          {
            "id": "other-clients",
            "h": "How many other clients will the operator be working with?",
            "blocks": [
              {
                "p": "It depends on the size of the seat, so ask. Operators we place work fractionally as their main business, not alongside a full-time job, and commit to a fixed monthly hour block in writing."
              },
              {
                "p": "Small seats of a few hours a week can sit alongside several other clients. Embedded seats of 60 hours a month or more usually mean one or two. A [[link:hire-fractional-sales-vp|fractional director or VP of Sales]] seat in our 2026 engagements ran [[cost:vp-sales.hours|lower]], and [[link:fractional-cost|the cost hub]] lists every seat. For market-wide rates, see [[link:rates.sales_leadership|Sales Leadership rates on the Rate Index (illustrative)]]."
              },
              {
                "p": "Ask each finalist three things. How many hours a week they can give you, what they are committed to now and when each commitment ends, and the earliest date they can start. \"As much as you need\" is a weak answer."
              },
              {
                "p": "Between sessions, operators answer by email or chat rather than on a fixed response clock, so agree on response expectations at kickoff. If you need more or fewer hours later, you can change the block with 30 days' written notice. [[link:guide.what-should-a-fractional-engagement-fix-first|What a fractional engagement should fix first]] covers how hours and scope change."
              }
            ]
          },
          {
            "id": "revenue-nomad-role",
            "h": "Who is our day-to-day contact, and what does Revenue Nomad do?",
            "blocks": [
              {
                "p": "The operator is your day-to-day contact. Revenue Nomad holds the contract and the relationship."
              },
              {
                "ul": [
                  "**One agreement.** You sign with Revenue Nomad, and we pay the operator, so you never manage a second contract.",
                  "**Billing and changes.** We invoice at the start of each monthly cycle and handle any change to hours or scope.",
                  "**Quality and escalation.** We keep in touch with the operator on quality and are your escalation path if anything slips.",
                  "**Replacement.** If the fit is wrong, or the operator has to step away, we present replacement candidates and move the work over at no added cost."
                ]
              },
              {
                "p": "Operators owe us 30 days' notice before they step away, keep notes and status in your own project tools, and join handoff calls with their replacement, so the work does not live in one person's head."
              }
            ]
          },
          {
            "id": "not-right",
            "h": "When does this way of working not fit?",
            "blocks": [
              {
                "ul": [
                  "**You need someone in the office every day.** A fractional seat is a fixed block of hours and a weekly rhythm. If the job needs full-time presence, hire full-time.",
                  "**Nobody inside can hold the weekly session.** Without a sponsor's standing slot, the build slows down.",
                  "**You want an admin, not a leader.** If the job is configuring the CRM or running campaigns, hire for that seat instead."
                ]
              }
            ]
          }
        ],
        "faq": [
          {
            "q": "Do we work with the operator directly, or through you?",
            "a": "Directly, day to day. Revenue Nomad holds the contract, handles billing and any change to hours or scope, and is your escalation path if anything slips."
          },
          {
            "q": "Is the operator reachable outside the weekly session?",
            "a": "Yes, by email or chat between sessions. There is no fixed response clock today, so agree on response expectations at kickoff."
          },
          {
            "q": "Will the operator take over our sales manager's job?",
            "a": "No. The split is written into the scope, and where a sales leader stays, the engagement is set up to raise their effectiveness, not to replace them."
          },
          {
            "q": "What if our operator gets sick or leaves partway through?",
            "a": "We present replacement candidates and move the work over at no added cost. Operators owe 30 days' notice and keep their notes in your systems, so a replacement starts from documents, not memory."
          },
          {
            "q": "Does the operator need to be on site?",
            "a": "Only if you want it. Larger engagements often start with two on-site days in week one, then a visit every 6 to 8 weeks, each trip approved by you in advance."
          }
        ],
        "talk": "Tell us how your team runs today through the [[link:talk.sales_motion|Talk to us form]]. Four short questions, only name and email required. We reply with a role profile and 2 to 3 vetted operators, often within 48 hours, and you meet them before you sign.",
        "gaps": [
          {
            "what": "reviewing operator name and sign-off (shown in the byline, not in the text)",
            "owner": "Owner"
          },
          {
            "what": "a response-time standard between sessions, if the company wants to set one",
            "owner": "Owner"
          },
          {
            "what": "a client-load rule for every seat (today the 3-engagement screen is published for CMOs only)",
            "owner": "Owner"
          },
          {
            "what": "an operator quote on earning a tenured team's trust, with permission",
            "owner": "Operator"
          }
        ],
        "flags": [
          "Medium confidence, phrased as what we have seen. The trust section (ih-change), the client-load section (rf-bandwidth), the cadence (em-cadence) and Revenue Nomad's role (em-contact) come from 2026 agreements and buyer calls but no written policy. No fixed Revenue Nomad check-in calendar is promised, because none exists.",
          "Left out. The part-time answer (fx-parttime-enough) is low confidence, so the guide gives only the hours from RN.costs and the response-time point."
        ]
      },
      {
        "slug": "what-to-put-in-place-before-hiring-more-reps",
        "kind": "new",
        "kindL": "Team building",
        "template": "answer",
        "fn": "sales",
        "cat": "sales_leadership",
        "need": "team",
        "persona": "P1 and P2",
        "q": "What should be in place before you hire more reps?",
        "metaTitle": "What to Put in Place Before You Hire More Sales Reps",
        "metaDescription": "Before you add reps, get a written process, a hiring profile, a ramp plan and a comp plan in place. How a fractional sales leader builds each one.",
        "term": "before hiring more sales reps",
        "prompt": "What should we have in place before we hire more sales reps?",
        "publish": null,
        "updated": "2026-10-17",
        "base": "Proposed guide b2 in the buyer questions backlog (Oct 17, 2026), answered from Revenue Nomad's 2026 agreements, statements of work and buyer calls, generalized with no company named",
        "words": 1176,
        "opsQ": "sales coaching",
        "stat": {
          "v": "Day 90",
          "l": "A written assessment of every rep, with a recommendation"
        },
        "related": [
          "how-to-stop-running-sales-as-a-founder",
          "how-a-fractional-leader-works-with-your-team"
        ],
        "replaces": [],
        "answer": "A documented sales process the team can repeat, a hiring profile built from what your strongest seller does, a 30/60/90-day ramp plan, and a comp plan reps understand. Hire into a system, not a hero.",
        "keys": [
          {
            "k": "Written assessment of every rep",
            "v": "By day 90, with a keep, invest or exit recommendation",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Benchmark of what you already have",
            "v": "First 2 to 3 weeks, from your CRM, recorded calls and how your strongest seller wins",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Ramp plan for each new rep",
            "v": "30/60/90 days, with pipeline milestones",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Data operators design comp from",
            "v": "18 to 24 months of your own pipeline, bookings and comp",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Director or VP of Sales seat",
            "v": "[[cost:vp-sales.monthly]], for [[cost:vp-sales.hours|lower]]",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          }
        ],
        "sections": [
          {
            "id": "system-first",
            "h": "Should we build the system before we hire the reps?",
            "blocks": [
              {
                "p": "Yes, in most cases. New reps learn whatever system is there. If the process lives in the founder's head, every hire depends on the founder."
              },
              {
                "p": "A common starting point in our engagements is a company that already has the product, the lead flow and a founder who wins deals, but no documented, teachable version of how. That is why new reps cannot reproduce it. The fix is to write down the motion that already wins, in structured intake sessions, not to import a new methodology."
              },
              {
                "p": "In the engagements we have seen, a phased start worked better than hiring reps first. A part-time leader builds the follow-up motion, the target list, the KPIs and the playbook, then reps are added into it."
              }
            ]
          },
          {
            "id": "checklist",
            "h": "What needs to be in place before the next hire?",
            "blocks": [
              {
                "ol": [
                  "**A documented sales process.** Stage gates, CRM standards, discovery and close talk tracks, and an objection guide built from the objections that come up in real calls.",
                  "**A hiring profile.** Built from what your strongest rep actually does, separating their outcomes from the behavior a new hire can repeat.",
                  "**An interview process.** Questions on territory planning, self-sourcing and running discovery through proposal, plus a role-play as a selection tool.",
                  "**A ramp plan.** Outcomes at day 30, 60 and 90, a library of recorded calls, role-play and certification.",
                  "**A comp plan reps understand.** Clear activity expectations tied to earnings, and SDR pay with a written qualification rule."
                ]
              },
              {
                "p": "Then decide how many reps you need, what each should produce and the order to hire them. Operators make that recommendation inside the plan."
              }
            ]
          },
          {
            "id": "coaching",
            "h": "Will the operator coach our reps and managers, not just report on the numbers?",
            "blocks": [
              {
                "p": "Yes. Operators coach managers so they can carry the process, and coach reps in the work itself."
              },
              {
                "ul": [
                  "**Game tape.** A weekly review of recorded calls.",
                  "**Role-play.** Against written talk tracks, until execution is consistent.",
                  "**One-to-ones.** Every week or two, with documented coaching notes for each rep."
                ]
              },
              {
                "p": "Training builds knowledge and coaching builds skill, so plan for both. In larger teams the operator coaches the managers first. In small teams with no sales manager, the fractional leader manages the reps directly."
              },
              {
                "p": "When a rep will not run the new process, the operator makes it visible with CRM and call data, sets clear standards and a short written window to change, then gives you a keep, invest or exit recommendation with the reasoning. The decision on any exit stays with you. CRM non-adoption is treated as an accountability problem, not a tooling problem."
              }
            ]
          },
          {
            "id": "hiring",
            "h": "Can the operator help us define, find and interview the reps we hire next?",
            "blocks": [
              {
                "p": "Yes, as hiring support rather than recruiting. Inside the monthly hours the operator writes the role profile and comp structure, sets the hiring sequence, designs the interview process and role-plays, joins interviews and builds the onboarding plan. You make the hire."
              },
              {
                "table": {
                  "head": [
                    "Hiring work",
                    "In a sales leader seat"
                  ],
                  "rows": [
                    [
                      "Role profile and comp structure",
                      "Included"
                    ],
                    [
                      "Rep count, production per rep and hiring order",
                      "Included"
                    ],
                    [
                      "Interview design and role-plays",
                      "Included"
                    ],
                    [
                      "Joining interviews",
                      "Included"
                    ],
                    [
                      "Onboarding plan",
                      "Included"
                    ],
                    [
                      "Sourcing candidates and placement",
                      "Out of scope unless added by written amendment"
                    ]
                  ]
                },
                "note": "From our recent sales leader statements of work."
              },
              {
                "p": "If you need candidates found, add sourcing by amendment or have your recruiter work from the operator's profile."
              }
            ]
          },
          {
            "id": "ramp",
            "h": "What does a 90-day ramp for new reps look like?",
            "blocks": [
              {
                "p": "The ramp plan comes out of the sales process work, so it teaches the same system the team already runs."
              },
              {
                "ul": [
                  "**Tell, show, do.** Training that explains the process, shows it on real recorded calls with real objections, then has the rep run it.",
                  "**Certification.** Product certification and mock demos before a rep runs live calls alone.",
                  "**Pipeline milestones.** The outcomes a rep should reach by day 30, 60 and 90, written into the plan.",
                  "**Reinforcement.** Weekly coaching continues after the formal ramp ends."
                ]
              },
              {
                "p": "The aim is reps who plug into a system rather than depend on one strong seller. The handoff pattern we have seen is train-the-trainer with your internal trainer, plus about three months of weekly reinforcement. When the training load is large, a dedicated enablement operator can take it on, usually as a lighter second seat of about 20 hours a month."
              }
            ]
          },
          {
            "id": "comp",
            "h": "Can you help design comp, quotas and commission plans?",
            "blocks": [
              {
                "p": "Yes. Operators design comp plans, quotas and SDR pay from your own data, typically 18 to 24 months of pipeline, bookings and comp, plus their own experience. We do not bring a proprietary benchmark dataset, and final decisions on pay stay with you."
              },
              {
                "ul": [
                  "**Quota-carrying reps.** One design we have seen used a roughly 50/50 split of base and variable, with activity math tied to each rep's earnings goal.",
                  "**SDRs.** Pay that triggers only when a booked meeting becomes a qualified opportunity, with a written qualification rule and a view for the SDR into what happens after the handoff."
                ]
              },
              {
                "p": "Unclear qualification rules are the most common comp dispute we see. Write the rule down before the plan goes live."
              }
            ]
          },
          {
            "id": "not-right",
            "h": "When is it too early to build for more reps?",
            "blocks": [
              {
                "ul": [
                  "**You have only a few closed deals.** If the founder is still finding the repeatable sale, a fractional sales leader is usually too early. Sell to a narrow customer profile and write down what works first.",
                  "**Your customer profile is still \"SMB\".** A broad profile with no measured funnel means there is nothing yet to teach a new rep.",
                  "**You need one more closer, not a system.** If the process works and you are simply short a seller, hire the rep."
                ]
              },
              {
                "p": "[[link:guide.how-to-stop-running-sales-as-a-founder|How to stop running sales as a founder]] covers the handoff from a founder-led sale, and the [[link:hire-fractional-sales-vp|fractional VP of Sales]] page shows who does this work, and [[link:fractional-cost|the cost hub]] lists what each seat costs. Market-wide rates are on [[link:rates.sales_leadership|the Rate Index (illustrative)]]."
              }
            ]
          }
        ],
        "faq": [
          {
            "q": "Will the operator recruit candidates for us?",
            "a": "Not by default. Sourcing and placement are out of scope in our recent sales leader agreements. The operator writes the profile, designs the interviews, joins them and builds onboarding, and sourcing can be added by written amendment."
          },
          {
            "q": "Can the operator tell us whether our current reps are the right people?",
            "a": "Yes. By day 90 you get a written assessment of each rep with a keep, invest or exit recommendation and the reasoning. The decision stays with you."
          },
          {
            "q": "Can a fractional sales leader also sell for us?",
            "a": "Usually not. A sales leader seat builds, coaches and manages the team that sells, and closing is out of scope unless the agreement adds it. If you only need a closer, a fractional seller seat fits better."
          },
          {
            "q": "Do you bring comp benchmarks?",
            "a": "No proprietary dataset. Operators design from 18 to 24 months of your own pipeline, bookings and comp data, plus their own experience."
          }
        ],
        "talk": "If you are about to hire and want the system in place first, tell us about your team through the [[link:talk.team|Talk to us form]]. Four short questions, only name and email required. We reply with a role profile and 2 to 3 vetted operators, often within 48 hours, and you meet them before you sign.",
        "gaps": [
          {
            "what": "reviewing operator name and sign-off (shown in the byline, not in the text)",
            "owner": "Owner"
          },
          {
            "what": "a stand-alone onboarding engagement with hours, price and result, cleared to publish",
            "owner": "Owner"
          },
          {
            "what": "an outside comp benchmark and its source, if the company wants to cite one",
            "owner": "Owner"
          }
        ],
        "flags": [
          "Medium confidence, phrased as what we have seen. The ramp section (rs-onboard), comp designs (rs-comp, the roughly 50/50 split) and the phased start before hiring (fv-too-early guide notes) each rest on a few 2026 agreements and calls.",
          "Not used. The \"around $1M in annual revenue\" readiness line (fv-too-early) comes from one call, so the too-early list gives signs instead of a revenue figure."
        ]
      },
      {
        "slug": "should-you-fix-your-crm-or-switch",
        "kind": "new",
        "kindL": "Systems",
        "template": "answer",
        "fn": "revops",
        "cat": "revenue_operations",
        "need": "systems",
        "persona": "P3",
        "q": "Should you fix your CRM or switch?",
        "metaTitle": "Should You Fix Your CRM or Switch? A RevOps Answer",
        "metaDescription": "Most CRM problems are setup, governance and adoption, not the tool. When to fix, when to switch, who does the work and what RevOps help costs.",
        "term": "fix crm or switch",
        "prompt": "Should we fix our current CRM or switch to a new one?",
        "publish": null,
        "updated": "2026-10-17",
        "base": "Proposed guide b3 in the buyer questions backlog (Oct 17, 2026), answered from Revenue Nomad's 2026 agreements, statements of work and buyer calls, generalized with no company named",
        "words": 915,
        "opsQ": "CRM",
        "stat": {
          "v": "[[cost:revops-project.fixed]]",
          "l": "For a fixed 30-day RevOps project"
        },
        "related": [
          "fractional-revops-consultant",
          "revops-vs-sales-ops"
        ],
        "replaces": [],
        "answer": "Usually fix it first. In our recent engagements the problem was setup, governance and adoption, not the tool. Switch only when the CRM cannot support how you sell or the data you need.",
        "keys": [
          {
            "k": "Fixed 30-day RevOps project",
            "v": "[[cost:revops-project.fixed]]",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "RevOps assessment with scorecard, specs and roadmap",
            "v": "[[cost:revops-assessment.fixed]]",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Follow-on RevOps execution",
            "v": "[[cost:revops-retainer.hourly]], [[cost:revops-retainer.hours|lower]]",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Sales tools in one recent brief",
            "v": "6 to 8, connected ad hoc",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          }
        ],
        "sections": [
          {
            "id": "fix-or-switch",
            "h": "Do we need to switch CRMs, or can you fix what we have?",
            "blocks": [
              {
                "p": "Usually fix it first. When we look under a struggling CRM, the cause is rarely the software."
              },
              {
                "ul": [
                  "**Stages that do not match how you sell.** The CRM was set up on the fly, so the stages and required fields do not mirror the real process.",
                  "**Tools overwriting each other.** Enrichment tools write over the same fields, and nobody owns which source wins.",
                  "**Data living outside the CRM.** Renewals tracked in a spreadsheet, or product usage stranded in a BI tool.",
                  "**Broken basics.** Email tracking that fails quietly, or reports that hit the tool's limits.",
                  "**Low adoption.** Reps update the CRM before leadership meetings and not otherwise."
                ]
              },
              {
                "p": "A migration fixes none of those. Each one comes back in the new tool unless the process and the ownership change first."
              }
            ]
          },
          {
            "id": "when-switch",
            "h": "When does switching make sense?",
            "blocks": [
              {
                "p": "Switch when the CRM genuinely cannot support your motion or your data. The clearest trigger we have seen is a CRM configured for other divisions of a larger group, built around a motion the team did not run."
              },
              {
                "table": {
                  "head": [
                    "",
                    "Fix what you have",
                    "Switch"
                  ],
                  "rows": [
                    [
                      "When it fits",
                      "Setup, governance or adoption is the problem",
                      "The tool cannot support your motion or your data"
                    ],
                    [
                      "First step",
                      "Map the current state and write the spec",
                      "Map the current state and write the spec"
                    ],
                    [
                      "Who builds it",
                      "Your admin or a RevOps specialist",
                      "A RevOps or systems specialist, with your admin"
                    ],
                    [
                      "Main risk",
                      "Fixing fields without fixing the process",
                      "Moving the same problems into a new tool"
                    ]
                  ]
                }
              },
              {
                "p": "Either way, write down what each team needs from the system before you price a path. A spec written first is what makes a rebuild or a migration worth paying for."
              }
            ]
          },
          {
            "id": "who-does-the-work",
            "h": "Can you set it up properly, and who does the hands-on work?",
            "blocks": [
              {
                "p": "It depends on the seat. In sales leader engagements, the operator writes the CRM specification, with stages, required fields and reports that mirror the sales process, and your admin configures it. In a RevOps seat, the operator can do the hands-on build too, including administration, rebuilds and migrations, or hand the specification to your admin."
              },
              {
                "ul": [
                  "**Revenue leadership** decides what gets measured, sets the KPI framework and owns the forecast method.",
                  "**CRM admin** keeps fields, workflows and reports clean.",
                  "**Systems work** connects the tools and builds the dashboards."
                ]
              },
              {
                "p": "Some engagements pair a revenue lead with a separate CRM and RevOps specialist, so a senior leader is not cleaning up picklists. [[link:guide.revops-vs-sales-ops|RevOps vs sales ops]] shows where each job sits, and [[link:fractional-revops|fractional RevOps]] covers who you get."
              }
            ]
          },
          {
            "id": "one-view",
            "h": "Can you connect our tools so data flows into one view we trust?",
            "blocks": [
              {
                "p": "Yes, with the CRM as the hub. One recent brief described 6 to 8 sales tools connected ad hoc, with reports stitched together by hand."
              },
              {
                "ol": [
                  "**Agree the numbers.** Which numbers leadership needs for pipeline review and forecasting.",
                  "**Map the current state.** How each tool connects today, and where data is copied by hand.",
                  "**Write the blueprint.** Fields, integrations and dashboards, built around decisions rather than dashboard volume.",
                  "**Build and govern.** A RevOps or systems specialist builds it, yours or one we add, and the CRM stays the source of truth."
                ]
              },
              {
                "p": "The first deliverable leadership values is a single trusted baseline built on cleaned data. Reporting should change behavior, so make it actionable, not a way to catch people out. [[link:guide.how-to-fix-sales-forecast-accuracy|Why forecasts miss]] shows what a diagnosis finds."
              }
            ]
          },
          {
            "id": "tools-advice",
            "h": "Will you give us a straight opinion on which sales tools to use?",
            "blocks": [
              {
                "p": "Yes. Operators give a direct recommendation once they have seen how you sell. A frequent finding is that the tools a company already pays for are under-used or misconfigured, so the answer is often to use what you own better rather than add another one."
              },
              {
                "p": "Evaluate sequencing, data and call tools against the process on paper, and keep work inside the CRM rather than adding a point tool. Any software a plan recommends is bought by you, in your name, and set up in your own accounts, so it stays yours."
              },
              {
                "p": "What it costs depends on the job. In our 2026 engagements a 30-day RevOps project ran [[cost:revops-project.fixed|lower]], and [[link:fractional-cost|the cost hub]] lists every seat. For market-wide rates, see [[link:rates.revenue_operations|Revenue Operations rates on the Rate Index (illustrative)]]."
              }
            ]
          },
          {
            "id": "not-right",
            "h": "When is a CRM project the wrong first step?",
            "blocks": [
              {
                "ul": [
                  "**Nobody agrees on the sales process.** A CRM can only mirror a process that exists, so settle the process first.",
                  "**You want new software to fix adoption.** Non-adoption is a process and accountability problem. A new tool will not solve it.",
                  "**You need a builder, not a strategist.** If the spec is clear and only configuration is left, hire an admin or systems specialist for that work."
                ]
              }
            ]
          }
        ],
        "faq": [
          {
            "q": "What does it cost to fix a CRM?",
            "a": "It depends on scope. In our 2026 engagements a 30-day RevOps project ran [[cost:revops-project.fixed|lower]], an assessment with scorecard, specs and roadmap ran [[cost:revops-assessment.fixed]], and follow-on execution ran [[cost:revops-retainer.hourly]]."
          },
          {
            "q": "Will you work inside the tools we already pay for?",
            "a": "Yes. Operators work inside your existing systems, and the usual finding is that current tools are under-used. Anything new a plan recommends is bought by you, in your name."
          },
          {
            "q": "Who owns the CRM setup after the engagement?",
            "a": "You do. Everything built for you is yours under the agreement, it is set up in your own accounts, and your admin runs it."
          }
        ],
        "talk": "If your CRM is not telling you the truth, describe what breaks through the [[link:talk.systems|Talk to us form]]. Four short questions, only name and email required. We reply with a role profile and 2 to 3 vetted operators matched to your stack and stage, often within 48 hours, and you meet them before you sign.",
        "gaps": [
          {
            "what": "reviewing operator name and sign-off (shown in the byline, not in the text)",
            "owner": "Owner"
          },
          {
            "what": "one CRM rebuild or migration engagement with scope, hours and price, cleared to publish",
            "owner": "Owner"
          },
          {
            "what": "the stance on vendor referral arrangements and disclosure, before the guide says anything about them",
            "owner": "Owner"
          }
        ],
        "flags": [
          "Medium confidence, phrased as what we see. Fix-first (ts-crm), connecting tools (ts-stack) and tool advice (ts-advice) rest on a few 2026 agreements and buyer calls. The fix-or-switch table is a summary of those, not a measured result.",
          "Left out on purpose. ts-advice's \"no referral or resale arrangements\" line and the disclosure promise are a proposed policy for the owner, so the guide does not make either claim."
        ]
      },
      {
        "slug": "where-ai-fits-in-sales",
        "kind": "new",
        "kindL": "AI in sales",
        "template": "answer",
        "fn": "revops",
        "cat": "ai_gtm",
        "need": "ai",
        "persona": "P2 and P3",
        "q": "Where does AI fit in sales, and what still needs a person?",
        "metaTitle": "Where AI Fits in Sales and What Still Needs a Person",
        "metaDescription": "Where AI pays off in a sales process, where it fails, whether to buy or build, and how to roll it out across a team, from our 2026 AI GTM work.",
        "term": "ai in the sales process",
        "prompt": "Where does AI fit in our sales process, and what still needs a person?",
        "publish": null,
        "updated": "2026-10-17",
        "base": "Proposed guide b4 in the buyer questions backlog (Oct 17, 2026), answered from Revenue Nomad's 2026 agreements, statements of work and buyer calls, generalized with no company named",
        "words": 970,
        "opsQ": "AI",
        "stat": {
          "v": "60 to 90 days",
          "l": "Test window we set to prove lift, one use case at a time"
        },
        "related": [
          "should-you-fix-your-crm-or-switch",
          "keep-what-an-operator-builds"
        ],
        "replaces": [],
        "answer": "AI fits the preparation and admin around selling, like research, enrichment, call notes, CRM updates and first-draft follow-ups. A person still picks the problem, approves what goes out, runs the conversations and makes the call.",
        "keys": [
          {
            "k": "Test window we set to prove lift",
            "v": "60 to 90 days, one use case at a time",
            "src": "Revenue Nomad 2026 engagement plans",
            "url": ""
          },
          {
            "k": "Planned rollout from internal test to the whole team, per use case",
            "v": "About 4 to 5 weeks",
            "src": "Revenue Nomad 2026 engagement plans",
            "url": ""
          },
          {
            "k": "Discovery before any build",
            "v": "Usually the first 2 to 3 weeks",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Standing up one enrichment workflow, in one comparison",
            "v": "11 to 15 hours ready-made, 16 to 22 hours custom",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          }
        ],
        "sections": [
          {
            "id": "where-ai-fits",
            "h": "What parts of the sales process can AI take on?",
            "blocks": [
              {
                "p": "AI fits most clearly in the preparation and admin around selling. The work that has paid off in the engagements we have seen is narrow and repeatable."
              },
              {
                "ul": [
                  "**Call summaries and follow-up drafts.** Written into the CRM after each call, for the rep to edit and send.",
                  "**Account research and enrichment.** Company and contact data filled in before outreach.",
                  "**Account snapshots.** A short brief before a call, built from what the CRM already knows.",
                  "**Scoring.** Ranking accounts and leads, so reps spend time on the right ones.",
                  "**Coaching flags.** Moments in recorded calls worth a manager's attention."
                ]
              },
              {
                "p": "Keep sequences in the CRM and let AI fill in data, rather than giving it admin access to your systems."
              }
            ]
          },
          {
            "id": "needs-a-person",
            "h": "What still needs a person?",
            "blocks": [
              {
                "p": "A person still picks the problem, approves what goes out, runs the qualification call, owns the relationship and makes the decision."
              },
              {
                "p": "AI fits poorly as a stand-in for a seller. Generic AI-written outreach gets opened but not answered. In one case we saw, it produced high open rates and no meetings, and fully autonomous AI SDRs have tested poorly in the work we have seen."
              },
              {
                "p": "So a person reviews what AI produces before it reaches a customer. Build that review into a step someone already does, rather than adding it as an afterthought."
              }
            ]
          },
          {
            "id": "where-to-start",
            "h": "Where should we start, and when is automation worth it?",
            "blocks": [
              {
                "p": "Start from one measurable problem, not a tool. Common symptoms are reps spending time on the wrong deals, a forecast that is a guess, and SDRs drowning in research."
              },
              {
                "ol": [
                  "**Pick one problem.** The one that costs the most time or money today.",
                  "**Take a baseline.** Measure it before anything is built, so the lift can be shown.",
                  "**Get the data right.** Treat the CRM as a source of facts, not prose, so the model works over facts and makes less up.",
                  "**Land it in existing work.** Put the output where someone already works, such as the manager's one-to-one or a CRM task, not a dashboard nobody checks.",
                  "**Set a 60 to 90 day test window.** Then decide whether to scale it."
                ]
              },
              {
                "p": "Most companies do not have the data, KPIs or process mapped well enough to build on day one, so the first 2 to 3 weeks are usually discovery. If the process an AI tool would run is not written down yet, write it down first. Start IT and security review early too, because that is where most builds stall."
              }
            ]
          },
          {
            "id": "buy-or-build",
            "h": "Should we buy off-the-shelf AI tools or have something built?",
            "blocks": [
              {
                "p": "Use ready-made tools where they cover the job, and build only where your process or data is the advantage."
              },
              {
                "table": {
                  "head": [
                    "",
                    "Ready-made tool",
                    "Custom build"
                  ],
                  "rows": [
                    [
                      "Time to a first demo",
                      "Same day",
                      "2 to 3 days"
                    ],
                    [
                      "Hours to stand up one enrichment workflow",
                      "11 to 15",
                      "16 to 22"
                    ],
                    [
                      "Control and explainability",
                      "Low",
                      "Higher"
                    ],
                    [
                      "Reuse in other workflows",
                      "Low",
                      "Higher"
                    ]
                  ]
                },
                "note": "From one build-versus-buy comparison in our 2026 engagements. Hours vary with the workflow."
              },
              {
                "p": "A custom build should state its limits in writing, for example that its scores are estimates rather than verified data, and flag low-confidence records for a person to review."
              }
            ]
          },
          {
            "id": "roll-out",
            "h": "How do we roll AI out across the whole team?",
            "blocks": [
              {
                "p": "One use case at a time. The rollout we plan takes each build through internal testing, then a small test group of reps, then the whole team, in a cycle of roughly four to five weeks, with a baseline taken first."
              },
              {
                "p": "The plan is for what is built to live in your systems, ship with handoff documentation and pass to your RevOps team to run, with training so they can maintain it. Everything built for you is yours under the agreement, and ongoing tuning can continue on a retainer if you want it. Our recent operator agreements also bar operators from putting your data into AI tools you have not approved."
              },
              {
                "p": "Before you hire anyone for AI work, ask what broke after their last go-live and who owns it now. Pilots that stop at launch, and output that lands in a dashboard instead of a workflow, are the failure modes we see most."
              },
              {
                "p": "We do not publish a real AI GTM price range yet. [[link:guide.fractional-ai-gtm-cost|What AI GTM help costs]] and [[link:rates.ai_gtm|AI GTM rates on the Rate Index]] use illustrative figures until the first survey closes, and [[link:fractional-cost|the cost hub]] has the seats we have real prices for."
              }
            ]
          },
          {
            "id": "not-right",
            "h": "When is AI the wrong first move?",
            "blocks": [
              {
                "ul": [
                  "**There is no process to automate yet.** AI speeds up a process. It does not design one.",
                  "**You want an end-to-end AI organization on day one.** Prove one use case before building the next.",
                  "**You want AI to replace your sellers.** Autonomous outreach has tested poorly. Use AI to give sellers more time with buyers."
                ]
              },
              {
                "p": "If the data underneath is the problem, start with [[link:guide.should-you-fix-your-crm-or-switch|whether to fix your CRM or switch]], or see [[link:fractional-revops|fractional RevOps]]."
              }
            ]
          }
        ],
        "faq": [
          {
            "q": "Can AI let a small sales team do the work of a bigger one?",
            "a": "For specific, repeatable tasks, yes, such as call notes, research and follow-up drafts. We do not have a cleared result with hours saved to publish yet, so measure your own baseline first."
          },
          {
            "q": "Will a person review what AI produces before it goes out?",
            "a": "Yes. A person approves anything that reaches a customer, and custom builds flag low-confidence records for review."
          },
          {
            "q": "Will what you build hold up as the tools change?",
            "a": "Builds live in your systems with handoff documentation, and your RevOps team is trained to maintain them. Ongoing tuning can continue on a retainer."
          },
          {
            "q": "Can operators put our data into AI tools?",
            "a": "Only tools you have approved. Our recent operator agreements bar operators from putting your data into AI tools you have not approved, and your information stays confidential."
          }
        ],
        "talk": "Tell us the one problem you want AI to take off your team through the [[link:talk.ai|Talk to us form]]. Four short questions, only name and email required. We reply with a role profile and 2 to 3 vetted operators, often within 48 hours, and you meet them before you sign.",
        "gaps": [
          {
            "what": "reviewing operator name and sign-off (shown in the byline, not in the text)",
            "owner": "Owner"
          },
          {
            "what": "one AI engagement with measured hours saved and the client's OK to publish",
            "owner": "Owner"
          },
          {
            "what": "maintenance terms after an AI handoff, such as response times for fixes",
            "owner": "Owner"
          },
          {
            "what": "a recording and consent policy for calls and AI note-takers",
            "owner": "Owner"
          }
        ],
        "flags": [
          "Medium confidence throughout. The AI answers (ts-ai-replace, ts-ai-where, ts-ai-buildbuy, ts-ai-team) rest on partner-delivered build documents, one AI strategist role profile and buyer calls. The build-versus-buy hours come from one comparison and are labelled that way. Projected productivity numbers in a partner proposal are targets and are not used.",
          "Left out. fx-diy (why not do it ourselves) is low confidence, so the guide does not argue the do-it-yourself case."
        ]
      },
      {
        "slug": "keep-what-an-operator-builds",
        "kind": "new",
        "kindL": "Handoff",
        "template": "answer",
        "fn": "sales",
        "cat": "sales_leadership",
        "need": "sales_motion",
        "persona": "P1, P2 and P3",
        "q": "How do you keep what an operator builds after they leave?",
        "metaTitle": "Keep What a Fractional Operator Builds After They Leave",
        "metaDescription": "Ownership, documents, a step-down in hours and managers who already run the meetings. How to make a fractional engagement's work survive the handoff.",
        "term": "fractional handoff",
        "prompt": "How do we keep what a fractional leader builds after they leave?",
        "publish": null,
        "updated": "2026-10-17",
        "base": "Proposed guide b5 in the buyer questions backlog (Oct 17, 2026), answered from Revenue Nomad's 2026 agreements, statements of work and buyer calls, generalized with no company named",
        "words": 890,
        "opsQ": "sales playbook",
        "stat": {
          "v": "30 to 20",
          "l": "Hours a month, one build stepping down after day 90"
        },
        "related": [
          "fractional-vp-of-sales-first-90-days",
          "how-a-fractional-leader-works-with-your-team"
        ],
        "replaces": [],
        "answer": "Everything built for you is yours and lives in your systems. Hours step down after the build while your managers take over the meetings, so the work runs without the operator.",
        "keys": [
          {
            "k": "Hours after the build, in recent statements of work",
            "v": "Often lower than the build, for example 30 down to 20 a month",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Ongoing support per seat after a 90-day build",
            "v": "About $4k - $6k/month, as discussed",
            "src": "Revenue Nomad 2026 buyer calls",
            "url": ""
          },
          {
            "k": "Operator notice before stepping away",
            "v": "30 days, with handoff calls to a replacement",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Your information returned or deleted at the end",
            "v": "Within 48 hours",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          }
        ],
        "sections": [
          {
            "id": "who-owns-it",
            "h": "Where does what you build live, and will we own it?",
            "blocks": [
              {
                "p": "Everything built for you is yours. Every client agreement treats deliverables, playbooks, lists, workflows and systems as work made for hire, owned by your company as it is created. Anything an operator brings from earlier work, such as a template or framework, is licensed to you permanently."
              },
              {
                "p": "Work is done in your own systems and tools, not the operator's. At the end, operators return all company material and return or delete your information within 48 hours."
              },
              {
                "p": "Check two things in any agreement, ours or anyone's. That it covers pre-existing material with a permanent license, not just new work, and that tools are set up in your accounts."
              }
            ]
          },
          {
            "id": "what-you-keep",
            "h": "What does the handoff leave behind?",
            "blocks": [
              {
                "p": "The work is written down as it is built, not at the end."
              },
              {
                "table": {
                  "head": [
                    "What you keep",
                    "Why it matters"
                  ],
                  "rows": [
                    [
                      "A documented sales process with stage gates",
                      "A new rep or manager can run the same process"
                    ],
                    [
                      "Scripts and an objection guide",
                      "The talk tracks outlive the person who wrote them"
                    ],
                    [
                      "The plan",
                      "Leadership can see what was decided and why"
                    ],
                    [
                      "A CRM specification",
                      "Your admin can maintain the system"
                    ],
                    [
                      "Coaching notes for each rep",
                      "The next manager starts from the record"
                    ],
                    [
                      "Updated onboarding materials",
                      "The process survives turnover"
                    ]
                  ]
                },
                "note": "The deliverables in our 2026 sales leader statements of work."
              },
              {
                "p": "Name in the scope who owns each document after the operator leaves, and when your managers take over each meeting."
              }
            ]
          },
          {
            "id": "adoption",
            "h": "How do we make sure the team actually uses what gets built?",
            "blocks": [
              {
                "p": "Have your managers run it before the operator steps back. In the handoffs we have seen, managers run the weekly scoreboard and pipeline review themselves while the operator is still there to coach them."
              },
              {
                "p": "Adoption is a management habit, not a tooling problem. When reps do not use the CRM or the new talk tracks, the operator makes it visible with data, sets a standard and coaches to it, and your managers keep holding that line after the handoff."
              },
              {
                "p": "Push every playbook change into the decks and job aids that depend on it, or the team keeps using the old version."
              }
            ]
          },
          {
            "id": "step-down",
            "h": "What does the step-down look like?",
            "blocks": [
              {
                "p": "The step-down in hours is the handoff. Hours drop after the build phase while the operator shifts from building to coaching the managers who now run the cadence."
              },
              {
                "stats": [
                  {
                    "v": "30 to 20",
                    "l": "Hours a month, one build stepping down after day 90",
                    "src": "Revenue Nomad 2026 engagements"
                  },
                  {
                    "v": "$4k - $6k/month",
                    "l": "Per seat for ongoing support, as discussed in recent buyer calls",
                    "src": "Revenue Nomad 2026 buyer calls"
                  }
                ]
              },
              {
                "p": "Plan the step-down in the statement of work, so day 90 is not a renegotiation. You can also change the hour block with 30 days' written notice."
              },
              {
                "p": "Ongoing work is enablement, such as a weekly pipeline review, a monthly forecast, quarterly tune-ups of the system and messaging, and coaching new hires. It can wind down once your own team or a full-time hire owns it."
              }
            ]
          },
          {
            "id": "successor",
            "h": "Can the operator hand over to a full-time hire?",
            "blocks": [
              {
                "p": "Yes. When you are ready for a permanent leader, the operator helps define the role, hire them and onboard them. Successor support is written into leadership seats, and the cleanest plans put hiring and onboarding the successor in the scope from the start."
              },
              {
                "p": "There is no standard overlap period, so agree one if you want it. Hiring the operator full time instead carries a conversion fee written into the agreement. [[link:guide.interim-vs-fractional-vs-full-time-sales-leader|Interim, fractional or full-time]] compares the options."
              }
            ]
          },
          {
            "id": "new-leader",
            "h": "Will the work survive a new leader or a reorganization?",
            "blocks": [
              {
                "p": "It is designed to. Engagements end with the process, scoreboard and meeting rhythm run by your own managers, enablement and onboarding materials updated so they survive turnover, and everything documented in your systems."
              },
              {
                "p": "A new leader can still change direction. That is why the handoff rests on documents and habits your team already owns, not on the operator's memory. The [[link:hire-fractional-sales-vp|fractional VP of Sales]] page shows who does this work, [[link:fractional-cost|the cost hub]] what it costs, and [[link:rates.sales_leadership|the Rate Index (illustrative)]] market-wide rates."
              }
            ]
          },
          {
            "id": "not-right",
            "h": "What makes a handoff fail?",
            "blocks": [
              {
                "ul": [
                  "**The process lives in the operator's head.** If it is not written down in your systems, it leaves with them.",
                  "**Dashboards nobody inspects.** A scoreboard only works while your managers keep running the meeting around it.",
                  "**Changes that never reach the job aids.** Update the decks and guides when the playbook changes."
                ]
              }
            ]
          }
        ],
        "faq": [
          {
            "q": "Do we own everything the operator builds?",
            "a": "Yes. Every client agreement treats the work as made for hire and owned by your company as it is created, with a permanent license to anything the operator brings from earlier work."
          },
          {
            "q": "What happens if the operator leaves partway through?",
            "a": "Revenue Nomad stays responsible for delivery. We present replacement candidates and move the work over at no added cost. Operators owe 30 days' notice and join handoff calls with the replacement."
          },
          {
            "q": "Is there a standard overlap at the end?",
            "a": "No. Agree one in the scope if you want it. The step-down in hours usually does the job of an overlap, because your managers run the meetings while the operator still coaches."
          },
          {
            "q": "What does ongoing support cost after the build?",
            "a": "In recent buyer calls, ongoing support after a 90-day build was discussed at about $4k - $6k/month per seat, with fewer hours than the build, month to month."
          }
        ],
        "talk": "If you want the work to outlast the engagement, say so on the [[link:talk.sales_motion|Talk to us form]]. Four short questions, only name and email required. We reply with a role profile and 2 to 3 vetted operators, often within 48 hours, and you meet them before you sign.",
        "gaps": [
          {
            "what": "reviewing operator name and sign-off (shown in the byline, not in the text)",
            "owner": "Owner"
          },
          {
            "what": "one conversion-fee rule, so the site and the agreement template agree (the guide says only that the fee is written into the agreement)",
            "owner": "Owner"
          },
          {
            "what": "whether ownership should be conditioned on payment (today the clause is not)",
            "owner": "Owner"
          }
        ],
        "flags": [
          "Medium confidence on the money. The ongoing $4k - $6k/month per seat (cp-ongoing, as discussed) and the step-down examples come from 2026 statements of work, proposals and buyer calls, not from billing. Some agreements leave the post-build rate to be agreed after the assessment.",
          "Ownership (ts-ownership), deliverables (ih-handoff) and replacement (rf-dropout) are high confidence and read as policy."
        ]
      },
      {
        "slug": "what-should-a-fractional-engagement-fix-first",
        "kind": "new",
        "kindL": "Scoping",
        "template": "answer",
        "fn": "sales",
        "cat": "sales_leadership",
        "need": "sales_motion",
        "persona": "P1 and P2",
        "q": "What should a fractional engagement fix first?",
        "metaTitle": "What Should a Fractional Engagement Fix First?",
        "metaDescription": "Scope a fractional engagement around the one or two problems that cost the most. What the first 30 days deliver, and how scope and hours change later.",
        "term": "scope a fractional engagement",
        "prompt": "What should a fractional sales leader fix first, and how do we scope the engagement?",
        "publish": null,
        "updated": "2026-10-17",
        "base": "Proposed guide b6 in the buyer questions backlog (Oct 17, 2026), answered from Revenue Nomad's 2026 agreements, statements of work and buyer calls, generalized with no company named. Replaces the legacy prototype guide how-to-scope-a-fractional-sales-engagement, which conflicted with the real terms",
        "words": 894,
        "opsQ": "sales process",
        "stat": {
          "v": "Day 30",
          "l": "A diagnostic and a ranked list of changes"
        },
        "related": [
          "fractional-vp-of-sales-first-90-days",
          "how-to-hire-a-fractional-vp-of-sales"
        ],
        "replaces": [],
        "answer": "The one or two problems that cost the most, found in a 30-day diagnostic that ranks every fix. Scope the hours to that, then re-rank at the day 30 readout as you learn.",
        "keys": [
          {
            "k": "Diagnostic and ranked list of changes",
            "v": "By day 30",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Process and scripts live with the team",
            "v": "By day 60",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Notice to change the monthly hour block",
            "v": "30 days, by a short addendum",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Fixed 30-day RevOps project",
            "v": "[[cost:revops-project.fixed]]",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Director or VP of Sales seat",
            "v": "[[cost:vp-sales.monthly]], for [[cost:vp-sales.hours|lower]]",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          }
        ],
        "sections": [
          {
            "id": "start-small",
            "h": "Can we start with the one or two things that hurt most?",
            "blocks": [
              {
                "p": "Yes, and you should. A good first month finds the problem that costs the most and fixes it before anything else."
              },
              {
                "p": "Most engagements start with a diagnostic inside the first 30 days. The operator benchmarks what you already have, including your CRM, recorded calls and how your strongest seller wins, breaks conversion down by segment, lead source and rep, and ranks the fixes by impact."
              },
              {
                "table": {
                  "head": [
                    "When",
                    "What you get",
                    "What you decide"
                  ],
                  "rows": [
                    [
                      "Days 1 to 30",
                      "A diagnostic and a ranked list of changes",
                      "Targets and success measures, at the day 30 readout"
                    ],
                    [
                      "Days 31 to 60",
                      "The process and scripts live with the team",
                      "What to keep, change or drop"
                    ],
                    [
                      "Days 61 to 90",
                      "A plan and an assessment of the team",
                      "Whether to scale, step down or end"
                    ]
                  ]
                }
              },
              {
                "p": "Check conversion before volume. If close rates fell while lead volume held, the sales motion is the first fix, not more leads."
              }
            ]
          },
          {
            "id": "focus",
            "h": "How do we decide which customers or segments to focus on first?",
            "blocks": [
              {
                "p": "Usually inside the same 30-day diagnostic, not as a separate project. The operator sizes what each segment needs to hit the plan and recommends where to focus, often narrowing outbound to two or three customer profiles and testing a small batch of accounts before scaling."
              },
              {
                "p": "Narrowing outbound focus does not mean narrowing who you will sell to. Build lookalikes from your real qualified opportunities, not from the whole addressable list, and revisit exclusion rules that quietly drop good prospects."
              }
            ]
          },
          {
            "id": "hours",
            "h": "How many hours should we start with?",
            "blocks": [
              {
                "p": "Match the hours to the job. A [[link:hire-fractional-sales-vp|fractional director or VP of Sales]] seat in our 2026 engagements ran [[cost:vp-sales.hours|lower]] for [[cost:vp-sales.monthly]]. Thin hours fail, so do not buy fewer hours than the first problem needs."
              },
              {
                "p": "Many companies want more hours at the start than they planned, especially when hiring is in scope. A common shape is a heavier build block for about 90 days that steps down to fewer hours afterward. Plan that step-down in the statement of work, so day 90 is not a renegotiation."
              },
              {
                "p": "If budget is tight, start with a fixed project. A 30-day RevOps project ran [[cost:revops-project.fixed|lower]] in our 2026 engagements, and [[link:fractional-cost|the cost hub]] lists every seat. For market-wide rates, see [[link:rates.sales_leadership|Sales Leadership rates on the Rate Index (illustrative)]]."
              }
            ]
          },
          {
            "id": "scope-change",
            "h": "What happens when priorities or scope change once the work is underway?",
            "blocks": [
              {
                "p": "Inside the monthly hour block, priorities can shift without paperwork. Focus areas are refined as you learn, and the day 30 readout is where the plan is formally re-ranked."
              },
              {
                "ul": [
                  "**More hours or a new workstream.** Needs your written approval first, by email, before the work starts.",
                  "**Larger changes.** Go in a short addendum or change order.",
                  "**Approved extra hours.** Billed at the rate in your statement of work, on the next invoice.",
                  "**No revision rounds.** You are buying an operator's time and judgment, not a fixed deliverable, so there are no rounds to count."
                ]
              },
              {
                "p": "One clean trigger to write in is team size. Our statements of work price against a stated team, for example up to five reps, and reopen the hours if the team grows past it."
              }
            ]
          },
          {
            "id": "scale",
            "h": "Can we start small and scale hours up or down?",
            "blocks": [
              {
                "p": "Yes. You can raise or lower the monthly hour block with 30 days' written notice. The change goes in a short addendum and takes effect from the next billing cycle. An increase can start sooner, with a pro-rated invoice for the extra hours that month."
              },
              {
                "p": "The rate usually stays the same. When a company adds a large block of hours or commits to a longer term, the added hours can be priced lower, which brings the blended rate down. Adding hours at the same monthly spend is not a lever that works."
              }
            ]
          },
          {
            "id": "not-right",
            "h": "When does a narrow first scope go wrong?",
            "blocks": [
              {
                "ul": [
                  "**The scope names activities, not a problem.** Write down the outcome you are buying, then the hours.",
                  "**Hours creep past the block.** Extra hours need written approval first, or they cannot be billed or paid.",
                  "**The opt-out hides in the notice clause.** Write any opt-out as a date, separate from the 30 days' notice that applies after the initial term."
                ]
              }
            ]
          }
        ],
        "faq": [
          {
            "q": "Is refining the work included, or will there be change orders?",
            "a": "Shifting priorities inside the monthly hours is included. Only added hours or a new workstream need your written approval, and larger changes go in a short addendum."
          },
          {
            "q": "Can we change our hours later?",
            "a": "Yes, up or down, with 30 days' written notice. The change takes effect from the next billing cycle, and an increase can start sooner with a pro-rated invoice."
          },
          {
            "q": "Is there room on price if we add hours?",
            "a": "Sometimes, when it is tied to commitment. Added hours or a longer term can be priced lower, which brings the blended rate down. A lower rate agreed for a longer commitment assumes you keep that commitment."
          },
          {
            "q": "Can we end it early inside the initial term?",
            "a": "It depends on your agreement. Most of ours name an opt-out point inside the initial term, usually at week 8, week 12 or day 90, so ask for one in writing. After the initial term, either side can end with 30 days' written notice."
          }
        ],
        "talk": "Tell us the one or two problems that cost you most through the [[link:talk.sales_motion|Talk to us form]]. Four short questions, only name and email required. We reply with a role profile and 2 to 3 vetted operators, often within 48 hours, and you meet them before you sign.",
        "gaps": [
          {
            "what": "reviewing operator name and sign-off (shown in the byline, not in the text)",
            "owner": "Owner"
          },
          {
            "what": "research.js still lists the legacy guide how-to-scope-a-fractional-sales-engagement; its link now lands here through the alias",
            "owner": "Rapid Neuron"
          }
        ],
        "flags": [
          "Medium confidence, phrased with care. The segment focus (rs-focus) and the early-exit FAQ (em-exit) rest on a few 2026 agreements; one larger program is a firm six-month term with no opt-out, so the FAQ says \"most of ours\", not every.",
          "Scope changes (em-scope-change), hour changes (em-flex) and price movement (cp-negotiate) are high confidence and read as policy."
        ]
      },
      {
        "slug": "get-your-ceo-or-board-to-approve-fractional-help",
        "kind": "new",
        "kindL": "Approval",
        "template": "answer",
        "fn": "sales",
        "cat": "sales_leadership",
        "need": "sales_motion",
        "persona": "P1 and P2",
        "q": "How do you get your CEO or board to approve fractional help?",
        "metaTitle": "How to Get Your CEO or Board to Approve Fractional Help",
        "metaDescription": "What to bring to the approval meeting. The cost against a full-time hire, a written 30/60/90-day plan, what we stand behind and how you get out.",
        "term": "approve a fractional sales leader",
        "prompt": "How do I get my CEO or board to approve hiring a fractional sales leader?",
        "publish": null,
        "updated": "2026-10-17",
        "base": "Proposed guide b7 in the buyer questions backlog (Oct 17, 2026), answered from Revenue Nomad's 2026 agreements, statements of work and buyer calls, generalized with no company named",
        "words": 919,
        "opsQ": "VP of Sales",
        "stat": {
          "v": "[[cost:vp-sales.pct]]",
          "l": "Of a full-time VP of Sales' monthly cost, for a fractional director or VP"
        },
        "related": [
          "interim-vs-fractional-vs-full-time-sales-leader",
          "fractional-vp-of-sales-cost"
        ],
        "replaces": [],
        "answer": "Bring three things. The cost against the full-time option, a written 30/60/90-day plan with the numbers it will be judged on, and the exit terms. We send that plan in writing after the discovery call.",
        "keys": [
          {
            "k": "A fractional director or VP as a share of full-time monthly cost",
            "v": "[[cost:vp-sales.pct]]",
            "src": "Calculated from our 2026 engagements and the full-time figure below",
            "url": ""
          },
          {
            "k": "Director or VP of Sales seat",
            "v": "[[cost:vp-sales.monthly]], for [[cost:vp-sales.hours|lower]]",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Full-time VP of Sales, total comp",
            "v": "[[cost:vp-sales.fullTime]], about [[cost:vp-sales.fullTimeMonthly]]",
            "src": "Stealth Agents, secondary source citing Glassdoor 2026",
            "url": "https://stealthagents.com/research/cost-of-hiring-a-vp-of-sales-2026"
          },
          {
            "k": "Cost of replacing a sales leader",
            "v": "[[cost:vp-sales.replace]], with 3+ months of ramp",
            "src": "Skaled",
            "url": "https://skaled.com/services/fractional-vp-of-sales/"
          },
          {
            "k": "Notice once the initial term ends",
            "v": "30 days, in writing",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          }
        ],
        "sections": [
          {
            "id": "make-the-case",
            "h": "How do I make the case to our CEO and leadership team?",
            "blocks": [
              {
                "p": "Bring three things to the meeting."
              },
              {
                "ol": [
                  "**The cost against the full-time option.** What the seat costs a month next to a full-time hire, including the cost of getting a full-time hire wrong.",
                  "**A written plan.** Scope, hours, monthly cost, milestones at day 30, 60 and 90, and the numbers the work will be judged on.",
                  "**The exit terms.** The initial term, any opt-out date and the notice after it."
                ]
              },
              {
                "p": "After the discovery call we send that plan in writing, so you can forward it to your CEO, CFO or board. You can also have the CEO and the CFO each meet the finalist before you sign."
              },
              {
                "p": "The objections we hear most are budget fit, an unclear ask on internal time, fear of conflict with existing leaders and wanting a bounded trial. Answer each one in the plan before the meeting."
              }
            ]
          },
          {
            "id": "cost-compare",
            "h": "How does the cost compare with a full-time hire?",
            "blocks": [
              {
                "p": "In our 2026 engagements, a [[link:hire-fractional-sales-vp|fractional director or VP of Sales]] for a team under 5 to 8 reps ran [[cost:vp-sales.monthly]] for [[cost:vp-sales.hours|lower]]. Public estimates put a full-time VP of Sales at [[cost:vp-sales.fullTime|lower]] in total comp, about [[cost:vp-sales.fullTimeMonthly]] ([[url:https://stealthagents.com/research/cost-of-hiring-a-vp-of-sales-2026|Stealth Agents, secondary source citing Glassdoor 2026]])."
              },
              {
                "p": "Count the cost of a wrong hire too. Replacing a sales leader can cost [[cost:vp-sales.replace|lower]], with 3+ months of ramp ([[url:https://skaled.com/services/fractional-vp-of-sales/|Skaled]])."
              },
              {
                "p": "PE-backed companies often weigh fractional against a full-time CRO and a consulting firm in the same decision. [[link:guide.interim-vs-fractional-vs-full-time-sales-leader|Interim, fractional or full-time]] compares all of them, [[link:guide.fractional-vp-of-sales-cost|what a fractional VP of Sales costs]] breaks down every seat, and [[link:fractional-cost|the cost hub]] covers sales, RevOps and marketing. Market-wide rates are on [[link:rates.sales_leadership|the Rate Index (illustrative)]]."
              }
            ]
          },
          {
            "id": "pay-for-itself",
            "h": "How do we know this will pay for itself?",
            "blocks": [
              {
                "p": "Tie the plan to your own numbers, not to a promise. Plans that tie the fee to your own unit economics, such as what a new customer is worth and what you spend to win one, are easier to approve."
              },
              {
                "p": "We do not promise payback. Fees are fixed monthly or fixed project fees, never tied to promised results. What makes the case is a dated diagnostic, targets agreed at the day 30 readout and tracked weekly, and a decision at day 90 against numbers you set yourself."
              }
            ]
          },
          {
            "id": "stand-behind",
            "h": "What results will you stand behind?",
            "blocks": [
              {
                "p": "We stand behind the fit and the deliverables, not a revenue guarantee."
              },
              {
                "ul": [
                  "**The fit.** If the operator is not the right fit, we replace them at no added cost.",
                  "**The deliverables.** Dated deliverables at day 30, 60 and 90, in writing before you sign.",
                  "**The measures.** Success measures agreed at the day 30 readout.",
                  "**A way out.** After the initial term, you can end on 30 days' notice."
                ]
              },
              {
                "p": "Write any opt-out as a date, separate from the notice clause. A monthly summary of what was delivered also helps a board see progress between reviews."
              }
            ]
          },
          {
            "id": "board-plan",
            "h": "Will we get a plan we can take to our board or investors?",
            "blocks": [
              {
                "p": "Yes, when the seat calls for it, and it is written into the plan. Leadership plans deliver a scored baseline and a ranked roadmap, and by day 90 a 12 to 18 month revenue plan with targets, hiring sequence and investment mix that your CEO and CFO can take to the board."
              },
              {
                "ul": [
                  "**A bridge.** From this year's bookings to next year's pipeline plan.",
                  "**Pipeline targets.** By source and quarter, lagged by the sales cycle.",
                  "**A KPI framework.** With the pipeline coverage the plan requires.",
                  "**Org design.** A decision on the permanent team and the leader it needs."
                ]
              },
              {
                "p": "Smaller seats, such as a sales director for a small rep team, end the build phase with a team assessment and a hiring recommendation instead of a board plan. Time the day 30 readout so the plan exists before the board locks next year's number."
              }
            ]
          },
          {
            "id": "not-right",
            "h": "Why do approvals stall?",
            "blocks": [
              {
                "ul": [
                  "**The hours do not fit the budget.** Offer a lower-hour option or a fixed first project instead of the full seat. One board we worked with ruled out three days a week, and a lower-hour option followed.",
                  "**Nobody has said what it asks of the team.** Put the internal time in the plan, usually a weekly 30 to 60 minute session.",
                  "**Existing leaders fear being replaced.** Write the reporting line and the split of work into the scope.",
                  "**The case promises revenue.** Promise dated deliverables and agreed measures instead."
                ]
              }
            ]
          }
        ],
        "faq": [
          {
            "q": "Is there a summary I can forward to our board?",
            "a": "We send the full written plan after the discovery call, with scope, hours, monthly cost, milestones and term. It is written so you can forward it to your CEO, CFO or board."
          },
          {
            "q": "Do you guarantee results?",
            "a": "No. We stand behind the fit and the deliverables. If the operator is not the right fit, we replace them at no added cost, and fees are never tied to promised results."
          },
          {
            "q": "Can our CEO or CFO interview the finalists?",
            "a": "Yes. The CEO and the CFO can each meet the finalist before you sign."
          },
          {
            "q": "Can we start with something smaller to prove it?",
            "a": "Yes. A fixed first project or assessment, with any ongoing seat as a separate decision, is the usual bounded start. Ask for the opt-out date in writing."
          }
        ],
        "talk": "If you need a plan your CEO or board can approve, start on the [[link:talk.sales_motion|Talk to us form]]. Four short questions, only name and email required. We reply with a role profile and 2 to 3 vetted operators, often within 48 hours, and send the written plan after the discovery call.",
        "gaps": [
          {
            "what": "reviewing operator name and sign-off (shown in the byline, not in the text)",
            "owner": "Owner"
          },
          {
            "what": "day-90 results from a 2026 engagement, with the client's OK, for the return side of the case",
            "owner": "Owner"
          },
          {
            "what": "whether a one-page board summary should become a standard document",
            "owner": "Owner"
          }
        ],
        "flags": [
          "Left out. op-roi (no completed day-90 result) and op-cycle (no measured cycle change) are none and low confidence, so the guide makes no payback or cycle-time claim. The pay-for-itself section uses only the method that op-commit and ih-buyin support.",
          "Medium confidence, phrased with care. The approval objections and the CEO and CFO meetings (ih-buyin) come from 2026 emails and buyer calls."
        ]
      },
      {
        "slug": "outbound-without-hurting-your-reputation",
        "kind": "new",
        "kindL": "Pipeline",
        "template": "answer",
        "fn": "sales",
        "cat": "sales_leadership",
        "need": "pipeline",
        "persona": "P1 and P4",
        "q": "How do you build outbound without hurting your reputation?",
        "metaTitle": "How to Build Outbound Without Hurting Your Reputation",
        "metaDescription": "Signal-based outbound with a real offer and a 60-day test. How fractional sales leaders build pipeline without mass blasts, and when outsourced SDRs fit.",
        "term": "outbound without spam",
        "prompt": "How can we build outbound pipeline without becoming spammy and hurting our reputation?",
        "publish": null,
        "updated": "2026-10-17",
        "base": "Proposed guide b8 in the buyer questions backlog (Oct 17, 2026), answered from Revenue Nomad's 2026 agreements, statements of work and buyer calls, generalized with no company named",
        "words": 1134,
        "opsQ": "outbound",
        "stat": {
          "v": "60 days",
          "l": "A controlled outbound test, with a threshold agreed up front"
        },
        "related": [
          "sales-meetings-not-converting",
          "what-should-a-fractional-engagement-fix-first"
        ],
        "replaces": [],
        "answer": "Keep it narrow and relevant. Target a small set of accounts that show buying signals, write in the buyer's language, offer a review of their own numbers, and run a 60-day test before you scale.",
        "keys": [
          {
            "k": "Controlled outbound test",
            "v": "60 days, with a meeting and pipeline threshold agreed up front",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Accounts a month in one design",
            "v": "30 to 40, with 2 to 5 contacts each",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Customer profiles tested at once",
            "v": "2 to 3",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          },
          {
            "k": "Outsourced SDR quotes we have seen",
            "v": "Roughly $5k - $10k/month",
            "src": "Agency quotes companies showed us, 2026",
            "url": ""
          },
          {
            "k": "Hands-on outreach in some leader seats",
            "v": "The first 60 to 90 days, then handed to an SDR, agency or hire",
            "src": "Revenue Nomad 2026 engagements",
            "url": ""
          }
        ],
        "sections": [
          {
            "id": "not-pushy",
            "h": "Can we grow pipeline without becoming pushy or spammy?",
            "blocks": [
              {
                "p": "Yes, if outbound is narrow and relevant instead of high-volume. Outbound tends to fail as generic prospecting into a market that does not respond to it. One outbound design we wrote rests on five things."
              },
              {
                "ul": [
                  "**Depth in the vertical.** Messages that speak to that industry's real problems, in the buyer's language.",
                  "**Proof from peers.** Results from customers of the same size and type.",
                  "**Names the buyer respects.** The vendors, associations and advisors already in front of them.",
                  "**An offer worth a reply.** A no-cost review of the prospect's own numbers, not a demo.",
                  "**Targeting by signal.** Accounts chosen because they show they are ready, not because they are on a list."
                ]
              },
              {
                "p": "Calls back up the emails. In one program we have seen, cold calls booked more meetings than email, and email mostly set up the call."
              },
              {
                "p": "Two things caused pushback in that program. Aggressive framing, such as telling prospects their numbers are bad, and copying the prospect's boss. Personalizing every email by hand also ate the time reps needed for selling."
              }
            ]
          },
          {
            "id": "data",
            "h": "Where will our contact and lead data come from?",
            "blocks": [
              {
                "p": "From more than one place. Operators start with the data already in your CRM, then pair an enrichment source with a second source to fill gaps, and check key contacts by hand."
              },
              {
                "ul": [
                  "**Work the strongest list first.** Log the accounts it misses.",
                  "**Cross-check every month.** Compare against a second source, confirm titles on leadership pages and professional profiles, and call main lines for gaps.",
                  "**Clean up every month.** Remove bad data before it reaches a sequence."
                ]
              },
              {
                "p": "Signals that predict readiness, such as new locations, hiring or leadership changes, usually beat a bigger list. Some signals point the other way. A company in the middle of a major system migration often freezes vendor evaluations for 12 to 24 months."
              },
              {
                "p": "Paid intent data is worth it only when it feeds a defined workflow. Keep that workflow provider-neutral, so you can switch vendors."
              }
            ]
          },
          {
            "id": "still-works",
            "h": "Can outbound still work for us, given how crowded it is?",
            "blocks": [
              {
                "p": "Often, when it is narrow and specific, but it is not guaranteed. We usually run it as a 60-day test with a meeting and pipeline threshold agreed up front, so the decision to scale or hire is made on data."
              },
              {
                "stats": [
                  {
                    "v": "60 days",
                    "l": "Test length, with a threshold agreed up front",
                    "src": "Revenue Nomad 2026 engagements"
                  },
                  {
                    "v": "30 to 40",
                    "l": "Accounts a month in one design, 2 to 5 contacts each",
                    "src": "Revenue Nomad 2026 engagements"
                  },
                  {
                    "v": "2 to 3",
                    "l": "Customer profiles tested at once",
                    "src": "Revenue Nomad 2026 engagements"
                  }
                ]
              },
              {
                "p": "Scale only the plays that work. Markets with fewer than about 25 target accounts underperformed in the program we have seen, so combine small regions. Build lookalikes from your real qualified opportunities, not from the whole addressable list."
              },
              {
                "p": "Do not expect an SDR program to turn pipeline around within 30 days. Judge the test at its end date, against the threshold you set."
              }
            ]
          },
          {
            "id": "new-market",
            "h": "Can someone build a repeatable outbound pipeline, including in a new market?",
            "blocks": [
              {
                "p": "Yes. The same approach opens a new market. Map who is already in front of the buyer there, test two or three customer profiles, and keep only what converts."
              },
              {
                "p": "Be clear early about where the line sits between owning the outbound function and personally running it. The operators we place are leaders who build and manage the team that sells. Some seats include hands-on list building, campaigns and direct outreach for the first 60 to 90 days, until an SDR, agency or new hire takes it over. Daily prospecting in addition to running the team is a different scope with different hours."
              },
              {
                "p": "In a tight vertical, partners can be the cheapest path to new meetings. Map the vendors, associations and advisors already in front of the buyer, and size what a referral or co-marketing motion could add before committing. When the gap is demand rather than outreach, see [[link:fractional-marketing-leadership|fractional marketing leadership]]."
              }
            ]
          },
          {
            "id": "agency",
            "h": "Should we use an agency, outsourced SDRs or a consulting firm instead?",
            "blocks": [
              {
                "p": "An outsourced SDR team buys meeting volume. It does not fix what happens after the meeting. In the calls we see, agencies struggle when the process, CRM and playbook are not yet documented, and offshore teams struggle with complex, relationship-based offers that are hard to explain."
              },
              {
                "table": {
                  "head": [
                    "",
                    "Outsourced SDRs",
                    "Fractional sales leader"
                  ],
                  "rows": [
                    [
                      "What you buy",
                      "Meeting volume",
                      "A named owner of the pipeline motion"
                    ],
                    [
                      "Works when",
                      "The process and playbook already exist",
                      "The process, CRM and playbook need building first"
                    ],
                    [
                      "Judge it on",
                      "Qualified opportunities and closed deals, not activity",
                      "The same numbers, plus the system it leaves behind"
                    ],
                    [
                      "What we have seen it cost",
                      "Roughly $5k - $10k/month, in quotes",
                      "[[cost:vp-sales.monthly]] for a director or VP seat"
                    ]
                  ]
                },
                "note": "Outsourced SDR figures are quotes companies showed us in 2026. The fractional figure is what clients paid in our 2026 engagements."
              },
              {
                "p": "Consulting firms tend to hand over an assessment. A fractional operator is the named owner who carries it out, and can run or manage outsourced SDRs against conversion instead of activity."
              },
              {
                "p": "If you keep outsourced SDRs, measure them past the booked meeting. Target universe, replies, meetings, show rate, qualified opportunities and closed won. If one customer profile brings high no-shows and low qualification, move SDR focus away from it. Pay SDRs on meetings that become qualified opportunities, with a written qualification rule."
              },
              {
                "p": "The [[link:hire-fractional-sales-vp|fractional VP of Sales]] page shows who does this work, [[link:fractional-cost|the cost hub]] what each seat costs, and [[link:rates.sales_leadership|the Rate Index (illustrative)]] market-wide rates."
              }
            ]
          },
          {
            "id": "not-right",
            "h": "When is outbound the wrong place to start?",
            "blocks": [
              {
                "ul": [
                  "**Meetings already come in and do not close.** Fix conversion first. [[link:guide.sales-meetings-not-converting|Why booked meetings do not turn into deals]] shows where they leak.",
                  "**The target market is tiny.** With fewer than about 25 target accounts, combine regions or start with partners and referrals.",
                  "**You want volume for its own sake.** Mass blasts trade your reputation for activity numbers. Start narrow and earn the right to scale."
                ]
              }
            ]
          }
        ],
        "faq": [
          {
            "q": "Will you run our outbound yourselves?",
            "a": "Some leader seats include hands-on outreach for the first 60 to 90 days, until an SDR, agency or new hire takes it over. For ongoing prospecting, a fractional seller such as an SDR is a separate seat."
          },
          {
            "q": "Is paid intent data worth it?",
            "a": "Only when it feeds a defined workflow. Keep the workflow provider-neutral so you can switch vendors, and pair any source with a second one and a monthly cleanup."
          },
          {
            "q": "Can a fractional leader manage our outsourced SDR agency?",
            "a": "Yes. The operator can run or manage outsourced SDRs against conversion, measuring past the booked meeting to qualified opportunities and closed deals."
          },
          {
            "q": "Do you have an outbound result we can see?",
            "a": "Not one cleared to publish yet. Results stay confidential unless the company agrees, so on a call we walk you through how similar programs were scoped, without names."
          }
        ],
        "talk": "If you need pipeline without burning your market, tell us about it through the [[link:talk.pipeline|Talk to us form]]. Four short questions, only name and email required. We reply with a role profile and 2 to 3 vetted operators, often within 48 hours, and you meet them before you sign.",
        "gaps": [
          {
            "what": "reviewing operator name and sign-off (shown in the byline, not in the text)",
            "owner": "Owner"
          },
          {
            "what": "one outbound or new-market result with the client's OK to publish (meeting and pipeline counts stay out until then)",
            "owner": "Owner"
          }
        ],
        "flags": [
          "Medium confidence, phrased as what we have seen. The outbound design (rf-reputation), whether outbound still works (op-outbound-works), data sources (ts-data) and agencies (fx-agency) rest on a few 2026 agreements, one outbound program and buyer calls. That program ran below its target pace, so the guide says outbound works \"often, when it is narrow\", not always.",
          "Held back. The program's meeting counts and target pace are not cleared to publish. rf-capacity (more demand than the team can handle) is low confidence and is left out.",
          "The outsourced SDR quote range ($5k - $10k/month) is from quotes companies showed us, not paid figures, and the table says so."
        ]
      }
    ]
  };
})();
