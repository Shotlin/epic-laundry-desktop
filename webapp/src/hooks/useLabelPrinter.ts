import { useSyncExternalStore } from "react";
import { getPrinterState, subscribePrinter } from "@/lib/labelPrinter";

/** Live state of the label printer on this computer (connected / model / serial / status / settings). */
export function useLabelPrinter() {
  return useSyncExternalStore(subscribePrinter, getPrinterState, getPrinterState);
}
