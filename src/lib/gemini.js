import { GoogleGenerativeAI } from "@google/generative-ai";

const SYSTEM_PROMPT = `
You are a "Vibe-to-Spec" Transmuter. 
Your task is to take a user's vaguely described "vibe" or idea and transmute it into a high-quality, professional technical specification.
The output MUST be in Markdown format.
Include sections like: Project Overview, Features, Tech Stack, UI/UX Requirements, and Implementation Phases.
Use a cold, cybernetic, and professional tone.
All output must be in Korean.
`;

let availableModels = [];

/**
 * Extracts the list of available models from the API.
 */
export async function fetchAvailableModels(apiKey) {
  if (!apiKey) return ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();

    if (data.models) {
      availableModels = data.models
        .filter(m => m.supportedGenerationMethods.includes("generateContent"))
        .map(m => m.name.split('/').pop());

      console.log("Neural models synchronized:", availableModels);
      return availableModels;
    }
  } catch (error) {
    console.warn("Neural sync failed, using default sequence:", error);
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
