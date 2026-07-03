import { ChipsCard } from 'shioaji-pro-app';

// 個股籌碼卡 (stocks only): margin/short quota and ratios, borrowable lending
// source, day-trade eligibility, and the regulatory 處置/警示 flag.
const tsmc = {
    code: '2330', name: '台積電', security_type: 'STK' as const, exchange: 'TSE' as const,
    target_code: null, day_trade: 'Yes' as const,
    margin_trading_balance: 18650, short_selling_balance: 2240,
};

export function Default() {
    return (
        <div style={{ width: '340px' }}>
            <ChipsCard contract={tsmc} />
        </div>
    );
}
