// src/components/order-flow.css.ts

import { style, styleVariants } from '@vanilla-extract/css';
import { vars } from '../theme.css';

export const wrap = style({
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
    fontFamily: vars.font.mono,
    fontVariantNumeric: 'tabular-nums',
});

// ---- section scaffolding ----

export const section = style({
    display: 'flex',
    flexDirection: 'column',
    borderBottom: `1px solid ${vars.color.border}`,
    flexShrink: 0,
});

export const sectionHead = style({
    display: 'flex',
    alignItems: 'center',
    gap: vars.space.sm,
    padding: `5px ${vars.space.md}`,
    fontSize: '0.6rem',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: vars.color.mutedForeground,
});

export const headSpacer = style({ flex: 1 });

// ---- rolling pressure meter ----

export const winBtns = style({
    display: 'flex',
    gap: '2px',
});

export const winBtn = styleVariants({
    off: {
        fontFamily: vars.font.mono,
        fontSize: '0.6rem',
        color: vars.color.mutedForeground,
        background: 'transparent',
        border: `1px solid ${vars.color.border}`,
        borderRadius: vars.radius.sm,
        padding: '1px 6px',
        cursor: 'pointer',
    },
    on: {
        fontFamily: vars.font.mono,
        fontSize: '0.6rem',
        color: vars.color.foreground,
        background: vars.color.accentDim,
        border: `1px solid ${vars.color.accent}`,
        borderRadius: vars.radius.sm,
        padding: '1px 6px',
        cursor: 'pointer',
    },
});

export const meterBody = style({
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: `8px ${vars.space.md} 12px`,
});

export const forceRow = style({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.66rem',
});

export const forceLabel = style({
    color: vars.color.mutedForeground,
    fontSize: '0.6rem',
});

export const pressureTrack = style({
    position: 'relative',
    height: '10px',
    background: vars.color.downDim,
    borderRadius: '3px',
    overflow: 'hidden',
});

export const pressureBuy = style({
    height: '100%',
    background: vars.color.up,
    opacity: 0.8,
    transition: 'width 0.25s',
});

// midline marker at 50%
export const pressureMid = style({
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: '1px',
    background: vars.color.border,
});

export const statsRow = style({
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: vars.space.sm,
});

export const stat = style({
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
});

export const statLabel = style({
    fontSize: '0.56rem',
    color: vars.color.mutedForeground,
    letterSpacing: '0.04em',
});

export const statValue = style({
    fontSize: '0.92rem',
    fontWeight: 600,
});

// ---- big-lot impact events ----

export const eventsSection = style({
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
});

export const threshInput = style({
    width: '3.2rem',
    fontFamily: vars.font.mono,
    fontSize: '0.62rem',
    textAlign: 'right',
    color: vars.color.foreground,
    background: vars.color.inset,
    border: `1px solid ${vars.color.border}`,
    borderRadius: vars.radius.sm,
    padding: '1px 4px',
    selectors: {
        '&:focus': {
            outline: 'none',
            borderColor: vars.color.accent,
        },
    },
});

export const eventList = style({
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: `2px ${vars.space.sm}`,
});

export const eventRow = style({
    display: 'grid',
    gridTemplateColumns: '2.6rem 1fr auto',
    alignItems: 'center',
    columnGap: vars.space.sm,
    height: '22px',
    fontSize: '0.66rem',
    borderBottom: `1px solid ${vars.color.muted}`,
});

export const sideChip = styleVariants({
    up: {
        textAlign: 'center',
        fontSize: '0.58rem',
        fontWeight: 700,
        color: vars.color.up,
        background: vars.color.upDim,
        borderRadius: vars.radius.sm,
        padding: '1px 0',
    },
    down: {
        textAlign: 'center',
        fontSize: '0.58rem',
        fontWeight: 700,
        color: vars.color.down,
        background: vars.color.downDim,
        borderRadius: vars.radius.sm,
        padding: '1px 0',
    },
});

export const eventMid = style({
    display: 'flex',
    alignItems: 'baseline',
    gap: vars.space.xs,
    color: vars.color.mutedForeground,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
});

export const eventVol = style({
    color: vars.color.foreground,
    fontWeight: 600,
});

export const eventPer = style({
    fontSize: '0.56rem',
    color: vars.color.mutedForeground,
});

export const eventPoints = style({
    fontSize: '0.82rem',
    fontWeight: 700,
    textAlign: 'right',
});

export const empty = style({
    padding: vars.space.md,
    textAlign: 'center',
    fontSize: '0.64rem',
    color: vars.color.mutedForeground,
});

export const hint = style({
    padding: `4px ${vars.space.md} 6px`,
    fontSize: '0.56rem',
    color: vars.color.mutedForeground,
    lineHeight: 1.5,
});
