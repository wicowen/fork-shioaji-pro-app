// Mock for src/lib/contracts-cache.ts — opt-payoff resolves position codes
// to option contracts here. Returns canned OPT/FUT contracts.

import type { ContractInfo, SecurityType } from '@/lib/types/contract';
import { ensureContractMock } from './_data';

export async function ensureContract(code: string, _type?: SecurityType): Promise<ContractInfo> {
    return ensureContractMock(code);
}
export function getCachedContract(_code: string): ContractInfo | undefined { return undefined; }
export function primeContract(_contract: ContractInfo) {}
export function useContract(_code: string | null): ContractInfo | undefined { return undefined; }
