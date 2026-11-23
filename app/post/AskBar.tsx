"use client";

/**
 * Ask Merlin (BUILD_PLAN F4): a box where the member says what they want, in their words. The rules
 * (lib/ask.ts) read it as they type and show, before anything happens, where it lands, the chips it
 * set (each one comes off with a tap) and the words it skipped. Go hands the plan to the page, which
 * puts it in its normal interface (Find's filters, a page), so every part stays editable there.
 *
 * Used on Home (a textarea and Go, with suggestion chips), in Find's Ask pane (its examples) and
 * on the Companies workbench's Ask row (one line and Go, "line").
 * Nothing here spends a credit or calls the server: the AI path (POST /api/ask) is the page's to
 * offer, and its answer comes back as the same plan.
 */
import { useId, useMemo, useState } from "react";
import { ask, emptyPlan, withoutChip, type AskPlan, type AskVocab } from "@/lib/ask";
import "./askbar.css";

export interface AskSuggestion {
  /** The words it puts in the box. */
  t: string;
}

export function AskBar({
  label,
  placeholder,
  vocab,
  suggestions = [],
  onGo,
  goLabel = "Go",
  rows = 2,
  variant = "home",
  suggestionsLabel,
  initial = "",
  where,
}: {
  label: string;
  placeholder: string;
  vocab: AskVocab;
  suggestions?: AskSuggestion[];
  onGo: (plan: AskPlan, text: string) => void;
  goLabel?: string;
  rows?: number;
  /** "home": the box, Go beside it, chips under. "pane": Find's narrow column, examples as full-width buttons. "line": one line and Go, its label for screen readers. */
  variant?: "home" | "pane" | "line";
  suggestionsLabel?: string;
  initial?: string;
  /** Where the plan lands as this page sees it (the workbench sets a companies list on itself), else the plan's own. */
  where?: (plan: AskPlan) => string;
}) {
  const id = useId();
  const [text, setText] = useState(initial);
  /** Chips the member took off, by id, for the text as it stands. */
  const [off, setOff] = useState<{ text: string; ids: string[] }>({ text: "", ids: [] });
  const typed = text.replace(/\s+/g, " ").trim();
  const plan = useMemo(() => {
    let p = ask(typed, vocab);
    if (off.text === typed) for (const c of off.ids) p = withoutChip(p, c, vocab);
    return p;
  }, [typed, vocab, off]);
  const nothing = !!typed && emptyPlan(plan) && !["rates", "credits", "proposals", "pipeline", "radar", "hiring"].includes(plan.page);
  const go = () => {
    if (!typed) return;
    onGo(plan, typed);
  };
  const drop = (cid: string) => setOff((o) => ({ text: typed, ids: o.text === typed ? [...o.ids, cid] : [cid] }));

  return (
    <div className={`ak ak-${variant}`}>
      <label htmlFor={`${id}-t`} className="ak-label">
        {label}
      </label>
      <div className="ak-row">
        <textarea
          id={`${id}-t`}
          className="ak-text"
          rows={rows}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              go();
            }
          }}
          aria-describedby={typed ? `${id}-plan` : undefined}
        />
        {variant !== "pane" && (
          <button type="button" className={`ak-go${typed ? " on" : ""}`} onClick={go} disabled={!typed} aria-label={`${goLabel}: ask Merlin`}>
            {goLabel}
          </button>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="ak-sugs" role="group" aria-label={suggestionsLabel ?? "Things to ask"}>
          {suggestionsLabel && <span className="ak-sugs-l">{suggestionsLabel}</span>}
          {suggestions.map((s) => {
            const on = typed === s.t;
            return (
              <button key={s.t} type="button" className={`ak-sug${on ? " on" : ""}`} aria-pressed={on} onClick={() => (variant === "pane" ? (setText(s.t), onGo(ask(s.t, vocab), s.t)) : setText(on ? "" : s.t))}>
                {s.t}
              </button>
            );
          })}
        </div>
      )}
      {typed ? (
        <div className="ak-plan" id={`${id}-plan`} role="status">
          <p className="ak-where">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />
            </svg>
            <span>
              <b>Where this lands: {where ? where(plan) : plan.where}.</b> {nothing ? "Merlin found nothing to set in that. Try a function, an industry, a size, a place or a signal like hiring now." : plan.cost}
            </span>
          </p>
          {plan.chips.length > 0 && (
            <ul className="ak-chips" aria-label="What Merlin set">
              {plan.chips.map((c) => (
                <li key={c.id}>
                  <button type="button" className="ak-chip" onClick={() => drop(c.id)} aria-label={`Take off: ${c.label}`}>
                    <span>{c.label}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {plan.unknown.length > 0 && (
            <p className="ak-skip">
              <b>Skipped, Merlin doesn&apos;t know these words yet:</b> {plan.unknown.join(", ")}. {plan.company ? "" : "A company by name: type its full name or its website."}
            </p>
          )}
          {variant === "pane" && (
            <button type="button" className="ak-apply" onClick={go}>
              Set these filters
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
