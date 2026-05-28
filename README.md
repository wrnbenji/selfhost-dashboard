# selfhost-dashboard

A beautiful, fast homelab dashboard that discovers your Docker containers automatically.

- **Zero config** — label your `docker-compose.yml` and the service shows up
- **Real-time health** — HTTP probes every 30s, pushed live via SSE
- **Single image** — one `docker run` and you're done
- **Dark mode**, drag & drop reorder, YAML config, no external dependencies

---

## Quick start

```bash
docker run -d \
  --name selfhost-dashboard \
  -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v $(pwd)/data:/data \
  ghcr.io/yourusername/selfhost-dashboard:latest
```

Or with docker-compose — copy `docker-compose.yml` and run `docker compose up -d`.

Open <http://localhost:3000>.

## Docker label discovery

Add labels to any container you want on the dashboard:

```yaml
labels:
  - "dashboard.enable=true"
  - "dashboard.name=Plex"
  - "dashboard.url=http://192.168.1.100:32400"
  - "dashboard.icon=plex"            # optional
  - "dashboard.description=Media"    # optional
```

They appear automatically within 30 seconds; removing the label removes the card.

## YAML config (optional)

Mount `services.yaml` at `/app/services.yaml`:

```yaml
services:
  - name: Plex
    url: http://192.168.1.100:32400
  - name: Grafana
    url: http://192.168.1.100:3000
```

Hot-reloaded on save. See `services.example.yaml`.

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `PORT` | `3000` | HTTP port |
| `DB_PATH` | `/data/dashboard.db` | SQLite location |
| `YAML_PATH` | `/app/services.yaml` | Optional YAML config |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker socket path |
| `HEALTH_INTERVAL_MS` | `30000` | Health check cadence |
| `DISCOVERY_INTERVAL_MS` | `30000` | Docker label rescan cadence |

## Local development

Requires Node 20+.

```bash
npm install
npm run dev    # backend :3001 + frontend :3000 (Vite proxies /api)
```

Build a production bundle (frontend → `backend/public/`, backend → `backend/dist/`):

```bash
npm run build
npm start      # serves both API and UI on :3001
```

## Comparison

| | selfhost-dashboard | Homer | Heimdall | Homarr |
|---|:---:|:---:|:---:|:---:|
| Auto-discovery | ✅ | ❌ | ❌ | ✅ |
| Real-time health | ✅ | ❌ | ❌ | ✅ |
| Single binary image | ✅ | ✅ | ❌ | ❌ |
| Drag & drop | ✅ | ❌ | ✅ | ✅ |
| Zero external deps | ✅ | ✅ | ❌ | ❌ |

## License

MIT
