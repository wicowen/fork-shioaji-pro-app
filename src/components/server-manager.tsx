// src/components/server-manager.tsx — desktop-only shioaji server控制台:
// status, start/stop/restart, API-key settings, simulation/production mode.

import { useCallback, useEffect, useState } from 'react';
import { usePoll } from '../hooks/use-poll';
import { useStreamStatus } from '../hooks/use-stream';
import { fetchHealth } from '../lib/shioaji';
import {
    isTauri,
    loadDesktopSettings,
    pickCaFile,
    saveDesktopSettings,
    serverStart,
    serverStatus,
    serverStop,
    checkForUpdates,
    type DesktopSettings,
    type ServerStatus,
} from '../lib/tauri';
import { notify } from '../lib/trade';
import type { Health } from '../lib/types/health';
import * as styles from './hud-header.css';

export function ServerManager({
    open,
    onToggle,
}: {
    open: boolean;
    onToggle: (open: boolean) => void;
}) {
    const [settings, setSettings] = useState<DesktopSettings>({
        apiKey: '',
        secretKey: '',
        production: false,
        autoStart: true,
        caPath: '',
        caPasswd: '',
    });
    const [busy, setBusy] = useState(false);
    const [lastOutput, setLastOutput] = useState('');

    const stream = useStreamStatus();
    const { data: status, refresh } = usePoll<ServerStatus | null>(
        useCallback(() => serverStatus(), []),
        8000,
    );
    const { data: health } = usePoll<Health | null>(
        useCallback(() => fetchHealth().catch(() => null), []),
        15000,
    );

    useEffect(() => {
        loadDesktopSettings().then(setSettings);
    }, []);

    const persist = (next: Partial<DesktopSettings>) => {
        const merged = { ...settings, ...next };
        setSettings(merged);
        void saveDesktopSettings(merged);
    };

    // after a (re)start the upstream subscriptions are gone — reload the UI
    // once the server reports healthy so every panel bootstraps cleanly
    // (issue #2: charts/watchlist froze after restart until manual reload)
    const reloadWhenHealthy = () => {
        const deadline = Date.now() + 90_000;
        const t = setInterval(async () => {
            if (Date.now() > deadline) {
                clearInterval(t);
                return;
            }
            try {
                await fetchHealth();
                clearInterval(t);
                window.location.reload();
            } catch {
                // not up yet
            }
        }, 2000);
    };

    const doStart = async () => {
        if (!settings.apiKey || !settings.secretKey) {
            notify({
                kind: 'err',
                title: '缺少 API 金鑰',
                body: '請先填入 SJ_API_KEY / SJ_SEC_KEY 並儲存',
            });
            return;
        }
        if (settings.production && !settings.caPath) {
            notify({
                kind: 'err',
                title: '缺少憑證',
                body: '正式環境下單需要 Sinopac.pfx 憑證，請先選擇憑證檔',
            });
            return;
        }
        setBusy(true);
        try {
            const res = await serverStart(settings);
            setLastOutput(res.output.slice(0, 400));
            notify({
                kind: res.ok ? 'ok' : 'err',
                title: res.ok
                    ? res.attached
                        ? '🔗 已連接既有伺服器'
                        : '🟢 伺服器啟動指令已送出'
                    : '伺服器啟動失敗',
                body: res.ok
                    ? `port ${res.port} · 模式：${settings.production ? '⚠ 正式環境' : '模擬環境'}`
                    : res.output.slice(0, 120),
            });
            if (res.ok) {
                // reload once healthy (or immediately when the port moved)
                if (res.portChanged) {
                    setTimeout(() => window.location.reload(), 1800);
                } else if (!res.attached) {
                    reloadWhenHealthy();
                }
            }
        } finally {
            setBusy(false);
            setTimeout(refresh, 1500);
        }
    };

    const doStop = async () => {
        setBusy(true);
        try {
            const res = await serverStop();
            setLastOutput(res.output.slice(0, 400));
            notify({
                kind: res.ok ? 'ok' : 'err',
                title: res.ok ? '🔴 伺服器已停止' : '停止失敗',
                body: res.ok ? '' : res.output.slice(0, 120),
            });
        } finally {
            setBusy(false);
            setTimeout(refresh, 1000);
        }
    };

    const doRestart = async () => {
        setBusy(true);
        try {
            await serverStop();
            await new Promise((r) => setTimeout(r, 1200));
            await doStart();
        } finally {
            setBusy(false);
        }
    };

    if (!isTauri) return null;

    const running = status?.running && status.healthy;
    // explicit lifecycle so starting/connecting never looks stuck:
    // busy → 啟動中 (amber breathing); running but stream not live yet →
    // 連線中 (amber breathing); healthy + live → steady green; else red
    const phase: 'starting' | 'connecting' | 'ok' | 'down' = busy
        ? 'starting'
        : running && stream === 'live'
          ? 'ok'
          : status?.running || stream === 'connecting'
            ? 'connecting'
            : 'down';
    const phaseLabel =
        phase === 'starting'
            ? '啟動中…'
            : phase === 'connecting'
              ? '連線中…'
              : '伺服器';

    return (
        <div className={styles.settingsWrap}>
            <button
                className={styles.resetBtn}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                }}
                onClick={() => onToggle(!open)}
            >
                {phase === 'starting' || phase === 'connecting' ? (
                    <span className={styles.spinner} />
                ) : (
                    <span
                        className={styles.led[phase === 'ok' ? 'live' : 'down']}
                    />
                )}
                {phaseLabel}
            </button>
            {open && (
                <>
                    <div
                        className={styles.popoverBackdrop}
                        onClick={() => onToggle(false)}
                    />
                    <div className={styles.popover} style={{ width: '19rem' }}>
                        <span className={styles.settingLabel}>
                            Shioaji Server 狀態
                        </span>
                        <span className={styles.emptyHint}>
                            {phase === 'starting' &&
                                '⏳ 啟動中 — 登入與載入合約約需 10–30 秒…'}
                            {phase === 'connecting' &&
                                status?.running &&
                                '🔄 已啟動，等待行情連線…'}
                            {(phase === 'ok' ||
                                (status?.running && phase !== 'starting')) && (
                                <>
                                    {phase === 'connecting' && <br />}
                                    {`運行中 · PID ${status?.pid} · :${status?.port} · ${
                                        status?.simulation
                                            ? '模擬環境'
                                            : '⚠ 正式環境'
                                    } · ${status?.healthy ? '健康' : '不健康'}`}
                                </>
                            )}
                            {!status?.running && phase !== 'starting' && '未運行'}
                        </span>
                        {(phase === 'starting' ||
                            (phase === 'connecting' && status?.running)) && (
                            <span className={styles.progressTrack}>
                                <span className={styles.progressGlider} />
                            </span>
                        )}
                        {status?.running &&
                            status.simulation === settings.production && (
                                <span
                                    className={styles.emptyHint}
                                    style={{
                                        color: 'var(--danger, #f23645)',
                                    }}
                                >
                                    ⚠ 伺服器目前為
                                    {status.simulation ? '模擬' : '正式'}
                                    環境，與設定（
                                    {settings.production ? '正式' : '模擬'}
                                    ）不符 — 按「重啟」套用
                                </span>
                            )}
                        {status?.running && status.healthy === false && (
                            <span
                                className={styles.emptyHint}
                                style={{ color: 'var(--danger, #f23645)' }}
                            >
                                ⚠ 伺服器不健康：正式環境需要憑證與已簽署的
                                API 金鑰；或切回模擬後按「重啟」
                            </span>
                        )}
                        {health && (
                            <span className={styles.emptyHint}>
                                token 剩餘{' '}
                                {Math.round(
                                    health.token_expires_in_seconds / 3600,
                                )}
                                h · 合約 {health.contract_count}
                            </span>
                        )}
                        <div className={styles.settingGroup}>
                            <button
                                className={styles.opt.off}
                                disabled={busy}
                                onClick={doStart}
                            >
                                啟動
                            </button>
                            <button
                                className={styles.opt.off}
                                disabled={busy}
                                onClick={doRestart}
                            >
                                重啟
                            </button>
                            <button
                                className={styles.opt.off}
                                disabled={busy}
                                onClick={doStop}
                            >
                                停止
                            </button>
                        </div>

                        <span className={styles.settingLabel}>
                            API 金鑰（儲存在本機 App 資料夾）
                        </span>
                        <input
                            className={styles.saveInput}
                            type='password'
                            placeholder='SJ_API_KEY'
                            value={settings.apiKey}
                            onChange={(e) =>
                                persist({ apiKey: e.target.value })
                            }
                        />
                        <input
                            className={styles.saveInput}
                            type='password'
                            placeholder='SJ_SEC_KEY'
                            value={settings.secretKey}
                            onChange={(e) =>
                                persist({ secretKey: e.target.value })
                            }
                        />

                        <span className={styles.settingLabel}>環境</span>
                        <div className={styles.settingGroup}>
                            <button
                                className={
                                    styles.opt[
                                        settings.production ? 'off' : 'on'
                                    ]
                                }
                                onClick={() =>
                                    persist({ production: false })
                                }
                            >
                                模擬
                            </button>
                            <button
                                className={
                                    styles.opt[
                                        settings.production ? 'on' : 'off'
                                    ]
                                }
                                onClick={() => persist({ production: true })}
                            >
                                ⚠ 正式
                            </button>
                        </div>
                        {settings.production && (
                            <span
                                className={styles.emptyHint}
                                style={{ color: 'var(--danger, #f23645)' }}
                            >
                                正式環境下單動用真實資金，重啟後生效
                            </span>
                        )}

                        <span className={styles.settingLabel}>
                            憑證（正式環境下單必要，模擬不需要）
                        </span>
                        <div className={styles.saveRow}>
                            <button
                                className={styles.resetBtn}
                                style={{ flex: 1, minWidth: 0 }}
                                title={
                                    settings.caPath ||
                                    '從 API 管理頁下載的 Sinopac.pfx'
                                }
                                onClick={async () => {
                                    const path = await pickCaFile();
                                    if (path) persist({ caPath: path });
                                }}
                            >
                                {settings.caPath
                                    ? `✓ ${settings.caPath.split(/[/\\]/).pop()}`
                                    : '選擇 Sinopac.pfx…'}
                            </button>
                            {settings.caPath && (
                                <button
                                    className={styles.profileDelete}
                                    title='清除憑證設定'
                                    onClick={() =>
                                        persist({ caPath: '', caPasswd: '' })
                                    }
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                        {settings.caPath && (
                            <input
                                className={styles.saveInput}
                                type='password'
                                placeholder='憑證密碼（下載時設定）'
                                value={settings.caPasswd}
                                onChange={(e) =>
                                    persist({ caPasswd: e.target.value })
                                }
                            />
                        )}
                        {settings.production && !settings.caPath && (
                            <span
                                className={styles.emptyHint}
                                style={{ color: 'var(--danger, #f23645)' }}
                            >
                                尚未設定憑證 — 正式環境無法下單。請至
                                sinotrade.com.tw API 管理頁下載 Sinopac.pfx
                            </span>
                        )}

                        <button
                            className={
                                styles.opt[settings.autoStart ? 'on' : 'off']
                            }
                            onClick={() =>
                                persist({ autoStart: !settings.autoStart })
                            }
                        >
                            {settings.autoStart
                                ? '✓ App 啟動時自動啟動伺服器'
                                : 'App 啟動時自動啟動伺服器'}
                        </button>
                        <button
                            className={styles.updateBtn}
                            onClick={() => checkForUpdates(false)}
                        >
                            <svg
                                width='14'
                                height='14'
                                viewBox='0 0 24 24'
                                fill='none'
                                stroke='currentColor'
                                strokeWidth='2'
                                strokeLinecap='round'
                                strokeLinejoin='round'
                            >
                                <path d='M21 12a9 9 0 1 1-2.64-6.36' />
                                <polyline points='21 3 21 9 15 9' />
                            </svg>
                            檢查 App 更新
                        </button>
                        {lastOutput && (
                            <span className={styles.emptyHint}>
                                {lastOutput}
                            </span>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
