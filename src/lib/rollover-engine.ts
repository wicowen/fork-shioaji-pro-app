// src/lib/rollover-engine.ts — client-side calendar-spread (roll) monitor.
// Watches the SSE tick stream for a held futures position's near/next month
// and alerts (notify → 警示 sound via event-toasts) when the roll spread
// reaches the user's target. Alert-only: it never places orders. Watches
// persist in localStorage but only run while the app is open.

import { useSyncExternalStore } from 'react';
import { ensureContract } from './contracts-cache';
import { getQuote, onAnyTick, type QuoteState } from './stream';
import { notify } from './trade';

export interface RolloverWatch {
    id: string; // `roll-${pos.code}-${pos.id}`
    productRoot: string; // 'TMF'
    label: string;
    posDirection: 'Buy' | 'Sell'; // drives the rollEdge formula
    posQty: number;
    nearCode: string; // quote-store display code, e.g. 'TMFR1'
    nextCode: string; // e.g. 'TMFR2'
    positionIsFront: boolean; // position.code === near.target_code
    targetPoints: number; // alert when rollEdge >= this (favourable side)
    enabled: boolean;
    armed: boolean; // fire once, re-arm after edge falls below target-gap
}

// resolved-from-position fields (everything except user settings + armed)
export type RollWatchSeed = Pick<
    RolloverWatch,
    | 'id'
    | 'productRoot'
    | 'label'
    | 'posDirection'
    | 'posQty'
    | 'nearCode'
    | 'nextCode'
    | 'positionIsFront'
>;

const STORAGE_KEY = 'sj-pro-rollovers';
// hysteresis: re-arm only after the edge drops this far below target, so a
// quote flickering around the threshold can't machine-gun alerts
const REARM_GAP = 2;

function load(): RolloverWatch[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) return arr as RolloverWatch[];
        }
    } catch {
        // corrupted — start clean
    }
    return [];
}

let watches: RolloverWatch[] = load();
const listeners = new Set<() => void>();

function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(watches));
    listeners.forEach((l) => l());
}

// ---- pure helpers ----

const round2 = (v: number) => Number(v.toFixed(2));

// strip the month code (R1/R2 alias or 月碼+年尾數 like G6) to the product
// root: 'TMFG6' → 'TMF', 'TXFR1' → 'TXF'. Mirrors combo-ticket's root().
export function rollRoot(code: string): string {
    return code.replace(/(R[12]|[A-Z]\d)$/, '');
}
export const nearAlias = (root: string) => `${root}R1`;
export const nextAlias = (root: string) => `${root}R2`;

function level1(q: QuoteState | undefined): {
    bid: number;
    ask: number;
    close: number;
} {
    const ba = q?.bidask;
    return {
        bid: ba ? Number(ba.bid_price[0]) : NaN,
        ask: ba ? Number(ba.ask_price[0]) : NaN,
        close: q?.tick ? Number(q.tick.close) : NaN,
    };
}

export interface RollEdgeResult {
    edge: number; // positive = favourable for the held position
    basis: 'book' | 'approx' | 'none';
}

// roll spread in the direction that benefits the position:
//   short: sell next (bid) − buy back near (ask) = next.bid − near.ask
//   long:  sell near (bid) − buy next (ask)      = near.bid − next.ask
// uses the executable side (bid/ask); falls back to last-price diff (approx,
// never triggers) when a book is missing (pre-open / illiquid next month).
export function computeRollEdge(
    nearQ: QuoteState | undefined,
    nextQ: QuoteState | undefined,
    posDirection: 'Buy' | 'Sell',
): RollEdgeResult {
    const n = level1(nearQ);
    const x = level1(nextQ);
    const book = posDirection === 'Sell' ? x.bid - n.ask : n.bid - x.ask;
    if (Number.isFinite(book)) return { edge: round2(book), basis: 'book' };
    const approx =
        posDirection === 'Sell' ? x.close - n.close : n.close - x.close;
    if (Number.isFinite(approx)) {
        return { edge: round2(approx), basis: 'approx' };
    }
    return { edge: NaN, basis: 'none' };
}

// ---- store API ----

export function getWatches(): RolloverWatch[] {
    return watches;
}

export function useRolloverWatches(): RolloverWatch[] {
    return useSyncExternalStore(
        (l) => {
            listeners.add(l);
            return () => listeners.delete(l);
        },
        () => watches,
    );
}

// create or refresh a watch from a resolved position. User settings
// (targetPoints/enabled/armed) survive refreshes; resolved fields update so a
// settlement-day month roll keeps the same row + target.
export function upsertWatch(seed: RollWatchSeed) {
    const existing = watches.find((w) => w.id === seed.id);
    if (existing) {
        if (
            existing.productRoot === seed.productRoot &&
            existing.label === seed.label &&
            existing.posDirection === seed.posDirection &&
            existing.posQty === seed.posQty &&
            existing.nearCode === seed.nearCode &&
            existing.nextCode === seed.nextCode &&
            existing.positionIsFront === seed.positionIsFront
        ) {
            return; // nothing changed — avoid a needless persist/render
        }
        watches = watches.map((w) => (w.id === seed.id ? { ...w, ...seed } : w));
    } else {
        watches = [
            ...watches,
            { ...seed, targetPoints: 0, enabled: false, armed: true },
        ];
    }
    persist();
}

export function setWatchTarget(id: string, targetPoints: number) {
    watches = watches.map((w) =>
        w.id === id ? { ...w, targetPoints, armed: true } : w,
    );
    persist();
}

export function setWatchEnabled(id: string, enabled: boolean) {
    watches = watches.map((w) =>
        w.id === id ? { ...w, enabled, armed: enabled ? true : w.armed } : w,
    );
    persist();
}

export function removeWatch(id: string) {
    watches = watches.filter((w) => w.id !== id);
    persist();
}

// ---- engine ----

function fire(w: RolloverWatch, edge: number) {
    notify({
        kind: 'info',
        // 標題含「警示」→ event-toasts 播放到價音效（與 trigger-engine 一致）
        title: '🔄 轉倉價差警示',
        body: `${w.label} 轉倉價差 ${edge} 已達目標 ${w.targetPoints} 點（${w.nearCode} → ${w.nextCode}）`,
    });
}

let engineStarted = false;
export function startRolloverEngine() {
    if (engineStarted) return;
    engineStarted = true;
    // resubscribe persisted watches so monitoring survives a reload even
    // before the 轉倉監控 panel is opened
    for (const w of watches) {
        void ensureContract(w.nearCode, 'FUT').catch(() => undefined);
        void ensureContract(w.nextCode, 'FUT').catch(() => undefined);
    }
    onAnyTick((tick) => {
        if (watches.length === 0) return;
        const touched = watches.some(
            (w) =>
                w.enabled &&
                (w.nearCode === tick.code || w.nextCode === tick.code),
        );
        if (!touched) return;
        let changed = false;
        const next = watches.map((w) => {
            if (!w.enabled) return w;
            const { edge, basis } = computeRollEdge(
                getQuote(w.nearCode),
                getQuote(w.nextCode),
                w.posDirection,
            );
            if (basis !== 'book' || !Number.isFinite(edge)) return w;
            if (w.armed && edge >= w.targetPoints) {
                fire(w, edge);
                changed = true;
                return { ...w, armed: false };
            }
            if (!w.armed && edge <= w.targetPoints - REARM_GAP) {
                changed = true;
                return { ...w, armed: true };
            }
            return w;
        });
        if (changed) {
            watches = next;
            persist();
        }
    });
}
