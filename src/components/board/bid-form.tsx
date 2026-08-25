"use client";

import { useState } from "react";
import type { FunctionLane } from "../../lib/types";
import { FUNCTION_LANES, MAX_BID_USD, MIN_BID_USD } from "../../lib/types";

type BidFormProps = {
  lane: FunctionLane;
  laneName: string;
  defaultAmount: number;
  laneEmpty?: boolean;
};

function clampAmount(value: number): number {
  if (!Number.isFinite(value)) return MIN_BID_USD;
  return Math.min(MAX_BID_USD, Math.max(MIN_BID_USD, Math.trunc(value)));
}

function functionLaneName(lane: FunctionLane): string {
  return lane === "devrel"
    ? "DevRel"
    : lane.charAt(0).toUpperCase() + lane.slice(1);
}

export function BidForm({
  lane,
  laneName,
  defaultAmount,
  laneEmpty = false,
}: BidFormProps) {
  const [amount, setAmount] = useState(() => clampAmount(defaultAmount));
  const listRole = !laneEmpty;

  return (
    <section
      className="claim"
      id="claim"
      data-lane-empty={laneEmpty ? "true" : "false"}
      {...(laneEmpty
        ? { "data-empty-bay-list": "", "data-empty-honest": "" }
        : {})}
      {...(listRole ? { "data-list-role": "employer" } : {})}
      aria-label={listRole ? "List a role" : undefined}
    >
      <form
        action="/checkout"
        method="post"
        data-bid-form=""
        data-lane={lane}
      >
        {laneEmpty ? null : <input type="hidden" name="lane" value={lane} />}
        {listRole ? (
          <p className="list-this-role" data-list-role-stamp="">
            List a role
          </p>
        ) : null}
        <h2 {...(laneEmpty ? { "data-empty-claim": "" } : {})}>
          <span>Claim #1 for</span>
          <span className="amount-stepper">
            <button
              type="button"
              className="step"
              aria-label="Decrease bid by one dollar"
              onClick={() => setAmount((current) => clampAmount(current - 1))}
            >
              −
            </button>
            <label className="amount-field">
              <span className="sr-only">Amount in dollars</span>
              $
              <input
                name="amount"
                inputMode="numeric"
                pattern="[0-9]*"
                value={amount}
                autoFocus={laneEmpty}
                onChange={(event) => {
                  const next = Number(event.target.value.replace(/[^\d]/g, ""));
                  setAmount(clampAmount(next || MIN_BID_USD));
                }}
              />
            </label>
            <button
              type="button"
              className="step"
              aria-label="Increase bid by one dollar"
              onClick={() => setAmount((current) => clampAmount(current + 1))}
            >
              +
            </button>
          </span>
        </h2>
        <p className="claim-note">
          {laneEmpty ? (
            <>
              The last 7 days from paid placement are empty. ${MIN_BID_USD} takes
              #1. Pick the function after Claim #1. Nobody is invented here.
            </>
          ) : (
            <>
              List a remote role on this lane. New spots start at $
              {MIN_BID_USD}. Paying less than #1 still lists at the rank that
              bid can take.
            </>
          )}
        </p>
        {laneEmpty ? (
          <button
            type="submit"
            className="outbid"
            data-first-click="claim"
          >
            Outbid
          </button>
        ) : null}
        <div
          className="bid-row"
          {...(listRole ? { "data-one-identity": "" } : {})}
          {...(laneEmpty
            ? { "data-empty-identity": "", "data-empty-identity-first": "" }
            : {})}
        >
          <label className="identity-label" htmlFor="identity">
            Apply URL or company handle
          </label>
          <input
            id="identity"
            name="identity"
            placeholder="Apply URL or company handle"
            autoComplete="off"
            spellCheck={false}
            required
          />
          {laneEmpty ? null : (
            <button type="submit" className="outbid">
              Outbid
            </button>
          )}
        </div>
        {laneEmpty ? (
          <nav
            className="lane-pick"
            aria-label="Function lanes"
            data-lane-tabs=""
          >
            <label className="lane-pick-label" htmlFor="lane-pick">
              Function lanes
            </label>
            <select id="lane-pick" name="lane" defaultValue={lane}>
              {FUNCTION_LANES.map((item) => (
                <option key={item} value={item} data-lane={item}>
                  {functionLaneName(item)}
                </option>
              ))}
            </select>
          </nav>
        ) : (
          <p className="raise-hint">
            Already on this lane? Enter the same apply URL or handle and raise.
          </p>
        )}
      </form>
    </section>
  );
}
