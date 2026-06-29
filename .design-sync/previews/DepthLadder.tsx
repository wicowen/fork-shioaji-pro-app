import { DepthLadder } from 'shioaji-pro-app';

// 5-level book read from the quote store by code; TMFR1 is bid-heavy
// (買方力道), MXFR1 ask-heavy — the 買賣力道 gauge at the bottom flips
export function BidHeavy() {
    return (
        <div style={{ width: '300px' }}>
            <DepthLadder code="TMFR1" />
        </div>
    );
}
export function AskHeavy() {
    return (
        <div style={{ width: '300px' }}>
            <DepthLadder code="MXFR1" />
        </div>
    );
}
