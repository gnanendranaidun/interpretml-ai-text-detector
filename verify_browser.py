"""Exercise slide controls against a server running from the repository root."""

import argparse

from playwright.sync_api import expect, sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audit", action="store_true")
    args = parser.parse_args()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge")
        page = browser.new_page(viewport={"width": 390, "height": 844})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto("http://127.0.0.1:8765/")
        active = page.locator(".page.active")
        expect(page.locator("#chapter")).to_have_text("01 / 15")
        for count in (13, 12):
            page.keyboard.press("ArrowRight")
            expect(active.locator("details a")).to_have_count(count)
            active.locator("summary").first.click()
            expect(active.locator("details a").first).to_be_visible()
        page.locator("#nextBtn").click()
        expect(active.locator("#featureChart .bar-row")).to_have_count(8)
        expect(active.locator("#featureChart .bar-row").first).to_contain_text("avg_word_len")
        page.locator("#nextBtn").click()
        heatmap = active.get_by_role("img", name="Pearson correlation heatmap for eight stylometric inputs")
        expect(heatmap).to_be_visible()
        heatmap.evaluate("(img) => img.decode()")
        expect(active.locator("figcaption")).to_contain_text("500 RAID rows")
        page.locator("#nextBtn").click()
        active.locator("select").select_option("2")
        active.locator("circle").first.focus()
        expect(active.get_by_role("status")).to_contain_text("%")
        expect(active.locator(".pdp-chart input")).to_have_count(0)
        page.locator("#nextBtn").click()
        page.locator("#nextBtn").click()
        active.locator("select").select_option("2")
        expect(active.locator(".bar-row")).to_have_count(8)
        expect(active.locator(".graph-note")).to_contain_text("Mixed")
        page.locator("#nextBtn").click()
        expect(active.locator("select")).to_have_value("2")
        page.locator("#nextBtn").click()
        active.locator("select").last.select_option("avg_word_len")
        expect(active.locator("tbody tr")).to_have_count(4)
        if args.audit:
            for _ in range(3):
                page.locator("#nextBtn").click()
            expect(active.get_by_text("Brier score")).to_be_visible()
            slider = active.locator('input[type="range"]')
            slider.fill("50")
            expect(active.locator('p[role="status"]')).to_contain_text("2296 false positives")
            slider.fill("100")
            expect(active.locator('p[role="status"]')).to_contain_text("0 false positives")
            page.locator("#nextBtn").click()
            active.get_by_text("false negatives", exact=False).first.click()
            expect(active.get_by_text("Average length", exact=False).last).to_be_visible()
            page.locator("#nextBtn").click()
            active.locator(".slice-field").select_option("domain")
            active.locator(".slice-first").select_option("news")
            active.locator(".slice-second").select_option("poetry")
            expect(active.locator("th")).to_have_text(["Feature", "news", "poetry"])
            print("Calibration, threshold controls, errors, and slice filters passed in Edge.")
        assert not errors, errors
        print("Literature, PDP controls, four-case attribution, and perturbations passed in Edge.")
        browser.close()


if __name__ == "__main__":
    main()
