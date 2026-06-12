# scripts/capture-landing-shots.py — capture landing-page screenshots from the
# live dev app (localhost:5173 + sim server :8080) with Playwright.
# Run: uv run --with playwright python3 scripts/capture-landing-shots.py

import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent.parent / "docs" / "shots-raw"
OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://localhost:5173"

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


def panel_shot(page, title, fname, settle=2.0):
    """Element-screenshot the panel whose header contains `title`."""
    # panel headers may append the linked symbol (e.g. 閃電下單 · TXFR1)
    loc = page.get_by_text(title, exact=False).first
    handle = loc.element_handle()
    root = handle.evaluate_handle(CLIMB_JS)
    time.sleep(settle)
    root.as_element().screenshot(path=str(OUT / fname))
    print("saved", fname)


def add_panel(page, name):
    page.get_by_role("button", name="＋ 新增面板").click()
    time.sleep(0.4)
    # menu item may carry （已存在） suffix
    btn = page.locator("button", has_text=name).last
    btn.click()
    time.sleep(0.8)


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
        page.goto(BASE)
        print("waiting for live data...")
        time.sleep(16)

        # 1. hero — default dark terminal
        page.screenshot(path=str(OUT / "terminal-dark.png"))
        print("saved terminal-dark.png")

        # link TXFR1 so flash/orders target futures
        try:
            page.get_by_text("TXFR1", exact=True).first.click()
            time.sleep(2)
        except Exception as e:
            print("link TXFR1 failed:", e)

        # 2. AI Agent panel — skills tab then settings
        try:
            add_panel(page, "AI Agent")
            time.sleep(1)
            page.get_by_role("button", name="技能", exact=True).click()
            time.sleep(0.6)
            panel_shot(page, "AI Agent", "agent-skills.png")
            page.get_by_role("button", name="設定", exact=True).click()
            time.sleep(0.6)
            panel_shot(page, "AI Agent", "agent-settings.png")
            page.get_by_role("button", name="對話", exact=True).click()
            time.sleep(0.6)
            panel_shot(page, "AI Agent", "agent-chat.png")
        except Exception as e:
            print("agent shots failed:", e)

        # 3. flash order ladder
        try:
            add_panel(page, "閃電下單")
            time.sleep(1)
            en = page.get_by_role("button", name="啟用閃電下單")
            if en.count() > 0:
                en.first.click()
                time.sleep(2)
            panel_shot(page, "閃電下單", "flash.png", settle=3)
        except Exception as e:
            print("flash shot failed:", e)

        # 4. grid orders (鋪單)
        try:
            add_panel(page, "鋪單")
            time.sleep(1)
            panel_shot(page, "鋪單", "grid.png")
        except Exception as e:
            print("grid shot failed:", e)

        # 5. sector heatmap
        try:
            add_panel(page, "類股熱力圖")
            time.sleep(4)
            panel_shot(page, "類股熱力圖", "heatmap.png")
        except Exception as e:
            print("heatmap shot failed:", e)

        # 6. option payoff
        try:
            add_panel(page, "選擇權損益圖")
            time.sleep(2)
            panel_shot(page, "選擇權損益圖", "payoff.png")
        except Exception as e:
            print("payoff shot failed:", e)

        # full layout with extras
        page.screenshot(path=str(OUT / "terminal-extras.png"))

        ctx.close()

        # 7. light theme — fresh context
        ctx2 = browser.new_context(
            viewport={"width": 1600, "height": 1000},
            device_scale_factor=2,
            color_scheme="light",
            locale="zh-TW",
            timezone_id="Asia/Taipei",
        )
        page2 = ctx2.new_page()
        page2.goto(BASE)
        page2.evaluate(
            "localStorage.setItem('sj-pro-theme', JSON.stringify({mode:'light',convention:'tw',fontScale:1}))"
        )
        page2.reload()
        time.sleep(14)
        page2.screenshot(path=str(OUT / "terminal-light.png"))
        print("saved terminal-light.png")
        ctx2.close()
        browser.close()


if __name__ == "__main__":
    sys.exit(main())
