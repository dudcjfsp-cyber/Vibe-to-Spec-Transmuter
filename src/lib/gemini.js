import { GoogleGenerativeAI } from '@google/generative-ai';

// Public API endpoint for model capability discovery.
const MODELS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
// Safe defaults used when model discovery is unavailable.
const DEFAULT_MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];
// Preferred model order for generation quality/speed balance.
const PREFERENCE_ORDER = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro', 'gemini-pro'];

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
  STANDARD_OUTPUT: '표준_출력',
};

// Prompt-level standard JSON contract expected from the model.
const JSON_SCHEMA_HINT = `{
  "한_줄_요약": "string",
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
  "오늘_할_일_3개": ["string", "string", "string"]
}`;

// Core instructional prompt for educational transmutation behavior.
const BASE_SYSTEM_PROMPT = `
You are the "Vibe-to-Spec Transmuter" for an educational MVP focused on beginner-friendly software specs.
Goal: Convert an abstract vibe into a practical, implementation-ready standard output schema.

OUTPUT RULES (MUST FOLLOW):
1) Return JSON ONLY. No markdown wrapper. No prose outside JSON.
2) Follow the exact schema shape provided.
3) Use Korean language by default, but keep technical terms/identifiers in English when helpful.
4) The schema keys are fixed and fully Korean. Do not add extra top-level keys.
5) Keep output beginner-friendly and concrete.
6) "화면_흐름_5단계" must have exactly 5 concise steps.
7) "예외_모호한_점.확인_질문_3개" must have exactly 3 questions.
8) "리스크_함정_3개" must have exactly 3 items.
9) "테스트_시나리오_3개" must have exactly 3 items.
10) "오늘_할_일_3개" must have exactly 3 actionable items for today's work.
11) "권한_규칙" should be realistic by role and include clear CRUD booleans.
`;

// In-memory cache to reduce repeated model list fetches.
let availableModels = [];

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

// Removes code fences if model returns JSON inside markdown blocks.
function extractJsonText(text) {
  if (!text || typeof text !== 'string') return '';

  const cleaned = text.trim();
  if (!cleaned.startsWith('```')) return cleaned;

  const withoutFenceStart = cleaned.replace(/^```[a-zA-Z]*\s*/, '');
  return withoutFenceStart.replace(/```\s*$/, '').trim();
}

function toSafeString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => toSafeString(item))
    .filter(Boolean);
}

function toFixedLengthStringArray(value, length, fallbackPrefix) {
  const list = toStringArray(value).slice(0, length);
  while (list.length < length) {
    list.push(`${fallbackPrefix} ${list.length + 1}`);
  }
  return list;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'y', '1', 'o', '허용', '가능'].includes(normalized)) return true;
    if (['false', 'no', 'n', '0', 'x', '불가', '금지'].includes(normalized)) return false;
  }
  if (typeof value === 'number') return value !== 0;
  return false;
}

function boolToMark(flag) {
  return flag ? 'O' : 'X';
}

function markdownList(items, fallback = '- 없음') {
  if (!items?.length) return fallback;
  return items.map((item) => `- ${item}`).join('\n');
}

function markdownOrderedList(items, fallback = '1. 없음') {
  if (!items?.length) return fallback;
  return items.map((item, idx) => `${idx + 1}. ${item}`).join('\n');
}

// Normalizes the new beginner-friendly standard schema.
function normalizeStandardOutput(raw) {
  const safe = isObject(raw) ? raw : {};
  const ambiguitiesSource = isObject(safe[K.AMBIGUITIES])
    ? safe[K.AMBIGUITIES]
    : (isObject(safe.ambiguities) ? safe.ambiguities : {});
  const featuresSource = isObject(safe[K.FEATURES])
    ? safe[K.FEATURES]
    : (isObject(safe.core_features) ? safe.core_features : {});

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

  return {
    [K.SUMMARY]: toSafeString(safe[K.SUMMARY] ?? safe.one_line_summary, '요약 정보가 필요합니다.'),
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
  };
}

function buildUsersSectionMarkdown(usersAndRoles) {
  if (!usersAndRoles.length) return '- 역할 정보가 아직 정의되지 않았습니다.';
  return usersAndRoles
    .map((item) => `- **${item[K.ROLE] || '역할 미정'}**: ${item[K.DESCRIPTION] || '-'}`)
    .join('\n');
}

function buildInputFieldsTableMarkdown(fields) {
  if (!fields.length) return '| 이름 | 타입 | 예시 |\n| --- | --- | --- |\n| - | - | - |';
  const rows = fields
    .map((field) => `| ${field[K.NAME] || '-'} | ${field[K.TYPE] || '-'} | ${field[K.EXAMPLE] || '-'} |`)
    .join('\n');
  return `| 이름 | 타입 | 예시 |\n| --- | --- | --- |\n${rows}`;
}

function buildPermissionTableMarkdown(permissionMatrix) {
  if (!permissionMatrix.length) {
    return '| 역할 | 조회 | 생성 | 수정 | 삭제 | 비고 |\n| --- | --- | --- | --- | --- | --- |\n| - | - | - | - | - | - |';
  }
  const rows = permissionMatrix
    .map((rule) => `| ${rule[K.ROLE] || '-'} | ${boolToMark(rule[K.READ])} | ${boolToMark(rule[K.CREATE])} | ${boolToMark(rule[K.UPDATE])} | ${boolToMark(rule[K.DELETE])} | ${rule[K.NOTES] || '-'} |`)
    .join('\n');
  return `| 역할 | 조회 | 생성 | 수정 | 삭제 | 비고 |\n| --- | --- | --- | --- | --- | --- |\n${rows}`;
}

function buildNonDevSpecMarkdown(spec) {
  return [
    '# 표준 출력 스키마(초보 친화형)',
    '',
    '## 한 줄 요약 (이 앱이 뭘 하는지)',
    spec[K.SUMMARY],
    '',
    '## 사용자/역할 (Admin, Member 등)',
    buildUsersSectionMarkdown(spec[K.ROLES]),
    '',
    '## 핵심 기능 목록 (Must / Nice-to-have)',
    '### Must',
    markdownList(spec[K.FEATURES][K.MUST]),
    '',
    '### Nice-to-have',
    markdownList(spec[K.FEATURES][K.NICE]),
    '',
    '## 화면/흐름 (사용자 행동 순서 5단계)',
    markdownOrderedList(spec[K.FLOW]),
    '',
    '## 입력 데이터(필드) (이름/타입/예시)',
    buildInputFieldsTableMarkdown(spec[K.INPUT_FIELDS]),
    '',
    '## 권한 규칙 (조회/생성/수정/삭제 표)',
    buildPermissionTableMarkdown(spec[K.PERMISSIONS]),
    '',
    '## 예외/모호한 점 (부족한 정보 + 질문 3개)',
    '### 부족한 정보',
    markdownList(spec[K.AMBIGUITIES][K.MISSING]),
    '',
    '### 확인 질문 3개',
    markdownOrderedList(spec[K.AMBIGUITIES][K.QUESTIONS]),
    '',
    '## 리스크/함정 (3개)',
    markdownOrderedList(spec[K.RISKS]),
    '',
    '## 테스트 시나리오 (3개)',
    markdownOrderedList(spec[K.TESTS]),
    '',
    '## 다음 단계 (오늘 할 일 3개)',
    markdownOrderedList(spec[K.NEXT]),
  ].join('\n');
}

function buildDevSpecMarkdown(spec) {
  return [
    '# 개발자 구현 스펙 (표준 스키마 기반)',
    '',
    '## Product Intent',
    `- 요약: ${spec[K.SUMMARY]}`,
    '',
    '## Roles',
    buildUsersSectionMarkdown(spec[K.ROLES]),
    '',
    '## Scope',
    '### Must',
    markdownList(spec[K.FEATURES][K.MUST]),
    '',
    '### Nice-to-have',
    markdownList(spec[K.FEATURES][K.NICE]),
    '',
    '## UX Flow (5 steps)',
    markdownOrderedList(spec[K.FLOW]),
    '',
    '## Data Contract',
    buildInputFieldsTableMarkdown(spec[K.INPUT_FIELDS]),
    '',
    '## Authorization Matrix',
    buildPermissionTableMarkdown(spec[K.PERMISSIONS]),
    '',
    '## Open Questions',
    markdownOrderedList(spec[K.AMBIGUITIES][K.QUESTIONS]),
    '',
    '## Risks',
    markdownOrderedList(spec[K.RISKS]),
    '',
    '## Test Scenarios',
    markdownOrderedList(spec[K.TESTS]),
    '',
    '## Today Plan',
    markdownOrderedList(spec[K.NEXT]),
  ].join('\n');
}

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
    '[핵심 Must 기능]',
    mustList,
    '',
    '[화면 흐름 5단계]',
    flowList,
    '',
    '[입력 필드]',
    buildInputFieldsTableMarkdown(spec[K.INPUT_FIELDS]),
    '',
    '[권한 규칙]',
    buildPermissionTableMarkdown(spec[K.PERMISSIONS]),
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

function buildCompatibilityThinking(spec) {
  return {
    interpretation: spec[K.SUMMARY],
    assumptions: spec[K.FEATURES][K.MUST],
    uncertainties: [
      ...spec[K.AMBIGUITIES][K.MISSING],
      ...spec[K.AMBIGUITIES][K.QUESTIONS],
    ],
    alternatives: [],
  };
}

function buildCompatibilityGlossary(spec) {
  const fields = spec[K.INPUT_FIELDS] || [];
  return fields.slice(0, 8).map((field, idx) => {
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
}

// Converts standard schema into the existing UI contract for compatibility.
function normalizeResult(raw, fallbackModel) {
  const safe = isObject(raw) ? raw : {};
  const spec = normalizeStandardOutput(safe);

  return {
    model: typeof safe.model === 'string' && safe.model.trim() ? safe.model : fallbackModel,
    [K.STANDARD_OUTPUT]: spec,
    artifacts: {
      dev_spec_md: buildDevSpecMarkdown(spec),
      nondev_spec_md: buildNonDevSpecMarkdown(spec),
      master_prompt: buildMasterPrompt(spec),
    },
    layers: {
      L1_thinking: buildCompatibilityThinking(spec),
    },
    glossary: buildCompatibilityGlossary(spec),
  };
}

// Builds base prompt or repair prompt for second-pass JSON recovery.
function buildPrompt(vibe, showThinking, retryPayload = null) {
  if (retryPayload) {
    return `Your previous response was invalid JSON. Fix it now. Return JSON only and strictly follow schema.\nSchema:\n${JSON_SCHEMA_HINT}\nPrevious output:\n${retryPayload}`;
  }

  return `SYSTEM:\n${BASE_SYSTEM_PROMPT}\n\nJSON Schema Shape:\n${JSON_SCHEMA_HINT}\n\nUser vibe:\n${vibe}\n\nRuntime option: showThinking=${showThinking ? 'ON' : 'OFF'}.\nReturn only the fixed schema above.`;
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

