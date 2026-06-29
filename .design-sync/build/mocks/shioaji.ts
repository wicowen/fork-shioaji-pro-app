// Mock for src/lib/shioaji.ts — only the market-data fetchers the synced
// components call. Each resolves immediately with canned data.

import type { ContractBase } from '@/lib/types/contract';
import type { KBars, Snapshot } from '@/lib/types/market';
import type { HistoryTicks } from '@/lib/types/tick';
import {
    historyTicks,
    kbars,
    lastTicks,
    memberSnapshots,
    sectorSnapshots,
} from './_data';

export async function fetchKbars(
    _contract: ContractBase, _start: string, _end: string,
): Promise<KBars> {
    return kbars() as KBars;
}

export async function fetchHistoryTicks(
    _contract: ContractBase, _date: string,
): Promise<HistoryTicks> {
    return historyTicks();
}

export async function fetchLastTicks(
    _contract: ContractBase, count: number, _date?: string,
): Promise<HistoryTicks> {
    return lastTicks(count);
}

export async function fetchSnapshots(contracts: ContractBase[]): Promise<Snapshot[]> {
    if (contracts[0]?.security_type === 'IND') return sectorSnapshots();
    return memberSnapshots(contracts.map((c) => c.code));
}
