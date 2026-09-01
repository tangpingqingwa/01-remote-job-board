import { getPaymentIntent } from "../../../payments/port";

export const dynamic = "force-dynamic";

type CompletionPageProps = {
  searchParams?: Promise<{
    intent?: string | string[];
  }>;
};

type CompletionState = "pending" | "paid" | "failed" | "unknown";

function stateForIntent(status: string | undefined, hasListing: boolean): CompletionState {
  if (status === "paid" && hasListing) return "paid";
  if (status === "paid") return "unknown";
  if (status === "failed" || status === "rejected" || status === "abandoned") return "failed";
  if (status === "creating" || status === "open" || status === "processing") return "pending";
  return "unknown";
}

export default async function CheckoutCompletePage({ searchParams }: CompletionPageProps) {
  const params = (await searchParams) ?? {};
  const rawIntent = params.intent;
  const intentId = typeof rawIntent === "string" ? rawIntent : undefined;
  const intent = intentId ? getPaymentIntent(intentId) : undefined;
  const state = stateForIntent(intent?.status, Boolean(intent?.listingId));

  if (state === "paid" && intent?.listingId) {
    return (
      <main className="return-page" data-complete-state="paid">
        <h1>Payment received</h1>
        <p>
          {intent.listingDraft.company} is listed at ${intent.listingDraft.bidUsd}.
        </p>
        <p>
          <a href="/">Back to the board</a>
        </p>
      </main>
    );
  }

  if (state === "failed") {
    return (
      <main className="return-page" data-complete-state="failed">
        <h1>Payment not completed</h1>
        <p>No rank claimed. A failed or abandoned checkout does not list.</p>
        <p>
          <a href="/">Back to the board</a>
        </p>
      </main>
    );
  }

  if (state === "unknown") {
    return (
      <main className="return-page" data-complete-state="unknown">
        <h1>Payment status unknown</h1>
        <p>
          We could not confirm this checkout yet. Rank updates only after a
          confirmed payment.
        </p>
        <p>
          <a href="/">Back to the board</a>
        </p>
      </main>
    );
  }

  return (
    <main className="return-page" data-complete-state="pending">
      <h1>Payment pending</h1>
      <p>
        Your checkout is still being confirmed. Rank updates only after a
        confirmed payment.
      </p>
      <p>
        <a href="/">Back to the board</a>
      </p>
    </main>
  );
}
