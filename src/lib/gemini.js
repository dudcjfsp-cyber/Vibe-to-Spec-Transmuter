import { GoogleGenerativeAI } from "@google/generative-ai";

const DEFAULT_MODELS = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];

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
      "why": "string"
    }
  ]
}`;

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
`;

let availableModels = [];

function normalizeResult(raw, fallbackModel) {
  const safe = raw && typeof raw === "object" ? raw : {};
  const artifacts = safe.artifacts && typeof safe.artifacts === "object" ? safe.artifacts : {};
  const layers = safe.layers && typeof safe.layers === "object" ? safe.layers : {};
  const thinking = layers.L1_thinking && typeof layers.L1_thinking === "object" ? layers.L1_thinking : {};

  return {
    model: typeof safe.model === "string" && safe.model.trim() ? safe.model : fallbackModel,
    artifacts: {
      dev_spec_md: typeof artifacts.dev_spec_md === "string" ? artifacts.dev_spec_md : "",
      nondev_spec_md: typeof artifacts.nondev_spec_md === "string" ? artifacts.nondev_spec_md : "",
      master_prompt: typeof artifacts.master_prompt === "string" ? artifacts.master_prompt : ""
    },
    layers: {
      L1_thinking: {
        interpretation: typeof thinking.interpretation === "string" ? thinking.interpretation : "",
        assumptions: Array.isArray(thinking.assumptions) ? thinking.assumptions : [],
        uncertainties: Array.isArray(thinking.uncertainties) ? thinking.uncertainties : [],
        alternatives: Array.isArray(thinking.alternatives) ? thinking.alternatives : []
      }
    },
    glossary: Array.isArray(safe.glossary) ? safe.glossary : []
  };
}

function extractJsonText(text) {
  if (!text || typeof text !== "string") return "";
  const cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    const withoutFenceStart = cleaned.replace(/^```[a-zA-Z]*\s*/, "");
    return withoutFenceStart.replace(/```\s*$/, "").trim();
  }
  return cleaned;
}

async function generateJson(model, vibe, showThinking, retryPayload = null) {
  const prompt = retryPayload
    ? `Your previous response was invalid JSON. Fix it now. Return JSON only and strictly follow schema.\nSchema:\n${JSON_SCHEMA_HINT}\nPrevious output:\n${retryPayload}`
    : `SYSTEM:\n${BASE_SYSTEM_PROMPT}\n\nJSON Schema Shape:\n${JSON_SCHEMA_HINT}\n\nUser vibe:\n${vibe}\n\nRuntime option: showThinking=${showThinking ? "ON" : "OFF"}.\nIf OFF, keep layers.L1_thinking concise but present.`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

/**
 * Extracts the list of available models from the API.
 */
export async function fetchAvailableModels(apiKey) {
  if (!apiKey) return DEFAULT_MODELS;

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: {
        "x-goog-api-key": apiKey
      }
    });
    const data = await response.json();

    if (data.models) {
      availableModels = data.models
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.split("/").pop());

      return availableModels;
    }
  } catch {
    // Avoid exposing API key details.
  }
  return DEFAULT_MODELS;
}

async function getOptimalModel(apiKey) {
  if (availableModels.length === 0) {
    availableModels = await fetchAvailableModels(apiKey);
  }

  const preferenceOrder = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro", "gemini-pro"];

  for (const pref of preferenceOrder) {
    if (availableModels.includes(pref)) return pref;
  }

  return availableModels[0] || DEFAULT_MODELS[0];
}

export async function transmuteVibeToSpec(vibe, apiKey, { showThinking = true } = {}) {
  if (!apiKey) {
    throw new Error("API key is missing.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = await getOptimalModel(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  try {
    const firstText = await generateJson(model, vibe, showThinking);
    try {
      const parsed = JSON.parse(extractJsonText(firstText));
      return normalizeResult(parsed, modelName);
    } catch {
      const repairedText = await generateJson(model, vibe, showThinking, firstText);
      const repaired = JSON.parse(extractJsonText(repairedText));
      return normalizeResult(repaired, modelName);
    }
  } catch (error) {
    console.error("Transmutation failed:", error);
    throw new Error("Transmutation interrupted by model or JSON parsing failure.");
  }
}

