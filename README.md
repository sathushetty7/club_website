# ANALYTIX CLUB | Official Web Platform

> **Where Data Turns Into Impact & Innovation**  
> Data & Analytics Club · Academic Term 2026–27

---

## 🌟 Overview

This repository hosts the official web platform for **Analytix Club**, transformed to follow the visual layout and structural composition of the **MVJCE Inter-Department Championship**, branded with Analytix's identity, content, and technology theme.

- **Visual Identity:** Midnight Navy & Electric Blue (`#080D1A` + `#1769FF` + `#FFFFFF`)
- **Strict Brand Rule:** 100% blue technology theme — absolutely zero green or teal accents.

---

## 🎨 Design Tokens System

All styling is centralized in `css/style.css`, `css/auth.css`, and `css/dashboard.css` using CSS custom properties:

| Token | Hex / Value | Purpose |
| :--- | :--- | :--- |
| `--bg` | `#080D1A` | Main page background (Deep Midnight Navy) |
| `--bg-secondary` | `#111C32` | Secondary alternating section background |
| `--surface` | `#111C32` | Header pill, sidebar, footer & panel surface |
| `--surface-card` | `#1D2B45` | Card backgrounds, inputs, dropdown items |
| `--surface-raised` | `#243653` | Elevated hover surfaces & table headers |
| `--accent` | `#1769FF` | Primary action buttons & key interactive elements |
| `--accent-secondary`| `#55A0FF` | Supporting labels, badges & gradient highlights |
| `--accent-soft` | `rgba(23, 105, 255, 0.12)` | Subtle blue glow & pill backgrounds |
| `--text` | `#FFFFFF` | Primary white text & large headings |
| `--text-secondary` | `#AAB8CE` | Descriptive text & labels |
| `--muted` | `#8998B2` | Muted timestamps, deadlines & captions |
| `--line` | `rgba(255, 255, 255, 0.10)` | Clean structural borders |

---

## 🗺️ Website Structure & Route Mapping

The website maps Analytix content into the reference structure:

1. **Header & Navigation (`index.html`)**
   - Sticky pill header (`max-w-[760px]`, `rounded-[22px]`, backdrop blur)
   - Official Analytix logo & badge
   - Quick auth actions (`Sign In` / `Join Club`)
   - Circular animated menu button opening a floating dropdown card pinned top-right
2. **Hero Section**
   - Rounded 28px banner card with midnight navy & electric blue radial glow
   - 32px technical grid pattern and corner SVG data watermark graphics
   - Eyebrow: `DATA & ANALYTICS CLUB · 2026–27`
   - Heading: `ANALYTIX · WHERE DATA PLAYS`
   - Glowing halo CTA button: `Explore Events →`
   - "Up next" / live pulse ticker with event & hackathon links
3. **Club Pulse & Metrics**
   - Active Term indicator & official club description
   - 4 Club Members, 2 Active Events, 1 Open Hackathon, 3 Club Pillars
4. **Merit Leaderboard (`#leaderboard` & `leaderboard.html`)**
   - Overall standings table with ranks, member names, departments, and points
   - Scoring breakdown (+100 Hackathon Win, +50 Project PR, +40 Event Lead, +30 Design Asset)
5. **About Analytix (`#about`)**
   - Built by students for future leaders (Workshops, Hackathons, Merit recognition)
6. **The Three Pillars (`#teams`)**
   - **Tech Team:** Python, FastAPI, Data Science, PostgreSQL, AI/ML
   - **Design Team:** Figma, UI/UX Design, Poster Design, Branding, Motion
   - **MOC Team:** Media, Organization, and Content (Event Hosting, PR, Logistics)
7. **Upcoming Events (`events.html`)**
   - Bootcamps and workshops with dates, venues, deadlines, and registration handlers
8. **Hackathons & Arenas (`hackathons.html`)**
   - Competitive hackathons with cash prize pools (₹1,50,000+), deadlines, and team registration
9. **Official Announcements (`announcements.html`)**
   - Bulletins stream for circulars, notices, and project mentor applications
10. **Authentication & Portals**
    - `login.html`: Sign in with Analytix ID
    - `register.html`: Official membership registration
    - `forgot-password.html` & `reset-password.html`: Password recovery
    - `member-dashboard.html`: Registered member portal
    - `admin-dashboard.html`: Full administrator portal

---

## 🚀 Running the Project

### Option A: Complete FastAPI Backend + Frontend (Recommended)

1. Ensure Python 3.10+ is installed:
```bash
python -m pip install -r requirements.txt
```

2. Start the FastAPI server:
```bash
python main.py
# or
uvicorn main:app --reload --port 8000
```

3. Open in your browser:
```text
http://localhost:8000
```
Interactive API documentation is available at `http://localhost:8000/docs`.

### Option B: Standalone Static Frontend

Because `js/api.js` intelligently connects to the live Render backend (`https://analytix-web-238f.onrender.com`), you can also serve the frontend using any local web server:

```bash
# Using Python
python -m http.server 3000

# Using Node.js
npx serve .
```
Then navigate to `http://localhost:3000`.

---

## 🔒 Security & Data Integrity

- Complete JWT token management with Bearer authorization
- Role-based access control (`admin` vs `member`)
- XSS prevention on all dynamic DOM injections (`API.escapeHtml` & `API.sanitizeUrl`)
- SQLite persistent storage with automatic seed data

---

## © License & Attribution

© 2026 Analytix Club. All rights reserved.
Layout inspired by MVJCE Inter-Department Sports Championship.
