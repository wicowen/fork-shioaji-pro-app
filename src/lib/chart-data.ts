// src/lib/chart-data.ts — assemble chart candles from the live kbars API plus
// bundled deep history. The live API caps a single query at ~30 days, so long
// timeframes splice archived bars (older) before a <=28-day live window. Live
// stays authoritative for its window so the newest bars are always current.

import { hasArchive, loadArchive } from './history-archive';
import { fetchKbars } from './shioaji';
import type { ContractBase } from './types/contract';
import type { Candle } from './types/market';
import { aggregate, dateStrOffset, kbarsToCandles } from './utils/kbars';

// keep each live query under the server's 30-day (inclusive) kbars limit
const LIVE_MAX_DAYS = 28;

export async function loadChartBars(
    contract: ContractBase,
    tfMinutes: number,
    tfDays: number,
): Promise<Candle[]> {
    const liveDays = Math.min(tfDays, LIVE_MAX_DAYS);
    const live = await fetchKbars(
        contract,
        dateStrOffset(liveDays),
        dateStrOffset(0),
    )
        .then((k) => aggregate(kbarsToCandles(k), tfMinutes))
        .catch(() => [] as Candle[]);

    if (!hasArchive(contract.code, tfMinutes)) return live;
    const archive = await loadArchive(contract.code, tfMinutes).catch(
        () => [] as Candle[],
    );
    if (archive.length === 0) return live;
    if (live.length === 0) return archive;

    // live owns its window; keep only archived bars older than the live start
    const liveStart = live[0]!.time;
    return archive.filter((b) => b.time < liveStart).concat(live);
}
