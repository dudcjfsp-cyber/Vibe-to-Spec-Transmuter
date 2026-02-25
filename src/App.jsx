
/**
 * App.jsx 읽기 가이드(비전공자용)
 * 1) 입력창에 요구사항을 적습니다.
 * 2) "사고 구조화 시작"을 누르면 AI가 표준 형식으로 정리합니다.
 * 3) 탭(비전공자/개발자/기술 선택/사고/레이어/용어)에서 결과를 확인합니다.
 *
 * 이 파일은 "화면(UI) + 화면에서 쓰는 상태 관리"를 담당합니다.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { Zap, Copy, Check, Terminal, Cpu, ShieldAlert, Settings, X, Key, Brain, BookOpen, Code, User, Layers3, ExternalLink, Compass } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { transmuteVibeToSpec, recommendHybridStacks, fetchAvailableModels } from './lib/gemini';

// -------------------------------------------------------
// 전역 상수
// -------------------------------------------------------
// API 키를 브라우저 저장소에 넣을 때 사용할 키 이름입니다.
const API_KEY_STORAGE_KEY = 'gemini_api_key';
// API 키 저장 시각(ms)을 저장할 키 이름입니다.
const API_KEY_SAVED_AT_STORAGE_KEY = 'gemini_api_key_saved_at';
// API 키의 세션 유효시간(30분)입니다.
const API_KEY_TTL_MS = 30 * 60 * 1000;
// "복사 완료" 표시가 유지되는 시간(ms)입니다.
const CLIPBOARD_RESET_MS = 2000;
// 용어 카드 정렬 순서(개념 흐름)입니다.
const FLOW_STAGES = ['Webhook', 'Parsing', 'Data Sync', 'Source of Truth'];
// 용어 클릭 후 본문 강조 효과가 유지되는 시간(ms)입니다.
const FOCUS_HIGHLIGHT_MS = 2200;
// 기술 선택 탭 ID입니다.
const TECH_GUIDE_TAB_ID = 'tech_choice';
// 기술 선택 점수 가중치입니다. (난이도/비용/확장성)
const TECH_GUIDE_WEIGHTS = {
  difficulty: 45,
  cost: 35,
  scalability: 20,
};

// 결과 패널 상단 탭 목록입니다.
const TABS = [
  { id: 'nondev', label: '비전공자', icon: User },
  { id: 'dev', label: '개발자', icon: Code },
  { id: TECH_GUIDE_TAB_ID, label: '기술 선택', icon: Compass },
  { id: 'thinking', label: '사고', icon: Brain },
  { id: 'layers', label: '레이어', icon: Layers3 },
  { id: 'glossary', label: '용어', icon: BookOpen },
];
const PROMPT_SPEC_TAB_ID = 'prompt_spec';
const QUICK_ACTION_BUTTONS = [
  { id: 'prompt', label: '프롬프트', icon: Zap },
  { id: 'spec', label: '개발 스펙', icon: Copy },
];
const GUIDE_TONE_CLASS_MAP = {
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  blue: 'border-blue-200 bg-blue-50 text-blue-800',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
};
const CONFIDENCE_BADGE_CLASS_MAP = {
  높음: 'border-emerald-200 text-emerald-700 bg-emerald-50',
  중간: 'border-amber-200 text-amber-700 bg-amber-50',
  default: 'border-slate-200 text-slate-600 bg-slate-50',
};
const HYBRID_STACK_STATUS_META = {
  success: {
    className: 'border-emerald-200 text-emerald-700 bg-emerald-50',
    label: '완료',
  },
  loading: {
    className: 'border-amber-200 text-amber-700 bg-amber-50',
    label: '생성 중',
  },
  error: {
    className: 'border-rose-200 text-rose-700 bg-rose-50',
    label: '실패(재시도 가능)',
  },
  default: {
    className: 'border-slate-200 text-slate-600 bg-slate-50',
    label: '대기',
  },
};
const PROJECT_PROFILE_QUESTIONS = [
  { id: 'budget', label: '예산', question: '초기/월 예산은 어느 정도인가?' },
  { id: 'timeline', label: '기간', question: '언제까지 첫 동작 버전을 보여줘야 하는가?' },
  { id: 'team', label: '팀 역량', question: '현재 구현 가능한 개발 역량은 어느 정도인가?' },
  { id: 'users', label: '예상 사용자 수', question: '초기 사용자 규모는 어느 정도인가?' },
  { id: 'dataSensitivity', label: '데이터 민감도', question: '개인정보/결제/의료 등 민감 데이터가 포함되는가?' },
];
const PROFILE_VALUE_LABELS = {
  budget: { low: '낮음', medium: '중간', high: '높음' },
  timeline: { rush: '빠름(긴급)', normal: '보통', flexible: '여유 있음' },
  team: { beginner: '초보/비개발 중심', mixed: '혼합', advanced: '전문 개발팀' },
  users: { small: '소규모(<=100)', medium: '중간(<=1,000)', large: '대규모(1,000+)' },
  dataSensitivity: { low: '낮음', medium: '중간', high: '높음(규제/보안)' },
};
const PROFILE_INFERENCE_RULES = {
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
const TECH_OPTION_LIBRARY = [
  {
    id: 'option_a',
    badge: '옵션 A',
    title: '빠른 검증형 프레임',
    frameDescription: '최소 리소스로 아이디어를 빠르게 실험하는 프레임',
    baseScores: { difficulty: 1, cost: 2, scalability: 2 },
    costRange: '초기 $0~$80 / 월 $30~$300',
    scaleGuide: '100명: 안정 / 1,000명: 자동화 병목 가능 / 10,000명: 재설계 필요',
    suitedFor: [
      '개발 인력이 거의 없고 빠르게 검증해야 할 때',
      '요구사항 변경이 많아 실험 속도가 중요한 초기 단계',
    ],
    risks: [
      '자동화 시나리오가 늘면 유지비와 복잡도가 급상승',
      '고급 권한/감사로그/규제 대응이 필요해지면 한계가 빠르게 옴',
    ],
    switchCondition: '월간 활성 사용자 1,000명 이상 또는 권한 규칙 10개 이상이면 옵션 B/C로 전환',
    fitBonus: {
      budget: { low: 16, medium: 8, high: 2 },
      timeline: { rush: 18, normal: 8, flexible: 2 },
      team: { beginner: 16, mixed: 8, advanced: 2 },
      users: { small: 12, medium: 2, large: -10 },
      dataSensitivity: { low: 8, medium: 2, high: -12 },
    },
  },
  {
    id: 'option_b',
    badge: '옵션 B',
    title: '균형 성장형 프레임',
    frameDescription: '속도와 유지보수, 확장성을 균형 있게 가져가는 프레임',
    baseScores: { difficulty: 3, cost: 3, scalability: 4 },
    costRange: '초기 $0~$150 / 월 $50~$700',
    scaleGuide: '100명: 안정 / 1,000명: 안정 / 10,000명: 튜닝 필요',
    suitedFor: [
      '초기 속도와 구조적 확장성의 균형이 필요할 때',
      '비전공자 PM + 1~2명 개발팀으로 운영할 때',
    ],
    risks: [
      'BaaS 벤더 의존성이 생겨 이관 비용이 커질 수 있음',
      '권한 모델과 쿼리 최적화를 초기에 잘못 잡으면 성능 이슈 발생',
    ],
    switchCondition: '복잡한 도메인 로직/대규모 트래픽(10,000+)이 본격화되면 옵션 C로 분리',
    fitBonus: {
      budget: { low: 10, medium: 12, high: 8 },
      timeline: { rush: 10, normal: 12, flexible: 8 },
      team: { beginner: 8, mixed: 12, advanced: 10 },
      users: { small: 8, medium: 12, large: 10 },
      dataSensitivity: { low: 6, medium: 10, high: 10 },
    },
  },
  {
    id: 'option_c',
    badge: '옵션 C',
    title: '확장 운영형 프레임',
    frameDescription: '장기 운영과 고트래픽, 보안 요구를 우선하는 프레임',
    baseScores: { difficulty: 5, cost: 4, scalability: 5 },
    costRange: '초기 $300~$2,000 / 월 $300~$3,000+',
    scaleGuide: '100명: 과설계 가능 / 1,000명: 안정 / 10,000명: 확장 유리',
    suitedFor: [
      '보안/규제 요구가 명확하고 장기 확장을 전제로 할 때',
      '전문 개발팀이 있고 운영 자동화까지 고려할 때',
    ],
    risks: [
      '초기 구축 기간과 비용이 높아 MVP 속도가 떨어질 수 있음',
      '운영 난이도가 높아 인프라/관측/장애 대응 체계가 필요',
    ],
    switchCondition: '규제 준수, 다중 서비스 연동, 고트래픽 대응이 핵심 KPI가 되면 유지',
    fitBonus: {
      budget: { low: -10, medium: 4, high: 14 },
      timeline: { rush: -8, normal: 6, flexible: 14 },
      team: { beginner: -12, mixed: 6, advanced: 16 },
      users: { small: -6, medium: 8, large: 18 },
      dataSensitivity: { low: 2, medium: 10, high: 16 },
    },
  },
];

// "본문 내용"으로 취급하는 탭 목록입니다.
// 용어 탭에서 "본문으로 돌아가기"할 때 이 목록을 기준으로 복원합니다.
const CONTENT_TAB_IDS = ['nondev', 'dev', 'thinking'];

/**
 * 전달받은 탭 ID가 본문 탭인지 검사합니다.
 * 예시: "dev" -> true, "glossary" -> false
 */
function isContentTab(tabId) {
  return CONTENT_TAB_IDS.includes(tabId);
}

/**
 * API 키 저장소를 비웁니다.
 * - 현재 세션 키 삭제
 * - 과거 버전에서 남았을 수 있는 localStorage 키도 함께 삭제
 */
function clearStoredApiKey() {
  sessionStorage.removeItem(API_KEY_STORAGE_KEY);
  sessionStorage.removeItem(API_KEY_SAVED_AT_STORAGE_KEY);
  localStorage.removeItem(API_KEY_STORAGE_KEY);
}

/**
 * 저장 시각 기준으로 API 키 만료 여부를 확인합니다.
 */
function isApiKeyExpired(savedAtMs) {
  return !Number.isFinite(savedAtMs) || (Date.now() - savedAtMs > API_KEY_TTL_MS);
}

/**
 * API 키를 세션 저장소에 저장합니다.
 * 저장 시각도 함께 기록해 TTL(30분)을 계산할 수 있게 합니다.
 */
function persistApiKeyToSession(key) {
  sessionStorage.setItem(API_KEY_STORAGE_KEY, key);
  sessionStorage.setItem(API_KEY_SAVED_AT_STORAGE_KEY, String(Date.now()));
  // 과거 버전에서 남은 localStorage 키는 즉시 제거합니다.
  localStorage.removeItem(API_KEY_STORAGE_KEY);
}

/**
 * 저장된 API 키를 읽습니다.
 * 정책:
 * - sessionStorage만 사용
 * - 30분 TTL이 지나면 자동 무효화
 */
function getStoredApiKey() {
  const key = sessionStorage.getItem(API_KEY_STORAGE_KEY) || '';
  const savedAtMs = Number(sessionStorage.getItem(API_KEY_SAVED_AT_STORAGE_KEY));

  // 과거 버전(localStorage 저장) 데이터는 앱 시작 시 정리합니다.
  localStorage.removeItem(API_KEY_STORAGE_KEY);

  if (!key) {
    sessionStorage.removeItem(API_KEY_SAVED_AT_STORAGE_KEY);
    return '';
  }

  if (isApiKeyExpired(savedAtMs)) {
    clearStoredApiKey();
    return '';
  }

  return key;
}

/**
 * 용어의 flow_stage를 허용된 단계로 보정합니다.
 * 알 수 없는 값이면 기본 단계(Source of Truth)로 처리합니다.
 */
function normalizeFlowStage(stage) {
  return FLOW_STAGES.includes(stage) ? stage : 'Source of Truth';
}

/**
 * 용어 카드용 고정 ID를 생성합니다.
 * 예시: "JSON Parser", 2 -> "term-json-parser-2"
 */
function makeTermId(term, idx) {
  const normalized = String(term || '').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized ? `term-${normalized}-${idx}` : `term-${idx}`;
}

/**
 * 사고 탭 fallback 마크다운 생성기입니다.
 * 구조화 UI를 쓰지 않을 때도 최소 정보가 출력되도록 보장합니다.
 */
function buildThinkingMarkdown(thinking) {
  if (!thinking) return '';

  const assumptions = (thinking.assumptions || []).map((item) => `- ${item}`).join('\n');
  const uncertainties = (thinking.uncertainties || []).map((item) => `- ${item}`).join('\n');
  const alternatives = (thinking.alternatives || [])
    .map((alt, idx) => {
      const pros = (alt.pros || []).map((item) => `  - 장점: ${item}`).join('\n');
      const cons = (alt.cons || []).map((item) => `  - 단점: ${item}`).join('\n');
      const decision = alt.decision ? `  - 판단: ${alt.decision}` : '';
      const reason = alt.reason ? `  - 이유: ${alt.reason}` : '';
      return `### 대안 ${idx + 1} (${alt.name || 'N/A'})\n${pros}\n${cons}\n${decision}\n${reason}`;
    })
    .join('\n\n');

  return `## 문제 재진술\n${thinking.interpretation || ''}\n\n## 가정\n${assumptions || '- 없음'}\n\n## 불확실 / 질문\n${uncertainties || '- 없음'}\n\n## 대안 비교\n${alternatives || '- 없음'}`;
}

/**
 * 용어 탭 fallback 마크다운 생성기입니다.
 */
function buildGlossaryMarkdown(glossary) {
  if (!glossary?.length) return '';
  return glossary
    .map((item, idx) => `### ${idx + 1}. ${item.term || '용어'}\n- 쉬운 설명: ${item.simple || ''}\n- 비유: ${item.analogy || ''}\n- 왜 중요한가: ${item.why || ''}`)
    .join('\n\n');
}

/**
 * 대안 판단값(adopt/reject)을 UI 배지 스타일로 변환합니다.
 */
function getDecisionBadge(decision) {
  const normalized = String(decision || '').toLowerCase();
  if (normalized.includes('adopt') || normalized.includes('추천')) {
    return { label: '추천', className: 'text-emerald-700 border-emerald-200 bg-emerald-50' };
  }
  if (normalized.includes('reject') || normalized.includes('배제')) {
    return { label: '배제', className: 'text-rose-700 border-rose-200 bg-rose-50' };
  }
  return { label: '보류', className: 'text-amber-700 border-amber-200 bg-amber-50' };
}

/**
 * 하이라이트 시 단어 경계를 검사하는 보조 함수입니다.
 * 예시: "json"이 "myjsonvalue" 내부에서 잘못 매칭되지 않게 돕습니다.
 */
function isWordLike(char) {
  return /[A-Za-z0-9_가-힣]/.test(char || '');
}

/**
 * 문자열 배열 정규화 함수입니다.
 * null/숫자/빈 문자열을 걸러서 "보여줄 텍스트 목록"으로 만듭니다.
 */
function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

/**
 * 결과 객체에서 표준 출력 payload를 안전하게 꺼냅니다.
 * 호환성 때문에 key가 standard_output 또는 표준_출력 둘 다 가능합니다.
 */
function getStandardOutput(result) {
  if (!result || typeof result !== 'object') return null;
  if (result.standard_output && typeof result.standard_output === 'object') return result.standard_output;
  if (result['표준_출력'] && typeof result['표준_출력'] === 'object') return result['표준_출력'];
  return null;
}

function getConfidenceBadgeClass(confidence) {
  return CONFIDENCE_BADGE_CLASS_MAP[confidence] || CONFIDENCE_BADGE_CLASS_MAP.default;
}

function getHybridStackStatusMeta(status) {
  return HYBRID_STACK_STATUS_META[status] || HYBRID_STACK_STATUS_META.default;
}

function clampOneToFive(value) {
  return Math.max(1, Math.min(5, Math.round(value)));
}

function inferProfileFactor(sourceText, factorKey) {
  const rule = PROFILE_INFERENCE_RULES[factorKey];
  if (!rule) {
    return {
      value: 'unknown',
      confidence: '낮음',
      reason: '분석 규칙이 없습니다.',
    };
  }

  let bestValue = rule.fallback;
  let bestHits = [];

  Object.entries(rule.choices || {}).forEach(([choiceValue, keywords]) => {
    const hits = (keywords || []).filter((keyword) => sourceText.includes(String(keyword || '').toLowerCase()));
    if (hits.length > bestHits.length) {
      bestValue = choiceValue;
      bestHits = hits;
    }
  });

  const confidence = bestHits.length >= 2 ? '높음' : bestHits.length === 1 ? '중간' : '낮음';
  const reason = bestHits.length
    ? `입력 단서: ${bestHits.slice(0, 2).join(', ')}`
    : '입력 단서가 부족해 초보자 기준 기본값을 적용';

  return {
    value: bestValue,
    confidence,
    reason,
  };
}

function inferProjectProfile(sourceText) {
  return PROJECT_PROFILE_QUESTIONS.reduce((acc, factor) => {
    acc[factor.id] = inferProfileFactor(sourceText, factor.id);
    return acc;
  }, {});
}

function adjustTechScoresByProfile(option, profile) {
  let difficulty = option.baseScores.difficulty;
  let cost = option.baseScores.cost;
  let scalability = option.baseScores.scalability;
  const notes = [];

  if (profile.team?.value === 'beginner' && option.id !== 'option_a') {
    difficulty += 1;
    notes.push('초보 팀 기준으로 구현 난이도 +1');
  }

  if (profile.team?.value === 'advanced' && option.id === 'option_c') {
    difficulty -= 1;
    notes.push('전문 개발팀 역량으로 구현 난이도 -1');
  }

  if (profile.timeline?.value === 'rush' && option.id === 'option_a') {
    difficulty -= 1;
    notes.push('긴급 일정에서 초기 구현 속도 이점');
  }

  if (profile.timeline?.value === 'rush' && option.id === 'option_c') {
    difficulty += 1;
    notes.push('긴급 일정에서 초기 구축 부담');
  }

  if (profile.budget?.value === 'low' && option.id === 'option_c') {
    cost += 1;
    notes.push('저예산 조건에서 초기/운영 비용 부담');
  }

  if (profile.users?.value === 'large' && option.id === 'option_a') {
    scalability -= 1;
    notes.push('대규모 사용자에서 확장성 한계');
  }

  if (profile.users?.value === 'large' && option.id === 'option_c') {
    scalability += 1;
    notes.push('대규모 사용자에서 확장 여유');
  }

  if (profile.dataSensitivity?.value === 'high' && option.id === 'option_a') {
    difficulty += 1;
    notes.push('민감 데이터 대응으로 구현 제약 증가');
  }

  if (profile.dataSensitivity?.value === 'high' && option.id !== 'option_a') {
    cost += 1;
    notes.push('규제/보안 대응으로 운영비 상승 가능');
  }

  return {
    difficulty: clampOneToFive(difficulty),
    cost: clampOneToFive(cost),
    scalability: clampOneToFive(scalability),
    notes,
  };
}

function normalizeHybridGuide(hybridGuide) {
  if (!hybridGuide || typeof hybridGuide !== 'object') return null;
  const frames = Array.isArray(hybridGuide.frames) ? hybridGuide.frames : [];

  return {
    frames: frames
      .map((frame) => {
        const stacks = Array.isArray(frame?.stacks) ? frame.stacks : [];
        return {
          id: String(frame?.id || '').trim().toLowerCase(),
          strategy: String(frame?.strategy || '').trim(),
          stacks: stacks
            .map((stack) => ({
              name: String(stack?.name || '').trim(),
              why: String(stack?.why || '').trim(),
              fit: String(stack?.fit || '').trim(),
              risk: String(stack?.risk || '').trim(),
              confidence: String(stack?.confidence || '').trim(),
            }))
            .filter((stack) => stack.name)
            .slice(0, 3),
        };
      })
      .filter((frame) => frame.id),
  };
}

function getFallbackStackCandidates(option) {
  return [
    {
      name: '모델 추천 스택 준비 중',
      why: `${option.badge} 프레임에 맞는 구체 스택을 아직 받지 못했습니다.`,
      fit: '스택 후보 재추천을 실행하면 입력 기준 후보를 생성합니다.',
      risk: '후보가 없으면 프레임 기준 의사결정만 가능해 상세 비교가 어려울 수 있습니다.',
      confidence: '낮음',
    },
  ];
}

function buildTechGuideData(vibeText, standardOutput, hybridGuideRaw = null) {
  if (!standardOutput || typeof standardOutput !== 'object') return null;
  const hybridGuide = normalizeHybridGuide(hybridGuideRaw);

  const summary = String(standardOutput['한줄_요약'] || standardOutput.one_line_summary || '').trim();
  const featureMust = toStringArray((standardOutput['핵심_기능'] || {}).필수 || (standardOutput.core_features || {}).must);
  const riskItems = toStringArray(standardOutput['리스크_가정_3개'] || standardOutput.risks);
  const todayRaw = toStringArray(standardOutput['오늘_할_일_3개'] || standardOutput.next_steps_today);

  const sourceText = [vibeText, summary, ...featureMust, ...riskItems]
    .join(' ')
    .toLowerCase();

  const profile = inferProjectProfile(sourceText);

  const scoredOptions = TECH_OPTION_LIBRARY.map((option) => {
    const matchedFrame = hybridGuide?.frames?.find((frame) => frame.id === option.id);
    const stackCandidates = matchedFrame?.stacks?.length ? matchedFrame.stacks : getFallbackStackCandidates(option);
    const primaryStack = stackCandidates[0]?.name || '추천 스택 없음';

    const adjusted = adjustTechScoresByProfile(option, profile);
    const weightedMetricScore = (
      (6 - adjusted.difficulty) * TECH_GUIDE_WEIGHTS.difficulty
      + (6 - adjusted.cost) * TECH_GUIDE_WEIGHTS.cost
      + adjusted.scalability * TECH_GUIDE_WEIGHTS.scalability
    );

    const fitContributions = PROJECT_PROFILE_QUESTIONS.map((factor) => {
      const value = profile[factor.id]?.value;
      return {
        label: factor.label,
        value: option.fitBonus?.[factor.id]?.[value] ?? 0,
      };
    });

    const fitBonus = fitContributions.reduce((sum, item) => sum + item.value, 0);
    const topFitReasons = fitContributions
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 2)
      .map((item) => item.label);

    return {
      ...option,
      adjustedScores: adjusted,
      weightedMetricScore: Math.round(weightedMetricScore),
      fitBonus,
      totalScore: Math.round(weightedMetricScore + fitBonus),
      topFitReasons,
      strategy: matchedFrame?.strategy || option.frameDescription,
      stackCandidates,
      primaryStack,
    };
  });

  const ranking = [...scoredOptions].sort((a, b) => b.totalScore - a.totalScore);
  const recommendation = ranking[0];
  const alternative = ranking[1] || null;
  const scoreGap = recommendation && alternative ? recommendation.totalScore - alternative.totalScore : 0;
  const confidence = scoreGap >= 25 ? '높음' : scoreGap >= 10 ? '중간' : '낮음';

  const profileRows = PROJECT_PROFILE_QUESTIONS.map((factor) => {
    const inferred = profile[factor.id] || { value: '-', confidence: '낮음', reason: '-' };
    const valueLabel = PROFILE_VALUE_LABELS[factor.id]?.[inferred.value] || inferred.value;
    return {
      ...factor,
      value: inferred.value,
      valueLabel,
      confidence: inferred.confidence,
      reason: inferred.reason,
    };
  });

  const todayActions = [
    recommendation
      ? `추천 옵션(${recommendation.badge} ${recommendation.title}) 기준으로 MVP 범위를 1페이지로 확정합니다.`
      : '추천 옵션 기준으로 MVP 범위를 1페이지로 확정합니다.',
    todayRaw[0] || '핵심 화면 3개와 각 화면의 필수 기능 1개씩을 먼저 고정합니다.',
    todayRaw[1] || 'Antigravity 프롬프트로 1차 구현을 요청하고 결과를 개발 스펙과 비교합니다.',
  ].slice(0, 3);

  while (todayActions.length < 3) {
    todayActions.push('검수 기준(성공 조건/테스트)을 명시해 다음 수정 요청을 준비합니다.');
  }

  return {
    profileRows,
    options: scoredOptions,
    ranking,
    recommendation,
    alternative,
    confidence,
    scoreGap,
    oneLine: recommendation
      ? `${recommendation.badge} ${recommendation.title}${recommendation.primaryStack ? ` · ${recommendation.primaryStack}` : ''} 추천 (${confidence} 확신, 점수차 ${scoreGap}점)`
      : '추천 옵션을 계산하지 못했습니다.',
    todayActions,
  };
}

function buildRecommendedGuidePrompt(masterPrompt, techGuide) {
  const basePrompt = String(masterPrompt || '').trim();
  if (!basePrompt || !techGuide?.recommendation) return basePrompt;

  const rec = techGuide.recommendation;
  const candidateText = (rec.stackCandidates || []).map((item) => item.name).filter(Boolean).join(', ');
  const guideLines = [
    basePrompt,
    '',
    '---',
    '[기술 선택 안내자 메모]',
    `- 추천 옵션: ${rec.badge} ${rec.title}`,
    `- 추천 스택(동적 후보): ${rec.primaryStack || '-'}`,
    `- 대체 후보: ${candidateText || '-'}`,
    `- 점수(입력 기반 추정): 난이도 ${rec.adjustedScores.difficulty}/5, 비용 ${rec.adjustedScores.cost}/5, 확장성 ${rec.adjustedScores.scalability}/5`,
    `- 핵심 근거: ${rec.topFitReasons.length ? rec.topFitReasons.join(', ') : '기본 가중치 기준 우세'}`,
    `- 주요 리스크: ${rec.risks[0] || '-'}`,
    `- 전환 조건: ${rec.switchCondition}`,
  ];

  return guideLines.join('\n');
}

/**
 * 활성 탭에 맞는 상단 안내문구를 반환합니다.
 * 모든 탭에서 "지금 이 화면에서 무엇을 보면 되는지"를 한 줄로 안내합니다.
 */
function getTopGuideItems(activeTab, showThinking) {
  if (activeTab === 'nondev') {
    return [
      { tone: 'blue', title: '비전공자 페이지 안내', description: '아이디어를 쉬운 말로 풀어쓴 결과를 확인하고 빠진 요구사항을 먼저 점검할 때 사용' },
    ];
  }
  if (activeTab === 'dev') {
    return [
      { tone: 'blue', title: '개발자 페이지 안내', description: '실제 구현을 위한 기술 요구사항/범위를 검토하고 개발팀과 공유할 때 사용' },
    ];
  }
  if (activeTab === TECH_GUIDE_TAB_ID) {
    return [
      { tone: 'blue', title: '기술 선택 페이지 안내', description: '프레임(A/B/C)은 고정하고, 구체 스택 후보는 입력 기반으로 동적 추천해 비교할 때 사용' },
      { tone: 'slate', title: '기본 가중치', description: `난이도 ${TECH_GUIDE_WEIGHTS.difficulty} / 비용 ${TECH_GUIDE_WEIGHTS.cost} / 확장성 ${TECH_GUIDE_WEIGHTS.scalability}` },
    ];
  }
  if (activeTab === 'thinking') {
    return [
      {
        tone: showThinking ? 'emerald' : 'slate',
        title: '사고 페이지 안내',
        description: showThinking
          ? '문제 재진술, 가정, 불확실성, 대안 비교를 보면서 의사결정을 구조화할 때 사용'
          : '학습 모드가 OFF라 사고 구조를 숨긴 상태입니다. 학습 모드를 ON으로 바꾸면 상세 분석이 표시됩니다.',
      },
    ];
  }
  if (activeTab === 'layers') {
    return [
      { tone: 'blue', title: '레이어 페이지 안내', description: 'L1~L5 레이어를 순서대로 보며 범위 정의부터 실행 항목까지 누락 없이 점검할 때 사용' },
    ];
  }
  if (activeTab === 'glossary') {
    return [
      { tone: 'blue', title: '용어 페이지 안내', description: '핵심 용어를 단계별로 보고, 본문에서 위치를 찾거나 수정 요청 템플릿을 만들 때 사용' },
    ];
  }
  if (activeTab === PROMPT_SPEC_TAB_ID) {
    return [
      { tone: 'amber', title: 'Antigravity용 프롬프트', description: 'Antigravity에 붙여넣어 코드 생성을 요청할 때 사용' },
      { tone: 'blue', title: '개발 전달용 스펙', description: '사람 개발자/팀과 요구사항을 문서로 공유해 범위를 먼저 합의할 때 사용' },
      { tone: 'slate', title: 'Antigravity 사용 순서', description: '1) 개발 전달용 스펙으로 범위 확인 → 2) Antigravity용 프롬프트로 구현 요청 → 3) 결과를 스펙과 비교해 검수' },
    ];
  }
  return [];
}

/**
 * 메인 화면 컴포넌트입니다.
 * 초보자 관점에서 보면, "입력 -> 변환 -> 탭별 결과 확인" 흐름 전체를 담당합니다.
 */
function App() {
  // -------------------------------------------------------
  // 상태(state): 입력/결과/탭/강조/설정
  // -------------------------------------------------------
  // 입력값(vibe), 생성 결과(result), 처리 상태(status)
  const [vibe, setVibe] = useState('');
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('idle');
  const [activeModel, setActiveModel] = useState('OFFLINE');
  const [modelOptions, setModelOptions] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [isModelOptionsLoading, setIsModelOptionsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedMaster, setCopiedMaster] = useState(false);
  const [copiedGuidePrompt, setCopiedGuidePrompt] = useState(false);
  const [activeTab, setActiveTab] = useState('nondev');
  const [promptSpecFocus, setPromptSpecFocus] = useState('prompt');
  const [lastContentTab, setLastContentTab] = useState('nondev');
  const [showThinking, setShowThinking] = useState(true);
  const [glossaryLevel, setGlossaryLevel] = useState('beginner');
  const [selectedTermId, setSelectedTermId] = useState(null);
  const [focusedTermId, setFocusedTermId] = useState(null);
  const [termLocateMessage, setTermLocateMessage] = useState('');
  const [pendingGlossaryFocusTermId, setPendingGlossaryFocusTermId] = useState(null);
  const [pendingContentScrollTermId, setPendingContentScrollTermId] = useState(null);
  const [hybridStackGuide, setHybridStackGuide] = useState(null);
  const [hybridStackGuideStatus, setHybridStackGuideStatus] = useState('idle');

  // API 키 설정 모달 관련 상태
  const [apiKey, setApiKey] = useState(getStoredApiKey);
  const [isSettingsOpen, setIsSettingsOpen] = useState(!getStoredApiKey());
  const [tempKey, setTempKey] = useState('');

  // DOM 참조(ref): 자동 높이 조절, 스크롤 이동, 용어 카드 포커스
  const textareaRef = useRef(null);
  const contentContainerRef = useRef(null);
  const glossaryCardRefs = useRef({});
  const promptPanelRef = useRef(null);
  const devSpecPanelRef = useRef(null);

  // -------------------------------------------------------
  // 파생 데이터(useMemo)
  // -------------------------------------------------------
  // 용어 목록 정규화(별칭 확장 + 검색 토큰 + 단계 정렬)
  const glossaryItems = useMemo(() => {
    const raw = result?.glossary || [];

    return raw
      .map((item, idx) => {
        const aliases = Array.from(new Set([item.term, ...(item.aliases || [])].map((v) => String(v || '').trim()).filter(Boolean)));
        return {
          ...item,
          id: makeTermId(item.term, idx),
          flow_stage: normalizeFlowStage(item.flow_stage),
          aliases,
          searchTerms: aliases.map((alias) => alias.toLowerCase()),
        };
      })
      .sort((a, b) => FLOW_STAGES.indexOf(a.flow_stage) - FLOW_STAGES.indexOf(b.flow_stage));
  }, [result]);

  // 본문 하이라이트용 매처: 긴 단어를 먼저 검색해 오탐을 줄입니다.
  const matchers = useMemo(() => {
    const list = [];
    glossaryItems.forEach((item) => {
      item.searchTerms.forEach((term) => list.push({ term, id: item.id }));
    });
    return list.sort((a, b) => b.term.length - a.term.length);
  }, [glossaryItems]);

  // 모델 결과에서 표준 출력(payload)만 분리합니다.
  const standardOutput = useMemo(() => getStandardOutput(result), [result]);

  // 레이어 탭 카드 데이터 조립:
  // L1~L5를 사람이 읽기 쉬운 문장 배열로 만들어 카드 UI에 전달합니다.
  const layerCards = useMemo(() => {
    if (!standardOutput) return [];

    const problem = standardOutput['문제정의_5칸'] || standardOutput.problem_frame || {};
    const interview = standardOutput['인터뷰_모드'] || standardOutput.interview_mode || {};
    const converter = standardOutput['수정요청_변환'] || standardOutput.request_converter || {};
    const completeness = standardOutput['완성도_진단'] || standardOutput.completeness || {};
    const impact = standardOutput['변경_영향도'] || standardOutput.impact_preview || {};
    const layerGuide = Array.isArray(standardOutput['레이어_가이드'])
      ? standardOutput['레이어_가이드']
      : (Array.isArray(standardOutput.layer_guide) ? standardOutput.layer_guide : []);

    const roles = Array.isArray(standardOutput['사용자_역할'])
      ? standardOutput['사용자_역할']
      : (Array.isArray(standardOutput.users_and_roles) ? standardOutput.users_and_roles : []);
    const must = (standardOutput['핵심_기능'] || {}).필수 || (standardOutput.core_features || {}).must || [];
    const flow = toStringArray(standardOutput['화면_흐름_5단계']);
    const next = toStringArray(standardOutput['오늘_할_일_3개']);
    const inputFields = Array.isArray(standardOutput['입력_데이터_필드'])
      ? standardOutput['입력_데이터_필드']
      : (Array.isArray(standardOutput.input_fields) ? standardOutput.input_fields : []);
    const permissionRules = Array.isArray(standardOutput['권한_규칙'])
      ? standardOutput['권한_규칙']
      : (Array.isArray(standardOutput.permission_matrix) ? standardOutput.permission_matrix : []);
    const interviewQuestions = toStringArray(interview['추가_질문_3개'] ?? interview.follow_up_questions ?? interview.questions);
    const completenessScore = Number.isFinite(Number(completeness['점수_0_100'] ?? completeness.score))
      ? Number(completeness['점수_0_100'] ?? completeness.score)
      : null;
    const warnings = toStringArray(completeness['누락_경고'] ?? completeness.warnings);

    const cards = [
      {
        id: 'L1',
        title: 'L1 문제정의 인터뷰',
        goal: '막연한 아이디어를 먼저 구조화합니다.',
        lines: [
          `누가: ${problem.누가 || problem.who || '-'}`,
          `언제: ${problem.언제 || problem.when || '-'}`,
          `무엇을: ${problem.무엇을 || problem.what || '-'}`,
          `왜: ${problem.왜 || problem.why || '-'}`,
          `성공기준: ${problem.성공기준 || problem.success_criteria || '-'}`,
          `필요 정보 질문 1: ${interviewQuestions[0] || '-'}`,
          `필요 정보 질문 2: ${interviewQuestions[1] || '-'}`,
          `필요 정보 질문 3: ${interviewQuestions[2] || '-'}`,
        ],
      },
      {
        id: 'L2',
        title: 'L2 스펙 구조화',
        goal: '역할/기능/흐름/데이터/권한으로 정리합니다.',
        lines: [
          `역할 수: ${roles.length}개`,
          `필수 기능 수: ${toStringArray(must).length}개`,
          `화면 흐름: ${flow.length}단계`,
          `입력 필드 수: ${inputFields.length}개`,
          `권한 규칙 수: ${permissionRules.length}개`,
        ],
      },
      {
        id: 'L3',
        title: 'L3 요청문 변환',
        goal: '개발자에게 전달할 문장으로 바꿉니다.',
        lines: [
          `짧은 요청: ${converter['짧은_요청'] || converter.short || '-'}`,
          `표준 요청: ${converter['표준_요청'] || converter.standard || '-'}`,
          `상세 요청: ${converter['상세_요청'] || converter.detailed || '-'}`,
        ],
      },
      {
        id: 'L4',
        title: 'L4 실행/검증',
        goal: '누락과 변경 파급을 먼저 확인합니다.',
        lines: [
          `완성도 점수: ${completenessScore ?? '-'} / 100`,
          `누락 경고: ${warnings.length}개`,
          `화면 영향: ${toStringArray(impact.화면 || impact.screens).length}개`,
          `권한 영향: ${toStringArray(impact.권한 || impact.permissions).length}개`,
          `테스트 영향: ${toStringArray(impact.테스트 || impact.tests).length}개`,
        ],
      },
      {
        id: 'L5',
        title: 'L5 학습/실행',
        goal: '오늘 실행 항목으로 마무리합니다.',
        lines: next.length ? next.map((item, idx) => `${idx + 1}. ${item}`) : ['오늘 할 일이 비어 있습니다.'],
      },
    ];

    return cards.map((card, idx) => {
      const guide = layerGuide[idx];
      if (!guide || typeof guide !== 'object') return card;
      return {
        ...card,
        title: guide.레이어 ? `${guide.레이어} ${card.title.replace(/^L\d\s*/, '')}` : card.title,
        goal: guide.목표 || guide.goal || card.goal,
      };
    });
  }, [standardOutput]);

  // 사고 탭/용어 탭용 마크다운 fallback 데이터
  const thinking = result?.layers?.L1_thinking;
  const thinkingMd = useMemo(() => buildThinkingMarkdown(thinking), [thinking]);
  const glossaryMd = useMemo(() => buildGlossaryMarkdown(result?.glossary), [result]);
  const masterPromptText = result?.artifacts?.master_prompt || '';
  const devSpecText = result?.artifacts?.dev_spec_md || '';
  const techGuide = useMemo(
    () => buildTechGuideData(vibe, standardOutput, hybridStackGuide),
    [hybridStackGuide, standardOutput, vibe],
  );
  const techRankingOrder = useMemo(
    () => (techGuide ? techGuide.ranking.map((item) => item.id) : []),
    [techGuide],
  );
  const recommendedGuidePromptText = useMemo(
    () => buildRecommendedGuidePrompt(masterPromptText, techGuide),
    [masterPromptText, techGuide],
  );
  const topGuideItems = useMemo(() => getTopGuideItems(activeTab, showThinking), [activeTab, showThinking]);
  const hybridStatusMeta = useMemo(
    () => getHybridStackStatusMeta(hybridStackGuideStatus),
    [hybridStackGuideStatus],
  );
  const isModelSelectorDisabled = !apiKey || status === 'processing' || isModelOptionsLoading || modelOptions.length === 0;

  // 현재 탭에 맞는 본문 마크다운 선택기
  const currentTabMarkdown = useMemo(() => {
    if (!result) return '';
    if (activeTab === 'nondev') return result.artifacts?.nondev_spec_md || '';
    if (activeTab === 'dev') return result.artifacts?.dev_spec_md || '';
    if (activeTab === 'thinking') return showThinking ? thinkingMd : '학습 모드가 OFF 상태입니다.';
    if (activeTab === TECH_GUIDE_TAB_ID) return '';
    if (activeTab === 'layers') return '';
    if (activeTab === 'glossary') return glossaryMd || '용어사전이 비어 있습니다.';
    if (activeTab === PROMPT_SPEC_TAB_ID) return '';
    return '';
  }, [activeTab, glossaryMd, result, showThinking, thinkingMd]);

  // 용어 "본문에서 위치 보기"에서 사용할 탭별 텍스트 맵
  const tabContentMap = useMemo(() => ({
    nondev: result?.artifacts?.nondev_spec_md || '',
    dev: result?.artifacts?.dev_spec_md || '',
    thinking: thinkingMd || '',
    layers: layerCards.map((card) => [card.title, card.goal, ...(card.lines || [])].join('\n')).join('\n'),
  }), [layerCards, result, thinkingMd]);

  const loadModelOptions = useCallback(async (nextApiKey) => {
    if (!nextApiKey) {
      setModelOptions([]);
      setSelectedModel('');
      setIsModelOptionsLoading(false);
      return;
    }

    setIsModelOptionsLoading(true);
    try {
      const fetchedModels = await fetchAvailableModels(nextApiKey);
      const uniqueModels = Array.from(new Set(
        (Array.isArray(fetchedModels) ? fetchedModels : [])
          .map((item) => String(item || '').trim())
          .filter(Boolean),
      ));

      setModelOptions(uniqueModels);
      setSelectedModel((prev) => {
        if (prev && uniqueModels.includes(prev)) return prev;
        return uniqueModels[0] || '';
      });
    } catch {
      setModelOptions([]);
      setSelectedModel('');
    } finally {
      setIsModelOptionsLoading(false);
    }
  }, []);

  // 텍스트 입력창 높이 자동 확장
  // 예시: 입력 줄이 늘어나면 textarea 높이도 함께 커집니다.
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  }, [vibe]);

  // 과거 버전에서 localStorage에 남은 키를 앱 시작 시 정리합니다.
  useEffect(() => {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  }, []);

  // API 키가 준비되면 사용 가능한 모델 후보군을 로드합니다.
  useEffect(() => {
    if (!apiKey) {
      setModelOptions([]);
      setSelectedModel('');
      setIsModelOptionsLoading(false);
      return;
    }
    void loadModelOptions(apiKey);
  }, [apiKey, loadModelOptions]);

  // 세션 키 TTL(30분) 만료를 타이머로 감시합니다.
  // 만료 시 키를 비우고 설정 모달을 다시 열어 재입력을 유도합니다.
  useEffect(() => {
    if (!apiKey) return;

    const savedAtMs = Number(sessionStorage.getItem(API_KEY_SAVED_AT_STORAGE_KEY));
    if (isApiKeyExpired(savedAtMs)) {
      clearStoredApiKey();
      setApiKey('');
      setActiveModel('OFFLINE');
      setIsSettingsOpen(true);
      return;
    }

    const remainingMs = API_KEY_TTL_MS - (Date.now() - savedAtMs);
    const timerId = window.setTimeout(() => {
      clearStoredApiKey();
      setApiKey('');
      setActiveModel('OFFLINE');
      setIsSettingsOpen(true);
    }, remainingMs);

    return () => window.clearTimeout(timerId);
  }, [apiKey]);

  // 용어 탭/레이어 탭이 아닐 때 마지막 본문 탭을 기억합니다.
  // 이유: 용어에서 "본문으로 돌아가기"할 때 직전 위치를 복원하기 위함입니다.
  useEffect(() => {
    if (isContentTab(activeTab)) setLastContentTab(activeTab);
  }, [activeTab]);

  // 학습 모드를 OFF로 전환했는데 사고 탭을 보고 있다면,
  // 즉시 비전공자 탭으로 이동시켜 "변화 없음"처럼 보이는 문제를 줄입니다.
  useEffect(() => {
    if (!showThinking && activeTab === 'thinking') {
      setActiveTab('nondev');
    }
  }, [activeTab, showThinking]);

  // 용어 탭으로 이동한 직후, 해당 용어 카드 위치로 자동 스크롤합니다.
  useEffect(() => {
    if (activeTab !== 'glossary' || !pendingGlossaryFocusTermId) return;
    const node = glossaryCardRefs.current[pendingGlossaryFocusTermId];
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setPendingGlossaryFocusTermId(null);
  }, [activeTab, pendingGlossaryFocusTermId]);

  // 본문 탭에서 특정 용어 하이라이트 위치로 스크롤합니다.
  // 잠깐 테두리/배경 강조를 주고 자동으로 제거합니다.
  useEffect(() => {
    if (activeTab === 'glossary' || !pendingContentScrollTermId) return;
    const node = contentContainerRef.current?.querySelector(`[data-term-id="${pendingContentScrollTermId}"]`);
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      node.classList.add('ring-2', 'ring-yellow-300', 'ring-offset-1', 'ring-offset-white');

      const block = node.closest('p, li, blockquote, td, th');
      block?.classList.add('bg-yellow-500/10', 'rounded', 'px-1');

      window.setTimeout(() => {
        node.classList.remove('ring-2', 'ring-yellow-300', 'ring-offset-1', 'ring-offset-white');
        block?.classList.remove('bg-yellow-500/10', 'rounded', 'px-1');
      }, FOCUS_HIGHLIGHT_MS);
    }
    setPendingContentScrollTermId(null);
  }, [activeTab, pendingContentScrollTermId, currentTabMarkdown]);

  // 프롬프트/개발 스펙 통합 화면에서 클릭한 섹션으로 시선을 맞춥니다.
  useEffect(() => {
    if (activeTab !== PROMPT_SPEC_TAB_ID) return;
    const node = promptSpecFocus === 'spec' ? devSpecPanelRef.current : promptPanelRef.current;
    node?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeTab, promptSpecFocus]);

  /**
   * 설정 모달의 키 저장 버튼 핸들러
   * - sessionStorage에만 저장
   * - 저장 시각도 함께 기록해 TTL(30분)을 적용
   */
  const handleSaveKey = () => {
    const key = tempKey.trim();
    if (!key) return;

    persistApiKeyToSession(key);

    setApiKey(key);
    setIsSettingsOpen(false);
    setTempKey('');
  };

  const requestHybridStackGuide = useCallback(async (nextResult, nextVibe) => {
    const standardPayload = getStandardOutput(nextResult);
    if (!apiKey || !standardPayload) {
      setHybridStackGuide(null);
      setHybridStackGuideStatus('error');
      return;
    }

    setHybridStackGuideStatus('loading');
    try {
      const guide = await recommendHybridStacks(nextVibe, standardPayload, apiKey, { modelName: selectedModel });
      setHybridStackGuide(guide);
      setHybridStackGuideStatus('success');
    } catch {
      setHybridStackGuide(null);
      setHybridStackGuideStatus('error');
    }
  }, [apiKey, selectedModel]);

  const handleRefreshHybridStacks = () => {
    if (!result) return;
    void requestHybridStackGuide(result, vibe);
  };

  /**
   * "사고 구조화 시작" 버튼 클릭 시 실행되는 메인 액션
   * 입력 검증 -> 모델 호출 -> 성공/실패 상태 업데이트 순서로 동작합니다.
   */
  const handleTransmute = async () => {
    if (!vibe.trim()) return;
    if (!apiKey) {
      setIsSettingsOpen(true);
      return;
    }

    // 실행 직전에 TTL 만료 여부를 다시 점검합니다.
    // (앱이 켜진 뒤 시간이 지난 경우를 대비)
    const savedAtMs = Number(sessionStorage.getItem(API_KEY_SAVED_AT_STORAGE_KEY));
    if (isApiKeyExpired(savedAtMs)) {
      clearStoredApiKey();
      setApiKey('');
      setActiveModel('OFFLINE');
      setIsSettingsOpen(true);
      return;
    }

    // 사용 중인 키는 만료 시각을 갱신해 세션 사용성을 유지합니다.
    persistApiKeyToSession(apiKey);

    setStatus('processing');
    setResult(null);
    setHybridStackGuide(null);
    setHybridStackGuideStatus('idle');

    try {
      const generated = await transmuteVibeToSpec(vibe, apiKey, { showThinking, modelName: selectedModel });
      setResult(generated);
      const usedModel = generated.model || selectedModel || activeModel;
      setActiveModel(String(usedModel || activeModel).toUpperCase());
      setSelectedModel((prev) => String(generated.model || prev || '').trim());
      setModelOptions((prev) => {
        const model = String(generated.model || '').trim();
        if (!model) return prev;
        return prev.includes(model) ? prev : [model, ...prev];
      });
      setActiveTab('nondev');
      setSelectedTermId(null);
      setCopied(false);
      setCopiedMaster(false);
      setCopiedGuidePrompt(false);
      setPromptSpecFocus('prompt');
      setStatus('success');
      void requestHybridStackGuide(generated, vibe);
    } catch {
      console.error('Transmutation failed: Neural link disruption detected.');
      setStatus('error');
      setActiveModel('LINK FAILURE');
      setHybridStackGuide(null);
      setHybridStackGuideStatus('error');
    }
  };

  /**
   * 공통 복사 함수
   * 예시: 개발자 스펙/마스터 프롬프트를 복사할 때 재사용합니다.
   */
  const copyToClipboardWithFeedback = (text, setFlag) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setFlag(true);
    setTimeout(() => setFlag(false), CLIPBOARD_RESET_MS);
  };

  const handleCopyDevSpec = () => {
    copyToClipboardWithFeedback(result?.artifacts?.dev_spec_md, setCopied);
  };

  const handleCopyMasterPrompt = () => {
    copyToClipboardWithFeedback(result?.artifacts?.master_prompt, setCopiedMaster);
  };

  const handleCopyGuidePrompt = () => {
    copyToClipboardWithFeedback(recommendedGuidePromptText, setCopiedGuidePrompt);
  };

  const handleOpenPromptSpec = (focus) => {
    setPromptSpecFocus(focus);
    setActiveTab(PROMPT_SPEC_TAB_ID);
  };

  /**
   * 용어 카드의 "수정 요청 만들기" 템플릿을 입력창에 삽입합니다.
   */
  const handleUseTemplate = (template) => {
    const text = String(template || '').trim();
    if (!text) return;

    setVibe((prev) => (prev.trim() ? `${prev.trim()}\n\n${text}` : text));
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  /**
   * 용어 카드 -> 본문 위치 이동
   * 현재 정책: 직전에 보던 본문 탭(nondev/dev/thinking)으로만 이동합니다.
   */
  const handleGlossaryCardClick = (termId) => {
    const termItem = glossaryItems.find((item) => item.id === termId);
    const terms = termItem?.searchTerms || [];
    const hasMatch = (tabId) => {
      const text = String(tabContentMap[tabId] || '').toLowerCase();
      return terms.some((term) => term && text.includes(term));
    };

    // 직전에 보던 본문 탭으로 되돌아갑니다.
    // 본문 탭이 아니었다면 기본값(비전공자 탭)으로 이동합니다.
    const preferredTab = isContentTab(lastContentTab) ? lastContentTab : 'nondev';

    setSelectedTermId(termId);
    setFocusedTermId(termId);
    setActiveTab(preferredTab);

    if (!hasMatch(preferredTab)) {
      setTermLocateMessage(`직전 탭(${preferredTab})에는 이 용어가 직접 포함되어 있지 않습니다.`);
      window.setTimeout(() => setTermLocateMessage(''), 2200);
      return;
    }

    setTermLocateMessage('');
    setPendingContentScrollTermId(termId);
    window.setTimeout(() => setFocusedTermId(null), FOCUS_HIGHLIGHT_MS);
  };

  /**
   * 본문에서 하이라이트된 용어를 클릭하면 용어 탭으로 이동합니다.
   */
  const handleTermClickFromContent = useCallback((termId) => {
    setSelectedTermId(termId);
    setActiveTab('glossary');
    setPendingGlossaryFocusTermId(termId);
  }, []);

  /**
   * 텍스트에서 가장 먼저 매칭되는 용어를 찾습니다.
   * 단어 경계 검사로 오탐(부분 문자열 매칭)을 줄입니다.
   */
  const findFirstMatch = useCallback((textLower, textOriginal, startIndex = 0) => {
    let best = null;

    for (const matcher of matchers) {
      let idx = textLower.indexOf(matcher.term, startIndex);
      while (idx !== -1) {
        const before = idx === 0 ? '' : textOriginal[idx - 1];
        const afterIdx = idx + matcher.term.length;
        const after = afterIdx >= textOriginal.length ? '' : textOriginal[afterIdx];

        const validBoundary = !isWordLike(before) && !isWordLike(after);
        if (validBoundary) {
          if (!best || idx < best.index || (idx === best.index && matcher.term.length > best.length)) {
            best = { index: idx, length: matcher.term.length, id: matcher.id };
          }
          break;
        }
        idx = textLower.indexOf(matcher.term, idx + 1);
      }
    }

    return best;
  }, [matchers]);

  /**
   * 일반 텍스트를 "클릭 가능한 용어 칩(button)"으로 바꿉니다.
   * 초보자 입장에서는 단어를 눌러 바로 사전으로 이동할 수 있습니다.
   */
  const highlightTextNode = useCallback((text, keyPrefix) => {
    if (!text || !matchers.length) return text;

    const original = String(text);
    const lower = original.toLowerCase();
    const parts = [];
    let cursor = 0;
    let chunkIndex = 0;

    while (cursor < original.length) {
      const matched = findFirstMatch(lower, original, cursor);
      if (!matched) {
        parts.push(original.slice(cursor));
        break;
      }

      if (matched.index > cursor) {
        parts.push(original.slice(cursor, matched.index));
      }

      const token = original.slice(matched.index, matched.index + matched.length);
      const active = selectedTermId === matched.id || focusedTermId === matched.id;
      parts.push(
        <button
          key={`${keyPrefix}-term-${chunkIndex}`}
          type="button"
          data-term-id={matched.id}
          onClick={() => handleTermClickFromContent(matched.id)}
          className={`inline-flex items-center align-middle rounded-md px-2 py-1 mx-0.5 border text-xs font-semibold transition-colors ${active
            ? 'bg-yellow-300 text-black border-yellow-200 shadow-[0_0_0_2px_rgba(250,204,21,0.25)]'
            : 'bg-blue-50 text-blue-600 border-blue-300/40 hover:bg-blue-100'
            }`}
        >
          {token}
        </button>,
      );

      cursor = matched.index + matched.length;
      chunkIndex += 1;
    }

    return parts;
  }, [findFirstMatch, focusedTermId, handleTermClickFromContent, matchers.length, selectedTermId]);

  /**
   * 마크다운 렌더링 트리를 재귀 순회하며 용어 하이라이트를 적용합니다.
   */
  const renderHighlightedChildren = useCallback(function renderNodeChildren(children, keyPrefix = 'node') {
    return React.Children.map(children, (child, idx) => {
      const key = `${keyPrefix}-${idx}`;

      if (typeof child === 'string') {
        return highlightTextNode(child, key);
      }

      if (!React.isValidElement(child) || !child.props?.children) {
        return child;
      }

      return React.cloneElement(child, {
        ...child.props,
        children: renderNodeChildren(child.props.children, key),
      });
    });
  }, [highlightTextNode]);

  /**
   * ReactMarkdown 컴포넌트 매핑
   * 각 태그(p, li, h1...)의 children에 하이라이트 로직을 주입합니다.
   */
  const markdownComponents = useMemo(() => {
    const wrap = (Tag) => ({ children, ...props }) => <Tag {...props}>{renderHighlightedChildren(children, Tag)}</Tag>;
    return {
      p: wrap('p'),
      li: wrap('li'),
      strong: wrap('strong'),
      em: wrap('em'),
      blockquote: wrap('blockquote'),
      h1: wrap('h1'),
      h2: wrap('h2'),
      h3: wrap('h3'),
      h4: wrap('h4'),
      h5: wrap('h5'),
      h6: wrap('h6'),
      td: wrap('td'),
      th: wrap('th'),
      code: wrap('code'),
    };
  }, [renderHighlightedChildren]);

  const learningModeSummary = showThinking
    ? '학습모드 ON: 사고 탭이 활성화되어 가정·질문·대안 비교를 함께 확인합니다.'
    : '학습모드 OFF: 사고 탭을 비활성화하고 비전공자/개발자 결과 위주로 빠르게 확인합니다.';

  // 비전공자/개발자 탭은 "일반 마크다운 렌더러"를 그대로 씁니다.
  // 사고/레이어/용어 탭은 각 탭 전용 UI를 사용하므로 별도 분기합니다.
  const shouldRenderGeneralMarkdown = activeTab === 'nondev' || activeTab === 'dev';

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-slate-100 flex flex-col items-center justify-start p-4 md:p-8 font-sans text-slate-800">
      {/* 상단 헤더: 앱 제목, 현재 모델, 학습모드 토글, 설정 버튼 */}
      <header className="w-full max-w-5xl mb-8 flex items-center justify-between border border-slate-200 rounded-xl px-4 py-4 md:px-6 bg-white/90 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Cpu className="w-6 h-6 text-blue-700" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-blue-700">사고 구조화 도우미</h1>
            <p className="text-xs md:text-sm text-slate-500">비전공자와 바이브코딩 초보자를 위한 요구사항 정리 도구</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 text-[11px] text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-md">
            <Terminal className="w-3 h-3" />
            <label htmlFor="model-selector" className="whitespace-nowrap">사용 모델:</label>
            <select
              id="model-selector"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={isModelSelectorDisabled}
              className="bg-white border border-blue-200 rounded px-2 py-1 text-[11px] text-blue-700 outline-none focus:border-blue-400 disabled:opacity-60 disabled:cursor-not-allowed"
              title="사용 가능한 모델 후보군에서 선택"
            >
              {isModelOptionsLoading && <option value="">모델 목록 로딩 중...</option>}
              {!isModelOptionsLoading && modelOptions.length === 0 && <option value="">{activeModel}</option>}
              {modelOptions.map((modelName) => (
                <option key={modelName} value={modelName}>
                  {modelName.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setShowThinking((v) => !v)}
            className={`px-4 py-2.5 text-sm border rounded-lg transition-colors ${showThinking
              ? 'border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100'
              : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
          >
            학습 모드: {showThinking ? 'ON (사고 포함)' : 'OFF (빠른 확인)'}
          </button>
          <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-blue-50 rounded-lg transition-colors text-blue-700">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 입력/실행/결과 본문 영역 */}
      <section className="w-full max-w-5xl space-y-8">
        <div className={`rounded-lg border px-4 py-3 text-sm ${showThinking ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-300 bg-slate-50 text-slate-700'}`}>
          <span className="font-semibold">학습모드 안내:</span> {learningModeSummary}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className={`rounded-lg border px-4 py-3 bg-white ${vibe.trim() ? 'border-blue-300' : 'border-slate-200'}`}>
            <p className="text-[11px] font-semibold text-blue-700">1단계</p>
            <p className="text-sm text-slate-700">문제 입력</p>
          </div>
          <div className={`rounded-lg border px-4 py-3 bg-white ${(status === 'processing' || status === 'success') ? 'border-blue-300' : 'border-slate-200'}`}>
            <p className="text-[11px] font-semibold text-blue-700">2단계</p>
            <p className="text-sm text-slate-700">구조화 생성</p>
          </div>
          <div className={`rounded-lg border px-4 py-3 bg-white ${status === 'success' ? 'border-blue-300' : 'border-slate-200'}`}>
            <p className="text-[11px] font-semibold text-blue-700">3단계</p>
            <p className="text-sm text-slate-700">탭별 확인/수정</p>
          </div>
        </div>

        {/* 입력 패널: 사용자가 요구사항(vibe)을 작성하는 곳 */}
        <div className="relative group">
          <div className="relative bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b border-slate-200 flex justify-between items-center text-[11px] text-blue-700 font-semibold">
              <span>요구사항 입력</span>
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500/50"></div>
                <div className="w-2 h-2 rounded-full bg-yellow-500/50"></div>
                <div className="w-2 h-2 rounded-full bg-green-500/50"></div>
              </div>
            </div>

            <div className="relative">
              <textarea
                ref={textareaRef}
                value={vibe}
                onChange={(e) => setVibe(e.target.value)}
                placeholder="만들고 싶은 기능/분위기/제약을 자유롭게 입력하세요."
                className="w-full bg-transparent p-6 outline-none resize-none min-h-[160px] text-slate-800 placeholder:text-slate-400 text-base md:text-lg leading-relaxed transition-all duration-300 focus:bg-blue-50/20"
                disabled={status === 'processing' || !apiKey}
              />

              {!apiKey && (
                <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex items-center justify-center p-6 text-center">
                  <div className="flex flex-col items-center gap-4 max-w-xs">
                    <ShieldAlert className="w-12 h-12 text-yellow-500 animate-pulse" />
                    <p className="text-blue-700 font-bold text-sm">API 키가 필요합니다</p>
                    <p className="text-slate-600 text-xs leading-relaxed">API 키를 설정하면 변환을 시작할 수 있습니다.</p>
                  </div>
                </div>
              )}

              <AnimatePresence>
                {status === 'processing' && (
                  <>
                    <Motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-blue-50/70 backdrop-blur-[1px] pointer-events-none flex items-center justify-center"
                    >
                      <div className="flex flex-col items-center gap-4">
                        <Motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                          <Zap className="w-8 h-8 text-blue-700" />
                        </Motion.div>
                        <span className="text-blue-700 text-xs tracking-[0.2em] font-bold animate-pulse">구조화 중...</span>
                      </div>
                    </Motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* 실행 버튼 영역 */}
        <div className="flex justify-center md:justify-end">
          <button
            onClick={handleTransmute}
            disabled={status === 'processing' || !vibe.trim() || !apiKey}
            className={`
              px-8 md:px-12 py-3.5 bg-blue-600 text-white font-bold rounded-lg border border-blue-700 transition-all duration-200
              disabled:opacity-30 disabled:cursor-not-allowed
              ${(vibe.trim() && apiKey) ? 'hover:bg-blue-700 hover:-translate-y-0.5 cursor-pointer' : ''}
            `}
          >
            {status === 'processing' ? '구조화 중...' : '사고 구조화 시작'}
          </button>
        </div>

        {/* 오류 메시지 패널 */}
        <AnimatePresence>
          {status === 'error' && (
            <Motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-rose-50 border border-rose-200 p-4 text-rose-700 rounded-lg flex items-center gap-3 text-sm">
              <ShieldAlert className="w-5 h-5" />
              <div className="flex flex-col">
                <span className="font-bold">생성 실패: 모델 응답 또는 JSON 파싱 오류</span>
                <span className="text-[11px] opacity-80">API 키, 쿼터, 입력 내용을 다시 확인해주세요.</span>
              </div>
            </Motion.div>
          )}
        </AnimatePresence>

        {/* 성공 결과 패널(탭 + 본문) */}
        <AnimatePresence>
          {status === 'success' && result && (
            <Motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="relative bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-start gap-2">
                {/* 탭 네비게이션 */}
                <div className="flex items-center gap-2 flex-wrap">
                  {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const selected = activeTab === tab.id;
                    const isThinkingDisabled = tab.id === 'thinking' && !showThinking;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          if (!isThinkingDisabled) setActiveTab(tab.id);
                        }}
                        disabled={isThinkingDisabled}
                        title={isThinkingDisabled ? '학습모드 OFF에서는 사고 탭이 비활성화됩니다.' : undefined}
                        className={`flex items-center gap-2 px-3 py-2 text-xs md:text-sm border rounded-lg transition-colors ${selected
                          ? 'text-blue-700 border-blue-300 bg-blue-50'
                          : 'text-slate-700 border-slate-300 hover:bg-slate-50'
                          } ${isThinkingDisabled ? 'opacity-45 cursor-not-allowed' : ''}`}
                      >
                        <Icon className="w-4 h-4" />
                        {tab.label}
                        {isThinkingDisabled && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 bg-slate-100 text-slate-600">OFF</span>
                        )}
                      </button>
                    );
                  })}
                  <span className="hidden md:inline-block w-px h-5 bg-slate-200 mx-1" aria-hidden="true" />
                  {QUICK_ACTION_BUTTONS.map((item) => {
                    const Icon = item.icon;
                    const selected = activeTab === PROMPT_SPEC_TAB_ID && promptSpecFocus === item.id;
                    const selectedClass = item.id === 'prompt'
                      ? 'text-amber-700 border-amber-300 bg-amber-50'
                      : 'text-blue-700 border-blue-300 bg-blue-50';

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleOpenPromptSpec(item.id)}
                        className={`flex items-center gap-2 px-3 py-2 text-xs md:text-sm border rounded-lg transition-colors ${selected
                          ? selectedClass
                          : 'text-slate-700 border-slate-300 hover:bg-slate-50'
                          }`}
                      >
                        <Icon className="w-4 h-4" />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div ref={contentContainerRef} className="p-6 md:p-8 prose prose-cyber max-w-none prose-p:text-slate-700 prose-headings:text-blue-700 prose-headings:tracking-tight prose-code:text-blue-700 prose-pre:bg-slate-50 prose-pre:border prose-pre:border-slate-200">
                {topGuideItems.length > 0 && (
                  <div className="not-prose mb-6 space-y-2">
                    {topGuideItems.map((item, idx) => (
                      <div key={`top-guide-${activeTab}-${idx}`} className={`px-3 py-2 rounded-md border text-[11px] ${GUIDE_TONE_CLASS_MAP[item.tone] || GUIDE_TONE_CLASS_MAP.slate}`}>
                        <span className="font-semibold">{item.title}:</span> {item.description}
                      </div>
                    ))}
                  </div>
                )}

                {/* 일반 탭(비전공자/개발자) 마크다운 렌더 */}
                {shouldRenderGeneralMarkdown && (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {currentTabMarkdown}
                  </ReactMarkdown>
                )}

                {/* 프롬프트/개발 스펙 통합 보기 */}
                {activeTab === PROMPT_SPEC_TAB_ID && (
                  <div className="not-prose space-y-4">
                    <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      <article
                        ref={promptPanelRef}
                        className={`border rounded-md p-4 bg-white ${promptSpecFocus === 'prompt' ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200'}`}
                      >
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <h3 className="text-amber-700 font-bold text-base">Antigravity용 프롬프트</h3>
                          <button
                            type="button"
                            onClick={handleCopyMasterPrompt}
                            className="flex items-center gap-2 text-xs md:text-sm px-3 py-1.5 rounded border border-amber-300 text-amber-700 hover:bg-amber-50"
                          >
                            {copiedMaster ? <><Check className="w-4 h-4" />복사됨</> : <><Copy className="w-4 h-4" />복사</>}
                          </button>
                        </div>
                        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 max-h-[420px] overflow-auto">
                          <pre className="m-0 whitespace-pre-wrap break-words text-xs md:text-sm leading-relaxed text-slate-800">{masterPromptText || '생성된 프롬프트가 없습니다. 먼저 사고 구조화를 실행해주세요.'}</pre>
                        </div>
                      </article>

                      <article
                        ref={devSpecPanelRef}
                        className={`border rounded-md p-4 bg-white ${promptSpecFocus === 'spec' ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'}`}
                      >
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <h3 className="text-blue-700 font-bold text-base">개발 전달용 스펙</h3>
                          <button
                            type="button"
                            onClick={handleCopyDevSpec}
                            className="flex items-center gap-2 text-xs md:text-sm px-3 py-1.5 rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
                          >
                            {copied ? <><Check className="w-4 h-4" />복사됨</> : <><Copy className="w-4 h-4" />복사</>}
                          </button>
                        </div>
                        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 max-h-[420px] overflow-auto">
                          <pre className="m-0 whitespace-pre-wrap break-words text-xs md:text-sm leading-relaxed text-slate-800">{devSpecText || '생성된 개발 스펙이 없습니다. 먼저 사고 구조화를 실행해주세요.'}</pre>
                        </div>
                      </article>
                    </section>
                  </div>
                )}

                {/* 기술 선택 탭 전용 비교/추천 UI */}
                {activeTab === TECH_GUIDE_TAB_ID && techGuide && (
                  <div className="not-prose space-y-6">
                    <section className="border border-blue-200 rounded-md p-4 bg-blue-50 space-y-2">
                      <p className="text-[11px] text-blue-700 font-semibold">이번 입력 기준 최종 추천</p>
                      <h3 className="text-blue-800 font-bold text-lg">{techGuide.oneLine}</h3>
                      <p className="text-sm text-blue-900">
                        {techGuide.recommendation?.topFitReasons?.length
                          ? `주요 적합 요인: ${techGuide.recommendation.topFitReasons.join(', ')}`
                          : '기본 가중치와 입력 조건을 기준으로 우선 추천안을 계산했습니다.'}
                      </p>
                      {techGuide.alternative && (
                        <p className="text-xs text-blue-700">
                          차선안: {techGuide.alternative.badge} {techGuide.alternative.title}
                        </p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        <span className={`inline-flex px-2 py-0.5 rounded border text-[11px] ${hybridStatusMeta.className}`}>
                          동적 스택 후보: {hybridStatusMeta.label}
                        </span>
                        <button
                          type="button"
                          onClick={handleRefreshHybridStacks}
                          disabled={hybridStackGuideStatus === 'loading'}
                          className="text-xs md:text-sm px-3 py-1.5 rounded border border-blue-300 text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          스택 후보 다시 추천
                        </button>
                      </div>
                    </section>

                    <section className="space-y-3">
                      <h3 className="text-blue-700 font-bold text-lg">입력 기반 판단 요소(5가지)</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                        {techGuide.profileRows.map((row) => (
                          <article key={`profile-${row.id}`} className="border border-slate-200 rounded-md p-3 bg-white space-y-2">
                            <p className="text-[11px] text-blue-700 font-semibold">{row.label}</p>
                            <p className="text-sm font-bold text-slate-800">{row.valueLabel}</p>
                            <p className="text-[11px] text-slate-600">{row.question}</p>
                            <p className="text-[11px] text-slate-500">{row.reason}</p>
                            <span className={`inline-flex px-2 py-0.5 rounded border text-[11px] ${getConfidenceBadgeClass(row.confidence)}`}>
                              확신도: {row.confidence}
                            </span>
                          </article>
                        ))}
                      </div>
                    </section>

                    <section className="space-y-3">
                      <h3 className="text-blue-700 font-bold text-lg">옵션 비교표</h3>
                      <div className="overflow-x-auto border border-slate-200 rounded-md">
                        <table className="w-full min-w-[840px] border-collapse text-sm">
                          <thead className="bg-blue-50 text-blue-800">
                            <tr>
                              <th className="px-3 py-2 text-left border-b border-slate-200">순위</th>
                              <th className="px-3 py-2 text-left border-b border-slate-200">옵션</th>
                              <th className="px-3 py-2 text-left border-b border-slate-200">난이도(1~5)</th>
                              <th className="px-3 py-2 text-left border-b border-slate-200">비용(1~5)</th>
                              <th className="px-3 py-2 text-left border-b border-slate-200">확장성(1~5)</th>
                              <th className="px-3 py-2 text-left border-b border-slate-200">총점</th>
                              <th className="px-3 py-2 text-left border-b border-slate-200">월 비용 범위</th>
                              <th className="px-3 py-2 text-left border-b border-slate-200">확장 가이드</th>
                            </tr>
                          </thead>
                          <tbody>
                            {techGuide.options.map((option) => {
                              const rank = techRankingOrder.indexOf(option.id) + 1;
                              const isRecommended = techGuide.recommendation?.id === option.id;
                              return (
                                <tr key={`tech-option-row-${option.id}`} className={isRecommended ? 'bg-emerald-50/70' : 'bg-white'}>
                                  <td className="px-3 py-2 border-b border-slate-100">{rank}위</td>
                                  <td className="px-3 py-2 border-b border-slate-100">
                                    <div className="font-semibold text-slate-800">{option.badge} {option.title}</div>
                                    <div className="text-xs text-slate-500">대표 스택: {option.primaryStack}</div>
                                    <div className="text-[11px] text-slate-400">{option.strategy}</div>
                                  </td>
                                  <td className="px-3 py-2 border-b border-slate-100">{option.adjustedScores.difficulty}</td>
                                  <td className="px-3 py-2 border-b border-slate-100">{option.adjustedScores.cost}</td>
                                  <td className="px-3 py-2 border-b border-slate-100">{option.adjustedScores.scalability}</td>
                                  <td className="px-3 py-2 border-b border-slate-100">
                                    <span className={`font-semibold ${isRecommended ? 'text-emerald-700' : 'text-slate-800'}`}>
                                      {option.totalScore}
                                    </span>
                                    <span className="ml-2 text-[11px] text-slate-500">(가중합 {option.weightedMetricScore} + 적합도 {option.fitBonus})</span>
                                  </td>
                                  <td className="px-3 py-2 border-b border-slate-100 text-slate-700">{option.costRange}</td>
                                  <td className="px-3 py-2 border-b border-slate-100 text-slate-700">{option.scaleGuide}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      {techGuide.options.map((option) => {
                        const isRecommended = techGuide.recommendation?.id === option.id;
                        return (
                          <article
                            key={`tech-option-card-${option.id}`}
                            className={`rounded-md border p-4 bg-white space-y-3 ${isRecommended ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-slate-200'}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <h4 className="text-blue-700 font-bold text-base">{option.badge} {option.title}</h4>
                              {isRecommended && <span className="text-[11px] px-2 py-0.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-700">추천</span>}
                            </div>
                            <p className="text-xs text-slate-600">{option.strategy}</p>
                            <p className="text-xs text-slate-700">{option.switchCondition}</p>

                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-emerald-700">동적 스택 후보</p>
                              <ul className="list-disc pl-5 text-xs text-slate-700 space-y-1">
                                {option.stackCandidates.map((item, idx) => (
                                  <li key={`${option.id}-stack-${idx}`}>
                                    <span className="font-semibold">{item.name}</span>
                                    {item.why ? `: ${item.why}` : ''}
                                  </li>
                                ))}
                              </ul>
                            </div>

                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-blue-700">적합 상황</p>
                              <ul className="list-disc pl-5 text-xs text-slate-700 space-y-1">
                                {option.suitedFor.map((item, idx) => (
                                  <li key={`${option.id}-fit-${idx}`}>{item}</li>
                                ))}
                              </ul>
                            </div>

                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-rose-700">주요 리스크</p>
                              <ul className="list-disc pl-5 text-xs text-slate-700 space-y-1">
                                {option.risks.map((item, idx) => (
                                  <li key={`${option.id}-risk-${idx}`}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          </article>
                        );
                      })}
                    </section>

                    <section className="border border-slate-200 rounded-md p-4 bg-white space-y-4">
                      <div className="space-y-2">
                        <h3 className="text-blue-700 font-bold text-lg">오늘 할 일 3개</h3>
                        <ol className="list-decimal pl-5 text-sm text-slate-800 space-y-1">
                          {techGuide.todayActions.map((item, idx) => (
                            <li key={`tech-guide-next-${idx}`}>{item}</li>
                          ))}
                        </ol>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={handleCopyGuidePrompt}
                          className="flex items-center gap-2 text-xs md:text-sm px-3 py-1.5 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        >
                          {copiedGuidePrompt ? <><Check className="w-4 h-4" />추천 반영 프롬프트 복사됨</> : <><Zap className="w-4 h-4" />추천 반영 Antigravity 프롬프트 복사</>}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenPromptSpec('prompt')}
                          className="flex items-center gap-2 text-xs md:text-sm px-3 py-1.5 rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
                        >
                          <Copy className="w-4 h-4" />
                          프롬프트/개발 스펙 화면 열기
                        </button>
                      </div>
                    </section>
                  </div>
                )}

                {/* 사고 탭 전용 구조화 UI */}
                {activeTab === 'thinking' && (
                  <>
                    {!showThinking && <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentTabMarkdown}</ReactMarkdown>}
                    {showThinking && thinking && (
                      <div className="not-prose space-y-6">
                        <section className="space-y-2">
                          <h3 className="text-blue-700 font-bold text-lg">문제 재진술</h3>
                          <p className="text-slate-800 leading-relaxed">{thinking.interpretation || '-'}</p>
                        </section>

                        <section className="space-y-2">
                          <h3 className="text-blue-700 font-bold text-lg">가정</h3>
                          <ul className="list-disc pl-5 text-slate-800 space-y-1">
                            {(thinking.assumptions || []).length === 0 && <li>-</li>}
                            {(thinking.assumptions || []).map((item, idx) => (
                              <li key={`assumption-${idx}`}>{item}</li>
                            ))}
                          </ul>
                        </section>

                        <section className="space-y-2">
                          <h3 className="text-blue-700 font-bold text-lg">불확실 / 질문</h3>
                          <ul className="list-disc pl-5 text-slate-800 space-y-1">
                            {(thinking.uncertainties || []).length === 0 && <li>-</li>}
                            {(thinking.uncertainties || []).map((item, idx) => (
                              <li key={`uncertainty-${idx}`}>{item}</li>
                            ))}
                          </ul>
                        </section>

                        <section className="space-y-4">
                          <h3 className="text-blue-700 font-bold text-lg">대안 비교</h3>
                          {(thinking.alternatives || []).length === 0 && <p className="text-slate-800">-</p>}
                          {(thinking.alternatives || []).map((alt, idx) => {
                            const decision = getDecisionBadge(alt.decision);
                            return (
                              <article key={`alternative-${idx}`} className="border border-slate-200 rounded-md p-4 bg-white space-y-4">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <h4 className="text-blue-600 font-bold text-base">
                                    대안 {idx + 1} ({alt.name || 'N/A'})
                                  </h4>
                                  <span className={`text-xs md:text-sm px-2.5 py-1 rounded border ${decision.className}`}>
                                    판단: {decision.label}
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="border border-emerald-200 rounded p-3 bg-emerald-50">
                                    <p className="text-emerald-700 font-bold mb-2">장점</p>
                                    <ul className="list-disc pl-5 text-slate-700 space-y-1">
                                      {(alt.pros || []).length === 0 && <li>-</li>}
                                      {(alt.pros || []).map((item, pIdx) => (
                                        <li key={`pros-${idx}-${pIdx}`}>{item}</li>
                                      ))}
                                    </ul>
                                  </div>

                                  <div className="border border-rose-200 rounded p-3 bg-rose-50">
                                    <p className="text-rose-700 font-bold mb-2">단점</p>
                                    <ul className="list-disc pl-5 text-slate-700 space-y-1">
                                      {(alt.cons || []).length === 0 && <li>-</li>}
                                      {(alt.cons || []).map((item, cIdx) => (
                                        <li key={`cons-${idx}-${cIdx}`}>{item}</li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>

                                {alt.reason && <p className="text-sm text-slate-800">이유: {alt.reason}</p>}
                              </article>
                            );
                          })}
                        </section>
                      </div>
                    )}
                  </>
                )}

                {/* 레이어 탭 전용 카드 UI */}
                {activeTab === 'layers' && (
                  <div className="not-prose space-y-6">
                    <section className="space-y-3 border border-slate-200 rounded-md p-4 bg-white">
                      <p className="text-blue-600 text-sm font-semibold">초보자 사고 구조화 레이어 맵</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
                        {layerCards.map((card, idx) => (
                          <React.Fragment key={`layer-flow-${card.id}`}>
                            <span className="px-2.5 py-1 rounded border border-blue-300 text-blue-700">{card.id}</span>
                            {idx < layerCards.length - 1 && <span className="text-slate-500">→</span>}
                          </React.Fragment>
                        ))}
                      </div>
                    </section>

                    {layerCards.length === 0 && (
                      <p className="text-slate-800">레이어 데이터가 비어 있습니다. 먼저 변환을 실행해주세요.</p>
                    )}

                    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {layerCards.map((card) => (
                        <article key={`layer-card-${card.id}`} className="border border-slate-200 rounded-md p-4 bg-white space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-blue-700 font-bold text-base">{card.title}</h3>
                            <span className="text-[11px] px-2 py-1 rounded border border-slate-200 text-blue-700">{card.id}</span>
                          </div>
                          <p className="text-slate-800 text-sm leading-relaxed">{card.goal}</p>
                          <ul className="list-disc pl-5 text-slate-800 text-sm space-y-1">
                            {(card.lines || []).map((line, idx) => (
                              <li key={`layer-line-${card.id}-${idx}`}>{line}</li>
                            ))}
                          </ul>
                        </article>
                      ))}
                    </section>
                  </div>
                )}

                {/* 용어 탭 전용 카드 UI */}
                {activeTab === 'glossary' && (
                  <div className="not-prose space-y-6">
                    <section className="space-y-3 border border-slate-200 rounded-md p-4 bg-white">
                      <p className="text-blue-600 text-sm font-semibold">이 시스템의 핵심 개념 흐름</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
                        {FLOW_STAGES.map((stage, idx) => (
                          <React.Fragment key={stage}>
                            <span className="px-2.5 py-1 rounded border border-slate-200 text-blue-700">{stage}</span>
                            {idx < FLOW_STAGES.length - 1 && <span className="text-slate-500">→</span>}
                          </React.Fragment>
                        ))}
                      </div>
                    </section>

                    <section className="flex items-center justify-between gap-3 flex-wrap">
                      <h3 className="text-blue-700 font-bold text-lg">용어 네비게이터</h3>
                      <div className="inline-flex border border-slate-200 rounded overflow-hidden text-xs md:text-sm">
                        <button
                          type="button"
                          onClick={() => setGlossaryLevel('beginner')}
                          className={`px-3 py-1.5 ${glossaryLevel === 'beginner' ? 'bg-blue-600 text-white' : 'text-blue-700 bg-white'}`}
                        >
                          초급
                        </button>
                        <button
                          type="button"
                          onClick={() => setGlossaryLevel('practical')}
                          className={`px-3 py-1.5 ${glossaryLevel === 'practical' ? 'bg-blue-600 text-white' : 'text-blue-700 bg-white'}`}
                        >
                          실무
                        </button>
                      </div>
                    </section>

                    {glossaryItems.length === 0 && <p className="text-slate-800">용어사전이 비어 있습니다.</p>}

                    <div className="space-y-4">
                      {glossaryItems.map((item, idx) => {
                        const active = selectedTermId === item.id;
                        return (
                          <article
                            key={item.id}
                            ref={(node) => {
                              glossaryCardRefs.current[item.id] = node;
                            }}
                            className={`rounded-md border p-4 space-y-3 ${active ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'}`}
                          >
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <h4 className="text-blue-600 font-bold text-base">
                                {idx + 1}. {item.term || '용어'}
                              </h4>
                              <span className="text-xs px-2.5 py-1 rounded border border-slate-200 text-blue-700">{item.flow_stage}</span>
                            </div>

                            <p className="text-slate-700 text-sm leading-relaxed">{item.simple || '-'}</p>
                            <p className="text-slate-600 text-sm">비유: {item.analogy || '-'}</p>
                            <p className="text-slate-600 text-sm">왜 중요한가: {item.why || '-'}</p>

                            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2">
                              <p className="text-amber-700 font-semibold text-sm">결정 포인트</p>
                              <p className="text-amber-800 text-sm">{item.decision_point || '-'}</p>
                            </div>

                            {glossaryLevel === 'beginner' && (
                              <div className="rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                                초급 가이드: {item.beginner_note || '-'}
                              </div>
                            )}

                            {glossaryLevel === 'practical' && (
                              <div className="space-y-2">
                                <div className="rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                                  실무 가이드: {item.practical_note || '-'}
                                </div>
                                <div className="rounded border border-orange-200 bg-orange-50 px-3 py-2">
                                  <p className="text-orange-700 font-semibold text-sm">실무에서 흔한 실수</p>
                                  <ul className="list-disc pl-5 text-orange-800 text-sm space-y-1">
                                    {(item.common_mistakes || []).length === 0 && <li>-</li>}
                                    {(item.common_mistakes || []).map((mistake, mIdx) => (
                                      <li key={`${item.id}-mistake-${mIdx}`}>{mistake}</li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            )}

                            <div className="flex flex-wrap gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => handleGlossaryCardClick(item.id)}
                                className="text-xs md:text-sm px-3 py-1.5 rounded border border-blue-300 text-blue-700 hover:bg-blue-100"
                              >
                                본문에서 위치 보기
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUseTemplate(item.request_template)}
                                className="text-xs md:text-sm px-3 py-1.5 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                              >
                                🔧 이 개념 기준으로 수정 요청 만들기
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    {termLocateMessage && (
                      <p className="text-xs md:text-sm text-amber-700 border border-amber-200 bg-amber-50 rounded px-3 py-2">
                        {termLocateMessage}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </Motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* 수강생용 GitHub 배너 */}
      <a
        href="https://github.com/dudcjfsp-cyber/Vibe-to-Spec-Transmuter.git"
        target="_blank"
        rel="noreferrer noopener"
        className="mt-10 w-full max-w-5xl rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 hover:from-blue-100 hover:to-indigo-100 transition-colors"
      >
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-blue-800">제작자 GitHub 저장소 바로가기</p>
          <p className="text-xs text-slate-600">코드 전체와 변경 이력을 확인하려면 저장소를 열어보세요.</p>
        </div>
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700">
          저장소 열기
          <ExternalLink className="w-4 h-4" />
        </div>
      </a>

      {/* 설정 모달: API 키 입력/저장 */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => apiKey && setIsSettingsOpen(false)} className="absolute inset-0 bg-slate-900/30 backdrop-blur-md" />
            <Motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md bg-white border border-blue-200 rounded-xl p-8 shadow-xl">
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                  <div className="flex items-center gap-2">
                    <Key className="w-5 h-5 text-blue-700" />
                    <h2 className="text-lg font-bold text-blue-700">API 키 설정</h2>
                  </div>
                  {apiKey && <button onClick={() => setIsSettingsOpen(false)} className="text-slate-500 hover:text-slate-900 transition-colors"><X className="w-5 h-5" /></button>}
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[11px] text-blue-700 font-bold opacity-80">Gemini API Key</label>
                    <input type="password" value={tempKey} onChange={(e) => setTempKey(e.target.value)} placeholder={apiKey ? '기존 키가 저장되어 있습니다...' : '발급받은 API 키를 입력하세요...'} className="w-full bg-slate-50 border border-slate-200 p-4 outline-none focus:border-blue-300 text-blue-700 transition-all font-sans" />
                    <p className="text-[10px] text-slate-500 leading-relaxed italic">* API 키는 sessionStorage에만 저장되며, 마지막 저장/사용 후 30분이 지나면 자동 만료됩니다.</p>
                  </div>

                  <button onClick={handleSaveKey} disabled={!tempKey.trim()} className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-all duration-200 border border-blue-700 disabled:opacity-30 disabled:cursor-not-allowed">저장하고 시작하기</button>
                </div>
              </div>
            </Motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 하단 푸터 */}
      <footer className="mt-16 w-full max-w-5xl border-t border-slate-200 pt-6 flex flex-col md:flex-row justify-between items-center text-[11px] text-slate-500 gap-4">
        <p>인텔 AI 앱 크리에이터 양성과정 · 사고 구조화 보조 도구</p>
        <div className="flex gap-6"><span>학습 중심 UI</span><span>비전공자 친화 설계</span></div>
      </footer>
    </main>
  );
}

export default App;


