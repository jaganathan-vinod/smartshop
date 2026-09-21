export const EMPTY_ORDERS_COPY = "No orders in this window";

export function isEmptyOrdersWindow(gmvCents: number, dayCount: number): boolean {
  return dayCount === 0 || gmvCents === 0;
}
