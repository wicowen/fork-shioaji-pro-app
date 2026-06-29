// Mock for src/lib/stock-index.ts — sector-heatmap loads the contract-file
// derived category index here. Backed by the canned stock list in _data.

import {
    SECTOR_INDICES,
    categoriesOf,
    sectorLabel,
    stockIndex,
} from './_data';
import type { StockMeta } from './_data';

export type { StockMeta } from './_data';
export { SECTOR_INDICES, categoriesOf, sectorLabel };

export async function loadStockIndex(): Promise<StockMeta[]> {
    return stockIndex();
}
