// Deterministic canned market data for isolated design-sync previews.
// The real Shioaji Pro components render against this in place of the live
// SSE / REST data layer (wired via ../vite.config.ts alias plugin). Numbers
// are realistic Taiwan index-futures / equity values; every generator is
// deterministic (seeded hash, no Math.random / Date.now) so preview renders —
// and the grades keyed off them — stay stable across rebuilds.

import type { ContractInfo } from '@/lib/types/contract';
import type { Snapshot, SseBidAsk, SseTick } from '@/lib/types/market';
import type { HistoryTicks } from '@/lib/types/tick';
import type { Position } from '@/lib/types/portfolio';

// QuoteState mirrors src/lib/stream.ts (which is mocked). The mock stream
// re-exports this type so component `import type { QuoteState }` resolves.
export interface QuoteState {
    tick?: SseTick;
    bidask?: SseBidAsk;
    lastDir: 1 | -1 | 0;
    seq: number;
    flashSeq: number;
}

// deterministic 0..1 hash — stable renders -> stable grades
const det = (n: number): number => {
    const x = Math.sin(n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
};
const pad2 = (n: number) => String(n).padStart(2, '0');
// HH:MM:SS.ffffff afternoon-session timestamps; larger i = older
const timeStr = (i: number): string => {
    const s = Math.max(0, 48_300 - i); // ~13:25 down to earlier
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}.000000`;
};
const DATE = '2026/06/26';
const DATE_DASH = '2026-06-26';

// ── contracts ─────────────────────────────────────────────────────────────

export const TXF: ContractInfo = {
    exchange: 'TAIFEX', code: 'TXFR1', security_type: 'FUT', target_code: 'TXFF6',
    name: '臺指期近月', currency: 'TWD',
    limit_up: 25410, limit_down: 20790, reference: 23100,
    day_trade: 'Yes', update_date: DATE, category: 'TXF',
    margin_trading_balance: 0, short_selling_balance: 0, multiplier: 200,
};
export const TMF: ContractInfo = {
    ...TXF, code: 'TMFR1', target_code: 'TMFF6', name: '微型臺指近月', multiplier: 10,
};
export const MXF: ContractInfo = {
    ...TXF, code: 'MXFR1', target_code: 'MXFF6', name: '小型臺指近月', multiplier: 50,
};
export const TSMC: ContractInfo = {
    exchange: 'TSE', code: '2330', security_type: 'STK', target_code: null,
    name: '台積電', currency: 'TWD',
    limit_up: 1190, limit_down: 975, reference: 1085,
    day_trade: 'Yes', update_date: DATE, category: '24',
    margin_trading_balance: 18650, short_selling_balance: 2240,
};

// ── ticks / bid-ask / quotes ───────────────────────────────────────────────

function mkTick(code: string, close: number, ref: number, i = 0): SseTick {
    const chg = Number((close - ref).toFixed(2));
    return {
        code, date: DATE, time: timeStr(i),
        open: String(ref + 12), high: String(Math.max(close, ref) + 18),
        low: String(Math.min(close, ref) - 26), close: String(close),
        avg_price: String(Math.round((close + ref) / 2)),
        volume: 1 + Math.floor(det(i + 1) * 4),
        total_volume: 78421 + i,
        amount: String(close * 200),
        total_amount: String(close * 200 * (78421 + i)),
        tick_type: det(i) > 0.42 ? 1 : 2,
        price_chg: String(chg),
        bid_side_total_vol: 12_540, ask_side_total_vol: 9_870,
    };
}

function mkBidAsk(code: string, mid: number, bidHeavy = true): SseBidAsk {
    const base = Math.round(mid);
    const bid_price: string[] = [];
    const ask_price: string[] = [];
    const bid_volume: number[] = [];
    const ask_volume: number[] = [];
    for (let i = 0; i < 5; i++) {
        bid_price.push(String(base - i));
        ask_price.push(String(base + 1 + i));
        bid_volume.push(Math.round((46 + det(i + 7) * 150) * (bidHeavy ? 1.4 : 0.78)));
        ask_volume.push(Math.round((46 + det(i + 21) * 150) * (bidHeavy ? 0.8 : 1.35)));
    }
    return { code, date: DATE, time: timeStr(0), bid_price, bid_volume, ask_price, ask_volume };
}

const QUOTES = new Map<string, QuoteState>();
function scenario(code: string): QuoteState {
    let close = 23148;
    let ref = 23100;
    let bidHeavy = true;
    if (code.startsWith('MXF')) { close = 23062; ref = 23100; bidHeavy = false; }
    else if (code.startsWith('TMF') || code.startsWith('TXF')) { close = 23148; ref = 23100; }
    else if (code === '2330') { close = 1095; ref = 1085; }
    else {
        const h = det(code.length * 3 + code.charCodeAt(0));
        close = 120 + Math.round(h * 60);
        ref = close - (h > 0.5 ? 3 : -3);
        bidHeavy = h > 0.5;
    }
    return {
        tick: mkTick(code, close, ref),
        bidask: mkBidAsk(code, close, bidHeavy),
        lastDir: close >= ref ? 1 : -1, seq: 1, flashSeq: 1,
    };
}
// stable ref per code — safe for useSyncExternalStore-style reads
export function getCannedQuote(code: string | null): QuoteState | undefined {
    if (!code) return undefined;
    let q = QUOTES.get(code);
    if (!q) { q = scenario(code); QUOTES.set(code, q); }
    return q;
}

// drifting 5-level book column for the depth-map time-series heatmap
export function bookColumn(code: string, i: number): QuoteState {
    const mid = 23080 + i * 0.16 + Math.sin(i / 9) * 15;
    const ba = mkBidAsk(code, mid, det(i) > 0.42);
    ba.bid_volume = ba.bid_volume.map((v, k) => Math.round(v * (0.45 + det(i * 5 + k) * 1.5)));
    ba.ask_volume = ba.ask_volume.map((v, k) => Math.round(v * (0.45 + det(i * 7 + k) * 1.5)));
    return { tick: mkTick(code, Math.round(mid), 23080, i), bidask: ba, lastDir: 1, seq: i + 1, flashSeq: i + 1 };
}

// ── history ticks (vol-profile + order-flow seed) ──────────────────────────

export function historyTicks(n = 240): HistoryTicks {
    const datetime: string[] = [];
    const close: number[] = [];
    const volume: number[] = [];
    const tick_type: number[] = [];
    const bid_price: number[] = [];
    const bid_volume: number[] = [];
    const ask_price: number[] = [];
    const ask_volume: number[] = [];
    let price = 23080;
    for (let i = 0; i < n; i++) {
        price += Math.round((det(i) - 0.46) * 6); // clusters around levels
        const big = det(i * 3) > 0.9 ? 40 + Math.floor(det(i) * 55) : 0;
        const v = 1 + Math.floor(det(i * 2 + 1) * 6) + big;
        datetime.push(`${DATE_DASH} ${timeStr(n - i)}`);
        close.push(price);
        volume.push(v);
        tick_type.push(det(i * 1.7) > 0.45 ? 1 : 2);
        bid_price.push(price - 1);
        bid_volume.push(20 + Math.floor(det(i) * 60));
        ask_price.push(price + 1);
        ask_volume.push(20 + Math.floor(det(i + 5) * 60));
    }
    return { datetime, close, volume, tick_type, bid_price, bid_volume, ask_price, ask_volume };
}

// most-recent ticks for the tick-tape (newest last; component reverses)
export function lastTicks(count = 28): HistoryTicks {
    return historyTicks(count);
}

// live aggressive trades replayed through onAnyTick — trending up, mostly
// 主動買 (tick_type 1) with a few big lots so order-flow shows real pressure
export function liveTicks(code: string, n = 40): SseTick[] {
    const out: SseTick[] = [];
    let price = 23138;
    for (let i = 0; i < n; i++) {
        price += Math.round((det(i * 4 + 2) - 0.4) * 4);
        const big = det(i * 9) > 0.85 ? 45 + Math.floor(det(i) * 40) : 0;
        out.push({
            ...mkTick(code, price, 23100, i),
            volume: 1 + Math.floor(det(i * 6 + 3) * 4) + big,
            tick_type: det(i * 1.3) > 0.38 ? 1 : 2,
            time: timeStr(900 - i),
        });
    }
    return out;
}

// ── kbars (sparkline) ──────────────────────────────────────────────────────

export function kbars(reference = 23100): KBarsLite {
    const datetime: string[] = [];
    const Close: number[] = [];
    let p = reference - 8;
    const n = 88;
    for (let i = 0; i < n; i++) {
        p += (det(i) - 0.42) * 9 + Math.sin(i / 14) * 2.2; // gentle uptrend
        datetime.push(`${DATE_DASH} ${timeStr(n - i)}`);
        Close.push(Number(p.toFixed(1)));
    }
    return {
        datetime,
        Open: Close.map((c) => c - 1),
        High: Close.map((c) => c + 3),
        Low: Close.map((c) => c - 3),
        Close,
        Volume: Close.map((_, i) => 20 + Math.floor(det(i) * 120)),
        Amount: Close.map((c) => c * 200),
    };
}
interface KBarsLite {
    datetime: string[]; Open: number[]; High: number[]; Low: number[];
    Close: number[]; Volume: number[]; Amount: number[];
}

// ── P&L rows (pnl-panel) ───────────────────────────────────────────────────

export function pnlRows(): { date: string; pnl: number }[] {
    const out: { date: string; pnl: number }[] = [];
    for (let i = 0; i < 18; i++) {
        const day = pad2(8 + i);
        // a mostly-winning month with a few red days
        const win = det(i * 2.3) > 0.34;
        const mag = 800 + Math.floor(det(i * 5) * 5200);
        out.push({ date: `2026-06-${day}`, pnl: win ? mag : -Math.floor(mag * 0.7) });
    }
    return out;
}

// ── chips-card (credit / short / punish) ───────────────────────────────────

export const CREDIT = {
    stock_id: '2330', system: 'TSE', update_time: DATE,
    margin_unit: 118_000, short_unit: 60_000,
    margin_loan_ratio: 60, short_margin_ratio: 90,
};
export const SHORT_SOURCE = { code: '2330', short_stock_source: 54_200, datetime: DATE };
export const PUNISH_CODES: string[] = ['2222', '6666']; // 2330 not punished

// ── sector heatmap (stock index + sector snapshots) ────────────────────────

export interface StockMeta { code: string; name: string; category: string; exchange: string; }

const SECTOR_LABELS: Record<string, string> = {
    '24': '半導體', '28': '金融保險', '14': '電子零組件', '25': '電腦週邊',
    '27': '通信網路', '02': '食品', '15': '鋼鐵', '21': '化學',
    '17': '建材營造', '12': '塑膠', '23': '光電', '20': '其他電子',
};
export function sectorLabel(cat: string): string {
    return SECTOR_LABELS[cat] ?? `類股${cat}`;
}

// one synthetic TWSE-style industry index per category
export const SECTOR_INDICES = Object.entries(SECTOR_LABELS).map(([category, label], i) => ({
    index: `IX${category}`, category, label, seq: i,
}));

const STOCK_NAMES: Record<string, string[]> = {
    '24': ['台積電', '聯電', '聯發科', '日月光投控', '世界先進', '南亞科', '力積電', '瑞昱'],
    '28': ['富邦金', '國泰金', '中信金', '兆豐金', '玉山金', '元大金', '第一金', '合庫金'],
    '14': ['國巨', '華新科', '台達電', '光寶科', '欣興', '臻鼎-KY', '健鼎', '楠梓電'],
    '25': ['廣達', '英業達', '緯創', '仁寶', '技嘉', '微星', '華碩', '宏碁'],
    '27': ['中華電', '台灣大', '遠傳', '亞太電', '智易', '中磊', '正文', '友訊'],
    '02': ['統一', '味全', '大成', '卜蜂', '聯華', '佳格', '泰山', '黑松'],
};
export function stockIndex(): StockMeta[] {
    const out: StockMeta[] = [];
    let code = 1100;
    for (const [category, names] of Object.entries(STOCK_NAMES)) {
        for (const name of names) {
            out.push({ code: String(code++), name, category, exchange: 'TSE' });
        }
    }
    return out;
}
export function categoriesOf(index: StockMeta[]): { category: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const s of index) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
    return [...counts].map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);
}

function snap(code: string, close: number, chgPct: number, amount: number): Snapshot {
    const change_price = Number((close * chgPct / 100).toFixed(2));
    return {
        code, exchange: 'TSE', datetime: `${DATE_DASH} 13:30:00`,
        open: close - change_price, high: close + 4, low: close - 6, close,
        average_price: close, buy_price: close, buy_volume: 1, sell_price: close + 1,
        sell_volume: 1, volume: 1, total_volume: Math.round(amount / close / 1000),
        amount, total_amount: amount, change_price, change_rate: chgPct,
        change_type: chgPct >= 0 ? '2' : '4', tick_type: '1', volume_ratio: 1.2,
        yesterday_volume: 1,
    };
}
// snapshots for the sector-overview indices (varied up/down for a textured map)
export function sectorSnapshots(): Snapshot[] {
    return SECTOR_INDICES.map((s, i) => {
        const pct = (det(i * 3 + 1) - 0.45) * 7; // -3.1%..+3.85%
        return snap(s.index, 9000 + Math.round(det(i) * 8000),
            Number(pct.toFixed(2)), 8e9 + det(i) * 4e10);
    });
}
export function memberSnapshots(codes: string[]): Snapshot[] {
    return codes.map((code, i) => {
        const pct = (det(Number(code) + i) - 0.45) * 8;
        return snap(code, 40 + Math.round(det(Number(code)) * 900),
            Number(pct.toFixed(2)), 2e8 + det(Number(code)) * 9e9);
    });
}

// ── option contracts + positions (opt-payoff) ──────────────────────────────

const OPT_CONTRACTS: Record<string, ContractInfo> = {
    TXO22800C6: { ...TXF, code: 'TXO22800C6', security_type: 'OPT', name: '臺指選 22800 買權',
        strike_price: 22800, option_right: 'Call', multiplier: 50, delivery_month: '202606' },
    TXO23400C6: { ...TXF, code: 'TXO23400C6', security_type: 'OPT', name: '臺指選 23400 買權',
        strike_price: 23400, option_right: 'Call', multiplier: 50, delivery_month: '202606' },
    TXO22600P6: { ...TXF, code: 'TXO22600P6', security_type: 'OPT', name: '臺指選 22600 賣權',
        strike_price: 22600, option_right: 'Put', multiplier: 50, delivery_month: '202606' },
};
export async function ensureContractMock(code: string): Promise<ContractInfo> {
    const c = OPT_CONTRACTS[code];
    if (c) return c;
    if (code === '2330') return TSMC;
    if (code.startsWith('TMF')) return TMF;
    if (code.startsWith('MXF')) return MXF;
    return TXF;
}
// a long call-spread + a protective put — a recognisable payoff shape
export const OPT_POSITIONS: Position[] = [
    { id: 1, code: 'TXO22800C6', direction: 'Buy', quantity: 2, price: 410, last_price: 470, pnl: 6000 },
    { id: 2, code: 'TXO23400C6', direction: 'Sell', quantity: 2, price: 165, last_price: 120, pnl: 4500 },
    { id: 3, code: 'TXO22600P6', direction: 'Buy', quantity: 1, price: 120, last_price: 95, pnl: -2500 },
];
