"use client";

import { useState, type FormEvent } from "react";
import type { FunctionLane } from "../../lib/types";
import { MAX_BID_USD, MIN_BID_USD } from "../../lib/types";

type BidFormProps = {
  lane: FunctionLane;
  defaultAmount: number;
};

function clampAmount(value: number): number {
  if (!Number.isFinite(value)) return MIN_BID_USD;
  return Math.min(MAX_BID_USD, Math.max(MIN_BID_USD, Math.trunc(value)));
}

export function BidForm({ lane, defaultAmount }: BidFormProps) {
  const [amount, setAmount] = useState(() => clampAmount(defaultAmount));

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <section className="claim" id="claim">
      <form data-bid-form="" data-lane={lane} onSubmit={onSubmit}>
        <h2>
          <span>Claim #1 for</span>
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
        </h2>
        <p className="claim-note">
          New spots start at ${MIN_BID_USD}. Paying less than #1 still lists at
          the rank that bid can take.
        </p>
        <div className="bid-row">
          <input
            id="identity"
            name="identity"
            placeholder="Apply URL or company handle"
            autoComplete="off"
            spellCheck={false}
            required
          />
          <button type="submit" className="outbid">
            Outbid
          </button>
        </div>
        <p className="raise-hint">
          Already on this lane? Enter the same apply URL or handle and raise.
        </p>
        <p className="stub-note" data-checkout-stub="">
          Checkout is not live. No charge and no rank claimed.
        </p>
      </form>
    </section>
  );
}
