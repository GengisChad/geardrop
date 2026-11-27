/**
 * Shared types for the full-catalogue pricing batch action.
 * Lives outside the "use server" file so it can be imported by both client
 * components (pricing-forms.tsx) and the server action (actions/pricing.ts).
 */

import { PRICING_BATCH_SIZE } from "./pricing-agent";

/** State managed by the "Analizza tutto il catalogo" client loop. */
export type AnalyseAllState = {
  readonly status: "idle" | "running" | "done" | "stopped";
  readonly nextOffset: number;
  readonly totalProducts: number;
  readonly batchSize: number;
  readonly processed: number;
  readonly observations: number;
  readonly proposals: number;
  readonly dollars: number;
  readonly lastSummary: string;
  readonly errors: readonly string[];
};

export const ANALYSE_ALL_INITIAL: AnalyseAllState = {
  status: "idle",
  nextOffset: 0,
  totalProducts: 0,
  batchSize: PRICING_BATCH_SIZE,
  processed: 0,
  observations: 0,
  proposals: 0,
  dollars: 0,
  lastSummary: "",
  errors: [],
};
