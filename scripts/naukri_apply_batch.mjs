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
  holdingOffer: "No",
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
  { type: "css", path: "button:has(span.flex.items-center.gap-2\\.5)" },
  { type: "xpath", path: "//button[contains(., 'Quick apply') and not(contains(., 'Applied'))]" },
  { type: "xpath", path: "//button[contains(., 'Quick apply')]" },
  { type: "css", path: "button#quick-apply-button" }
];

const STORE_DIR = path.join(os.homedir(), ".job-apply");
const answersFilePath = path.join(STORE_DIR, "answers.json");
const APPLIED_FILE = path.join(STORE_DIR, "applied_jobs.json");
const ENCOUNTERED_QUESTIONS_FILE = path.join(process.cwd(), "runs_data", "last_batch_questions.json");

const encounteredQuestions = [];

function recordEncountered(jobTitle, company, question, answer, type = "auto") {
  if (!question || question.length < 3) return;
  const existing = encounteredQuestions.find(
    (e) => e.question.toLowerCase() === question.toLowerCase() && e.company === company
  );
  if (!existing) {
    encounteredQuestions.push({
      jobTitle,
      company,
      question: question.trim(),
      answer: String(answer).trim(),
      type,
      timestamp: new Date().toISOString()
    });
  }
}

function saveEncounteredQuestions() {
  try {
    const dir = path.dirname(ENCOUNTERED_QUESTIONS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ENCOUNTERED_QUESTIONS_FILE, JSON.stringify(encounteredQuestions, null, 2), "utf-8");
  } catch (e) {
    console.warn("Could not save encountered questions:", e.message);
  }
}

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
      if (rec.aliases && Array.isArray(rec.aliases)) {
        if (rec.aliases.some((al) => cleanQ.includes(al.toLowerCase()) || al.toLowerCase().includes(cleanQ))) {
          return rec.value;
        }
      }
    }
  } catch (e) {}
  return null;
}

function matchExperienceOption(options, userExp = 7.5) {
  if (!options || options.length === 0) return null;

  // STRICT USER DIRECTIVE: If 6-7 and 7-8 are options, strictly select 7-8!
  const sevenToEight = options.find((o) => {
    const ol = o.toLowerCase();
    return (
      ol.includes("7-8") ||
      ol.includes("7 to 8") ||
      ol.includes("7-9") ||
      ol.includes("7 to 9") ||
      ol.includes("7+") ||
      ol.includes(">=7") ||
      ol.includes(">7")
    );
  });
  const sixToSeven = options.find((o) => {
    const ol = o.toLowerCase();
    return ol.includes("6-7") || ol.includes("6 to 7") || ol.includes("<7");
  });
  if (sevenToEight && sixToSeven) {
    return sevenToEight;
  }

  const parsed = options.map((opt) => {
    const o = opt.trim();
    const ol = o.toLowerCase();

    if (ol === "yes") return { opt, min: 0, max: 99 };
    if (ol === "no" || ol.includes("no experience") || ol.includes("none")) return { opt, min: -1, max: -1 };

    // Range like "5-7", "5 - 7 years", "6 to 8", "5-10", "7-9", "7-8"
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
    q.includes("highest qualification") ||
    q.includes("product based") ||
    q.includes("service based") ||
    q.includes("offer") ||
    q.includes("military") ||
    q.includes("associated") ||
    q.includes("sponsorship") ||
    q.includes("visa")
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

  // 1. Check persistent memory first
  const saved = getPersistedAnswer(qText);
  if (saved) {
    if (options.length > 0) {
      const match = options.find((o) => o.toLowerCase() === saved.toLowerCase());
      if (match) return match;
    } else {
      return saved;
    }
  }

  // 2. STRICT USER DIRECTIVE: Offer in hand / received offer / holding offer -> ALWAYS "No"
  if (
    q.includes("offer") ||
    q.includes("holding any offer") ||
    q.includes("other offer") ||
    q.includes("counter offer") ||
    q.includes("received an offer") ||
    q.includes("received offer") ||
    q.includes("offer in hand")
  ) {
    if (options.length > 0) {
      const match = options.find((o) => {
        const ol = o.toLowerCase();
        return ol.startsWith("no") || ol.includes("no offer") || ol.includes("none");
      });
      if (match) return match;
    }
    return "No";
  }

  // 3. STRICT USER DIRECTIVE: Company association -> ALWAYS "No"
  if (
    q.includes("associated with") ||
    q.includes("previously employed") ||
    q.includes("worked with us") ||
    q.includes("past employee") ||
    q.includes("previously worked") ||
    q.includes("ex-employee") ||
    q.includes("worked before") ||
    q.includes("military fellow")
  ) {
    if (options.length > 0) {
      const match = options.find((o) => {
        const ol = o.toLowerCase();
        return ol.startsWith("no") || ol.includes("never associated") || ol === "n/a";
      });
      if (match) return match;
    }
    return "No";
  }

  // 4. STRICT USER DIRECTIVE: Military spouse / partner -> ALWAYS "No"
  if (
    q.includes("military spouse") ||
    q.includes("military partner") ||
    q.includes("military fellow") ||
    q.includes("military")
  ) {
    if (options.length > 0) {
      const match = options.find((o) => {
        const ol = o.toLowerCase();
        return ol.includes("not a military spouse") || ol.startsWith("no") || ol.includes("never associated") || ol === "n/a";
      });
      if (match) return match;
    }
    return "No";
  }

  // 5. Restrictive covenants / non-compete -> ALWAYS "No"
  if (
    q.includes("restrictive covenant") ||
    q.includes("noncompete") ||
    q.includes("confidentiality agreement") ||
    q.includes("restrict you performing")
  ) {
    if (options.length > 0) {
      const match = options.find((o) => o.toLowerCase().startsWith("no"));
      if (match) return match;
    }
    return "No";
  }

  // 6. STRICT USER DIRECTIVE: Visa Sponsorship for Bangalore/India -> ALWAYS "No"
  if (
    q.includes("sponsorship") ||
    q.includes("visa status") ||
    q.includes("require sponsorship") ||
    q.includes("work authorization")
  ) {
    if (options.length > 0) {
      const match = options.find((o) => o.toLowerCase().startsWith("no"));
      if (match) return match;
    }
    return "No";
  }

  // If descriptive text question and no saved answer -> prompt user!
  if (options.length === 0 && isDescriptiveQuestion(qText)) {
    return null;
  }

  // 7. Experience questions (CRITICAL: match 7-8 when 6-7 and 7-8 exist; strictly >= 7 years, never <7)
  const isExperience =
    /\bexp\b|\bexperience\b|\byears?\b|\bhow many years\b/i.test(q) ||
    (options.length > 0 && options.some((o) => o.toLowerCase().includes("year")));

  if (isExperience) {
    if (options.length > 0) {
      const match = matchExperienceOption(options, 7.5);
      if (match) return match;
      return null;
    }
    return "7";
  }

  // 8. Organization type (Product based vs Service based)
  if (
    q.includes("product based") ||
    q.includes("service based") ||
    q.includes("organization is a product") ||
    q.includes("company type")
  ) {
    if (options.length > 0) {
      const match = options.find((o) => o.toLowerCase().includes("product"));
      if (match) return match;
    }
    return "Product based";
  }

  // 9. Notice period & serving notice
  if (
    q.includes("notice period") ||
    q.includes("notice") ||
    q.includes("np") ||
    q.includes("joiner") ||
    q.includes("joining") ||
    q.includes("last working day") ||
    q.includes("serving")
  ) {
    if (q.includes("are you currently serving") || q.includes("serving notice")) {
      if (options.length > 0) {
        const match = options.find((o) => o.toLowerCase().startsWith("no"));
        if (match) return match;
      }
    }
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

  // 10. Relocation / shifts / work model
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

  // 11. Compensation / CTC
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

  // 12. Location
  if (q.includes("current location") || q.includes("where do you live")) {
    return CANDIDATE_PROFILE.currentLocation;
  }
  if (q.includes("native") || q.includes("hometown")) {
    return CANDIDATE_PROFILE.nativeLocation;
  }
  if (q.includes("preferred location")) {
    return "Bangalore";
  }

  // 13. Role, Company & Reason for change
  if (q.includes("current company") || q.includes("current employer") || q.includes("present company")) {
    return CANDIDATE_PROFILE.currentCompany;
  }
  if (q.includes("current role") || q.includes("current designation") || q.includes("current title")) {
    return CANDIDATE_PROFILE.currentRole;
  }
  if (q.includes("reason for change") || q.includes("why are you looking")) {
    return CANDIDATE_PROFILE.reasonForChange;
  }

  // 14. Education
  if (q.includes("10th")) return CANDIDATE_PROFILE.education.tenthYear;
  if (q.includes("12th")) return CANDIDATE_PROFILE.education.twelfthYear;
  if (q.includes("highest qualification") || q.includes("post graduation") || q.includes("master")) {
    return CANDIDATE_PROFILE.education.pgDegree;
  }
  if (q.includes("graduation") || q.includes("undergraduate") || q.includes("degree") || q.includes("bachelor")) {
    return CANDIDATE_PROFILE.education.ugDegree;
  }

  // 15. Technical Skills
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
    return null;
  }

  if (q.length > 30) {
    return null;
  }

  return "Yes";
}

async function checkAppliedOption(jobPage) {
  await jobPage.evaluate(async () => {
    const h = document.body.scrollHeight;
    for (let step = 1; step <= 6; step++) {
      window.scrollTo({ top: (h * step) / 6, behavior: "smooth" });
      await new Promise((r) => setTimeout(r, 60));
    }
  });
  await jobPage.waitForTimeout(800);

  return await jobPage.evaluate(() => {
    const elements = Array.from(document.querySelectorAll("button, div[role='button'], a, div.rounded-full, span.rounded-full"));
    for (const el of elements) {
      const text = (el.innerText || "").trim();
      const style = window.getComputedStyle(el);
      const bg = style.backgroundColor;

      let isGreen = false;
      const m = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (m) {
        const r = parseInt(m[1], 10), g = parseInt(m[2], 10), bVal = parseInt(m[3], 10);
        if (g > 120 && g > r * 1.2 && g > bVal * 1.2) {
          isGreen = true;
        }
      }
      const isGreenClass = el.className.includes("green") || el.className.includes("bg-green") || el.className.includes("emerald");

      if ((isGreen || isGreenClass) && /applied/i.test(text)) {
        return { isApplied: true, reason: "Green button with Applied text", text, bg };
      }

      if (/applied/i.test(text)) {
        const hasCheck = el.querySelector("img[alt='Check'], svg, [class*='check'], [class*='Check']") || text.includes("✓") || text.includes("✔");
        if (hasCheck && (isGreen || isGreenClass || style.cursor === "default" || style.pointerEvents === "none" || el.hasAttribute("disabled"))) {
          return { isApplied: true, reason: "Applied button with Checkmark", text, bg };
        }
        if (/^applied\s*[✓✔]?$/i.test(text)) {
          return { isApplied: true, reason: "Button with exact Applied text", text, bg };
        }
      }
    }

    const allSpans = Array.from(document.querySelectorAll("div, span, p"));
    for (const s of allSpans) {
      const t = (s.innerText || "").trim();
      if (/^applied\s*[✓✔]?$/i.test(t)) {
        const rect = s.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const style = window.getComputedStyle(s);
          const bg = style.backgroundColor;
          const m = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
          if (m && parseInt(m[2], 10) > 120 && parseInt(m[2], 10) > parseInt(m[1], 10) * 1.2) {
            return { isApplied: true, reason: "Green element with Applied text", text: t };
          }
          const parentBg = s.parentElement ? window.getComputedStyle(s.parentElement).backgroundColor : "";
          const pm = parentBg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
          if (pm && parseInt(pm[2], 10) > 120 && parseInt(pm[2], 10) > parseInt(pm[1], 10) * 1.2) {
            return { isApplied: true, reason: "Element inside green container with Applied text", text: t };
          }
        }
      }
    }

    return { isApplied: false };
  });
}

async function findAndClickQuickApply(jobPage) {
  console.log("Checking candidate paths for Quick apply button...");

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

async function solveChatbotDrawer(jobPage, jobTitle = "", company = "", sessionStartTime = 0, globalTimeoutMs = 900000) {
  console.log("Monitoring and answering chatbot screening questions...");
  let lastProgressTime = Date.now();
  let startTime = Date.now();
  let lastSeenQuestion = "";
  const STUCK_TIMEOUT_MS = 60000;

  while (true) {
    if (jobPage.isClosed()) {
      console.log("Job page closed by browser after application. Considering completed.");
      return true;
    }
    if (sessionStartTime > 0 && Date.now() - sessionStartTime >= globalTimeoutMs) {
      console.log("[TIMEOUT] Global session timeout reached. Stopping cleanly.");
      return false;
    }
    const elapsedSinceProgress = Date.now() - lastProgressTime;
    const elapsedTotal = Date.now() - startTime;

    if (elapsedSinceProgress >= STUCK_TIMEOUT_MS) {
      console.log(`[WATCHDOG TRIGGERED] Stuck without progress for ${Math.round(elapsedSinceProgress / 1000)}s (> 60s). Stopping cleanly.`);
      return false;
    }

    let state;
    try {
      state = await jobPage.evaluate(() => {
        const bodyText = document.body.innerText || "";
        
        let isThanks =
          bodyText.includes("Thank you for your responses") ||
          bodyText.includes("Your profile has been shared") ||
          bodyText.includes("Your response has been recorded") ||
          bodyText.includes("Application sent") ||
          bodyText.includes("Applied successfully");

        const buttons = Array.from(document.querySelectorAll("button, div[role='button']"));
        for (const b of buttons) {
          const bg = window.getComputedStyle(b).backgroundColor;
          const m = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
          if (m && parseInt(m[2], 10) > 120 && parseInt(m[2], 10) > parseInt(m[1], 10) * 1.2 && /applied/i.test(b.innerText)) {
            isThanks = true;
            break;
          }
        }

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
            if (l.endsWith("?") || (l.length > 5 && !["yes", "no", "save", "skip", "skip this question"].includes(l.toLowerCase()))) {
              latestQuestion = l;
              break;
            }
          }
        }

        const radioEls = Array.from(
          document.querySelectorAll(
            ".singleselect-radiobutton label, .ssrc__radio-btn-container label, label.ssrc__label, input[type='radio'], [role='radio'], label.mcc__label"
          )
        ).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && el.offsetParent !== null;
        });

        const options = radioEls.map((el) => (el.innerText || el.value || "").trim()).filter(Boolean);

        const checkboxEls = Array.from(
          document.querySelectorAll(
            "input[type='checkbox'], .checkbox-wrap label, .multiselect label, .mcc__checkbox"
          )
        ).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && el.offsetParent !== null;
        });
        const checkboxOptions = checkboxEls.map((el) => (el.innerText || el.value || "").trim()).filter(Boolean);

        const selectEls = Array.from(document.querySelectorAll("select, .dropdownContainer, .custom-select")).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && el.offsetParent !== null;
        });

        const inputEl = document.querySelector(
          ".textArea, div.textArea[contenteditable='true'], textarea, .chatbot_Drawer input[type='text']"
        );
        const hasVisibleTextInput =
          !!inputEl &&
          (() => {
            const r = inputEl.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && inputEl.offsetParent !== null && !inputEl.classList.contains("suggestor-input");
          })();

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

    if (state.isThanks) {
      console.log("\n=======================================================");
      console.log("SUCCESS! Application confirmed / 'Applied' recorded.");
      console.log("=======================================================\n");
      return true;
    }

    if (!state.hasDrawer && !state.hasRadio && !state.hasVisibleTextInput && !state.hasSaveBtn && elapsedTotal > 15000) {
      console.log("No chatbot drawer or screening questions appeared after 15s. Checking if completed...");
      if (state.isThanks) return true;
      return false;
    }

    if (state.latestQuestion && state.latestQuestion !== lastSeenQuestion) {
      console.log(`\n[NEW QUESTION DETECTED]: "${state.latestQuestion}"`);
      lastSeenQuestion = state.latestQuestion;
      lastProgressTime = Date.now();
    }

    const chosenAnswer = answerQuestion(state.latestQuestion, state.options);
    const isMultiSelect = (state.hasCheckboxes && state.checkboxOptions && state.checkboxOptions.length > 0) || state.hasSelect;
    const isDescriptive = state.hasVisibleTextInput && !chosenAnswer && isDescriptiveQuestion(state.latestQuestion);
    const isAmbiguousRadio = state.hasRadio && !chosenAnswer;
    const isUnknownText = state.hasVisibleTextInput && !chosenAnswer;

    if (isMultiSelect || isDescriptive || isAmbiguousRadio || isUnknownText) {
      const qType = isMultiSelect
        ? "Multi-Select / Dropdown Question"
        : isDescriptive
        ? "Descriptive Question"
        : isAmbiguousRadio
        ? "Ambiguous Radio Question"
        : "Unrecognized Question";

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
      console.log("Waiting up to 120s for you to fill and click Save in Chrome...");
      console.log("=======================================================\n");

      await jobPage.bringToFront();

      const waitStart = Date.now();
      let capturedAnswer = "";
      let userSubmitted = false;

      while (Date.now() - waitStart < 120000) {
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
        recordEncountered(jobTitle, company, state.latestQuestion, capturedAnswer || "User Submitted", "user_prompt");
        if (state.latestQuestion && capturedAnswer) {
          persistAnswer(state.latestQuestion, capturedAnswer);
        }
        lastProgressTime = Date.now();
        await jobPage.waitForTimeout(2000);
        continue;
      } else {
        console.log("[USER INPUT TIMEOUT] No answer submitted after 120s. Moving forward.");
        return false;
      }
    }

    // 1. Radio button question
    if (state.hasRadio && state.options.length > 0) {
      const chosenAnswer = answerQuestion(state.latestQuestion, state.options);
      console.log(`[RADIO BUTTON QUESTION] Options: ${JSON.stringify(state.options)}`);
      console.log(`-> Selecting: "${chosenAnswer}" (strictly bypassing text box)...`);

      recordEncountered(jobTitle, company, state.latestQuestion, chosenAnswer, "radio");

      if (state.latestQuestion && chosenAnswer) {
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
        if (!target && ans.toLowerCase().startsWith("no")) {
          target = radioLabels.find((el) => (el.innerText || el.value || "").trim().toLowerCase().startsWith("no"));
        }
        if (!target && ans.toLowerCase().startsWith("yes")) {
          target = radioLabels.find((el) => (el.innerText || el.value || "").trim().toLowerCase().startsWith("yes"));
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

      recordEncountered(jobTitle, company, state.latestQuestion, chosenAnswer, "text");

      if (state.latestQuestion && chosenAnswer) {
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
  }
}

function matchesJobPreferences(card) {
  const t = (card.title || "").toLowerCase();
  const snip = (card.snippet || "").toLowerCase();
  const full = `${t} ${snip}`;

  const excludeKeywords = [
    "data analyst", "business analyst", "bi analyst", "bi developer",
    "qa ", "quality assurance", "tester", "devops", "generic data engineering",
    "junior", "associate data scientist", "intern", "trainee", "fresher"
  ];
  if (excludeKeywords.some((ex) => full.includes(ex))) {
    return false;
  }

  const priorityKeywords = [
    "lead", "senior", "sr", "architect", "principal", "staff", "manager",
    "machine learning", "ml", "data scientist", "data science", "ai", "artificial intelligence",
    "genai", "generative ai", "llm", "rag", "agentic", "nlp"
  ];

  return priorityKeywords.some((pk) => full.includes(pk));
}

function isWithinLast7Days(cardSnippet) {
  const s = (cardSnippet || "").toLowerCase();
  const daysMatch = s.match(/(\d+)\s*d\s*ago/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    return days <= 7;
  }
  if (
    s.includes("30+d ago") || s.includes("30+ d ago") ||
    s.includes("15d ago") || s.includes("20d ago") ||
    s.includes("8d ago") || s.includes("9d ago") || s.includes("10d ago") ||
    s.includes("11d ago") || s.includes("12d ago") || s.includes("13d ago") || s.includes("14d ago")
  ) {
    return false;
  }
  return true;
}

async function main() {
  const TARGET_JOBS_COUNT = parseInt(process.env.TARGET_JOBS_COUNT || "5", 10);
  const GLOBAL_SESSION_TIMEOUT_MS = parseInt(process.env.GLOBAL_SESSION_TIMEOUT_MS || "900000", 10); // 15 mins
  let appliedCount = 0;

  console.log(`\n======================================================`);
  console.log(`Starting Naukri Job Apply Automation (5 Recent Jobs - Last 7 Days)`);
  console.log(`Target: ${TARGET_JOBS_COUNT} jobs | Hard Timeout: ${GLOBAL_SESSION_TIMEOUT_MS / 1000} seconds`);
  console.log(`======================================================\n`);

  console.log("Connecting to Chrome on port 53178...");
  const browser = await chromium.connectOverCDP("http://127.0.0.1:53178", { noDefaults: true });
  const context = browser.contexts()[0];

  const SEARCH_FEEDS = [
    "https://www.naukri.com/lead-data-scientist-jobs-in-bengaluru?sort=r&jobAge=7&k=lead%20data%20scientist&l=bengaluru",
    "https://www.naukri.com/senior-data-scientist-jobs-in-bengaluru?sort=r&jobAge=7&k=senior%20data%20scientist&l=bengaluru",
    "https://www.naukri.com/ai-engineer-jobs-in-bengaluru?sort=r&jobAge=7&k=ai%20engineer&l=bengaluru",
    "https://www.naukri.com/machine-learning-engineer-jobs-in-bengaluru?sort=r&jobAge=7&k=machine%20learning%20engineer&l=bengaluru",
    "https://www.naukri.com/ml-engineer-jobs-in-bengaluru?sort=r&jobAge=7&k=ml%20engineer&l=bengaluru",
    "https://www.naukri.com/generative-ai-jobs-in-bengaluru?sort=r&jobAge=7&k=generative%20ai&l=bengaluru",
    "https://www.naukri.com/lead-machine-learning-engineer-jobs-in-bengaluru?sort=r&jobAge=7&k=lead%20machine%20learning%20engineer&l=bengaluru",
    "https://www.naukri.com/data-scientist-jobs-in-bengaluru?sort=r&jobAge=7&k=data%20scientist&l=bengaluru"
  ];
  let currentFeedIndex = 0;

  let recPage = context.pages().find((p) => p.url().includes("naukri.com") && !p.url().includes("job-listings-"));
  if (!recPage) {
    console.log(`Opening search feed: ${SEARCH_FEEDS[0]}...`);
    recPage = await context.newPage();
    await recPage.goto(SEARCH_FEEDS[0], { waitUntil: "domcontentloaded" });
  } else {
    await recPage.bringToFront();
    console.log(`Navigating to recent search feed (last 7 days): ${SEARCH_FEEDS[0]}...`);
    await recPage.goto(SEARCH_FEEDS[0], { waitUntil: "domcontentloaded" });
  }

  await recPage.waitForTimeout(3000);

  const appliedUrls = new Set();
  const appliedCompanies = new Set();
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
      console.log(`[STORE APPLIED JOB] Saved to ${APPLIED_FILE}: "${title}" (${company})`);
    } catch (e) {
      console.warn("Could not write to APPLIED_FILE:", e.message);
    }
    saveEncounteredQuestions();
  }

  const sessionStartTime = Date.now();
  const processedIndices = new Set();

  while (appliedCount < TARGET_JOBS_COUNT) {
    if (Date.now() - sessionStartTime >= GLOBAL_SESSION_TIMEOUT_MS) {
      console.log("\n[HARD STOP] Session timeout reached. Stopping all processing cleanly.");
      break;
    }

    console.log(`\n======================================================`);
    console.log(`LOOKING FOR RECENT JOB #${appliedCount + 1} OF ${TARGET_JOBS_COUNT} (Last 7 Days)...`);
    console.log(`======================================================`);

    await recPage.bringToFront();
    await recPage.waitForTimeout(2000);

    let candidateCard = null;

    for (let scrollAttempt = 0; scrollAttempt < 15; scrollAttempt++) {
      const cards = await recPage.evaluate(({ appliedList, companyList }) => {
        const s = document.getElementById("scrollableDiv");
        const cardElements = s
          ? Array.from(s.children)
          : Array.from(document.querySelectorAll("div.cursor-pointer.rounded-3xl.bg-n800, .srp-jobtuple-wrapper"));
        if (!cardElements || cardElements.length === 0) return [];
        return cardElements.map((c, i) => {
          const txt = c.innerText || "";
          const txtLower = txt.toLowerCase();
          const titleEl =
            c.querySelector(".text-title18Sb.text-n100") ||
            c.querySelector(".text-title18Sb") ||
            c.querySelector(".title") ||
            c.querySelector("h2") ||
            c;
          const compEl =
            c.querySelector(".text-title18Sb.text-n200") ||
            c.querySelector(".text-title16Sb.text-n200") ||
            c.querySelector(".comp-name") ||
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
          matchesJobPreferences(c) &&
          isWithinLast7Days(c.snippet)
        ) {
          candidateCard = c;
          break;
        }
      }

      if (candidateCard) break;

      console.log("No unapplied matching recent job in current view. Scrolling...");
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
        console.log(`Switching to recent search feed #${currentFeedIndex + 1}: ${SEARCH_FEEDS[currentFeedIndex]}...`);
        await recPage.goto(SEARCH_FEEDS[currentFeedIndex], { waitUntil: "domcontentloaded" });
        await recPage.waitForTimeout(3000);
        continue;
      } else {
        console.log("No more matching unapplied Quick Apply jobs found across recent search feeds.");
        break;
      }
    }

    processedIndices.add(candidateCard.index);
    console.log(`\nSelected Recent Job #${appliedCount + 1}:`);
    console.log(`- Card Index: ${candidateCard.index}`);
    console.log(`- Title: ${candidateCard.title}`);
    console.log(`- Company: ${candidateCard.company}`);
    console.log(`- Snippet: ${candidateCard.snippet.slice(0, 100)}...`);

    await recPage.evaluate((idx) => {
      const s = document.getElementById("scrollableDiv");
      const card = s ? s.children[idx] : document.querySelectorAll("div.cursor-pointer.rounded-3xl.bg-n800, .srp-jobtuple-wrapper")[idx];
      if (card) {
        card.scrollIntoView({ block: "center" });
      }
    }, candidateCard.index);
    await recPage.waitForTimeout(600);

    const newPagePromise = context.waitForEvent("page", { timeout: 10000 }).catch(() => null);

    await recPage.evaluate((idx) => {
      const s = document.getElementById("scrollableDiv");
      const c = s ? s.children[idx] : document.querySelectorAll("div.cursor-pointer.rounded-3xl.bg-n800, .srp-jobtuple-wrapper")[idx];
      if (c) {
        const t =
          c.querySelector(".text-title18Sb.text-n100") ||
          c.querySelector(".text-title18Sb") ||
          c.querySelector(".title") ||
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
    await jobPage.waitForTimeout(2500);
    const jobUrl = jobPage.url();
    console.log(`Opened Job URL: ${jobUrl}`);

    if (appliedUrls.has(jobUrl.split("?")[0])) {
      console.log("[ALREADY APPLIED IN STORE]: URL previously registered. Closing job tab immediately and moving ahead.");
      if (!jobPage.isClosed()) await jobPage.close();
      continue;
    }

    console.log("Checking if this job displays the 'Applied' option...");
    const appliedCheck = await checkAppliedOption(jobPage);
    if (appliedCheck.isApplied) {
      console.log(`\n>>> [DETECTED APPLIED OPTION]: "${appliedCheck.reason}" - "${appliedCheck.text}" <<<`);
      console.log(`As instructed, simply closing this job tab and moving ahead to the next job.\n`);
      appliedUrls.add(jobUrl.split("?")[0]);
      if (!jobPage.isClosed()) {
        await jobPage.close();
      }
      continue;
    }

    console.log("Job is NOT marked Applied. Attempting to click 'Quick apply'...");
    const clicked = await findAndClickQuickApply(jobPage);
    if (!clicked) {
      console.log("Quick apply button was not clickable on this page. Moving to next candidate.");
      continue;
    }

    console.log(`\n*****************************************************************`);
    console.log(`[MANDATORY USER RULE ENFORCED]: Quick apply was clicked!`);
    console.log(`It is mandatory NOT to close this job tab under any circumstance.`);
    console.log(`*****************************************************************\n`);

    await jobPage.waitForTimeout(3500);

    const statusAfterClick = await jobPage.evaluate(() => {
      const body = document.body.innerText || "";
      let isApplied =
        body.includes("Thank you for your responses") ||
        body.includes("Your profile has been shared") ||
        body.includes("Application sent") ||
        body.includes("Applied successfully");

      const buttons = Array.from(document.querySelectorAll("button, div[role='button']"));
      for (const b of buttons) {
        const bg = window.getComputedStyle(b).backgroundColor;
        const m = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (m && parseInt(m[2], 10) > 120 && parseInt(m[2], 10) > parseInt(m[1], 10) * 1.2 && /applied/i.test(b.innerText)) {
          isApplied = true;
          break;
        }
      }

      const drawer = document.querySelector(".chatbot_Drawer, #desktopChatBotContainer, ._chatBotContainer");
      return { isApplied, hasDrawer: !!drawer };
    });

    let success = false;
    if (statusAfterClick.isApplied && !statusAfterClick.hasDrawer) {
      console.log("Job applied directly without screening questions!");
      success = true;
    } else {
      success = await solveChatbotDrawer(jobPage, candidateCard.title, candidateCard.company, sessionStartTime, GLOBAL_SESSION_TIMEOUT_MS);
    }

    if (success) {
      appliedCount++;
      recordApplied(jobUrl, candidateCard.title, candidateCard.company);
      console.log(`\n======================================================`);
      console.log(`>>> SUCCESSFULLY APPLIED TO JOB #${appliedCount} OF ${TARGET_JOBS_COUNT}! <<<`);
      console.log(`Job: "${candidateCard.title}" at "${candidateCard.company}"`);
      console.log(`URL: ${jobUrl}`);
      console.log(`======================================================\n`);
    } else {
      console.log(`Application was not confirmed for ${jobUrl}. Tab remains open as mandatory.`);
    }

    await recPage.bringToFront();
    await recPage.waitForTimeout(1500);
  }

  saveEncounteredQuestions();

  console.log(`\n======================================================`);
  console.log(`BATCH APPLICATION RUN FINISHED! Total Applied: ${appliedCount} / ${TARGET_JOBS_COUNT} jobs.`);
  console.log(`Total screening questions logged: ${encounteredQuestions.length}`);
  console.log(`======================================================\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Batch runner error:", err);
  process.exit(1);
});
