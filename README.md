# Vibe-to-Spec Transmuter

[English](README.md) | [한국어](README.ko.md)

Vibe-to-Spec Transmuter is an educational assistant that helps non-developers and beginner vibe coders turn vague ideas into structured implementation specs.

This project is being built for the **Intel AI App Creator training program** (beginner-friendly, non-CS audience).

## What It Does

1. User writes a rough idea in plain language.
2. The app converts it into a structured spec format.
3. User reviews outputs by audience and purpose:
   - Non-dev view
   - Dev view
   - Thinking view
   - Layer view
   - Glossary view

## Current UI/UX (as of current code)

- Beginner-focused light UI (no cyberpunk/neon theme).
- 3-step progress hints:
  - Problem input
  - Structured generation
  - Review and revise
- Learning mode clearly separated:
  - `ON`: enables Thinking tab (assumptions/questions/alternatives)
  - `OFF`: disables Thinking tab and focuses on quick practical outputs
- Copy actions now have explicit purpose:
  - `Antigravity Prompt Copy`: paste into Antigravity for code generation
  - `Dev Handoff Spec Copy`: share with human developers/teams
- Footer area includes an external banner link to the creator repository.

## Output Structure

The app normalizes model output into a fixed schema and generates:

- `standard_output` (normalized JSON spec)
- `artifacts.nondev_spec_md`
- `artifacts.dev_spec_md`
- `artifacts.master_prompt`
- `layers.L1_thinking`
- `glossary` (beginner/practical support)

## Model Selection Strategy

Model selection is **not single hard-coded runtime usage**.

- The app queries available Gemini models.
- It filters models that support `generateContent`.
- It picks by preference order first, then falls back:
  - Preference order: `gemini-1.5-flash` -> `gemini-1.5-pro` -> `gemini-1.0-pro` -> `gemini-pro`
  - Fallback list is used if lookup fails.

See `src/lib/gemini.js`.

## API Key Policy (Current)

API key handling was tightened to reduce browser-side exposure risk:

- Storage: **sessionStorage only**
- TTL: **30 minutes** after last save/use
- Auto-expire: key is cleared and user is prompted again
- Legacy cleanup: old localStorage key is removed on app start
- Local persistence option has been removed

See `src/App.jsx` for exact logic.

## Security Note (Important)

This app still uses a **client-direct AI call architecture** for educational MVP speed.

That means:
- API key is handled in the browser session.
- Full protection against DevTools-level exposure is not possible in this architecture.

For production-grade security, migrate to:
- server-side proxy
- server-held API key
- rate limiting + auth + audit controls

## Tech Stack

- React 19
- Vite 7
- Tailwind CSS 4
- Framer Motion
- `@google/generative-ai`
- React Markdown + `remark-gfm`

## Local Development

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open:
- `http://127.0.0.1:5173`

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

## Deployment

GitHub Pages deployment is configured:

- Workflow: `.github/workflows/deploy.yml`
- Trigger: push to `main`
- Publish dir: `dist`

## Project Structure

```text
src/
  App.jsx         # Main UI, tabs, interaction, API key session policy
  lib/gemini.js   # Model calls, schema normalization, retry logic
  index.css       # Theme and markdown/table readability styles
  main.jsx        # React entry point
```

## Status

Active educational MVP under iterative UI and workflow refinement.
