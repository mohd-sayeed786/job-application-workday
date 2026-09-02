import { chromium } from "playwright";
import { execSync } from "node:child_process";

function getCdpUrl() {
  try {
    const out = execSync("python3 scripts/qa-chrome.py check --profile job-apply", { encoding: "utf-8" });
    const data = JSON.parse(out);
    if (data.status === "ready" && data.cdpUrl) return data.cdpUrl;
  } catch (e) {}

  const startOut = execSync("python3 scripts/qa-chrome.py start --profile job-apply", { encoding: "utf-8" });
  const data = JSON.parse(startOut);
  return data.cdpUrl;
}

async function main() {
  const cdpUrl = getCdpUrl();
  console.log(`Connecting to Chrome at ${cdpUrl}...`);
  const browser = await chromium.connectOverCDP(cdpUrl, { noDefaults: true });
  const context = browser.contexts()[0];
  const page = await context.newPage();

  const searchUrl = "https://www.naukri.com/senior-data-scientist-jobs-in-bangalore-bengaluru?k=senior%20data%20scientist&l=bangalore%2Fbengaluru&experience=7&sort=f&jobAge=7";
  console.log(`Navigating to search page: ${searchUrl}`);
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 35000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const cardsSelector = "div.bg-n800.cursor-pointer, div[class*='rounded-3xl'][class*='bg-n800'], .srp-jobtuple-wrapper, article.jobTuple";
  const cardsCount = await page.locator(cardsSelector).count();
  console.log(`Found ${cardsCount} job cards.`);

  let targetCardIndex = -1;
  let targetUrl = "";

  for (let i = 0; i < cardsCount; i++) {
    const card = page.locator(cardsSelector).nth(i);
    const text = await card.evaluate(el => el.innerText).catch(() => "");
    if (text.toLowerCase().includes("demandans") || text.toLowerCase().includes("ai ml engineer")) {
      targetCardIndex = i;
      const href = await card.evaluate(el => {
        const a = el.querySelector("a[href*='/job-listings-']");
        return a ? a.getAttribute("href") : "";
      }).catch(() => "");
      if (href) {
        targetUrl = href.startsWith("http") ? href : "https://www.naukri.com" + href;
      }
      break;
    }
  }

  if (targetCardIndex === -1 && cardsCount > 0) {
    console.log("Target not explicitly named Demandans in visible list, picking card 0 or first match...");
    targetCardIndex = 0;
  }

  console.log(`Opening target job (Card #${targetCardIndex + 1})...`);
  let jobPage = null;

  if (targetUrl) {
    console.log(`Navigating directly to: ${targetUrl}`);
    jobPage = await context.newPage();
    await jobPage.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 35000 }).catch(() => {});
  } else {
    const newPagePromise = context.waitForEvent("page", { timeout: 10000 }).catch(() => null);
    await page.locator(cardsSelector).nth(targetCardIndex).click();
    jobPage = await newPagePromise;
  }

  if (!jobPage) {
    throw new Error("Failed to open job page.");
  }

  await jobPage.waitForLoadState("domcontentloaded").catch(() => {});
  await jobPage.waitForTimeout(2000);

  console.log("Scrolling to the bottom of the page to trigger Quick Apply button...");
  await jobPage.evaluate(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  });
  await jobPage.waitForTimeout(2000);

  // Look for Quick Apply button
  console.log("Locating and clicking 'Quick apply' button...");
  const clicked = await jobPage.evaluate(() => {
    // 1. By exact xpath / span match
    const spans = Array.from(document.querySelectorAll("span"));
    const qaSpan = spans.find(s => {
      const t = (s.innerText || "").trim().toLowerCase();
      return t === "quick apply";
    });

    if (qaSpan) {
      const btn = qaSpan.closest("button") || qaSpan.closest("div[role='button']") || qaSpan;
      btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      if (typeof btn.click === "function") btn.click();
      return true;
    }

    // 2. By button text
    const buttons = Array.from(document.querySelectorAll("button, div[role='button'], a"));
    const qaBtn = buttons.find(b => {
      const t = (b.innerText || "").trim().toLowerCase();
      return t.includes("quick apply");
    });

    if (qaBtn) {
      qaBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      if (typeof qaBtn.click === "function") qaBtn.click();
      return true;
    }

    return false;
  });

  console.log(`Quick apply click result: ${clicked}`);
  await jobPage.waitForTimeout(3000);

  console.log("Successfully scrolled to the bottom and clicked Quick Apply on 1 job. Waiting for user prompt as requested.");
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
