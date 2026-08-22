import { laneLabel } from "../../lib/board";
import type { FunctionLane } from "../../lib/types";
import { FUNCTION_LANES } from "../../lib/types";

export function LaneTabs({
  lane,
  periodId,
}: {
  lane: FunctionLane;
  periodId?: string;
}) {
  return (
    <nav className="lane-tabs" aria-label="Function lanes" data-lane-tabs="">
      {FUNCTION_LANES.map((item) => {
        const current = item === lane;
        const href = periodId
          ? `/?lane=${item}&period=${periodId}`
          : `/?lane=${item}`;
        return (
          <a
            key={item}
            href={href}
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
