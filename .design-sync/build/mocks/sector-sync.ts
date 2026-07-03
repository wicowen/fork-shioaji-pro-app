// Mock for src/lib/sector-sync.ts — sector-heatmap reads the focused sector;
// returning null keeps it on the default overview view.

export function focusSector(_category: string) {}
export function useFocusedSector(): { category: string; seq: number } | null { return null; }
