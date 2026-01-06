# Job Search Assistant

A Claude Code skill for searching LinkedIn jobs with a focus on finding positions where you have network connections or hiring managers are listed.

---

## Initial Prompt

When this skill is invoked, first check if a profile exists at `~/.claude-job-profile.json`.

**If NO profile exists**, say:

> Welcome to the Job Search Assistant! I'll help you find jobs on LinkedIn where you have connections or hiring managers are listed.
>
> First, I need to set up your profile so I can suggest relevant search terms based on your experience.
>
> **Please provide the path to your resume file** (PDF, DOCX, or TXT).
>
> For example: `~/Documents/resume.pdf` or `/Users/you/Desktop/MyResume.pdf`

Then wait for the user to provide the path before proceeding with profile extraction.

**If a profile DOES exist**, analyze it and present suggestions:

> Welcome back! I found your profile at `~/.claude-job-profile.json`.
>
> Based on your resume, here's what I suggest for your job search:
>
> **Keywords**: [Most recent job title], [Related titles based on skills]
> **Location**: [City, State from profile]
> **Experience Level**: [Calculated level] ([X] years of experience)
>
> Would you like to:
> 1. Search with these suggestions
> 2. Modify the keywords, location, or other filters
> 3. Reset your profile from a new resume
>
> Just let me know how you'd like to proceed!

---

## Required Input

- **Resume file path**: Only if no profile exists at `~/.claude-job-profile.json`

## Auto-Inferred from Profile

These values are automatically extracted from the user's profile and presented for confirmation:

- **Keywords**: Suggested from job titles in `workHistory` and `skills` array
- **Location**: From `profile.location` (city, state)
- **Experience Level**: Calculated from total years in `workHistory`
  - 0-2 years: Entry level
  - 2-5 years: Associate
  - 5-10 years: Mid-Senior level
  - 10+ years: Director/Executive

## Optional Filters

User can specify or modify:

- **Work Type**: remote, hybrid, onsite, or all
- **Posted Within**: 24 hours, past week, past month, or any time
- **Max Results**: Number of jobs to analyze (default: 10, max: 25)

---

## Profile Storage

The profile is stored at `~/.claude-job-profile.json` and shared with the `/job-apply` skill. Run `/job-search reset profile` to re-extract from a new resume.

## Results Storage

Search results are automatically saved to `~/.claude-job-searches/search-{timestamp}.json`. This enables:
- Review of past searches
- Easy reference for follow-up actions
- Structured data for further analysis

---

## Workflow

### Phase 1: Profile & Keyword Setup

1. **Check for existing profile** at `~/.claude-job-profile.json`
2. **If no profile exists**:
   - Request resume file path from user
   - Read the resume file using the Read tool
   - Extract structured data into profile format (same as job-apply skill):
     - `firstName`, `lastName`, `email`, `phone`
     - `location` (city, state, country, zip)
     - `linkedInUrl`, `portfolioUrl`, `githubUrl`
     - `workHistory[]`: array of { company, title, startDate, endDate, current, description }
     - `education[]`: array of { school, degree, field, startDate, endDate, gpa }
     - `skills[]`: array of skill strings
   - Present extracted data to user for review
   - Save confirmed profile to `~/.claude-job-profile.json`
3. **Analyze profile** to generate search suggestions:
   - Extract job titles from `workHistory` (most recent first)
   - Identify key skills from `skills` array
   - Generate related/adjacent job titles
   - Calculate experience level from work history dates
   - Extract location from profile
4. **Present suggestions** to user with all inferred values
5. **Let user confirm or modify** keywords, location, experience level
6. **Collect additional preferences**: work type, recency filter
7. **Confirm final search parameters** before proceeding

### Phase 2: LinkedIn Navigation

1. **Ensure browser context exists** using `tabs_context_mcp`
2. **Create new tab** if needed using `tabs_create_mcp`
3. **Navigate to LinkedIn Jobs**: `https://www.linkedin.com/jobs/`
4. **Verify user is logged in**:
   - Use `read_page` to check for profile menu or sign-in buttons
   - If not logged in, STOP and instruct user: "Please log into LinkedIn in this browser tab, then let me know when you're ready."
5. **Build search URL** with parameters (see LinkedIn URL Parameters below)
6. **Navigate to search URL**
7. **Wait for results to load** using `computer` with wait action (2-3 seconds)

### Phase 3: Job Extraction

For each job listing (up to maxResults):

1. **Read job cards** from results list using `read_page`
2. **Click into job detail page** using `computer` with left_click on job title
3. **Wait for detail page to load** (1-2 seconds)
4. **Extract job information**:
   - Title, company name, location
   - Posted date, applicant count
   - Work type (Remote/Hybrid/On-site)
   - Apply method (Easy Apply vs external)
5. **Look for connection indicators**:
   - Use `find` with query: "connections work here" or "connections at"
   - Extract connection count and names if visible
6. **Look for hiring team section**:
   - Use `find` with query: "hiring team" or "Meet the hiring team"
   - If found, extract hiring manager name, title, and profile URL
7. **Store extracted data** in results array
8. **Navigate back** to results list or click next job card
9. **Add delay** between jobs (2-3 seconds to avoid rate limiting)

### Phase 4: Results Processing

1. **Sort results by priority**:
   - Priority 1 (Highest): Jobs with hiring manager listed
   - Priority 2: Jobs with 1st-degree connections
   - Priority 3: Jobs with 2nd-degree or alumni connections
   - Priority 4: Jobs with no network advantage
2. **Create results directory** if needed: `~/.claude-job-searches/`
3. **Save results to JSON file**: `~/.claude-job-searches/search-{ISO-timestamp}.json`
4. **Display formatted summary** in terminal (see Output Format below)
5. **Inform user** of saved file location

---

## LinkedIn URL Parameters

Base URL: `https://www.linkedin.com/jobs/search/`

| Parameter | Purpose | Values |
|-----------|---------|--------|
| `keywords` | Search terms | URL-encoded string |
| `location` | Geographic area | City, state, or country name |
| `f_WT` | Work type | `1` (on-site), `2` (hybrid), `3` (remote) |
| `f_TPR` | Time posted | `r86400` (24h), `r604800` (week), `r2592000` (month) |
| `f_E` | Experience level | `1` (intern), `2` (entry), `3` (associate), `4` (mid-senior), `5` (director), `6` (executive) |
| `f_JIYN` | In your network | `true` (shows jobs at companies with connections) |
| `f_AL` | Actively hiring | `true` |
| `f_EA` | Easy Apply only | `true` |
| `sortBy` | Sort order | `DD` (date), `R` (relevance) |

**Example URL:**
```
https://www.linkedin.com/jobs/search/?keywords=Senior%20Software%20Engineer&location=San%20Francisco%2C%20CA&f_WT=2%2C3&f_E=4&f_TPR=r604800&sortBy=DD
```

---

## Chrome MCP Tool Usage

### Checking Authentication

```
Use read_page to look for:
- Profile menu in top navigation (user is logged in)
- "Sign in" or "Join now" buttons (user is NOT logged in)

If not logged in, stop and inform user.
```

### Reading Job Listings

```
Use read_page with filter: "interactive" to see job cards
Each job card typically contains:
- Job title (clickable link)
- Company name
- Location
- Posted date
- Easy Apply badge (if applicable)
```

### Finding Connections

```
After clicking into job detail:
1. Use find with query: "connections work here"
2. Or use find with query: "connections at this company"
3. Look for section showing connection profile pictures/names
```

### Finding Hiring Manager

```
After clicking into job detail:
1. Use find with query: "Meet the hiring team"
2. Or use find with query: "hiring manager"
3. If found, extract:
   - Name (usually in heading or profile card)
   - Title (usually below name)
   - Profile link (href on the card)
```

### Scrolling for More Results

```
LinkedIn uses infinite scroll:
1. Use computer with action: "scroll", scroll_direction: "down"
2. Wait 2-3 seconds for new results to load
3. Use read_page to see newly loaded job cards
4. Repeat until desired count or no more results
```

---

## Output Format

### Terminal Display

```
=== LinkedIn Job Search Results ===
Search: "Senior Software Engineer" in San Francisco, CA
Filters: Remote/Hybrid | Past Week | Mid-Senior Level
Found: 12 jobs analyzed

Saved to: ~/.claude-job-searches/search-2026-01-06T10-30-00.json

-----------------------------------------------------------
1. [HIRING MANAGER] Senior Software Engineer
   Company: Acme Corp
   Location: San Francisco, CA (Remote)
   Posted: 2 days ago | 45 applicants

   Hiring Manager: Jane Smith (Engineering Manager)
   Connections: 2 (John Doe, Sarah Lee)

   Apply: Easy Apply
   URL: https://linkedin.com/jobs/view/123456
-----------------------------------------------------------

2. [CONNECTIONS] Staff Software Engineer
   Company: TechStart Inc
   Location: Palo Alto, CA (Hybrid)
   Posted: 1 day ago | 23 applicants

   Connections: 5 (including 2 Stanford alumni)

   Apply: Easy Apply
   URL: https://linkedin.com/jobs/view/789012
-----------------------------------------------------------

... (additional results)

=== Summary ===
- 2 jobs with hiring managers listed
- 4 jobs with 1st-degree connections
- 3 jobs with alumni connections
- 3 jobs with no network advantage
```

### JSON File Schema

```json
{
  "searchMetadata": {
    "keywords": "Senior Software Engineer",
    "location": "San Francisco, CA",
    "filters": {
      "workType": ["remote", "hybrid"],
      "postedWithin": "week",
      "experienceLevel": "mid-senior"
    },
    "timestamp": "2026-01-06T10:30:00Z",
    "totalJobsAnalyzed": 12
  },
  "jobs": [
    {
      "id": "123456",
      "url": "https://linkedin.com/jobs/view/123456",
      "title": "Senior Software Engineer",
      "company": {
        "name": "Acme Corp",
        "linkedinUrl": "https://linkedin.com/company/acme-corp"
      },
      "location": "San Francisco, CA",
      "workType": "remote",
      "postedDate": "2 days ago",
      "applicantCount": 45,
      "applyMethod": "easyApply",
      "hiringManager": {
        "name": "Jane Smith",
        "title": "Engineering Manager",
        "profileUrl": "https://linkedin.com/in/janesmith"
      },
      "connections": [
        {
          "name": "John Doe",
          "title": "Software Engineer",
          "connectionDegree": 1,
          "profileUrl": "https://linkedin.com/in/johndoe"
        }
      ],
      "connectionSummary": {
        "total": 2,
        "firstDegree": 2,
        "secondDegree": 0,
        "alumni": 0
      },
      "priority": "high"
    }
  ],
  "summary": {
    "withHiringManager": 2,
    "withFirstDegreeConnections": 4,
    "withAlumniConnections": 3,
    "noNetworkAdvantage": 3
  }
}
```

---

## Safety Rules

1. **Never enter credentials** - If login is required, stop and instruct user to log in manually
2. **Never click Apply** - This skill is for searching only, not applying
3. **Never create accounts** - Stop and inform user if account creation is required
4. **Respect rate limits** - Add 2-3 second delays between page loads
5. **Limit result count** - Maximum 25 jobs per search to avoid excessive scraping
6. **Handle errors gracefully** - If a job page fails to load, skip and continue

---

## Example Invocations

**New user (no profile):**
```
User: /job-search
Claude: Welcome! Please provide your resume path to get started.
User: ~/Documents/resume.pdf
Claude: [Parses resume, presents suggestions]
        Based on your resume, I suggest searching for "Product Manager" in Seattle, WA...
```

**Returning user:**
```
User: /job-search
Claude: Welcome back! Based on your profile, I suggest:
        Keywords: "Senior Software Engineer", "Staff Engineer"
        Location: San Francisco, CA
        Experience: Mid-Senior (7 years)

        Ready to search, or would you like to adjust?
User: Search for remote only
Claude: [Executes search with remote filter, displays results]
```

**With specific request:**
```
User: /job-search for machine learning roles in NYC
Claude: I'll search for machine learning roles in NYC. Based on your 5 years of experience,
        I'll filter for Mid-Senior level. Any preference for remote/hybrid/onsite?
```
