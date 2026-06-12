# scripts/capture-landing-shots2.py — pass 2: hero with sparkline layout,
# heatmap with settled data, payoff with simulated straddle, agent tasks tab.
# Run: uv run --python 3.12 --with playwright==1.52.0 python scripts/capture-landing-shots2.py

import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent.parent / "docs" / "shots-raw"
OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://localhost:5173"

WS = {
    "blocks": [
        {"id": "watchlist-0", "type": "watchlist", "pin": None},
        {"id": "movers-0", "type": "movers", "pin": None},
        {"id": "chart-0", "type": "chart", "pin": None},
        {"id": "dock-0", "type": "dock", "pin": None},
        {"id": "depth-0", "type": "depth", "pin": None},
        {"id": "ticket-0", "type": "ticket", "pin": None},
        {"id": "tape-0", "type": "tape", "pin": None},
        {"id": "heatmap-1", "type": "heatmap", "pin": None},
        {"id": "optpnl-1", "type": "optpnl", "pin": None},
        {"id": "assistant-1", "type": "assistant", "pin": None},
    ],
    "layout": [
        {"i": "watchlist-0", "x": 0, "y": 0, "w": 4, "h": 14, "minW": 3, "minH": 6},
        {"i": "movers-0", "x": 0, "y": 14, "w": 4, "h": 11, "minW": 3, "minH": 5},
        {"i": "chart-0", "x": 4, "y": 0, "w": 15, "h": 16, "minW": 6, "minH": 7},
        {"i": "dock-0", "x": 4, "y": 16, "w": 15, "h": 9, "minW": 6, "minH": 5},
        {"i": "depth-0", "x": 19, "y": 0, "w": 5, "h": 8, "minW": 4, "minH": 7},
        {"i": "ticket-0", "x": 19, "y": 8, "w": 5, "h": 11, "minW": 4, "minH": 10},
        {"i": "tape-0", "x": 19, "y": 19, "w": 5, "h": 6, "minW": 3, "minH": 4},
        {"i": "heatmap-1", "x": 0, "y": 25, "w": 10, "h": 12, "minW": 5, "minH": 6},
        {"i": "optpnl-1", "x": 10, "y": 25, "w": 8, "h": 13, "minW": 6, "minH": 9},
        {"i": "assistant-1", "x": 0, "y": 38, "w": 7, "h": 14, "minW": 5, "minH": 9},
    ],
}

CLIMB_JS = """
(el) => {
  let n = el;
  while (n && n.parentElement) {
    const r = n.getBoundingClientRect();
    if (r.height > 260 && r.width > 300) return n;
    n = n.parentElement;
  }
  return el;
}
"""


def panel_shot(page, title, fname, settle=1.5):
    loc = page.get_by_text(title, exact=False).first
    handle = loc.element_handle()
    root = handle.evaluate_handle(CLIMB_JS)
    el = root.as_element()
    el.scroll_into_view_if_needed()
    time.sleep(settle)
    el.screenshot(path=str(OUT / fname))
    print("saved", fname)


def seed(page, mode):
    page.goto(BASE)
    page.evaluate(
        """([ws, mode]) => {
            localStorage.setItem('sj-pro-workspace-v2', ws);
            localStorage.setItem('sj-pro-watchlist-spark', '1');
            localStorage.setItem('sj-pro-theme', JSON.stringify({mode, convention:'tw', fontScale:1}));
        }""",
        [json.dumps(WS), mode],
    )
    page.reload()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(
            viewport={"width": 1600, "height": 1000},
            device_scale_factor=2,
            color_scheme="dark",
            locale="zh-TW",
            timezone_id="Asia/Taipei",
        )
        page = ctx.new_page()
        seed(page, "dark")
        print("waiting for live data...")
        time.sleep(18)
        page.screenshot(path=str(OUT / "terminal-dark.png"))
        print("saved terminal-dark.png")

        # heatmap — wait until percentages settle to non-zero
        hm = page.get_by_text("類股熱力圖", exact=False).first
        hm.scroll_into_view_if_needed()
        for i in range(12):
            body = page.evaluate("document.body.innerText")
            import re

            pcts = re.findall(r"[+-]\d+\.\d%", body)
            nonzero = [s for s in pcts if not s.startswith(("+0.0", "-0.0"))]
            if len(nonzero) > 5:
                break
            time.sleep(5)
        panel_shot(page, "類股熱力圖", "heatmap.png", settle=2)

        # payoff — simulated long straddle near TXF spot
        try:
            sel = page.locator("select").filter(has_text="Call").last
            strike = page.get_by_placeholder("履約價")
            prem = page.get_by_placeholder("權利金")
            add = page.get_by_role("button", name="＋模擬")
            strike.fill("44300")
            prem.fill("350")
            add.click()
            time.sleep(0.5)
            sel.select_option("P")
            strike.fill("44300")
            prem.fill("330")
            add.click()
            time.sleep(1.5)
            panel_shot(page, "選擇權損益圖", "payoff.png", settle=2)
        except Exception as e:
            print("payoff failed:", e)

        # agent tasks tab
        try:
            agent = page.get_by_text("AI Agent", exact=False).first
            agent.scroll_into_view_if_needed()
            page.get_by_role("button", name="任務", exact=True).click()
            time.sleep(0.8)
            panel_shot(page, "AI Agent", "agent-tasks.png")
        except Exception as e:
            print("agent tasks failed:", e)

        ctx.close()

        # light theme hero
        ctx2 = browser.new_context(
            viewport={"width": 1600, "height": 1000},
            device_scale_factor=2,
            color_scheme="light",
            locale="zh-TW",
            timezone_id="Asia/Taipei",
        )
        page2 = ctx2.new_page()
        seed(page2, "light")
        time.sleep(16)
        page2.screenshot(path=str(OUT / "terminal-light.png"))
        print("saved terminal-light.png")
        ctx2.close()
        browser.close()


if __name__ == "__main__":
    sys.exit(main())
