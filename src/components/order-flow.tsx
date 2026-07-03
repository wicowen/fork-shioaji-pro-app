// src/components/order-flow.tsx — 盤口力道: aggressive order-flow panel.
// Combines two quantifications of real (not resting) buy/sell pressure:
//   1. 滾動主動力道 — net aggressive volume + realized point move over a
//      trailing window (5/10/30s).
//   2. 大單衝擊 — big-lot bursts and the points they pushed price (the
//      "200 口推幾點" question).
// All driven by per-trade tick_type via onAnyTick. See lib/order-flow.ts.

import { useEffect, useRef, useState } from 'react';
import { fetchHistoryTicks } from '../lib/shioaji';
import { onAnyTick } from '../lib/stream';
import { OrderFlowEngine, type ImpactEvent } from '../lib/order-flow';
import type { ContractBase } from '../lib/types/contract';
import type { SseTick } from '../lib/types/market';
import { fmtInt, fmtPrice, fmtSigned } from '../lib/utils/format';
import { dateStrOffset } from '../lib/utils/kbars';
import * as panel from './panel.css';
import * as styles from './order-flow.css';

const WINDOWS = [5, 10, 30] as const;
const BURST_GAP_MS = 400; // same-direction prints within this gap = one burst
const DEFAULT_THRESHOLD = 100; // big-lot floor (口); user-adjustable
const REFRESH_MS = 250;

function dirOf(n: number): 'up' | 'down' | 'flat' {
    return n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
}

function EventRow({ ev }: { ev: ImpactEvent }) {
    const dir = ev.side === 1 ? 'up' : 'down';
    return (
        <div className={styles.eventRow}>
            <span className={styles.sideChip[dir]}>
                {ev.side === 1 ? '主買' : '主賣'}
            </span>
            <span className={styles.eventMid}>
                <span className={styles.eventVol}>{fmtInt(ev.volume)} 口</span>
                <span>
                    {fmtPrice(ev.startPrice)}→{fmtPrice(ev.endPrice)}
                </span>
                <span className={styles.eventPer}>
                    {fmtSigned(ev.perHundred)}/百口
                </span>
            </span>
            <span
                className={`${styles.eventPoints} ${panel.dirText[dirOf(ev.points)]}`}
            >
                {fmtSigned(ev.points)} 點
            </span>
        </div>
    );
}

export function OrderFlow({ contract }: { contract: ContractBase }) {
    const engineRef = useRef<OrderFlowEngine | null>(null);

    const [windowSec, setWindowSec] = useState<(typeof WINDOWS)[number]>(10);
    const [threshText, setThreshText] = useState(String(DEFAULT_THRESHOLD));
    const threshold = Math.max(1, Math.round(Number(threshText)) || DEFAULT_THRESHOLD);
    const thresholdRef = useRef(threshold);
    thresholdRef.current = threshold;

    const [, setVersion] = useState(0);
    const [loading, setLoading] = useState(true);

    // push threshold changes into the live engine without rebuilding it
    useEffect(() => {
        engineRef.current?.setThreshold(threshold);
    }, [threshold]);

    // engine lifecycle: seed CVD from history, then stream live trades
    useEffect(() => {
        const engine = new OrderFlowEngine({
            bigLotThreshold: thresholdRef.current,
            burstGapMs: BURST_GAP_MS,
        });
        engineRef.current = engine;
        setLoading(true);
        setVersion((v) => v + 1);

        let cancelled = false;
        let seeded = false;
        const pending: SseTick[] = [];

        const off = onAnyTick((tick) => {
            if (tick.code !== contract.code) return;
            if (!seeded) {
                pending.push(tick);
                return;
            }
            engine.ingest(
                Date.now(),
                Number(tick.close),
                tick.volume,
                tick.tick_type,
            );
        });

        const load = async () => {
            const isFop =
                contract.security_type === 'FUT' ||
                contract.security_type === 'OPT';
            // futures night-session ticks file under the next trading date
            const dates = isFop
                ? [dateStrOffset(-1), dateStrOffset(0)]
                : [dateStrOffset(0)];
            for (const d of dates) {
                try {
                    const h = await fetchHistoryTicks(contract, d);
                    if (h.datetime.length > 0) {
                        for (let i = 0; i < h.close.length; i++) {
                            engine.seed(
                                h.close[i] ?? 0,
                                h.volume[i] ?? 0,
                                h.tick_type[i] ?? 0,
                            );
                        }
                        break;
                    }
                } catch {
                    // try next date
                }
            }
            if (cancelled) return;
            seeded = true;
            const now = Date.now();
            for (const t of pending) {
                engine.ingest(now, Number(t.close), t.volume, t.tick_type);
            }
            pending.length = 0;
            setLoading(false);
            setVersion((v) => v + 1);
        };
        void load();

        // close stale bursts on a quiet gap + drive the display refresh
        const timer = setInterval(() => {
            engine.flush(Date.now());
            setVersion((v) => v + 1);
        }, REFRESH_MS);

        return () => {
            cancelled = true;
            off();
            clearInterval(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contract.code]);

    const engine = engineRef.current;
    const rolling = engine?.getRolling(Date.now(), windowSec * 1000);
    const events = engine?.getEvents() ?? [];
    const buyPct = (rolling?.buyRatio ?? 0.5) * 100;
    const net = rolling?.net ?? 0;
    const move = rolling?.priceChange ?? 0;

    return (
        <div className={styles.wrap}>
            {/* 1. rolling aggressive pressure */}
            <div className={styles.section}>
                <div className={styles.sectionHead}>
                    <span>滾動主動力道</span>
                    <span className={styles.headSpacer} />
                    <div className={styles.winBtns}>
                        {WINDOWS.map((s) => (
                            <button
                                key={s}
                                className={
                                    styles.winBtn[
                                        windowSec === s ? 'on' : 'off'
                                    ]
                                }
                                onClick={() => setWindowSec(s)}
                            >
                                {s}s
                            </button>
                        ))}
                    </div>
                </div>
                <div className={styles.meterBody}>
                    <div className={styles.forceRow}>
                        <span className={panel.dirText.up}>
                            主動買 {buyPct.toFixed(0)}%
                        </span>
                        <span className={styles.forceLabel}>
                            近 {windowSec}s
                        </span>
                        <span className={panel.dirText.down}>
                            主動賣 {(100 - buyPct).toFixed(0)}%
                        </span>
                    </div>
                    <div className={styles.pressureTrack}>
                        <div
                            className={styles.pressureBuy}
                            style={{ width: `${buyPct}%` }}
                        />
                        <div className={styles.pressureMid} />
                    </div>
                    <div className={styles.statsRow}>
                        <div className={styles.stat}>
                            <span className={styles.statLabel}>淨主動量</span>
                            <span
                                className={`${styles.statValue} ${panel.dirText[dirOf(net)]}`}
                            >
                                {fmtSigned(net, 0)} 口
                            </span>
                        </div>
                        <div className={styles.stat}>
                            <span className={styles.statLabel}>推動點數</span>
                            <span
                                className={`${styles.statValue} ${panel.dirText[dirOf(move)]}`}
                            >
                                {fmtSigned(move)} 點
                            </span>
                        </div>
                        <div className={styles.stat}>
                            <span className={styles.statLabel}>主動量 買/賣</span>
                            <span className={styles.statValue}>
                                {fmtInt(rolling?.buyVol ?? 0)}/
                                {fmtInt(rolling?.sellVol ?? 0)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. big-lot market impact */}
            <div className={`${styles.section} ${styles.eventsSection}`}>
                <div className={styles.sectionHead}>
                    <span>大單衝擊</span>
                    <span className={styles.headSpacer} />
                    <span className={styles.forceLabel}>門檻 ≥</span>
                    <input
                        className={styles.threshInput}
                        inputMode='numeric'
                        value={threshText}
                        onChange={(e) => setThreshText(e.target.value)}
                        title='達到此口數的主動成交才列為大單'
                    />
                    <span className={styles.forceLabel}>口</span>
                </div>
                {events.length === 0 ? (
                    <div className={styles.empty}>
                        {loading
                            ? '載入中…'
                            : '尚無達標大單（可調低門檻）'}
                    </div>
                ) : (
                    <div className={styles.eventList}>
                        {events.map((ev) => (
                            <EventRow key={ev.id} ev={ev} />
                        ))}
                    </div>
                )}
                <div className={styles.hint}>
                    主動成交聚合（同向 ≤{BURST_GAP_MS}ms 視為同一波），量化大單瞬間推動的點數
                </div>
            </div>
        </div>
    );
}
