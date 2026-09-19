import { createHash } from "node:crypto";

export function formatOrderNumber(createdAt: Date, sequence: number): string {
  const ymd = createdAt.toISOString().slice(0, 10).replaceAll("-", "");
  return `SS-${ymd}-${String(sequence).padStart(5, "0")}`;
}

export function hashOrderRequest(body: {
  deliveryMethod: string;
  confirm: boolean;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        deliveryMethod: body.deliveryMethod,
        confirm: body.confirm,
      }),
    )
    .digest("hex");
}
