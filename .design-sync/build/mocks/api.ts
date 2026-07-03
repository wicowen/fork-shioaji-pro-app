// Mock for src/lib/api.ts — routes the REST paths the synced components hit
// to canned responses. No network.

import { CREDIT, PUNISH_CODES, SHORT_SOURCE, pnlRows } from './_data';

function route(path: string, body?: unknown): unknown {
    if (path.includes('/portfolio/profit_loss')) {
        // pnl-panel calls once per account (S, F) — return one populated set
        const at = (body as { account_type?: string } | undefined)?.account_type;
        return at === 'F' ? pnlRows() : [];
    }
    if (path.includes('/data/credit_enquire')) return [CREDIT];
    if (path.includes('/data/short_stock_sources')) return [SHORT_SOURCE];
    if (path.includes('/data/regulatory_punish')) return { code: PUNISH_CODES };
    return [];
}

export async function apiGet<T>(path: string): Promise<T> {
    return route(path) as T;
}
export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
    return route(path, body) as T;
}
export async function apiPut<T>(path: string, _body?: unknown): Promise<T> {
    return route(path) as T;
}
export async function apiDelete<T>(path: string, _body?: unknown): Promise<T> {
    return route(path) as T;
}
