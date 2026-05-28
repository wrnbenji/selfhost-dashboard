# Hero GIF / screenshot

The README references `docs/hero.gif` (currently commented out). The first 3
seconds decide whether someone keeps reading on r/selfhosted — make them count.

## What to capture (≈8–12s loop)

1. Start with the dashboard showing a few service cards (green/online).
2. `docker compose up -d` a new container that has `dashboard.enable=true` labels.
3. Show the new card appearing automatically within ~30s (cut the wait).
4. Optional: hover a card to show the live status / latency detail.

## How to record

- macOS: [Kap](https://getkap.co) or `⌘⇧5`, export to GIF (or MP4 → GIF).
- Keep it < 5 MB so it loads fast on GitHub. Resize to ~1000px wide.
- Save as `docs/hero.gif`, then uncomment the image line at the top of `README.md`.

GitHub also accepts `.mp4`/`.webm` drag-dropped into the README for autoplay —
a short muted MP4 often looks crisper than a GIF.
