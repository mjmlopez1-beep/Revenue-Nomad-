"use client";

/**
 * Tags for a case study, by search instead of a long list: type, and the matching tags from the
 * taxonomy show (arrow keys and Enter, or a click, to pick one; your own words work too). Picked
 * tags are chips with a remove button. Under the box, the 5 to 8 tags most likely to fit this case
 * study, one click each (evidenceModel suggestTagsFor).
 */
import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { IconX } from "../../ui/shared";
import { searchTags } from "./evidenceModel";
import type { TagCatalogue } from "./types";

export function TagSearch({ value, onChange, catalogue, suggested, max = 20 }: { value: string[]; onChange: (tags: string[]) => void; catalogue: TagCatalogue; suggested: string[]; max?: number }) {
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const [open, setOpen] = useState(false);
  const id = useId();
  const hits = useMemo(() => searchTags(q, catalogue, value), [q, catalogue, value]);
  const own = q.trim() && !hits.some((h) => h.name.toLowerCase() === q.trim().toLowerCase()) && !value.some((v) => v.toLowerCase() === q.trim().toLowerCase()) ? q.trim().slice(0, 60) : "";
  const options = [...hits.map((h) => ({ name: h.name, sub: h.category })), ...(own ? [{ name: own, sub: "Your own tag" }] : [])];
  const full = value.length >= max;
  const add = (t: string) => {
    if (!t || full || value.some((v) => v.toLowerCase() === t.toLowerCase())) return;
    onChange([...value, t]);
    setQ("");
    setAt(0);
  };
  const drop = (t: string) => onChange(value.filter((v) => v !== t));
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") (e.preventDefault(), setOpen(true), setAt((a) => Math.min(a + 1, options.length - 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), setAt((a) => Math.max(a - 1, 0)));
    else if (e.key === "Enter") {
      e.preventDefault();
      const o = options[Math.min(at, options.length - 1)];
      if (o) add(o.name);
    } else if (e.key === "Escape" && q) (e.stopPropagation(), setQ(""));
    else if (e.key === "Backspace" && !q && value.length) drop(value[value.length - 1]);
  };
  const picks = suggested.filter((s) => !value.includes(s));
  const showList = open && !!q.trim() && options.length > 0;
  return (
    <div className="ev-tags" data-tag-search>
      {value.length > 0 && (
        <ul className="ev-tagchips" aria-label="Tags on this case study">
          {value.map((t) => (
            <li key={t} className="ev-tagchip">
              {t}
              <button type="button" aria-label={`Remove the tag ${t}`} onClick={() => drop(t)}>
                <IconX size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="ev-tagbox">
        <input
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${id}-o${at}` : undefined}
          aria-label="Search tags"
          placeholder={full ? "That's the most tags a case study takes" : "Search tags: forecasting, pricing, hiring a team"}
          value={q}
          disabled={full}
          maxLength={60}
          onChange={(e) => (setQ(e.target.value), setAt(0), setOpen(true))}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={key}
        />
        {showList && (
          <ul id={`${id}-list`} role="listbox" className="ev-taglist" aria-label="Matching tags">
            {options.map((o, n) => (
              <li
                key={`${o.name}:${o.sub}`}
                id={`${id}-o${n}`}
                role="option"
                aria-selected={n === at}
                className={n === at ? "on" : undefined}
                onMouseDown={(e) => (e.preventDefault(), add(o.name))}
                onMouseEnter={() => setAt(n)}
              >
                <span>{o.name}</span>
                <span className="ev-taglist-sub">{o.sub}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {picks.length > 0 && (
        <div className="ev-tagpicks" aria-label="Suggested tags">
          <span className="ev-tagpicks-k">Likely fits</span>
          {picks.map((t) => (
            <button key={t} type="button" className="ev-tagpick" onClick={() => add(t)} disabled={full}>
              + {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
