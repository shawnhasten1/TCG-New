// Card data for every set you've pulled from (already cached from opening packs), for the cross-set views.

import { useEffect, useMemo, useState } from "react";
import type { SetData } from "../api/types";
import { client } from "../app/client";
import type { PullRecord } from "./store";

/** `sets` is undefined until loaded; `progress` is [loaded, total] while loading. Sets that fail to load are left out. */
export function useOpenedSets(pulls: PullRecord[] | undefined) {
  const [sets, setSets] = useState<SetData[]>();
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const setIds = useMemo(() => [...new Set(pulls?.map((p) => p.setId))].sort().join(","), [pulls]);

  useEffect(() => {
    if (!pulls) return;
    let live = true;
    const ids = setIds ? setIds.split(",") : [];
    setProgress([0, ids.length]);
    let done = 0;
    Promise.all(
      ids.map((id) =>
        client.getSetCards(id).then(
          (d) => (live && setProgress([++done, ids.length]), d),
          () => undefined,
        ),
      ),
    ).then((all) => live && setSets(all.filter((d): d is SetData => !!d)));
    return () => {
      live = false;
    };
    // Re-run only when the set of opened sets changes, not on every new pull.
  }, [setIds, !!pulls]);

  return { sets, progress };
}
