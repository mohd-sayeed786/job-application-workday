import { chromium } from "playwright";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

const CANDIDATE_PROFILE = {
  name: "Mohammad Sayeed",
  email: "sayeed.mcs17.du@gmail.com",
  phone: "7982776638",
  linkedIn: "https://www.linkedin.com/in/mohammad-sayeed",
  github: "https://github.com/mohd-sayeed786",
  experienceYears: "7+",
  currentRole: "Senior Data Scientist",
  currentCompany: "Tata Digital",
  currentLocation: "Bangalore",
  preferredLocations: ["Bangalore", "Hyderabad", "Pune"],
  nativeLocation: "Lucknow",
  currentCTC: "36.7",
  fixedCTC: "33",
  variableCTC: "3.7",
  expectedCTC: "50",
  noticePeriod: "30 days",
  reasonForChange: "Career growth",
  education: {
    tenthYear: "2012",
    twelfthYear: "2014",
    ugDegree: "BSc (H) Computer Science",
    ugCollege: "Deen Dayal Upadhyaya College, University of Delhi",
    ugYear: "2017",
    ugScore: "89.01%",
    pgDegree: "MSc Computer Science",
    pgCollege: "Department of Computer Science, University of Delhi",
    pgYear: "2019",
    pgScore: "80.70%",
    certifications: "Databricks Certified Generative AI Engineer Associate, IIT Delhi Advanced Data Science"
  },
  skills: [
    "Python", "SQL", "PySpark", "Machine Learning", "Deep Learning", "NLP", "LLMs",
    "Generative AI", "RAG", "Agentic AI", "Prompt Engineering", "Embeddings",
    "Semantic Search", "Recommendation Systems", "Fraud Detection", "Credit Risk",
    "FastAPI", "Docker", "Kubernetes", "Databricks", "Azure", "PostgreSQL", "MongoDB"
  ]
};

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

const STORE_DIR = path.join(os.homedir(), ".job-apply");
const answersFilePath = path.join(STORE_DIR, "answers.json");
const APPLIED_FILE = path.join(STORE_DIR, "applied_jobs.json");
const GLOBAL_SESSION_TIMEOUT_MS = 600000; // 10 minutes total

function loadAnswersStore() {
  if (fs.existsSync(answersFilePath)) {
    try {
      return JSON.parse(fs.readFileSync(answersFilePath, "utf-8"));
    } catch (e) {
      console.warn("Could not parse answers store:", e.message);
    }
  }
  return { schemaVersion: 1, answers: {}, metadata: { updatedAt: new Date().toISOString() } };
}

function persistAnswer(question, answer) {
  try {
    const store = loadAnswersStore();
    const cleanQ = question.trim().toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ");
    const hash = crypto.createHash("sha256").update(cleanQ).digest("hex");
    const key = `question.${hash}`;

    store.answers[key] = {
      key,
      question: question.trim(),
      value: answer,
      source: "learned_automation",
      state: "confirmed",
      updatedAt: new Date().toISOString()
    };
    store.metadata.updatedAt = new Date().toISOString();

    fs.writeFileSync(answersFilePath, JSON.stringify(store, null, 2), "utf-8");
    console.log(`[STORE PERSISTED] Saved answer for: "${question.trim()}" -> "${answer}"`);
  } catch (e) {
    console.warn("Failed to persist answer:", e.message);
  }
}

function getPersistedAnswer(question) {
  try {
    const store = loadAnswersStore();
    const cleanQ = question.trim().toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ");
    const hash = crypto.createHash("sha256").update(cleanQ).digest("hex");
    const key = `question.${hash}`;
    if (store.answers && store.answers[key]) {
      return store.answers[key].value;
    }

    // Check alias matching
    for (const rec of Object.values(store.answers || {})) {
      if (!rec || !rec.question) continue;
      const rq = rec.question.toLowerCase();
      if (rq === question.trim().toLowerCase() || cleanQ.includes(rq) || rq.includes(cleanQ)) {
        return rec.value;
      }
    }
  } catch (e) {}
  return null;
}

function matchExperienceOption(options, userExp = 7) {
  if (!options || options.length === 0) return null;

  const parsed = options.map((opt) => {
    const o = opt.trim();
    const ol = o.toLowerCase();

    if (ol === "yes") return { opt, min: 0, max: 99 };
    if (ol === "no" || ol.includes("no experience") || ol.includes("none")) return { opt, min: -1, max: -1 };

    // Range like "5-7", "5 - 7 years", "6 to 8", "5-10"
    const rangeMatch = ol.match(/(\d+)\s*(?:-|to)\s*(\d+)/);
    if (rangeMatch) {
      return { opt, min: parseInt(rangeMatch[1], 10), max: parseInt(rangeMatch[2], 10) };
    }

    // "5 or more than 5", "5 or more", "7+", ">7", ">=7", "more than 5", "> 5 years"
    const moreMatch = ol.match(/(?:>|>=|more than|at least)\s*(\d+)|(\d+)\s*(?:\+|or more)/);
    if (moreMatch) {
      const val = parseInt(moreMatch[1] || moreMatch[2], 10);
      return { opt, min: val, max: 99 };
    }

    // "<8 years", "< 8", "less than 8", "under 8"
    const lessMatch = ol.match(/(?:<|<=|less than|under)\s*(\d+)/);
    if (lessMatch) {
      const val = parseInt(lessMatch[1], 10);
      return { opt, min: 0, max: val };
    }

    // Single number like "7 years", "7"
    const singleMatch = ol.match(/(\d+)\s*(?:years?|yrs?)?/);
    if (singleMatch) {
      const val = parseInt(singleMatch[1], 10);
      return { opt, min: val, max: val };
    }

    return { opt, min: -1, max: -1 };
  });

  const matching = parsed.filter((p) => p.min >= 0 && userExp >= p.min && userExp <= p.max);
  if (matching.length === 0) return null;

  matching.sort((a, b) => (a.max - a.min) - (b.max - b.min));
  return matching[0].opt;
}

function isDescriptiveQuestion(qText) {
  if (!qText) return false;
  const q = qText.toLowerCase().trim();

  if (
    q.includes("how many years") ||
    q.includes("notice period") ||
    q.includes("np") ||
    q.includes("ctc") ||
    q.includes("salary") ||
    q.includes("package") ||
    q.includes("10th") ||
    q.includes("12th") ||
    q.includes("last working day") ||
    q.includes("current company") ||
    q.includes("current role") ||
    q.includes("current designation") ||
    q.includes("current location") ||
    q.includes("preferred location") ||
    q.includes("highest qualification")
  ) {
    return false;
  }

  if (
    q.includes("relocate") ||
    q.includes("comfortable working") ||
    q.includes("ready to") ||
    q.includes("available for f2f") ||
    q.includes("available for in-person") ||
    q.includes("hybrid") ||
    q.includes("shift")
  ) {
    return false;
  }

  const descriptiveKeywords = [
    "which domain", "what domain", "domains", "explain", "describe",
    "highlight your", "tell us", "brief", "what kind", "what projects",
    "core ml algorithms", "dl principles", "statistical & mathematical",
    "use cases", "share details", "summary of", "model types", "traditional machine learning"
  ];

  return descriptiveKeywords.some((w) => q.includes(w)) || (q.length > 70 && !q.includes("how many years"));
}

function answerQuestion(qText, options = []) {
  const q = (qText || "").toLowerCase();

  // 1. Check persistent memory
  const saved = getPersistedAnswer(qText);
  if (saved) {
    if (options.length > 0) {
      const match = options.find((o) => o.toLowerCase() === saved.toLowerCase());
      if (match) return match;
    } else {
      return saved;
    }
  }

  // If descriptive text question and no saved answer -> prompt user!
  if (options.length === 0 && isDescriptiveQuestion(qText)) {
    return null;
  }

  // 2. Experience questions (CRITICAL: match accurate bracket for 7 years)
  const isExperience =
    /\bexp\b|\bexperience\b|\byears?\b|\bhow many years\b/i.test(q) ||
    (options.length > 0 && options.some((o) => o.toLowerCase().includes("year")));

  if (isExperience) {
    if (options.length > 0) {
      const match = matchExperienceOption(options, 7);
      if (match) return match;
      // If ambiguous, return null so user is prompted to learn
      return null;
    }
    return "7";
  }

  // 3. Notice period & serving notice
  if (
    q.includes("notice period") ||
    q.includes("notice") ||
    q.includes("np") ||
    q.includes("joiner") ||
    q.includes("joining") ||
    q.includes("last working day") ||
    q.includes("serving")
  ) {
    if (options.length > 0) {
      const match = options.find((o) => {
        const ol = o.toLowerCase();
        return (
          ol.includes("30") ||
          ol.includes("1 month") ||
          ol.includes("15") ||
          ol.includes("immediate") ||
          ol.includes("serving")
        );
      });
      if (match) return match;
    }
    return "30 days";
  }

  // 4. Relocation / shifts / work model
  if (
    q.includes("relocate") ||
    q.includes("comfortable") ||
    q.includes("hybrid") ||
    q.includes("shift") ||
    q.includes("agree") ||
    q.includes("willing") ||
    q.includes("ready to") ||
    q.includes("living in")
  ) {
    if (options.length > 0) {
      const match = options.find((o) => o.toLowerCase().startsWith("yes"));
      if (match) return match;
    }
    return "Yes";
  }

  // 5. Compensation / CTC
  if (
    q.includes("current ctc") ||
    q.includes("current salary") ||
    q.includes("present ctc") ||
    q.includes("current package") ||
    q.includes("fixed ctc")
  ) {
    return CANDIDATE_PROFILE.currentCTC;
  }

  if (
    q.includes("expected ctc") ||
    q.includes("expected salary") ||
    q.includes("ectc") ||
    q.includes("expected package")
  ) {
    return CANDIDATE_PROFILE.expectedCTC;
  }

  // 6. Location
  if (q.includes("current location") || q.includes("where do you live")) {
    return CANDIDATE_PROFILE.currentLocation;
  }
  if (q.includes("native") || q.includes("hometown")) {
    return CANDIDATE_PROFILE.nativeLocation;
  }
  if (q.includes("preferred location")) {
    return "Bangalore";
  }

  // 7. Role, Company & Reason for change
  if (q.includes("current company") || q.includes("current employer") || q.includes("present company")) {
    return CANDIDATE_PROFILE.currentCompany;
  }
  if (q.includes("current role") || q.includes("current designation") || q.includes("current title")) {
    return CANDIDATE_PROFILE.currentRole;
  }
  if (q.includes("reason for change") || q.includes("why are you looking")) {
    return CANDIDATE_PROFILE.reasonForChange;
  }

  // 8. Education
  if (q.includes("10th")) return CANDIDATE_PROFILE.education.tenthYear;
  if (q.includes("12th")) return CANDIDATE_PROFILE.education.twelfthYear;
  if (q.includes("highest qualification") || q.includes("post graduation") || q.includes("master")) {
    return CANDIDATE_PROFILE.education.pgDegree;
  }
  if (q.includes("graduation") || q.includes("undergraduate") || q.includes("degree") || q.includes("bachelor")) {
    return CANDIDATE_PROFILE.education.ugDegree;
  }

  // 9. Technical Skills
  const skillKeywords = [
    "python", "machine learning", "deep learning", "nlp", "llm", "genai", "generative ai",
    "rag", "agentic", "sql", "pyspark", "fastapi", "docker", "kubernetes", "databricks", "azure", "aws"
  ];
  if (skillKeywords.some((s) => q.includes(s))) {
    if (options.length > 0) {
      const match = options.find((o) => o.toLowerCase().startsWith("yes") || /7|8|9|5-7|high/i.test(o));
      if (match) return match;
    }
    return "Yes";
  }

  // Fallback for options
  if (options.length > 0) {
    const match = options.find((o) => o.toLowerCase().startsWith("yes"));
    if (match) return match;
    return null; // Ambiguous options -> prompt user!
  }

  if (q.length > 30) {
    return null; // Unknown descriptive question -> prompt user!
  }

  return "Yes";
}

async function findAndClickQuickApply(jobPage) {
  console.log("Checking candidate paths for Quick apply button...");

  // Scroll smoothly to trigger sticky/bottom action bar
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
    if (p.type === "xpath" || p.path.startsWith("/") || p.path.startsWith("(")) {
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

async function solveChatbotDrawer(jobPage, sessionStartTime = 0) {
  console.log("Monitoring and answering chatbot screening questions (5 mins stuck watchdog)...");
  let lastProgressTime = Date.now();
  let startTime = Date.now();
  let lastSeenQuestion = "";
  const STUCK_TIMEOUT_MS = 300000; // 5 minutes stuck watchdog

  while (true) {
    if (jobPage.isClosed()) {
      console.log("Job page closed by browser after application. Considering completed.");
      return true;
    }
    if (sessionStartTime > 0 && Date.now() - sessionStartTime >= GLOBAL_SESSION_TIMEOUT_MS) {
      console.log("[TIMEOUT] Global session timeout reached. Stopping cleanly.");
      return false;
    }
    const elapsedSinceProgress = Date.now() - lastProgressTime;
    const elapsedTotal = Date.now() - startTime;

    if (elapsedSinceProgress >= STUCK_TIMEOUT_MS) {
      console.log(`[WATCHDOG TRIGGERED] Stuck without progress for ${Math.round(elapsedSinceProgress / 1000)}s (> 5 mins). Stopping cleanly.`);
      return false;
    }

    let state;
    try {
    try {
      state = await jobPage.evaluate(() => {
        const bodyText = document.body.innerText || "";
        const isThanks =
          bodyText.includes("Thank you for your responses") ||
          bodyText.includes("Your profile has been shared") ||
          bodyText.includes("Your response has been recorded") ||
          bodyText.includes("Application sent") ||
          bodyText.includes("Applied successfully");

        const drawer = document.querySelector(".chatbot_Drawer, #desktopChatBotContainer, ._chatBotContainer");
        if (!drawer && isThanks) {
          return { isThanks: true, hasDrawer: false };
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

        // Detect checkboxes (multi-select)
        const checkboxEls = Array.from(
          document.querySelectorAll(
            "input[type='checkbox'], .checkbox-wrap label, .multiselect label, .mcc__checkbox"
          )
        ).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && el.offsetParent !== null;
        });
        const checkboxOptions = checkboxEls.map((el) => (el.innerText || el.value || "").trim()).filter(Boolean);

        // Detect dropdown / select
        const selectEls = Array.from(document.querySelectorAll("select, .dropdownContainer, .custom-select")).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && el.offsetParent !== null;
        });

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
          hasDrawer: !!drawer,
          latestQuestion,
          options,
          hasRadio: radioEls.length > 0,
          hasCheckboxes: checkboxEls.length > 0,
          checkboxOptions,
          hasSelect: selectEls.length > 0,
          hasVisibleTextInput,
          hasSaveBtn: !!saveBtn,
          isSaveEnabled
        };
      });
    } catch (e) {
      console.warn("Error evaluating page state:", e.message);
      return false;
    }

    if (!state.hasDrawer && !state.hasRadio && !state.hasVisibleTextInput && !state.hasSaveBtn && elapsedTotal > 20000) {
      console.log("No chatbot drawer or screening questions appeared after 20s. Moving to next job.");
      return false;
    }
    if (state.isThanks) {
      console.log("\n=======================================================");
      console.log("SUCCESS! Received 'Thank you for your responses.'");
      console.log("Application completed successfully!");
      console.log("=======================================================\n");
      return true;
    }

    if (state.latestQuestion && state.latestQuestion !== lastSeenQuestion) {
      console.log(`\n[NEW QUESTION DETECTED]: "${state.latestQuestion}"`);
      lastSeenQuestion = state.latestQuestion;
      lastProgressTime = Date.now();
    }

    // User requested: "This time don't fill by yourself, I'll fill all the questions you just learn."
    // Whenever any screening question input exists in the drawer, wait for user to answer in Chrome
    const hasScreeningQuestion = state.hasRadio || state.hasVisibleTextInput || state.hasCheckboxes || state.hasSelect;

    if (hasScreeningQuestion) {
      const qType = (state.hasCheckboxes || state.hasSelect)
        ? "Multi-Select / Dropdown Question"
        : state.hasRadio
        ? "Radio Button Question"
        : "Text Question";

      console.log("\n=======================================================");
      console.log(`[USER INPUT NEEDED - REINFORCEMENT LEARNING]`);
      console.log(`Question: "${state.latestQuestion}"`);
      console.log(`Question Type: ${qType}`);
      if (state.options && state.options.length > 0) {
        console.log(`Options: ${JSON.stringify(state.options)}`);
      }
      if (state.checkboxOptions && state.checkboxOptions.length > 0) {
        console.log(`Checkbox Options: ${JSON.stringify(state.checkboxOptions)}`);
      }
      console.log("\n>>> PLEASE ANSWER THIS QUESTION IN CHROME AND CLICK 'SAVE' <<<");
      console.log("Waiting up to 180s for you to fill and click Save in Chrome...");
      console.log("=======================================================\n");

      await jobPage.bringToFront();

      const waitStart = Date.now();
      let capturedAnswer = "";
      let userSubmitted = false;

      while (Date.now() - waitStart < 180000) {
        await jobPage.waitForTimeout(800);

        const liveData = await jobPage.evaluate(() => {
          const input = document.querySelector(
            ".textArea, div.textArea[contenteditable='true'], textarea, .chatbot_Drawer input[type='text']"
          );
          const textVal = input ? (input.value || input.innerText || "").trim() : "";

          const checkedRadios = Array.from(
            document.querySelectorAll("input[type='radio']:checked, .singleselect-radiobutton input:checked")
          ).map((r) => {
            const lbl = r.closest("label") || document.querySelector(`label[for='${r.id}']`);
            return (lbl?.innerText || r.value || "").trim();
          }).filter(Boolean);

          const checkedBoxes = Array.from(document.querySelectorAll("input[type='checkbox']:checked")).map((c) => {
            const lbl = c.closest("label") || document.querySelector(`label[for='${c.id}']`);
            return (lbl?.innerText || c.value || "").trim();
          }).filter(Boolean);

          const drawer = document.querySelector(".chatbot_Drawer, #desktopChatBotContainer, ._chatBotContainer");
          const bodyText = document.body.innerText || "";
          const isThanks =
            bodyText.includes("Thank you for your responses") ||
            bodyText.includes("Your profile has been shared") ||
            bodyText.includes("Your response has been recorded") ||
            bodyText.includes("Application sent") ||
            bodyText.includes("Applied successfully");

          return { textVal, checkedRadios, checkedBoxes, isThanks, hasDrawer: !!drawer };
        });

        if (liveData.textVal) capturedAnswer = liveData.textVal;
        if (liveData.checkedRadios.length > 0) capturedAnswer = liveData.checkedRadios[0];
        if (liveData.checkedBoxes.length > 0) capturedAnswer = liveData.checkedBoxes.join(", ");

        if (liveData.isThanks) {
          userSubmitted = true;
          break;
        }

        const currentQ = await jobPage.evaluate(() => {
          const drawer = document.querySelector(".chatbot_Drawer, #desktopChatBotContainer, ._chatBotContainer");
          const lines = (drawer ? drawer.innerText : document.body.innerText).split("\n").map((s) => s.trim()).filter(Boolean);
          const sIdx = lines.lastIndexOf("Save");
          if (sIdx > 0) {
            for (let i = sIdx - 1; i >= 0; i--) {
              const l = lines[i];
              if (l.endsWith("?") || (l.length > 5 && !["yes", "no", "save", "skip"].includes(l.toLowerCase()))) {
                return l;
              }
            }
          }
          return "";
        });

        if (currentQ && currentQ !== state.latestQuestion) {
          userSubmitted = true;
          break;
        }
      }

      if (userSubmitted || capturedAnswer) {
        console.log(`\n[LEARNED FROM USER] Question: "${state.latestQuestion}"`);
        console.log(`[LEARNED FROM USER] Stored Answer: "${capturedAnswer || 'Submitted'}"`);
        if (state.latestQuestion && capturedAnswer) {
          persistAnswer(state.latestQuestion, capturedAnswer);
        }
        lastProgressTime = Date.now();
        await jobPage.waitForTimeout(2000);
        continue;
      } else {
        console.log("[USER INPUT TIMEOUT] No answer submitted after 180s. Moving forward.");
        return false;
      }
    }

    // 1. Radio button question
    if (state.hasRadio && state.options.length > 0) {
      const chosenAnswer = answerQuestion(state.latestQuestion, state.options);
      console.log(`[RADIO BUTTON QUESTION] Options: ${JSON.stringify(state.options)}`);
      console.log(`-> Selecting: "${chosenAnswer}" (strictly bypassing text box)...`);

      // Persist learned answer
      if (state.latestQuestion) {
        persistAnswer(state.latestQuestion, chosenAnswer);
      }

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

        // Never fall back to negative/entry options like "No experience"
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
      console.log(`-> Typing answer: "${chosenAnswer}"...`);

      if (state.latestQuestion) {
        persistAnswer(state.latestQuestion, chosenAnswer);
      }

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

    // 3. Active Save button
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

      if (!jobPage.isClosed()) {
        await jobPage.waitForTimeout(1000);
      }
    } catch (err) {
      if (err.message && (err.message.includes("closed") || err.message.includes("Target"))) {
        console.log("Job page closed during processing. Considering completed.");
        return true;
      }
      throw err;
    }
  }
}

function matchesJobPreferences(card) {
  const t = (card.title || "").toLowerCase();
  const snip = (card.snippet || "").toLowerCase();
  const full = `${t} ${snip}`;

  // Exclusion filters
  const excludeKeywords = [
    "data analyst", "business analyst", "bi analyst", "bi developer",
    "qa ", "quality assurance", "tester", "devops", "generic data engineering",
    "junior", "associate data scientist", "intern", "trainee", "fresher"
  ];
  if (excludeKeywords.some((ex) => full.includes(ex))) {
    return false;
  }

  // Priority keywords
  const priorityKeywords = [
    "lead", "senior", "sr", "architect", "principal", "staff", "manager",
    "machine learning", "ml", "data scientist", "data science", "ai", "artificial intelligence",
    "genai", "generative ai", "llm", "rag", "agentic", "nlp"
  ];

  return priorityKeywords.some((pk) => full.includes(pk));
}
async function main() {
  const TARGET_JOBS_COUNT = parseInt(process.env.TARGET_JOBS_COUNT || "5", 10);
  const GLOBAL_SESSION_TIMEOUT_MS = parseInt(process.env.GLOBAL_SESSION_TIMEOUT_MS || "300000", 10); // 2 minutes
  let appliedCount = 0;

  console.log(`Starting Batch Application Automation (Target: ${TARGET_JOBS_COUNT} jobs, Timeout: ${GLOBAL_SESSION_TIMEOUT_MS / 1000}s)`);
  console.log("Connecting to Chrome on port 53178...");
  const browser = await chromium.connectOverCDP("http://127.0.0.1:53178", { noDefaults: true });
  const context = browser.contexts()[0];

  const SEARCH_FEEDS = [
    "https://www.naukri.com/lead-data-scientist-jobs-in-bengaluru?k=lead%20data%20scientist&l=bengaluru",
    "https://www.naukri.com/ai-engineer-jobs-in-bengaluru?k=ai%20engineer&l=bengaluru",
    "https://www.naukri.com/ml-engineer-jobs-in-bengaluru?k=ml%20engineer&l=bengaluru",
    "https://www.naukri.com/machine-learning-engineer-jobs-in-bengaluru?k=machine%20learning%20engineer&l=bengaluru",
    "https://www.naukri.com/senior-data-scientist-jobs-in-bengaluru?k=senior%20data%20scientist&l=bengaluru",
    "https://www.naukri.com/mnjuser/recommendedjobs?clusterId=high_salary",
    "https://www.naukri.com/mnjuser/recommendedjobs?clusterId=top_candidate",
    "https://www.naukri.com/mnjuser/recommendedjobs"
  ];
  let currentFeedIndex = 0;

  let recPage = context.pages().find((p) => p.url().includes("naukri.com"));
  if (!recPage) {
    console.log(`Opening search feed: ${SEARCH_FEEDS[0]}...`);
    recPage = await context.newPage();
    await recPage.goto(SEARCH_FEEDS[0], { waitUntil: "domcontentloaded" });
  } else {
    await recPage.bringToFront();
    if (!SEARCH_FEEDS.some((f) => recPage.url().includes(f.split("?")[0]))) {
      console.log(`Navigating to search feed: ${SEARCH_FEEDS[0]}...`);
      await recPage.goto(SEARCH_FEEDS[0], { waitUntil: "domcontentloaded" });
    }
  }

  await recPage.waitForTimeout(3000);

  const appliedUrls = new Set();
  const appliedCompanies = new Set([
    "epam", "bean hr", "tavant", "tredence", "shell", "zs associates",
    "huntingcube", "spectraforce", "avom", "equinix", "coupa"
  ]);
  let appliedJobsList = [];
  if (fs.existsSync(APPLIED_FILE)) {
    try {
      const d = JSON.parse(fs.readFileSync(APPLIED_FILE, "utf8"));
      (d.appliedUrls || []).forEach((u) => appliedUrls.add(u.split("?")[0]));
      (d.appliedCompanies || []).forEach((c) => appliedCompanies.add(c.toLowerCase()));
      if (Array.isArray(d.appliedJobs)) appliedJobsList = d.appliedJobs;
    } catch {}
  }
  function recordApplied(url, title = "", company = "") {
    const cleanUrl = url.split("?")[0];
    appliedUrls.add(cleanUrl);
    if (company) appliedCompanies.add(company.toLowerCase().trim());
    appliedJobsList.push({
      url: cleanUrl,
      title: title || "",
      company: company || "",
      appliedAt: new Date().toISOString()
    });
    const dataToWrite = {
      appliedUrls: Array.from(appliedUrls),
      appliedCompanies: Array.from(appliedCompanies),
      appliedJobs: appliedJobsList
    };
    try {
      fs.writeFileSync(APPLIED_FILE, JSON.stringify(dataToWrite, null, 2));
      console.log(`[STORED APPLIED JOB] Saved to ${APPLIED_FILE}: "${title}" (${company})`);
    } catch (e) {
      console.warn("Could not write to APPLIED_FILE:", e.message);
    }
    try {
      const repoReport = path.join(process.cwd(), "runs_data", "naukri_applied_jobs.json");
      fs.writeFileSync(repoReport, JSON.stringify(dataToWrite, null, 2));
    } catch {}
  }

  const sessionStartTime = Date.now();
  const processedIndices = new Set();

  while (appliedCount < TARGET_JOBS_COUNT) {
    if (Date.now() - sessionStartTime >= GLOBAL_SESSION_TIMEOUT_MS) {
      console.log("\n[5-MIN HARD STOP] Exactly 5 minutes elapsed. Stopping all processing cleanly.");
      break;
    }

    console.log(`\n======================================================`);
    console.log(`LOOKING FOR JOB #${appliedCount + 1} OF ${TARGET_JOBS_COUNT}...`);
    console.log(`======================================================`);

    await recPage.bringToFront();
    await recPage.waitForTimeout(2000);

    let candidateCard = null;

    // Scan cards, scroll if needed
    for (let scrollAttempt = 0; scrollAttempt < 15; scrollAttempt++) {
      const cards = await recPage.evaluate(({ appliedList, companyList }) => {
        const s = document.getElementById("scrollableDiv");
        const cardElements = s
          ? Array.from(s.children)
          : Array.from(document.querySelectorAll("div.cursor-pointer.rounded-3xl.bg-n800"));
        if (!cardElements || cardElements.length === 0) return [];
        return cardElements.map((c, i) => {
          const txt = c.innerText || "";
          const txtLower = txt.toLowerCase();
          const titleEl =
            c.querySelector(".text-title18Sb.text-n100") ||
            c.querySelector(".text-title18Sb") ||
            c.querySelector("h2") ||
            c;
          const compEl =
            c.querySelector(".text-title18Sb.text-n200") ||
            c.querySelector(".text-title16Sb.text-n200") ||
            c.querySelector("h4");
          const company = compEl ? (compEl.innerText || "").split("\n")[0].trim() : "";
          const link = c.querySelector("a[href*='job-listings-']");
          const href = link ? link.href.split("?")[0] : null;
          const isCompanyApplied = company && companyList.some((comp) => comp.length > 2 && txtLower.includes(comp));
          const isAlreadyApplied = txt.includes("Applied") || (href && appliedList.includes(href)) || isCompanyApplied;
          return {
            index: i,
            title: (titleEl.innerText || "").replace(/\n/g, " "),
            company,
            href,
            snippet: txt.replace(/\n/g, " ").slice(0, 300),
            hasQuickApply: txt.includes("Quick apply"),
            isApplied: isAlreadyApplied,
            isEarly: txt.includes("Signal early interest")
          };
        });
      }, { appliedList: Array.from(appliedUrls), companyList: Array.from(appliedCompanies) });

      for (const c of cards) {
        if (
          !processedIndices.has(c.index) &&
          c.hasQuickApply &&
          !c.isApplied &&
          !c.isEarly &&
          c.title.length > 2 &&
          (!c.href || !appliedUrls.has(c.href.split("?")[0])) &&
          matchesJobPreferences(c)
        ) {
          candidateCard = c;
          break;
        }
      }

      if (candidateCard) break;

      console.log("No unapplied matching job in current view. Scrolling...");
      await recPage.evaluate(() => {
        const s = document.getElementById("scrollableDiv");
        if (s) s.scrollBy(0, 700);
        else window.scrollBy(0, 700);
      });
      await recPage.waitForTimeout(2000);
    }

    if (!candidateCard) {
      currentFeedIndex++;
      if (currentFeedIndex < SEARCH_FEEDS.length) {
        processedIndices.clear();
        console.log(`Switching to search feed #${currentFeedIndex + 1}: ${SEARCH_FEEDS[currentFeedIndex]}...`);
        await recPage.goto(SEARCH_FEEDS[currentFeedIndex], { waitUntil: "domcontentloaded" });
        await recPage.waitForTimeout(3000);
        continue;
      } else {
        console.log("No more matching unapplied Quick Apply jobs found across search feeds.");
        break;
      }
    }

    processedIndices.add(candidateCard.index);
    console.log(`\nSelected Job #${appliedCount + 1}:`);
    console.log(`- Card Index: ${candidateCard.index}`);
    console.log(`- Title: ${candidateCard.title}`);
    console.log(`- Snippet: ${candidateCard.snippet.slice(0, 120)}...`);

    // Scroll card into view and click
    await recPage.evaluate((idx) => {
      const s = document.getElementById("scrollableDiv");
      const card = s ? s.children[idx] : document.querySelectorAll("div.cursor-pointer.rounded-3xl.bg-n800")[idx];
      if (card) {
        card.scrollIntoView({ block: "center" });
      }
    }, candidateCard.index);
    await recPage.waitForTimeout(600);

    const newPagePromise = context.waitForEvent("page", { timeout: 10000 }).catch(() => null);

    await recPage.evaluate((idx) => {
      const s = document.getElementById("scrollableDiv");
      const c = s ? s.children[idx] : document.querySelectorAll("div.cursor-pointer.rounded-3xl.bg-n800")[idx];
      if (c) {
        const t =
          c.querySelector(".text-title18Sb.text-n100") ||
          c.querySelector(".text-title18Sb") ||
          c.querySelector("h2") ||
          c;
        t.click();
      }
    }, candidateCard.index);

    const jobPage = await newPagePromise;
    if (!jobPage) {
      console.warn("Could not open job page tab for card", candidateCard.index);
      continue;
    }

    await jobPage.waitForLoadState("domcontentloaded");
    await jobPage.waitForTimeout(3000);
    const jobUrl = jobPage.url();
    console.log(`Opened Job URL: ${jobUrl}`);

    if (appliedUrls.has(jobUrl)) {
      console.log("Already applied to this URL in this session. Skipping.");
      if (!jobPage.isClosed()) await jobPage.close();
      continue;
    }

    // Check Quick Apply button and click
    const clicked = await findAndClickQuickApply(jobPage);
    if (!clicked) {
      console.log("Quick apply button not clickable on this page. Skipping to next job.");
      if (!jobPage.isClosed()) await jobPage.close();
      continue;
    }

    await jobPage.waitForTimeout(4000);

    // Check status
    const statusAfterClick = await jobPage.evaluate(() => {
      const body = document.body.innerText || "";
      const isApplied = body.includes("Applied") && !body.includes("Save") && !body.includes("question");
      const drawer = document.querySelector(".chatbot_Drawer, #desktopChatBotContainer, ._chatBotContainer");
      return { isApplied, hasDrawer: !!drawer };
    });

    let success = false;
    if (statusAfterClick.isApplied && !statusAfterClick.hasDrawer) {
      console.log("Job applied directly without screening questions!");
      success = true;
    } else {
      success = await solveChatbotDrawer(jobPage, sessionStartTime);
      if (success === "RESTART") {
        console.log("Restarting application for current job...");
        const reClicked = await findAndClickQuickApply(jobPage);
        if (reClicked) {
          await jobPage.waitForTimeout(3000);
          success = await solveChatbotDrawer(jobPage, sessionStartTime);
        } else {
          success = false;
        }
      }
    }

    if (success) {
      appliedCount++;
      recordApplied(jobUrl, candidateCard.title, candidateCard.company);
      console.log(`\n>>> Successfully applied to Job #${appliedCount} of ${TARGET_JOBS_COUNT}! <<<\n`);

      if (appliedCount < TARGET_JOBS_COUNT && Date.now() - sessionStartTime < GLOBAL_SESSION_TIMEOUT_MS && jobPage && !jobPage.isClosed()) {
        console.log("Checking for matching similar jobs on page...");
        let similarJobs = [];
        try {
          similarJobs = await jobPage.evaluate((appliedList) => {
            const links = Array.from(document.querySelectorAll("a[href*='job-listings-']"));
            const matches = [];
            for (const a of links) {
              const href = a.href.split("?")[0];
              const card = a.closest("div, article, section") || a;
              const cardText = (card.innerText || "").toLowerCase();
              if (
                !appliedList.includes(href) &&
                cardText.includes("quick apply") &&
                !cardText.includes("applied")
              ) {
                matches.push({ url: a.href, text: a.innerText });
              }
            }
            return matches;
          }, Array.from(appliedUrls));

          let appliedSimilar = false;
          for (const sim of similarJobs) {
            if (Date.now() - sessionStartTime >= GLOBAL_SESSION_TIMEOUT_MS || appliedCount >= TARGET_JOBS_COUNT) break;
            const simClean = sim.url.split("?")[0];
            if (appliedUrls.has(simClean)) continue;

            console.log(`Opening matching similar job: ${sim.text} (${sim.url})...`);
            await jobPage.goto(sim.url, { waitUntil: "domcontentloaded" });
            await jobPage.waitForTimeout(3000);

            const simClicked = await findAndClickQuickApply(jobPage);
            if (simClicked) {
              await jobPage.waitForTimeout(3000);
              const simOk = await solveChatbotDrawer(jobPage, sessionStartTime);
              if (simOk) {
                appliedCount++;
                recordApplied(sim.url);
                console.log(`\n>>> Successfully applied to Similar Job #${appliedCount} of ${TARGET_JOBS_COUNT}! <<<\n`);
                appliedSimilar = true;
                break;
              }
            }
          }
          if (!appliedSimilar) {
            console.log("No more matching similar jobs on this page. Returning to searching for jobs page...");
          }
        } catch (simErr) {
          console.log("Could not inspect similar jobs (page closed or redirected). Returning to search feed...");
        }
      }
    } else {
      console.log(`Application was not confirmed for ${jobUrl}.`);
    }

    // Delay 2 seconds before closing tab
    if (!jobPage.isClosed()) {
      await jobPage.waitForTimeout(2000);
    }
    // Close job tab to keep workspace clean
    await jobPage.close().catch(() => {});
    await recPage.bringToFront();
    await recPage.waitForTimeout(1500);
  }

  console.log(`\n======================================================`);
  console.log(`BATCH APPLICATION COMPLETE! Applied to ${appliedCount} jobs.`);
  console.log(`======================================================\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Batch runner error:", err);
  process.exit(1);
});
