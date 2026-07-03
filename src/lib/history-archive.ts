// src/lib/history-archive.ts — deep-history candles bundled with the app.
//
// The live kbars API caps a single query at ~30 days, so the long timeframes
// cannot fetch their full lookback live. For symbols we shipped data for, we
// splice pre-aggregated history (built by scripts/build-kbar-archive.py) before
// the live window. Only 60m and 1d files ship; 120m is re-aggregated from the
// 60m file on load. Files are lazily code-split — only fetched on use.

import type { Candle } from './types/market';
import { aggregate } from './utils/kbars';

interface ArchiveFile {
    code: string;
    tf: string;
    count: number;
    bars: number[][]; // [time, open, high, low, close, volume]
}

const FILES = import.meta.glob<{ default: ArchiveFile }>(
    '../assets/history/*.json',
);

// Which bundled file backs a timeframe, and the minutes to aggregate it to.
// Only 60m and 1d files ship; 120m is derived from the 60m file by re-
// aggregating on load (pure OHLCV merge — no extra bundled data). `to === 0`
// means the file is already at the target grid and needs no re-aggregation.
function archiveSource(
    tfMinutes: number,
): { key: string; to: number } | null {
    if (tfMinutes === 60) return { key: '60m', to: 0 };
    if (tfMinutes === 120) return { key: '60m', to: 120 };
    if (tfMinutes >= 1440) return { key: '1d', to: 0 };
    return null;
}

function pathFor(code: string, tfMinutes: number): string | null {
    const src = archiveSource(tfMinutes);
    return src ? `../assets/history/${code}-${src.key}.json` : null;
}

export function hasArchive(code: string, tfMinutes: number): boolean {
    const p = pathFor(code, tfMinutes);
    return p !== null && p in FILES;
}

const cache = new Map<string, Candle[]>();

export async function loadArchive(
    code: string,
    tfMinutes: number,
): Promise<Candle[]> {
    const src = archiveSource(tfMinutes);
    if (src === null) return [];
    const p = `../assets/history/${code}-${src.key}.json`;
    const loader = FILES[p];
    if (!loader) return [];
    // cache the final series per (file, target grid) — the 60m file feeds both
    // the 60m and the aggregated 120m timeframe
    const cacheKey = `${p}|${src.to}`;
    const hit = cache.get(cacheKey);
    if (hit) return hit;
    const mod = await loader();
    const raw: Candle[] = mod.default.bars.map((r) => ({
        time: r[0]!,
        open: r[1]!,
        high: r[2]!,
        low: r[3]!,
        close: r[4]!,
        volume: r[5]!,
    }));
    const bars = src.to === 0 ? raw : aggregate(raw, src.to);
    cache.set(cacheKey, bars);
    return bars;
}
