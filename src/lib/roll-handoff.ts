// src/lib/roll-handoff.ts — hand a 平近月/建次月 leg pair from the 轉倉監控
// panel to the 組合單 panel so the user can review and send it as a single
// TimeSpread combo. Mirrors option-pick.ts: a module-level store bridged
// across windows (popouts) with BroadcastChannel. One-shot — cleared once
// the combo panel consumes it.

import { useSyncExternalStore } from 'react';

export interface RollHandoffLeg {
    code: string; // R1/R2 alias is fine — combo order resolves the real code
    action: 'Buy' | 'Sell';
}

export interface RollHandoffIntent {
    legs: [RollHandoffLeg, RollHandoffLeg]; // [平近月, 建次月]
    seq: number;
}

let current: RollHandoffIntent | null = null;
const listeners = new Set<() => void>();

const channel =
    typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel('sj-roll-handoff')
        : null;

function emit() {
    listeners.forEach((l) => l());
}

function apply(legs: [RollHandoffLeg, RollHandoffLeg]) {
    current = { legs, seq: (current?.seq ?? 0) + 1 };
    emit();
}

channel?.addEventListener('message', (e) => {
    const d = e.data as { legs?: RollHandoffLeg[] } | null;
    if (d && Array.isArray(d.legs) && d.legs.length === 2) {
        apply(d.legs as [RollHandoffLeg, RollHandoffLeg]);
    }
});

export function setPendingRoll(legs: [RollHandoffLeg, RollHandoffLeg]) {
    apply(legs);
    channel?.postMessage({ legs });
}

export function clearPendingRoll() {
    if (current === null) return;
    current = null;
    emit();
}

export function useRollHandoff(): RollHandoffIntent | null {
    return useSyncExternalStore(
        (l) => {
            listeners.add(l);
            return () => listeners.delete(l);
        },
        () => current,
    );
}
