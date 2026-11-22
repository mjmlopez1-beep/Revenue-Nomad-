"use client";

/**
 * Reading activity on the signing page, for the sender (lib/close): one hook and one line of
 * text. The page says so near its footer (ActivityNotice), in plain words. No hidden tracking:
 * nothing here reads anything but which part of the page is on screen while the reader is active.
 *
 *   const track = useProposalActivity(token);
 *   track.picked("operator", "Operator");          // they picked a pricing option
 *   track.addon("hiring", true, "Sales hiring");   // they turned an add-on on (false: off)
 *   track.downloaded();                            // they downloaded the PDF
 *   <ActivityNotice sender={doc.from.name} />      // near the footer
 *
 * What it watches, by attribute (the page's own markup, nothing else):
 *   [data-section="<id>"]   a section; data-section-title="<label>" names it, else its first heading
 *   [data-option="<id>"]    a pricing option; data-option-title="<label>" names it, else its first heading
 * Ids are 1 to 48 of A-Z a-z 0-9 _ . : - and stay the same for the same section. Without any
 * [data-section], a proposal's blocks (.sg-doc .sg-block, "b0", "b1"...) and a document's pages
 * (.pdf-page, "p0", "p1"...) stand in.
 *
 * Each second, while the tab is visible and the reader did something in the last 30 seconds, the
 * section most on screen gets that second (and the option most on screen, apart). The sums go to
 * POST /api/sign/activity every 15 seconds and when the page is hidden or closed, at most a minute
 * a section each time; the server believes no more than the time that passed. A random id in a
 * cookie the server sets tells one reader's browser from another. Never the IP address, never a
 * fingerprint.
 */
import { useEffect, useMemo, useRef } from "react";
import { disclosureText } from "@/lib/close/types";

const URL = "/api/sign/activity";
const TICK_MS = 1000;
const FLUSH_MS = 15_000;
const IDLE_MS = 30_000;
const ID = /^[A-Za-z0-9_.:-]{1,48}$/;

export interface ProposalActivity {
  picked(id: string, label?: string): void;
  addon(id: string, on: boolean, label?: string): void;
  downloaded(): void;
}

type Ev = { t: string; id?: string; label?: string; ms?: number; on?: boolean };

const headingOf = (el: Element) => (el.querySelector("h1,h2,h3,h4")?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60);

/** The parts of the page to watch, with their ids and labels. */
function parts(kind: "section" | "option"): { el: HTMLElement; id: string; label: string }[] {
  if (typeof document === "undefined") return [];
  if (kind === "option")
    return [...document.querySelectorAll<HTMLElement>("[data-option]")]
      .map((el) => ({ el, id: el.dataset.option ?? "", label: el.dataset.optionTitle || headingOf(el) }))
      .filter((x) => ID.test(x.id));
  const tagged = [...document.querySelectorAll<HTMLElement>("[data-section]")].filter((el) => !el.hasAttribute("data-option"));
  if (tagged.length) return tagged.map((el) => ({ el, id: el.dataset.section ?? "", label: el.dataset.sectionTitle || headingOf(el) })).filter((x) => ID.test(x.id));
  const blocks = [...document.querySelectorAll<HTMLElement>(".sg-doc .sg-block")];
  if (blocks.length) return blocks.map((el, i) => ({ el, id: `b${i}`, label: headingOf(el) }));
  return [...document.querySelectorAll<HTMLElement>(".pdf-page")].map((el, i) => ({ el, id: `p${i}`, label: `Page ${i + 1}` }));
}

/** The part most on screen now, or null. */
function onScreen(list: { el: HTMLElement; id: string; label: string }[]) {
  const vh = window.innerHeight || 1;
  let best: (typeof list)[number] | null = null;
  let bestPx = 0;
  for (const x of list) {
    const r = x.el.getBoundingClientRect();
    const px = Math.min(r.bottom, vh) - Math.max(r.top, 0);
    // On screen: a third of the screen, or half of a short part.
    if (px > bestPx && (px >= vh / 3 || px >= r.height / 2)) (best = x), (bestPx = px);
  }
  return best;
}

/**
 * Track this signing link's reading. `token` is the link's own; off (`enabled: false`) does
 * nothing. Returns the calls the page makes when the reader picks, adds or downloads.
 */
export function useProposalActivity(token: string, opts: { enabled?: boolean } = {}): ProposalActivity {
  const enabled = opts.enabled !== false && !!token;
  const st = useRef({ off: false, queue: [] as Ev[], sec: new Map<string, number>(), opt: new Map<string, number>(), named: new Set<string>(), labels: new Map<string, string>() });

  const send = (beacon: boolean) => {
    const s = st.current;
    if (s.off || !token) return;
    const events: Ev[] = [...s.queue];
    s.queue = [];
    for (const [k, m] of [["sec", s.sec], ["opt", s.opt]] as const)
      for (const [id, ms] of m) {
        if (ms < 500) continue;
        const key = `${k}:${id}`;
        const label = s.named.has(key) ? undefined : s.labels.get(key);
        s.named.add(key);
        events.push({ t: k, id, ms: Math.min(60_000, Math.round(ms)), ...(label ? { label } : {}) });
      }
    s.sec.clear();
    s.opt.clear();
    if (!events.length) return;
    const body = JSON.stringify({ token, events: events.slice(0, 40) });
    if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(URL, new Blob([body], { type: "text/plain" }));
      return;
    }
    void fetch(URL, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true, credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { off?: boolean }) => {
        if (j?.off) st.current.off = true;
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!enabled) return;
    const s = st.current;
    s.queue.push({ t: "open" });
    send(false);
    let lastInput = Date.now();
    let last = Date.now();
    const input = () => (lastInput = Date.now());
    const evs = ["scroll", "pointermove", "pointerdown", "keydown", "touchstart", "wheel"] as const;
    for (const e of evs) window.addEventListener(e, input, { passive: true });
    let found = { sections: parts("section"), options: parts("option"), at: 0 };
    const tick = window.setInterval(() => {
      const now = Date.now();
      const dt = Math.min(2 * TICK_MS, now - last);
      last = now;
      if (s.off || document.visibilityState !== "visible" || now - lastInput > IDLE_MS) return;
      // The page may still be drawing (a PDF's pages): look for the parts again every few seconds.
      if (now - found.at > 3000) found = { sections: parts("section"), options: parts("option"), at: now };
      const sec = onScreen(found.sections);
      if (sec) s.sec.set(sec.id, (s.sec.get(sec.id) ?? 0) + dt), sec.label && s.labels.set(`sec:${sec.id}`, sec.label);
      const opt = onScreen(found.options);
      if (opt) s.opt.set(opt.id, (s.opt.get(opt.id) ?? 0) + dt), opt.label && s.labels.set(`opt:${opt.id}`, opt.label);
    }, TICK_MS);
    const flush = window.setInterval(() => send(false), FLUSH_MS);
    const hide = () => document.visibilityState === "hidden" && send(true);
    const leave = () => send(true);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(flush);
      for (const e of evs) window.removeEventListener(e, input);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
      send(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, token]);

  return useMemo<ProposalActivity>(
    () => ({
      picked: (id, label) => {
        if (!enabled || !ID.test(id)) return;
        st.current.queue.push({ t: "pick", id, ...(label ? { label: label.slice(0, 60) } : {}) });
        send(false);
      },
      addon: (id, on, label) => {
        if (!enabled || !ID.test(id)) return;
        st.current.queue.push({ t: "addon", id, on, ...(label ? { label: label.slice(0, 60) } : {}) });
        send(false);
      },
      downloaded: () => {
        if (!enabled) return;
        st.current.queue.push({ t: "dl" });
        send(false);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, token],
  );
}

/** The line near the footer that tells the client, in plain words. */
export function ActivityNotice({ sender }: { sender?: string | null }) {
  return (
    <p className="sg-notice" data-activity-notice>
      {disclosureText(sender)}
    </p>
  );
}
