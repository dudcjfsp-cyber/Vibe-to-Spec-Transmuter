import rawQuestionPack from '../data/question_pack_v2.json';

const REQUIRED_PROFILE_FACTOR_IDS = ['budget', 'timeline', 'team', 'users', 'dataSensitivity'];

const FALLBACK_PROFILE_QUESTIONS = [
  { id: 'budget', label: '예산', question: '초기/월 예산은 어느 정도인가?' },
  { id: 'timeline', label: '기간', question: '언제까지 첫 동작 버전을 보여줘야 하는가?' },
  { id: 'team', label: '팀 역량', question: '현재 구현 가능한 개발 역량은 어느 정도인가?' },
  { id: 'users', label: '예상 사용자 수', question: '초기 사용자 규모는 어느 정도인가?' },
  { id: 'dataSensitivity', label: '데이터 민감도', question: '개인정보/결제/의료 등 민감 데이터가 포함되는가?' },
];

const FALLBACK_PROFILE_VALUE_LABELS = {
  budget: { low: '낮음', medium: '중간', high: '높음' },
  timeline: { rush: '빠름(긴급)', normal: '보통', flexible: '여유 있음' },
  team: { beginner: '초보/비개발 중심', mixed: '혼합', advanced: '전문 개발팀' },
  users: { small: '소규모(<=100)', medium: '중간(<=1,000)', large: '대규모(1,000+)' },
  dataSensitivity: { low: '낮음', medium: '중간', high: '높음(규제/보안)' },
};

const FALLBACK_PROFILE_INFERENCE_RULES = {
  budget: {
    fallback: 'low',
    choices: {
      low: ['무료', '저예산', '예산 없음', '초기', 'mvp', '작게', '싸게'],
      medium: ['적정 예산', '중간 예산', '월 구독', '운영비'],
      high: ['엔터프라이즈', '고도화', '전사', '고예산', '대규모 투자'],
    },
  },
  timeline: {
    fallback: 'rush',
    choices: {
      rush: ['당장', '긴급', '빠르게', '즉시', '이번주', '오늘', '일주일', '2주'],
      normal: ['이번 달', '한달', '몇 주', '분기 초반'],
      flexible: ['천천히', '장기', '여유', '반기', '장기 로드맵'],
    },
  },
  team: {
    fallback: 'beginner',
    choices: {
      beginner: ['비전공', '초보', '처음', '개발자 없음', '노코드'],
      mixed: ['주니어', '한두명', '외주', '프론트만'],
      advanced: ['시니어', '백엔드 팀', 'devops', 'sre', '아키텍처', '인프라'],
    },
  },
  users: {
    fallback: 'small',
    choices: {
      small: ['내부용', '파일럿', '소규모', '베타', '팀 단위'],
      medium: ['고객사', '커뮤니티', '100명', '1000명', '중간 규모'],
      large: ['전사', '전국', '수만', '대규모', '글로벌', '공공 서비스'],
    },
  },
  dataSensitivity: {
    fallback: 'medium',
    choices: {
      low: ['익명', '공개 데이터', '비민감', '샘플 데이터'],
      medium: ['로그인', '기본 회원정보', '일반 사용자 데이터'],
      high: ['개인정보', '결제', '금융', '의료', '주민', '보안', '민감정보', '권한 통제'],
    },
  },
};

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function hasRequiredFactorIds(entries) {
  if (!Array.isArray(entries)) return false;
  const ids = new Set(entries.map((item) => String(item?.id || '').trim()).filter(Boolean));
  return REQUIRED_PROFILE_FACTOR_IDS.every((requiredId) => ids.has(requiredId));
}

function normalizeProfileQuestions(value) {
  if (!hasRequiredFactorIds(value)) return FALLBACK_PROFILE_QUESTIONS;

  const normalized = value
    .map((item) => ({
      id: String(item?.id || '').trim(),
      label: String(item?.label || '').trim(),
      question: String(item?.question || '').trim(),
    }))
    .filter((item) => item.id && item.label && item.question);

  return hasRequiredFactorIds(normalized) ? normalized : FALLBACK_PROFILE_QUESTIONS;
}

function normalizeProfileValueLabels(value) {
  if (!isObject(value)) return FALLBACK_PROFILE_VALUE_LABELS;
  const isComplete = REQUIRED_PROFILE_FACTOR_IDS.every((factorId) => isObject(value[factorId]));
  return isComplete ? value : FALLBACK_PROFILE_VALUE_LABELS;
}

function normalizeProfileInferenceRules(value) {
  if (!isObject(value)) return FALLBACK_PROFILE_INFERENCE_RULES;
  const isComplete = REQUIRED_PROFILE_FACTOR_IDS.every((factorId) => isObject(value[factorId]));
  return isComplete ? value : FALLBACK_PROFILE_INFERENCE_RULES;
}

const safePack = isObject(rawQuestionPack) ? rawQuestionPack : {};

export const PROJECT_PROFILE_QUESTIONS = normalizeProfileQuestions(safePack.profile_questions);
export const PROFILE_VALUE_LABELS = normalizeProfileValueLabels(safePack.profile_value_labels);
export const PROFILE_INFERENCE_RULES = normalizeProfileInferenceRules(safePack.profile_inference_rules);
