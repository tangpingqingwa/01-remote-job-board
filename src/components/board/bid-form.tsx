"use client";

import { useState } from "react";
import type { FunctionLane } from "../../lib/types";
import { MAX_BID_USD, MIN_BID_USD } from "../../lib/types";

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
      {...(laneEmpty ? { "data-empty-bay-list": "" } : {})}
      {...(listRole ? { "data-list-role": "employer" } : {})}
      aria-label={listRole ? "List a role" : undefined}
    >
      <form
        action="/checkout"
        method="post"
        data-bid-form=""
        data-lane={lane}
      >
        <input type="hidden" name="lane" value={lane} />
        {listRole ? (
          <p className="list-this-role" data-list-role-stamp="">
            List a role
          </p>
        ) : null}
        {laneEmpty ? (
          <div
            className="bid-row"
            data-empty-identity=""
            data-empty-identity-first=""
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
              autoFocus
            />
          </div>
        ) : null}
        <h2>
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
              This week&apos;s {laneName} lane is empty. ${MIN_BID_USD} takes
              #1. Nobody is invented here.
            </>
          ) : (
            <>
              List a remote role on this lane. New spots start at $
              {MIN_BID_USD}. Paying less than #1 still lists at the rank that
              bid can take.
            </>
          )}
        </p>
        <div className="bid-row">
          {laneEmpty ? null : (
            <input
              id="identity"
              name="identity"
              placeholder="Apply URL or company handle"
              autoComplete="off"
              spellCheck={false}
              required
            />
          )}
          <button type="submit" className="outbid">
            Outbid
          </button>
        </div>
        {laneEmpty ? null : (
          <p className="raise-hint">
            Already on this lane? Enter the same apply URL or handle and raise.
          </p>
        )}
      </form>
    </section>
  );
}
