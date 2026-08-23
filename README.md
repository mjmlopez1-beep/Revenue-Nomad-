# Revenue Nomad

Every open **fractional GTM** role. One board.

Revenue Nomad crawls the web for open fractional, interim, and contract go-to-market roles — fractional CROs, CMOs, RevOps leads, growth operators — scores each listing for relevance, and aggregates everything into a job board inside the **Operator Portal**.

## How it works

1. **Crawl** — source adapters pull from job boards *and* the places people talk about fractional GTM work:
   - **Job boards:** [Remotive](https://remotive.com), [RemoteOK](https://remoteok.com), [We Work Remotely](https://weworkremotely.com), [fractionaljobs.io](https://www.fractionaljobs.io), and any [Greenhouse](https://greenhouse.io) company board via `RN_GREENHOUSE_BOARDS`
   - **Communities:** [Hacker News](https://hn.algolia.com) stories *and* comments (catches "Ask HN: Who is hiring?" threads and founder chatter) and Reddit search — surfaced as **community leads**, distinct from listings on the board
1b. **Predict** — the operator's ICP is deduced from their Revenue Nomad profile (role, industries, stages, employee/revenue size, segment, sales motions) and cross-referenced against a universal company dataset (the open YC company directory) — target accounts are discovered automatically, then enriched with timing signals: actively hiring, early-stage GTM inflection, content gaps, careers-page GTM roles, funding news, and leader departures. No manual account list needed.
2. **Score & filter for truly fractional** — every item needs BOTH a relevance score above threshold AND a genuine fractional signal: fractional/interim/advisory wording, ≤4 days per week, ≤32 hours per week, or hourly-rate pricing. Full-time tells (benefits language, 40-hour weeks, annual salaries) subtract points, and full-time roles are dropped entirely. Commitment ("2 days/wk"), rate ("$150/hr"), and contract term ("6-month") are extracted as structured fields on each card.
3. **Aggregate** — matches are deduped (company + title), upserted into a JSON store (`data/jobs.json`), and stale listings age out after 60 days unless you've saved them.
4. **Operate** — the portal at `/portal` gives you search, filters (function, engagement type, source, score, remote), fit-score sorting, and a lightweight pipeline: save, mark applied, hide.

## Launch / Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmjmlopez1-beep%2FRevenue-Nomad-)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fmjmlopez1-beep%2FRevenue-Nomad-)

Pick whichever fits:

- **Vercel (fastest)** — click the button above, accept defaults, done. `vercel.json` schedules a daily crawl at 06:00 UTC automatically. Note: Vercel's filesystem is ephemeral, so the job database lives in `/tmp` and resets on cold starts — each crawl fully repopulates it, so the board stays fresh, but saved/applied state may not persist. Fine for a public board; set `CRON_SECRET` to protect the cron endpoint.
- **Render (persistent)** — click the button above; `render.yaml` provisions the web service plus a 1 GB persistent disk at `/var/data`, so operator state (saved/applied/hidden) survives restarts.
- **Docker (any host: Railway, Fly.io, a VPS)** — `docker build -t revenue-nomad . && docker run -p 3000:3000 -v rn-data:/data revenue-nomad`. The image is a self-contained standalone build; mount a volume at `/data` to persist the job database.

**Keeping the board fresh:** besides Vercel Cron, the repo ships a GitHub Actions workflow (`.github/workflows/crawl.yml`) that pings `POST {CRAWL_URL}/api/crawl` daily — set the repository variable `CRAWL_URL` to your deployed URL (and secret `CRON_SECRET` if you configured one). CI (`ci.yml`) builds every push.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

The board ships with clearly-labeled sample listings so the UI works immediately. Click **Run crawl** in the portal (or run `npm run crawl` from the CLI) to replace them with live roles.

> Note: crawling makes outbound HTTPS requests to the job sources above, so it needs normal internet access. Each source fails independently — one being down never blocks the others.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build && npm start` | Production build + serve |
| `npm run crawl` | Run the crawler once from the CLI |

## API

- `GET /api/jobs` — list jobs. Query params: `q`, `function`, `engagement`, `source`, `status`, `minScore`, `remote=true`
- `POST /api/crawl` — run a crawl and upsert results
- `PATCH /api/jobs/:id` — body `{ "status": "new" | "saved" | "applied" | "hidden" }`

## Configuration

See `.env.example`:

- `RN_GREENHOUSE_BOARDS` — comma-separated Greenhouse board tokens to watch specific companies
- `RN_DATA_DIR` — where the JSON job database lives (defaults to `./data`)

## Scheduling crawls

Any scheduler that can hit `POST /api/crawl` (or run `npm run crawl`) works — a cron job, a Vercel/Netlify scheduled function, or GitHub Actions. Hourly-to-daily is plenty for these sources.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · zero-dependency JSON store (no database required)
