import { laneLabel } from "../../lib/board";
import type { FunctionLane } from "../../lib/types";
import { FUNCTION_LANES } from "../../lib/types";

export function LaneTabs({
  lane,
  periodId,
  label = "Function lanes",
  weekHistory = false,
}: {
  lane: FunctionLane;
  periodId?: string;
  label?: string;
  weekHistory?: boolean;
}) {
  return (
    <nav className="lane-tabs" aria-label={label} data-lane-tabs="">
      {FUNCTION_LANES.map((item) => {
        const current = item === lane;
        const href = periodId
          ? `/?lane=${item}&period=${periodId}`
          : `/?lane=${item}`;
        const name = laneLabel(item);
        return (
          <a
            key={item}
            className="wall-plate"
            href={href}
            aria-current={current ? "page" : undefined}
            data-lane={item}
          >
            {weekHistory ? `${name} week history` : name}
          </a>
        );
      })}
    </nav>
  );
}
