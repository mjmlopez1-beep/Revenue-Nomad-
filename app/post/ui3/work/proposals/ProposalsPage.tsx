"use client";

/**
 * Proposals in the new design (RN_UI3). Today's ProposalsPage keeps everything it does (the
 * addresses, the editor, the start, the send sheet, templates, every plan rule); the new design
 * draws its home (ProposalsHome.tsx) in Home2's place and the editor in the new look (proposals.css).
 * With the one-screen Proposals off (RN_PROPOSALS2), today's home shows inside the new page.
 */
import { useCallback, useState } from "react";
import { useApp } from "../../../shell/pages";
import { ProposalsPage } from "../../../Proposals";
import { WorkMain } from "../parts";
import { Ui3ProposalsHome } from "./ProposalsHome";
import "./proposals.css";

export function Ui3Proposals() {
  const c = useApp();
  const [sub, setSub] = useState<string | null>(null);
  const onSub = useCallback((t: string | null) => setSub(t), []);
  return (
    <WorkMain group="Work" title={sub ?? "Proposals"} crumbs={sub ? [{ label: "Proposals", href: c.hrefOf("proposals") }] : []} cls={`w3-pr${sub ? " w3-pr-doc" : ""}`}>
      <ProposalsPage view={c.view} infos={c.infos} home2={Ui3ProposalsHome} onSub={onSub} />
    </WorkMain>
  );
}
