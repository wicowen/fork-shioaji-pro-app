// src/components/scanner-panel.tsx — market movers leaderboard

import { useEffect, useState } from 'react';
import { fetchScanner } from '../lib/shioaji';
import type { ScannerItem, ScannerType } from '../lib/types/market';
import { fmtInt, fmtPct, fmtPrice } from '../lib/utils/format';
import * as panel from './panel.css';
import * as styles from './scanner-panel.css';

// NOTE: the server's `ascending` flag is inverted (sinotrade/shioaji#207):
// true → largest first. Encode the working values per mode here.
const MODES: { key: string; type: ScannerType; label: string; ascending: boolean }[] = [
    { key: 'gain', type: 'ChangePercentRank', label: '漲幅', ascending: true },
    { key: 'loss', type: 'ChangePercentRank', label: '跌幅', ascending: false },
    { key: 'vol', type: 'VolumeRank', label: '量', ascending: true },
    { key: 'amt', type: 'AmountRank', label: '額', ascending: true },
    { key: 'multi', type: 'ChangePercentRank', label: '複選', ascending: true },
];

// 複選 (issue #2): union three deep ranks, then intersect by thresholds —
// the top names are often untradeable, crossing conditions finds the rest
async function fetchMulti(
    minPct: number,
    minVolK: number,
    minAmtB: number,
): Promise<ScannerItem[]> {
    const [pct, vol, amt] = await Promise.allSettled([
        fetchScanner('ChangePercentRank', 100, true),
        fetchScanner('VolumeRank', 100, true),
        fetchScanner('AmountRank', 100, true),
    ]);
    const byCode = new Map<string, ScannerItem>();
    for (const r of [pct, vol, amt]) {
        if (r.status !== 'fulfilled') continue;
        for (const it of r.value) {
            if (!byCode.has(it.code)) byCode.set(it.code, it);
        }
    }
    const out = [...byCode.values()].filter((it) => {
        const ref = it.close - it.change_price;
        const pctV = it.change_price && ref > 0 ? (it.change_price / ref) * 100 : 0;
        return (
            pctV >= minPct &&
            it.total_volume >= minVolK * 1000 &&
            it.total_amount >= minAmtB * 1e8
        );
    });
    out.sort((a, b) => {
        const refA = a.close - a.change_price;
        const refB = b.close - b.change_price;
        const pa = refA > 0 ? a.change_price / refA : 0;
        const pb = refB > 0 ? b.change_price / refB : 0;
        return pb - pa;
    });
    return out.slice(0, 30);
}

const MODE_KEY = 'sj-pro-scanner-mode';
const REFRESH_MS = 15000;

// 額 in 億 for readability
function fmtAmount(amount: number): string {
    if (!Number.isFinite(amount) || amount <= 0) return '';
    return `${(amount / 1e8).toFixed(1)}億`;
}

export function ScannerPanel({
    onPick,
}: {
    onPick: (code: string) => void;
}) {
    const [modeKey, setModeKey] = useState(
        () => localStorage.getItem(MODE_KEY) ?? 'gain',
    );
    const [items, setItems] = useState<ScannerItem[]>([]);
    const [error, setError] = useState(false);
    const [reloadSeq, setReloadSeq] = useState(0);
    const [picked, setPicked] = useState<string | null>(null);
    // 複選 thresholds (persisted)
    const [minPct, setMinPct] = useState(
        () => Number(localStorage.getItem('sj-scan-minpct')) || 2,
    );
    const [minVolK, setMinVolK] = useState(
        () => Number(localStorage.getItem('sj-scan-minvol')) || 5,
    );
    const [minAmtB, setMinAmtB] = useState(
        () => Number(localStorage.getItem('sj-scan-minamt')) || 1,
    );
    const mode = MODES.find((m) => m.key === modeKey) ?? MODES[0]!;

    useEffect(() => {
        let cancelled = false;
        setError(false);
        const load = () =>
            (mode.key === 'multi'
                ? fetchMulti(minPct, minVolK, minAmtB)
                : fetchScanner(mode.type, 20, mode.ascending)
            )
                .then((d) => {
                    if (cancelled) return;
                    setItems(d);
                    setError(false);
                })
                .catch(() => !cancelled && setError(true));
        load();
        const t = setInterval(load, REFRESH_MS);
        return () => {
            cancelled = true;
            clearInterval(t);
        };
    }, [mode, reloadSeq, minPct, minVolK, minAmtB]);

    return (
        <>
            <div className={styles.switcher}>
                {MODES.map((m) => (
                    <button
                        key={m.key}
                        className={styles.sw[modeKey === m.key ? 'on' : 'off']}
                        onClick={() => {
                            setModeKey(m.key);
                            localStorage.setItem(MODE_KEY, m.key);
                        }}
                    >
                        {m.label}
                    </button>
                ))}
            </div>
            {mode.key === 'multi' && (
                <div className={styles.filterRow}>
                    {(
                        [
                            ['漲幅≥%', minPct, setMinPct, 'sj-scan-minpct'],
                            ['量≥千張', minVolK, setMinVolK, 'sj-scan-minvol'],
                            ['額≥億', minAmtB, setMinAmtB, 'sj-scan-minamt'],
                        ] as [string, number, (v: number) => void, string][]
                    ).map(([label, value, set, key]) => (
                        <label key={key} className={styles.filterItem}>
                            {label}
                            <input
                                className={styles.filterInput}
                                value={value}
                                inputMode='decimal'
                                onChange={(e) => {
                                    const v = Number(e.target.value);
                                    if (Number.isFinite(v) && v >= 0) {
                                        set(v);
                                        localStorage.setItem(key, String(v));
                                    }
                                }}
                            />
                        </label>
                    ))}
                </div>
            )}
            <div className={panel.panelBody}>
                {error && (
                    <div className={styles.errorBox}>
                        <span className={styles.scName}>排行資料無法取得</span>
                        <button
                            className={styles.retryBtn}
                            onClick={() => setReloadSeq((s) => s + 1)}
                        >
                            重試
                        </button>
                    </div>
                )}
                {items.map((it, i) => {
                    const dir =
                        it.change_price > 0
                            ? 'up'
                            : it.change_price < 0
                              ? 'down'
                              : 'flat';
                    // reference = close - change; guard zero/flat prices
                    const ref = it.close - it.change_price;
                    const pct =
                        it.change_price && ref > 0
                            ? (it.change_price / ref) * 100
                            : 0;
                    const sub =
                        mode.key === 'amt'
                            ? fmtAmount(it.total_amount)
                            : it.total_volume > 0
                              ? fmtInt(it.total_volume)
                              : '';
                    return (
                        <div
                            key={it.code}
                            className={`${styles.row} ${
                                picked === it.code ? styles.rowPicked : ''
                            }`}
                            onClick={() => {
                                setPicked(it.code);
                                onPick(it.code);
                            }}
                        >
                            <span className={styles.rank}>
                                {String(i + 1).padStart(2, '0')}
                            </span>
                            <span className={styles.idBlock}>
                                <span className={styles.scCode}>
                                    {it.code}
                                </span>
                                <span className={styles.scName}>
                                    {it.name}
                                </span>
                            </span>
                            <span className={styles.valueBlock}>
                                <span
                                    className={`${styles.scValue} ${panel.dirText[dir]}`}
                                >
                                    {fmtPrice(it.close)} {fmtPct(pct)}
                                </span>
                                <span className={styles.scSub}>{sub}</span>
                            </span>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
