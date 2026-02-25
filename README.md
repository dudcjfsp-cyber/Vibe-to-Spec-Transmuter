# Vibe-to-Spec Transmuter

[English](README.md) | [한국어](README.ko.md)

Vibe-to-Spec Transmuter is a beginner-focused requirement structuring assistant for:

- non-developers
- beginner vibe coders
- non-CS learners

It turns rough ideas into structured specs, supports stack decision guidance, and provides copy-ready handoff outputs.

## What It Does

1. User writes a rough request in plain language.
2. AI converts it to a normalized standard output schema.
3. User reviews results in dedicated views:
   - Non-dev
   - Dev
   - Tech Choice
   - Thinking
   - Layers
   - Glossary
4. User can open a combined Prompt/Dev Spec workspace and copy each output independently.

## Current Key Features

### 1) Structured Spec Generation

- Fixed schema normalization (`standard_output`) with compatibility handling.
- One-time JSON repair retry when model output is malformed.
- Output artifacts:
  - `artifacts.nondev_spec_md`
  - `artifacts.dev_spec_md`
  - `artifacts.master_prompt`
  - `layers.L1_thinking`
  - `glossary`

### 2) Hybrid Tech Choice Guide

- Fixed decision frames:
  - Option A: rapid validation frame
  - Option B: balanced growth frame
  - Option C: scale/operations frame
- Dynamic stack candidates are generated per frame from user context.
- Final recommendation ranking is deterministic in-app using weighted scoring:
  - Difficulty: 45
  - Cost: 35
  - Scalability: 20
- Includes:
  - 5-factor inferred profile (budget/timeline/team/users/data sensitivity)
  - option comparison table
  - top recommendation + fallback option
  - copyable "recommended prompt"

### 3) Prompt + Dev Spec Workspace

- Quick action buttons near tabs:
  - Prompt
  - Dev Spec
- Combined screen shows both outputs at once.
- Separate copy buttons inside each panel.

### 4) Model Dropdown (Available Model Candidates)

- Header includes a model selector dropdown.
- The dropdown lists available Gemini models fetched from API.
- Selected model is used for:
  - main transmutation call
  - hybrid stack recommendation call
- If no explicit selection is made, the app still supports fallback model selection.

### 5) Glossary Navigation

- Flow-stage glossary cards with beginner/practical mode.
- Term chips in content are clickable and sync with glossary cards.
- "Locate in content" workflow is supported.

### 6) Learning Mode

- `ON`: Thinking tab enabled (assumptions/questions/alternatives).
- `OFF`: Thinking tab disabled for fast practical review.

## API Key Policy

- Stored in `sessionStorage` only.
- TTL: 30 minutes.
- Auto-expire and prompt re-entry on timeout.
- Legacy `localStorage` key cleanup is applied.

## Security Note

This is still a client-side educational MVP architecture.

- AI calls happen from browser runtime.
- API key is handled in browser session scope.

For production:

- move to server-side proxy
- keep API keys on server
- add auth/rate-limit/audit controls

## Tech Stack

- React 19
- Vite 7
- Tailwind CSS 4
- Framer Motion
- `@google/generative-ai`
- `react-markdown` + `remark-gfm`

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

## Project Structure

```text
src/
  App.jsx         # Main UI, tabs, interaction, model dropdown, tech-choice UI
  lib/gemini.js   # Model calls, schema normalization, retry logic, hybrid stack recommendation
  index.css       # Theme and markdown/table readability styles
  main.jsx        # React entry point
```

## Status

Active educational MVP under iterative refinement for beginner-friendly decision support.
