import { chromium } from "playwright";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

/**
 * LinkedIn Easy Apply automation — Mohammad Sayeed
 *
 * DOM layout (confirmed by live DOM probe):
 *   - Job cards: div.base-search-card inside li in .jobs-search__results-list
 *   - Easy Apply badge: li innerHTML contains "Easy Apply"
 *   - Job link: a.base-card__full-link href*="/jobs/view/"
 *   - Company: h4.base-search-card__subtitle
 *   - Title:   h3.base-search-card__title
 *
 * Uses Chrome Default profile → LinkedIn is already logged in.
 */

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// Playwright-LI profile — signed in by the user
const CHROME_USER_DATA = os.homedir() + "/Library/Application Support/Google/Chrome";
const RESUME_PATH = "/Users/mohammadsayeed/Downloads/Mohammad_Sayeed_Resume_updated.pdf";
const PLUGIN_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const REPORT_FILE = path.join(PLUGIN_ROOT, "runs_data", "linkedin_applied_jobs.json");
const TARGET_COUNT = 6;

const CANDIDATE = {
  firstName: "Mohammad",
  lastName: "Sayeed",
  fullName: "Mohammad Sayeed",
  email: "sayeed.mcs17.du@gmail.com",
  phone: "7982776638",
  location: "Bengaluru, Karnataka, India",
  city: "Bengaluru",
  linkedInUrl: "https://www.linkedin.com/in/mohammad-sayeed",
  githubUrl: "https://github.com/mohd-sayeed786",
  currentTitle: "Senior Data Scientist",
  currentCompany: "Tata Digital",
  experienceYears: 7,
  currentCTC: "36.7 LPA (33 LPA fixed + 3.7 LPA variable)",
  expectedCTC: "53-55 LPA",
  noticePeriod: "30 days",
  country: "India",
};

// Focused search queries targeting India (the eligibility filter will screen city & title alignment)
const SEARCH_URLS = [
  "https://www.linkedin.com/jobs/search/?keywords=Senior%20Data%20Scientist&location=India&f_AL=true&sortBy=DD",
  "https://www.linkedin.com/jobs/search/?keywords=Lead%20Data%20Scientist&location=India&f_AL=true&sortBy=DD",
  "https://www.linkedin.com/jobs/search/?keywords=Senior%20Machine%20Learning%20Engineer&location=India&f_AL=true&sortBy=DD",
  "https://www.linkedin.com/jobs/search/?keywords=Generative%20AI%20Engineer&location=India&f_AL=true&sortBy=DD",
  "https://www.linkedin.com/jobs/search/?keywords=LLM%20Engineer&location=India&f_AL=true&sortBy=DD",
  "https://www.linkedin.com/jobs/search/?keywords=Senior%20AI%20Engineer&location=India&f_AL=true&sortBy=DD",
  "https://www.linkedin.com/jobs/search/?keywords=Lead%20AI%20Engineer&location=India&f_AL=true&sortBy=DD",
  "https://www.linkedin.com/jobs/search/?keywords=Machine%20Learning%20Engineer&location=India&f_AL=true&sortBy=DD",
  "https://www.linkedin.com/jobs/search/?keywords=AI%20Engineer&location=India&f_AL=true&sortBy=DD",
  "https://www.linkedin.com/jobs/search/?keywords=Principal%20Machine%20Learning%20Engineer&location=India&f_AL=true&sortBy=DD",
  "https://www.linkedin.com/jobs/search/?keywords=Applied%20Scientist&location=India&f_AL=true&sortBy=DD",
  "https://www.linkedin.com/jobs/search/?keywords=AI%20Lead&location=India&f_AL=true&sortBy=DD",
  "https://www.linkedin.com/jobs/search/?keywords=ML%20Lead&location=India&f_AL=true&sortBy=DD",
  "https://www.linkedin.com/jobs/search/?keywords=AI%20Architect&location=India&f_AL=true&sortBy=DD",
  "https://www.linkedin.com/jobs/search/?keywords=ML%20Architect&location=India&f_AL=true&sortBy=DD"
];

// ───────── Storage ───────────────────────────────────────────────────────────

async function loadAnswersAndProfile() {
  const root = path.join(os.homedir(), ".job-apply");
  let answers = {}, profile = {};
  try { answers = JSON.parse(await fs.readFile(path.join(root, "answers.json"), "utf-8")).answers || {}; } catch {}
  try { profile = JSON.parse(await fs.readFile(path.join(root, "profile.json"), "utf-8")).profile || {}; } catch {}
  return { answers, profile };
}

async function loadAppliedHistory() {
  const set = new Set();
  try {
    const lines = (await fs.readFile(path.join(os.homedir(), ".job-apply/applications.jsonl"), "utf-8")).split("\n");
    for (const l of lines) {
      if (!l.trim()) continue;
      try { const j = JSON.parse(l); if (j.jobUrl) set.add(j.jobUrl.split("?")[0]); } catch {}
    }
  } catch {}
  try {
    const arr = JSON.parse(await fs.readFile(REPORT_FILE, "utf-8"));
    for (const j of arr) if (j.url) set.add(j.url.split("?")[0]);
  } catch {}
  return set;
}

function appendHistory(company, role, jobUrl) {
  try {
    const event = {
      applicationId: "linkedin_" + Date.now(),
      company: (company || "Unknown").slice(0, 100),
      role: (role || "Senior Data Scientist").slice(0, 100),
      ats: "linkedin-easy-apply",
      jobUrl: jobUrl || "",
      event: "reviewed",
      status: "reviewed",
      appliedAt: new Date().toISOString(),
    };
    const tmp = path.join(os.tmpdir(), "hist_ln_" + Date.now() + ".json");
    fsSync.writeFileSync(tmp, JSON.stringify(event));
    try { execSync('python3 scripts/job-apply-store.py history-append --input "' + tmp + '"'); }
    catch { fsSync.appendFileSync(path.join(os.homedir(), ".job-apply/applications.jsonl"), JSON.stringify(event) + "\n"); }
    try { fsSync.unlinkSync(tmp); } catch {}
    console.log("  [HISTORY] Logged: " + company + " — " + role);
  } catch (e) { console.log("  [HISTORY] Failed: " + e.message); }
}

// ───────── Answer resolution ──────────────────────────────────────────────────

function findStoredAnswer(label, answers) {
  if (!label || !answers) return null;
  const norm = label.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  
  // First pass: Exact match (normalized)
  for (const r of Object.values(answers)) {
    if (!r || r.value == null) continue;
    if (r.question) {
      const rn = r.question.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
      if (norm === rn) return String(r.value);
    }
  }

  // Second pass: Strict containment (current question contains stored question)
  // Fixes broad substring match bug (rn.includes(norm)) which caused general questions to match specific stored answers
  for (const r of Object.values(answers)) {
    if (!r || r.value == null) continue;
    if (r.question) {
      const rn = r.question.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
      if (norm.includes(rn)) return String(r.value);
    }
  }
  return null;
}

function resolveText(label, answers = {}) {
  const q = label.toLowerCase();
  
  // 1. Core skills experience mappings (prevents wrong calculations / overrides stored mismatches)
  if (q.includes("python")) return "7";
  if (q.includes("sql")) return "7";
  if (q.includes("machine learning") || q.includes(" ml ") || q.includes(" ml/")) return "7";
  if (q.includes("data science") || q.includes("data scientist") || q.includes("statistical")) return "7";
  if (q.includes("deep learning") || q.includes("pytorch") || q.includes("tensorflow") || q.includes("keras")) return "5";
  if (q.includes("nlp") || q.includes("natural language processing") || q.includes("bert") || q.includes("roberta")) return "5";
  if (q.includes("pyspark") || q.includes("spark")) return "3";
  if (q.includes("fastapi") || q.includes("flask") || q.includes("api ") || q.includes("apis")) return "4";
  if (q.includes("docker") || q.includes("kubernetes") || q.includes("k8s") || q.includes("container")) return "4";
  if (q.includes("azure") || q.includes("aws") || q.includes("cloud")) return "4";
  if (q.includes("databricks")) return "4";
  if (q.includes("llm") || q.includes("generative ai") || q.includes("gen ai") || q.includes("genai") || q.includes("rag") || q.includes("agentic") || q.includes("prompt")) return "3";
  if (q.includes("credit risk") || q.includes("underwriting") || q.includes("fraud") || q.includes("risk")) return "4";
  if (q.includes("recommendation system") || q.includes("semantic search")) return "4";

  // 2. Check stored answers next
  const stored = findStoredAnswer(label, answers);
  if (stored) return stored;

  // 3. Fallback candidate profile details
  if (q.includes("phone") || q.includes("mobile")) return CANDIDATE.phone;
  if (q.includes("email")) return CANDIDATE.email;
  if (q.includes("first name")) return CANDIDATE.firstName;
  if (q.includes("last name") || q.includes("surname")) return CANDIDATE.lastName;
  if (q === "name" || (q.includes("full name")) || (q.includes("your name") && !q.includes("company"))) return CANDIDATE.fullName;
  if (q.includes("city") || q.includes("current location")) return CANDIDATE.city;
  if (q.includes("address") || q.includes("location")) return CANDIDATE.location;
  if (q.includes("zip") || q.includes("postal")) return "560001";
  if (q.includes("country")) return CANDIDATE.country;
  if (q.includes("linkedin")) return CANDIDATE.linkedInUrl;
  if (q.includes("github") || q.includes("portfolio") || q.includes("website")) return CANDIDATE.githubUrl;
  if ((q.includes("current") || q.includes("present")) && (q.includes("company") || q.includes("employer"))) return CANDIDATE.currentCompany;
  if ((q.includes("current") || q.includes("present")) && (q.includes("title") || q.includes("role") || q.includes("designation"))) return CANDIDATE.currentTitle;
  
  // Custom numeric formats for CTC and Notice Period to prevent validation errors
  if (q.includes("current") && (q.includes("ctc") || q.includes("salary") || q.includes("compensation"))) return "37";
  if ((q.includes("expected") || q.includes("desired") || q.includes("require") || q.includes("target")) && (q.includes("ctc") || q.includes("salary") || q.includes("compensation"))) return "53";
  if (q.includes("notice period") || (q.includes("notice") && !q.includes("legal"))) return "30";
  if (q.includes("salary") || q.includes("ctc") || q.includes("compensation")) {
    if (q.includes("expect") || q.includes("desired") || q.includes("require") || q.includes("target")) return "53";
    return "37";
  }
  
  if (q.includes("experience") || q.includes("years of exp") || q.includes("how many year")) return String(CANDIDATE.experienceYears);
  return null;
}

function resolveRadio(legend, optionText) {
  const q = legend.toLowerCase();
  const opt = optionText.toLowerCase().trim();
  
  if (q.includes("sponsorship") || q.includes("visa")) {
    return opt === "no" || opt.includes("no ") || opt.includes("don't") || opt.includes("do not") || opt.includes("without") || opt.includes("not require");
  }
  if (q.includes("authorized") || q.includes("right to work") || q.includes("legally eligible") || q.includes("work in ")) {
    return opt === "yes" || opt.includes("yes ") || opt.includes("authorized") || opt.includes("legally") || opt.includes("have authorization") || opt.includes("i have");
  }
  if (q.includes("criminal") || q.includes("convicted") || q.includes("disability") || q.includes("gender") || q.includes("veteran")) {
    if (opt.includes("decline") || opt.includes("prefer not") || opt.includes("don't wish")) return true;
    return opt === "no" || opt.includes("no ") || opt.includes("do not");
  }
  if (q.includes("agree") || q.includes("confirm") || q.includes("consent") || q.includes("acknowledge") || q.includes("read and understood")) {
    return opt === "yes" || opt.includes("yes ") || opt.includes("agree") || opt.includes("accept");
  }
  if (q.includes("relocate") || q.includes("willing") || q.includes("travel")) {
    return opt === "yes" || opt.includes("yes ") || opt.includes("willing");
  }
  
  return opt === "yes" || opt.includes("yes ");
}

function resolveSelect(label, options) {
  const q = label.toLowerCase();
  
  if (q.includes("sponsorship") || q.includes("visa")) {
    const found = options.find(o => {
      const ol = o.toLowerCase();
      return ol === "no" || ol.includes("no ") || ol.includes("don't") || ol.includes("do not") || ol.includes("without") || ol.includes("not require");
    });
    if (found) return found;
  }
  if (q.includes("authorized") || q.includes("right to work") || q.includes("legally eligible") || q.includes("work in ")) {
    const found = options.find(o => {
      const ol = o.toLowerCase();
      return ol === "yes" || ol.includes("yes ") || ol.includes("authorized") || ol.includes("legally") || ol.includes("have authorization") || ol.includes("i have");
    });
    if (found) return found;
  }
  if (q.includes("notice period") || q.includes("notice")) {
    const immediate = options.find(o => o.toLowerCase().includes("immediate") || o.toLowerCase().includes("15 days") || o.toLowerCase().includes("1 month") || o.toLowerCase().includes("30 days"));
    if (immediate) return immediate;
  }
  if (q.includes("experience") || q.includes("years")) {
    for (const o of options) {
      const nums = o.match(/\d+/g);
      if (nums && nums.length >= 2 && CANDIDATE.experienceYears >= +nums[0] && CANDIDATE.experienceYears <= +nums[1]) return o;
      if (nums && nums.length === 1 && +nums[0] === CANDIDATE.experienceYears) return o;
      if (/7\+|more than 7|above 7/i.test(o)) return o;
    }
    const match7 = options.find(o => o.includes("7") || o.includes("6") || o.includes("8") || o.includes("5-") || o.includes("7-") || o.includes("6-"));
    if (match7) return match7;
    const matchAnyNum = options.find(o => /\d+/.test(o));
    if (matchAnyNum) return matchAnyNum;
  }
  if (q.includes("gender")) {
    const male = options.find(o => o.toLowerCase() === "male" || o.toLowerCase().includes("decline") || o.toLowerCase().includes("prefer not"));
    if (male) return male;
  }
  
  const yesOpt = options.find(o => o.toLowerCase() === "yes");
  if (yesOpt) return yesOpt;
  
  return options[0] || null;
}

// ───────── Form filling ──────────────────────────────────────────────────────

async function getLabel(page, el) {
  return page.evaluate((el) => {
    const a = el.getAttribute("aria-label") || el.getAttribute("placeholder") || "";
    if (a) return a;
    if (el.id) {
      const lbl = document.querySelector('label[for="' + el.id + '"]');
      if (lbl) return lbl.innerText.trim();
    }
    let p = el.parentElement;
    for (let i = 0; i < 8 && p; i++, p = p.parentElement) {
      const lbl = p.querySelector("label");
      if (lbl) return lbl.innerText.trim();
      const leg = p.querySelector("legend");
      if (leg) return leg.innerText.trim();
    }
    return el.name || el.id || "";
  }, el).catch(() => "");
}

async function fillStep(page, answers) {
  // Text inputs and textareas
  const inputs = await page.$$(
    ".jobs-easy-apply-modal input:not([type=file]):not([type=hidden]):not([type=submit]):not([type=radio]):not([type=checkbox]), " +
    ".jobs-easy-apply-modal textarea"
  );
  for (const inp of inputs) {
    try {
      const existing = await page.evaluate(el => el.value, inp).catch(() => "");
      if (existing.trim()) continue;
      const label = await getLabel(page, inp);
      let answer = resolveText(label, answers);
      if (answer) {
        // Detect if the field is numeric and clean it
        const isNumeric = await page.evaluate(el => {
          const type = el.getAttribute("type") || "";
          const inputmode = el.getAttribute("inputmode") || "";
          const pattern = el.getAttribute("pattern") || "";
          return type === "number" || inputmode === "numeric" || pattern.includes("0-9") || pattern.includes("\\d");
        }, inp).catch(() => false);

        const qLower = label.toLowerCase();
        if (isNumeric || qLower.includes("digits only") || qLower.includes("in lakhs") || qLower.includes("lakhs") || qLower.includes("in digits") || qLower.includes("number of years")) {
          // Extracts floating point numbers (e.g. 36.7)
          const match = answer.match(/\d+(?:\.\d+)?/);
          if (match) {
            console.log(`    [Numeric Check] Cleaning "${answer}" to "${match[0]}" for numeric field "${label}"`);
            answer = match[0];
          }
        }

        await inp.fill(answer, { timeout: 3000 });
        await page.waitForTimeout(100);
        console.log('    [Text] "' + label.slice(0, 50) + '" → ' + answer.slice(0, 40));
      }
    } catch {}
  }

  // Radio groups (fieldsets) — fixture: authorization.sponsorship
  const fieldsets = await page.$$(".jobs-easy-apply-modal fieldset");
  for (const fs of fieldsets) {
    try {
      const legend = await fs.$eval("legend", el => el.innerText.trim()).catch(() => "");
      const radios = await fs.$$("input[type=radio]");
      const alreadyAnswered = (await Promise.all(radios.map(r => r.isChecked().catch(() => false)))).some(Boolean);
      if (alreadyAnswered) continue;
      for (const radio of radios) {
        const optLabel = await page.evaluate(el => {
          const lbl = document.querySelector('label[for="' + el.id + '"]');
          if (lbl) return lbl.innerText.trim();
          return el.nextElementSibling?.innerText?.trim() || "";
        }, radio).catch(() => "");
        if (resolveRadio(legend, optLabel)) {
          await radio.check({ timeout: 3000 }).catch(() => {});
          console.log('    [Radio] "' + legend.slice(0, 60) + '" → ' + optLabel);
          break;
        }
      }
    } catch {}
  }

  // Native selects
  const selects = await page.$$(".jobs-easy-apply-modal select");
  for (const sel of selects) {
    try {
      const existing = await page.evaluate(el => el.value, sel).catch(() => "");
      if (existing && existing !== "Select an option") continue;
      const label = await getLabel(page, sel);
      const opts = await page.evaluate(
        el => Array.from(el.options).map(o => o.text.trim()).filter(t => t && t !== "Select an option"), sel
      ).catch(() => []);
      const chosen = resolveSelect(label, opts);
      if (chosen) {
        await sel.selectOption({ label: chosen }, { timeout: 3000 }).catch(() => {});
        console.log('    [Select] "' + label.slice(0, 50) + '" → ' + chosen);
      }
    } catch {}
  }
}

async function uploadResume(page) {
  try {
    const fileInput = page.locator(".jobs-easy-apply-modal input[type=file]").first();
    if (await fileInput.count() > 0) {
      console.log("    [Resume] Uploading " + path.basename(RESUME_PATH) + "...");
      await fileInput.setInputFiles(RESUME_PATH, { timeout: 10000 });
      await page.waitForTimeout(3000);
      const nameEl = await page.$(
        ".jobs-easy-apply-modal .jobs-document-upload__file-name, " +
        ".jobs-easy-apply-modal [data-test-document-upload-file-name]"
      );
      const shown = nameEl ? (await nameEl.innerText().catch(() => "")).trim() : "(filename element hidden)";
      console.log("    [Resume] Uploaded → " + shown);
      return true;
    }
  } catch (e) { console.log("    [Resume] Error: " + e.message); }
  return false;
}

async function handleTopChoice(page) {
  try {
    const chk = page.locator(".jobs-easy-apply-modal input[type=checkbox]").first();
    if (await chk.count() > 0 && !await chk.isChecked().catch(() => false)) {
      await chk.check({ timeout: 2000 }).catch(() => {});
      console.log("    [Checkbox] Checked top choice.");
    }
  } catch {}
}

async function isReviewPage(page) {
  try {
    const text = await page.$eval(".jobs-easy-apply-modal", el => el.innerText.toLowerCase()).catch(() => "");
    return text.includes("review your application") || text.includes("review application") || text.includes("submit application");
  } catch { return false; }
}

async function isModalOpen(page) {
  try {
    const m = await page.$(".jobs-easy-apply-modal");
    return m ? await m.isVisible().catch(() => false) : false;
  } catch { return false; }
}

async function clickNext(page) {
  for (const lbl of ["Review your application", "Review", "Next", "Continue"]) {
    try {
      const btn = page.locator('.jobs-easy-apply-modal button:has-text("' + lbl + '")').last();
      if (await btn.count() > 0 && await btn.isVisible().catch(() => false) && await btn.isEnabled().catch(() => false)) {
        console.log('    [Nav] "' + (await btn.innerText().catch(() => lbl)).trim() + '"');
        await btn.click({ timeout: 5000 });
        await page.waitForTimeout(2500);
        return lbl;
      }
    } catch {}
  }
  return null;
}

async function dismissModal(page) {
  try {
    const d = page.locator("button[aria-label='Dismiss']").first();
    if (await d.count() > 0 && await d.isVisible().catch(() => false)) {
      await d.click({ timeout: 3000 });
      await page.waitForTimeout(1500);
      const discard = page.locator("button:has-text('Discard')").first();
      if (await discard.count() > 0 && await discard.isVisible().catch(() => false)) {
        await discard.click({ timeout: 2000 });
        await page.waitForTimeout(1000);
      }
    }
  } catch {}
}

// ───────── Validation detection and correction ───────────────────────────────

async function getValidationErrors(page) {
  return await page.evaluate(() => {
    const errorElMsgs = Array.from(document.querySelectorAll(
      '.artdeco-inline-feedback--error, .fb-form-element-error-message, [role="alert"]'
    )).map(el => el.innerText.trim()).filter(Boolean);
    
    const invalidInputs = Array.from(document.querySelectorAll('[aria-invalid="true"]'));
    const invalidInfo = invalidInputs.map(inp => {
      let parent = inp.parentElement;
      let label = "";
      for (let i = 0; i < 8 && parent; i++, parent = parent.parentElement) {
        const lbl = parent.querySelector("label");
        if (lbl) { label = lbl.innerText.trim(); break; }
        const leg = parent.querySelector("legend");
        if (leg) { label = leg.innerText.trim(); break; }
      }
      return `Field "${label || inp.id || inp.name}" is invalid`;
    });
    
    return [...errorElMsgs, ...invalidInfo];
  });
}

async function correctInvalidFields(page, answers) {
  console.log("  [CORRECT] Validation failed. Analyzing invalid fields...");
  try {
    const invalidInputs = [];
    
    // Find inputs with aria-invalid="true" or inside error containers
    const badInputs = await page.$$('.jobs-easy-apply-modal [aria-invalid="true"], .jobs-easy-apply-modal .artdeco-inline-feedback--error input');
    for (const inp of badInputs) {
      invalidInputs.push(inp);
    }
    
    // Fallback: find inputs that have siblings with class containing "error" or inside container with error
    if (invalidInputs.length === 0) {
      const errorContainers = await page.$$('.jobs-easy-apply-modal .artdeco-inline-feedback--error');
      for (const ec of errorContainers) {
        const inp = await ec.evaluateHandle(el => {
          const p = el.parentElement;
          return p?.querySelector('input, textarea, select');
        });
        if (inp) {
          // Check if already added
          let exists = false;
          for (const added of invalidInputs) {
            if (await page.evaluate((a, b) => a === b, inp, added)) { exists = true; break; }
          }
          if (!exists) invalidInputs.push(inp);
        }
      }
    }

    for (const inp of invalidInputs) {
      const isInput = await page.evaluate(el => {
        const tag = el.tagName.toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'select';
      }, inp).catch(() => false);
      if (!isInput) continue;

      const label = await getLabel(page, inp);
      const val = await page.evaluate(el => el.value, inp).catch(() => "");
      console.log(`    [CORRECT] Found invalid field: "${label}" with value "${val}"`);

      const q = label.toLowerCase();
      let newVal = null;
      
      // If it's numeric/notice period/CTC/experience, clean it to digits/decimals only
      if (q.includes("notice") || q.includes("ctc") || q.includes("salary") || q.includes("experience") || q.includes("year") || q.includes("lpa") || q.includes("lakh")) {
        const match = val.match(/\d+(?:\.\d+)?/);
        if (match) {
          newVal = match[0];
          console.log(`    [CORRECT] Cleaned numeric value from "${val}" to "${newVal}"`);
        }
      }
      
      // Fallback defaults
      if (!newVal) {
        if (q.includes("notice")) newVal = "30";
        else if (q.includes("experience") || q.includes("year")) newVal = "7";
        else if (q.includes("ctc") || q.includes("salary")) newVal = q.includes("expected") ? "53" : "37";
        else if (q.includes("city") || q.includes("location")) newVal = CANDIDATE.city;
      }

      if (newVal && newVal !== val) {
        await inp.fill("");
        await inp.fill(newVal, { timeout: 3000 });
        await page.waitForTimeout(200);
        console.log(`    [CORRECT] Filled corrected value: "${newVal}" into field "${label}"`);
      }
    }
  } catch (e) {
    console.log(`    [CORRECT] Error in correction loop: ${e.message}`);
  }
}

async function submitApplication(page) {
  try {
    const submitBtn = page.locator('.jobs-easy-apply-modal button:has-text("Submit application"), .jobs-easy-apply-modal button:has-text("Submit"), .jobs-easy-apply-modal button[type="submit"]').first();
    if (await submitBtn.count() > 0 && await submitBtn.isVisible().catch(() => false) && await submitBtn.isEnabled().catch(() => false)) {
      console.log('    [Submit] Clicking "Submit application"...');
      await submitBtn.click({ timeout: 5000 });
      await page.waitForTimeout(3000);
      
      // 1. Check if the modal closed automatically (indicator of success)
      if (!await isModalOpen(page)) {
        console.log("    [Submit] Modal closed automatically. Treating as successful submission.");
        return true;
      }
      
      // 2. Check for success text pattern in open modal
      const successText = await page.evaluate(() => {
        const modal = document.querySelector(".jobs-easy-apply-modal");
        return modal ? modal.innerText : "";
      }).catch(() => "");
      
      const lower = successText.toLowerCase();
      if (lower.includes("done") || lower.includes("submitted") || lower.includes("successful") || lower.includes("thank you") || lower.includes("sent") || lower.includes("applied")) {
        console.log("    [Submit] Application submitted successfully!");
        const doneBtn = page.locator('.jobs-easy-apply-modal button:has-text("Done")').first();
        if (await doneBtn.count() > 0 && await doneBtn.isVisible().catch(() => false)) {
          await doneBtn.click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(1500);
        }
        return true;
      }

      // 3. Fallback: check if the page body contains indicators of successful application
      const pageText = await page.evaluate(() => document.body.innerText.toLowerCase()).catch(() => "");
      if (pageText.includes("application submitted") || pageText.includes("application sent") || pageText.includes("successfully applied")) {
        console.log("    [Submit] Page text indicates successful submission.");
        return true;
      }
    }
  } catch (e) {
    console.log(`    [Submit] Error submitting: ${e.message}`);
  }
  return false;
}

// ───────── Target Policy & Verification Filtering ──────────────────────────

/**
 * Validates a job against applicant's target roles, seniority criteria, and geographic preferences.
 */
function isJobEligible(title, company, locationText) {
  const titleLower = title.toLowerCase();
  const locationLower = (locationText || "").toLowerCase();

  // Helper matching whole word (e.g. \bml\b or \bai\b)
  const hasWord = (str, word) => {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    return regex.test(str);
  };

  // 1. Role Domain Match (Must relate to Modern Data Science, ML, AI, GenAI)
  const hasPositive = 
    titleLower.includes("data scientist") ||
    titleLower.includes("data science") ||
    titleLower.includes("machine learning") ||
    hasWord(titleLower, "ml") ||
    hasWord(titleLower, "ai") ||
    titleLower.includes("applied scientist") ||
    titleLower.includes("generative ai") ||
    titleLower.includes("genai") ||
    titleLower.includes("gen ai") ||
    titleLower.includes("llm") ||
    titleLower.includes("rag") ||
    titleLower.includes("agentic") ||
    titleLower.includes("deep learning") ||
    titleLower.includes("nlp") ||
    titleLower.includes("recommendation") ||
    titleLower.includes("semantic search") ||
    titleLower.includes("fraud") ||
    titleLower.includes("risk");

  if (!hasPositive) {
    return { eligible: false, reason: "Title does not match target domains (Data Science, ML, AI, GenAI)" };
  }

  // 2. Exclude Role Categories
  const isExcluded =
    titleLower.includes("data analyst") ||
    titleLower.includes("business analyst") ||
    titleLower.includes("bi analyst") ||
    titleLower.includes("systems analyst") ||
    titleLower.includes("reporting analyst") ||
    titleLower.includes("analytics analyst") ||
    titleLower.includes("business intelligence") ||
    titleLower.includes("power bi") ||
    titleLower.includes("tableau") ||
    titleLower.includes("devops") ||
    titleLower.includes("qa") ||
    titleLower.includes("quality assurance") ||
    titleLower.includes("test engineer") ||
    titleLower.includes("tester") ||
    titleLower.includes("scrum") ||
    titleLower.includes("fullstack") ||
    titleLower.includes("full stack") ||
    titleLower.includes("frontend") ||
    titleLower.includes("front end") ||
    titleLower.includes("backend") ||
    titleLower.includes("back end") ||
    titleLower.includes("web developer") ||
    titleLower.includes("ui/ux") ||
    titleLower.includes("ui engineer") ||
    titleLower.includes("ux engineer") ||
    titleLower.includes("android") ||
    titleLower.includes("ios") ||
    titleLower.includes("salesforce") ||
    titleLower.includes("sap") ||
    titleLower.includes("kinaxis") ||
    titleLower.includes("workday") ||
    titleLower.includes("recruiter") ||
    titleLower.includes("sales executive") ||
    // Data engineer check: reject if contains "data engineer" unless it has ML / AI
    (titleLower.includes("data engineer") && !titleLower.includes("machine learning") && !titleLower.includes("ml") && !titleLower.includes("ai"));

  if (isExcluded) {
    return { eligible: false, reason: "Excluded role category (Analyst, BI, Data Eng, QA, Fullstack, etc.)" };
  }

  // 3. Junior indicator check
  const isJunior = 
    titleLower.includes("junior") ||
    titleLower.includes("jr") ||
    titleLower.includes("intern") ||
    titleLower.includes("trainee") ||
    titleLower.includes("graduate") ||
    titleLower.includes("fresher") ||
    titleLower.includes("student") ||
    titleLower.includes("scholar") ||
    (titleLower.includes("associate") && !titleLower.includes("architect") && !titleLower.includes("lead") && !titleLower.includes("director") && !titleLower.includes("manager"));

  if (isJunior) {
    return { eligible: false, reason: "Junior or entry-level role" };
  }

  // 4. Seniority / Specialization check
  const hasSeniority = 
    titleLower.includes("senior") ||
    titleLower.includes("sr") ||
    titleLower.includes("lead") ||
    titleLower.includes("architect") ||
    titleLower.includes("principal") ||
    titleLower.includes("staff") ||
    titleLower.includes("head") ||
    titleLower.includes("manager") ||
    titleLower.includes("director") ||
    titleLower.includes("advisor") ||
    titleLower.includes("expert") ||
    titleLower.includes("specialist");

  const isSpecialized = 
    titleLower.includes("applied scientist") ||
    titleLower.includes("generative ai") ||
    titleLower.includes("genai") ||
    titleLower.includes("gen ai") ||
    titleLower.includes("llm") ||
    titleLower.includes("rag") ||
    titleLower.includes("agentic") ||
    titleLower.includes("ai engineer") ||
    titleLower.includes("ml engineer") ||
    titleLower.includes("ai/ml engineer") ||
    titleLower.includes("machine learning engineer");

  if (!hasSeniority && !isSpecialized) {
    return { eligible: false, reason: "Role does not specify seniority or ML specialization (e.g. Senior/Lead/Applied Scientist)" };
  }

  // 5. Geographic validation (Prioritize Bangalore/Hyderabad, allow remote, reject other cities)
  if (locationLower) {
    const isBannedCity = 
      locationLower.includes("mumbai") ||
      locationLower.includes("pune") ||
      locationLower.includes("chennai") ||
      locationLower.includes("delhi") ||
      locationLower.includes("noida") ||
      locationLower.includes("gurgaon") ||
      locationLower.includes("gurugram") ||
      locationLower.includes("kolkata") ||
      locationLower.includes("ahmedabad") ||
      locationLower.includes("jaipur") ||
      locationLower.includes("kochi") ||
      locationLower.includes("thiruvananthapuram") ||
      locationLower.includes("coimbatore") ||
      locationLower.includes("lucknow");

    const isAllowedLocation = 
      locationLower.includes("bengaluru") ||
      locationLower.includes("bangalore") ||
      locationLower.includes("hyderabad") ||
      locationLower.includes("remote") ||
      locationLower.includes("work from home") ||
      (locationLower.includes("india") && !isBannedCity);

    if (!isAllowedLocation) {
      return { eligible: false, reason: `Location "${locationText}" is outside preferred regions (Bengaluru, Hyderabad, Remote)` };
    }
  }

  return { eligible: true };
}

// ───────── Per-job flow ──────────────────────────────────────────────────────

async function applyToJob(page, jobUrl, jobTitle, jobCompany, answers) {
  console.log("\n  [JOB] " + jobTitle + " @ " + jobCompany);
  console.log("  URL: " + jobUrl);

  await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 35000 });
  await page.waitForTimeout(4000);
  await page.evaluate(() => window.scrollBy(0, 400));
  await page.waitForTimeout(1200);

  // Scrape page details for double-verification
  const pageDetails = await page.evaluate(() => {
    const titleEl = document.querySelector(".job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1");
    // Find company
    const compEl = document.querySelector(".job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, .jobs-unified-top-card__primary-description a");
    // Find location
    const locEl = document.querySelector(".job-details-jobs-unified-top-card__primary-description, .jobs-unified-top-card__primary-description");
    
    return {
      title: titleEl ? titleEl.innerText.trim() : "",
      company: compEl ? compEl.innerText.trim() : "",
      location: locEl ? locEl.innerText.trim() : ""
    };
  }).catch(() => null);

  if (pageDetails && pageDetails.title) {
    const eligibility = isJobEligible(pageDetails.title, pageDetails.company || jobCompany, pageDetails.location);
    if (!eligibility.eligible) {
      console.log(`  [SKIP ELIGIBILITY DETAIL] ${pageDetails.company || jobCompany} — ${pageDetails.title}: ${eligibility.reason}`);
      return { status: "ineligible", jobTitle: pageDetails.title, jobCompany: pageDetails.company || jobCompany, jobUrl, reachedReview: false };
    }
  }

  // Find Easy Apply button
  let applyBtn = null;
  const allBtns = await page.$$("button, a");
  for (const b of allBtns) {
    const t = (await b.innerText().catch(() => "")).trim();
    if (t.toLowerCase().includes("easy apply")) { applyBtn = b; break; }
  }

  if (!applyBtn) {
    // LinkedIn logged-out shows different markup — try attribute selectors
    const try2 = page.locator(".jobs-apply-button--top-card button, .jobs-s-apply button, .jobs-apply-button--top-card a, .jobs-s-apply a").first();
    if (await try2.count() > 0) {
      const t = (await try2.innerText().catch(() => "")).toLowerCase();
      if (t.includes("easy apply")) applyBtn = try2;
    }
  }

  if (!applyBtn) {
    const bodyLower = await page.$eval("body", el => el.innerText.toLowerCase()).catch(() => "");
    if (bodyLower.includes("already applied")) {
      console.log("  [SKIP] Already applied.");
      return { status: "already_applied", jobTitle, jobCompany, jobUrl, reachedReview: false };
    }
    console.log("  [SKIP] No Easy Apply button found.");
    return { status: "no_button", jobTitle, jobCompany, jobUrl, reachedReview: false };
  }

  console.log("  [APPLY] Clicking Easy Apply...");
  await applyBtn.click({ timeout: 5000 }).catch(async () => { await applyBtn.evaluate(el => el.click()); });
  await page.waitForTimeout(3000);

  if (!await isModalOpen(page)) {
    console.log("  [SKIP] Wizard modal did not open.");
    return { status: "modal_failed", jobTitle, jobCompany, jobUrl, reachedReview: false };
  }
  console.log("  [MODAL] Easy Apply wizard opened.");

  let stepCount = 0, reachedReview = false, stuckCount = 0;
  while (stepCount < 15) {
    stepCount++;
    if (!await isModalOpen(page)) { console.log("  [INFO] Modal closed."); break; }

    const progress = await page.$eval(".jobs-easy-apply-modal progress", el => el.value + "/" + el.max).catch(() => "?");
    const stepTitle = await page.$eval(
      ".jobs-easy-apply-modal h3, .jobs-easy-apply-form-section__grouping-title",
      el => el.innerText.trim()
    ).catch(() => "");
    console.log("  [Step " + stepCount + "] " + progress + " | " + stepTitle);

    if (await isReviewPage(page)) {
      reachedReview = true;
      const preview = await page.$eval(".jobs-easy-apply-modal", el => el.innerText.slice(0, 400)).catch(() => "");
      console.log("  [REVIEW] ✅ Final review reached!\n" + preview.split("\n").slice(0,6).map(l=>"    "+l).join("\n"));
      
      const submitted = await submitApplication(page);
      return { status: submitted ? "applied" : "at_review", jobTitle, jobCompany, jobUrl, steps: stepCount, reachedReview, submitted };
    }

    const html = await page.$eval(".jobs-easy-apply-modal", el => el.innerHTML).catch(() => "");
    if (html.includes('type="file"') || html.toLowerCase().includes("upload resume")) await uploadResume(page);
    if (html.includes('type="checkbox"')) await handleTopChoice(page);
    await fillStep(page, answers);
    await page.waitForTimeout(400);

    const clicked = await clickNext(page);
    if (!clicked) {
      try {
        const footerBtns = await page.$$(".jobs-easy-apply-modal footer button");
        if (footerBtns.length > 0) {
          const last = footerBtns[footerBtns.length - 1];
          const t = (await last.innerText().catch(() => "")).toLowerCase().trim();
          if (!["dismiss","close","back","discard","cancel"].includes(t)) {
            console.log('    [Nav-fallback] "' + t + '"');
            await last.click({ timeout: 3000 }); 
            await page.waitForTimeout(2500);
            
            // Check if the fallback button clicked was a submit button
            if (t.includes("submit application") || t === "submit") {
              await page.waitForTimeout(1000);
              if (!await isModalOpen(page)) {
                console.log("    [Nav-fallback] Submitted successfully (modal closed)!");
                return { status: "applied", jobTitle, jobCompany, jobUrl, steps: stepCount, reachedReview: true, submitted: true };
              }
            }
          } else { console.log("  [Nav] Stuck."); break; }
        } else break;
      } catch { break; }
    }

    // Check if progress or title changed; if not, we are stuck
    await page.waitForTimeout(1000);
    const newProgress = await page.$eval(".jobs-easy-apply-modal progress", el => el.value + "/" + el.max).catch(() => "?");
    const newStepTitle = await page.$eval(
      ".jobs-easy-apply-modal h3, .jobs-easy-apply-form-section__grouping-title",
      el => el.innerText.trim()
    ).catch(() => "");

    if (newProgress === progress && newStepTitle === stepTitle) {
      stuckCount++;
      console.log(`    [INFO] Progress did not advance (Stuck count: ${stuckCount}). Check error state.`);
      
      const errors = await getValidationErrors(page);
      if (errors.length > 0) {
        console.log("    [Validation Errors]:\n" + errors.map(err => "      - " + err).join("\n"));
      }
      
      // Attempt correction
      await correctInvalidFields(page, answers);
      
      if (stuckCount >= 2) {
        console.log("    [STUCK] Unable to resolve validation errors after correction. Manual intervention required or skipping.");
        break;
      }
    } else {
      stuckCount = 0;
    }
  }

  return { status: reachedReview ? "at_review" : "partial", jobTitle, jobCompany, jobUrl, steps: stepCount, reachedReview };
}

// ───────── Card scraping ─────────────────────────────────────────────────────

async function collectEasyApplyCards(page, searchUrl) {
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 35000 });
  await page.waitForTimeout(5000);
  // Container-aware scrolling targeting the actual side results pane
  const scrolled = await page.evaluate(async () => {
    const list = document.querySelector('.jobs-search-results-list, div[class*="search-results-list"], div[class*="jobs-search__results-list"], .jobs-search-results-display');
    if (list) {
      for (let i = 0; i < 8; i++) {
        list.scrollTop = (list.scrollHeight / 8) * (i + 1);
        await new Promise(r => setTimeout(r, 600));
      }
      return 'container list scrolled';
    }
    
    // Fallback: window scrolling
    for (let i = 0; i < 6; i++) {
      window.scrollBy(0, 800);
      await new Promise(r => setTimeout(r, 600));
    }
    return 'fallback window scrolled';
  }).catch(() => 'error during scroll');

  console.log('  [Scroll] Result: ' + scrolled);
  await page.waitForTimeout(1000);

  const jobs = await page.evaluate(() => {
    const result = [];

    // Primary selector — confirmed by live DOM probe on logged-in account
    const liItems = document.querySelectorAll("li[data-occludable-job-id]");
    for (const li of liItems) {
      try {
        // Easy Apply badge check
        const isEasy = li.innerHTML.toLowerCase().includes("easy apply");
        if (!isEasy) continue;

        // Title: aria-label on the link is the cleanest source
        const titleLinkEl = li.querySelector("a.job-card-list__title--link, a.job-card-container__link");
        const title = (titleLinkEl?.getAttribute("aria-label") || titleLinkEl?.innerText || "").trim().split("\n")[0];

        // Company
        const compEl = li.querySelector(
          ".artdeco-entity-lockup__subtitle, .job-card-container__primary-description, " +
          ".job-card-container__company-name, span[class*='company']"
        );
        const company = (compEl?.innerText || "").trim().split("\n")[0];

        // Location
        const locEl = li.querySelector(
          ".job-card-container__metadata-item, .job-card-container__primary-description + span, " +
          ".job-card-container__metadata-wrapper li, span[class*='location']"
        );
        const location = (locEl?.innerText || "").trim().split("\n")[0];

        // Job URL
        const linkEl = li.querySelector("a[href*='/jobs/view/']");
        let href = linkEl?.href || linkEl?.getAttribute("href") || "";
        if (href.startsWith("/")) href = "https://www.linkedin.com" + href;
        href = href.split("?")[0];

        if (title && href) {
          result.push({ title, company: company || "Unknown Company", url: href, location: location || "" });
        }
      } catch {}
    }

    return result;
  });

  console.log("  Found " + jobs.length + " Easy Apply cards.");
  return jobs;
}

// ───────── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log("============================================================");
  console.log("  LinkedIn Easy Apply — Mohammad Sayeed");
  console.log("  Target: " + TARGET_COUNT + " jobs (Automated submission enabled)");
  console.log("============================================================\n");

  // Use Playwright-LI profile — user has signed in here
  console.log("Launching Chrome with Playwright-LI profile (LinkedIn signed in)...");
  const context = await chromium.launchPersistentContext(CHROME_USER_DATA + "/Playwright-LI", {
    executablePath: CHROME_PATH,
    headless: false,
    viewport: null,
    args: ["--no-first-run", "--no-default-browser-check"],
  });

  const page = context.pages()[0] || await context.newPage();

  await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(4000);

  // Check login state
  const notLoggedIn = await page.$("a[data-tracking-control-name*='signin'], form#session_key").catch(() => null);
  if (notLoggedIn) {
    console.log("Not logged into LinkedIn. Waiting up to 90s for you to log in... ");
    try { await page.waitForURL("**/feed/**", { timeout: 90000 }); await page.waitForTimeout(2000); }
    catch { console.log("Login timeout. Please log in and re-run."); await context.close().catch(()=>{}); process.exit(1); }
  }
  console.log("✓ LinkedIn logged in.\n");

  const { answers } = await loadAnswersAndProfile();
  const appliedHistory = await loadAppliedHistory();
  console.log("Stored answers: " + Object.keys(answers).length);
  console.log("Previously tracked: " + appliedHistory.size + " applications.\n");

  const allResults = [];
  const appliedThisRun = [];

    for (const offset of [0, 25, 50, 75]) {
    if (appliedThisRun.length >= TARGET_COUNT) break;
    
    console.log(`\n============================================================`);
    console.log(`=== STARTING CRAWL PASS: PAGE OFFSET ${offset} ===`);
    console.log(`============================================================`);

    for (const searchUrl of SEARCH_URLS) {
      if (appliedThisRun.length >= TARGET_COUNT) break;
      const pageUrl = searchUrl + `&start=${offset}`;
      const kw = decodeURIComponent(searchUrl.match(/keywords=([^&]+)/)?.[1] || "?");
      console.log("\n========================================");
      console.log(`Searching: ${kw} (Offset: ${offset})`);
      console.log("========================================");

      let jobs = [];
      try { jobs = await collectEasyApplyCards(page, pageUrl); }
      catch (e) { console.log("  Search error: " + e.message); continue; }

      const uniqueJobs = [];
      const seenLocal = new Set();
      for (const job of jobs) {
        const cu = job.url.split("?")[0];
        if (!seenLocal.has(cu)) {
          seenLocal.add(cu);
          uniqueJobs.push(job);
        }
      }

      for (const job of uniqueJobs) {
        if (appliedThisRun.length >= TARGET_COUNT) break;
        const cleanUrl = job.url.split("?")[0];
        if (appliedHistory.has(cleanUrl)) { console.log("  [SKIP] Already tracked: " + job.company + " — " + job.title); continue; }

        // 1. Initial job eligibility pre-filtering from the collections
        const eligibility = isJobEligible(job.title, job.company, job.location);
        if (!eligibility.eligible) {
          console.log(`  [SKIP ELIGIBILITY] ${job.company} — ${job.title} (${job.location || "No Location"}): ${eligibility.reason}`);
          continue;
        }

        let result;
        try {
          result = await applyToJob(page, cleanUrl, job.title, job.company, answers);
          
          if (result.status === "ineligible") {
            continue;
          }

          allResults.push({ ...result, url: cleanUrl });

          if (result.reachedReview) {
            appliedThisRun.push({ ...result, url: cleanUrl });
            appliedHistory.add(cleanUrl);
            appendHistory(job.company, job.title, cleanUrl);
            
            if (result.submitted) {
              console.log("\n>>> [" + appliedThisRun.length + "/" + TARGET_COUNT + "] SUBMITTED: " + job.company + " — " + job.title);
              console.log("    ╔══════════════════════════════════════════╗");
              console.log("    ║      APPLICATION SUBMITTED SUCCESSFULLY  ║");
              console.log("    ╚══════════════════════════════════════════╝");
              await page.waitForTimeout(2000);
              if (await isModalOpen(page)) {
                await dismissModal(page);
              }
            } else {
              console.log("\n>>> [" + appliedThisRun.length + "/" + TARGET_COUNT + "] REVIEW READY (Unsubmitted): " + job.company + " — " + job.title);
              console.log("    ╔══════════════════════════════════════════╗");
              console.log("    ║  FORM IS FILLED — CLICK SUBMIT MANUALLY  ║");
              console.log("    ╚══════════════════════════════════════════╝");
              await page.waitForTimeout(15000);
              await dismissModal(page);
            }
          } else {
            console.log("  Status: " + result.status + " (" + (result.steps||0) + " steps)");
            await dismissModal(page);
          }
        } catch (e) {
          console.log("  [ERROR] " + job.company + ": " + e.message);
          allResults.push({ status: "error", error: e.message, jobTitle: job.title, jobCompany: job.company, url: cleanUrl, reachedReview: false });
          await dismissModal(page);
        }
        await page.waitForTimeout(2000);
      }
    }
  }

  await fs.mkdir(path.join(PLUGIN_ROOT, "runs_data"), { recursive: true });
  await fs.writeFile(REPORT_FILE, JSON.stringify(allResults, null, 2));

  console.log("\n============================================================");
  console.log("DONE: " + appliedThisRun.length + "/" + TARGET_COUNT + " applications handled");
  console.log("Report: runs_data/linkedin_applied_jobs.json");
  console.log("============================================================\nSummary:");
  for (const r of allResults) {
    const icon = r.submitted ? "[SUBMITTED✓]" : r.reachedReview ? "[REVIEW✓]" : r.status === "error" ? "[ERROR]" : "[" + (r.status||"?").toUpperCase() + "]";
    console.log("  " + icon + " " + (r.jobCompany||"?") + " - " + (r.jobTitle||"?"));
    if (r.error) console.log("           Error: " + r.error);
  }

  if (appliedThisRun.length > 0 && !appliedThisRun.every(r => r.submitted)) {
    console.log("\nBrowser will stay open for 3 minutes. Submit [REVIEW✓] jobs manually.");
    await page.waitForTimeout(180000);
  }

  await context.close().catch(() => {});
  process.exit(0);
}

main().catch(err => { console.error("[FATAL]", err.message || err); process.exit(1); });
