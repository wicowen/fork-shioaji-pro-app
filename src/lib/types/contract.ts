// src/lib/types/contract.ts

export type Exchange = 'TSE' | 'OTC' | 'OES' | 'TAIFEX' | null;
export type SecurityType = 'IND' | 'STK' | 'FUT' | 'OPT' | null;
export type Currency = 'TWD' | 'USD' | 'CNY';
export type DayTrade = 'Yes' | 'OnlyBuy' | 'No' | '';

export interface ContractBase {
    exchange: Exchange;
    code: string;
    security_type: SecurityType;
    target_code: string | null;
}

export interface Contract extends ContractBase {
    name: string;
    currency: Currency;
}

export interface ContractInfo extends Contract {
    limit_up: number;
    limit_down: number;
    reference: number;
    day_trade: DayTrade;
    update_date: string;
    category: string;
    margin_trading_balance: number;
    short_selling_balance: number;
    // futures/options: contract multiplier from the API (e.g. TXF 200,
    // stock futures 2000); options carry strike/right for payoff math
    multiplier?: number;
    strike_price?: number;
    option_right?: string;
    delivery_month?: string;
    underlying_code?: string;
}
