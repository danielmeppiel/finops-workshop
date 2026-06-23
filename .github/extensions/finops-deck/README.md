# finops-deck (Copilot canvas)

Opens the **FinOps for Agentic Coding** slide deck (`docs/`) as a canvas inside the
GitHub Copilot app. It runs a tiny read-only loopback HTTP server that serves the
static deck files — no telemetry, no external network.

## Use
With this repo open in the Copilot app, the `finops-deck` canvas is auto-discovered.
Open it from the agent (the canvas id is `finops-deck`), then use the on-screen
arrows or the **←/→** keys to move between slides. Press **F** for fullscreen.

## Deck location
By default the extension serves the repo's `docs/` folder (resolved relative to this
file). Override with the `FINOPS_DECK_DIR` environment variable to point at a
different deck build.

## Actions
- `goto` — returns a deep-link URL for a slide id (e.g. `s05-lifecycle-loop`).
  Re-open the canvas with that url to land directly on the slide.

The deck itself is a plain static web app (`docs/index.html` + `app.js` + `slides/*.html`)
and also works opened directly in a browser or via GitHub Pages.
