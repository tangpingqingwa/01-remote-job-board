import { laneLabel } from "../../lib/board";
import type { FunctionLane } from "../../lib/types";
import { FUNCTION_LANES } from "../../lib/types";

export function LaneTabs({ lane }: { lane: FunctionLane }) {
  return (
    <nav className="lane-tabs" aria-label="Function lanes" data-lane-tabs="">
      {FUNCTION_LANES.map((item) => {
        const current = item === lane;
        return (
          <a
            key={item}
            href={`/?lane=${item}`}
            aria-current={current ? "page" : undefined}
            data-lane={item}
          >
            {laneLabel(item)}
          </a>
        );
      })}
    </nav>
  );
}
