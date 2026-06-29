// Design-system entry: re-exports the curated Shioaji Pro components plus the
// theme provider. esbuild (the design-sync converter) wraps this prebuilt
// bundle into window.ShioajiProUI. The component code is the real shipped
// source; only the data layer is swapped for mocks (see vite.config.ts).

export { PanelChrome } from '@/components/panel-chrome';
export { QuoteBoard } from '@/components/quote-board';
export { DepthLadder } from '@/components/depth-ladder';
export { OrderFlow } from '@/components/order-flow';
export { PnlPanel } from '@/components/pnl-panel';
export { Sparkline } from '@/components/sparkline';
export { TickTape } from '@/components/tick-tape';
export { DepthMap } from '@/components/depth-map';
export { VolProfile } from '@/components/vol-profile';
export { OptPayoff } from '@/components/opt-payoff';
export { SectorHeatmap } from '@/components/sector-heatmap';
export { ChipsCard } from '@/components/chips-card';

export { DSThemeProvider } from './theme-provider';
