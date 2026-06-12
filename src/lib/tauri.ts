// src/lib/tauri.ts — desktop bridge: sidecar server management, popout
// windows, auto-updates. Every entry point is a no-op in the browser.

import { getApiPort, isTauri, setApiPort } from './runtime';
import { notify } from './trade';

export { isTauri } from './runtime';

// ---- shioaji server sidecar ----

export interface ServerStatus {
    running: boolean;
    pid?: number;
    port?: number;
    healthy?: boolean;
    simulation?: boolean;
}

export interface SidecarResult {
    ok: boolean;
    output: string;
}

// the CLI emits ANSI color escapes even when piped (sinotrade/shioaji#206)
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

async function sidecar(
    args: string[],
    env?: Record<string, string>,
): Promise<SidecarResult> {
    const { Command } = await import('@tauri-apps/plugin-shell');
    const cmd = Command.sidecar('binaries/shioaji', args, {
        env: { NO_COLOR: '1', ...env },
    });
    const out = await cmd.execute();
    const text = `${out.stdout}\n${out.stderr}`
        .replace(ANSI_RE, '')
        .trim();
    return { ok: out.code === 0, output: text };
}

export async function serverStatus(): Promise<ServerStatus | null> {
    if (!isTauri) return null;
    try {
        const res = await sidecar(['server', 'status', '--format', 'json']);
        const jsonStart = res.output.indexOf('{');
        if (jsonStart >= 0) {
            return JSON.parse(res.output.slice(jsonStart)) as ServerStatus;
        }
    } catch {
        // sidecar missing / failed
    }
    return null;
}

// is a shioaji HTTP server already answering on this port?
async function probeShioaji(port: number): Promise<boolean> {
    try {
        const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
        const res = await tauriFetch(
            `http://127.0.0.1:${port}/api/v1/info`,
            { signal: AbortSignal.timeout(1500) },
        );
        if (!res.ok) return false;
        const info = (await res.json()) as {
            version?: string;
            simulation?: boolean;
        };
        return (
            typeof info.version === 'string' &&
            typeof info.simulation === 'boolean'
        );
    } catch {
        return false;
    }
}

export interface StartResult extends SidecarResult {
    port: number;
    attached: boolean; // an existing shioaji server was reused
    portChanged: boolean; // the app's API base moved — caller should reload
}

export async function serverStart(opts: {
    apiKey: string;
    secretKey: string;
    production: boolean;
    caPath?: string;
    caPasswd?: string;
}): Promise<StartResult> {
    // our own daemon already running (possibly on a non-default port)?
    const st = await serverStatus();
    if (st?.running && st.port) {
        const modeMismatch =
            st.simulation !== undefined &&
            st.simulation === opts.production;
        if (st.healthy && !modeMismatch) {
            // healthy and in the requested mode — just use it
            return {
                ok: true,
                output: `伺服器已在運行（port ${st.port}）`,
                port: st.port,
                attached: true,
                portChanged: setApiPort(st.port),
            };
        }
        // unhealthy (e.g. production login failed without CA) or running
        // in the wrong mode — restart it with the requested settings
        // instead of attaching to a broken daemon (the v0.1.13 stuck-at-
        // 連線中 bug)
        await sidecar(['server', 'stop']);
        await new Promise((r) => setTimeout(r, 1200));
    }

    // a shioaji server already on 8080 (e.g. the user's own CLI daemon)?
    // attach to it instead of fighting over the port
    if (await probeShioaji(8080)) {
        return {
            ok: true,
            output: '偵測到既有 shioaji server（:8080），直接連接',
            port: 8080,
            attached: true,
            portChanged: setApiPort(8080),
        };
    }

    // 8080 occupied by something else → bind the first free port instead
    let port = 8080;
    try {
        const { invoke } = await import('@tauri-apps/api/core');
        const free = await invoke<number>('find_free_port', {
            preferred: 8080,
        });
        if (free > 0) port = free;
    } catch {
        // command unavailable — try 8080 and let the server error surface
    }

    const env: Record<string, string> = {
        SJ_API_KEY: opts.apiKey,
        SJ_SEC_KEY: opts.secretKey,
        SJ_HTTP_ADDR: `127.0.0.1:${port}`,
    };
    // CA certificate — required for production orders, ignored in simulation
    if (opts.caPath) {
        env.SJ_CA_PATH = opts.caPath;
        if (opts.caPasswd) env.SJ_CA_PASSWD = opts.caPasswd;
    }
    const args = ['server', 'start', '--no-open'];
    if (opts.production) args.push('--production');
    const res = await sidecar(args, env);
    const portChanged = res.ok ? setApiPort(port) : false;
    const note =
        res.ok && port !== 8080
            ? `\n⚠ 8080 被占用，伺服器改用 port ${port}`
            : '';
    return {
        ...res,
        output: `${res.output}${note}`,
        port,
        attached: false,
        portChanged,
    };
}

export async function serverStop(): Promise<SidecarResult> {
    return sidecar(['server', 'stop']);
}

// ---- settings store (API keys live in the app-data dir, not the repo) ----

export interface DesktopSettings {
    apiKey: string;
    secretKey: string;
    production: boolean;
    autoStart: boolean; // start the shioaji server when the app launches
    caPath: string; // Sinopac.pfx — required for production orders
    caPasswd: string;
}

const EMPTY_SETTINGS: DesktopSettings = {
    apiKey: '',
    secretKey: '',
    production: false,
    autoStart: true,
    caPath: '',
    caPasswd: '',
};

export async function loadDesktopSettings(): Promise<DesktopSettings> {
    if (!isTauri) return { ...EMPTY_SETTINGS };
    const { LazyStore } = await import('@tauri-apps/plugin-store');
    const store = new LazyStore('settings.json');
    return {
        apiKey: (await store.get<string>('apiKey')) ?? '',
        secretKey: (await store.get<string>('secretKey')) ?? '',
        production: (await store.get<boolean>('production')) ?? false,
        autoStart: (await store.get<boolean>('autoStart')) ?? true,
        caPath: (await store.get<string>('caPath')) ?? '',
        caPasswd: (await store.get<string>('caPasswd')) ?? '',
    };
}

export async function saveDesktopSettings(s: DesktopSettings) {
    if (!isTauri) return;
    const { LazyStore } = await import('@tauri-apps/plugin-store');
    const store = new LazyStore('settings.json');
    await store.set('apiKey', s.apiKey);
    await store.set('secretKey', s.secretKey);
    await store.set('production', s.production);
    await store.set('autoStart', s.autoStart);
    await store.set('caPath', s.caPath);
    await store.set('caPasswd', s.caPasswd);
    await store.save();
}

// native file picker for the Sinopac.pfx certificate
export async function pickCaFile(): Promise<string | null> {
    if (!isTauri) return null;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const file = await open({
        multiple: false,
        directory: false,
        title: '選擇 Sinopac.pfx 憑證',
        filters: [{ name: '憑證', extensions: ['pfx', 'p12'] }],
    });
    return typeof file === 'string' ? file : null;
}

// ---- popout windows ----

let popoutCounter = 0;

export async function openPopout(type: string, code: string | null) {
    const qs = new URLSearchParams({ popout: type, code: code ?? '' });
    if (!isTauri) {
        window.open(
            `${window.location.pathname}?${qs}`,
            `sj-popout-${type}-${code ?? 'x'}`,
            'width=900,height=620,menubar=no,toolbar=no',
        );
        return;
    }
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    popoutCounter += 1;
    new WebviewWindow(`popout-${type}-${popoutCounter}`, {
        url: `index.html?${qs}`,
        title: `Shioaji Pro — ${type}${code ? ` · ${code}` : ''}`,
        width: 900,
        height: 620,
        minWidth: 420,
        minHeight: 300,
    });
}

// 閃電全開: pop a flash-order window for each code, tiled to fill the
// screen (3 columns). Desktop uses real windows; browser falls back to
// window.open with positioned features.
export async function openFlashTiles(codes: string[]) {
    if (codes.length === 0) return;
    const cols = codes.length <= 4 ? 2 : 3;
    const rows = Math.ceil(codes.length / cols);
    const availW = window.screen.availWidth;
    const availH = window.screen.availHeight;
    const w = Math.floor(availW / cols);
    const h = Math.floor(availH / rows);
    if (!isTauri) {
        codes.forEach((code, i) => {
            const x = (i % cols) * w;
            const y = Math.floor(i / cols) * h;
            const qs = new URLSearchParams({ popout: 'flash', code });
            window.open(
                `${window.location.pathname}?${qs}`,
                `sj-flash-tile-${code}`,
                `left=${x},top=${y},width=${w},height=${h},menubar=no,toolbar=no`,
            );
        });
        return;
    }
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    codes.forEach((code, i) => {
        const qs = new URLSearchParams({ popout: 'flash', code });
        popoutCounter += 1;
        new WebviewWindow(`popout-flashtile-${popoutCounter}`, {
            url: `index.html?${qs}`,
            title: `⚡ ${code}`,
            x: (i % cols) * w,
            y: Math.floor(i / cols) * h,
            width: w,
            height: h,
            minWidth: 320,
            minHeight: 300,
        });
    });
}

// ---- auto-update ----

let updateInFlight = false;

export async function checkForUpdates(silent: boolean) {
    if (!isTauri || updateInFlight) return;
    updateInFlight = true;
    try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (!update) {
            if (!silent) {
                notify({
                    kind: 'info',
                    title: '已是最新版本',
                    body: '目前沒有可用更新',
                });
            }
            return;
        }
        notify({
            kind: 'info',
            title: `⬇️ 下載更新 v${update.version}`,
            body: '更新完成後將自動重新啟動',
        });
        await update.downloadAndInstall();
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await relaunch();
    } catch (e) {
        if (!silent) {
            notify({
                kind: 'err',
                title: '更新檢查失敗',
                body: e instanceof Error ? e.message : String(e),
            });
        }
    } finally {
        updateInFlight = false;
    }
}

// ---- tray events ----

export async function listenTrayEvents(onOpenServerManager: () => void) {
    if (!isTauri) return () => undefined;
    const { listen } = await import('@tauri-apps/api/event');
    const un1 = await listen('open-server-manager', onOpenServerManager);
    const un2 = await listen('check-updates', () => checkForUpdates(false));
    return () => {
        un1();
        un2();
    };
}
