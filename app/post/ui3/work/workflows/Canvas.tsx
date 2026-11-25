"use client";

/**
 * Workflows, Advanced: the canvas on the v2 graph (lib/workflows/graph.ts). Readable nodes with
 * their group color, lines with their branch names, a step's settings only when it is selected (the
 * panel on the right). Select a step to rename it, switch it off, change its settings, choose what
 * happens when it fails, remove it, or add a step after it from the catalog. Edits stay on the page
 * until Save changes, which saves a draft (Unpublished changes); the engine checks it in plain words.
 * Phones get the step list, branches indented, a tap opens the step.
 */
import { useMemo, useState, type ReactNode } from "react";
import type { GEdge, GNode, GraphVersion, NodeType } from "@/lib/workflows/graph";
import { Sheet, Switch } from "../parts";
import { WIc, type WIconName } from "../icons";
import type { CatItem } from "./WorkflowsPage";

const W = 300;
const H = 72;
const G_ICON: Record<string, WIconName> = { trigger: "bolt", find: "search", ai: "spark", logic: "branch", act: "check", notify: "bell" };
const G_NAME: Record<string, string> = { trigger: "When this happens", find: "Find in Merlin", ai: "Merlin AI", logic: "Logic", act: "Do", notify: "Tell me" };
const OUT_WORDS: Record<string, string> = { fits: "Fits", no: "No", yes: "Yes", replied: "Replied", none: "No reply", sent: "Sent", skipped: "Skipped", expired: "Expired", unsure: "Unsure", other: "Other" };
const groupOf = (t: string) => (t.startsWith("trig.") ? "trigger" : t.split(".")[0]);

export function Canvas({ ver, catalog, holds, busy, save, phone, side }: { ver: GraphVersion; catalog: CatItem[]; holds: Record<string, string>; busy: boolean; save: (v: Pick<GraphVersion, "nodes" | "edges">) => void; phone: boolean; side: ReactNode }) {
  const [nodes, setNodes] = useState<GNode[]>(() => structuredClone(ver.nodes));
  const [edges, setEdges] = useState<GEdge[]>(() => structuredClone(ver.edges));
  const [sel, setSel] = useState<string | null>(null);
  const [cat, setCat] = useState(false);
  const [q, setQ] = useState("");
  const dirty = JSON.stringify(nodes) !== JSON.stringify(ver.nodes) || JSON.stringify(edges) !== JSON.stringify(ver.edges);
  const by = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const catBy = useMemo(() => new Map(catalog.map((x) => [x.type, x])), [catalog]);
  const cur = sel ? by.get(sel) ?? null : null;

  // Layout: the graph's own positions, shifted so the left-most is at 40.
  const minX = Math.min(...nodes.map((n) => n.pos.x), 0);
  const minY = Math.min(...nodes.map((n) => n.pos.y), 0);
  const P = (n: GNode) => ({ x: n.pos.x - minX + 40, y: n.pos.y - minY + 40 });
  const width = Math.max(...nodes.map((n) => P(n).x + W), 600) + 80;
  const height = Math.max(...nodes.map((n) => P(n).y + H), 400) + 120;

  const update = (id: string, f: (n: GNode) => GNode) => setNodes((ns) => ns.map((n) => (n.id === id ? f(n) : n)));
  const remove = (id: string) => {
    const ins = edges.filter((e) => e.to === id);
    const outs = edges.filter((e) => e.from === id);
    // Join what came in to what went out (the first line out), so the path stays whole.
    const joined = ins.flatMap((i) => outs.slice(0, 1).map((o) => ({ id: `e_${Math.random().toString(36).slice(2, 10)}`, from: i.from, out: i.out, to: o.to })));
    setEdges((es) => [...es.filter((e) => e.from !== id && e.to !== id), ...joined]);
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setSel(null);
  };
  const add = (type: NodeType) => {
    const after = cur ?? nodes[nodes.length - 1];
    const id = `n_${Math.random().toString(36).slice(2, 10)}`;
    const info = catBy.get(type)!;
    const n: GNode = { id, type, name: info.name, on: true, settings: {}, pos: { x: after.pos.x, y: after.pos.y + 140 } };
    const outs = catBy.get(after.type)?.outs ?? ["main"];
    const out = outs[0] ?? "main";
    const next = edges.find((e) => e.from === after.id && e.out === out);
    // Below the step it follows: what came after it moves down, and the new step sits in the line.
    setNodes((ns) => [...ns.map((x) => (x.pos.y > after.pos.y && Math.abs(x.pos.x - after.pos.x) < W ? { ...x, pos: { ...x.pos, y: x.pos.y + 140 } } : x)), n]);
    setEdges((es) => [...es.filter((e) => e !== next), { id: `e_${id}`, from: after.id, out, to: id }, ...(next ? [{ id: `e_${id}_n`, from: id, out: (info.outs[0] ?? "main"), to: next.to }] : [])]);
    setCat(false);
    setSel(id);
  };

  const curve = (e: GEdge) => {
    const a = by.get(e.from);
    const b = by.get(e.to);
    if (!a || !b) return null;
    const outs = catBy.get(a.type)?.outs ?? ["main"];
    const k = Math.max(0, outs.indexOf(e.out));
    const pa = P(a);
    const pb = P(b);
    const x1 = pa.x + (W * (k + 1)) / (outs.length + 1);
    const y1 = pa.y + H;
    const x2 = pb.x + W / 2;
    const y2 = pb.y;
    const dy = Math.max(40, (y2 - y1) / 2);
    return { d: `M${x1} ${y1} C${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`, mx: (x1 + x2) / 2, my: (y1 + y2) / 2, off: !a.on || !b.on };
  };

  const list = (
    <div className="wf3-list">
      {nodes
        .slice()
        .sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x)
        .map((n) => {
          const into = edges.find((e) => e.to === n.id);
          return (
            <button key={n.id} type="button" className={`wf-li${n.on ? "" : " off"}`} style={{ marginLeft: n.pos.x > 0 ? 28 : n.pos.x < 0 ? 14 : 0 }} onClick={() => setSel(n.id)}>
              <span className={`wf-gi g-${groupOf(n.type)}`} aria-hidden="true">
                <WIc n={G_ICON[groupOf(n.type)] ?? "spark"} />
              </span>
              <span>
                <b>{n.name}</b>
                <small>
                  {into && into.out !== "main" ? `${OUT_WORDS[into.out] ?? into.out} · ` : ""}
                  {G_NAME[groupOf(n.type)]}
                  {holds[n.id] ? ` · ${holds[n.id]}` : ""}
                  {n.on ? "" : " · Off"}
                </small>
              </span>
              <WIc n="chev" />
            </button>
          );
        })}
    </div>
  );

  const panel = cur && (
    <div className="wf3-panel">
      <div className="wf-ph">
        <span className={`wf-gi g-${groupOf(cur.type)}`} aria-hidden="true">
          <WIc n={G_ICON[groupOf(cur.type)] ?? "spark"} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input aria-label="Step name" value={cur.name} maxLength={60} onChange={(e) => update(cur.id, (n) => ({ ...n, name: e.target.value }))} />
          <p className="m-small">{catBy.get(cur.type)?.sub}</p>
        </div>
        <button type="button" className="m-iconbtn sm plain" aria-label="Close the step" onClick={() => setSel(null)}>
          <WIc n="x" />
        </button>
      </div>
      <div className="wf-pb">
        {groupOf(cur.type) !== "trigger" && (
          <div className="w-row">
            <span style={{ flex: 1 }}>{catBy.get(cur.type)?.sends || cur.type === "logic.ask" ? "On (off stops this path: your tap can't be skipped)" : "On (off: skipped, and what came in carries on)"}</span>
            <Switch sm on={cur.on} label="Step on" set={(v) => update(cur.id, (n) => ({ ...n, on: v }))} />
          </div>
        )}
        <Settings n={cur} set={(s) => update(cur.id, (n) => ({ ...n, settings: s }))} />
        {groupOf(cur.type) !== "trigger" && (
          <label className="w-field">
            <span>If this step fails</span>
            <select className="w-sel" value={cur.onError ?? "stop"} onChange={(e) => update(cur.id, (n) => ({ ...n, onError: e.target.value as "stop" | "skip" }))}>
              <option value="stop">Stop the run and tell me</option>
              <option value="skip">Skip it and carry on</option>
            </select>
          </label>
        )}
        {catBy.get(cur.type)?.paid && <p className="wf-pill cr">Costs credits at the app&apos;s price, quoted before it spends</p>}
        {holds[cur.id] && <p className="wf-pill plan">{holds[cur.id]}</p>}
      </div>
      <div className="wf-pf">
        <button type="button" className="m-btn m-btn-sm m-btn-secondary" onClick={() => setCat(true)}>
          <WIc n="plus" /> Add a step after
        </button>
        {groupOf(cur.type) !== "trigger" && (
          <button type="button" className="m-btn m-btn-sm m-btn-ghost w-btn-danger" onClick={() => remove(cur.id)}>
            <WIc n="trash" /> Remove
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="wf3-adv">
      <div className="wf3-advbar">
        <button type="button" className="m-btn m-btn-sm m-btn-secondary" onClick={() => setCat(true)}>
          <WIc n="plus" /> Add a step
        </button>
        <span className="m-small">{dirty ? "Changes on this page, not saved yet." : "Select a step for its settings."}</span>
        <span className="w-sp" />
        {dirty && (
          <>
            <button type="button" className="m-btn m-btn-sm m-btn-ghost" onClick={() => (setNodes(structuredClone(ver.nodes)), setEdges(structuredClone(ver.edges)), setSel(null))}>
              <WIc n="undo" /> Undo changes
            </button>
            <button type="button" className="m-btn m-btn-sm m-btn-primary" disabled={busy} onClick={() => save({ nodes, edges })}>
              Save changes
            </button>
          </>
        )}
      </div>
      <div className="wf3-advbody">
        {phone ? (
          list
        ) : (
          <div className="wf-canvas wf3-canvas">
            <div className="wf3-world" style={{ width, height }}>
              <svg className="wf-edges" width={width} height={height} aria-hidden="true">
                {edges.map((e) => {
                  const k = curve(e);
                  return k ? <path key={e.id} d={k.d} className={k.off ? "off" : "live"} /> : null;
                })}
              </svg>
              {edges.map((e) => {
                const k = curve(e);
                return k && e.out !== "main" ? (
                  <span key={`l${e.id}`} className={`wf-elabel ${["fits", "yes", "replied", "sent"].includes(e.out) ? "yes" : "no"}`} style={{ left: k.mx, top: k.my }}>
                    {OUT_WORDS[e.out] ?? e.out.replace(/^(case|label):/, "")}
                  </span>
                ) : null;
              })}
              {nodes.map((n) => {
                const p = P(n);
                const ci = catBy.get(n.type);
                return (
                  <button key={n.id} type="button" className={`wf-node wf3-node${sel === n.id ? " sel" : ""}${n.on ? "" : " off"}${groupOf(n.type) === "trigger" ? " trig" : ""}`} style={{ left: p.x, top: p.y, width: W }} onClick={() => setSel(n.id)}>
                    <span className="wf-badges">
                      {ci?.paid && <span className="wf-pill cr">Credits</span>}
                      {holds[n.id] && <span className="wf-pill plan">{holds[n.id]}</span>}
                      {ci?.sends && <span className="wf-pill lock">Your tap</span>}
                    </span>
                    <span className="wf-nh">
                      <span className={`wf-gi g-${groupOf(n.type)}`} aria-hidden="true">
                        <WIc n={G_ICON[groupOf(n.type)] ?? "spark"} />
                      </span>
                      <span style={{ minWidth: 0, textAlign: "left" }}>
                        <span className="wf-src">{G_NAME[groupOf(n.type)]}</span>
                        <span className="wf-nname" style={{ display: "block" }}>
                          {n.name}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {!phone && <aside className="wf3-advside">{panel ?? side}</aside>}
      </div>
      {phone && cur && (
        <Sheet title={cur.name} onClose={() => setSel(null)}>
          {panel}
        </Sheet>
      )}
      {cat && (
        <Sheet title="Add a step" onClose={() => setCat(false)} lg>
          <label className="w-search">
            <WIc n="search" />
            <input value={q} placeholder="Search steps" aria-label="Search steps" onChange={(e) => setQ(e.target.value)} />
          </label>
          {["find", "ai", "logic", "act", "notify"].map((g) => {
            const xs = catalog.filter((x) => x.group === g && (!q || `${x.name} ${x.sub}`.toLowerCase().includes(q.toLowerCase())));
            return xs.length ? (
              <div key={g}>
                <div className="wf-cat-g">{G_NAME[g]}</div>
                {xs.map((x) => (
                  <button key={x.type} type="button" className={`wf-cat-i${x.stub ? " stub" : ""}`} disabled={!!x.stub} onClick={() => add(x.type)}>
                    <span className={`wf-gi g-${g}`} aria-hidden="true">
                      <WIc n={G_ICON[g]} />
                    </span>
                    <span>
                      <b>{x.name}</b>
                      <small>{x.sub}</small>
                    </span>
                    {x.hold ? <span className="wf-pill plan">{x.hold}</span> : x.paid ? <span className="wf-pill cr">Credits</span> : null}
                  </button>
                ))}
              </div>
            ) : null;
          })}
        </Sheet>
      )}
    </div>
  );
}

/** A step's settings, by type: the fields the engine reads (graph.ts cleanSettings). */
function Settings({ n, set }: { n: GNode; set: (s: Record<string, unknown>) => void }) {
  const s = n.settings;
  const num = (k: string, label: string, min: number, max: number) => (
    <label className="w-field" key={k}>
      <span>{label}</span>
      <input className="w-in" type="number" min={min} max={max} value={Number(s[k] ?? min)} onChange={(e) => set({ ...s, [k]: Number(e.target.value) })} />
    </label>
  );
  const text = (k: string, label: string, area = false) => (
    <label className="w-field" key={k}>
      <span>{label}</span>
      {area ? <textarea className="w-ta" value={String(s[k] ?? "")} onChange={(e) => set({ ...s, [k]: e.target.value })} /> : <input className="w-in" value={String(s[k] ?? "")} onChange={(e) => set({ ...s, [k]: e.target.value })} />}
    </label>
  );
  switch (n.type) {
    case "act.send":
      return (
        <>
          {num("days", "Skipped if not answered in (days)", 1, 14)}
          <label className="w-row">
            <span style={{ flex: 1 }}>Ask me by email too</span>
            <Switch sm on={s.email === true} label="Ask me by email too" set={(v) => set({ ...s, email: v })} />
          </label>
          {text("subject", "Subject (empty: the draft's)")}
          {text("body", "Note (empty: the draft's)", true)}
        </>
      );
    case "logic.wait":
      return (
        <>
          {num("days", "Days", 0, 30)}
          {num("hours", "Hours", 0, 23)}
        </>
      );
    case "logic.waitreply":
      return num("days", "Days to wait for a reply", 1, 30);
    case "logic.ask":
      return (
        <>
          {text("question", "The question")}
          {num("days", "Taken as No after (days)", 1, 14)}
        </>
      );
    case "act.remind":
      return num("days", "Remind me in (days)", 1, 30);
    case "act.move":
      return (
        <label className="w-field">
          <span>Move the deal to</span>
          <select className="w-sel" value={String(s.stage ?? "replied")} onChange={(e) => set({ ...s, stage: e.target.value })}>
            {["reach", "sent", "replied", "meeting", "proposal", "won", "lost", "notnow"].map((x) => (
              <option key={x} value={x}>
                {x === "reach" ? "To reach out" : x === "notnow" ? "Not now" : x[0].toUpperCase() + x.slice(1)}
              </option>
            ))}
          </select>
        </label>
      );
    case "ai.write":
    case "ai.agent":
      return text("prompt", "What Merlin writes", true);
    case "ai.decide":
      return text("question", "The question", true);
    case "notify.me":
    case "notify.bell":
    case "notify.email":
    case "notify.slack":
    case "notify.webhook":
      return text("text", "The line (empty: the run's own)");
    default:
      return <p className="w-help">Nothing to set for this step.</p>;
  }
}
