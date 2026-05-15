# ADR 001 — Use `canvas` instead of `sharp` for wallpaper rendering

**Date:** 2025
**Status:** Accepted

## Context

The wallpaper renderer needs to compose a full-desktop PNG that includes:

- a background image scaled to fit
- a color tint overlay
- text labels (daily agenda, mental load percentage)
- per-task post-it notes with wrapped text and styled headers

Two Node.js libraries cover image manipulation for this use case: `canvas` (node-canvas) and `sharp`.

## Decision

Use `canvas` (`npm:canvas`).

## Rationale

`sharp` has no native text rendering. It wraps libvips, which is optimised for pixel-level transforms (resize, crop, composite). Overlaying text with `sharp` requires pre-rendering text to a separate PNG via an external tool (e.g. `jimp`, a headless browser, or `svg2png`) and then compositing — adding build complexity and a second native dependency.

`canvas` implements the W3C Canvas 2D API, which has first-class text support (`fillText`, `measureText`, `wrapText`), path drawing, and shadow effects. The post-it renderer alone requires font metrics to wrap task titles — this would be impossible with `sharp` without a separate text pipeline.

## Trade-offs accepted

- `canvas` does not compile on Node 24; Node 20 LTS is required. This constraint is documented in `README.md` and enforced in `package.json` (`engines: ">=20.0.0 <24.0.0"`).
- `canvas` requires system libraries (`libcairo2-dev`, `libpango1.0-dev`, etc.) as build-time dependencies. These are documented in `README.md` Step 1 and installed in the CI workflow.

## Alternatives considered

- **sharp** — rejected: no text rendering without additional tooling.
- **Puppeteer/headless Chrome** — rejected: 300 MB runtime overhead for a desktop widget.
- **Pre-rendered SVG** — rejected: dynamic content (task titles, countdowns) changes every 60 seconds; SVG templating adds its own complexity with no clear advantage over canvas.
