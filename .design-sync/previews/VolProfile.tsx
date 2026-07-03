import { VolProfile } from 'shioaji-pro-app';

// price-by-volume profile (分價量): traded lots stacked at each price level,
// built from today's history ticks plus the live tape
const tmf = { code: 'TMFR1', name: '微型臺指近月', security_type: 'FUT' as const, target_code: 'TMFF6', exchange: 'TAIFEX' as const };

export function Default() {
    return (
        <div style={{ width: '300px' }}>
            <VolProfile contract={tmf} />
        </div>
    );
}
