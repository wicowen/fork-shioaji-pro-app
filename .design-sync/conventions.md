# Shioaji Pro — Taiwan trading-terminal components

Real panels from a Taiwan futures/options day-trading terminal: live quote
boards, 5-level order books, aggressive order-flow (盤口力道), book depth
heatmaps, volume profiles, option payoff, realized P&L, sector heatmaps, and
stock chips. Use them to compose dark, dense, numeric trading dashboards.

## Wrapping (required)

Wrap every screen — or each component — in `<DSThemeProvider>`. It applies the
`dark-tw` theme class that defines all design tokens as CSS custom properties
and sets the dark background + Inter / JetBrains Mono fonts. **Without it the
components render with unresolved tokens (effectively unstyled).**

```jsx
<DSThemeProvider>
  <QuoteBoard contract={{ code: 'TXFR1', name: '臺指期近月', reference: 23100, limit_up: 25410, limit_down: 20790 }} />
  <DepthLadder code="TMFR1" />
  <OrderFlow contract={{ code: 'TMFR1', security_type: 'FUT' }} />
</DSThemeProvider>
```

## Taiwan up/down color convention (critical)

This DS uses the **tw** convention: **RED = up / gain, GREEN = down / loss**
(the opposite of US markets). It is baked into the tokens (`up` = red, `down`
= green) and every component. Any up/down coloring you add yourself MUST follow
it, or the dashboard will read backwards to a Taiwan trader.

## Styling idiom

Tokens are applied through the theme class — there are **no utility classes**.
For your own layout glue around these components, match the `dark-tw` palette:

| Role | Value | Role | Value |
|---|---|---|---|
| background | `#0e1116` | foreground | `#dde3ee` |
| panel | `#141922` | muted text | `#8b94a7` |
| panel raised | `#181f2a` | border | `#222b37` |
| accent (blue) | `#3d8bff` | amber | `#e0a43c` |
| up / gain (RED) | `#f23645` | down / loss (GREEN) | `#16b389` |

Spacing `0.25 / 0.5 / 1 / 1.5 / 2rem`, radius `0.25 / 0.375 / 0.5rem`. Fonts:
**Inter** for UI text, **JetBrains Mono** for every price / number (tabular).

## Data

Each component renders with representative built-in market data — props select
the **instrument / scenario**, not a live feed. `code` / `contract` pick the
symbol (`"TMFR1"` micro-TAIEX futures, `"MXFR1"` mini, `"2330"` TSMC stock),
`positions` feeds the option payoff. Compose them as ready-made panels; you do
not wire data sources. `ChipsCard` is stocks-only.

## Where the truth lives

Read each component's `.d.ts` (exact props) and `.prompt.md` (usage) under
`components/`, and the compiled tokens/fonts in `styles.css`, before composing.
