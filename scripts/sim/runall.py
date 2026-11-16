import json
import sys
from multiprocessing import Pool

import sim

SCENARIOS = {
    "base": ({}, 1000),
    "starter_50": ({"starter": 50}, 300),
    "no_digest": ({"digest": False, "digest_boost": 0}, 300),
    "scan_30": ({"scan_per_week": 30}, 300),
    "scan_8": ({"scan_per_week": 8}, 300),
    "anon_rate": ({"disclose_boost": {"rate": 2.2, "hours": 1.5}}, 300),
    "cap_15": ({"cap": 15}, 300),
}


def job(args):
    name, i, over = args
    cfg = {**sim.BASE, **over}
    return name, sim.run(10_000 * (list(SCENARIOS).index(name) + 1) + i, cfg)


if __name__ == "__main__":
    tasks = [(n, i, o) for n, (o, k) in SCENARIOS.items() for i in range(k)]
    out = {n: [] for n in SCENARIOS}
    with Pool(4) as pool:
        for name, r in pool.imap_unordered(job, tasks, chunksize=20):
            for k in ("credits_end",):
                r.pop(k, None)
            out[name].append(r)
    json.dump(out, open(sys.argv[1], "w"))
    print({n: len(v) for n, v in out.items()})
