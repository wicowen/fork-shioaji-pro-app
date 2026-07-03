import { Sparkline } from 'shioaji-pro-app';

// tiny intraday trend line for list rows — canvas-based, draws today's
// 1-minute closes with the reference price as a dashed baseline that also
// sets the up/down color
const tmf = { code: 'TMFR1' };

export function Up() {
    return (
        <div style={{ width: '220px' }}>
            <Sparkline contract={tmf} reference={23100} stretch height={40} />
        </div>
    );
}

export function Down() {
    // a reference above the series paints the down color
    return (
        <div style={{ width: '220px' }}>
            <Sparkline contract={tmf} reference={23260} stretch height={40} />
        </div>
    );
}

export function Compact() {
    return <Sparkline contract={tmf} reference={23100} width={96} height={22} />;
}
