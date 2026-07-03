// src/lib/roll-resolve.ts — resolve a futures position into near/next month
// legs for the rollover monitor. Uses R1/R2 continuous-month aliases, with a
// bulk-contract-listing fallback when an R2 alias isn't available.

import { apiPost } from './api';
import { ensureContract } from './contracts-cache';
import { nearAlias, nextAlias, rollRoot } from './rollover-engine';
import type { ContractInfo } from './types/contract';
import type { FuturePosition } from './types/portfolio';

export interface ResolvedRoll {
    productRoot: string;
    posDirection: 'Buy' | 'Sell';
    posQty: number;
    near: ContractInfo;
    next: ContractInfo;
    nearCode: string;
    nextCode: string;
    positionIsFront: boolean;
}

export function rollWatchId(pos: FuturePosition): string {
    return `roll-${pos.code}-${pos.id}`;
}

let futListCache: ContractInfo[] | null = null;
let futListPending: Promise<ContractInfo[]> | null = null;

async function listFutures(): Promise<ContractInfo[]> {
    if (futListCache) return futListCache;
    if (futListPending) return futListPending;
    futListPending = apiPost<{ contracts: ContractInfo[] }>(
        '/api/v1/data/contracts',
        { security_type: 'FUT', page: -1 },
    )
        .then((r) => {
            futListCache = r.contracts;
            return r.contracts;
        })
        .finally(() => {
            futListPending = null;
        });
    return futListPending;
}

async function resolveNextByListing(
    root: string,
    nearMonth: string,
): Promise<ContractInfo | null> {
    try {
        const all = await listFutures();
        const sameRoot = all
            .filter((c) => rollRoot(c.code) === root && c.delivery_month)
            .sort((a, b) =>
                (a.delivery_month ?? '') < (b.delivery_month ?? '') ? -1 : 1,
            );
        return (
            sameRoot.find((c) => (c.delivery_month ?? '') > nearMonth) ?? null
        );
    } catch {
        return null;
    }
}

export async function resolveRollLegs(
    pos: FuturePosition,
): Promise<ResolvedRoll | null> {
    const root = rollRoot(pos.code);
    if (!root || root === pos.code) {
        console.warn(`[resolveRollLegs] no month code to strip: ${pos.code}`);
        return null; // no month code to strip
    }
    const near = await ensureContract(nearAlias(root), 'FUT').catch(() => null);
    if (!near) {
        console.warn(`[resolveRollLegs] near unresolved: ${nearAlias(root)}`);
        return null;
    }
    let next = await ensureContract(nextAlias(root), 'FUT').catch(() => null);
    // R2 missing or not actually a later month → list contracts and pick the
    // month right after the front
    if (
        (!next || next.delivery_month === near.delivery_month) &&
        near.delivery_month
    ) {
        const listed = await resolveNextByListing(root, near.delivery_month);
        if (listed) {
            next = await ensureContract(listed.code, 'FUT').catch(() => listed);
        }
    }
    if (!next) {
        console.warn(
            `[resolveRollLegs] next unresolved: ${nextAlias(root)} (root ${root})`,
        );
        return null;
    }
    const positionIsFront =
        pos.code === near.target_code || pos.code === near.code;
    console.debug(
        `[resolveRollLegs] ${pos.code} -> near ${near.code} / next ${next.code} front=${positionIsFront}`,
    );
    return {
        productRoot: root,
        posDirection: pos.direction,
        posQty: pos.quantity,
        near,
        next,
        nearCode: near.code,
        nextCode: next.code,
        positionIsFront,
    };
}
