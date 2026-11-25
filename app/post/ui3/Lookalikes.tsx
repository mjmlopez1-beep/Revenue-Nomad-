"use client";

/** Lookalikes in the new design (step 7 builds it): until then, Find on Lookalikes. */
import { useEffect } from "react";
import { useApp } from "../shell/pages";
import { setFindStart } from "../find/start";
import { Wait } from "./parts";

export function Ui3Lookalikes({ onBack }: { onBack: () => void }) {
  const c = useApp();
  useEffect(() => {
    onBack();
    setFindStart({ kind: "lookalikes" });
    c.openPage("find");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Wait />;
}
