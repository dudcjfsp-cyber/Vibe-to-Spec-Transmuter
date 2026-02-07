# Vibe-to-Spec Transmuter

Vibe-to-Spec Transmuter is an educational MVP that converts abstract user intent ("vibe") into implementation-ready technical specs.

## Goals
- Help non-developers understand engineering thinking.
- Give developers a spec they can implement with minimal clarification.
- Help users turn feedback into concrete change requests.

## Current Features
- Gemini-based spec generation engine.
  - JSON-only output contract.
  - One automatic retry when JSON parsing fails.
- Layered output format (L1 / L2 / L3).
  - L1 Thinking: interpretation, assumptions, uncertainties, alternatives.
  - L2 Translation: non-dev and dev spec artifacts.
  - L3 Execution: implementation options and master prompt.
- Learning mode toggle (ON/OFF).
- Tab UI:
  - Non-dev / Dev / Thinking / Glossary
- Glossary navigator upgrades:
  - Concept flow map: `Webhook -> Parsing -> Data Sync -> Source of Truth`
  - Difficulty toggle: Beginner / Practical
  - Decision point, practical mistakes, request template per term
  - Glossary-to-content and content-to-glossary navigation
  - In-content term highlighting and focus behavior
- Copy actions:
  - Copy dev spec
  - Copy master prompt

## API Key Storage Policy
- Default: `sessionStorage`
- Optional: "Remember on this device" uses `localStorage`
- Unchecking removes key from `localStorage` immediately

## Tech Stack
- React 19
- Vite 7
- Tailwind CSS 4
- Framer Motion
- `@google/generative-ai`
- React Markdown

## Local Run
```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open:
- `http://127.0.0.1:5173`

## Lint
```bash
npm run lint
```

## Deployment
GitHub Pages auto deployment is enabled.

- Workflow: `.github/workflows/deploy.yml`
- Trigger: push to `main`
- Publish: `dist` to `gh-pages`

## Project Structure
```text
src/
  App.jsx           # UI, state, tabs, glossary navigation
  lib/gemini.js     # model calls, JSON schema enforcement, parse/retry
  index.css         # theme and styling
```

## Notes
- Current architecture is client-direct model invocation, suitable for MVP and education use.
- For stronger production security, migrate to a server-side proxy architecture.
- If local access drops intermittently, the usual causes are dev server process termination or endpoint protection blocking local port binding.
