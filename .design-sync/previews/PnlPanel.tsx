import { PnlPanel } from 'shioaji-pro-app';

// realized P&L analytics over the last 30 days — headline figure, equity
// curve, and win-rate / avg-win / avg-loss / payoff-ratio stats
export function Default() {
    return (
        <div style={{ width: '320px' }}>
            <PnlPanel />
        </div>
    );
}
