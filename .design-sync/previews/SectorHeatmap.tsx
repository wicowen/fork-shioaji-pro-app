import { SectorHeatmap } from 'shioaji-pro-app';

// 類股熱力圖: industry sectors tiled and colored by today's percent change
// (intensity scales with magnitude), strongest sector first. Click a tile to
// drill into that sector's member stocks.
export function Overview() {
    return (
        <div style={{ width: '420px' }}>
            <SectorHeatmap />
        </div>
    );
}
