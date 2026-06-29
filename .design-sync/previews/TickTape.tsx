import { TickTape } from 'shioaji-pro-app';

// streaming trade prints (逐筆成交): price, lots, and aggressor side per tick
const tmf = { code: 'TMFR1', name: '微型臺指近月', security_type: 'FUT' as const, target_code: 'TMFF6', exchange: 'TAIFEX' as const };

export function Default() {
    return (
        <div style={{ width: '260px' }}>
            <TickTape contract={tmf} />
        </div>
    );
}
