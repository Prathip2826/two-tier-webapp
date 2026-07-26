# Self-Healing CI/CD Pipeline

**A two-tier app that detects its own failures and fixes them automatically — no human, no manual restart, no waiting.**

Built on Docker + Jenkins + a watcher service that monitors the app in real time, restarts it the moment something breaks, escalates to a Jenkins-triggered rollback if restarts alone aren't fixing it, and explains what went wrong using an LLM.

![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![Jenkins](https://img.shields.io/badge/Jenkins-CI%2FCD-D24939?logo=jenkins&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## Demo

<!-- Replace this with your recorded GIF: dashboard healthy → simulate failure → auto-heal -->
`![demo](./demo.gif)`

*Click "Simulate failure" on the live dashboard and watch it detect, self-heal, and log the incident — all in under 10 seconds.*

---

## Why this exists

Most "two-tier Docker + Jenkins" tutorials stop at: push code → build image → deploy. That's a CI/CD pipeline, not a *reliable* system — if the app crashes at 3am, it stays down until someone notices.

This project adds the missing piece: a **watcher** that never sleeps, catches failures within seconds, and fixes most of them without any human or Jenkins build in the loop at all.

---

## Architecture

```
┌─────────────┐      health checks       ┌─────────────┐
│   watcher   │ ───────────────────────► │  web (app)  │
│  (monitor + │                          │  Node/Express│
│  self-heal) │ ◄─── restart via ────────│    :3000    │
└──────┬──────┘      Docker API          └──────┬──────┘
       │                                        │
       │ logs incidents                         │ reads/writes
       ▼                                        ▼
┌─────────────────────────────────────────────────────┐
│                    db (MySQL 8)                       │
│         students table + incidents table              │
└─────────────────────────────────────────────────────┘

       │ escalates after 3+ restarts in 5 min
       ▼
┌─────────────────┐
│  Jenkins job:    │  rolls back to last stable image
│  remediation     │  instead of retrying blindly
└─────────────────┘
```

**Two tiers, one extra brain:**
- **App tier** — Node.js/Express, serves a student-records CRUD UI, exposes `/health`
- **DB tier** — MySQL 8, stores app data + a full incident log
- **Watcher** — polls `/health` every 3s, detects anomalies, restarts the app tier via the Docker Engine API, escalates to Jenkins on repeated failure, and serves a live dashboard

---

## How the self-healing actually works

1. **Detect** — 3 consecutive failed health checks, or average latency over 800ms
2. **Remediate (Level 1)** — restart the container directly via `dockerode`, no Jenkins build needed, recovery in seconds
3. **Escalate (Level 2)** — if 3+ restarts happen within 5 minutes, restarting isn't the fix; the watcher instead triggers a Jenkins pipeline that rolls back to the last known-good image
4. **Explain** — every incident gets a plain-English root-cause guess (via Groq's LLM API if configured, otherwise a rule-based fallback — works either way)
5. **Log** — every detection, action, and outcome is written to MySQL and shown live on the dashboard

---

## Live dashboard

Runs at `http://localhost:4000` alongside the app:
- Real-time status with a pulsing health indicator
- Live latency chart (pure SVG, no external chart library — nothing to break on a flaky network)
- Full incident timeline with AI-generated root-cause notes
- A **"Simulate failure"** button to demo the whole loop on demand, without waiting for a real crash

---

## Quick start

```bash
git clone https://github.com/Prathip2826/two-tier-webapp.git
cd two-tier-webapp
docker compose up -d --build
```

| Service | URL |
|---|---|
| App tier | http://localhost:3000 |
| Self-healing dashboard | http://localhost:4000 |
| MySQL (host-side, optional) | localhost:3307 |

Stop everything: `docker compose down` (add `-v` to also wipe stored data).

---

## Project structure

```
two-tier-webapp/
├── app/                    # App tier — Node/Express + MySQL
│   ├── server.js
│   ├── views/index.ejs
│   ├── test/utils.test.js
│   └── Dockerfile
├── watcher/                 # Self-healing watcher + dashboard
│   ├── server.js             # detection + remediation logic
│   ├── groq.js                # AI root-cause summaries (optional)
│   ├── public/index.html       # live dashboard
│   └── Dockerfile
├── jenkins-remediation/
│   └── Jenkinsfile            # rollback pipeline (Level 2 escalation)
├── Jenkinsfile               # main build/test/deploy pipeline
├── docker-compose.yml
├── init.sql                  # schema: students + incidents tables
└── README.md
```

---

## CI/CD pipeline (Jenkins)

1. **Checkout** → 2. **Install deps** → 3. **Run tests** (Jest) → 4. **Build image** → 5. **Push to Docker Hub** → 6. **Deploy** → 7. **Smoke test**

See `Jenkinsfile` for the full pipeline and `jenkins-remediation/Jenkinsfile` for the rollback job the watcher triggers on repeated failures.

**Setup instructions** (installing Jenkins, Docker Hub credentials, webhook config) are in [`SETUP.md`](./SETUP.md).

---

## Enabling the optional AI layer

Get a free key at [console.groq.com](https://console.groq.com), then set it in `docker-compose.yml`:
```yaml
watcher:
  environment:
    GROQ_API_KEY: "your-key-here"
```
Without a key, the watcher still works — it just uses a rule-based root-cause message instead of an LLM-generated one.

---

## What I'd add next

- Persist incident history beyond MySQL into a time-series store for longer-term trend analysis
- Slack/email alerting alongside the dashboard
- Kubernetes manifests as an alternative to Docker Compose for the deploy target

---

## Author

**Prathip** — B.Tech AI & Data Science, Muthayammal Engineering College
Google Student Ambassador · [GitHub](https://github.com/Prathip2826)
