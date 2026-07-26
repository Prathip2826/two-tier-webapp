# Two-Tier Web App — Docker + Jenkins CI/CD

A minimal but complete **two-tier architecture** demo:

- **Tier 1 — App tier**: Node.js + Express + EJS (student records CRUD UI)
- **Tier 2 — DB tier**: MySQL 8

Both run as separate containers on a shared Docker network, orchestrated
with Docker Compose. Jenkins automates build → test → image push → deploy.

```
two-tier-webapp/
├── app/
│   ├── server.js        # Express app (app tier)
│   ├── utils.js          # helper used by app + tests
│   ├── views/index.ejs   # UI
│   ├── test/utils.test.js
│   ├── package.json
│   ├── Dockerfile        # app tier image
│   └── .dockerignore
├── init.sql               # DB schema + seed data (db tier)
├── docker-compose.yml      # wires app tier + db tier together
├── Jenkinsfile             # CI/CD pipeline
└── README.md
```

---

## 1. Run it locally with Docker

```bash
cd two-tier-webapp
docker compose up -d --build
```

- App tier: http://localhost:3000
- DB tier: MySQL on localhost:3306 (root / password)

Check health:
```bash
curl http://localhost:3000/health
```

Stop everything:
```bash
docker compose down       # add -v to also wipe the db volume
```

---

## 2. Push this project to GitHub

```bash
cd two-tier-webapp
git init
git add .
git commit -m "Two-tier app: Docker + Jenkins CI/CD"
git branch -M main
git remote add origin https://github.com/Prathip2826/two-tier-webapp.git
git push -u origin main
```

---

## 3. Set up Jenkins (on a Linux VM/EC2/local machine)

**Install Jenkins + Docker on the same host** (simplest setup):

```bash
# Java (required by Jenkins)
sudo apt update && sudo apt install -y openjdk-17-jdk

# Jenkins
curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key | sudo tee \
  /usr/share/keyrings/jenkins-keyring.asc > /dev/null
echo "deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] \
  https://pkg.jenkins.io/debian-stable binary/" | sudo tee \
  /etc/apt/sources.list.d/jenkins.list > /dev/null
sudo apt update && sudo apt install -y jenkins

# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker jenkins
sudo systemctl restart jenkins docker
```

Get the initial admin password: `sudo cat /var/lib/jenkins/secrets/initialAdminPassword`
then visit `http://<server-ip>:8080` to finish setup.

**Install plugins** (Manage Jenkins → Plugins):
- Docker Pipeline
- Git

**Add Docker Hub credentials** (Manage Jenkins → Credentials → Global):
- Kind: Username with password
- Username: your Docker Hub username
- Password: a Docker Hub access token (Docker Hub → Account Settings → Security)
- ID: `dockerhub-creds` ← must match the ID used in the `Jenkinsfile`

**Create the pipeline job**:
1. New Item → Pipeline → name it `two-tier-webapp`
2. Pipeline → Definition: "Pipeline script from SCM"
3. SCM: Git → paste your repo URL → Branch: `main` → Script Path: `Jenkinsfile`
4. Save → Build Now

Before your first run, edit two lines in the `Jenkinsfile`:
- `git url` → your actual GitHub repo URL
- `IMAGE_NAME` → `yourdockerhubusername/two-tier-web`

---

## 4. (Optional) Auto-trigger builds on every push

GitHub repo → Settings → Webhooks → Add webhook:
- Payload URL: `http://<jenkins-server-ip>:8080/github-webhook/`
- Content type: `application/json`
- Trigger on: "Just the push event"

In the Jenkins job config, enable **"GitHub hook trigger for GITScm polling"**.

---

## What the pipeline does

1. **Checkout** — pulls latest code from GitHub
2. **Install Dependencies** — `npm install` in `app/`
3. **Run Tests** — Jest unit tests (`utils.test.js`)
4. **Build Docker Image** — tags with build number + `latest`
5. **Push to Docker Hub** — publishes the image
6. **Deploy** — `docker compose up -d --build` (recreates app + db containers)
7. **Smoke Test** — hits `/health` to confirm the app tier came up clean

---

## 5. Self-healing watcher (new)

A third container, `watcher`, continuously monitors the app tier and heals it
automatically — no human, no Jenkins build needed for routine failures.

**How it works:**
1. Polls `web`'s `/health` endpoint every 3 seconds, tracking latency.
2. **Anomaly detected** if either:
   - 3 consecutive health checks fail (app is down), or
   - average latency crosses 800ms (app is struggling)
3. **Level 1 remediation**: restarts the `two-tier-web` container directly via
   the Docker Engine API (`dockerode`). This is fast — seconds, not minutes.
4. **Level 2 escalation**: if the app needed 3+ restarts within 5 minutes,
   restarting isn't fixing the real problem — so the watcher instead calls
   Jenkins remotely to run `jenkins-remediation/Jenkinsfile`, which rolls
   back to the last known-good image tag.
5. Every incident (detected, attempted fix, resolved or not) is logged to
   the `incidents` table in MySQL, with an optional AI-generated root-cause
   guess (via Groq — falls back to a rule-based message if no API key is set).
6. A live dashboard at **http://localhost:4000** shows real-time status,
   a latency chart, and the incident timeline. There's also a **"Simulate
   failure"** button — use it for demos so you don't have to wait for a
   real crash to show the self-healing off.

**To enable the optional AI summaries:** get a free key at
[console.groq.com](https://console.groq.com), then set `GROQ_API_KEY` in
`docker-compose.yml` under the `watcher` service.

**To enable Jenkins escalation:** create a second Jenkins job named
`two-tier-remediation` pointing at `jenkins-remediation/Jenkinsfile`,
enable "Trigger builds remotely" with a token, then fill in `JENKINS_URL`,
`JENKINS_USER`, `JENKINS_TOKEN` in `docker-compose.yml`. If left blank, the
watcher just does Level 1 restarts forever — still works, just no rollback.

---

## Notes / next steps

- Swap MySQL creds and secrets into Jenkins credentials / a `.env` file before using this beyond a demo — they're hardcoded here for clarity.
- To deploy to a **remote** server instead of the Jenkins host itself, replace the `Deploy` stage with an `sshagent` block that SSHs into the target and runs `docker compose pull && docker compose up -d`.
- For a Kubernetes version later (k8s Deployment + Service for each tier), this same image works as-is — just add manifests.
