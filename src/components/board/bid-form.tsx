"use client";

import { useEffect, useId, useRef, useState } from "react";
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

function FunctionPicker({
  lane,
  onChange,
  fixed = false,
}: {
  lane: FunctionLane;
  onChange: (lane: FunctionLane) => void;
  fixed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pickerId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <div className="lane-picker" data-lane-tabs="">
      <button
        ref={buttonRef}
        type="button"
        className={fixed ? "lane-picker-button is-fixed" : "lane-picker-button"}
        role="combobox"
        aria-label="Function lane"
        aria-controls={pickerId}
        aria-expanded={fixed ? false : open}
        aria-disabled={fixed}
        aria-haspopup="listbox"
        data-slot="category-control"
        onClick={() => {
          if (!fixed) setOpen((current) => !current);
        }}
      >
        <span>{functionLaneName(lane)}</span>
      </button>
      {open && !fixed ? (
        <div className="lane-picker-menu" id={pickerId} role="listbox">
          {FUNCTION_LANES.map((item) => (
            <button
              key={item}
              type="button"
              role="option"
              aria-selected={item === lane}
              className={
                item === lane
                  ? "lane-picker-option is-current"
                  : "lane-picker-option"
              }
              onClick={() => {
                onChange(item);
                setOpen(false);
                buttonRef.current?.focus();
              }}
            >
              {functionLaneName(item)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function BidForm({
  lane,
  laneName,
  defaultAmount,
  laneEmpty = false,
}: BidFormProps) {
  const [amount, setAmount] = useState(() => clampAmount(defaultAmount));
  const [identity, setIdentity] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [salaryMinUsd, setSalaryMinUsd] = useState("");
  const [salaryMaxUsd, setSalaryMaxUsd] = useState("");
  const [selectedLane, setSelectedLane] = useState<FunctionLane>(lane);
  const listRole = !laneEmpty;
  const ready =
    identity.trim().length > 0 &&
    title.trim().length >= 3 &&
    company.trim().length >= 2 &&
    Boolean(selectedLane);

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
      data-slot="claim-hero"
    >
      <h2
        {...(laneEmpty ? { "data-empty-claim": "" } : {})}
        data-slot="claim-heading"
      >
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
            <span aria-hidden="true">$</span>
            <input
              form="claim-form"
              name="amount"
              inputMode="numeric"
              pattern="[0-9]*"
              style={{ width: `${Math.max(2, String(amount).length)}ch` }}
              value={amount}
              onChange={(event) => {
                const next = Number(event.target.value.replace(/[^\d]/g, ""));
                setAmount(clampAmount(next || MIN_BID_USD));
              }}
              aria-label="Amount in dollars"
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
      <form
        id="claim-form"
        action="/checkout"
        method="post"
        data-bid-form=""
        data-lane={selectedLane}
        data-slot="claim-form"
      >
        {listRole ? (
          <p className="list-this-role" data-list-role-stamp="">
            List a role
          </p>
        ) : null}
        <p className="claim-note">
          {laneEmpty ? (
            <>
              The last 7 days from paid placement are empty. ${MIN_BID_USD} takes
              #1. Nobody is invented here. Enter the real role details before
              paying.
            </>
          ) : (
            <>
              List a remote role on this lane. New placements start at $
              {MIN_BID_USD}; paying less than #1 still lists at the rank that
              bid can take.
            </>
          )}
        </p>
        <div className="job-fields" data-slot="job-fields" data-job-fields="">
          <div className="field-group">
            <label htmlFor="role-title">Role title</label>
            <input
              id="role-title"
              name="title"
              placeholder="Staff Backend Engineer"
              autoComplete="off"
              required
              maxLength={80}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="field-group">
            <label htmlFor="company-name">Company</label>
            <input
              id="company-name"
              name="company"
              placeholder="Acme"
              autoComplete="organization"
              required
              maxLength={60}
              value={company}
              onChange={(event) => setCompany(event.target.value)}
            />
          </div>
          <fieldset className="field-group salary-fields">
            <legend>Salary (optional, annual USD)</legend>
            <div className="salary-inputs">
              <label htmlFor="salary-min">
                <span className="sr-only">Minimum annual salary in USD</span>
                <span aria-hidden="true">$</span>
                <input
                  id="salary-min"
                  name="salaryMinUsd"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="120000"
                  value={salaryMinUsd}
                  onChange={(event) => setSalaryMinUsd(event.target.value.replace(/[^\d]/g, ""))}
                />
              </label>
              <span aria-hidden="true">–</span>
              <label htmlFor="salary-max">
                <span className="sr-only">Maximum annual salary in USD</span>
                <span aria-hidden="true">$</span>
                <input
                  id="salary-max"
                  name="salaryMaxUsd"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="160000"
                  value={salaryMaxUsd}
                  onChange={(event) => setSalaryMaxUsd(event.target.value.replace(/[^\d]/g, ""))}
                />
              </label>
            </div>
          </fieldset>
        </div>
        <div
          className="bid-row"
          {...(listRole ? { "data-one-identity": "" } : {})}
          {...(laneEmpty ? { "data-empty-identity": "" } : {})}
        >
          <label className="identity-label" htmlFor="identity">
            Apply URL or company handle
          </label>
          <div className="identity-control">
            <input
              id="identity"
              name="identity"
              placeholder="https://jobs.example.com/role, hartevo.com, or @company"
              autoComplete="off"
              spellCheck={false}
              required
              value={identity}
              data-slot="url-input"
              onChange={(event) => setIdentity(event.target.value)}
            />
          </div>
          <FunctionPicker
            lane={selectedLane}
            onChange={setSelectedLane}
            fixed={listRole}
          />
          {laneEmpty ? (
            <select
              id="lane-pick"
              className="lane-select-source"
              name="lane"
              value={selectedLane}
              onChange={(event) =>
                setSelectedLane(event.target.value as FunctionLane)
              }
              tabIndex={-1}
              aria-hidden="true"
            >
              {FUNCTION_LANES.map((item) => (
                <option key={item} value={item}>
                  {functionLaneName(item)}
                </option>
              ))}
            </select>
          ) : (
            <input type="hidden" name="lane" value={selectedLane} />
          )}
          <button
            type="submit"
            className="claim-submit"
            aria-label="Claim rank"
            disabled={!ready}
            data-slot="claim-button"
          >
            Claim rank
          </button>
        </div>
        {laneEmpty ? null : (
          <p className="raise-hint">
            Already on this lane? Enter the same apply URL or handle and raise.
            Returning employers pay only the difference when they raise the
            same listing.
          </p>
        )}
      </form>
    </section>
  );
}
