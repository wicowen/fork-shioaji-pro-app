// src/components/sector-heatmap.css.ts

import { style } from '@vanilla-extract/css';
import { vars } from '../theme.css';

export const wrap = style({
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
});

export const toolbar = style({
    display: 'flex',
    alignItems: 'center',
    gap: vars.space.sm,
    padding: `4px ${vars.space.sm}`,
    borderBottom: `1px solid ${vars.color.border}`,
    flexShrink: 0,
});

export const catSelect = style({
    fontFamily: vars.font.body,
    fontSize: '0.7rem',
    color: vars.color.foreground,
    background: vars.color.inset,
    border: `1px solid ${vars.color.border}`,
    borderRadius: vars.radius.sm,
    padding: '2px 6px',
    outline: 'none',
    ':focus': { borderColor: vars.color.accent },
});

export const hint = style({
    fontSize: '0.6rem',
    color: vars.color.mutedForeground,
});

export const gridBox = style({
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))',
    gap: '3px',
    padding: vars.space.sm,
    alignContent: 'start',
});

export const tile = style({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '1px',
    padding: '5px 6px',
    border: 'none',
    borderRadius: vars.radius.sm,
    cursor: 'pointer',
    textAlign: 'left',
    color: '#fff',
    transition: 'transform 0.08s',
    ':hover': { transform: 'scale(1.04)' },
});

export const tileCode = style({
    fontFamily: vars.font.mono,
    fontSize: '0.7rem',
    fontWeight: 700,
});

export const tileName = style({
    fontFamily: vars.font.body,
    fontSize: '0.58rem',
    opacity: 0.85,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '100%',
});

export const tilePct = style({
    fontFamily: vars.font.mono,
    fontSize: '0.64rem',
    fontWeight: 600,
});
