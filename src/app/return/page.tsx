import { handleCheckoutReturn } from "../../payments/port";

export const dynamic = "force-dynamic";

type ReturnPageProps = {
  searchParams?: Promise<{
    checkoutId?: string | string[];
    status?: string | string[];
  }>;
};

export default async function ReturnPage({ searchParams }: ReturnPageProps) {
  const params = (await searchParams) ?? {};
  const result = await handleCheckoutReturn(params);

  if (result.status === "cancel") {
    return (
      <main className="return-page" data-return="cancel">
        <h1>Checkout canceled</h1>
        <p>No rank claimed. An abandoned checkout does not list.</p>
        <p>
          <a href="/">Back to the board</a>
        </p>
      </main>
    );
  }

  if (result.listing) {
    return (
      <main className="return-page" data-return="success">
        <h1>You&apos;re on the board</h1>
        <p>{result.listing.company} is listed at ${result.listing.bidUsd}.</p>
        <p>
          <a href="/">Back to the board</a>
        </p>
      </main>
    );
  }

  return (
    <main className="return-page" data-return="pending">
      <h1>Payment pending</h1>
      <p>Rank updates only after a trusted payment confirmation.</p>
      <p>
        <a href="/">Back to the board</a>
      </p>
    </main>
  );
}
