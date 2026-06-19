# Product Overview

StayQualifAI is an AI-powered, end-to-end career acceleration platform built by the KiroBytes team. It unifies the entire job search journey into one connected loop — acting as a digital career copilot that finds jobs, optimizes resumes, runs mock interviews, and builds upskilling roadmaps.

## Core Modules

### Module 1: Resume
- ATS Resume Scanner & Keyword Optimizer (parse .pdf/.docx, compatibility score 0-100%, keyword suggestions)
- AI Resume Builder with Job Matcher (ATS-parseable templates, semantic match analysis, X-Y-Z bullet writing)
- Resume Version Snapshot Manager (clone, rename, switch between targeted resume variants)

### Module 2: Interview
- Custom Interview Simulator (resume + JD-driven questions, difficulty tiers: Entry/Mid/Senior/Lead)
- Interview Performance Scorecard (grades, grammar, latency, pressure handling)
- Interview Story Organizer (STAR framework scratchpad)

### Module 3: Job Search
- Job Listings with Smart Filters & Direct Apply (scraped feed, deduplication, remote/hybrid/onsite filters)
- Visual Application Tracker (Kanban board: Wishlist → Applied → Interviewing → Offer → Rejected)
- AI Application & Email Writer (cover letters, LinkedIn outreach, follow-up templates)

### Module 4: Career Roadmap & Learning Engine
- Role-Based Project Generator (portfolio project suggestions per target role)
- Career Goal Roadmap (step-by-step timeline with milestones for career transitions)
- Course & Certificate Finder (recommendations from learning platform APIs)

## UI/UX Design

### Layout

- **Fixed left sidebar navigation** (solid Deep Amethyst Purple `#9b5de5`):
  - Branding (logo mark + wordmark) at the top
  - One vertical icon + label link per **product module** (Resume, Interview, Job Search, Upskilling), with a rounded/highlighted active state
  - Utility actions (e.g., Log out) pinned to the bottom
  - Sidebar text and icons are white for contrast against the purple
- **Within-module navigation lives in the page, not the sidebar.** Each module composes its own features as in-page tab navigation (e.g., the Resume page exposes Scanner / Builder / Versions tabs). The sidebar only switches between top-level modules.
- **Main content canvas** on a soft light-gray background (`#f7f7f8`):
  - White top bar (`bg-white`, bottom border) with the active module title on the left (e.g., "Resume"), and a pill-shaped search field plus a circular profile/avatar control on the right
  - Grid-based widget canvas built from rounded-2xl white panels with generous padding and soft shadows
- **Stat cards**: top-row KPI cards use solid pastel fills (pink, yellow, turquoise) with a small label and a large bold value
- Charts and data viz use the accent palette (turquoise, yellow, purple) on white panels

### Color Palette

- Primary: `#9b5de5` (Deep Amethyst Purple) — sidebar background, brand accent, CTAs, selected/active states
- `#ffc8dd` (Soft Pastel Pink) — stat-card fills, progress milestones, card headers
- `#FEE440` (Bright Cyber Yellow) — stat-card fills, scores, warnings, active indicators
- `#00F5D4` (Electric Turquoise Green) — stat-card fills, positive metrics, completion states, success feedback, avatar accents
- Surface: `#ffffff` (panels) on `#f7f7f8` (app background); text in near-black `#1a1a1a` / muted gray for secondary

### Component Conventions

- Panels: `rounded-2xl bg-white p-6 shadow-sm`
- Stat cards: `rounded-2xl p-5` with solid accent background, dark label + large bold value
- Active nav item: rounded pill/indicator with elevated contrast against the purple sidebar
- In-page tabs: underline-style tab bar (bottom border on the active tab in primary purple) for switching between a module's features
- Filter chips and tags: small rounded-full pills using accent colors
- Buttons (CTA): primary purple fill with white text; secondary uses pastel fills
