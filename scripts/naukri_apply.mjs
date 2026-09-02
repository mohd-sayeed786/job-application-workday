import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

/**
 * Script to automatically search and apply to jobs on Naukri.com.
 * STRICT MODE:
 * - Uses direct CDP WebSocket connection to avoid Playwright browser context management errors.
 * - Opens job panel / recommendedjobs, clicks job to open dedicated job listing page.
 * - Smoothly scrolls to the end of the page.
 * - Clicks 'Quick apply' (<span class="flex items-center gap-2.5">Quick apply</span>).
 * - Immediately disconnects and terminates once complete.
 */

function getCdpUrl() {
  try {
    const out = execSync("python3 scripts/qa-chrome.py check --profile job-apply", { encoding: "utf-8" });
    const data = JSON.parse(out);
    if (data.status === "ready" && data.cdpUrl) return data.cdpUrl;
  } catch (e) {}

  try {
    const startOut = execSync("python3 scripts/qa-chrome.py start --profile job-apply", { encoding: "utf-8" });
    const data = JSON.parse(startOut);
    return data.cdpUrl;
  } catch (e) {
    throw new Error("Failed to get CDP URL: " + e.message);
  }
}

class CdpConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.reqId = 1;
    this.pending = new Map();
    this.events = [];
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id)(msg);
        this.pending.delete(msg.id);
      } else if (msg.method) {
        this.events.push(msg);
      }
    };
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }

  send(method, params = {}, sessionId = undefined) {
    return new Promise((resolve) => {
      const id = this.reqId++;
      this.pending.set(id, resolve);
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }

  close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
    }
  }
}

async function main() {
  const cdpBase = getCdpUrl();
  console.log(`Checking CDP info at ${cdpBase}...`);
  const verRes = await fetch(`${cdpBase}/json/version`);
  const verData = await verRes.json();
  const browserWsUrl = verData.webSocketDebuggerUrl;

  console.log(`Connecting to CDP Browser WebSocket: ${browserWsUrl}...`);
  const cdp = new CdpConnection(browserWsUrl);
  await cdp.connect();

  await cdp.send("Target.setDiscoverTargets", { discover: true });
  await new Promise(r => setTimeout(r, 600));

  let targetsRes = await cdp.send("Target.getTargets");
  let targets = targetsRes?.result?.targetInfos || [];
  console.log(`Found ${targets.length} targets.`);

  let recTarget = targets.find(t => t.type === "page" && t.url.includes("recommendedjobs"));
  if (!recTarget) {
    console.log("Creating new target for recommendedjobs...");
    const createRes = await cdp.send("Target.createTarget", { url: "https://www.naukri.com/mnjuser/recommendedjobs" });
    const newTargetId = createRes?.result?.targetId;
    recTarget = { targetId: newTargetId, url: "https://www.naukri.com/mnjuser/recommendedjobs" };
    await new Promise(r => setTimeout(r, 3500));
  }

  console.log(`Attaching to recommendedjobs target: ${recTarget.targetId}`);
  await cdp.send("Target.activateTarget", { targetId: recTarget.targetId });
  const recAttach = await cdp.send("Target.attachToTarget", { targetId: recTarget.targetId, flatten: true });
  const recSessionId = recAttach.result.sessionId;

  await cdp.send("Runtime.enable", {}, recSessionId);
  await cdp.send("DOM.enable", {}, recSessionId);
  await cdp.send("Page.enable", {}, recSessionId);

  // Wait for jobs container to be available
  await new Promise(r => setTimeout(r, 2000));

  // Step 1: Open the first job
  console.log("Step 1: Locating and clicking on the first job card...");
  const coordsRes = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const scrollableDiv = document.getElementById("scrollableDiv");
      if (scrollableDiv) scrollableDiv.scrollTop = 0;
      
      const cards = scrollableDiv ? Array.from(scrollableDiv.children) : Array.from(document.querySelectorAll("div[class*='cursor-pointer']"));
      if (cards.length === 0) return null;
      
      // Look for first job
      const firstCard = cards[0];
      const titleEl = firstCard.querySelector(".text-title18Sb, h2, h3, [class*='title']") || firstCard;
      const rect = titleEl.getBoundingClientRect();
      return {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        title: titleEl.innerText.slice(0, 80).replace(/\\n/g, " ")
      };
    })()`,
    returnByValue: true
  }, recSessionId);

  const cardInfo = coordsRes?.result?.result?.value;
  console.log("Target job card info:", cardInfo);

  if (cardInfo && cardInfo.x && cardInfo.y) {
    // Click through CDP Input event
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: cardInfo.x,
      y: cardInfo.y,
      button: "left",
      clickCount: 1
    }, recSessionId);
    await new Promise(r => setTimeout(r, 100));
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: cardInfo.x,
      y: cardInfo.y,
      button: "left",
      clickCount: 1
    }, recSessionId);
  }

  // Wait for the job listing page to open
  console.log("Waiting for job page to open...");
  await new Promise(r => setTimeout(r, 4000));

  // Detect newly opened job page target
  targetsRes = await cdp.send("Target.getTargets");
  targets = targetsRes?.result?.targetInfos || [];
  const jobTarget = targets.find(t => t.type === "page" && t.url.includes("job-listings-"));

  if (!jobTarget) {
    console.error("Job page target not opened. Check page structure.");
    cdp.close();
    process.exit(1);
  }

  console.log(`Found job page target: ${jobTarget.targetId} (${jobTarget.url})`);
  await cdp.send("Target.activateTarget", { targetId: jobTarget.targetId });

  const jobAttach = await cdp.send("Target.attachToTarget", { targetId: jobTarget.targetId, flatten: true });
  const jobSessionId = jobAttach.result.sessionId;

  await cdp.send("Runtime.enable", {}, jobSessionId);
  await cdp.send("Page.enable", {}, jobSessionId);
  await cdp.send("DOM.enable", {}, jobSessionId);

  // Wait for full job page render
  await new Promise(r => setTimeout(r, 3000));

  // Step 2: Scroll till end of job page
  console.log("Step 2: Scrolling job page till end...");
  const scrollOutcome = await cdp.send("Runtime.evaluate", {
    expression: `(async () => {
      const totalH = document.body.scrollHeight;
      for (let step = 1; step <= 20; step++) {
        window.scrollTo({ top: (totalH * step) / 20, behavior: "smooth" });
        await new Promise(r => setTimeout(r, 120));
      }
      window.scrollTo(0, document.body.scrollHeight);
      return { totalH, finalY: window.scrollY };
    })()`,
    awaitPromise: true,
    returnByValue: true
  }, jobSessionId);
  console.log("Scroll outcome:", scrollOutcome?.result?.result?.value);

  // Send additional wheel scrolls to bottom
  for (let i = 0; i < 6; i++) {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: 500,
      y: 500,
      deltaX: 0,
      deltaY: 800
    }, jobSessionId);
    await new Promise(r => setTimeout(r, 150));
  }
  await new Promise(r => setTimeout(r, 2000));

  // Step 3: Click on Quick apply
  console.log("Step 3: Clicking on Quick apply...");
  const applyOutcome = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      // 1. Check exact user XPath
      const xpath = "/html/body/div[4]/div/div/div/div[1]/div[6]/div/div/div/button/span/span[1]/span";
      const xres = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      if (xres && xres.singleNodeValue) {
        const el = xres.singleNodeValue;
        el.click();
        const btn = el.closest("button");
        if (btn) btn.click();
        return { success: true, method: "xpath", html: el.outerHTML.slice(0, 120) };
      }

      // 2. Class match for Quick apply span
      const spans = Array.from(document.querySelectorAll("span.flex.items-center.gap-2\\\\.5, span, button"));
      for (const s of spans) {
        if (s.textContent && s.textContent.trim().toLowerCase() === "quick apply") {
          s.click();
          const btn = s.closest("button");
          if (btn) btn.click();
          return { success: true, method: "text_match", html: s.outerHTML.slice(0, 120) };
        }
      }

      return { success: false, message: "Quick apply not found" };
    })()`,
    returnByValue: true
  }, jobSessionId);

  console.log("Apply outcome:", applyOutcome?.result?.result?.value);

  await new Promise(r => setTimeout(r, 2500));
  console.log("Job apply task complete. Closing connection and stopping immediately.");
  cdp.close();
  process.exit(0);
}

main().catch(err => {
  console.error("Execution error:", err);
  process.exit(1);
});
