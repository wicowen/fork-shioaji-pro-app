// src/components/rollover-panel.tsx — 轉倉監控：盯近月/次月轉倉價差，達標提醒
// (notify + 警示 音效)。純監控：本面板不下單；按「建立轉倉組合單」把平近月＋
// 建次月兩腳帶到組合單面板，由使用者複核後送出 TimeSpread 組合單。

import { useEffect } from 'react';
import { useQuote } from '../hooks/use-stream';
import { setPendingRoll } from '../lib/roll-handoff';
import { resolveRollLegs, rollWatchId } from '../lib/roll-resolve';
import {
    computeRollEdge,
    getWatches,
    removeWatch,
    setWatchEnabled,
    setWatchTarget,
    upsertWatch,
    useRolloverWatches,
    type RolloverWatch,
} from '../lib/rollover-engine';
import { isFuturePosition, type Position } from '../lib/types/portfolio';
import { fmtPrice } from '../lib/utils/format';
import * as styles from './order-ticket.css';
import * as panel from './panel.css';
import * as roll from './rollover-panel.css';

function RollRow({
    watch,
    active,
    onAddCombo,
    onSelectCode,
}: {
    watch: RolloverWatch;
    active: boolean;
    onAddCombo?: () => void;
    onSelectCode?: (code: string) => void;
}) {
    const nearQ = useQuote(watch.nearCode);
    const nextQ = useQuote(watch.nextCode);
    const { edge, basis } = computeRollEdge(nearQ, nextQ, watch.posDirection);
    const hasEdge = Number.isFinite(edge);
    const reached = basis === 'book' && hasEdge && edge >= watch.targetPoints;
    const nearBA = nearQ?.bidask;
    const nextBA = nextQ?.bidask;

    const startRoll = () => {
        // 平近月（與部位反向）＋ 建次月（與部位同向）
        const closeNear = watch.posDirection === 'Sell' ? 'Buy' : 'Sell';
        const openNext = watch.posDirection === 'Sell' ? 'Sell' : 'Buy';
        onAddCombo?.();
        setPendingRoll([
            { code: watch.nearCode, action: closeNear },
            { code: watch.nextCode, action: openNext },
        ]);
    };

    return (
        <div className={roll.row}>
            <div className={roll.rowHead}>
                <button
                    className={roll.label}
                    title='連動主視窗到近月'
                    onClick={() => onSelectCode?.(watch.nearCode)}
                >
                    {watch.label}
                </button>
                {!watch.positionIsFront && (
                    <span className={roll.tag.warn}>持倉非近月</span>
                )}
                {!active && <span className={roll.tag.idle}>無部位</span>}
                <button
                    className={roll.removeBtn}
                    title='移除此監控'
                    onClick={() => removeWatch(watch.id)}
                >
                    ✕
                </button>
            </div>

            <div className={styles.costRow}>
                近 {watch.nearCode}｜買{' '}
                {fmtPrice(nearBA ? Number(nearBA.bid_price[0]) : undefined)}／賣{' '}
                {fmtPrice(nearBA ? Number(nearBA.ask_price[0]) : undefined)}
            </div>
            <div className={styles.costRow}>
                次 {watch.nextCode}｜買{' '}
                {fmtPrice(nextBA ? Number(nextBA.bid_price[0]) : undefined)}／賣{' '}
                {fmtPrice(nextBA ? Number(nextBA.ask_price[0]) : undefined)}
            </div>

            <div className={roll.edgeRow}>
                <span className={roll.edgeLabel}>轉倉價差</span>
                <span className={reached ? roll.edge.hot : roll.edge.idle}>
                    {hasEdge ? edge.toFixed(0) : '--'}
                </span>
                {basis === 'approx' && <span className={roll.approx}>近似</span>}
                {reached && <span className={roll.reached}>✓ 達標</span>}
            </div>

            <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>目標</span>
                <input
                    className={styles.numInput}
                    inputMode='numeric'
                    value={String(watch.targetPoints)}
                    onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v)) setWatchTarget(watch.id, v);
                    }}
                />
                <button
                    className={styles.seg[watch.enabled ? 'on' : 'off']}
                    title='達標時通知＋音效'
                    onClick={() => setWatchEnabled(watch.id, !watch.enabled)}
                >
                    {watch.enabled ? '提醒中' : '提醒'}
                </button>
            </div>

            <button
                className={panel.btn}
                disabled={!watch.positionIsFront}
                title={
                    watch.positionIsFront
                        ? '把平近月＋建次月兩腳帶到組合單面板複核送出'
                        : '持倉非近月，請手動於組合單面板處理'
                }
                onClick={startRoll}
            >
                建立轉倉組合單
            </button>
        </div>
    );
}

export function RolloverPanel({
    positions,
    onAddCombo,
    onSelectCode,
}: {
    positions: Position[];
    onAddCombo?: () => void;
    onSelectCode?: (code: string) => void;
}) {
    const watches = useRolloverWatches();

    const futs = positions.filter(isFuturePosition);
    const activeIds = new Set(futs.map(rollWatchId));

    // keep watches in sync with the futures positions. Re-resolving every poll
    // is cheap (ensureContract is cached) and idempotent (upsertWatch no-ops on
    // no change). No cancelled-flag guard — React StrictMode double-invokes the
    // effect (setup→cleanup→setup) and a cancelled flag would drop the upsert,
    // leaving the panel empty; a transient resolve failure simply retries.
    useEffect(() => {
        const futsNow = positions.filter(isFuturePosition);
        const wantedIds = new Set(futsNow.map(rollWatchId));
        console.debug(
            `[RolloverPanel] reconcile: ${futsNow.length} FUT pos [${futsNow.map((p) => p.code).join(', ')}]`,
        );
        // auto-clean only never-configured rows whose position is gone; a
        // configured watch (target / 提醒) survives so settings are never lost
        for (const w of getWatches()) {
            if (!wantedIds.has(w.id) && w.targetPoints === 0 && !w.enabled) {
                removeWatch(w.id);
            }
        }
        for (const pos of futsNow) {
            void resolveRollLegs(pos).then((r) => {
                if (!r) return;
                upsertWatch({
                    id: rollWatchId(pos),
                    productRoot: r.productRoot,
                    label: `${r.productRoot} ${pos.direction === 'Buy' ? '多' : '空'}${pos.quantity}`,
                    posDirection: r.posDirection,
                    posQty: r.posQty,
                    nearCode: r.nearCode,
                    nextCode: r.nextCode,
                    positionIsFront: r.positionIsFront,
                });
            });
        }
    }, [positions]);

    if (watches.length === 0) {
        return (
            <div className={roll.empty}>
                無轉倉監控。持有近月期貨部位後，這裡會自動列出近月／次月轉倉價差；設定目標點數並開啟提醒，達標時通知＋音效。
            </div>
        );
    }

    return (
        <div className={styles.body}>
            {watches.map((w) => (
                <RollRow
                    key={w.id}
                    watch={w}
                    active={activeIds.has(w.id)}
                    onAddCombo={onAddCombo}
                    onSelectCode={onSelectCode}
                />
            ))}
            <div className={roll.hint}>
                轉倉價差＝對你部位有利方向（空單：次月買價−近月賣價；多單：近月買價−次月賣價），以可成交的買賣價計算。達標僅提醒，下單請於組合單面板複核。
            </div>
        </div>
    );
}
