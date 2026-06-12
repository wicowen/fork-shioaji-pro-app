// src/lib/stock-index.ts — all stock contracts loaded once for name
// search (找代碼不用背) and category/sector grouping.

import { apiPost } from './api';

export interface StockMeta {
    code: string;
    name: string;
    category: string;
    exchange: string;
    day_trade?: string;
}

let cache: StockMeta[] | null = null;
let loading: Promise<StockMeta[]> | null = null;

export function loadStockIndex(): Promise<StockMeta[]> {
    if (cache) return Promise.resolve(cache);
    if (loading) return loading;
    loading = apiPost<{ contracts: StockMeta[] }>('/api/v1/data/contracts', {
        security_type: 'STK',
        page: -1,
    })
        .then((res) => {
            cache = res.contracts.filter((c) => c.code && c.name);
            return cache;
        })
        .catch((e) => {
            loading = null; // allow retry
            throw e;
        });
    return loading;
}

// substring match on name, prefix match on code — ranked so the actual
// stock beats its thousands of warrants (台積電 before 台積電XX購YY)
export function searchStocks(
    index: StockMeta[],
    query: string,
    limit = 8,
): StockMeta[] {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    const scored: { s: StockMeta; score: number }[] = [];
    for (const s of index) {
        const name = s.name.toUpperCase();
        const codeHit = s.code.startsWith(q);
        const nameHit = name.includes(q);
        if (!codeHit && !nameHit) continue;
        let score = 0;
        if (s.code === q || name === q) score -= 100; // exact
        if (codeHit) score -= 10;
        else if (name.startsWith(q)) score -= 5;
        // plain 4-digit equities rank above warrants/ETNs (6-char codes)
        score += s.code.length === 4 ? 0 : 50;
        score += s.name.length; // shorter names first
        scored.push({ s, score });
    }
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, limit).map((x) => x.s);
}

// distinct categories with member counts (for 類股/heatmap)
export function categoriesOf(
    index: StockMeta[],
): { category: string; count: number }[] {
    const m = new Map<string, number>();
    for (const s of index) {
        if (!s.category) continue;
        m.set(s.category, (m.get(s.category) ?? 0) + 1);
    }
    return [...m.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);
}
