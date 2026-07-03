// src/components/rollover-panel.css.ts — 轉倉監控面板列樣式

import { style, styleVariants } from '@vanilla-extract/css';
import { vars } from '../theme.css';

export const empty = style({
    padding: vars.space.md,
    fontFamily: vars.font.body,
    fontSize: '0.72rem',
    color: vars.color.mutedForeground,
    lineHeight: 1.6,
});

export const row = style({
    display: 'flex',
    flexDirection: 'column',
    gap: vars.space.xs,
    padding: vars.space.sm,
    border: `1px solid ${vars.color.border}`,
    borderRadius: vars.radius.sm,
    background: vars.color.inset,
});

export const rowHead = style({
    display: 'flex',
    alignItems: 'center',
    gap: vars.space.sm,
});

export const label = style({
    fontFamily: vars.font.display,
    fontSize: '0.8rem',
    fontWeight: 700,
    color: vars.color.foreground,
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    ':hover': { color: vars.color.accent },
});

export const tag = styleVariants({
    warn: {
        fontFamily: vars.font.body,
        fontSize: '0.58rem',
        color: vars.color.amber,
        border: `1px solid ${vars.color.amber}`,
        borderRadius: vars.radius.sm,
        padding: '1px 5px',
    },
    idle: {
        fontFamily: vars.font.body,
        fontSize: '0.58rem',
        color: vars.color.mutedForeground,
        border: `1px solid ${vars.color.border}`,
        borderRadius: vars.radius.sm,
        padding: '1px 5px',
    },
});

export const removeBtn = style({
    marginLeft: 'auto',
    fontFamily: vars.font.mono,
    fontSize: '0.7rem',
    lineHeight: 1,
    color: vars.color.mutedForeground,
    background: 'transparent',
    border: `1px solid ${vars.color.border}`,
    borderRadius: vars.radius.sm,
    padding: '2px 6px',
    cursor: 'pointer',
    ':hover': { color: vars.color.down, borderColor: vars.color.down },
});

export const edgeRow = style({
    display: 'flex',
    alignItems: 'baseline',
    gap: vars.space.sm,
    marginTop: '2px',
});

export const edgeLabel = style({
    fontFamily: vars.font.display,
    fontSize: '0.66rem',
    color: vars.color.mutedForeground,
});

const edgeBase = style({
    fontFamily: vars.font.mono,
    fontSize: '1.25rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: vars.color.foreground,
});

export const edge = styleVariants({
    idle: [edgeBase],
    hot: [edgeBase, { color: vars.color.accent }],
});

export const approx = style({
    fontFamily: vars.font.body,
    fontSize: '0.58rem',
    color: vars.color.mutedForeground,
});

export const reached = style({
    fontFamily: vars.font.display,
    fontSize: '0.62rem',
    fontWeight: 700,
    color: vars.color.accent,
    border: `1px solid ${vars.color.accent}`,
    background: vars.color.accentDim,
    borderRadius: vars.radius.sm,
    padding: '1px 6px',
});

export const hint = style({
    fontFamily: vars.font.body,
    fontSize: '0.6rem',
    color: vars.color.mutedForeground,
    lineHeight: 1.5,
});
