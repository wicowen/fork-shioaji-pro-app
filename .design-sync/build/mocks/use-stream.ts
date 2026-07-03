// Mock for src/hooks/use-stream.ts — returns canned quotes synchronously so
// quote-board / depth-ladder / opt-payoff render a populated snapshot.

import { getCannedQuote } from './_data';
import type { QuoteState } from './_data';

export type StreamStatus = 'connecting' | 'live' | 'down';

export function useQuote(code: string | null): QuoteState | undefined {
    return getCannedQuote(code);
}
export function useStreamStatus(): StreamStatus { return 'live'; }
export function useTradingLive(): boolean { return true; }
