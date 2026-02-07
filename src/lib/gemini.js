import { GoogleGenerativeAI } from '@google/generative-ai';

// Public API endpoint for model capability discovery.
const MODELS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
// Safe defaults used when model discovery is unavailable.
const DEFAULT_MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];
// Preferred model order for generation quality/speed balance.
const PREFERENCE_ORDER = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro', 'gemini-pro'];

// Prompt-level JSON contract expected from the model.
const JSON_SCHEMA_HINT = `{
  "model": "string",
  "artifacts": {
    "dev_spec_md": "string",
    "nondev_spec_md": "string",
    "master_prompt": "string"
  },
  "layers": {
    "L1_thinking": {
      "interpretation": "string",
      "assumptions": ["string"],
      "uncertainties": ["string"],
      "alternatives": [
        {
          "name": "A|B",
          "pros": ["string"],
          "cons": ["string"],
          "decision": "adopt|reject",
          "reason": "string"
        }
      ]
    }
  },
  "glossary": [
    {
      "term": "string",
      "simple": "string",
      "analogy": "string",
      "why": "string",
      "decision_point": "string",
      "beginner_note": "string",
      "practical_note": "string",
      "common_mistakes": ["string"],
      "request_template": "string",
      "aliases": ["string"],
      "flow_stage": "Webhook|Parsing|Data Sync|Source of Truth"
    }
  ]
}`;

// Core instructional prompt for educational transmutation behavior.
const BASE_SYSTEM_PROMPT = `
You are the "Vibe-to-Spec Transmuter" for an educational MVP.
Goal: Help non-developers learn engineering thinking and express change requests clearly.

OUTPUT RULES (MUST FOLLOW):
1) Return JSON ONLY. No markdown wrapper. No prose outside JSON.
2) Follow the exact schema shape provided.
3) Korean language by default, keep technical identifiers in English where useful.
4) The output must include 3 layers:
   - L1 사고(학습 핵심): 문제 재진술, 가정, 불확실/질문, 대안 2개 비교(채택/배제 이유)
   - L2 번역(전달 핵심):
     - nondev_spec_md: 비전공자용 5줄 요약 + 설정 포인트 + 수정 요청 예시 5개
     - dev_spec_md: 개발자용 요구사항/데이터/엣지케이스/테스트케이스
   - L3 실행: 구현 옵션 + 마스터 프롬프트(Cursor/Claude/Codex)
5) The master prompt must be copy-paste ready and implementation-focused.
6) Avoid hardcoded design values when discussing UI; prefer variables/tokens.
7) Every glossary item must include:
   - decision_point: what the user must decide next
   - request_template: one concrete change-request sentence
   - aliases: 1+ searchable surface forms used in body text
   - flow_stage: one of [Webhook, Parsing, Data Sync, Source of Truth]
8) For each glossary item, at least one of term/aliases must appear verbatim in nondev_spec_md or dev_spec_md.
`;

// In-memory cache to reduce repeated model list fetches.
let availableModels = [];

// Removes code fences if model returns JSON inside markdown blocks.
function extractJsonText(text) {
  if (!text || typeof text !== 'string') return '';

  const cleaned = text.trim();
  if (!cleaned.startsWith('```')) return cleaned;

  const withoutFenceStart = cleaned.replace(/^```[a-zA-Z]*\s*/, '');
  return withoutFenceStart.replace(/```\s*$/, '').trim();
}

// Normalizes model output to keep UI contracts stable.
function normalizeResult(raw, fallbackModel) {
  const safe = raw && typeof raw === 'object' ? raw : {};
  const artifacts = safe.artifacts && typeof safe.artifacts === 'object' ? safe.artifacts : {};
  const layers = safe.layers && typeof safe.layers === 'object' ? safe.layers : {};
  const thinking = layers.L1_thinking && typeof layers.L1_thinking === 'object' ? layers.L1_thinking : {};

  const glossary = Array.isArray(safe.glossary)
    ? safe.glossary.map((item) => {
      const safeItem = item && typeof item === 'object' ? item : {};
      return {
        term: typeof safeItem.term === 'string' ? safeItem.term : '',
        simple: typeof safeItem.simple === 'string' ? safeItem.simple : '',
        analogy: typeof safeItem.analogy === 'string' ? safeItem.analogy : '',
        why: typeof safeItem.why === 'string' ? safeItem.why : '',
        decision_point: typeof safeItem.decision_point === 'string' ? safeItem.decision_point : '',
        beginner_note: typeof safeItem.beginner_note === 'string' ? safeItem.beginner_note : '',
        practical_note: typeof safeItem.practical_note === 'string' ? safeItem.practical_note : '',
        common_mistakes: Array.isArray(safeItem.common_mistakes) ? safeItem.common_mistakes : [],
        request_template: typeof safeItem.request_template === 'string' ? safeItem.request_template : '',
        aliases: Array.isArray(safeItem.aliases) ? safeItem.aliases : [],
        flow_stage: typeof safeItem.flow_stage === 'string' ? safeItem.flow_stage : '',
      };
    })
    : [];

  return {
    model: typeof safe.model === 'string' && safe.model.trim() ? safe.model : fallbackModel,
    artifacts: {
      dev_spec_md: typeof artifacts.dev_spec_md === 'string' ? artifacts.dev_spec_md : '',
      nondev_spec_md: typeof artifacts.nondev_spec_md === 'string' ? artifacts.nondev_spec_md : '',
      master_prompt: typeof artifacts.master_prompt === 'string' ? artifacts.master_prompt : '',
    },
    layers: {
      L1_thinking: {
        interpretation: typeof thinking.interpretation === 'string' ? thinking.interpretation : '',
        assumptions: Array.isArray(thinking.assumptions) ? thinking.assumptions : [],
        uncertainties: Array.isArray(thinking.uncertainties) ? thinking.uncertainties : [],
        alternatives: Array.isArray(thinking.alternatives) ? thinking.alternatives : [],
      },
    },
    glossary,
  };
}

// Builds base prompt or repair prompt for second-pass JSON recovery.
function buildPrompt(vibe, showThinking, retryPayload = null) {
  if (retryPayload) {
    return `Your previous response was invalid JSON. Fix it now. Return JSON only and strictly follow schema.\nSchema:\n${JSON_SCHEMA_HINT}\nPrevious output:\n${retryPayload}`;
  }

  return `SYSTEM:\n${BASE_SYSTEM_PROMPT}\n\nJSON Schema Shape:\n${JSON_SCHEMA_HINT}\n\nUser vibe:\n${vibe}\n\nRuntime option: showThinking=${showThinking ? 'ON' : 'OFF'}.\nIf OFF, keep layers.L1_thinking concise but present.`;
}

// Executes one model generation call and returns raw text.
async function generateJson(model, vibe, showThinking, retryPayload = null) {
  const prompt = buildPrompt(vibe, showThinking, retryPayload);
  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

// Parses JSON with one retry path when first parse fails.
async function parseJsonWithOneRetry(model, vibe, showThinking) {
  const firstText = await generateJson(model, vibe, showThinking);

  try {
    return JSON.parse(extractJsonText(firstText));
  } catch {
    const repairedText = await generateJson(model, vibe, showThinking, firstText);
    return JSON.parse(extractJsonText(repairedText));
  }
}

// Synchronizes available generation models for the provided API key.
export async function fetchAvailableModels(apiKey) {
  if (!apiKey) return DEFAULT_MODELS;

  try {
    const response = await fetch(MODELS_ENDPOINT, {
      headers: {
        'x-goog-api-key': apiKey,
      },
    });
    const data = await response.json();

    if (data.models) {
      availableModels = data.models
        .filter((modelItem) => modelItem.supportedGenerationMethods?.includes('generateContent'))
        .map((modelItem) => modelItem.name.split('/').pop());

      return availableModels;
    }
  } catch {
    // Avoid exposing API key details.
  }

  return DEFAULT_MODELS;
}

// Picks best available model according to preference order.
async function getOptimalModel(apiKey) {
  if (availableModels.length === 0) {
    availableModels = await fetchAvailableModels(apiKey);
  }

  for (const preferred of PREFERENCE_ORDER) {
    if (availableModels.includes(preferred)) return preferred;
  }

  return availableModels[0] || DEFAULT_MODELS[0];
}

// Main public API used by the UI to generate normalized educational specs.
export async function transmuteVibeToSpec(vibe, apiKey, { showThinking = true } = {}) {
  if (!apiKey) {
    throw new Error('API key is missing.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = await getOptimalModel(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  try {
    const parsed = await parseJsonWithOneRetry(model, vibe, showThinking);
    return normalizeResult(parsed, modelName);
  } catch (error) {
    console.error('Transmutation failed:', error);
    throw new Error('Transmutation interrupted by model or JSON parsing failure.');
  }
}

