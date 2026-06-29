// Mock for src/lib/price-sync.ts — depth-ladder writes a picked price here;
// no cross-panel wiring needed in isolated previews.

export interface PickedPrice { code: string; price: number; seq: number; }

export function setPickedPrice(_code: string, _price: number) {}
export function usePickedPrice(_code: string | null): PickedPrice | null { return null; }
