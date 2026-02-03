import { GoogleGenerativeAI } from "@google/generative-ai";

const SYSTEM_PROMPT = `
You are the "Vibe-to-Spec Transmuter", an advanced architectural AI.
Your mission is to decrypt abstract user intents ("vibe") and recompile them into rigorous, executable Technical Specifications for developers or AI coding agents.

### CRITICAL PROTOCOLS (MUST FOLLOW):
1. **Variable-First Architecture:** Never allow hardcoded values (magic numbers/hex codes). Mandate the use of CSS Variables (Design Tokens) and Constants.
2. **State-Driven Logic:** Do not just describe the UI. Define explicit states: [Idle, Loading, Active, Error, Success].
3. **Master Prompt Generation:** The final section MUST be a "Copy-Paste Ready" prompt block optimized for AI Coders (Cursor/Claude).

### OUTPUT FORMAT (Markdown, Korean):

## 1. 🏗 System Architecture (구조 설계)
- **Component Tree:** DOM structure with semantic tags.
- **Tech Stack:** Optimal minimal stack (e.g., React + Tailwind + Framer Motion).

## 2. 🎨 Design Tokens (디자인 토큰)
- **Color Palette:** Define CSS variables (e.g., --primary-glow, --bg-depth).
- **Typography & Spacing:** Define logic, not just values.

## 3. 🧠 Logic & State Machine (로직 및 상태)
- **Lifecycle:** Mount -> Trigger -> Interaction -> Unmount.
- **State Definitions:** What happens in 'Loading'? What happens in 'Error'?

## 4. ⚠️ Constraints (제약 사항)
- Accessibility (A11y), Performance optimizations, Error handling.
- "Do NOT use !important."

## 5. 💻 The Master Prompt (For AI Coder)
(Write a high-density prompt in a code block. This part can be a mix of English/Korean for maximum precision. The user will copy this to Cursor/Claude.)

---
**Tone:** Cold, Cybernetic, Professional, Precise.
**Language:** Korean (except for technical terms/variable names).
`;

let availableModels = [];

/**
 * Extracts the list of available models from the API.
 */
export async function fetchAvailableModels(apiKey) {
  if (!apiKey) return ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models`, {
      headers: {
        'x-goog-api-key': apiKey
      }
    });
    const data = await response.json();

    if (data.models) {
      availableModels = data.models
        .filter(m => m.supportedGenerationMethods.includes("generateContent"))
        .map(m => m.name.split('/').pop());

      console.log("Neural models synchronized:", availableModels);
      return availableModels;
    }
  } catch (error) {
    // Sanitize error to prevent leaking key in logs
    console.warn("Neural sync failed, using default sequence.");
  }
  return ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];
}

async function getOptimalModel(apiKey) {
  if (availableModels.length === 0) {
    availableModels = await fetchAvailableModels(apiKey);
  }

  const preferenceOrder = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro", "gemini-pro"];

  for (const pref of preferenceOrder) {
    if (availableModels.includes(pref)) return pref;
  }

  return availableModels[0] || "gemini-1.5-flash";
}

export async function transmuteVibeToSpec(vibe, apiKey) {
  if (!apiKey) throw new Error("API 키가 설정되지 않았습니다. 설정에서 입력해 주세요.");

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = await getOptimalModel(apiKey);
    console.log(`Utilizing neural link: ${modelName}`);

    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `
    SYSTEM: ${SYSTEM_PROMPT}
    USER VIBE: ${vibe}
    
    TRANSMUTE NOW.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return {
      content: response.text(),
      model: modelName
    };
  } catch (error) {
    console.error("Transmutation failed:", error);
    throw new Error("Transmutation interrupted by neural link failure. Verify API key integrity.");
  }
}
