import { chromium } from "playwright";

const candidatePaths = [
  { type: "xpath", path: "/html/body/div[4]/div/div/div/div[1]/div[5]/div/div/div/button/span/span[1]/span" },
  { type: "xpath", path: "/html/body/div[4]/div/div/div/div[1]/div[6]/div/div/div/button/span/span[1]/span" },
  { type: "xpath", path: "/html/body/div[4]/div/div/div/div[1]/div[4]/div/div/div/button/span/span[1]/span" },
  { type: "xpath", path: "/html/body/div[4]/div/div/div/div[1]/div[7]/div/div/div/button/span/span[1]/span" },
  { type: "xpath", path: "//button[.//span[normalize-space()='Quick apply']]" },
  { type: "xpath", path: "//span[normalize-space()='Quick apply' and contains(@class,'gap-2.5')]" },
  { type: "css", path: "span.flex.items-center.gap-2\\.5" },
  { type: "css", path: "button:has(span.flex.items-center.gap-2\\.5)" }
];

function answerQuestion(qText, options = []) {
  const q = (qText || "").toLowerCase();

  // Experience questions (CRITICAL USER DIRECTIVE: always >= 7, 7-8, 7-9, 7+, NEVER <7)
  const isExperience =
    q.includes("experience") ||
    q.includes("exp") ||
    q.includes("years") ||
    q.includes("how many years") ||
    (options.length > 0 && options.some((o) => o.toLowerCase().includes("year")));

  if (isExperience) {
    if (options.length > 0) {
      // 1. Strictly filter out negative/zero options
      const validOptions = options.filter((o) => {
        const ol = o.toLowerCase();
        return !ol.includes("no experience") && !ol.includes("none") && !ol.startsWith("<");
      });

      // 2. Check for explicit 7+ ranges (7-9, 7-8, 7+, >7, >=7, etc.)
      let match = validOptions.find((o) =>
        /7\s*-\s*[89]|7\s*\+|>[=]?\s*7|7\s*years/i.test(o)
      );

      // 3. Check for >6, >5, 8+, 9+, 10+, >12
      if (!match) {
        match = validOptions.find((o) =>
          />\s*[56789]|>\s*1[0-9]|\b[89]\s*\+|\b1[0-9]\s*\+/i.test(o)
        );
      }

      // 4. Check for 5-7, 6-8, 5-6
      if (!match) {
        match = validOptions.find((o) =>
          /5\s*-\s*[67]|6\s*-\s*[78]/i.test(o)
        );
      }

      // 5. Fall back to highest valid positive option (never negative or No experience)
      if (!match && validOptions.length > 0) {
        match = validOptions[validOptions.length - 1];
      }

      if (match) return match;
    }
    return "7";
  }

  // Willing to relocate / work model / shifts / comfortable
  if (
    q.includes("relocate") ||
    q.includes("comfortable") ||
    q.includes("hybrid") ||
    q.includes("shift") ||
    q.includes("agree") ||
    q.includes("willing")
  ) {
    return "Yes";
  }

  // Notice period / joining
  if (
    q.includes("notice period") ||
    q.includes("notice") ||
    q.includes("np") ||
    q.includes("joiner") ||
    q.includes("joining") ||
    q.includes("last working day")
  ) {
    if (options.length > 0) {
      const match = options.find((o) => {
        const ol = o.toLowerCase();
        return ol.includes("1 month") || ol.includes("30") || ol.includes("15") || ol.includes("immediate");
      });
      if (match) return match;
    }
    return "30 days";
  }

  // Current CTC
  if (
    q.includes("current ctc") ||
    q.includes("current salary") ||
    q.includes("present ctc") ||
    q.includes("current package") ||
    q.includes("fixed ctc")
  ) {
    return "36.7";
  }

  // Expected CTC
  if (
    q.includes("expected ctc") ||
    q.includes("expected salary") ||
    q.includes("ectc") ||
    q.includes("expected package")
  ) {
    return "55";
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
  if (
    q.includes("python") ||
    q.includes("machine learning") ||
    q.includes("ai") ||
    q.includes("sql") ||
    q.includes("aws") ||
    q.includes("biometric")
  ) {
    return "Yes";
  }

  return "Yes";
}

async function findAndClickQuickApply(jobPage) {
  console.log("Checking all candidate paths for Quick apply button...");

  // Scroll through page to trigger sticky / bottom buttons
  await jobPage.evaluate(async () => {
    const h = document.body.scrollHeight;
    for (let step = 1; step <= 10; step++) {
      window.scrollTo({ top: (h * step) / 10, behavior: "smooth" });
      await new Promise((r) => setTimeout(r, 60));
    }
  });
  await jobPage.waitForTimeout(1000);

  const matched = await jobPage.evaluate((paths) => {
    for (const p of paths) {
      let el = null;
      if (p.type === "xpath") {
        const res = document.evaluate(p.path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        el = res.singleNodeValue;
      } else {
        el = document.querySelector(p.path);
      }
      if (el) {
        const btn = el.closest("button") || (el.tagName === "BUTTON" ? el : null);
        const targetEl = btn || el;
        targetEl.scrollIntoView({ block: "center" });
        const r = targetEl.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          return {
            path: p.path,
            type: p.type,
            rect: { x: r.x + r.width / 2, y: r.y + r.height / 2 },
            text: el.innerText
          };
        }
      }
    }
    return null;
  }, candidatePaths);

  if (!matched) {
    console.log("None of the Quick apply candidate paths matched a visible element.");
    return false;
  }

  console.log(`Matched Quick apply button via path: ${matched.path}`);
  console.log(`Clicking Quick apply at (${Math.round(matched.rect.x)}, ${Math.round(matched.rect.y)})...`);

  await jobPage.mouse.click(matched.rect.x, matched.rect.y);

  // Also dispatch DOM click
  await jobPage.evaluate((p) => {
    let el = null;
    if (p.type === "xpath") {
      const res = document.evaluate(p.path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      el = res.singleNodeValue;
    } else {
      el = document.querySelector(p.path);
    }
    if (el) {
      const btn = el.closest("button") || el;
      btn.click();
    }
  }, matched);

  return true;
}

async function solveChatbotDrawer(jobPage) {
  console.log("Monitoring and answering chatbot screening questions with 60s stuck watchdog...");
  let lastProgressTime = Date.now();
  let lastSeenQuestion = "";
  const STUCK_TIMEOUT_MS = 60000; // Stop if stuck for more than 1 minute

  while (true) {
    const elapsed = Date.now() - lastProgressTime;
    if (elapsed >= STUCK_TIMEOUT_MS) {
      console.log(`[WATCHDOG TRIGGERED] Stuck without progress for ${Math.round(elapsed / 1000)} seconds (> 1 minute). Stopping cleanly.`);
      return false;
    }

    const state = await jobPage.evaluate(() => {
      const bodyText = document.body.innerText || "";
      const isThanks =
        bodyText.includes("Thank you for your responses") ||
        bodyText.includes("Your profile has been shared") ||
        bodyText.includes("Your response has been recorded") ||
        bodyText.includes("Application sent") ||
        bodyText.includes("Applied successfully");

      const drawer = document.querySelector(".chatbot_Drawer, #desktopChatBotContainer, ._chatBotContainer");
      if (!drawer && isThanks) {
        return { isThanks: true };
      }

      const questionLines = (drawer ? drawer.innerText : bodyText).split("\n").map((s) => s.trim()).filter(Boolean);
      const saveIdx = questionLines.lastIndexOf("Save");
      let latestQuestion = "";
      if (saveIdx > 0) {
        for (let i = saveIdx - 1; i >= 0; i--) {
          const l = questionLines[i];
          if (l.endsWith("?") || (l.length > 5 && !["yes", "no", "save", "skip"].includes(l.toLowerCase()))) {
            latestQuestion = l;
            break;
          }
        }
      }

      // Detect radio elements
      const radioEls = Array.from(
        document.querySelectorAll(
          ".singleselect-radiobutton label, .ssrc__radio-btn-container label, label.ssrc__label, input[type='radio'], [role='radio'], label.mcc__label"
        )
      ).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && el.offsetParent !== null;
      });

      const options = radioEls.map((el) => (el.innerText || el.value || "").trim()).filter(Boolean);

      // Detect text input
      const inputEl = document.querySelector(
        ".textArea, div.textArea[contenteditable='true'], textarea, .chatbot_Drawer input[type='text']"
      );
      const hasVisibleTextInput =
        !!inputEl &&
        (() => {
          const r = inputEl.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && inputEl.offsetParent !== null && !inputEl.classList.contains("suggestor-input");
        })();

      // Save button
      const saveBtn = document.querySelector(".sendMsg, button.save, .sendMsgbtn_container .sendMsg");
      const isSaveEnabled = !!saveBtn && !document.querySelector(".sendMsgbtn_container .send.disabled");

      return {
        isThanks,
        latestQuestion,
        options,
        hasRadio: radioEls.length > 0,
        hasVisibleTextInput,
        hasSaveBtn: !!saveBtn,
        isSaveEnabled,
        bodySnippet: bodyText.slice(-300)
      };
    });

    if (state.isThanks) {
      console.log("\n=======================================================");
      console.log("SUCCESS! Received 'Thank you for your responses.'");
      console.log("Application completed successfully!");
      console.log("=======================================================\n");
      return true;
    }

    // Check if new question appeared
    if (state.latestQuestion && state.latestQuestion !== lastSeenQuestion) {
      console.log(`\n[NEW QUESTION DETECTED]: "${state.latestQuestion}"`);
      lastSeenQuestion = state.latestQuestion;
      lastProgressTime = Date.now();
    }

    // 1. Radio button question
    if (state.hasRadio && state.options.length > 0) {
      const chosenAnswer = answerQuestion(state.latestQuestion, state.options);
      console.log(`[RADIO BUTTON QUESTION] Options: ${JSON.stringify(state.options)}`);
      console.log(`-> Selecting: "${chosenAnswer}" (strictly bypassing text box)...`);

      const selectResult = await jobPage.evaluate((ans) => {
        const radioLabels = Array.from(
          document.querySelectorAll(
            ".singleselect-radiobutton label, .ssrc__radio-btn-container label, label.ssrc__label, input[type='radio']"
          )
        ).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });

        let target = radioLabels.find((el) => (el.innerText || el.value || "").trim().toLowerCase() === ans.toLowerCase());
        if (!target && ans.toLowerCase().startsWith("yes")) {
          target = radioLabels.find((el) => (el.innerText || el.value || "").trim().toLowerCase().startsWith("yes"));
        }
        if (!target && ans.toLowerCase().startsWith("no")) {
          target = radioLabels.find((el) => (el.innerText || el.value || "").trim().toLowerCase().startsWith("no"));
        }
        if (!target && radioLabels.length > 0) {
          const positiveLabels = radioLabels.filter((el) => {
            const txt = (el.innerText || el.value || "").toLowerCase();
            return !txt.includes("no experience") && !txt.startsWith("<") && !txt.includes("none");
          });
          target = positiveLabels.length > 0 ? positiveLabels[positiveLabels.length - 1] : radioLabels[radioLabels.length - 1];
        }

        if (target) {
          target.click();
          const radioInput = target.matches("input[type='radio']")
            ? target
            : target.closest(".ssrc__radio-btn-container")?.querySelector("input[type='radio']") ||
              document.getElementById(target.getAttribute("for"));
          if (radioInput) {
            radioInput.checked = true;
            radioInput.dispatchEvent(new Event("change", { bubbles: true }));
          }
          return { clicked: true, text: (target.innerText || target.value || "").trim() };
        }
        return { clicked: false };
      }, chosenAnswer);

      console.log("Selection result:", selectResult);
      await jobPage.waitForTimeout(600);

      // Click Save
      console.log("-> Clicking Save button for radio choice...");
      await jobPage.evaluate(() => {
        const saveBtn = document.querySelector(".sendMsg, .sendMsgbtn_container .sendMsg");
        if (saveBtn) saveBtn.click();
      });

      lastProgressTime = Date.now();
      await jobPage.waitForTimeout(2000);
      continue;
    }

    // 2. Text-based question (only if NO radio buttons)
    if (state.hasVisibleTextInput) {
      const chosenAnswer = answerQuestion(state.latestQuestion);
      console.log(`[TEXT-BASED QUESTION] Question: "${state.latestQuestion}"`);
      console.log(`-> Clicking text box and typing: "${chosenAnswer}"...`);

      await jobPage.evaluate((ans) => {
        const inputEl = document.querySelector(
          ".textArea, div.textArea[contenteditable='true'], textarea, .chatbot_Drawer input[type='text']"
        );
        if (inputEl) {
          inputEl.focus();
          inputEl.click();
          if (inputEl.tagName === "INPUT" || inputEl.tagName === "TEXTAREA") {
            inputEl.value = ans;
            inputEl.dispatchEvent(new Event("input", { bubbles: true }));
          } else {
            inputEl.textContent = ans;
            inputEl.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }
      }, chosenAnswer);

      await jobPage.waitForTimeout(400);

      console.log("-> Clicking Save button for text answer...");
      await jobPage.evaluate(() => {
        const saveBtn = document.querySelector(".sendMsg, .sendMsgbtn_container .sendMsg");
        if (saveBtn) saveBtn.click();
      });

      lastProgressTime = Date.now();
      await jobPage.waitForTimeout(2000);
      continue;
    }

    // 3. If Save button is enabled directly
    if (state.isSaveEnabled) {
      console.log("-> Clicking active Save button...");
      await jobPage.evaluate(() => {
        const saveBtn = document.querySelector(".sendMsg, .sendMsgbtn_container .sendMsg");
        if (saveBtn) saveBtn.click();
      });
      lastProgressTime = Date.now();
      await jobPage.waitForTimeout(2000);
      continue;
    }

    await jobPage.waitForTimeout(1000);
  }
}

async function main() {
  console.log("Connecting to Chrome on port 53178...");
  const browser = await chromium.connectOverCDP("http://127.0.0.1:53178", { noDefaults: true });
  const context = browser.contexts()[0];

  // Close previous job listing tabs
  for (const p of context.pages()) {
    if (p.url().includes("job-listings-")) {
      console.log("Closing old job tab:", p.url());
      await p.close();
    }
  }

  let recPage = context.pages().find((p) => p.url().includes("recommendedjobs"));
  if (!recPage) {
    console.log("Opening recommendedjobs page...");
    recPage = await context.newPage();
    await recPage.goto("https://www.naukri.com/mnjuser/recommendedjobs", { waitUntil: "domcontentloaded" });
  } else {
    await recPage.bringToFront();
    await recPage.reload({ waitUntil: "domcontentloaded" });
  }

  await recPage.waitForTimeout(3000);

  // Scan cards in scrollableDiv
  console.log("Scanning candidate jobs in recommendedjobs...");
  let targetCardIndex = -1;
  let targetCardTitle = "";

  for (let attempt = 0; attempt < 5; attempt++) {
    const cardsInfo = await recPage.evaluate(() => {
      const scrollableDiv = document.getElementById("scrollableDiv");
      if (!scrollableDiv) return [];
      return Array.from(scrollableDiv.children).map((c, i) => {
        const txt = c.innerText || "";
        const titleEl = c.querySelector(".text-title18Sb") || c;
        return {
          index: i,
          title: (titleEl.innerText || "").replace(/\n/g, " "),
          hasQuickApply: txt.includes("Quick apply"),
          isApplied: txt.includes("Applied"),
          isEarly: txt.includes("Signal early interest")
        };
      });
    });

    console.log(`Visible cards count: ${cardsInfo.length}`);
    for (const c of cardsInfo) {
      if (c.hasQuickApply && !c.isApplied && !c.isEarly && c.title.length > 3) {
        targetCardIndex = c.index;
        targetCardTitle = c.title;
        break;
      }
    }

    if (targetCardIndex !== -1) break;

    console.log("No unapplied Quick Apply job in view, scrolling to load more...");
    await recPage.evaluate(() => {
      const scrollableDiv = document.getElementById("scrollableDiv");
      if (scrollableDiv) scrollableDiv.scrollBy(0, 800);
      else window.scrollBy(0, 800);
    });
    await recPage.waitForTimeout(2000);
  }

  if (targetCardIndex === -1) {
    console.log("No unapplied Quick Apply job found in recommendedjobs.");
    process.exit(0);
  }

  console.log(`\nFound target unapplied job at card [${targetCardIndex}]: "${targetCardTitle}"`);

  // Scroll card into view
  await recPage.evaluate((idx) => {
    const s = document.getElementById("scrollableDiv");
    if (s && s.children[idx]) {
      s.children[idx].scrollIntoView({ block: "center" });
    }
  }, targetCardIndex);

  await recPage.waitForTimeout(600);

  const newPagePromise = context.waitForEvent("page", { timeout: 10000 }).catch(() => null);

  await recPage.evaluate((idx) => {
    const s = document.getElementById("scrollableDiv");
    const c = s.children[idx];
    const t = c.querySelector(".text-title18Sb") || c;
    t.click();
  }, targetCardIndex);

  const jobPage = await newPagePromise;
  if (!jobPage) {
    console.error("Failed to open job page tab!");
    process.exit(1);
  }

  console.log("Opened job page:", jobPage.url());
  await jobPage.waitForLoadState("domcontentloaded");
  await jobPage.waitForTimeout(3000);

  // Check all candidate paths and click Quick apply
  const clicked = await findAndClickQuickApply(jobPage);
  if (!clicked) {
    console.log("Could not find or click Quick apply button using candidate paths. Exiting.");
    process.exit(1);
  }

  await jobPage.waitForTimeout(4000);

  // Check if directly applied or if chatbot drawer opened
  const statusAfterClick = await jobPage.evaluate(() => {
    const body = document.body.innerText || "";
    const isApplied = body.includes("Applied") && !body.includes("Save") && !body.includes("question");
    const drawer = document.querySelector(".chatbot_Drawer, #desktopChatBotContainer, ._chatBotContainer");
    return { isApplied, hasDrawer: !!drawer };
  });

  if (statusAfterClick.isApplied && !statusAfterClick.hasDrawer) {
    console.log("Job applied directly without screening questions!");
  } else {
    // Solve chatbot questions
    await solveChatbotDrawer(jobPage);
  }

  console.log("Single job application task complete. Exiting cleanly.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Main execution error:", err);
  process.exit(1);
});
