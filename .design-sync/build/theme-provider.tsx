// Preview wrapper: applies the design system's theme class (which defines the
// `--*` token custom properties) plus a themed frame, so every preview card
// renders with the real Shioaji Pro tokens/fonts. cfg.provider points here.

import type { ReactNode } from 'react';
import { themeClasses, vars } from '@/theme.css';

export function DSThemeProvider({ children }: { children?: ReactNode }) {
    return (
        <div
            className={themeClasses['dark-tw']}
            style={{
                background: vars.color.background,
                color: vars.color.foreground,
                fontFamily: vars.font.body,
                padding: '16px',
                borderRadius: '8px',
                minWidth: 'fit-content',
            }}
        >
            {children}
        </div>
    );
}
