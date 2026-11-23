"use client";

/**
 * The Companies workbench as the page registry mounts it (shell/pages.tsx companies2), loaded on
 * its own so the old look carries none of its code. Its view, filters and sort are the table's own
 * (AppCtx TableCtx), so the address, a saved list opened from Home or Find, and the breadcrumb
 * follow it; Ask Merlin's bar sets them here, or hands off to Find.
 */
import { useMemo, useState } from "react";
import type { AskPlan, AskVocab } from "@/lib/ask";
import { AskBar } from "../AskBar";
import { filtersFromAsk } from "../find/findModel";
import { CompaniesWorkbench } from "../workbench/CompaniesWorkbench";
import { askColumns } from "../workbench/columns";
import { firstOf, ownOf } from "../firstVisit";
import { icpEmpty } from "../model";
import { askGo, stripGone, useApp } from "./pages";

/** An Ask answer the workbench sets on itself: a list of companies with filters the table has (Find fills the member's own sets: way in, pipeline). */
const askHere = (plan: AskPlan) => plan.page === "find" && plan.kind === "companies" && !plan.company && !plan.filters.wayIn && !plan.filters.inPipeline;

export function WorkbenchPage() {
  const c = useApp();
  const t = c.table;
  const [first] = useState(() => firstOf("companies", ownOf("companies", c.me)).first);
  const list = t.views.find((v) => v.id === t.currentView) ?? null;
  const vocab: AskVocab = useMemo(() => ({ myFn: c.me.function ?? null, hasIcp: !icpEmpty(c.me.icp) }), [c.me.function, c.me.icp]);
  return (
    <main className="tp-main tp-main-page wb-host">
      <CompaniesWorkbench
        view={c.view}
        infos={c.infos}
        me={c.me}
        openCompany={c.openCompany}
        openPage={(p) => c.openPage(p)}
        refresh={() => void c.refresh()}
        network={c.network}
        onEditIcp={c.openProfile}
        first={first}
        stripOff={(k) => stripGone(c, k)}
        onStripOff={(k) => c.start.dismissStrip(k)}
        bind={{ tab: t.tab, setTab: t.setTab, filters: t.filters, setFilters: t.setFilters, sort: t.sortPicked, setSort: t.setSort, listName: list?.name ?? null, listCols: list?.cols ?? null }}
        askBar={(apply) => (
          <AskBar
            variant="line"
            rows={1}
            where={(plan) => (askHere(plan) ? "this table, with these filters" : plan.where)}
            label="Ask Merlin"
            placeholder="Ask Merlin: SaaS companies under 500 people with a seat that ended, with who decides"
            vocab={vocab}
            onGo={(plan, text) => {
              // A list of companies with filters the table has: set here. Anything else (another kind, a set only Find fills, a company to look up) goes where Ask says.
              if (!askHere(plan)) return askGo(c, plan, text);
              apply({ filters: filtersFromAsk(plan.filters, !!plan.filters.icp), ...(plan.sort ? { sort: plan.sort as typeof t.sort } : {}), cols: askColumns(plan.cols) });
            }}
          />
        )}
      />
    </main>
  );
}

