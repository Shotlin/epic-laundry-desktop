import { AlertTriangle, ChevronRight, Loader2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import type { LaundryOrder, LaundryState } from "@/lib/laundry";
import { formatMoney } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type StatusMove = { order: LaundryOrder; next: LaundryState };
/** Extra permissions an operator can grant for one move after the system explained why it stopped. */
export type StatusOverride = { allowIncomplete?: boolean; allowUnpaid?: boolean };

const WHAT_HAPPENS: Partial<Record<LaundryState, string>> = {
  "Picked Up": "The garments have been collected from the customer.",
  "In Process": "Work on this order is starting.",
  Ready: "Confirm the garments are cleaned, checked and ready for the customer.",
  "Out for Delivery": "The order leaves the store with the captain.",
  Delivered: "The customer has received the order. Any tag tracking is completed and the invoice is issued.",
};

/**
 * The confirmation every status change goes through. It stays open while the backend works, closes only
 * after the backend has confirmed the new status, and shows a refusal right here — with a way forward —
 * instead of failing quietly somewhere else on the page.
 */
export function OrderStatusDialog({
  move,
  pending,
  error,
  onConfirm,
  onClose,
  onReload,
}: {
  move: StatusMove | null;
  pending: boolean;
  error: unknown;
  onConfirm: (override?: StatusOverride) => void;
  onClose: () => void;
  onReload: () => void;
}) {
  const order = move?.order;
  const next = move?.next;
  const code = error instanceof ApiError ? error.code : undefined;
  const message = error ? (error instanceof Error ? error.message : "The order status could not be updated.") : "";
  const balanceDue = order && order.paymentStatus !== "Paid" && next === "Delivered";
  const stale = code === "VERSION_CONFLICT" || code === "INVALID_TRANSITION" || code === "NOT_FOUND";
  return (
    <AlertDialog open={Boolean(move)} onOpenChange={(open) => !open && !pending && onClose()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Mark {order?.orderNumber} as {next}?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-[#526368]">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#17353c]">
                <span className="rounded-full bg-[#eef1ee] px-2.5 py-1">{order?.state}</span>
                <ChevronRight className="h-3.5 w-3.5 text-[#718087]" />
                <span className="rounded-full bg-[#123039] px-2.5 py-1 text-white">{next}</span>
                <span className="ml-auto font-medium text-[#718087]">
                  {order?.customer.name} · {order ? formatMoney(order.grandTotal) : ""}
                </span>
              </div>
              <p>{next ? WHAT_HAPPENS[next] : null}</p>
              {balanceDue && !error ? (
                <p className="rounded-lg bg-[#fff6e1] px-3 py-2 text-xs font-semibold text-[#855815]">
                  This order still has a balance due — collect payment first, or deliver it with the balance left open.
                </p>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <div role="alert" className="flex gap-2 rounded-lg bg-[#fdeceb] px-3 py-2.5 text-xs font-semibold text-[#a04b32]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{message}</span>
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="rounded-lg border border-[#263f44]/15 bg-white px-3 py-2 text-xs font-bold text-[#40565a] disabled:opacity-50"
          >
            {error ? "Close" : "Cancel"}
          </button>
          {stale ? (
            <button type="button" onClick={onReload} className="rounded-lg bg-[#123039] px-3 py-2 text-xs font-bold text-white">
              Reload orders
            </button>
          ) : code === "ASSEMBLY_INCOMPLETE" && !/missing/i.test(message) ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => onConfirm({ allowIncomplete: true })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#9a6519] px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Mark ready anyway
            </button>
          ) : code === "PAYMENT_OUTSTANDING" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => onConfirm({ allowUnpaid: true })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#9a6519] px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Deliver, balance stays due
            </button>
          ) : !error ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => onConfirm()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#123039] px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {pending ? "Updating…" : `Yes, mark ${next}`}
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => onConfirm()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#123039] px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Try again
            </button>
          )}
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
