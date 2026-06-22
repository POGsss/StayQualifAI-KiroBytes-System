# StayQualifAI Bauhaus Dashboard Redesign

---

# 0. GLOBAL UI REDESIGN

## Overview

Redesign the entire StayQualifAI platform from the current purple SaaS-style interface into a modern Bauhaus-inspired dashboard based on the provided Figma reference.

The redesign must preserve all existing functionality, business logic, navigation, APIs, and user workflows while completely transforming the visual design, spacing, layout structure, information hierarchy, and component styling.

The platform should feel like a premium AI-powered career intelligence platform that combines:

- Resume Analysis
- Interview Simulation
- Job Search
- Career Upskilling

The overall design should closely resemble the provided Bauhaus dashboard wireframe.

---

## Requirements

### Color System

Primary Background:
- #F5F5F5

Card Background:
- #FFFFFF

Sidebar:
- #121212

Primary Text:
- #111111

Secondary Text:
- #6B6B6B

Accent Colors:

Blue:
- #1E5BC6

Yellow:
- #F6B800

Red:
- #FF2B2B

---

### Design Language

Apply Bauhaus principles:

- Function over decoration
- Strong geometric layouts
- Large whitespace
- Minimal visual noise
- Information-first hierarchy
- Consistent grid system
- Card-based architecture

---

### Sidebar

Replace the current purple sidebar with:

Top:
- User Profile Card

Middle:
- Resume
- Interview
- Job Search
- Upskilling

Bottom:
- Logout Button

Active page:
- White background
- Black text

Inactive pages:
- Dark background
- White text

---

### Typography

Use:

- Inter
- IBM Plex Sans
- Manrope

Heading:
- Bold
- High contrast

Body:
- Medium weight
- Readable spacing

---

### Components

All pages must use:

- White cards
- Rounded corners (12-16px)
- Subtle shadows
- Consistent spacing
- Grid alignment

Avoid:

- Purple colors
- Glassmorphism
- Neumorphism
- Heavy gradients
- Excessive animations

---

## User Stories

As a user,
I want a clean and professional dashboard
so that I can focus on my career development tasks.

As a user,
I want all modules to feel visually connected
so that navigation across the system feels seamless.

As a user,
I want information to be easy to scan
so that I can quickly understand my progress and recommendations.

---

## Tasks

1. Redesign global layout.
2. Replace current color palette.
3. Implement Bauhaus-inspired sidebar.
4. Standardize cards and spacing.
5. Apply responsive dashboard layout.
6. Ensure consistency across all modules.

---

## Expected Output

A complete Bauhaus-inspired dashboard UI matching the provided wireframe.

---

## Acceptance Criteria

- Dark sidebar implemented.
- White workspace background.
- Bauhaus color accents used.
- All modules visually consistent.
- Existing functionality preserved.
- Layout resembles provided Figma wireframe.

---

# 1. RESUME PAGE REDESIGN

## Overview

Redesign the Resume module to match the Resume wireframe from the provided Bauhaus dashboard.

The page should become a resume intelligence dashboard that focuses on ATS analysis and AI-powered resume feedback.

---

## Requirements

### Layout

Top:

Page Title:
Resume

Top-right:
Feature placeholders or utility actions

---

### KPI Section

Create three KPI cards aligned horizontally.

Card 1 (Blue)
- ATS Score

Card 2 (Yellow)
- Keyword Match Score

Card 3 (Red)
- Resume Structure Score

Each card displays:

- Large percentage
- Metric label

---

### Main Content Layout

Two-column layout.

Left Side (70%)

Resume Preview Panel

Contains:
- PDF preview
- Scrollable document viewer

Bottom actions:
- Analyze Resume
- Download Report

---

Right Side (30%)

Resume Upload Card

Contains:
- Drag and drop upload area
- Upload icon
- Upload button

Below Upload:

AI Review Card

Contains:

- Strengths
- Weaknesses
- Missing Keywords
- ATS Recommendations

---

## User Stories

As a job seeker,
I want to upload my resume
so that I can receive ATS feedback.

As a user,
I want to preview my resume
so that I can verify uploaded content.

As a user,
I want AI recommendations
so that I can improve my resume.

---

## Tasks

1. Move upload area to right column.
2. Add KPI score cards.
3. Create large resume preview panel.
4. Create AI review panel.
5. Apply Bauhaus card styling.

---

## Expected Output

Resume dashboard identical in structure to the provided Bauhaus Resume wireframe.

---

## Acceptance Criteria

- KPI cards displayed at top.
- Resume preview occupies majority of page.
- Upload panel on right.
- AI review panel below upload.
- Layout matches wireframe.

---

# 2. INTERVIEW PAGE REDESIGN

## Overview

Redesign the Interview module to match the Interview wireframe from the provided Bauhaus dashboard.

The page should function as an AI interview command center.

---

## Requirements

### Top Section

Large Interview Workspace

Contains:

Left Participant:
AI Interviewer

Right Participant:
Candidate

Display:
- Large avatars
- Video call placeholders

---

### Controls

Centered beneath participants:

- Microphone
- End Call
- Settings

End Call:
- Red accent

---

### Bottom Section

Two-column layout.

Left Panel

Interview Setup

Contains:

- Difficulty
- Number of Questions
- Job Description
- Start Interview Button

---

Right Panel

Interview Transcript

Contains:

- Questions
- Answers
- Real-time conversation feed

---

## User Stories

As a user,
I want a realistic interview experience
so that I can practice effectively.

As a user,
I want live transcripts
so that I can review my responses.

---

## Tasks

1. Build interview stage.
2. Add participant cards.
3. Add call controls.
4. Create interview setup form.
5. Create transcript panel.

---

## Expected Output

Interview page matching the Bauhaus interview wireframe.

---

## Acceptance Criteria

- Two participant panels visible.
- Call controls centered.
- Setup panel on left.
- Transcript panel on right.
- Layout matches wireframe.

---

# 3. JOB SEARCH PAGE REDESIGN

## Overview

Redesign the Job Search module to match the Job Search wireframe from the provided Bauhaus dashboard.

The page should resemble a professional recruitment dashboard.

---

## Requirements

### Search Toolbar

Top search controls:

- Keyword
- Job Type
- Salary
- Search Button

---

### KPI Cards

Three cards:

Blue:
- Jobs Matched

Yellow:
- Saved Jobs

Red:
- Applications Sent

---

### Main Layout

Left Column (35%)

Job Listings

Display job cards:

- Job Title
- Company
- Location
- Salary

Actions:

- Save
- Apply

---

Right Column (65%)

Job Details Panel

Display:

- Company Information
- Description
- Requirements
- Benefits
- Salary Information

Bottom Actions:

- Save Job
- Apply Now

---

## User Stories

As a user,
I want to browse jobs quickly
so that I can find relevant opportunities.

As a user,
I want detailed job information
so that I can make informed decisions.

---

## Tasks

1. Add KPI cards.
2. Build searchable toolbar.
3. Create job listings panel.
4. Create job details panel.
5. Apply Bauhaus layout.

---

## Expected Output

Job Search page matching the Bauhaus wireframe.

---

## Acceptance Criteria

- Search toolbar visible.
- KPI cards displayed.
- Job listings on left.
- Job details on right.
- Layout matches reference.

---

# 4. UPSKILLING PAGE REDESIGN

## Overview

Redesign the Upskilling module to match the Upskilling wireframe from the provided Bauhaus dashboard.

The page should function as an AI-powered career growth dashboard.

---

## Requirements

### KPI Section

Four horizontal KPI cards.

Blue:
- Technical Skill Score

Yellow:
- Portfolio Readiness

Red:
- Career Readiness

Red:
- Industry Alignment Score

---

### Project Recommendations

Display recommendation cards.

Each card contains:

- Project Title
- Description
- Skills Learned
- Difficulty
- Estimated Completion Time

Actions:

- Save Project
- View Project

---

### Grid Layout

Use 3-column responsive card layout.

Cards should resemble the provided wireframe.

---

## User Stories

As a user,
I want project recommendations
so that I can improve my skills.

As a user,
I want to save projects
so that I can revisit them later.

---

## Tasks

1. Add KPI score cards.
2. Create recommendation grid.
3. Build project cards.
4. Apply Bauhaus styling.
5. Improve visual hierarchy.

---

## Expected Output

Upskilling dashboard matching the provided wireframe.

---

## Acceptance Criteria

- KPI cards visible.
- Recommendation grid implemented.
- Project cards styled consistently.
- Layout follows wireframe.
- Responsive behavior maintained.

---