// src/components/sector-heatmap.tsx — 類股熱力圖 (issue #2): pick a
// sector from the contract files' categories, tiles colored by today's
// percent change (intensity scales with magnitude), sized order by 成交額.
// Click a tile to link the symbol everywhere.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePoll } from '../hooks/use-poll';
import { fetchSnapshots } from '../lib/shioaji';
import {
    categoriesOf,
    loadStockIndex,
    type StockMeta,
} from '../lib/stock-index';
import { getChartColors, useThemeSettings } from '../lib/theme-store';
import type { Snapshot } from '../lib/types/market';
import { fmtPrice } from '../lib/utils/format';
import * as dock from './bottom-dock.css';
import * as styles from './sector-heatmap.css';

const MAX_MEMBERS = 80;
const CAT_KEY = 'sj-pro-heatmap-cat';

// category code → readable label (common TWSE category codes)
const CAT_LABELS: Record<string, string> = {
    '24': '半導體',
    '25': '電腦週邊',
    '26': '光電',
    '27': '通信網路',
    '28': '電子零組件',
    '29': '電子通路',
    '30': '資訊服務',
    '31': '其他電子',
    '01': '水泥',
    '02': '食品',
    '03': '塑膠',
    '04': '紡織',
    '05': '電機',
    '06': '電器電纜',
    '08': '玻璃陶瓷',
    '09': '造紙',
    '10': '鋼鐵',
    '11': '橡膠',
    '12': '汽車',
    '14': '建材營造',
    '15': '航運',
    '16': '觀光',
    '17': '金融保險',
    '18': '貿易百貨',
    '20': '其他',
    '21': '化學',
    '22': '生技醫療',
    '23': '油電燃氣',
};

function catLabel(cat: string): string {
    return CAT_LABELS[cat] ?? cat;
}

export function SectorHeatmap({
    onPick,
}: {
    onPick?: (code: string) => void;
}) {
    const [index, setIndex] = useState<StockMeta[] | null>(null);
    const [cat, setCat] = useState(
        () => localStorage.getItem(CAT_KEY) ?? '24',
    );
    const theme = useThemeSettings();
    const colors = getChartColors(theme);

    useEffect(() => {
        loadStockIndex().then(setIndex).catch(() => undefined);
    }, []);

    const categories = useMemo(
        () => (index ? categoriesOf(index).filter((c) => c.count >= 5) : []),
        [index],
    );
    const members = useMemo(
        () =>
            (index ?? [])
                .filter((s) => s.category === cat && s.code.length === 4)
                .slice(0, MAX_MEMBERS),
        [index, cat],
    );

    const snapsPoll = usePoll<Snapshot[]>(
        useCallback(() => {
            if (members.length === 0) return Promise.resolve([]);
            return fetchSnapshots(
                members.map((m) => ({
                    security_type: 'STK' as const,
                    exchange: (m.exchange || 'TSE') as 'TSE',
                    code: m.code,
                    target_code: null,
                })),
            ).catch(() => []);
        }, [members]),
        20000,
    );

    const tiles = useMemo(() => {
        const byCode = new Map(
            (snapsPoll.data ?? []).map((s) => [s.code, s]),
        );
        return members
            .map((m) => {
                const s = byCode.get(m.code);
                const ref = s ? s.close - s.change_price : 0;
                const pct =
                    s && s.change_price && ref > 0
                        ? (s.change_price / ref) * 100
                        : 0;
                return {
                    code: m.code,
                    name: m.name,
                    close: s?.close ?? 0,
                    amount: s?.total_amount ?? 0,
                    pct,
                };
            })
            .sort((a, b) => b.amount - a.amount);
    }, [members, snapsPoll.data]);

    // color intensity: ±5% saturates
    const tileColor = (pct: number): string => {
        const base = pct >= 0 ? colors.up : colors.down;
        const alpha = Math.min(1, Math.abs(pct) / 5) * 0.75 + 0.08;
        // base is '#rrggbb' — build rgba
        const r = parseInt(base.slice(1, 3), 16);
        const g = parseInt(base.slice(3, 5), 16);
        const b = parseInt(base.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
    };

    if (!index) {
        return <div className={dock.emptyState}>載入商品分類…</div>;
    }

    return (
        <div className={styles.wrap}>
            <div className={styles.toolbar}>
                <select
                    className={styles.catSelect}
                    value={cat}
                    onChange={(e) => {
                        setCat(e.target.value);
                        localStorage.setItem(CAT_KEY, e.target.value);
                    }}
                >
                    {categories.map((c) => (
                        <option key={c.category} value={c.category}>
                            {catLabel(c.category)}（{c.count}）
                        </option>
                    ))}
                </select>
                <span className={styles.hint}>依成交額排序 · 色深=漲跌幅</span>
            </div>
            <div className={styles.gridBox}>
                {tiles.map((t) => (
                    <button
                        key={t.code}
                        className={styles.tile}
                        style={{ background: tileColor(t.pct) }}
                        title={`${t.name} ${fmtPrice(t.close)}（${t.pct >= 0 ? '+' : ''}${t.pct.toFixed(2)}%）`}
                        onClick={() => onPick?.(t.code)}
                    >
                        <span className={styles.tileCode}>{t.code}</span>
                        <span className={styles.tileName}>{t.name}</span>
                        <span className={styles.tilePct}>
                            {t.pct >= 0 ? '+' : ''}
                            {t.pct.toFixed(1)}%
                        </span>
                    </button>
                ))}
                {tiles.length === 0 && (
                    <div className={dock.emptyState}>此類股無資料</div>
                )}
            </div>
        </div>
    );
}
