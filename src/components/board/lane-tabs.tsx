"use client";

import type { FunctionLane } from "../../lib/types";
import { FUNCTION_LANES } from "../../lib/types";

function laneLabel(lane: FunctionLane): string {
  return lane === "devrel"
    ? "DevRel"
    : lane.charAt(0).toUpperCase() + lane.slice(1);
}

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
  function hrefFor(item: FunctionLane): string {
    return periodId
      ? `/?lane=${item}&period=${periodId}`
      : `/?lane=${item}`;
  }

  function LaneLink({ item }: { item: FunctionLane }) {
    const current = item === lane;
    const name = laneLabel(item);
    return (
      <a
        className="wall-plate"
        href={hrefFor(item)}
        aria-current={current ? "page" : undefined}
        data-lane={item}
      >
        {weekHistory ? `${name} week history` : name}
      </a>
    );
  }

  return (
    <nav
      className="lane-tabs"
      aria-label={label}
      data-lane-tabs=""
      data-slot="category-rail"
      data-lane-count={FUNCTION_LANES.length}
    >
      <div className="lane-tabs-primary">
        {FUNCTION_LANES.map((item) => (
          <LaneLink key={item} item={item} />
        ))}
      </div>
    </nav>
  );
}
