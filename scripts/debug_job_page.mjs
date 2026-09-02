import { chromium } from "playwright";
import { execSync } from "node:child_process";

function getCdpUrl() {
  const out = execSync("python3 scripts/qa-chrome.py check --profile job-apply", { encoding: "utf-8" });
  const data = JSON.parse(out);
  return data.cdpUrl;
}

async function main() {
  const cdpUrl = getCdpUrl();
  const browser = await chromium.connectOverCDP(cdpUrl, { noDefaults: true });
  const context = browser.contexts()[0];
  const page = await context.newPage(); // create new tab to prevent disruption

  const testJobUrl = "https://www.naukri.com/job-listings-senior-data-scientist-ventures-hrd-centre-bengaluru-6-to-8-years-070826916626?src=directSearch";
  console.log("Navigating to:", testJobUrl);
  await page.goto(testJobUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);

  // Scroll
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(1000);

  // List all buttons, anchors, and elements that have text "Apply" or "Quick"
  const elements = await page.evaluate(() => {
    const list = [];
    const elements = Array.from(document.querySelectorAll("button, a, div, span"));
    for (const el of elements) {
      const text = (el.innerText || "").trim().toLowerCase();
      if ((text === "apply" || text === "quick apply" || text.includes("apply") || text.includes("apply on company")) && text.length < 30) {
        list.push({
          tagName: el.tagName,
          className: el.className,
          id: el.id,
          text: el.innerText.trim(),
          html: el.outerHTML.slice(0, 200)
        });
      }
    }
    return list;
  });

  console.log("Found matches:");
  console.log(JSON.stringify(elements.slice(0, 30), null, 2));

  await page.close();
  await browser.close();
}

main().catch(console.error);
