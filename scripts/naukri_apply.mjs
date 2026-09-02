import { execSync } from "node:child_process";

function getCdpUrl() {
  try {
    const out = execSync("python3 scripts/qa-chrome.py check --profile job-apply", { encoding: "utf-8" });
    const data = JSON.parse(out);
    if (data.status === "ready" && data.cdpUrl) return data.cdpUrl;
  } catch (e) {}

  const startOut = execSync("python3 scripts/qa-chrome.py start --profile job-apply", { encoding: "utf-8" });
  return JSON.parse(startOut).cdpUrl;
}

class CdpConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.reqId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id)(msg);
        this.pending.delete(msg.id);
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

function answerQuestion(qText) {
  const q = (qText || "").toLowerCase();

  // Notice period / joining
  if (q.includes("last working day") || q.includes("notice period") || q.includes("notice") || q.includes("np") || q.includes("joiner") || q.includes("joining")) {
    return "30 days";
  }

  // Work model / comfortable / relocate / shift
  if (q.includes("comfortable") || q.includes("hybrid") || q.includes("agree") || q.includes("relocate") || q.includes("shift") || q.includes("willing")) {
    return "Yes";
  }

  // Current CTC
  if (q.includes("current ctc") || q.includes("current salary") || q.includes("present ctc") || q.includes("current package") || q.includes("fixed ctc")) {
    return "36.7";
  }

  // Expected CTC
  if (q.includes("expected ctc") || q.includes("expected salary") || q.includes("ectc") || q.includes("expected package")) {
    return "55";
  }

  // Experience queries (User rule: always >= 7, 7-8, 7-9, 7+, NEVER <7)
  if (q.includes("experience") || q.includes("exp") || q.includes("years") || q.includes("how many years")) {
    return "7";
  }

  // Education
  if (q.includes("10th")) return "2012";
  if (q.includes("12th")) return "2014";
  if (q.includes("degree") || q.includes("graduation") || q.includes("master") || q.includes("qualification")) {
    return "MSc Computer Science";
  }

  // Location
  if (q.includes("location") || q.includes("city")) return "Bengaluru";

  // Skills
  if (q.includes("python") || q.includes("machine learning") || q.includes("ai") || q.includes("sql") || q.includes("aws")) {
    return "Yes";
  }

  return "Yes";
}

async function handleChatbotDrawer(cdp, sessionId) {
  console.log("Monitoring and answering chatbot screening questions...");
  let rounds = 0;
  const maxRounds = 20;

  while (rounds < maxRounds) {
    rounds++;
    await new Promise((r) => setTimeout(r, 2000));

    const stateRes = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const bodyText = document.body.innerText || "";
        const isFinished = bodyText.includes("Thank you for your responses") ||
                           bodyText.includes("Your profile has been shared") ||
                           bodyText.includes("Your response has been recorded") ||
                           bodyText.includes("Application sent") ||
                           bodyText.includes("Applied");

        const container = document.getElementById("desktopChatBotContainer") || 
                          document.querySelector(".chatbot_Drawer, .chatContainer, [class*='chatBot'], [class*='chatbot'], [class*='drawer']") || 
                          document.body;

        const lines = (container.innerText || bodyText).split("\n").map(s => s.trim()).filter(Boolean);
        const saveIdx = lines.lastIndexOf("Save");
        let latestQuestion = "";
        if (saveIdx > 0) {
          latestQuestion = lines[saveIdx - 1];
        } else if (lines.length > 0) {
          latestQuestion = lines[lines.length - 1];
        }

        // Query all options / radio buttons
        const optionEls = Array.from(container.querySelectorAll("input[type='radio'], [role='radio'], label.mcc__label, label[class*='radio'], div[class*='radio'], .chipMsg span, .quickReply, .chip, [class*='chip'], [class*='option'], .radio-wrap, .custom-radio, .bot-bubble button"))
          .filter(el => {
            const r = el.getBoundingClientRect();
            const isVisible = r.width > 0 && r.height > 0;
            const t = (el.innerText || el.value || "").trim();
            const isControl = t.toLowerCase() === "save" || t.toLowerCase() === "skip" || t.toLowerCase() === "close" || t.toLowerCase() === "cancel";
            return isVisible && t && !isControl;
          });

        const options = optionEls.map(el => (el.innerText || el.value || "").trim());

        const radioInputs = Array.from(container.querySelectorAll("input[type='radio'], [role='radio']")).filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });

        const inputEl = container.querySelector(".textArea, div.textArea[contenteditable='true'], div[id*='userInput'][contenteditable='true'], textarea, input[type='text']");
        let inputCoords = null;
        if (inputEl) {
          const r = inputEl.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            inputCoords = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }
        }

        const saveEl = container.querySelector(".sendMsg") || 
                       Array.from(container.querySelectorAll("button, div, span")).find(el => (el.innerText || "").trim().toLowerCase() === "save") ||
                       Array.from(document.querySelectorAll("button, div, span")).find(el => (el.innerText || "").trim().toLowerCase() === "save");
        let saveCoords = null;
        if (saveEl) {
          const r = saveEl.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            saveCoords = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }
        }

        return JSON.stringify({
          bodyTextSnippet: bodyText.slice(-400),
          thankYou: bodyText.includes("Thank you for your responses"),
          isFinished,
          latestQuestion,
          options,
          hasRadioInputs: radioInputs.length > 0,
          hasOptions: options.length > 0,
          hasInput: !!inputCoords,
          inputCoords,
          hasSave: !!saveCoords,
          saveCoords
        });
      })()`
    }, sessionId);

    let state;
    try {
      state = JSON.parse(stateRes.result.result.value);
    } catch (e) {
      continue;
    }

    if (state.thankYou) {
      console.log("SUCCESS: Received 'Thank you for your responses.'! Application completed.");
      return true;
    }

    const isRadioEncountered = state.hasOptions || state.hasRadioInputs;

    if (!state.hasInput && !state.hasSave && !isRadioEncountered) {
      if (state.isFinished) {
        console.log("Chat application finished.");
        return true;
      }
      continue;
    }

    console.log(`\n[Round ${rounds}] Prompted question: "${state.latestQuestion}"`);
    const ans = answerQuestion(state.latestQuestion);

    // =========================================================================
    // CRITICAL SKILL REQUIREMENT:
    // "NOTE dont click on text place if readio button is encountered,
    //  if its a text based questions then only click on text box"
    // =========================================================================

    if (isRadioEncountered) {
      console.log(`  [RADIO BUTTON ENCOUNTERED] Options available:`, state.options);
      console.log(`  -> NOTE: Strictly NOT clicking on text box because radio button is present.`);

      const selectResult = await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const container = document.getElementById("desktopChatBotContainer") || 
                            document.querySelector(".chatbot_Drawer, .chatContainer, [class*='chatBot'], [class*='chatbot'], [class*='drawer']") || 
                            document.body;

          const optionEls = Array.from(container.querySelectorAll("input[type='radio'], [role='radio'], label.mcc__label, label[class*='radio'], div[class*='radio'], .chipMsg span, .quickReply, .chip, [class*='chip'], [class*='option'], .radio-wrap, .custom-radio, .bot-bubble button"))
            .filter(el => {
              const r = el.getBoundingClientRect();
              const isVisible = r.width > 0 && r.height > 0;
              const t = (el.innerText || el.value || "").trim();
              const isControl = t.toLowerCase() === "save" || t.toLowerCase() === "skip" || t.toLowerCase() === "close" || t.toLowerCase() === "cancel";
              return isVisible && t && !isControl;
            });

          if (optionEls.length === 0) {
            const rawRadios = Array.from(container.querySelectorAll("input[type='radio']")).filter(r => {
              const b = r.getBoundingClientRect();
              return b.width > 0 && b.height > 0;
            });
            if (rawRadios.length > 0) {
              rawRadios[0].click();
              rawRadios[0].checked = true;
              rawRadios[0].dispatchEvent(new Event("change", { bubbles: true }));
              return { success: true, text: "raw_radio_0" };
            }
            return { success: false, reason: "no_options" };
          }

          const ansLower = "${ans.toLowerCase()}";
          let targetEl = null;

          // 1. Exact match
          targetEl = optionEls.find(el => (el.innerText || el.value || "").trim().toLowerCase() === ansLower);

          // 2. Yes/No match
          if (!targetEl && ansLower.startsWith("yes")) {
            targetEl = optionEls.find(el => (el.innerText || el.value || "").trim().toLowerCase().startsWith("yes"));
          }
          if (!targetEl && ansLower.startsWith("no")) {
            targetEl = optionEls.find(el => (el.innerText || el.value || "").trim().toLowerCase().startsWith("no"));
          }

          // 3. Notice period match
          if (!targetEl && (ansLower.includes("30") || ansLower.includes("notice"))) {
            targetEl = optionEls.find(el => {
              const t = (el.innerText || el.value || "").trim().toLowerCase();
              return t.includes("1 month") || t.includes("30") || t.includes("15") || t.includes("immediate");
            });
          }

          // 4. Substring match
          if (!targetEl) {
            targetEl = optionEls.find(el => {
              const t = (el.innerText || el.value || "").trim().toLowerCase();
              return t.includes(ansLower) || ansLower.includes(t);
            });
          }

          // 5. Fallback to first option
          if (!targetEl) {
            targetEl = optionEls[0];
          }

          if (targetEl) {
            targetEl.scrollIntoView({ block: "nearest" });
            targetEl.click();
            const radio = targetEl.matches("input[type='radio']") ? targetEl : (targetEl.querySelector("input[type='radio']") || targetEl.closest("label")?.querySelector("input[type='radio']"));
            if (radio) {
              radio.checked = true;
              radio.dispatchEvent(new Event("change", { bubbles: true }));
            }
            return { success: true, text: (targetEl.innerText || targetEl.value || "").trim() };
          }

          return { success: false };
        })()`
      }, sessionId);

      console.log(`  -> Option selection result:`, selectResult?.result?.result?.value);
      await new Promise((r) => setTimeout(r, 800));

      // If Save button is present and active for this choice, click Save
      if (state.hasSave && state.saveCoords) {
        console.log(`  -> Clicking Save button for radio choice at (${state.saveCoords.x}, ${state.saveCoords.y})...`);
        await cdp.send("Input.dispatchMouseEvent", {
          type: "mousePressed",
          x: state.saveCoords.x,
          y: state.saveCoords.y,
          button: "left",
          clickCount: 1
        }, sessionId);
        await new Promise((r) => setTimeout(r, 60));
        await cdp.send("Input.dispatchMouseEvent", {
          type: "mouseReleased",
          x: state.saveCoords.x,
          y: state.saveCoords.y,
          button: "left",
          clickCount: 1
        }, sessionId);
        await new Promise((r) => setTimeout(r, 1500));
      }
    } else if (state.hasInput && state.inputCoords) {
      // TEXT-BASED QUESTION: ONLY CLICK ON TEXT BOX IF ITS A TEXT BASED QUESTION!
      console.log(`  [TEXT-BASED QUESTION ENCOUNTERED] No radio buttons found.`);
      console.log(`  -> Clicking on text box and typing "${ans}"...`);

      await cdp.send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: state.inputCoords.x,
        y: state.inputCoords.y,
        button: "left",
        clickCount: 1
      }, sessionId);
      await new Promise((r) => setTimeout(r, 60));
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: state.inputCoords.x,
        y: state.inputCoords.y,
        button: "left",
        clickCount: 1
      }, sessionId);
      await new Promise((r) => setTimeout(r, 150));

      await cdp.send("Input.insertText", { text: ans }, sessionId);
      await new Promise((r) => setTimeout(r, 400));

      if (state.hasSave && state.saveCoords) {
        console.log(`  -> Clicking Save at (${state.saveCoords.x}, ${state.saveCoords.y})...`);
        await cdp.send("Input.dispatchMouseEvent", {
          type: "mousePressed",
          x: state.saveCoords.x,
          y: state.saveCoords.y,
          button: "left",
          clickCount: 1
        }, sessionId);
        await new Promise((r) => setTimeout(r, 60));
        await cdp.send("Input.dispatchMouseEvent", {
          type: "mouseReleased",
          x: state.saveCoords.x,
          y: state.saveCoords.y,
          button: "left",
          clickCount: 1
        }, sessionId);
        await new Promise((r) => setTimeout(r, 2000));
      }
    } else if (state.hasSave && state.saveCoords) {
      console.log(`  -> Clicking Save/Continue button...`);
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: state.saveCoords.x,
        y: state.saveCoords.y,
        button: "left",
        clickCount: 1
      }, sessionId);
      await new Promise((r) => setTimeout(r, 60));
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: state.saveCoords.x,
        y: state.saveCoords.y,
        button: "left",
        clickCount: 1
      }, sessionId);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  return true;
}

async function main() {
  const cdpBase = getCdpUrl();
  console.log(`Connecting to CDP at ${cdpBase}...`);
  const verRes = await fetch(`${cdpBase}/json/version`);
  const verData = await verRes.json();
  const browserWsUrl = verData.webSocketDebuggerUrl;

  const cdp = new CdpConnection(browserWsUrl);
  await cdp.connect();
  await cdp.send("Target.setDiscoverTargets", { discover: true });

  const targetsRes = await cdp.send("Target.getTargets");
  const targets = targetsRes?.result?.targetInfos || [];

  let recTarget = targets.find((t) => t.type === "page" && t.url.includes("recommendedjobs"));
  if (!recTarget) {
    console.log("Creating target for recommendedjobs...");
    const createRes = await cdp.send("Target.createTarget", { url: "https://www.naukri.com/mnjuser/recommendedjobs" });
    recTarget = { targetId: createRes.result.targetId };
    await new Promise((r) => setTimeout(r, 4000));
  }

  await cdp.send("Target.activateTarget", { targetId: recTarget.targetId });
  const recAttach = await cdp.send("Target.attachToTarget", { targetId: recTarget.targetId, flatten: true });
  const recSessionId = recAttach.result.sessionId;

  await cdp.send("Runtime.enable", {}, recSessionId);
  await cdp.send("DOM.enable", {}, recSessionId);
  await cdp.send("Page.enable", {}, recSessionId);

  // Fetch list of candidate cards from scrollableDiv
  console.log("Analyzing job cards in recommendedjobs...");
  const cardsRes = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const scrollableDiv = document.getElementById("scrollableDiv");
      if (!scrollableDiv) return JSON.stringify([]);
      const cards = Array.from(scrollableDiv.children);
      return JSON.stringify(cards.map((c, i) => {
        const text = c.innerText || "";
        const titleEl = c.querySelector(".text-title18Sb") || c;
        return {
          index: i,
          title: (titleEl.innerText || "").split(String.fromCharCode(10)).join(" "),
          hasQuickApplyBadge: text.includes("Quick apply"),
          isApplied: text.includes("Applied"),
          isEarlyInterest: text.includes("Signal early interest")
        };
      }));
    })()`
  }, recSessionId);

  const cards = JSON.parse(cardsRes?.result?.result?.value || "[]");
  console.log(`Found ${cards.length} cards in recommendedjobs.`);

  // Iterate cards to find one that has a verified Quick Apply button on its job page
  for (let c of cards) {
    if (c.isEarlyInterest || c.title.length < 5 || c.isApplied) continue;

    console.log(`\nEvaluating card [${c.index}]: "${c.title}" (badge: ${c.hasQuickApplyBadge})...`);

    // Scroll card into view
    await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const scrollableDiv = document.getElementById("scrollableDiv");
        if (scrollableDiv && scrollableDiv.children[${c.index}]) {
          scrollableDiv.children[${c.index}].scrollIntoView({ block: "center" });
        }
      })()`
    }, recSessionId);
    await new Promise((r) => setTimeout(r, 600));

    // Get click coords for title
    const rectRes = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const scrollableDiv = document.getElementById("scrollableDiv");
        const card = scrollableDiv.children[${c.index}];
        const titleEl = card.querySelector(".text-title18Sb") || card;
        const rect = titleEl.getBoundingClientRect();
        return JSON.stringify({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
      })()`
    }, recSessionId);

    const { x, y } = JSON.parse(rectRes.result.result.value);

    // Click card
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }, recSessionId);
    await new Promise((r) => setTimeout(r, 80));
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }, recSessionId);

    // Wait for job page tab to open
    await new Promise((r) => setTimeout(r, 5000));

    const allT = await cdp.send("Target.getTargets");
    const jobTargets = allT.result.targetInfos.filter((t) => t.type === "page" && t.url.includes("job-listings-"));
    const jobTarget = jobTargets[jobTargets.length - 1];

    if (!jobTarget) {
      console.log("No new job listing page opened, skipping...");
      continue;
    }

    console.log(`Opened job page: ${jobTarget.url}`);
    await cdp.send("Target.activateTarget", { targetId: jobTarget.targetId });
    const jobAttach = await cdp.send("Target.attachToTarget", { targetId: jobTarget.targetId, flatten: true });
    const jsid = jobAttach.result.sessionId;

    await cdp.send("Runtime.enable", {}, jsid);
    await cdp.send("DOM.enable", {}, jsid);
    await cdp.send("Page.enable", {}, jsid);

    // Scroll till end
    console.log("Scrolling job page to end...");
    await cdp.send("Runtime.evaluate", {
      expression: `(async () => {
        const totalH = document.body.scrollHeight;
        for (let step = 1; step <= 20; step++) {
          window.scrollTo({ top: (totalH * step) / 20, behavior: "smooth" });
          await new Promise(r => setTimeout(r, 100));
        }
        window.scrollTo(0, document.body.scrollHeight);
      })()`,
      awaitPromise: true
    }, jsid);

    for (let i = 0; i < 6; i++) {
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 500, y: 500, deltaX: 0, deltaY: 800 }, jsid);
      await new Promise((r) => setTimeout(r, 120));
    }
    await new Promise((r) => setTimeout(r, 2000));

    // CHECK BUTTON: MUST BE QUICK APPLY ONLY
    console.log("Checking if button is 'Quick apply' ONLY...");
    const checkBtnRes = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const allSpans = Array.from(document.querySelectorAll("span, button, a"));
        const isExternal = allSpans.some(el => (el.innerText || "").trim().toLowerCase().includes("apply on company site"));
        const qaSpan = allSpans.find(el => (el.innerText || "").trim().toLowerCase() === "quick apply");
        
        return JSON.stringify({
          hasQuickApply: !!qaSpan,
          isExternal,
          textSample: (document.body.innerText || "").slice(-500)
        });
      })()`
    }, jsid);

    const btnInfo = JSON.parse(checkBtnRes.result.result.value);
    console.log("Button check result:", btnInfo);

    if (btnInfo.isExternal || !btnInfo.hasQuickApply) {
      console.log(`[REJECTED] Job is external or does not have Quick apply. Closing tab and trying next job...`);
      await cdp.send("Target.closeTarget", { targetId: jobTarget.targetId });
      await cdp.send("Target.activateTarget", { targetId: recTarget.targetId });
      continue;
    }

    // Found verified Quick Apply job!
    console.log("CONFIRMED: Job has verified Quick apply button. Clicking Quick apply...");
    await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const xpath = "/html/body/div[4]/div/div/div/div[1]/div[6]/div/div/div/button/span/span[1]/span";
        const xres = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        if (xres && xres.singleNodeValue) {
          xres.singleNodeValue.click();
          const btn = xres.singleNodeValue.closest("button");
          if (btn) btn.click();
          return;
        }
        const spans = Array.from(document.querySelectorAll("span.flex.items-center.gap-2\\.5, span, button"));
        for (const s of spans) {
          if (s.textContent && s.textContent.trim().toLowerCase() === "quick apply") {
            s.click();
            const btn = s.closest("button");
            if (btn) btn.click();
            return;
          }
        }
      })()`
    }, jsid);

    await new Promise((r) => setTimeout(r, 4000));

    // Answer questions until "Thank you for your responses" or completion
    await handleChatbotDrawer(cdp, jsid);

    console.log("Application flow completed for this job. Exiting cleanly.");
    break;
  }

  cdp.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Main error:", err);
  process.exit(1);
});
