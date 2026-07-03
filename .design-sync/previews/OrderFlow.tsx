import { OrderFlow } from 'shioaji-pro-app';

// 盤口力道: aggressive (not resting) buy/sell pressure for one contract —
// rolling 主動力道, CVD line, and big-lot 大單衝擊 events. Driven by the
// per-trade tick_type stream (canned: a trending-up TMFR1 tape with big lots).
const tmf = { code: 'TMFR1', name: '微型臺指近月', security_type: 'FUT' as const, target_code: 'TMFF6', exchange: 'TAIFEX' as const };

export function Default() {
    return (
        <div style={{ width: '340px' }}>
            <OrderFlow contract={tmf} />
        </div>
    );
}
