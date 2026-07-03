import { QuoteBoard } from 'shioaji-pro-app';

// the contract carries the limits/reference; the live close + book come from
// the quote feed (canned here, keyed by code: TXFR1/TMFR1 up, MXFR1 down)
const txf = { code: 'TXFR1', name: '臺指期近月', reference: 23100, limit_up: 25410, limit_down: 20790 };
const mxf = { code: 'MXFR1', name: '小型臺指近月', reference: 23100, limit_up: 25410, limit_down: 20790 };
const tsmc = { code: '2330', name: '台積電', reference: 1085, limit_up: 1190, limit_down: 975 };

export function Futures() {
    return <QuoteBoard contract={txf} />;
}
export function Stock() {
    return <QuoteBoard contract={tsmc} />;
}
export function Down() {
    return <QuoteBoard contract={mxf} />;
}
