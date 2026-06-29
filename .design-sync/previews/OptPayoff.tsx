import { OptPayoff } from 'shioaji-pro-app';

// 選擇權到期損益圖: settlement payoff curve built from option/futures legs.
// Real positions (resolved to strikes/rights via the contract cache) plus
// freely-added simulated legs. Here: a long call spread + a protective put.
const positions = [
    { id: 1, code: 'TXO22800C6', direction: 'Buy' as const, quantity: 2, price: 410 },
    { id: 2, code: 'TXO23400C6', direction: 'Sell' as const, quantity: 2, price: 165 },
    { id: 3, code: 'TXO22600P6', direction: 'Buy' as const, quantity: 1, price: 120 },
];

export function CallSpread() {
    return (
        <div style={{ width: '420px' }}>
            <OptPayoff positions={positions} />
        </div>
    );
}
