/**
 * llmCore.js 읽기 가이드(비전공자용)
 * -------------------------------------------------------
 * 이 파일은 "AI에게 요청을 보내고, 결과를 앱에서 쓰기 좋은 형태로 정리"하는 역할을 합니다.
 *
 * 큰 흐름:
 * 1) 프롬프트와 출력 스키마(약속된 JSON 모양)를 준비합니다.
 * 2) 모델 응답을 받습니다. JSON이 깨지면 1회 자동 복구를 시도합니다.
 * 3) 누락값을 기본값으로 채워 UI가 항상 렌더되도록 정규화합니다.
 * 4) 비전공자 문서/개발자 문서/마스터 프롬프트를 함께 만들어 반환합니다.
 */

// -------------------------------------------------------
// 모델/프롬프트 설정 영역
// -------------------------------------------------------
// Gemini가 제공하는 모델 목록을 조회할 때 쓰는 공식 API 주소입니다.
export const SUPPORTED_MODEL_PROVIDERS = ['gemini', 'openai', 'anthropic'];
const DEFAULT_PROVIDER = 'gemini';
const PROVIDER_DISPLAY_NAMES = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};
const MODELS_ENDPOINT_BY_PROVIDER = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
  openai: 'https://api.openai.com/v1/models',
  anthropic: 'https://api.anthropic.com/v1/models',
};
// 모델 목록 조회가 실패해도 앱이 멈추지 않게 하는 기본 후보 목록입니다.
const DEFAULT_MODELS = {
  gemini: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'],
  openai: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1', 'o4-mini'],
  anthropic: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest', 'claude-3-7-sonnet-latest'],
};
// 품질/속도 균형을 위해 우선 시도할 모델 순서입니다.
const PREFERENCE_ORDER = {
  gemini: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'],
  openai: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1', 'o4-mini', 'o3-mini'],
  anthropic: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest', 'claude-3-7-sonnet-latest'],
};

// 스키마 키를 한곳에서 관리하기 위한 상수 사전입니다.
// 예시: K.SUMMARY를 쓰면 오타 없이 "한_줄_요약"을 참조할 수 있습니다.
const K = {
  SUMMARY: '한_줄_요약',
  ROLES: '사용자_역할',
  ROLE: '역할',
  DESCRIPTION: '설명',
  FEATURES: '핵심_기능',
  MUST: '필수',
  NICE: '있으면_좋음',
  FLOW: '화면_흐름_5단계',
  INPUT_FIELDS: '입력_데이터_필드',
  NAME: '이름',
  TYPE: '타입',
  EXAMPLE: '예시',
  PERMISSIONS: '권한_규칙',
  READ: '조회',
  CREATE: '생성',
  UPDATE: '수정',
  DELETE: '삭제',
  NOTES: '비고',
  AMBIGUITIES: '예외_모호한_점',
  MISSING: '부족한_정보',
  QUESTIONS: '확인_질문_3개',
  RISKS: '리스크_함정_3개',
  TESTS: '테스트_시나리오_3개',
  NEXT: '오늘_할_일_3개',
  PROBLEM_FRAME: '문제정의_5칸',
  WHO: '누가',
  WHEN: '언제',
  WHAT: '무엇을',
  WHY: '왜',
  SUCCESS: '성공기준',
  INTERVIEW: '인터뷰_모드',
  FOLLOW_UP: '추가_질문_3개',
  COMPLETENESS: '완성도_진단',
  SCORE: '점수_0_100',
  WARNINGS: '누락_경고',
  REQUEST_CONVERTER: '수정요청_변환',
  RAW_REQUEST: '원문',
  SHORT_REQUEST: '짧은_요청',
  STANDARD_REQUEST: '표준_요청',
  DETAILED_REQUEST: '상세_요청',
  IMPACT: '변경_영향도',
  IMPACT_SCREENS: '화면',
  IMPACT_PERMISSIONS: '권한',
  IMPACT_TESTS: '테스트',
  LAYER_GUIDE: '레이어_가이드',
  LAYER: '레이어',
  GOAL: '목표',
  OUTPUT: '출력',
  STANDARD_OUTPUT: '표준_출력',
};

// 모델이 따라야 하는 JSON "형태 계약서"입니다.
// 이 문자열을 프롬프트에 그대로 넣어 "반드시 이 모양으로 답해"라고 지시합니다.
const JSON_SCHEMA_HINT = `{
  "한_줄_요약": "string",
  "문제정의_5칸": {
    "누가": "string",
    "언제": "string",
    "무엇을": "string",
    "왜": "string",
    "성공기준": "string"
  },
  "인터뷰_모드": {
    "추가_질문_3개": ["string", "string", "string"]
  },
  "사용자_역할": [
    {
      "역할": "string",
      "설명": "string"
    }
  ],
  "핵심_기능": {
    "필수": ["string"],
    "있으면_좋음": ["string"]
  },
  "화면_흐름_5단계": ["string", "string", "string", "string", "string"],
  "입력_데이터_필드": [
    {
      "이름": "string",
      "타입": "string",
      "예시": "string"
    }
  ],
  "권한_규칙": [
    {
      "역할": "string",
      "조회": true,
      "생성": true,
      "수정": true,
      "삭제": true,
      "비고": "string"
    }
  ],
  "예외_모호한_점": {
    "부족한_정보": ["string"],
    "확인_질문_3개": ["string", "string", "string"]
  },
  "리스크_함정_3개": ["string", "string", "string"],
  "테스트_시나리오_3개": ["string", "string", "string"],
  "오늘_할_일_3개": ["string", "string", "string"],
  "완성도_진단": {
    "점수_0_100": 88,
    "누락_경고": ["string"]
  },
  "수정요청_변환": {
    "원문": "string",
    "짧은_요청": "string",
    "표준_요청": "string",
    "상세_요청": "string"
  },
  "변경_영향도": {
    "화면": ["string"],
    "권한": ["string"],
    "테스트": ["string"]
  },
  "레이어_가이드": [
    {
      "레이어": "L1|L2|L3|L4|L5",
      "목표": "string",
      "출력": "string"
    }
  ]
}`;

// 모델 행동 규칙(시스템 프롬프트)입니다.
// 초보자 친화, 고정 키 사용, 항목 개수 강제 같은 정책을 명시합니다.
const BASE_SYSTEM_PROMPT = `
You are the "Vibe-to-Spec Transmuter" for an educational MVP focused on beginner-friendly software specs.
Goal: Convert an abstract vibe into a practical, implementation-ready standard output schema.

OUTPUT RULES (MUST FOLLOW):
1) Return JSON ONLY. No markdown wrapper. No prose outside JSON.
2) Follow the exact schema shape provided.
3) Use Korean language by default, but keep technical terms/identifiers in English when helpful.
4) The schema keys are fixed and fully Korean. Do not add extra top-level keys.
5) Keep output beginner-friendly and concrete.
6) "문제정의_5칸" must fill all fields with concrete text.
7) "인터뷰_모드.추가_질문_3개" must always contain exactly 3 required-information questions.
8) "화면_흐름_5단계" must have exactly 5 concise steps.
9) "예외_모호한_점.확인_질문_3개", "리스크_함정_3개", "테스트_시나리오_3개", "오늘_할_일_3개" must each have exactly 3 items.
10) "권한_규칙" should be realistic by role and include clear CRUD booleans.
11) "완성도_진단.점수_0_100" must be an integer 0~100, and "누락_경고" must be actionable.
12) "수정요청_변환" must include short/standard/detailed request variants that can be copied to developers.
13) "변경_영향도" must mention at least one screen impact, one permission impact, and one test impact.
14) "레이어_가이드" must describe L1-L5 progression for beginners.
`;

// 메모리 캐시: 이미 조회한 모델 목록을 저장해 중복 네트워크 호출을 줄입니다.
const availableModelsCache = new Map();

/**
 * 값이 "객체"인지 검사합니다.
 * 초보자 예시: 배열([])과 null은 객체처럼 보이지만 여기서는 제외합니다.
 */
function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 문자열을 안전하게 정리합니다.
 * - 문자열이면 trim() 해서 반환
 * - 문자열이 아니면 fallback 반환
 */
function toSafeString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function getApiKeyFingerprint(apiKey) {
  const normalized = toSafeString(apiKey);
  if (!normalized) return 'empty';

  // Cache keys should not store raw API keys.
  let hash = 0;
  for (let idx = 0; idx < normalized.length; idx += 1) {
    hash = (hash * 31 + normalized.charCodeAt(idx)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function getModelCacheKey(provider, apiKey) {
  const normalizedProvider = normalizeProvider(provider);
  const keyFingerprint = getApiKeyFingerprint(apiKey);
  return `${normalizedProvider}:${keyFingerprint}`;
}

function getCachedModels(provider, apiKey) {
  const cacheKey = getModelCacheKey(provider, apiKey);
  const cached = availableModelsCache.get(cacheKey);
  return Array.isArray(cached) ? cached : [];
}

function setCachedModels(provider, apiKey, models) {
  const sanitized = Array.isArray(models)
    ? models.map((item) => toSafeString(item)).filter(Boolean)
    : [];
  if (!sanitized.length) return;
  const cacheKey = getModelCacheKey(provider, apiKey);
  availableModelsCache.set(cacheKey, sanitized);
}

function normalizeProvider(provider) {
  const normalized = toSafeString(provider, DEFAULT_PROVIDER).toLowerCase();
  return SUPPORTED_MODEL_PROVIDERS.includes(normalized) ? normalized : DEFAULT_PROVIDER;
}

export function getProviderDisplayName(provider) {
  const normalized = normalizeProvider(provider);
  return PROVIDER_DISPLAY_NAMES[normalized] || PROVIDER_DISPLAY_NAMES[DEFAULT_PROVIDER];
}

function getDefaultModels(provider) {
  const normalized = normalizeProvider(provider);
  return DEFAULT_MODELS[normalized] || DEFAULT_MODELS[DEFAULT_PROVIDER];
}

function getPreferenceOrder(provider) {
  const normalized = normalizeProvider(provider);
  return PREFERENCE_ORDER[normalized] || PREFERENCE_ORDER[DEFAULT_PROVIDER];
}

/**
 * 문자열 배열만 남기고 정리합니다.
 * 예시: [1, " A ", "", null] -> ["A"]
 */
function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => toSafeString(item)).filter(Boolean);
}

/**
 * 배열 길이를 정확히 맞춥니다.
 * - 길면 잘라내고
 * - 짧으면 "기본 텍스트 + 번호"로 채웁니다.
 */
function toFixedLengthStringArray(value, length, fallbackPrefix) {
  const list = toStringArray(value).slice(0, length);
  while (list.length < length) {
    list.push(`${fallbackPrefix} ${list.length + 1}`);
  }
  return list;
}

/**
 * 다양한 입력을 boolean으로 통일합니다.
 * 예시: "yes", "허용", 1 -> true
 */
function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'y', '1', 'o', '허용', '가능'].includes(normalized)) return true;
    if (['false', 'no', 'n', '0', 'x', '불가', '금지'].includes(normalized)) return false;
  }
  if (typeof value === 'number') return value !== 0;
  return fallback;
}

/**
 * 숫자를 최소~최대 범위 안의 정수로 맞춥니다.
 * 예시: 103 -> 100, -5 -> 0
 */
function toIntegerInRange(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num);
  return Math.min(max, Math.max(min, rounded));
}

/**
 * UI 표시용 boolean 마크 변환.
 * true = O, false = X
 */
function boolToMark(flag) {
  return flag ? 'O' : 'X';
}

/**
 * bullet 리스트 마크다운 문자열 생성.
 */
function markdownList(items, fallback = '- 없음') {
  if (!items?.length) return fallback;
  return items.map((item) => `- ${item}`).join('\n');
}

/**
 * 번호 리스트 마크다운 문자열 생성.
 */
function markdownOrderedList(items, fallback = '1. 없음') {
  if (!items?.length) return fallback;
  return items.map((item, idx) => `${idx + 1}. ${item}`).join('\n');
}

/**
 * L1~L5 기본 안내 문구입니다.
 * 모델이 누락해도 최소 학습 흐름을 유지하기 위해 사용합니다.
 */
function defaultLayerGuide() {
  return [
    { [K.LAYER]: 'L1', [K.GOAL]: '문제를 구조화한다', [K.OUTPUT]: '문제정의 5칸' },
    { [K.LAYER]: 'L2', [K.GOAL]: '개발 가능한 스펙으로 번역한다', [K.OUTPUT]: '역할/기능/흐름/데이터/권한' },
    { [K.LAYER]: 'L3', [K.GOAL]: '요청문을 전달 가능한 형태로 만든다', [K.OUTPUT]: '짧은/표준/상세 요청문' },
    { [K.LAYER]: 'L4', [K.GOAL]: '누락과 영향도를 검증한다', [K.OUTPUT]: '완성도 점수/누락 경고/영향도' },
    { [K.LAYER]: 'L5', [K.GOAL]: '학습을 축적한다', [K.OUTPUT]: '오늘 할 일/다음 회고 포인트' },
  ];
}

/**
 * 레이어 가이드를 5개 고정 구조로 정규화합니다.
 * 값이 빠지면 defaultLayerGuide의 내용을 채웁니다.
 */
function extractLayerId(value) {
  const match = toSafeString(value).toUpperCase().match(/L[1-5]/);
  return match ? match[0] : '';
}

function collectLayerIds(value) {
  const matches = toSafeString(value).toUpperCase().match(/L[1-5]/g) || [];
  return Array.from(new Set(matches));
}

function parseLayerGuideBlob(text) {
  const source = toSafeString(text).replace(/\r/g, '\n');
  if (!source) return [];

  const marker = /(L[1-5])\s*[:：-]/g;
  const matches = Array.from(source.matchAll(marker));
  if (matches.length < 2) return [];

  const parsed = [];
  matches.forEach((match, idx) => {
    const currentLayer = String(match[1] || '').toUpperCase();
    const start = (match.index ?? 0) + match[0].length;
    const end = idx + 1 < matches.length ? (matches[idx + 1].index ?? source.length) : source.length;
    const body = source.slice(start, end).replace(/\s+/g, ' ').trim();
    if (!body) return;
    parsed.push({ layer: currentLayer, goal: body });
  });

  return parsed;
}

function normalizeLayerGuide(value) {
  const defaults = defaultLayerGuide();
  const source = Array.isArray(value) ? value : [];
  const layerMap = new Map();

  const fallbackGoalText = '목표 정의 필요';
  const fallbackOutputText = '출력 정의 필요';

  const getFallbackByLayer = (layerId, byIndexFallback) => {
    const matched = defaults.find((item) => extractLayerId(item[K.LAYER]) === layerId);
    return matched || byIndexFallback || {};
  };

  const upsertLayer = (layerId, goal, output, fallback) => {
    const normalizedLayer = extractLayerId(layerId);
    if (!normalizedLayer) return;
    if (layerMap.has(normalizedLayer)) return;

    layerMap.set(normalizedLayer, {
      [K.LAYER]: normalizedLayer,
      [K.GOAL]: toSafeString(goal, fallback[K.GOAL] || fallbackGoalText),
      [K.OUTPUT]: toSafeString(output, fallback[K.OUTPUT] || fallbackOutputText),
    });
  };

  source.forEach((item, idx) => {
    const safeItem = isObject(item) ? item : {};
    const fallback = defaults[idx] || defaults[0] || {};
    const rawLayer = toSafeString(safeItem[K.LAYER] ?? safeItem.layer);
    const rawGoal = toSafeString(safeItem[K.GOAL] ?? safeItem.goal);
    const rawOutput = toSafeString(safeItem[K.OUTPUT] ?? safeItem.output);

    const layerIds = collectLayerIds(rawLayer);
    if (layerIds.length === 1) {
      const fallbackByLayer = getFallbackByLayer(layerIds[0], fallback);
      upsertLayer(layerIds[0], rawGoal, rawOutput, fallbackByLayer);
      return;
    }

    // Recover from a combined OpenAI response such as "L1|L2|..." + "L1: ... L2: ...".
    const blobCandidate = [rawLayer, rawGoal, rawOutput].filter(Boolean).join('\n');
    const explodedLayers = parseLayerGuideBlob(blobCandidate);
    if (explodedLayers.length > 0) {
      explodedLayers.forEach((entry) => {
        const fallbackByLayer = getFallbackByLayer(entry.layer, fallback);
        upsertLayer(entry.layer, entry.goal, fallbackByLayer[K.OUTPUT], fallbackByLayer);
      });
      return;
    }

    const fallbackLayer = extractLayerId(fallback[K.LAYER]) || `L${Math.min(idx + 1, 5)}`;
    const fallbackByLayer = getFallbackByLayer(fallbackLayer, fallback);
    upsertLayer(fallbackLayer, rawGoal, rawOutput, fallbackByLayer);
  });

  return defaults.map((fallback, idx) => {
    const layer = extractLayerId(fallback[K.LAYER]) || `L${idx + 1}`;
    return layerMap.get(layer) || fallback;
  });
}

/**
 * 요청문 3종(짧은/표준/상세) 기본값 생성기입니다.
 * 모델 출력이 비었을 때도 사용자 복붙 문장이 남도록 보장합니다.
 */
function buildFallbackRequests(summary, mustItems, tests) {
  const headline = summary || '기능 개선 요청';
  const must = mustItems[0] || '핵심 기능';
  const test = tests[0] || '정상 시나리오 테스트';
  return {
    [K.SHORT_REQUEST]: `${must} 기능을 오늘 구현해주세요.`,
    [K.STANDARD_REQUEST]: `${headline}. 우선순위는 ${must}이며, 완료 기준은 ${test} 통과입니다.`,
    [K.DETAILED_REQUEST]: `${headline}\n- 우선 구현: ${must}\n- 확인 기준: ${test}\n- 실패 시 처리: 입력 누락/권한 없음/유효성 실패 케이스를 분리해 오류 메시지를 제공해주세요.`,
  };
}

/**
 * 스펙 누락 경고를 계산합니다.
 * 초보자 예시: "필수 기능 없음", "권한 규칙 없음" 같은 경고를 자동 생성합니다.
 */
function computeMissingWarnings(spec) {
  const warnings = [];

  if (!spec[K.SUMMARY]) warnings.push('한 줄 요약이 비어 있습니다.');
  if (!spec[K.PROBLEM_FRAME]?.[K.WHO]) warnings.push('문제정의 5칸: 누가가 비어 있습니다.');
  if (!spec[K.PROBLEM_FRAME]?.[K.WHAT]) warnings.push('문제정의 5칸: 무엇을이 비어 있습니다.');
  if (!spec[K.PROBLEM_FRAME]?.[K.SUCCESS]) warnings.push('문제정의 5칸: 성공기준이 비어 있습니다.');
  if ((spec[K.ROLES] || []).length === 0) warnings.push('사용자 역할이 비어 있습니다.');
  if ((spec[K.FEATURES]?.[K.MUST] || []).length === 0) warnings.push('필수 기능이 비어 있습니다.');
  if ((spec[K.INPUT_FIELDS] || []).length === 0) warnings.push('입력 데이터 필드가 비어 있습니다.');
  if ((spec[K.PERMISSIONS] || []).length === 0) warnings.push('권한 규칙이 비어 있습니다.');
  if ((spec[K.TESTS] || []).length === 0) warnings.push('테스트 시나리오가 비어 있습니다.');
  if (!spec[K.REQUEST_CONVERTER]?.[K.STANDARD_REQUEST]) warnings.push('표준 요청문이 비어 있습니다.');

  return warnings;
}

/**
 * 스펙 완성도 점수(0~100)를 계산합니다.
 * 핵심 체크 항목 통과율을 단순 퍼센트로 환산합니다.
 */
function computeScoreFromSpec(spec) {
  const checks = [
    Boolean(spec[K.SUMMARY]),
    Boolean(spec[K.PROBLEM_FRAME]?.[K.WHO]),
    Boolean(spec[K.PROBLEM_FRAME]?.[K.WHAT]),
    Boolean(spec[K.PROBLEM_FRAME]?.[K.SUCCESS]),
    (spec[K.ROLES] || []).length > 0,
    (spec[K.FEATURES]?.[K.MUST] || []).length > 0,
    (spec[K.FLOW] || []).length === 5,
    (spec[K.INPUT_FIELDS] || []).length > 0,
    (spec[K.PERMISSIONS] || []).length > 0,
    (spec[K.TESTS] || []).length === 3,
  ];
  const passed = checks.filter(Boolean).length;
  return Math.round((passed / checks.length) * 100);
}

/**
 * 인터뷰 질문 3개를 "항상" 만들기 위한 함수입니다.
 * - 모델 질문 + 모호점 + 기본 질문을 합쳐 중복 제거 후 3개로 고정합니다.
 */
function buildRequiredInterviewQuestions(problemFrame, interviewSource, ambiguitiesSource) {
  const sourceQuestions = [
    ...toStringArray(interviewSource[K.FOLLOW_UP] ?? interviewSource.follow_up_questions ?? interviewSource.questions),
    ...toStringArray(ambiguitiesSource[K.QUESTIONS] ?? ambiguitiesSource.questions),
    ...toStringArray(ambiguitiesSource[K.MISSING] ?? ambiguitiesSource.missing_information).map((item) => `${item} 항목을 어떻게 확정할까요?`),
  ];

  const fallbackQuestions = [
    !problemFrame[K.WHO] || problemFrame[K.WHO] === '주요 사용자 정의 필요'
      ? '이 기능을 실제로 사용하는 핵심 사용자(역할)는 누구인가요?'
      : '',
    !problemFrame[K.WHAT] || problemFrame[K.WHAT] === '해결할 작업 정의 필요'
      ? '사용자가 가장 먼저 처리해야 하는 핵심 작업은 무엇인가요?'
      : '',
    !problemFrame[K.SUCCESS] || problemFrame[K.SUCCESS] === '성공 기준 정의 필요'
      ? '완료를 판단하는 성공 기준을 숫자나 조건으로 어떻게 정의할까요?'
      : '',
    '필수 입력 데이터(예: 업체명, 제품명, 수량) 중 절대 누락되면 안 되는 항목은 무엇인가요?',
    '권한 규칙에서 일반 사용자와 관리자의 조회/수정 범위를 어떻게 나눌까요?',
  ];

  const deduped = Array.from(new Set([...sourceQuestions, ...fallbackQuestions].map((q) => toSafeString(q)).filter(Boolean)));
  return toFixedLengthStringArray(deduped, 3, '필요 정보 질문');
}

/**
 * 역할 목록을 bullet 마크다운으로 바꿉니다.
 * 예시: Admin/Member 설명을 사람이 읽기 쉽게 나열합니다.
 */
function buildUsersSectionMarkdown(usersAndRoles) {
  if (!usersAndRoles.length) return '- 역할 정보가 아직 정의되지 않았습니다.';
  return usersAndRoles
    .map((item) => `- **${item[K.ROLE] || '역할 미정'}**: ${item[K.DESCRIPTION] || '-'}`)
    .join('\n');
}

/**
 * 입력 필드 1개를 카드 형태의 마크다운으로 만듭니다.
 * 예시: "입력 필드: 업체명 / 타입: 문자열 / 예시: 김밥천국"
 */
function buildInputFieldCardMarkdown(field, idx) {
  const title = field[K.NAME] || `필드 ${idx + 1}`;
  return [
    `### 입력 필드: ${title}`,
    '```text',
    `타입: ${field[K.TYPE] || '-'}`,
    `예시: ${field[K.EXAMPLE] || '-'}`,
    '```',
  ].join('\n');
}

/**
 * 입력 필드 전체를 카드 묶음 마크다운으로 만듭니다.
 * 필드가 없으면 "미정 카드"를 출력해 빈 화면을 피합니다.
 */
function buildInputFieldCardsMarkdown(fields) {
  if (!fields.length) {
    return [
      '### 입력 필드: 미정',
      '```text',
      '타입: -',
      '예시: 입력 데이터 필드가 아직 정의되지 않았습니다.',
      '```',
    ].join('\n');
  }
  return fields.map((field, idx) => buildInputFieldCardMarkdown(field, idx)).join('\n\n');
}

/**
 * 권한 규칙 1개를 카드 마크다운으로 변환합니다.
 * CRUD를 O/X로 직관적으로 표시합니다.
 */
function buildPermissionCardMarkdown(rule, idx) {
  const title = rule[K.ROLE] || `역할 ${idx + 1}`;
  return [
    `### 권한 카드: ${title}`,
    '```text',
    `조회: ${boolToMark(rule[K.READ])}`,
    `생성: ${boolToMark(rule[K.CREATE])}`,
    `수정: ${boolToMark(rule[K.UPDATE])}`,
    `삭제: ${boolToMark(rule[K.DELETE])}`,
    `비고: ${rule[K.NOTES] || '-'}`,
    '```',
  ].join('\n');
}

/**
 * 권한 규칙 전체를 역할별 카드로 출력합니다.
 */
function buildPermissionCardsMarkdown(permissionMatrix) {
  if (!permissionMatrix.length) {
    return [
      '### 권한 카드: 미정',
      '```text',
      '조회: -',
      '생성: -',
      '수정: -',
      '삭제: -',
      '비고: 권한 규칙이 아직 정의되지 않았습니다.',
      '```',
    ].join('\n');
  }

  return permissionMatrix.map((rule, idx) => buildPermissionCardMarkdown(rule, idx)).join('\n\n');
}

/**
 * 문제정의 5칸의 항목 하나를 "헤더 + 본문 카드"로 만듭니다.
 */
function buildProblemFrameCardMarkdown(label, value) {
  return [`### ${label}`, '```text', value || '-', '```'].join('\n');
}

/**
 * 문제정의 5칸 전체 카드 묶음 생성기입니다.
 */
function buildProblemFrameCardsMarkdown(problemFrame) {
  return [
    buildProblemFrameCardMarkdown('누가', problemFrame[K.WHO]),
    buildProblemFrameCardMarkdown('언제', problemFrame[K.WHEN]),
    buildProblemFrameCardMarkdown('무엇을', problemFrame[K.WHAT]),
    buildProblemFrameCardMarkdown('왜', problemFrame[K.WHY]),
    buildProblemFrameCardMarkdown('성공기준', problemFrame[K.SUCCESS]),
  ].join('\n\n');
}

/**
 * 마스터 프롬프트 전용 문제정의 문자열입니다.
 * 코드블록 대신 간단 bullet 형태로 전달합니다.
 */
function buildProblemFramePromptMarkdown(problemFrame) {
  return [
    `- 누가: ${problemFrame[K.WHO] || '-'}`,
    `- 언제: ${problemFrame[K.WHEN] || '-'}`,
    `- 무엇을: ${problemFrame[K.WHAT] || '-'}`,
    `- 왜: ${problemFrame[K.WHY] || '-'}`,
    `- 성공기준: ${problemFrame[K.SUCCESS] || '-'}`,
  ].join('\n');
}

/**
 * L1~L5 레이어 설명을 bullet 목록으로 변환합니다.
 */
function buildLayerGuideMarkdown(layerGuide) {
  return layerGuide
    .map((item) => `- **${item[K.LAYER]}**: ${item[K.GOAL]} → ${item[K.OUTPUT]}`)
    .join('\n');
}

/**
 * 변경 영향도(화면/권한/테스트)를 섹션별로 출력합니다.
 */
function buildImpactMarkdown(impact) {
  return [
    '### 화면',
    markdownList(impact[K.IMPACT_SCREENS]),
    '',
    '### 권한',
    markdownList(impact[K.IMPACT_PERMISSIONS]),
    '',
    '### 테스트',
    markdownList(impact[K.IMPACT_TESTS]),
  ].join('\n');
}

function toMarkdownTableCell(value, fallback = '-') {
  const safe = toSafeString(value, fallback) || fallback;
  return safe.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function buildInputFieldChecklistMarkdown(fields) {
  if (!fields.length) return '- 준비할 입력 정보가 아직 정의되지 않았습니다.';
  return fields
    .map((field) => {
      const name = field[K.NAME] || '이름 미정';
      const type = field[K.TYPE] || '-';
      const example = field[K.EXAMPLE] || '-';
      return `- ${name}: ${example} (타입: ${type})`;
    })
    .join('\n');
}

function buildPermissionSummaryMarkdown(permissionMatrix) {
  if (!permissionMatrix.length) return '- 역할별 권한이 아직 정의되지 않았습니다.';
  return permissionMatrix
    .map((rule) => {
      const role = rule[K.ROLE] || '역할 미정';
      return `- ${role}: 조회 ${boolToMark(rule[K.READ])} / 생성 ${boolToMark(rule[K.CREATE])} / 수정 ${boolToMark(rule[K.UPDATE])} / 삭제 ${boolToMark(rule[K.DELETE])}`;
    })
    .join('\n');
}

function buildInputFieldTableMarkdown(fields) {
  const header = [
    '| Field | Type | Example |',
    '| --- | --- | --- |',
  ];
  if (!fields.length) return [...header, '| (미정) | - | - |'].join('\n');

  return [
    ...header,
    ...fields.map((field) => [
      `| ${toMarkdownTableCell(field[K.NAME], '(미정)')}`,
      `${toMarkdownTableCell(field[K.TYPE])}`,
      `${toMarkdownTableCell(field[K.EXAMPLE])} |`,
    ].join(' | ')),
  ].join('\n');
}

function buildPermissionMatrixTableMarkdown(permissionMatrix) {
  const header = [
    '| Role | Read | Create | Update | Delete | Notes |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  if (!permissionMatrix.length) return [...header, '| (미정) | - | - | - | - | 권한 정책 정의 필요 |'].join('\n');

  return [
    ...header,
    ...permissionMatrix.map((rule) => [
      `| ${toMarkdownTableCell(rule[K.ROLE], '(미정)')}`,
      `${boolToMark(rule[K.READ])}`,
      `${boolToMark(rule[K.CREATE])}`,
      `${boolToMark(rule[K.UPDATE])}`,
      `${boolToMark(rule[K.DELETE])}`,
      `${toMarkdownTableCell(rule[K.NOTES])} |`,
    ].join(' | ')),
  ].join('\n');
}

function buildDeveloperAcceptanceCriteriaMarkdown(spec) {
  const criteria = [];
  const problemFrame = spec[K.PROBLEM_FRAME] || {};
  const mustFeatures = spec[K.FEATURES]?.[K.MUST] || [];
  const flow = spec[K.FLOW] || [];
  const fields = spec[K.INPUT_FIELDS] || [];
  const permissionMatrix = spec[K.PERMISSIONS] || [];

  criteria.push(`핵심 사용자("${problemFrame[K.WHO] || '-'}")가 핵심 작업("${problemFrame[K.WHAT] || '-'}")을 완료할 수 있어야 합니다.`);
  criteria.push(`완료 판정은 성공기준("${problemFrame[K.SUCCESS] || '-'}")을 충족해야 합니다.`);

  if (mustFeatures.length) {
    mustFeatures.forEach((feature, idx) => {
      criteria.push(`Must ${idx + 1}: ${feature}`);
    });
  } else {
    criteria.push('Must 기능이 비어 있습니다. 최소 1개 이상의 필수 기능을 확정해야 합니다.');
  }

  criteria.push(`사용자 흐름 5단계를 순서대로 수행할 수 있어야 합니다. (현재 정의: ${flow.length}단계)`);

  if (fields.length) {
    fields.forEach((field) => {
      criteria.push(`입력 필드 "${field[K.NAME] || '미정'}"는 타입 "${field[K.TYPE] || '-'}" 검증을 통과해야 합니다.`);
    });
  } else {
    criteria.push('입력 데이터 필드 정의가 없어 유효성 검증을 완료할 수 없습니다.');
  }

  if (permissionMatrix.length) {
    permissionMatrix.forEach((rule) => {
      criteria.push(`역할 "${rule[K.ROLE] || '미정'}" 권한은 조회 ${boolToMark(rule[K.READ])}/생성 ${boolToMark(rule[K.CREATE])}/수정 ${boolToMark(rule[K.UPDATE])}/삭제 ${boolToMark(rule[K.DELETE])} 정책을 만족해야 합니다.`);
    });
  } else {
    criteria.push('역할별 CRUD 권한 정책 정의가 필요합니다.');
  }

  criteria.push('오류 처리에서 누락 입력/권한 없음/유효성 실패 케이스를 사용자 메시지와 함께 처리해야 합니다.');
  criteria.push(`테스트 시나리오 ${spec[K.TESTS]?.length || 0}개를 모두 통과해야 합니다.`);
  return markdownOrderedList(criteria, '1. 수용 기준 정의 필요');
}

function buildDeveloperImplementationChecklistMarkdown(spec) {
  const checklist = [
    `필수 기능 ${spec[K.FEATURES]?.[K.MUST]?.length || 0}개 구현`,
    '입력 데이터 계약 기준으로 validation 규칙 분리',
    '권한 규칙 기준으로 authorization 분기 분리',
    '누락 입력/권한 오류/유효성 실패 공통 에러 처리 구현',
    '테스트 시나리오 기반 검증 완료',
  ];

  const warnings = spec[K.COMPLETENESS]?.[K.WARNINGS] || [];
  warnings.forEach((warning, idx) => {
    checklist.push(`누락 경고 조치 ${idx + 1}: ${warning}`);
  });

  const todayTasks = spec[K.NEXT] || [];
  todayTasks.forEach((item, idx) => {
    checklist.push(`오늘 우선 작업 ${idx + 1}: ${item}`);
  });

  return markdownOrderedList(checklist, '1. 구현 체크리스트 정의 필요');
}

function buildRequestHandoffMarkdown(requests) {
  return [
    '### 표준 요청문',
    '```text',
    requests[K.STANDARD_REQUEST] || '-',
    '```',
    '',
    '### 상세 요청문',
    '```text',
    requests[K.DETAILED_REQUEST] || '-',
    '```',
  ].join('\n');
}

/**
 * 비전공자 탭용 마크다운 문서를 조립합니다.
 * 초보자가 의사결정/실행 항목을 빠르게 확인하도록 구성합니다.
 */
function buildNonDevSpecMarkdown(spec) {
  return [
    '# 비전공자 설명서 (결정/실행 중심)',
    '',
    '## 이 프로젝트가 하는 일',
    `- ${spec[K.SUMMARY]}`,
    '',
    '## 누구의 어떤 문제를 푸는지',
    buildProblemFrameCardsMarkdown(spec[K.PROBLEM_FRAME]),
    '',
    '## 대상 사용자/역할',
    buildUsersSectionMarkdown(spec[K.ROLES]),
    '',
    '## 이번 버전 핵심 기능 (Must)',
    markdownOrderedList(spec[K.FEATURES][K.MUST], '1. 필수 기능 정의 필요'),
    '',
    '## 사용자 흐름 (5단계)',
    markdownOrderedList(spec[K.FLOW]),
    '',
    '## 준비해야 할 입력 정보',
    buildInputFieldChecklistMarkdown(spec[K.INPUT_FIELDS]),
    '',
    '## 역할별 권한 요약',
    buildPermissionSummaryMarkdown(spec[K.PERMISSIONS]),
    '',
    '## 지금 결정이 필요한 항목',
    '### 부족한 정보',
    markdownList(spec[K.AMBIGUITIES][K.MISSING]),
    '',
    '### 확인 질문 3개',
    markdownOrderedList(spec[K.AMBIGUITIES][K.QUESTIONS]),
    '',
    '## 리스크/함정',
    markdownOrderedList(spec[K.RISKS]),
    '',
    '## 오늘 바로 할 일 3개',
    markdownOrderedList(spec[K.NEXT]),
    '',
    '## 진행 상태',
    `- 완성도 점수: ${spec[K.COMPLETENESS][K.SCORE]} / 100`,
    '- 누락 경고',
    markdownList(spec[K.COMPLETENESS][K.WARNINGS]),
    '',
    '## 참고: L1~L5 레이어',
    buildLayerGuideMarkdown(spec[K.LAYER_GUIDE]),
  ].join('\n');
}

/**
 * 개발자 탭용 마크다운 문서를 조립합니다.
 * 구현/검증에 바로 쓸 수 있는 전달 문서 형태로 구성합니다.
 */
function buildDevSpecMarkdown(spec) {
  return [
    '# 개발자 전달용 구현 스펙 (Execution Ready)',
    '',
    '## 1) Product Intent',
    `- Summary: ${spec[K.SUMMARY]}`,
    '',
    '## 2) Problem Frame',
    buildProblemFrameCardsMarkdown(spec[K.PROBLEM_FRAME]),
    '',
    '## 3) Roles',
    buildUsersSectionMarkdown(spec[K.ROLES]),
    '',
    '## 4) Scope',
    '### Must',
    markdownList(spec[K.FEATURES][K.MUST]),
    '',
    '### Nice-to-have',
    markdownList(spec[K.FEATURES][K.NICE]),
    '',
    '## 5) UX Flow (5 steps)',
    markdownOrderedList(spec[K.FLOW]),
    '',
    '## 6) Data Contract',
    buildInputFieldTableMarkdown(spec[K.INPUT_FIELDS]),
    '',
    '## 7) Authorization Matrix',
    buildPermissionMatrixTableMarkdown(spec[K.PERMISSIONS]),
    '',
    '## 8) Acceptance Criteria',
    buildDeveloperAcceptanceCriteriaMarkdown(spec),
    '',
    '## 9) Open Questions',
    '### Missing Information',
    markdownList(spec[K.AMBIGUITIES][K.MISSING]),
    '',
    '### Clarification Questions',
    markdownOrderedList(spec[K.AMBIGUITIES][K.QUESTIONS]),
    '',
    '## 10) Risks & Impact',
    '### Risks',
    markdownOrderedList(spec[K.RISKS]),
    '',
    '### Impact Preview',
    buildImpactMarkdown(spec[K.IMPACT]),
    '',
    '## 11) Test Plan',
    markdownOrderedList(spec[K.TESTS]),
    '',
    '## 12) Implementation Checklist',
    buildDeveloperImplementationChecklistMarkdown(spec),
    '',
    '## 13) Copy-ready Request Blocks',
    buildRequestHandoffMarkdown(spec[K.REQUEST_CONVERTER]),
    '',
    '## 14) Definition of Done Snapshot',
    `- Score: ${spec[K.COMPLETENESS][K.SCORE]}/100`,
    '- Remaining Warnings',
    markdownList(spec[K.COMPLETENESS][K.WARNINGS]),
  ].join('\n');
}

/**
 * "복붙 가능한 마스터 프롬프트"를 만듭니다.
 * 개발 도구(Codex/Claude 등)에 바로 넣어 실행 가능한 형태입니다.
 */
function buildMasterPrompt(spec) {
  const mustList = markdownOrderedList(spec[K.FEATURES][K.MUST], '1. Must 기능 없음');
  const flowList = markdownOrderedList(spec[K.FLOW], '1. 사용자 흐름 단계 없음');
  const testList = markdownOrderedList(spec[K.TESTS], '1. 테스트 시나리오 없음');
  const nextList = markdownOrderedList(spec[K.NEXT], '1. 오늘 할 일 없음');

  return [
    '당신은 구현 담당 시니어 개발자다. 아래 표준 스키마를 기준으로 기능을 구현하라.',
    '',
    `[한 줄 요약] ${spec[K.SUMMARY]}`,
    '',
    '[문제정의 5칸]',
    buildProblemFramePromptMarkdown(spec[K.PROBLEM_FRAME]),
    '',
    '[핵심 Must 기능]',
    mustList,
    '',
    '[화면 흐름 5단계]',
    flowList,
    '',
    '[입력 필드]',
    buildInputFieldCardsMarkdown(spec[K.INPUT_FIELDS]),
    '',
    '[권한 규칙]',
    buildPermissionCardsMarkdown(spec[K.PERMISSIONS]),
    '',
    '[표준 요청문]',
    spec[K.REQUEST_CONVERTER][K.STANDARD_REQUEST],
    '',
    '[변경 영향도]',
    buildImpactMarkdown(spec[K.IMPACT]),
    '',
    '[테스트 시나리오 3개]',
    testList,
    '',
    '[오늘 할 일 3개]',
    nextList,
    '',
    '요구사항:',
    '1) 데이터 검증 규칙과 권한 체크를 코드로 분리할 것.',
    '2) 에러 케이스(누락 입력/권한 없음/유효성 실패)를 명시적으로 처리할 것.',
    '3) 구현 후 테스트 시나리오 3개를 체크리스트로 검증할 것.',
  ].join('\n');
}

/**
 * 사고 탭의 "대안 비교" 배열을 안전한 형태로 정리합니다.
 */
function normalizeThinkingAlternatives(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const safe = isObject(item) ? item : {};
      return {
        name: toSafeString(safe.name, '대안'),
        pros: toStringArray(safe.pros),
        cons: toStringArray(safe.cons),
        decision: toSafeString(safe.decision, '보류'),
        reason: toSafeString(safe.reason),
      };
    })
    .filter((item) => item.name || item.pros.length || item.cons.length || item.reason);
}

/**
 * UI 호환용 사고 레이어(L1_thinking)를 만듭니다.
 * 모델이 대안을 안 줘도 기본 대안 2개를 넣어 빈 화면을 방지합니다.
 */
function buildCompatibilityThinking(spec, rawThinking = null) {
  const defaultAlternatives = [
    {
      name: 'A. 템플릿 기반 빠른 시작',
      pros: [
        '초보자가 바로 실행 가능한 구조를 빠르게 만들 수 있음',
        '요청문/테스트/권한 누락을 초기에 줄일 수 있음',
      ],
      cons: [
        '자유도가 낮아 복잡한 케이스 확장에 한계가 있음',
      ],
      decision: 'adopt',
      reason: '초보자 MVP 단계에서는 구조화와 실행 속도가 우선이므로 기본 경로로 채택합니다.',
    },
    {
      name: 'B. 자유 입력 중심 고유연성',
      pros: [
        '도메인 특수 요구를 자유롭게 표현할 수 있음',
      ],
      cons: [
        '초보자에게는 요구사항 누락/모호성이 증가하기 쉬움',
        '검증/테스트 항목이 비어 배포 전 리스크가 커질 수 있음',
      ],
      decision: 'reject',
      reason: '초보자 온보딩 단계에서는 품질 편차가 커서 기본 경로로는 배제하고, 고급 모드에서만 허용합니다.',
    },
  ];

  const raw = isObject(rawThinking) ? rawThinking : {};
  const normalizedAlternatives = normalizeThinkingAlternatives(raw.alternatives);
  const assumptions = toStringArray(raw.assumptions);
  const uncertainties = toStringArray(raw.uncertainties);

  return {
    interpretation: toSafeString(raw.interpretation, spec[K.SUMMARY]),
    assumptions: assumptions.length ? assumptions : spec[K.FEATURES][K.MUST],
    uncertainties: [
      ...uncertainties,
      ...spec[K.AMBIGUITIES][K.MISSING],
      ...spec[K.AMBIGUITIES][K.QUESTIONS],
      ...spec[K.COMPLETENESS][K.WARNINGS],
    ],
    alternatives: normalizedAlternatives.length ? normalizedAlternatives : defaultAlternatives,
  };
}

/**
 * 용어 네비게이터 데이터 생성기입니다.
 * - 코어 용어(Parsing/Schema/JSON/Validation)
 * - 입력 필드 기반 용어
 * 두 그룹을 합쳐 반환합니다.
 */
function buildCompatibilityGlossary(spec) {
  const coreTerms = [
    {
      term: 'Parsing',
      simple: 'Parsing은 문장에서 필요한 값을 규칙대로 뽑아 구조화하는 과정입니다.',
      analogy: '자유롭게 쓴 메모에서 주문서 칸만 정확히 추출해 옮기는 작업과 같습니다.',
      why: '파싱 규칙이 불명확하면 입력 오류와 누락이 급격히 늘어납니다.',
      decision_point: '입력 문장 포맷을 고정할지, 자연어에서 유연 추출할지 결정하세요.',
      beginner_note: '처음에는 포맷을 고정하는 방식이 안정적입니다.',
      practical_note: '정규식/파서 규칙 실패 시 에러 메시지를 명확히 반환하세요.',
      common_mistakes: [
        '구분자 규칙을 문서화하지 않아 사용자 입력이 제각각이 됨',
        '파싱 실패 케이스를 무시하고 빈 값으로 저장함',
      ],
      request_template: 'Parsing 규칙(입력 포맷, 실패 처리, 에러 메시지)을 명시하고 테스트 케이스를 추가해주세요.',
      aliases: ['파싱', 'parsing'],
      flow_stage: 'Parsing',
    },
    {
      term: 'Schema',
      simple: 'Schema는 데이터 필드의 이름, 타입, 필수 여부를 정의한 약속입니다.',
      analogy: '엑셀 양식의 열 이름과 입력 규칙을 미리 정해두는 설계도입니다.',
      why: 'Schema가 없으면 팀마다 다른 해석으로 저장되어 데이터가 깨집니다.',
      decision_point: '필수 필드와 선택 필드를 어디까지 구분할지 결정하세요.',
      beginner_note: '핵심 필드 3~5개부터 시작해 단계적으로 확장하세요.',
      practical_note: '클라이언트/서버 Schema를 동일하게 유지해야 검증 불일치를 줄일 수 있습니다.',
      common_mistakes: [
        '타입 정의 없이 문자열로만 저장함',
        '필수 필드 누락을 허용해 후속 로직이 실패함',
      ],
      request_template: 'Schema(필드명/타입/필수 여부)를 확정하고 Validation 규칙을 함께 정의해주세요.',
      aliases: ['스키마', 'schema'],
      flow_stage: 'Source of Truth',
    },
    {
      term: 'JSON',
      simple: 'JSON은 시스템끼리 데이터를 교환할 때 쓰는 구조화된 텍스트 형식입니다.',
      analogy: '사람이 읽을 수 있는 형태의 표준 전달 문서라고 보면 됩니다.',
      why: 'JSON 구조가 고정되면 자동화/검증/테스트가 쉬워집니다.',
      decision_point: '응답에서 필수 키를 무엇으로 고정할지 결정하세요.',
      beginner_note: '키 이름은 짧고 의미가 분명해야 유지보수가 쉽습니다.',
      practical_note: 'JSON 파싱 실패에 대비한 재시도/복구 로직이 필요합니다.',
      common_mistakes: [
        '필드 타입이 호출마다 바뀜',
        '필수 키가 누락되어 UI 렌더링이 깨짐',
      ],
      request_template: 'JSON 응답 스키마의 필수 키와 타입을 고정하고 누락 시 fallback을 추가해주세요.',
      aliases: ['제이슨', 'json'],
      flow_stage: 'Data Sync',
    },
    {
      term: 'Validation',
      simple: 'Validation은 입력값이 규칙을 지키는지 확인하는 단계입니다.',
      analogy: '문서 제출 전에 필수 항목과 형식을 점검하는 체크리스트와 같습니다.',
      why: 'Validation이 없으면 잘못된 데이터가 저장되어 오류가 연쇄적으로 발생합니다.',
      decision_point: '어떤 입력을 즉시 차단하고 어떤 입력은 경고로 처리할지 결정하세요.',
      beginner_note: '필수값 누락과 타입 오류부터 먼저 막으세요.',
      practical_note: '클라이언트/서버 양쪽 Validation을 분리해 구현하세요.',
      common_mistakes: [
        '클라이언트에서만 검사하고 서버 검사를 생략함',
        '에러 원인을 사용자에게 설명하지 않음',
      ],
      request_template: 'Validation 규칙(필수값/타입/범위)과 실패 메시지를 정의해주세요.',
      aliases: ['검증', 'validation'],
      flow_stage: 'Source of Truth',
    },
  ];

  const fields = spec[K.INPUT_FIELDS] || [];
  const fieldTerms = fields.slice(0, 8).map((field, idx) => {
    const name = field[K.NAME] || `필드${idx + 1}`;
    const type = field[K.TYPE] || 'string';
    return {
      term: name,
      simple: `${name}은(는) ${type} 타입 입력값입니다.`,
      analogy: '입력 폼의 칸 하나를 정확히 정의하는 규칙입니다.',
      why: '타입과 예시를 먼저 고정하면 개발/테스트 오류를 줄일 수 있습니다.',
      decision_point: `${name} 필드의 필수 여부와 유효성 규칙을 결정하세요.`,
      beginner_note: '필드마다 반드시 예시값을 먼저 정하세요.',
      practical_note: '클라이언트/서버에서 동일한 검증 규칙을 사용하세요.',
      common_mistakes: [
        '화면 입력 검증만 하고 서버 검증을 누락함',
        '필드 타입 정의 없이 문자열로만 처리함',
      ],
      request_template: `${name} 필드를 ${type} 타입으로 고정하고 유효성 검증 규칙을 추가해주세요.`,
      aliases: [name],
      flow_stage: 'Parsing',
    };
  });

  return [...coreTerms, ...fieldTerms];
}

/**
 * 모델 답변에서 코드펜스(\`\`\`)를 제거해 JSON 파싱 가능 상태로 만듭니다.
 * 예시: \`\`\`json { ... } \`\`\` -> { ... }
 */
function extractJsonText(text) {
  if (!text || typeof text !== 'string') return '';

  const cleaned = text.trim();
  if (!cleaned.startsWith('```')) return cleaned;

  const withoutFenceStart = cleaned.replace(/^```[a-zA-Z]*\s*/, '');
  return withoutFenceStart.replace(/```\s*$/, '').trim();
}

/**
 * 모델의 원본 JSON을 "표준 출력 스키마"로 정규화합니다.
 * - 키 이름 보정
 * - 누락값 fallback
 * - 길이 고정(예: 질문 3개)
 * - 완성도 점수/경고 자동 계산
 */
function normalizeStandardOutput(raw) {
  const safe = isObject(raw) ? raw : {};

  const problemFrameSource = isObject(safe[K.PROBLEM_FRAME])
    ? safe[K.PROBLEM_FRAME]
    : (isObject(safe.problem_frame) ? safe.problem_frame : {});
  const interviewSource = isObject(safe[K.INTERVIEW])
    ? safe[K.INTERVIEW]
    : (isObject(safe.interview_mode) ? safe.interview_mode : {});
  const featuresSource = isObject(safe[K.FEATURES])
    ? safe[K.FEATURES]
    : (isObject(safe.core_features) ? safe.core_features : {});
  const ambiguitiesSource = isObject(safe[K.AMBIGUITIES])
    ? safe[K.AMBIGUITIES]
    : (isObject(safe.ambiguities) ? safe.ambiguities : {});
  const requestSource = isObject(safe[K.REQUEST_CONVERTER])
    ? safe[K.REQUEST_CONVERTER]
    : (isObject(safe.request_converter) ? safe.request_converter : {});
  const impactSource = isObject(safe[K.IMPACT])
    ? safe[K.IMPACT]
    : (isObject(safe.impact_preview) ? safe.impact_preview : {});
  const completenessSource = isObject(safe[K.COMPLETENESS])
    ? safe[K.COMPLETENESS]
    : (isObject(safe.completeness) ? safe.completeness : {});

  const rolesSource = Array.isArray(safe[K.ROLES])
    ? safe[K.ROLES]
    : (Array.isArray(safe.users_and_roles) ? safe.users_and_roles : []);
  const roles = rolesSource
    .map((item) => {
      const safeItem = isObject(item) ? item : {};
      return {
        [K.ROLE]: toSafeString(safeItem[K.ROLE] ?? safeItem.role),
        [K.DESCRIPTION]: toSafeString(safeItem[K.DESCRIPTION] ?? safeItem.description),
      };
    })
    .filter((item) => item[K.ROLE] || item[K.DESCRIPTION]);

  const inputFieldsSource = Array.isArray(safe[K.INPUT_FIELDS])
    ? safe[K.INPUT_FIELDS]
    : (Array.isArray(safe.input_fields) ? safe.input_fields : []);
  const inputFields = inputFieldsSource
    .map((item) => {
      const safeItem = isObject(item) ? item : {};
      return {
        [K.NAME]: toSafeString(safeItem[K.NAME] ?? safeItem.name),
        [K.TYPE]: toSafeString(safeItem[K.TYPE] ?? safeItem.type),
        [K.EXAMPLE]: toSafeString(safeItem[K.EXAMPLE] ?? safeItem.example),
      };
    })
    .filter((item) => item[K.NAME] || item[K.TYPE] || item[K.EXAMPLE]);

  const permissionsSource = Array.isArray(safe[K.PERMISSIONS])
    ? safe[K.PERMISSIONS]
    : (Array.isArray(safe.permission_matrix) ? safe.permission_matrix : []);
  const permissions = permissionsSource
    .map((item) => {
      const safeItem = isObject(item) ? item : {};
      return {
        [K.ROLE]: toSafeString(safeItem[K.ROLE] ?? safeItem.role),
        [K.READ]: toBoolean(safeItem[K.READ] ?? safeItem.read),
        [K.CREATE]: toBoolean(safeItem[K.CREATE] ?? safeItem.create),
        [K.UPDATE]: toBoolean(safeItem[K.UPDATE] ?? safeItem.update),
        [K.DELETE]: toBoolean(safeItem[K.DELETE] ?? safeItem.delete),
        [K.NOTES]: toSafeString(safeItem[K.NOTES] ?? safeItem.notes),
      };
    })
    .filter((item) => item[K.ROLE] || item[K.NOTES]);

  const summary = toSafeString(safe[K.SUMMARY] ?? safe.one_line_summary, '요약 정보가 필요합니다.');
  const problemFrame = {
    [K.WHO]: toSafeString(problemFrameSource[K.WHO] ?? problemFrameSource.who, '주요 사용자 정의 필요'),
    [K.WHEN]: toSafeString(problemFrameSource[K.WHEN] ?? problemFrameSource.when, '사용 시점 정의 필요'),
    [K.WHAT]: toSafeString(problemFrameSource[K.WHAT] ?? problemFrameSource.what, '해결할 작업 정의 필요'),
    [K.WHY]: toSafeString(problemFrameSource[K.WHY] ?? problemFrameSource.why, '문제 배경 정의 필요'),
    [K.SUCCESS]: toSafeString(problemFrameSource[K.SUCCESS] ?? problemFrameSource.success_criteria, '성공 기준 정의 필요'),
  };

  const interviewMode = {
    [K.FOLLOW_UP]: buildRequiredInterviewQuestions(problemFrame, interviewSource, ambiguitiesSource),
  };

  const baseSpec = {
    [K.SUMMARY]: summary,
    [K.PROBLEM_FRAME]: problemFrame,
    [K.INTERVIEW]: interviewMode,
    [K.ROLES]: roles,
    [K.FEATURES]: {
      [K.MUST]: toStringArray(featuresSource[K.MUST] ?? featuresSource.must),
      [K.NICE]: toStringArray(featuresSource[K.NICE] ?? featuresSource.nice_to_have),
    },
    [K.FLOW]: toFixedLengthStringArray(safe[K.FLOW] ?? safe.user_flow_steps, 5, '사용자 흐름 단계'),
    [K.INPUT_FIELDS]: inputFields,
    [K.PERMISSIONS]: permissions,
    [K.AMBIGUITIES]: {
      [K.MISSING]: toStringArray(ambiguitiesSource[K.MISSING] ?? ambiguitiesSource.missing_information),
      [K.QUESTIONS]: toFixedLengthStringArray(ambiguitiesSource[K.QUESTIONS] ?? ambiguitiesSource.questions, 3, '확인 질문'),
    },
    [K.RISKS]: toFixedLengthStringArray(safe[K.RISKS] ?? safe.risks, 3, '리스크'),
    [K.TESTS]: toFixedLengthStringArray(safe[K.TESTS] ?? safe.test_scenarios, 3, '테스트 시나리오'),
    [K.NEXT]: toFixedLengthStringArray(safe[K.NEXT] ?? safe.next_steps_today, 3, '오늘 할 일'),
    [K.REQUEST_CONVERTER]: {
      [K.RAW_REQUEST]: toSafeString(requestSource[K.RAW_REQUEST] ?? requestSource.original, summary),
      [K.SHORT_REQUEST]: toSafeString(requestSource[K.SHORT_REQUEST] ?? requestSource.short),
      [K.STANDARD_REQUEST]: toSafeString(requestSource[K.STANDARD_REQUEST] ?? requestSource.standard),
      [K.DETAILED_REQUEST]: toSafeString(requestSource[K.DETAILED_REQUEST] ?? requestSource.detailed),
    },
    [K.IMPACT]: {
      [K.IMPACT_SCREENS]: toStringArray(impactSource[K.IMPACT_SCREENS] ?? impactSource.screens),
      [K.IMPACT_PERMISSIONS]: toStringArray(impactSource[K.IMPACT_PERMISSIONS] ?? impactSource.permissions),
      [K.IMPACT_TESTS]: toStringArray(impactSource[K.IMPACT_TESTS] ?? impactSource.tests),
    },
    [K.LAYER_GUIDE]: normalizeLayerGuide(safe[K.LAYER_GUIDE] ?? safe.layer_guide),
    [K.COMPLETENESS]: {
      [K.SCORE]: 0,
      [K.WARNINGS]: [],
    },
  };

  const requestFallback = buildFallbackRequests(
    baseSpec[K.SUMMARY],
    baseSpec[K.FEATURES][K.MUST],
    baseSpec[K.TESTS],
  );
  if (!baseSpec[K.REQUEST_CONVERTER][K.SHORT_REQUEST]) {
    baseSpec[K.REQUEST_CONVERTER][K.SHORT_REQUEST] = requestFallback[K.SHORT_REQUEST];
  }
  if (!baseSpec[K.REQUEST_CONVERTER][K.STANDARD_REQUEST]) {
    baseSpec[K.REQUEST_CONVERTER][K.STANDARD_REQUEST] = requestFallback[K.STANDARD_REQUEST];
  }
  if (!baseSpec[K.REQUEST_CONVERTER][K.DETAILED_REQUEST]) {
    baseSpec[K.REQUEST_CONVERTER][K.DETAILED_REQUEST] = requestFallback[K.DETAILED_REQUEST];
  }

  if (baseSpec[K.IMPACT][K.IMPACT_SCREENS].length === 0) {
    baseSpec[K.IMPACT][K.IMPACT_SCREENS] = baseSpec[K.FLOW].map((step) => `${step} 화면 영향 가능`);
  }
  if (baseSpec[K.IMPACT][K.IMPACT_PERMISSIONS].length === 0) {
    baseSpec[K.IMPACT][K.IMPACT_PERMISSIONS] = baseSpec[K.PERMISSIONS].length
      ? baseSpec[K.PERMISSIONS].map((rule) => `${rule[K.ROLE]} 권한 검토 필요`)
      : ['역할별 CRUD 권한 매트릭스 재검토 필요'];
  }
  if (baseSpec[K.IMPACT][K.IMPACT_TESTS].length === 0) {
    baseSpec[K.IMPACT][K.IMPACT_TESTS] = baseSpec[K.TESTS].map((item) => `${item} 검증 케이스 영향`);
  }

  const computedWarnings = computeMissingWarnings(baseSpec);
  const providedWarnings = toStringArray(completenessSource[K.WARNINGS] ?? completenessSource.warnings);
  const providedScore = toIntegerInRange(completenessSource[K.SCORE] ?? completenessSource.score, 0, 100);

  baseSpec[K.COMPLETENESS] = {
    [K.SCORE]: providedScore ?? computeScoreFromSpec(baseSpec),
    [K.WARNINGS]: providedWarnings.length ? providedWarnings : computedWarnings,
  };

  return baseSpec;
}

// -------------------------------------------------------
// UI 반환 데이터 조립 영역
// -------------------------------------------------------
// 여기서는 "정규화된 스키마"를 바탕으로
// 화면에서 바로 사용할 결과 묶음(artifacts/layers/glossary)을 만듭니다.

/**
 * 현재 UI가 기대하는 결과 형태로 묶어 반환합니다.
 * (artifacts/layers/glossary + standard_output 동시 제공)
 */
function normalizeResult(raw, fallbackModel) {
  const safe = isObject(raw) ? raw : {};
  const spec = normalizeStandardOutput(safe);
  const rawThinking = isObject(safe.layers?.L1_thinking)
    ? safe.layers.L1_thinking
    : (isObject(safe.L1_thinking) ? safe.L1_thinking : null);

  return {
    model: typeof safe.model === 'string' && safe.model.trim() ? safe.model : fallbackModel,
    standard_output: spec,
    [K.STANDARD_OUTPUT]: spec,
    artifacts: {
      dev_spec_md: buildDevSpecMarkdown(spec),
      nondev_spec_md: buildNonDevSpecMarkdown(spec),
      master_prompt: buildMasterPrompt(spec),
    },
    layers: {
      L1_thinking: buildCompatibilityThinking(spec, rawThinking),
    },
    glossary: buildCompatibilityGlossary(spec),
  };
}

// -------------------------------------------------------
// 모델 호출/복구 영역
// -------------------------------------------------------
// 이 구간은 실제 AI 호출과 JSON 복구 재시도 로직을 담당합니다.

/**
 * 모델 호출 프롬프트를 생성합니다.
 * - 일반 생성 프롬프트
 * - JSON 오류 복구(retry) 프롬프트
 */
function buildPrompt(vibe, showThinking, retryPayload = null) {
  if (retryPayload) {
    return `Your previous response was invalid JSON. Fix it now. Return JSON only and strictly follow schema.\nSchema:\n${JSON_SCHEMA_HINT}\nPrevious output:\n${retryPayload}`;
  }

  return `SYSTEM:\n${BASE_SYSTEM_PROMPT}\n\nJSON Schema Shape:\n${JSON_SCHEMA_HINT}\n\nUser vibe:\n${vibe}\n\nRuntime option: showThinking=${showThinking ? 'ON' : 'OFF'}.\nReturn only the fixed schema above.`;
}

/**
 * 모델 1회 호출 후 원문 텍스트를 반환합니다.
 */
async function generateJson(generateText, vibe, showThinking, retryPayload = null) {
  const prompt = buildPrompt(vibe, showThinking, retryPayload);
  return generateText(prompt);
}

/**
 * JSON 파싱 + 1회 자동 복구 루틴입니다.
 * 첫 파싱 실패 시, 실패한 출력물을 다시 모델에 넣어 "고쳐서 다시" 받습니다.
 */
async function parseJsonWithOneRetry(generateText, vibe, showThinking) {
  const firstText = await generateJson(generateText, vibe, showThinking);

  try {
    return JSON.parse(extractJsonText(firstText));
  } catch {
    const repairedText = await generateJson(generateText, vibe, showThinking, firstText);
    return JSON.parse(extractJsonText(repairedText));
  }
}

async function parseResponseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractApiErrorMessage(payload, fallback) {
  if (!payload || typeof payload !== 'object') return fallback;
  const direct = toSafeString(payload.message);
  const nested = toSafeString(payload.error?.message);
  return direct || nested || fallback;
}

function sortModelsByPreference(models, provider) {
  const normalizedProvider = normalizeProvider(provider);
  const order = getPreferenceOrder(normalizedProvider);
  const orderMap = new Map(order.map((modelName, idx) => [modelName.toLowerCase(), idx]));
  const unique = Array.from(new Set((Array.isArray(models) ? models : [])
    .map((item) => toSafeString(item))
    .filter(Boolean)));

  return unique.sort((a, b) => {
    const aIdx = orderMap.has(a.toLowerCase()) ? orderMap.get(a.toLowerCase()) : Number.MAX_SAFE_INTEGER;
    const bIdx = orderMap.has(b.toLowerCase()) ? orderMap.get(b.toLowerCase()) : Number.MAX_SAFE_INTEGER;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return a.localeCompare(b);
  });
}

async function fetchGeminiModels(apiKey) {
  const response = await fetch(MODELS_ENDPOINT_BY_PROVIDER.gemini, {
    headers: {
      'x-goog-api-key': apiKey,
    },
  });
  const data = await parseResponseJson(response);
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(data, `Gemini model list request failed (${response.status})`));
  }

  return (Array.isArray(data?.models) ? data.models : [])
    .filter((modelItem) => modelItem?.supportedGenerationMethods?.includes('generateContent'))
    .map((modelItem) => toSafeString(modelItem?.name).split('/').pop())
    .filter(Boolean);
}

function isOpenAITextModel(modelName) {
  const name = toSafeString(modelName).toLowerCase();
  if (!name) return false;
  if (['moderation', 'embedding', 'whisper', 'tts', 'audio', 'image', 'dall-e'].some((token) => name.includes(token))) {
    return false;
  }
  return name.startsWith('gpt-') || name.startsWith('o1') || name.startsWith('o3') || name.startsWith('o4');
}

async function fetchOpenAIModels(apiKey) {
  const response = await fetch(MODELS_ENDPOINT_BY_PROVIDER.openai, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const data = await parseResponseJson(response);
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(data, `OpenAI model list request failed (${response.status})`));
  }

  return (Array.isArray(data?.data) ? data.data : [])
    .map((modelItem) => toSafeString(modelItem?.id))
    .filter((modelName) => isOpenAITextModel(modelName));
}

async function fetchAnthropicModels(apiKey) {
  const response = await fetch(MODELS_ENDPOINT_BY_PROVIDER.anthropic, {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  });
  const data = await parseResponseJson(response);
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(data, `Anthropic model list request failed (${response.status})`));
  }

  return (Array.isArray(data?.data) ? data.data : [])
    .map((modelItem) => toSafeString(modelItem?.id))
    .filter((modelName) => modelName.toLowerCase().includes('claude'));
}

async function generateTextWithGemini(apiKey, modelName, prompt) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
    }),
  });
  const data = await parseResponseJson(response);
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(data, `Gemini generation failed (${response.status})`));
  }

  const text = (Array.isArray(data?.candidates) ? data.candidates : [])
    .flatMap((candidate) => (Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []))
    .map((part) => toSafeString(part?.text))
    .filter(Boolean)
    .join('\n')
    .trim();
  if (!text) throw new Error('Gemini generation returned empty text.');
  return text;
}

function normalizeOpenAIMessageContent(content) {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .map((item) => (typeof item === 'string' ? item : toSafeString(item?.text)))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractOpenAIResponsesText(payload) {
  const direct = toSafeString(payload?.output_text);
  if (direct) return direct;
  return (Array.isArray(payload?.output) ? payload.output : [])
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .map((item) => toSafeString(item?.text))
    .filter(Boolean)
    .join('\n')
    .trim();
}

async function generateTextWithOpenAI(apiKey, modelName, prompt) {
  const primaryResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      input: prompt,
    }),
  });
  const primaryData = await parseResponseJson(primaryResponse);
  if (primaryResponse.ok) {
    const primaryText = extractOpenAIResponsesText(primaryData);
    if (primaryText) return primaryText;
  }

  // Fallback: 일부 모델/계정 조합에서 chat.completions 경로만 허용되는 경우를 대비합니다.
  const fallbackResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const fallbackData = await parseResponseJson(fallbackResponse);
  if (!fallbackResponse.ok) {
    const fallbackError = extractApiErrorMessage(fallbackData, `OpenAI generation failed (${fallbackResponse.status})`);
    const primaryError = extractApiErrorMessage(primaryData, '');
    throw new Error(primaryError || fallbackError);
  }

  const text = normalizeOpenAIMessageContent(fallbackData?.choices?.[0]?.message?.content);
  if (!text) throw new Error('OpenAI generation returned empty text.');
  return text;
}

async function generateTextWithAnthropic(apiKey, modelName, prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      temperature: 0.2,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await parseResponseJson(response);
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(data, `Anthropic generation failed (${response.status})`));
  }

  const text = (Array.isArray(data?.content) ? data.content : [])
    .filter((item) => item?.type === 'text')
    .map((item) => toSafeString(item?.text))
    .filter(Boolean)
    .join('\n')
    .trim();
  if (!text) throw new Error('Anthropic generation returned empty text.');
  return text;
}

async function generateTextByProvider(provider, apiKey, modelName, prompt) {
  const normalizedProvider = normalizeProvider(provider);
  if (normalizedProvider === 'gemini') return generateTextWithGemini(apiKey, modelName, prompt);
  if (normalizedProvider === 'openai') return generateTextWithOpenAI(apiKey, modelName, prompt);
  if (normalizedProvider === 'anthropic') return generateTextWithAnthropic(apiKey, modelName, prompt);
  throw new Error(`Unsupported provider: ${normalizedProvider}`);
}

// -------------------------------------------------------
// 외부 공개 함수(export)
// -------------------------------------------------------
// 다른 파일(App.jsx)에서 실제로 직접 호출하는 함수들입니다.

/**
 * API 키 기준으로 사용 가능한 생성 모델 목록을 조회합니다.
 * 실패하면 DEFAULT_MODELS를 반환해 앱 사용성을 유지합니다.
 */
export async function fetchAvailableModels(apiKey, { provider = DEFAULT_PROVIDER } = {}) {
  const normalizedProvider = normalizeProvider(provider);
  if (!apiKey) return getDefaultModels(normalizedProvider);

  const cachedModels = getCachedModels(normalizedProvider, apiKey);
  if (cachedModels.length > 0) return cachedModels;

  try {
    let models = [];
    if (normalizedProvider === 'gemini') {
      models = await fetchGeminiModels(apiKey);
    } else if (normalizedProvider === 'openai') {
      models = await fetchOpenAIModels(apiKey);
    } else if (normalizedProvider === 'anthropic') {
      models = await fetchAnthropicModels(apiKey);
    }

    const sortedModels = sortModelsByPreference(models, normalizedProvider);
    if (sortedModels.length > 0) {
      setCachedModels(normalizedProvider, apiKey, sortedModels);
      return sortedModels;
    }
  } catch {
    // Avoid exposing API key details.
  }

  const fallbackModels = getDefaultModels(normalizedProvider);
  setCachedModels(normalizedProvider, apiKey, fallbackModels);
  return fallbackModels;
}

/**
 * 우선순위(PREFERENCE_ORDER)에 따라 최적 모델 1개를 선택합니다.
 */
async function getOptimalModel(apiKey, preferredModel = '', provider = DEFAULT_PROVIDER) {
  const normalizedProvider = normalizeProvider(provider);
  let availableModels = getCachedModels(normalizedProvider, apiKey);
  if (availableModels.length === 0) {
    availableModels = await fetchAvailableModels(apiKey, { provider: normalizedProvider });
  }

  // UI에서 모델을 직접 선택한 경우 해당 모델을 우선 사용합니다.
  // 선택값이 목록에 없으면 아래 우선순위 규칙으로 자연스럽게 fallback됩니다.
  const preferred = toSafeString(preferredModel).toLowerCase();
  if (preferred) {
    const matched = availableModels.find((item) => toSafeString(item).toLowerCase() === preferred);
    if (matched) return matched;
  }

  for (const candidate of getPreferenceOrder(normalizedProvider)) {
    if (availableModels.includes(candidate)) return candidate;
  }

  return availableModels[0] || getDefaultModels(normalizedProvider)[0];
}

/**
 * UI에서 호출하는 메인 엔트리 함수입니다.
 * 입력(vibe)을 받아 모델 실행 -> 파싱/정규화 -> UI 친화 결과 반환까지 담당합니다.
 *
 * 비전공자 관점 비유:
 * - vibe: "요청 메모"
 * - 모델 응답: "초안 문서"
 * - normalizeResult: "양식에 맞춘 최종 제출본"
 */
export async function transmuteVibeToSpec(
  vibe,
  apiKey,
  { provider = DEFAULT_PROVIDER, showThinking = true, modelName = '' } = {},
) {
  if (!apiKey) {
    throw new Error('API key is missing.');
  }

  const normalizedProvider = normalizeProvider(provider);
  // modelName 전달 시 우선 사용, 미전달/불일치 시 기존 자동 선택 정책을 사용합니다.
  const selectedModel = await getOptimalModel(apiKey, modelName, normalizedProvider);
  const generateText = (prompt) => generateTextByProvider(normalizedProvider, apiKey, selectedModel, prompt);

  try {
    const parsed = await parseJsonWithOneRetry(generateText, vibe, showThinking);
    return {
      ...normalizeResult(parsed, selectedModel),
      provider: normalizedProvider,
    };
  } catch (error) {
    console.error('Transmutation failed:', error);
    throw new Error('Transmutation interrupted by model or JSON parsing failure.');
  }
}

function normalizeHybridStackGuide(raw, fallbackModel) {
  const safe = isObject(raw) ? raw : {};
  const framesSource = Array.isArray(safe.frames) ? safe.frames : [];
  const frameDefaults = [
    { id: 'option_a', label: '옵션 A', strategy: '빠른 검증형 프레임' },
    { id: 'option_b', label: '옵션 B', strategy: '균형 성장형 프레임' },
    { id: 'option_c', label: '옵션 C', strategy: '확장 운영형 프레임' },
  ];

  const normalizeConfidence = (value) => {
    const normalized = toSafeString(value, '').toLowerCase();
    if (['high', '높음'].includes(normalized)) return 'high';
    if (['medium', '중간'].includes(normalized)) return 'medium';
    return 'low';
  };

  const frames = frameDefaults.map((base) => {
    const source = framesSource.find((item) => toSafeString(item?.id, '').toLowerCase() === base.id) || {};
    const stacksSource = Array.isArray(source.stacks) ? source.stacks : [];
    const names = new Set();

    const stacks = stacksSource
      .map((stackItem) => ({
        name: toSafeString(stackItem?.name),
        why: toSafeString(stackItem?.why),
        fit: toSafeString(stackItem?.fit),
        risk: toSafeString(stackItem?.risk),
        confidence: normalizeConfidence(stackItem?.confidence),
      }))
      .filter((stackItem) => {
        const key = stackItem.name.toLowerCase();
        if (!key || names.has(key)) return false;
        names.add(key);
        return true;
      })
      .slice(0, 3);

    return {
      id: base.id,
      label: toSafeString(source.label, base.label),
      strategy: toSafeString(source.strategy, base.strategy),
      stacks,
    };
  });

  return {
    model: toSafeString(safe.model, fallbackModel),
    frames,
  };
}

function buildHybridStackPrompt(vibe, standardOutput) {
  const safeOutput = isObject(standardOutput) ? standardOutput : {};
  const summary = toSafeString(
    safeOutput[K.SUMMARY] ?? safeOutput['한줄_요약'] ?? safeOutput.one_line_summary,
    '',
  );
  const must = toStringArray(
    (safeOutput[K.FEATURES] || {})[K.MUST]
    ?? (safeOutput['핵심_기능'] || {}).필수
    ?? (safeOutput.core_features || {}).must,
  ).slice(0, 5);
  const risks = toStringArray(safeOutput[K.RISKS] ?? safeOutput['리스크_가정_3개'] ?? safeOutput.risks).slice(0, 3);

  return `
You are a pragmatic technical stack advisor for beginner-friendly product teams.
Task: keep 3 fixed decision frames(option_a/option_b/option_c), but propose concrete stacks dynamically from user context.

Return JSON only (no markdown) with this exact schema:
{
  "frames": [
    {
      "id": "option_a|option_b|option_c",
      "label": "옵션 A|옵션 B|옵션 C",
      "strategy": "string",
      "stacks": [
        {
          "name": "string",
          "why": "string",
          "fit": "string",
          "risk": "string",
          "confidence": "high|medium|low"
        }
      ]
    }
  ]
}

Rules:
- Always return exactly 3 frames: option_a, option_b, option_c.
- Propose 2~3 concrete stacks per frame. Mention real stacks when relevant (e.g., Rails, Django, NestJS, Spring Boot, .NET, Laravel, Supabase, Firebase).
- Avoid duplicate stack names across all frames when possible.
- Keep descriptions concise and beginner-readable.
- No extra top-level keys.

User vibe:
${vibe}

Structured summary:
- summary: ${summary || '-'}
- must_features: ${must.join(' | ') || '-'}
- risks: ${risks.join(' | ') || '-'}
`.trim();
}

async function parseHybridStackJsonWithOneRetry(generateText, prompt) {
  const firstText = await generateText(prompt);

  try {
    return JSON.parse(extractJsonText(firstText));
  } catch {
    // 동적 스택 추천도 본문 생성과 동일하게 JSON 복구 재시도(1회)를 적용합니다.
    const repairPrompt = `Your previous output was invalid JSON. Return valid JSON only.\nSchema reminder:\n${prompt}\nPrevious output:\n${firstText}`;
    const repairedText = await generateText(repairPrompt);
    return JSON.parse(extractJsonText(repairedText));
  }
}

export async function recommendHybridStacks(
  vibe,
  standardOutput,
  apiKey,
  { provider = DEFAULT_PROVIDER, modelName = '' } = {},
) {
  if (!apiKey) {
    throw new Error('API key is missing.');
  }

  const normalizedProvider = normalizeProvider(provider);
  // 하이브리드 스택 추천 호출도 메인 생성과 같은 모델 선택 정책을 공유합니다.
  const selectedModel = await getOptimalModel(apiKey, modelName, normalizedProvider);
  const generateText = (promptText) => generateTextByProvider(normalizedProvider, apiKey, selectedModel, promptText);
  const prompt = buildHybridStackPrompt(vibe, standardOutput);

  try {
    const parsed = await parseHybridStackJsonWithOneRetry(generateText, prompt);
    return {
      ...normalizeHybridStackGuide(parsed, selectedModel),
      provider: normalizedProvider,
    };
  } catch (error) {
    console.error('Hybrid stack recommendation failed:', error);
    throw new Error('Hybrid stack recommendation interrupted by model or JSON parsing failure.');
  }
}

