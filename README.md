<div align="center">

# 🐳 selfhost-dashboard

**A fast homelab dashboard that builds itself from your Docker containers.**

[![Build](https://github.com/wrnbenji/selfhost-dashboard/actions/workflows/docker.yml/badge.svg)](https://github.com/wrnbenji/selfhost-dashboard/actions/workflows/docker.yml)
[![GHCR image](https://img.shields.io/badge/ghcr.io-image-2496ED?logo=docker&logoColor=white)](https://github.com/wrnbenji/selfhost-dashboard/pkgs/container/selfhost-dashboard)
[![License: MIT](https://img.shields.io/badge/license-MIT-22c55e.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/wrnbenji/selfhost-dashboard?style=social)](https://github.com/wrnbenji/selfhost-dashboard/stargazers)

![selfhost-dashboard auto-discovering a Docker container in real time](docs/hero.gif)

[Quick start](#-quick-start) • [Features](#-features) • [Configuration](#️-configuration) • [Roadmap](#-roadmap) • [Contributing](#-contributing)

</div>

---

> **Status:** actively developed. Runs on your LAN or behind a reverse proxy, with an optional built-in single-password login (Settings → security) when you want it.

Tired of bookmarking every self-hosted service and editing a config file every time something moves? selfhost-dashboard reads the labels off your Docker containers and builds the dashboard for you, then watches each service's health in real time.

```bash
docker run -d -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v $(pwd)/data:/data \
  ghcr.io/wrnbenji/selfhost-dashboard
```

Open <http://localhost:3000>. That's it.

---

## ✨ Features

- 🔍 Label a container and its card shows up within 30 seconds.
- 📡 Health checks run as HTTP probes and get pushed to the browser live over SSE, so you never have to refresh.
- 📊 Per-service uptime, p95 latency, and an incident log, for the last hour, day, week, or month.
- 📈 Live CPU and memory for each auto-discovered container — on the cards, with a 30-minute trend sparkline in the detail panel.
- 🔔 Get pinged on Discord or any webhook the moment a service goes down — and again when it recovers.
- ✋ Drag and drop to reorder, a 🌙 dark mode, and an optional 📄 YAML config if you'd rather not use labels.
- 🔒 Optional single-password lock — turn it on from Settings (or an env var) and the dashboard sits behind a login (off by default for trusted LANs).
- 📦 One image and one SQLite file. No external database to run.

<details>
<summary>🔍 <strong>How auto-discovery works</strong></summary>

<br>

The backend reads the Docker socket (read-only) and watches for containers labeled `dashboard.enable=true`. Add or remove the label and the card appears or disappears on its own, with no restart and no config edit. See [Docker label discovery](#docker-label-discovery).

</details>

<details>
<summary>📊 <strong>What it monitors</strong></summary>

<br>

- Online/offline status from HTTP `HEAD`/`GET` probes (5s timeout)
- Average and p95 latency, uptime %, and incident count per window (1h / 24h / 7d / 30d)
- Live CPU and memory usage for Docker-discovered services, read straight from the Docker socket
- A coverage indicator that tells "the service was down" apart from "the monitor wasn't running"

</details>

<details>
<summary>🔔 <strong>How alerting works</strong></summary>

<br>

Get notified when a service goes down and again when it recovers — no bot to run, the dashboard just makes an outbound POST.

- **Discord** — paste a channel webhook URL (Channel settings → *Integrations → Webhooks*).
- **Webhook** — any URL that takes a JSON `POST`; works with ntfy, Home Assistant, n8n, or your own script.
- **Flap protection** — an alert only fires after a status holds for *N* consecutive checks (default 2), so a single blip won't page you.
- **Per-service mute** and a **Send test** button live in the UI. Configure it under **Settings → notifications**.

</details>

Prefer the UI? Add a service by hand with the **+ New** button, and it starts being monitored the moment you save:

![Adding a service from the dashboard UI](docs/demo-add.gif)

---

## 🚀 Quick start

**1. Run it**

```bash
docker run -d \
  --name selfhost-dashboard \
  -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v $(pwd)/data:/data \
  ghcr.io/wrnbenji/selfhost-dashboard:latest
```

Or with Compose: copy [`docker-compose.yml`](docker-compose.yml) and run `docker compose up -d`.

**2. Label your services**

```yaml
labels:
  - "dashboard.enable=true"
  - "dashboard.name=Plex"
  - "dashboard.url=http://192.168.1.100:32400"
  - "dashboard.icon=plex"            # optional
  - "dashboard.description=Media"    # optional
```

**3. Open the dashboard** at <http://localhost:3000>. Your services are already there.

### Docker label discovery

Labeled containers show up on their own within 30 seconds, and removing the label removes the card. No restart needed.

### YAML config (optional)

Prefer a file? Mount `services.yaml` at `/app/services.yaml`:

```yaml
services:
  - name: Plex
    url: http://192.168.1.100:32400
  - name: Grafana
    url: http://192.168.1.100:3000
```

It reloads on save. See [`services.example.yaml`](services.example.yaml).

---

## ⚙️ Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `PORT` | `3000` | HTTP port |
| `DB_PATH` | `/data/dashboard.db` | SQLite location |
| `YAML_PATH` | `/app/services.yaml` | Optional YAML config |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker socket path |
| `HEALTH_INTERVAL_MS` | `30000` | Health check cadence |
| `DISCOVERY_INTERVAL_MS` | `30000` | Docker label rescan cadence |
| `CORS_ORIGIN` | `*` | Restrict cross-origin API callers |
| `AUTH_PASSWORD` | _(unset)_ | Set to require a password (auth off when unset) |
| `AUTH_SECRET` | _(auto)_ | Session signing secret (auto-generated + persisted if unset) |
| `AUTH_COOKIE_SECURE` | `0` | Set to `1` to mark the session cookie `Secure` (HTTPS) |

### Password protection

A single password can lock the whole dashboard — the API returns `401` until you log
in, and the UI shows an unlock screen. There are two ways to set it; off by default
(for a trusted LAN).

**From the UI (no restart):** open **Settings → security**, set a password, and the
lock turns on immediately. Change or remove it from the same place — changing it logs
out every other session. The password is stored hashed (`scrypt`) in the database.

**From the environment (ops-managed):** set `AUTH_PASSWORD` and it takes precedence;
the UI field becomes read-only.

```bash
docker run -d -p 3000:3000 \
  -e AUTH_PASSWORD='choose-a-strong-one' \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v ./data:/data \
  ghcr.io/wrnbenji/selfhost-dashboard
```

No bot, no external IdP — just one password, a signed `HttpOnly` session cookie, and
a **Log out** entry under Settings. Already running an SSO/reverse proxy (Authelia,
Authentik, oauth2-proxy)? Leave it unset and let the proxy handle it.

### Notifications

Open **Settings → notifications → configure** to get alerted when a service goes
down (and again when it recovers). No bot to run — the dashboard only makes an
outbound POST:

- **Discord** — Channel settings → *Integrations → Webhooks → New Webhook*, copy the
  URL, paste it in.
- **Webhook** — any URL that accepts a JSON `POST` (ntfy, Home Assistant, n8n, your
  own script). Payload: `{ service, status, url, timestamp, message }`.

Alerts only fire after a status holds for *N* consecutive checks (default 2), so a
single blip won't page you. Mute individual services from their detail panel. Send
a test alert from the same screen to confirm delivery.

---

## 🆚 Comparison

| | selfhost-dashboard | Homer | Heimdall | Homarr |
|---|:---:|:---:|:---:|:---:|
| Auto-discovery | ✅ | ❌ | ❌ | ✅ |
| Real-time health | ✅ | ❌ | ❌ | ✅ |
| Downtime alerts | ✅ | ❌ | ❌ | ✅ |
| Single binary image | ✅ | ✅ | ❌ | ❌ |
| Drag & drop | ✅ | ❌ | ✅ | ✅ |
| Zero external deps | ✅ | ✅ | ❌ | ❌ |

---

## 🛠 Local development

Requires Node 20+.

```bash
npm install
npm run dev    # backend :3001 + frontend :3000 (Vite proxies /api)
```

Production bundle (frontend builds into `backend/public/`, backend into `backend/dist/`):

```bash
npm run build
npm start      # serves API + UI on :3001
npm run test --workspace=backend   # 42 tests
```

**Stack:** Node + [Hono](https://hono.dev), better-sqlite3, React + Vite, Tailwind.

---

## 🗺 Roadmap

- [x] Auto-discovery, real-time health, uptime history
- [x] Drag & drop, dark mode, YAML config, responsive layout
- [x] Notifications (Discord / webhook on downtime & recovery)
- [x] Optional password protection (single-password login)
- [x] Live per-container CPU & memory
- [ ] More alert channels (Telegram, email)
- [ ] Widgets (weather, RSS, Grafana embeds)
- [ ] Kubernetes ingress discovery

---

## 🤝 Contributing

Issues and PRs are welcome, it's still early days. See [Local development](#-local-development), and please run `npm run test --workspace=backend` before you open a PR.

---

## 📄 License

[MIT](LICENSE) © 2026 Benjamin Waron

---

<div align="center">

If selfhost-dashboard is useful to you, a ⭐ helps others find it.

[![Star History Chart](https://api.star-history.com/svg?repos=wrnbenji/selfhost-dashboard&type=Date)](https://star-history.com/#wrnbenji/selfhost-dashboard&Date)

</div>
