/**
 * llmAdapter.js
 * - App 레이어는 이 파일만 통해 LLM 기능을 사용합니다.
 * - 현재 구현은 브라우저 직접 호출(llmCore.js 위임)이며,
 *   제품화 시 백엔드 프록시 구현으로 교체할 수 있습니다.
 */
import {
  SUPPORTED_MODEL_PROVIDERS,
  getProviderDisplayName,
  fetchAvailableModels as fetchAvailableModelsDirect,
  transmuteVibeToSpec as transmuteVibeToSpecDirect,
  recommendHybridStacks as recommendHybridStacksDirect,
} from './llmCore';

// 이후 프록시 전환 시 이 상수를 기준으로 구현을 교체합니다.
export const LLM_RUNTIME = 'direct-browser';

export { SUPPORTED_MODEL_PROVIDERS, getProviderDisplayName };

export async function fetchAvailableModels(apiKey, options = {}) {
  return fetchAvailableModelsDirect(apiKey, options);
}

export async function transmuteVibeToSpec(vibe, apiKey, options = {}) {
  return transmuteVibeToSpecDirect(vibe, apiKey, options);
}

export async function recommendHybridStacks(vibe, standardOutput, apiKey, options = {}) {
  return recommendHybridStacksDirect(vibe, standardOutput, apiKey, options);
}
