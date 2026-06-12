// src/components/assistant-panel.css.ts

import { style } from '@vanilla-extract/css';
import { vars } from '../theme.css';

export const wrap = style({
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
});

export const setup = style({
    display: 'flex',
    flexDirection: 'column',
    gap: vars.space.sm,
    padding: vars.space.lg,
});

export const setupTitle = style({
    fontFamily: vars.font.display,
    fontSize: '0.86rem',
    fontWeight: 700,
});

export const setupHint = style({
    fontSize: '0.7rem',
    color: vars.color.mutedForeground,
    lineHeight: 1.6,
});

export const keyInput = style({
    fontFamily: vars.font.mono,
    fontSize: '0.74rem',
    color: vars.color.foreground,
    background: vars.color.inset,
    border: `1px solid ${vars.color.border}`,
    borderRadius: vars.radius.sm,
    padding: '6px 10px',
    outline: 'none',
    ':focus': { borderColor: vars.color.accent },
});

export const messages = style({
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: vars.space.sm,
    padding: vars.space.sm,
});

export const emptyHint = style({
    fontSize: '0.7rem',
    color: vars.color.mutedForeground,
    lineHeight: 1.8,
    padding: vars.space.md,
});

const msgBase = style({
    maxWidth: '88%',
    fontSize: '0.74rem',
    lineHeight: 1.6,
    padding: `6px 10px`,
    borderRadius: vars.radius.md,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
});

export const userMsg = style([
    msgBase,
    {
        alignSelf: 'flex-end',
        background: vars.color.accentDim,
        color: vars.color.foreground,
        border: `1px solid ${vars.color.accent}`,
    },
]);

export const aiMsg = style([
    msgBase,
    {
        alignSelf: 'flex-start',
        background: vars.color.inset,
        border: `1px solid ${vars.color.border}`,
        color: vars.color.foreground,
    },
]);

export const proposalCard = style({
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginTop: '6px',
    padding: vars.space.sm,
    background: vars.color.panelRaised,
    border: `1px solid ${vars.color.amber}`,
    borderRadius: vars.radius.sm,
});

export const proposalTitle = style({
    fontFamily: vars.font.display,
    fontSize: '0.64rem',
    fontWeight: 700,
    color: vars.color.amber,
});

export const proposalBody = style({
    fontFamily: vars.font.mono,
    fontSize: '0.74rem',
    fontWeight: 600,
});

export const proposalReason = style({
    fontFamily: vars.font.body,
    fontSize: '0.66rem',
    fontWeight: 400,
    color: vars.color.mutedForeground,
});

export const proposalBtns = style({
    display: 'flex',
    gap: vars.space.sm,
});

export const confirmBtn = style({
    flex: 1,
    fontFamily: vars.font.display,
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#fff',
    background: vars.color.up,
    border: 'none',
    borderRadius: vars.radius.sm,
    padding: '5px 0',
    cursor: 'pointer',
});

export const rejectBtn = style({
    flex: 1,
    fontFamily: vars.font.display,
    fontSize: '0.7rem',
    color: vars.color.mutedForeground,
    background: 'transparent',
    border: `1px solid ${vars.color.border}`,
    borderRadius: vars.radius.sm,
    padding: '5px 0',
    cursor: 'pointer',
    ':hover': { color: vars.color.foreground },
});

export const proposalDone = style({
    fontSize: '0.7rem',
    fontWeight: 600,
    color: vars.color.mutedForeground,
});

export const inputRow = style({
    display: 'flex',
    gap: vars.space.xs,
    padding: vars.space.sm,
    borderTop: `1px solid ${vars.color.border}`,
    flexShrink: 0,
});

export const chatInput = style({
    flex: 1,
    minWidth: 0,
    fontFamily: vars.font.body,
    fontSize: '0.74rem',
    color: vars.color.foreground,
    background: vars.color.inset,
    border: `1px solid ${vars.color.border}`,
    borderRadius: vars.radius.sm,
    padding: '5px 10px',
    outline: 'none',
    ':focus': { borderColor: vars.color.accent },
});

export const sendBtn = style({
    fontFamily: vars.font.display,
    fontSize: '0.7rem',
    fontWeight: 600,
    color: vars.color.accent,
    background: vars.color.accentDim,
    border: `1px solid ${vars.color.accent}`,
    borderRadius: vars.radius.sm,
    padding: '5px 14px',
    cursor: 'pointer',
    ':disabled': { opacity: 0.5, cursor: 'not-allowed' },
});

export const disclaimer = style({
    padding: `2px ${vars.space.sm} 4px`,
    fontSize: '0.58rem',
    color: vars.color.mutedForeground,
    textAlign: 'center',
    flexShrink: 0,
});
