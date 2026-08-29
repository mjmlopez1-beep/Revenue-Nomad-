import { promises as fs } from "fs";
import path from "path";
import type { Database, Operator } from "./types";
import { signPulseToken } from "./sign";
import { computeIndexSnapshot, tapeRows } from "./aggregate";
import { isoWeek, weeksAgo } from "./time";

const BASE_URL = process.env.NB_BASE_URL || "http://localhost:3000";

/**
 * The Tuesday Tape Drop (spec §4): Demand Index headline, this week's pulse
 * as ONE-CLICK buttons (signed links — answering from the email grants the
 * credits, zero friction), tape summary, question of the week.
 */
export function composeTapeDrop(db: Database, op: Operator): { subject: string; html: string } {
  const now = new Date();
  const week = isoWeek(now);
  const lastWeek = isoWeek(weeksAgo(1, now));
  const lastSnap =
    db.demandIndexSnapshots.find((s) => s.week === lastWeek) ?? computeIndexSnapshot(db, lastWeek);
  const prevSnap = db.demandIndexSnapshots.find((s) => s.week === isoWeek(weeksAgo(2, now)));
  const delta = prevSnap ? lastSnap.total - prevSnap.total : 0;
  const deals = tapeRows(db, [lastWeek]);
  const won = deals.filter((d) => d.outcome === "won").length;
  const q = db.questions.find((x) => x.week === week);

  const btn = (band: string, label: string) => {
    const token = signPulseToken({ op: op.id, week, band });
    return `<a href="${BASE_URL}/pulse/${token}" style="display:inline-block;background:#1e4d33;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 0;width:23%;text-align:center;border-radius:10px;">${label}</a>`;
  };

  const subject = `Tape Drop ${lastWeek}: Demand Index ${lastSnap.total} (${delta >= 0 ? "+" : ""}${delta}) · ${won} deals closed`;

  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f2;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#182119;">
<div style="max-width:520px;margin:0 auto;padding:24px 16px;">
  <p style="font-weight:800;letter-spacing:0.04em;font-size:15px;margin:0 0 18px;">REVENUE<span style="font-weight:300;color:#97a29a;">NOMAD</span> <span style="font-size:11px;color:#2f7d4f;border:1px solid #cfe2c9;background:#eaf3e8;border-radius:99px;padding:2px 8px;">BENCHMARK</span></p>

  <div style="background:#101812;border-radius:16px;padding:22px;color:#cfe0d2;">
    <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#7e937f;">Nomad Demand Index · ${lastWeek}</p>
    <p style="margin:6px 0 2px;font-size:44px;font-weight:800;color:#b9e3a6;line-height:1;">${lastSnap.total}</p>
    <p style="margin:0;font-size:13px;color:#9fb3a2;">active buyer conversations across the network · ${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)} vs prior week · ${lastSnap.respondents} operators pulsed</p>
  </div>

  <div style="background:#ffffff;border:1px solid #e5e9e2;border-radius:16px;padding:20px;margin-top:14px;">
    <p style="margin:0 0 4px;font-weight:700;font-size:15px;">This week's pulse — one tap, +${db.config.earn.weeklyPulse} credits</p>
    <p style="margin:0 0 12px;font-size:13px;color:#6d7a70;">How many active buyer conversations do you have right now? Tapping answers it — no login. It also unlocks this week's index for you.</p>
    <div style="display:flex;justify-content:space-between;gap:6px;">
      ${btn("0", "0")}${btn("1_2", "1–2")}${btn("3_5", "3–5")}${btn("6_plus", "6+")}
    </div>
  </div>

  <div style="background:#ffffff;border:1px solid #e5e9e2;border-radius:16px;padding:20px;margin-top:14px;">
    <p style="margin:0 0 8px;font-weight:700;font-size:15px;">On the tape last week</p>
    <p style="margin:0;font-size:13.5px;color:#6d7a70;">${deals.length} deals across the network — ${won} won, ${deals.length - won} lost. Full anonymized rows in the app.</p>
  </div>

  ${
    q
      ? `<div style="background:#ffffff;border:1px solid #e5e9e2;border-radius:16px;padding:20px;margin-top:14px;">
    <p style="margin:0 0 4px;font-weight:700;font-size:15px;">Question of the week (+${q.credits}, expiring)</p>
    <p style="margin:0 0 10px;font-size:13.5px;color:#6d7a70;">${q.question}</p>
    <a href="${BASE_URL}/dashboard" style="color:#2f7d4f;font-weight:700;font-size:13.5px;">Answer in the app →</a>
  </div>`
      : ""
  }

  <p style="font-size:11.5px;color:#97a29a;margin-top:18px;">Individual data is never shown. Aggregates are medians over 5+ operators. Credits never affect matching.<br/>Revenue Nomad · The Nomad Benchmark</p>
</div>
</body></html>`;

  return { subject, html };
}

/**
 * Send via Resend when RESEND_API_KEY is set; otherwise write the HTML to
 * data/outbox/ for preview (so the whole loop is testable without keys).
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<"sent" | "outbox"> {
  const key = process.env.RESEND_API_KEY;
  if (key) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "The Nomad Benchmark <benchmark@revenuenomad.com>", to, subject, html }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    return "sent";
  }
  const dir = path.join(process.cwd(), "data", "outbox");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().slice(0, 10)}-${to.replace(/[^a-z0-9.@_-]/gi, "_")}.html`);
  await fs.writeFile(file, `<!-- Subject: ${subject} -->\n${html}`, "utf8");
  return "outbox";
}
