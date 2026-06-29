// Mock for src/lib/stream.ts — feeds canned ticks / book columns to the
// components instead of a live SSE connection. Only the surface the synced
// components (and transitive imports) actually touch is implemented.

import { bookColumn, getCannedQuote, liveTicks } from './_data';
import type { QuoteState } from './_data';

export type { QuoteState } from './_data';
export type StreamStatus = 'connecting' | 'live' | 'down';

// the standard instrument the order-flow / tick-tape / vol-profile previews
// subscribe to — replayed ticks carry this code so code-filtered components
// (order-flow) still receive them
const STREAM_CODE = 'TMFR1';

const store = new Map<string, QuoteState>();

export function getQuote(code: string): QuoteState | undefined {
    return store.get(code) ?? getCannedQuote(code);
}

// depth-map subscribes here — replay a drifting 5-level book so the canvas
// heatmap fills with price-time depth history
export function subscribeQuoteStore(code: string, listener: () => void) {
    for (let i = 0; i < 190; i++) {
        store.set(code, bookColumn(code, i));
        listener();
    }
    return () => undefined;
}

// order-flow / vol-profile / tick-tape register here — replay a burst of
// aggressive trades (mostly 主動買, a few big lots)
export function onAnyTick(listener: (tick: ReturnType<typeof liveTicks>[number]) => void) {
    for (const t of liveTicks(STREAM_CODE)) listener(t);
    return () => undefined;
}

export function ensureStream() {}
export function getStreamStatus(): StreamStatus { return 'live'; }
export function subscribeStatusStore(_l: () => void) { return () => undefined; }
export function getLastHeartbeat(): number { return 0; }
export function getSubscriptionCount(): number { return 1; }
export function registerCodeAlias(_actual: string, _alias: string) {}
export function getAliasFor(_actual: string): string | undefined { return undefined; }
export function registerSubscription(_body: unknown) {}
export function onOrderEvent(_l: (ev: unknown) => void) { return () => undefined; }
