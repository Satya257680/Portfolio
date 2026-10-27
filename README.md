# Satyajit Nayak — Full-Stack Developer Portfolio

Personal portfolio of **Satyajit Nayak**, IT Officer and Full-Stack Developer at **Mi Arcus Retails Private Limited**.

A premium neon-glow **glassmorphism** site built with **React (Vite) + Node.js + Express.js + MySQL**:

- Dark theme by default with a **light/dark toggle** in the top bar (the choice is remembered)
- Top bar with profile-photo logo, active-section underline and Download Resume button
- Official technology logos on the skills (from the open-source Simple Icons set)
- React frontend with reusable components and one central content file
- Express API with a real contact form: server-side validation, sanitising, rate limiting, honeypot, parameterised SQL
- MySQL table that stores contact messages
- In production, Express serves the built React app, so everything runs as **one Node process**

> If MySQL isn't set up, the site still works. The Contact section shows an **Email** button (`mailto:`) instead of the form, so visitors never see a fake "message sent".

---

## Sections

1. Hero: "Available for Opportunities" badge, name, title, glowing photo frame with signature, *Download Resume* / *View My Work*, LinkedIn / GitHub / Email / WhatsApp, info card (location, role, education), quote card
2. Stats bar: months of experience (calculated automatically from the start date), projects, CGPA, certifications
3. About Me: summary with *Read More*, plus Problem Solver / Continuous Learner / Team Player / Goal cards
4. Technical Skills: 17 skill chips with logos; *View All Skills* shows the grouped list
5. Professional Experience: IT Officer, Mi Arcus Retails Pvt Ltd (Jul 2026 – Present)
6. Featured Projects: MIARCUS, VistaraX, QR Attendance, Calculation Platform, each with an illustrated preview
7. Education timeline · Certifications & Achievements · Languages
8. Let's Connect: phone, email, LinkedIn, GitHub, WhatsApp, location, contact form, illustration
9. Footer: links, social icons, back-to-top

## Tech stack

| Layer    | Technology                                                     |
|----------|----------------------------------------------------------------|
| Frontend | React 18, Vite 5, JavaScript, HTML5, CSS3 (custom design tokens) |
| Backend  | Node.js 18+, Express 4, Helmet, CORS, express-rate-limit        |
| Database | MySQL 8 (or MariaDB 10.5+), `mysql2` driver                     |

## Project structure

```text
satyajit-portfolio/
├── README.md                 ← you are here
├── package.json              ← root helper scripts
├── docs/
│   ├── SETUP.md              ← step-by-step local setup (Windows / macOS / Linux)
│   ├── DEPLOYMENT.md         ← deploying to a server / VPS / Render
│   ├── EDITING_CONTENT.md    ← how to change text, links, photo, resume
│   ├── PORTFOLIO_BUILD_SPEC.md
│   └── CONTENT_AND_LINKS.md
├── client/                   ← React (Vite) frontend
│   ├── index.html            ← title, meta description, Open Graph
│   ├── public/
│   │   ├── profile.jpg       ← hero photo
│   │   ├── avatar.jpg        ← round photo in the top bar
│   │   ├── Satyajit_Nayak_Resume.pdf
│   │   └── favicon.svg
│   └── src/
│       ├── data/portfolioData.js   ← ALL content lives here
│       ├── data/brandIcons.js      ← technology/social logos (Simple Icons, CC0)
│       ├── components/             ← Navbar, Hero, Stats, About, Skills, Experience,
│       │                              Projects, ProjectPreview, InfoRow, Contact,
│       │                              ConnectIllustration, Footer, SkillLogo, SocialIcon…
│       ├── hooks/                  ← useTheme, useReveal, useActiveSection
│       └── styles/                 ← tokens.css, global.css, components.css
└── server/                   ← Express API
    ├── .env.example
    ├── sql/schema.sql        ← MySQL schema for contact_messages
    └── src/
        ├── server.js, app.js, config.js, db.js
        ├── routes/contact.routes.js
        ├── controllers/contact.controller.js
        ├── validators/contact.validator.js
        ├── middleware/errorHandler.js
        └── scripts/initDb.js
```

## Quick start

Requirements: **Node.js 18+** and (optionally) **MySQL 8**.

```bash
# 1. Install dependencies
npm run install:all

# 2. Configure the server
cp server/.env.example server/.env      # Windows: copy server\.env.example server\.env
#    then edit server/.env with your MySQL user/password

# 3. Create the database table (needs MySQL running)
npm run db:init
#    or: mysql -u root -p < server/sql/schema.sql

# 4. Run in development (two terminals)
npm run dev:server     # http://localhost:5000
npm run dev:client     # http://localhost:5173  ← open this
```

### Production (single process)

```bash
npm run build          # builds client/dist
npm start              # Express serves the site + API on http://localhost:5000
```

Full details are in **[docs/SETUP.md](docs/SETUP.md)** and **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## API

| Method | Endpoint              | Description |
|--------|-----------------------|-------------|
| GET    | `/api/health`         | `{ ok, database }`: server and DB status |
| GET    | `/api/contact/status` | `{ enabled }`: whether the form can store messages |
| POST   | `/api/contact`        | Body `{ name, email, subject?, message }` → `201 { ok: true, id }` |

Error responses: `422` validation errors (with per-field `errors`), `429` rate limit, `503` database unavailable, `400` invalid JSON or bot detected.

Read the messages people send:

```sql
SELECT id, name, email, subject, message, created_at
FROM portfolio.contact_messages
ORDER BY created_at DESC;
```

## Editing content

Everything shown on the site (text, skills, projects, links, social profiles) is in
**`client/src/data/portfolioData.js`**. Set a link to `null` to hide its button.
See **[docs/EDITING_CONTENT.md](docs/EDITING_CONTENT.md)**.

## Links

- GitHub: https://github.com/Satya257680
- LinkedIn: https://www.linkedin.com/in/satyajit-nayak-981185247/
- Instagram: https://www.instagram.com/icon_boy_satyas/?hl=en
- Facebook: https://www.facebook.com/profile.php?id=100082445244045
- YouTube: https://www.youtube.com/@icon_boy_satyas
- WhatsApp: https://wa.me/917327096390
- Email: satyajit.it.2026@gmail.com

## Security notes

- Database credentials live only in `server/.env`, which is git-ignored and never sent to the browser.
- All SQL uses parameterised queries (`?` placeholders).
- Helmet sets security headers and a Content Security Policy.
- Body size is limited to 16 KB and `POST /api/contact` is rate limited (default 5 per 15 min per IP).

---

© Satyajit Nayak
