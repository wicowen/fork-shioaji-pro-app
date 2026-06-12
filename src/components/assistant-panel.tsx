// src/components/assistant-panel.tsx — AI 助理: chat with Claude about
// quotes/positions/orders. Order proposals render as confirmation cards —
// nothing is sent to the market without an explicit click.

import { useEffect, useRef, useState } from 'react';
import {
    chatWithAssistant,
    getAssistantKey,
    setAssistantKey,
    type ChatBlock,
    type ChatTurn,
    type OrderProposal,
} from '../lib/assistant';
import { ensureContract } from '../lib/contracts-cache';
import { notify, placeQuickOrder } from '../lib/trade';
import { fmtPrice } from '../lib/utils/format';
import * as styles from './assistant-panel.css';

type ProposalState = 'pending' | 'confirmed' | 'cancelled';

export function AssistantPanel() {
    const [hasKey, setHasKey] = useState(() => !!getAssistantKey());
    const [keyInput, setKeyInput] = useState('');
    const [turns, setTurns] = useState<ChatTurn[]>([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [proposalStates, setProposalStates] = useState<
        Record<string, ProposalState>
    >({});
    // raw API history (includes tool calls/results)
    const historyRef = useRef<{ role: 'user' | 'assistant'; content: unknown }[]>(
        [],
    );
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }, [turns, busy]);

    const send = async () => {
        const text = input.trim();
        if (!text || busy) return;
        setInput('');
        setTurns((prev) => [
            ...prev,
            { role: 'user', blocks: [{ type: 'text', text }] },
        ]);
        historyRef.current.push({ role: 'user', content: text });
        setBusy(true);
        try {
            historyRef.current = await chatWithAssistant(
                historyRef.current,
                (blocks: ChatBlock[]) =>
                    setTurns((prev) => [
                        ...prev,
                        { role: 'assistant', blocks },
                    ]),
            );
        } catch (e) {
            setTurns((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    blocks: [
                        {
                            type: 'text',
                            text: `❌ ${e instanceof Error ? e.message : String(e)}`,
                        },
                    ],
                },
            ]);
        } finally {
            setBusy(false);
        }
    };

    const confirmProposal = async (id: string, p: OrderProposal) => {
        setProposalStates((s) => ({ ...s, [id]: 'confirmed' }));
        try {
            const contract = await ensureContract(p.code);
            const trade = await placeQuickOrder(
                contract,
                p.action,
                p.price,
                p.quantity,
            );
            notify({
                kind: 'ok',
                title: '🤖 助理提案已確認下單',
                body: `${p.code} ${p.action === 'Buy' ? '買' : '賣'} ${p.quantity} @ ${
                    p.price === null ? '市價' : fmtPrice(p.price)
                }（${trade.status.status}）`,
            });
            historyRef.current.push({
                role: 'user',
                content: `[系統] 使用者已確認下單：${p.code} ${p.action} ${p.quantity} @ ${p.price ?? '市價'}，狀態 ${trade.status.status}`,
            });
        } catch (e) {
            setProposalStates((s) => ({ ...s, [id]: 'pending' }));
            notify({
                kind: 'err',
                title: '下單失敗',
                body: e instanceof Error ? e.message : String(e),
            });
        }
    };

    if (!hasKey) {
        return (
            <div className={styles.setup}>
                <span className={styles.setupTitle}>AI 助理</span>
                <span className={styles.setupHint}>
                    需要 Anthropic API Key（儲存在本機，不會上傳到任何伺服器，
                    僅用於直接呼叫 Claude API）。
                </span>
                <input
                    className={styles.keyInput}
                    type='password'
                    placeholder='sk-ant-…'
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                />
                <button
                    className={styles.sendBtn}
                    disabled={!keyInput.trim().startsWith('sk-ant-')}
                    onClick={() => {
                        setAssistantKey(keyInput.trim());
                        setHasKey(true);
                    }}
                >
                    儲存並開始
                </button>
            </div>
        );
    }

    return (
        <div className={styles.wrap}>
            <div ref={scrollRef} className={styles.messages}>
                {turns.length === 0 && (
                    <div className={styles.emptyHint}>
                        問我行情、持倉分析或下單建議，例如：
                        <br />「2330 現在怎麼樣？」「分析我的持倉風險」
                        <br />「台積電 1 張掛 1000 幫我下」
                    </div>
                )}
                {turns.map((t, i) => (
                    <div
                        key={i}
                        className={
                            t.role === 'user' ? styles.userMsg : styles.aiMsg
                        }
                    >
                        {t.blocks.map((b, j) => {
                            if (b.type === 'text') {
                                return <span key={j}>{b.text}</span>;
                            }
                            const state = proposalStates[b.id] ?? 'pending';
                            const p = b.proposal;
                            return (
                                <div key={j} className={styles.proposalCard}>
                                    <span className={styles.proposalTitle}>
                                        🤖 下單提案
                                    </span>
                                    <span className={styles.proposalBody}>
                                        {p.action === 'Buy' ? '買進' : '賣出'}{' '}
                                        {p.code} × {p.quantity} @{' '}
                                        {p.price === null
                                            ? '市價'
                                            : fmtPrice(p.price)}
                                        <br />
                                        <span
                                            className={styles.proposalReason}
                                        >
                                            {p.reason}
                                        </span>
                                    </span>
                                    {state === 'pending' ? (
                                        <div className={styles.proposalBtns}>
                                            <button
                                                className={styles.confirmBtn}
                                                onClick={() =>
                                                    void confirmProposal(
                                                        b.id,
                                                        p,
                                                    )
                                                }
                                            >
                                                確認下單
                                            </button>
                                            <button
                                                className={styles.rejectBtn}
                                                onClick={() => {
                                                    setProposalStates((s) => ({
                                                        ...s,
                                                        [b.id]: 'cancelled',
                                                    }));
                                                    historyRef.current.push({
                                                        role: 'user',
                                                        content:
                                                            '[系統] 使用者取消了這筆提案',
                                                    });
                                                }}
                                            >
                                                取消
                                            </button>
                                        </div>
                                    ) : (
                                        <span className={styles.proposalDone}>
                                            {state === 'confirmed'
                                                ? '✓ 已確認下單'
                                                : '✕ 已取消'}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
                {busy && <div className={styles.aiMsg}>思考中…</div>}
            </div>
            <div className={styles.inputRow}>
                <input
                    className={styles.chatInput}
                    placeholder='問行情、持倉，或請我擬一筆單…'
                    value={input}
                    disabled={busy}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void send()}
                />
                <button
                    className={styles.sendBtn}
                    disabled={busy || !input.trim()}
                    onClick={() => void send()}
                >
                    送出
                </button>
            </div>
            <span className={styles.disclaimer}>
                AI 分析僅供參考，所有下單需手動確認，盈虧自負
            </span>
        </div>
    );
}
