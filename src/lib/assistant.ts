// src/lib/assistant.ts — Claude-powered trading assistant. The model can
// read market data and the account through client-side tools; placing an
// order is NEVER automatic — propose_order only surfaces a confirmation
// card that the user must click.

import { ensureContract } from './contracts-cache';
import {
    fetchKbars,
    fetchPositions,
    fetchSnapshots,
    fetchTrades,
} from './shioaji';
import { getQuote } from './stream';
import { ACTIVE_ORDER_STATUSES } from './types/order';
import { dateStrOffset } from './utils/kbars';

const KEY_STORE = 'sj-pro-anthropic-key';
const MODEL = 'claude-sonnet-4-6';

export function getAssistantKey(): string {
    try {
        return localStorage.getItem(KEY_STORE) ?? '';
    } catch {
        return '';
    }
}

export function setAssistantKey(key: string) {
    try {
        localStorage.setItem(KEY_STORE, key);
    } catch {
        // session only
    }
}

export interface OrderProposal {
    code: string;
    action: 'Buy' | 'Sell';
    price: number | null; // null = market
    quantity: number;
    reason: string;
}

// content blocks we render
export type ChatBlock =
    | { type: 'text'; text: string }
    | { type: 'proposal'; proposal: OrderProposal; id: string };

export interface ChatTurn {
    role: 'user' | 'assistant';
    blocks: ChatBlock[];
}

const SYSTEM_PROMPT = `你是 Shioaji Pro 台股交易終端的內建助理。使用繁體中文回答，簡潔專業。
你可以用工具查即時報價、持倉、委託、歷史K線摘要。
重要規則：
- 你絕對不能自行下單。若使用者要求下單或你建議交易，呼叫 propose_order 工具，由使用者在介面上手動確認。
- 不保證獲利；給出分析時提醒風險。模擬環境下單不涉及真實資金，正式環境動用真實資金。
- 數字使用台股慣例（紅漲綠跌）。回答勿過長。`;

const TOOLS = [
    {
        name: 'get_quote',
        description: '取得商品即時報價（價格、漲跌、買賣價、量）',
        input_schema: {
            type: 'object',
            properties: {
                code: { type: 'string', description: '商品代碼，如 2330、TXFR1' },
            },
            required: ['code'],
        },
    },
    {
        name: 'get_positions',
        description: '取得目前所有持倉（股票+期貨），含損益',
        input_schema: { type: 'object', properties: {} },
    },
    {
        name: 'get_working_orders',
        description: '取得在途（未成交）委託單',
        input_schema: { type: 'object', properties: {} },
    },
    {
        name: 'get_kbar_summary',
        description: '取得商品近 N 日 K 線摘要（期間高低、收盤、漲跌幅）',
        input_schema: {
            type: 'object',
            properties: {
                code: { type: 'string' },
                days: { type: 'number', description: '回看天數，預設 20' },
            },
            required: ['code'],
        },
    },
    {
        name: 'propose_order',
        description:
            '向使用者提出下單建議（不會直接下單，需使用者手動確認）',
        input_schema: {
            type: 'object',
            properties: {
                code: { type: 'string' },
                action: { type: 'string', enum: ['Buy', 'Sell'] },
                price: {
                    type: 'number',
                    description: '限價；省略代表市價',
                },
                quantity: { type: 'number' },
                reason: { type: 'string', description: '一句話理由' },
            },
            required: ['code', 'action', 'quantity', 'reason'],
        },
    },
];

async function runTool(
    name: string,
    input: Record<string, unknown>,
): Promise<{ result: unknown; proposal?: OrderProposal }> {
    switch (name) {
        case 'get_quote': {
            const code = String(input.code ?? '').toUpperCase();
            const c = await ensureContract(code);
            const q = getQuote(c.code);
            const snap = q?.tick
                ? null
                : (await fetchSnapshots([c]).catch(() => []))[0];
            const close = q?.tick ? Number(q.tick.close) : snap?.close;
            const ref = c.reference;
            return {
                result: {
                    code: c.code,
                    name: c.name,
                    close,
                    change:
                        close !== undefined && ref ? close - ref : undefined,
                    change_pct:
                        close !== undefined && ref
                            ? (((close - ref) / ref) * 100).toFixed(2) + '%'
                            : undefined,
                    bid: q?.bidask ? Number(q.bidask.bid_price[0]) : undefined,
                    ask: q?.bidask ? Number(q.bidask.ask_price[0]) : undefined,
                    total_volume: q?.tick?.total_volume ?? snap?.total_volume,
                    limit_up: c.limit_up,
                    limit_down: c.limit_down,
                },
            };
        }
        case 'get_positions': {
            const [s, f] = await Promise.allSettled([
                fetchPositions('S'),
                fetchPositions('F'),
            ]);
            const all = [
                ...(s.status === 'fulfilled' ? s.value : []),
                ...(f.status === 'fulfilled' ? f.value : []),
            ];
            return {
                result: all.map((p) => ({
                    code: p.code,
                    direction: p.direction,
                    quantity: p.quantity,
                    avg_price: p.price,
                    last_price: p.last_price,
                    pnl: Math.round(p.pnl),
                })),
            };
        }
        case 'get_working_orders': {
            const [s, f] = await Promise.allSettled([
                fetchTrades('S'),
                fetchTrades('F'),
            ]);
            const all = [
                ...(s.status === 'fulfilled' ? s.value : []),
                ...(f.status === 'fulfilled' ? f.value : []),
            ].filter((t) => ACTIVE_ORDER_STATUSES.has(t.status.status));
            return {
                result: all.map((t) => ({
                    code: t.contract.code,
                    action: t.order.action,
                    price: t.status.modified_price || t.order.price,
                    quantity: t.order.quantity,
                    filled: t.status.deal_quantity,
                    status: t.status.status,
                })),
            };
        }
        case 'get_kbar_summary': {
            const code = String(input.code ?? '').toUpperCase();
            const days = Math.min(120, Number(input.days) || 20);
            const c = await ensureContract(code);
            const k = await fetchKbars(c, dateStrOffset(days), dateStrOffset(0));
            const closes = k.Close.filter((v): v is number => !!v);
            const highs = k.High.filter((v): v is number => !!v);
            const lows = k.Low.filter((v): v is number => !!v);
            if (closes.length === 0) return { result: { error: '無資料' } };
            const lastClose = closes[closes.length - 1]!;
            const firstClose = closes[0]!;
            return {
                result: {
                    code: c.code,
                    days,
                    period_high: Math.max(...highs),
                    period_low: Math.min(...lows),
                    last_close: lastClose,
                    period_change_pct:
                        (((lastClose - firstClose) / firstClose) * 100).toFixed(
                            2,
                        ) + '%',
                },
            };
        }
        case 'propose_order': {
            const proposal: OrderProposal = {
                code: String(input.code ?? '').toUpperCase(),
                action: input.action === 'Sell' ? 'Sell' : 'Buy',
                price:
                    input.price === undefined || input.price === null
                        ? null
                        : Number(input.price),
                quantity: Math.max(1, Number(input.quantity) || 1),
                reason: String(input.reason ?? ''),
            };
            return {
                result: {
                    status: 'awaiting_user_confirmation',
                    note: '已顯示確認卡片，等待使用者手動確認或取消',
                },
                proposal,
            };
        }
        default:
            return { result: { error: `unknown tool ${name}` } };
    }
}

interface ApiContent {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
}

// one user turn → assistant blocks (tool loop runs internally)
export async function chatWithAssistant(
    history: { role: 'user' | 'assistant'; content: unknown }[],
    onBlocks: (blocks: ChatBlock[]) => void,
): Promise<{ role: 'user' | 'assistant'; content: unknown }[]> {
    const key = getAssistantKey();
    if (!key) throw new Error('尚未設定 Anthropic API Key');
    const messages = [...history];

    for (let round = 0; round < 6; round++) {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
                model: MODEL,
                max_tokens: 1500,
                system: SYSTEM_PROMPT,
                tools: TOOLS,
                messages,
            }),
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`API ${res.status}: ${body.slice(0, 160)}`);
        }
        const data = (await res.json()) as {
            content: ApiContent[];
            stop_reason: string;
        };
        messages.push({ role: 'assistant', content: data.content });

        // surface text + proposals immediately
        const blocks: ChatBlock[] = [];
        for (const c of data.content) {
            if (c.type === 'text' && c.text) {
                blocks.push({ type: 'text', text: c.text });
            }
        }

        if (data.stop_reason !== 'tool_use') {
            if (blocks.length) onBlocks(blocks);
            return messages;
        }

        const toolResults: unknown[] = [];
        for (const c of data.content) {
            if (c.type !== 'tool_use' || !c.id || !c.name) continue;
            try {
                const { result, proposal } = await runTool(
                    c.name,
                    c.input ?? {},
                );
                if (proposal) {
                    blocks.push({ type: 'proposal', proposal, id: c.id });
                }
                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: c.id,
                    content: JSON.stringify(result),
                });
            } catch (e) {
                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: c.id,
                    content: JSON.stringify({
                        error: e instanceof Error ? e.message : String(e),
                    }),
                    is_error: true,
                });
            }
        }
        if (blocks.length) onBlocks(blocks);
        messages.push({ role: 'user', content: toolResults });
    }
    return messages;
}
