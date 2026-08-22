export const CLICK_PATH = "/out" as const;

export function applyClickPath(listingId: string): string {
  return `${CLICK_PATH}/${listingId}`;
}
