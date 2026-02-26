# Vibe-to-Spec Transmuter

[English](README.md) | [한국어](README.ko.md)

Vibe-to-Spec Transmuter is an educational, beginner-first requirement structuring app.
It converts rough product ideas into implementation-ready specs, then guides users through tech choice and execution using a fixed L1-L5 learning flow.

## Design Intent

This project follows the layer model documented in [docs/beginner-layer-design.ko.md](docs/beginner-layer-design.ko.md):

1. **L1 Problem Interview**: structure the idea with `who/when/what/why/success` and generate 3 follow-up questions.
2. **L2 Spec Structuring**: roles, features, 5-step flow, input fields, permission rules.
3. **L3 Request Conversion**: convert to short/standard/detailed developer requests.
4. **L4 Execution Validation**: completeness score, missing warnings, impact preview.
5. **L5 Learning/Action**: 3 actionable next steps.

Goal: reduce ambiguity for non-developers and beginner vibe coders before implementation starts.

## Core User Flow

1. User enters a rough vibe/requirement.
2. App calls selected provider model (Gemini/OpenAI/Anthropic).
3. Response is normalized into fixed `standard_output` shape.
4. User reviews output in tabs:
   - Non-dev
   - Dev
   - Tech Choice
   - Thinking
   - Layers
   - Glossary
5. User copies Prompt/Dev Spec outputs for handoff.

## Current Features

### 1) Multi-provider LLM support

- Supported providers: `gemini`, `openai`, `anthropic`
- Provider-specific model list fetch and generation routes
- Provider + API-key-scoped model caching
- One adapter entry for app-layer LLM calls (`src/lib/llmAdapter.js`)

### 2) Robust schema normalization

- Fixed schema normalization for UI safety
- One-retry JSON repair when model output is malformed
- Layer guide normalization now recovers combined blobs like `L1|L2|...` + `L1: ...`

### 3) Hybrid Tech Choice Guide

- Fixed decision frames: Option A / B / C
- Dynamic stack candidates generated from input context
- Deterministic in-app scoring:
  - Difficulty: 45
  - Cost: 35
  - Scalability: 20
- Includes inferred profile rows (budget/timeline/team/users/data sensitivity)

### 4) Beginner reading modes

- Learning mode toggle:
  - `ON`: shows Thinking tab with assumptions/questions/alternatives
  - `OFF`: quick review focused on non-dev/dev outputs
- Glossary navigation with flow-stage grouping and content-location linking

### 5) Session safety policy (BYOK)

- API keys are stored in `sessionStorage` only
- TTL: 30 minutes
- Key auto-expiry and re-entry prompt on timeout
- Legacy Gemini key cleanup for backward compatibility

### 6) Migration-ready internal boundaries

- LLM call boundary: `llmAdapter` -> `llmCore`
- Fixed session schema for migration prep:
  - `answers`
  - `current_node_id`
  - `history`
  - `version`
- Question pack data separated to `src/data/question_pack_v2.json`

## Output Contract (High-level)

Main normalized payload is exposed as `standard_output` (and Korean alias key), with these core blocks:

- `문제정의_5칸`
- `인터뷰_모드.추가_질문_3개`
- `사용자_역할`
- `핵심_기능`
- `화면_흐름_5단계`
- `입력_데이터_필드`
- `권한_규칙`
- `예외_모호한_점`
- `리스크_함정_3개`
- `테스트_시나리오_3개`
- `오늘_할_일_3개`
- `완성도_진단`
- `수정요청_변환`
- `변경_영향도`
- `레이어_가이드`

Additional UI artifacts:

- `artifacts.nondev_spec_md`
- `artifacts.dev_spec_md`
- `artifacts.master_prompt`
- `layers.L1_thinking`
- `glossary`

## Security Note

This repository is still an educational client-side architecture.

- LLM requests are sent from browser runtime
- User-provided API key is handled in browser session scope

For production:

1. move to thin backend proxy
2. keep provider keys server-side
3. add auth/rate-limit/audit controls

## Tech Stack

- React 19
- Vite 7
- Tailwind CSS 4
- Framer Motion
- lucide-react
- react-markdown + remark-gfm

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
  App.jsx                    # Main UI and orchestration
  data/question_pack_v2.json # Data-driven question pack
  lib/llmAdapter.js          # App-facing LLM boundary
  lib/llmCore.js             # Provider calls + normalization + retry
  lib/questionPack.js        # Question-pack loader and fallback validation
  lib/specState.js           # Fixed session schema helpers
  index.css                  # Theme and readability styles
  main.jsx                   # React entry
docs/
  beginner-layer-design.ko.md
```

## Status

Active educational MVP. The project is being iterated to improve beginner readability, migration safety, and provider robustness without changing core UX flow.
