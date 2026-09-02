import { chromium } from "playwright";

async function run() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:53178", { noDefaults: true });
  const context = browser.contexts()[0];
  const page = context.pages().find((p) => p.url().includes("job-listings-"));
  if (!page) {
    console.error("No job listing page found!");
    process.exit(1);
  }
  await page.bringToFront();

  console.log("Connected to job page:", page.url());

  function answerQuestion(qText, options = []) {
    const q = (qText || "").toLowerCase();

    // Relocate / work model / shifts / comfortable
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

    // Experience
    if (q.includes("experience") || q.includes("exp") || q.includes("years") || q.includes("how many years")) {
      if (options.length > 0) {
        const match = options.find((o) => o.includes("5") || o.includes("6") || o.includes("7") || o.includes("8"));
        if (match) return match;
      }
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

  let lastProgressTime = Date.now();
  let lastSeenQuestion = "";
  const STUCK_TIMEOUT_MS = 30000; // 30 seconds exact timeout

  console.log("Starting screening question loop with 30s stuck watchdog...");

  while (true) {
    const elapsedSinceProgress = Date.now() - lastProgressTime;
    if (elapsedSinceProgress >= STUCK_TIMEOUT_MS) {
      console.log(
        `[WATCHDOG TRIGGERED] No progress made for ${Math.round(
          elapsedSinceProgress / 1000
        )} seconds. Stopping in 30 seconds exactly as instructed.`
      );
      break;
    }

    const state = await page.evaluate(() => {
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

      // Look for latest question text
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

      // Find radio options
      const radioEls = Array.from(
        document.querySelectorAll(
          ".singleselect-radiobutton label, .ssrc__radio-btn-container label, input[type='radio'], [role='radio'], label.mcc__label"
        )
      ).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && el.offsetParent !== null;
      });

      const options = radioEls.map((el) => (el.innerText || el.value || "").trim()).filter(Boolean);

      // Find text input
      const inputEl = document.querySelector(
        ".textArea, div.textArea[contenteditable='true'], textarea, input.suggestor-input[type='text'], .chatbot_Drawer input[type='text']"
      );
      const hasVisibleTextInput =
        !!inputEl &&
        (() => {
          const r = inputEl.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && inputEl.offsetParent !== null && !inputEl.classList.contains("suggestor-input");
        })();

      // Find save button
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
      break;
    }

    // Did question advance?
    if (state.latestQuestion && state.latestQuestion !== lastSeenQuestion) {
      console.log(`\n[NEW QUESTION DETECTED]: "${state.latestQuestion}"`);
      lastSeenQuestion = state.latestQuestion;
      lastProgressTime = Date.now();
    }

    // Check if Radio question
    if (state.hasRadio && state.options.length > 0) {
      const chosenAnswer = answerQuestion(state.latestQuestion, state.options);
      console.log(`[RADIO BUTTON QUESTION] Options: ${JSON.stringify(state.options)}`);
      console.log(`-> Selecting: "${chosenAnswer}" (strictly bypassing text box)...`);

      // Click matching radio
      const selectResult = await page.evaluate((ans) => {
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
      await page.waitForTimeout(600);

      // Click Save
      console.log("-> Clicking Save button for radio choice...");
      await page.evaluate(() => {
        const saveBtn = document.querySelector(".sendMsg, .sendMsgbtn_container .sendMsg");
        if (saveBtn) saveBtn.click();
      });

      lastProgressTime = Date.now();
      await page.waitForTimeout(2000);
      continue;
    }

    // Check if Text question (only if NO radio buttons)
    if (state.hasVisibleTextInput) {
      const chosenAnswer = answerQuestion(state.latestQuestion);
      console.log(`[TEXT-BASED QUESTION] Question: "${state.latestQuestion}"`);
      console.log(`-> Clicking text box and typing: "${chosenAnswer}"...`);

      await page.evaluate((ans) => {
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

      await page.waitForTimeout(400);

      console.log("-> Clicking Save button for text answer...");
      await page.evaluate(() => {
        const saveBtn = document.querySelector(".sendMsg, .sendMsgbtn_container .sendMsg");
        if (saveBtn) saveBtn.click();
      });

      lastProgressTime = Date.now();
      await page.waitForTimeout(2000);
      continue;
    }

    // If Save button is enabled directly (e.g. single action)
    if (state.isSaveEnabled) {
      console.log("-> Clicking active Save button...");
      await page.evaluate(() => {
        const saveBtn = document.querySelector(".sendMsg, .sendMsgbtn_container .sendMsg");
        if (saveBtn) saveBtn.click();
      });
      lastProgressTime = Date.now();
      await page.waitForTimeout(2000);
      continue;
    }

    await page.waitForTimeout(1000);
  }

  process.exit(0);
}

run().catch((err) => {
  console.error("Solver error:", err);
  process.exit(1);
});
