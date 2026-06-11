// src/lib/boot.ts — startup orchestration:
// 1. Desktop: auto-start the bundled shioaji server when keys are saved.
// 2. If the app booted while the server was unreachable, watch /health and
//    reload once it comes up so every panel bootstraps cleanly. Transient
//    outages after a healthy boot are handled by the SSE self-heal instead.

import { fetchHealth } from './shioaji';
import { isTauri } from './runtime';
import { loadDesktopSettings, serverStart, serverStatus } from './tauri';
import { notify } from './trade';

let booted = false;

export function bootstrap() {
    if (booted) return;
    booted = true;
    void run();
}

async function run() {
    if (isTauri) {
        try {
            const settings = await loadDesktopSettings();
            if (settings.autoStart && settings.apiKey && settings.secretKey) {
                const status = await serverStatus();
                if (!status?.running) {
                    notify({
                        kind: 'info',
                        title: '🚀 自動啟動 shioaji server…',
                        body: `模式：${settings.production ? '⚠ 正式環境' : '模擬環境'}`,
                    });
                    const res = await serverStart(settings);
                    if (!res.ok) {
                        notify({
                            kind: 'err',
                            title: '伺服器自動啟動失敗',
                            body: res.output.slice(0, 120),
                        });
                    }
                }
            }
        } catch {
            // sidecar unavailable — fall through to the health watchdog
        }
    }

    // bootstrap watchdog: reload once the server becomes reachable
    try {
        await fetchHealth();
        return; // server was up at boot — components loaded normally
    } catch {
        notify({
            kind: 'info',
            title: '等待 shioaji server…',
            body: '伺服器就緒後將自動載入畫面',
        });
    }
    const timer = setInterval(async () => {
        try {
            await fetchHealth();
            clearInterval(timer);
            window.location.reload();
        } catch {
            // keep waiting
        }
    }, 4000);
}
