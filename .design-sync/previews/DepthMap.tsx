import { DepthMap } from 'shioaji-pro-app';

// 委託簿熱圖: a time-series canvas heatmap of the 5-level book — X = time,
// Y = price, intensity = resting volume; shows where order walls build and
// get pulled. Canned here as a drifting book accumulated over ~190 updates.
const tmf = { code: 'TMFR1', name: '微型臺指近月', security_type: 'FUT' as const, target_code: 'TMFF6', exchange: 'TAIFEX' as const };

export function Default() {
    return (
        <div style={{ width: '340px', height: '220px' }}>
            <DepthMap contract={tmf} />
        </div>
    );
}
