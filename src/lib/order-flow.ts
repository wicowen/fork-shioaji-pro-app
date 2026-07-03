// src/lib/order-flow.ts — order-flow quantification for a single contract:
// cumulative volume delta (CVD), a rolling buy/sell pressure window, and
// big-lot "market impact" burst detection.
//
// All three derive from the per-trade aggressor side (tick_type):
//   1 = 主動買 (外盤, hit the ask)   2 = 主動賣 (內盤, hit the bid)   0 = 不明
// CVD/delta treat 0 as neutral. The engine is framework-free and holds no
// React state — components instantiate it in a ref and feed it trades.
// Resting-book imbalance (depth-ladder 五檔買賣力道) is a separate, passive
// signal; this engine quantifies aggressive flow that actually moves price.

export interface CvdPoint {
    i: number; // sample index — session progression along the x-axis
    cvd: number;
}

export interface ImpactEvent {
    id: number;
    side: 1 | 2; // burst aggressor direction
    volume: number; // total aggressive lots swept in the burst
    startPrice: number; // last trade price just before the burst hit
    endPrice: number; // last trade price of the burst
    points: number; // signed displacement (endPrice - startPrice)
    perHundred: number; // points moved per 100 lots — the "深度" of the move
}

export interface RollingPressure {
    buyVol: number;
    sellVol: number;
    net: number; // buyVol - sellVol
    buyRatio: number; // 0..1 (0.5 when no aggressive volume in window)
    priceChange: number; // last - first price inside the window, in points
    windowMs: number;
}

interface WinTick {
    t: number; // arrival time (ms)
    price: number;
    vol: number;
    side: number; // 1 | 2 | 0
}

interface Burst {
    side: 1 | 2;
    volume: number;
    startPrice: number;
    endPrice: number;
    lastT: number;
}

const CVD_MAX_POINTS = 600; // downsampled series cap for cheap canvas redraws
const WIN_KEEP_MS = 60_000; // rolling buffer retention (max selectable window 30s)
const EVENTS_MAX = 60; // most-recent impact events retained

export interface OrderFlowOptions {
    bigLotThreshold: number; // min burst lots to log an impact event
    burstGapMs: number; // same-direction prints within this gap = one burst
}

export class OrderFlowEngine {
    private cvd = 0;
    private count = 0; // ticks ingested — drives the downsample stride
    private stride = 1;
    private series: CvdPoint[] = [];
    private win: WinTick[] = [];
    private burst: Burst | null = null;
    private lastPrice: number | null = null;
    private events: ImpactEvent[] = [];
    private eventSeq = 0;
    private threshold: number;
    private gapMs: number;

    constructor(opts: OrderFlowOptions) {
        this.threshold = opts.bigLotThreshold;
        this.gapMs = opts.burstGapMs;
    }

    private static deltaOf(side: number, vol: number): number {
        if (side === 1) return vol;
        if (side === 2) return -vol;
        return 0;
    }

    // collapse the series when it grows past the cap: keep every other point
    // and double the stride so older history thins out evenly.
    private pushCvd() {
        if (this.count % this.stride !== 0) return;
        this.series.push({ i: this.count, cvd: this.cvd });
        if (this.series.length > CVD_MAX_POINTS) {
            const next: CvdPoint[] = [];
            for (let k = 0; k < this.series.length; k += 2) {
                next.push(this.series[k]!);
            }
            this.series = next;
            this.stride *= 2;
        }
    }

    // replay a historical trade — builds CVD from session open. No rolling
    // window or impact detection (history lacks reliable arrival timing).
    seed(price: number, vol: number, side: number) {
        this.cvd += OrderFlowEngine.deltaOf(side, vol);
        this.count += 1;
        this.pushCvd();
        this.lastPrice = price;
    }

    // live trade: updates CVD, the rolling window and burst detection.
    ingest(t: number, price: number, vol: number, side: number) {
        this.cvd += OrderFlowEngine.deltaOf(side, vol);
        this.count += 1;
        this.pushCvd();

        this.win.push({ t, price, vol, side });
        const cutoff = t - WIN_KEEP_MS;
        while (this.win.length && this.win[0]!.t < cutoff) this.win.shift();

        this.updateBurst(t, price, vol, side);
        this.lastPrice = price;
    }

    private updateBurst(t: number, price: number, vol: number, side: number) {
        if (side !== 1 && side !== 2) return; // unknown: leave bursts alone
        const b = this.burst;
        if (b && (b.side !== side || t - b.lastT > this.gapMs)) {
            this.finalize();
        }
        if (!this.burst) {
            this.burst = {
                side,
                volume: vol,
                startPrice: this.lastPrice ?? price, // price before the burst
                endPrice: price,
                lastT: t,
            };
        } else {
            this.burst.volume += vol;
            this.burst.endPrice = price;
            this.burst.lastT = t;
        }
    }

    // close the active burst, logging an impact event if it cleared the
    // threshold. Safe to call repeatedly.
    private finalize() {
        const b = this.burst;
        this.burst = null;
        if (!b || b.volume < this.threshold) return;
        const points = Number((b.endPrice - b.startPrice).toFixed(2));
        this.events.unshift({
            id: ++this.eventSeq,
            side: b.side,
            volume: b.volume,
            startPrice: b.startPrice,
            endPrice: b.endPrice,
            points,
            perHundred:
                b.volume > 0
                    ? Number(((points / b.volume) * 100).toFixed(2))
                    : 0,
        });
        if (this.events.length > EVENTS_MAX) this.events.length = EVENTS_MAX;
    }

    // called on a timer so a burst still closes during a quiet gap.
    flush(now: number) {
        if (this.burst && now - this.burst.lastT > this.gapMs) {
            this.finalize();
        }
    }

    setThreshold(n: number) {
        this.threshold = n;
    }

    getCvd(): number {
        return this.cvd;
    }

    getSeries(): CvdPoint[] {
        return this.series;
    }

    getEvents(): ImpactEvent[] {
        return this.events;
    }

    // aggressive volume within the trailing window + the price move over it.
    getRolling(now: number, windowMs: number): RollingPressure {
        const from = now - windowMs;
        let buyVol = 0;
        let sellVol = 0;
        let startPrice: number | null = null;
        let lastPrice: number | null = null;
        for (const w of this.win) {
            if (w.t < from) continue;
            if (startPrice === null) startPrice = w.price;
            lastPrice = w.price;
            if (w.side === 1) buyVol += w.vol;
            else if (w.side === 2) sellVol += w.vol;
        }
        const tot = buyVol + sellVol;
        return {
            buyVol,
            sellVol,
            net: buyVol - sellVol,
            buyRatio: tot > 0 ? buyVol / tot : 0.5,
            priceChange:
                startPrice !== null && lastPrice !== null
                    ? Number((lastPrice - startPrice).toFixed(2))
                    : 0,
            windowMs,
        };
    }
}
