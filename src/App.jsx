
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { Zap, Copy, Check, Terminal, Cpu, ShieldAlert, Settings, X, Key, Brain, BookOpen, Code, User, Layers3 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { transmuteVibeToSpec, fetchAvailableModels } from './lib/gemini';

// -------------------------------------------------------
// 전역 상수
// -------------------------------------------------------
// API 키를 브라우저 저장소에 넣을 때 사용할 키 이름입니다.
const API_KEY_STORAGE_KEY = 'gemini_api_key';
// "복사 완료" 표시가 유지되는 시간(ms)입니다.
const CLIPBOARD_RESET_MS = 2000;
// 용어 카드 정렬 순서(개념 흐름)입니다.
const FLOW_STAGES = ['Webhook', 'Parsing', 'Data Sync', 'Source of Truth'];
// 용어 클릭 후 본문 강조 효과가 유지되는 시간(ms)입니다.
const FOCUS_HIGHLIGHT_MS = 2200;

// 결과 패널 상단 탭 목록입니다.
const TABS = [
  { id: 'nondev', label: '비전공자', icon: User },
  { id: 'dev', label: '개발자', icon: Code },
  { id: 'thinking', label: '사고', icon: Brain },
  { id: 'layers', label: '레이어', icon: Layers3 },
  { id: 'glossary', label: '용어', icon: BookOpen },
];

/**
 * 저장된 API 키를 읽습니다.
 * 우선순위: sessionStorage -> localStorage
 * 예시: 탭 새로고침 후에도 임시 키를 복구할 수 있습니다.
 */
function getStoredApiKey() {
  return sessionStorage.getItem(API_KEY_STORAGE_KEY) || localStorage.getItem(API_KEY_STORAGE_KEY) || '';
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
    return { label: '추천', className: 'text-green-400 border-green-500/40 bg-green-500/10' };
  }
  if (normalized.includes('reject') || normalized.includes('배제')) {
    return { label: '배제', className: 'text-red-400 border-red-500/40 bg-red-500/10' };
  }
  return { label: '보류', className: 'text-orange-300 border-orange-500/40 bg-orange-500/10' };
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
  const [copied, setCopied] = useState(false);
  const [copiedMaster, setCopiedMaster] = useState(false);
  const [activeTab, setActiveTab] = useState('nondev');
  const [lastContentTab, setLastContentTab] = useState('nondev');
  const [showThinking, setShowThinking] = useState(true);
  const [glossaryLevel, setGlossaryLevel] = useState('beginner');
  const [selectedTermId, setSelectedTermId] = useState(null);
  const [focusedTermId, setFocusedTermId] = useState(null);
  const [termLocateMessage, setTermLocateMessage] = useState('');
  const [pendingGlossaryFocusTermId, setPendingGlossaryFocusTermId] = useState(null);
  const [pendingContentScrollTermId, setPendingContentScrollTermId] = useState(null);

  // API 키 설정 모달 관련 상태
  const [apiKey, setApiKey] = useState(getStoredApiKey);
  const [isSettingsOpen, setIsSettingsOpen] = useState(!getStoredApiKey());
  const [rememberThisDevice, setRememberThisDevice] = useState(Boolean(localStorage.getItem(API_KEY_STORAGE_KEY)));
  const [tempKey, setTempKey] = useState('');

  // DOM 참조(ref): 자동 높이 조절, 스크롤 이동, 용어 카드 포커스
  const textareaRef = useRef(null);
  const contentContainerRef = useRef(null);
  const glossaryCardRefs = useRef({});

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

  // 현재 탭에 맞는 본문 마크다운 선택기
  const currentTabMarkdown = useMemo(() => {
    if (!result) return '';
    if (activeTab === 'nondev') return result.artifacts?.nondev_spec_md || '';
    if (activeTab === 'dev') return result.artifacts?.dev_spec_md || '';
    if (activeTab === 'thinking') return showThinking ? thinkingMd : '학습 모드가 OFF 상태입니다.';
    if (activeTab === 'layers') return '';
    if (activeTab === 'glossary') return glossaryMd || '용어사전이 비어 있습니다.';
    return '';
  }, [activeTab, glossaryMd, result, showThinking, thinkingMd]);

  // 용어 "본문에서 위치 보기"에서 사용할 탭별 텍스트 맵
  const tabContentMap = useMemo(() => ({
    nondev: result?.artifacts?.nondev_spec_md || '',
    dev: result?.artifacts?.dev_spec_md || '',
    thinking: thinkingMd || '',
    layers: layerCards.map((card) => [card.title, card.goal, ...(card.lines || [])].join('\n')).join('\n'),
  }), [layerCards, result, thinkingMd]);

  // 텍스트 입력창 높이 자동 확장
  // 예시: 입력 줄이 늘어나면 textarea 높이도 함께 커집니다.
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  }, [vibe]);

  // API 키가 생기면:
  // 1) 사용 가능한 모델 목록 조회
  // 2) sessionStorage 동기화
  useEffect(() => {
    if (!apiKey) return;

    let cancelled = false;
    fetchAvailableModels(apiKey)
      .then((models) => {
        if (!cancelled && models && models.length > 0) {
          setActiveModel(models[0].toUpperCase());
        }
      })
      .catch(() => {
        if (!cancelled) setActiveModel('LINK FAILURE');
      });

    if (!sessionStorage.getItem(API_KEY_STORAGE_KEY)) {
      sessionStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    }

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  // 용어 탭/레이어 탭이 아닐 때 마지막 본문 탭을 기억합니다.
  // 이유: 용어에서 "본문으로 돌아가기"할 때 직전 위치를 복원하기 위함입니다.
  useEffect(() => {
    if (activeTab !== 'glossary' && activeTab !== 'layers') setLastContentTab(activeTab);
  }, [activeTab]);

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
      node.classList.add('ring-2', 'ring-yellow-300', 'ring-offset-1', 'ring-offset-black');

      const block = node.closest('p, li, blockquote, td, th');
      block?.classList.add('bg-yellow-500/10', 'rounded', 'px-1');

      window.setTimeout(() => {
        node.classList.remove('ring-2', 'ring-yellow-300', 'ring-offset-1', 'ring-offset-black');
        block?.classList.remove('bg-yellow-500/10', 'rounded', 'px-1');
      }, FOCUS_HIGHLIGHT_MS);
    }
    setPendingContentScrollTermId(null);
  }, [activeTab, pendingContentScrollTermId, currentTabMarkdown]);

  /**
   * 설정 모달의 키 저장 버튼 핸들러
   * - remember 체크 시 localStorage에도 저장
   * - 아니면 sessionStorage만 사용
   */
  const handleSaveKey = () => {
    const key = tempKey.trim();
    if (!key) return;

    sessionStorage.setItem(API_KEY_STORAGE_KEY, key);
    if (rememberThisDevice) {
      localStorage.setItem(API_KEY_STORAGE_KEY, key);
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }

    setApiKey(key);
    setIsSettingsOpen(false);
    setTempKey('');
  };

  /**
   * "Transmute Now" 버튼 클릭 시 실행되는 메인 액션
   * 입력 검증 -> 모델 호출 -> 성공/실패 상태 업데이트 순서로 동작합니다.
   */
  const handleTransmute = async () => {
    if (!vibe.trim()) return;
    if (!apiKey) {
      setIsSettingsOpen(true);
      return;
    }

    setStatus('processing');
    setResult(null);

    try {
      const generated = await transmuteVibeToSpec(vibe, apiKey, { showThinking });
      setResult(generated);
      setActiveModel((generated.model || activeModel).toUpperCase());
      setActiveTab('nondev');
      setSelectedTermId(null);
      setStatus('success');
    } catch {
      console.error('Transmutation failed: Neural link disruption detected.');
      setStatus('error');
      setActiveModel('LINK FAILURE');
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

    const preferredTab = ['nondev', 'dev', 'thinking'].includes(lastContentTab) ? lastContentTab : 'nondev';

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
            : 'bg-cyber-cyan/15 text-cyber-cyan-bright border-cyber-cyan/40 hover:bg-cyber-cyan/25'
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

  return (
    <main className="min-h-screen bg-cyber-black flex flex-col items-center justify-start p-4 md:p-8 font-mono text-gray-300">
      {/* 상단 헤더: 앱 제목, 현재 모델, 학습모드 토글, 설정 버튼 */}
      <header className="w-full max-w-4xl mb-12 flex items-center justify-between border-b border-cyber-cyan-dim pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyber-cyan-dim rounded-sm">
            <Cpu className="w-6 h-6 text-cyber-cyan shadow-[0_0_10px_rgba(0,240,255,0.5)]" />
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tighter text-cyber-cyan uppercase">Vibe-to-Spec Transmuter</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 text-[10px] text-cyber-cyan-bright opacity-50 border-r border-cyber-cyan-dim pr-4 mr-2">
            <Terminal className="w-3 h-3" />
            <span>NEURAL LINK: {activeModel}</span>
          </div>
          <button
            onClick={() => setShowThinking((v) => !v)}
            className={`px-4 py-2.5 text-sm uppercase border rounded-sm transition-colors ${showThinking
              ? 'border-cyber-cyan text-cyber-cyan hover:bg-cyber-cyan-dim'
              : 'border-gray-600 text-gray-400 hover:text-white'
              }`}
          >
            학습 모드: {showThinking ? 'ON' : 'OFF'}
          </button>
          <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-cyber-cyan-dim rounded-sm transition-colors text-cyber-cyan">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 입력/실행/결과 본문 영역 */}
      <section className="w-full max-w-4xl space-y-8">
        {/* 입력 패널: 사용자가 요구사항(vibe)을 작성하는 곳 */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-cyber-cyan opacity-20 group-focus-within:opacity-40 transition-opacity rounded-sm blur-sm"></div>
          <div className="relative bg-[#0a0a0a] border border-cyber-cyan-dim rounded-sm overflow-hidden">
            <div className="px-4 py-2 border-b border-cyber-cyan-dim flex justify-between items-center text-[10px] uppercase text-cyber-cyan-bright">
              <span>Input_Vibe.stream</span>
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
                className="w-full bg-transparent p-6 outline-none resize-none min-h-[160px] text-cyber-cyan placeholder:text-cyber-cyan/30 text-lg leading-relaxed transition-all duration-300 focus:shadow-[inset_0_0_20px_rgba(0,240,255,0.05)]"
                disabled={status === 'processing' || !apiKey}
              />

              {!apiKey && (
                <div className="absolute inset-0 bg-cyber-black/80 backdrop-blur-sm flex items-center justify-center p-6 text-center">
                  <div className="flex flex-col items-center gap-4 max-w-xs">
                    <ShieldAlert className="w-12 h-12 text-yellow-500 animate-pulse" />
                    <p className="text-cyber-cyan font-bold uppercase tracking-widest text-sm">Neural Link Offline</p>
                    <p className="text-gray-400 text-xs leading-relaxed">API 키를 설정하면 변환을 시작할 수 있습니다.</p>
                  </div>
                </div>
              )}

              <AnimatePresence>
                {status === 'processing' && (
                  <>
                    <Motion.div initial={{ top: 0 }} animate={{ top: '100%' }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} className="scan-line" />
                    <Motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-cyber-cyan/5 backdrop-blur-[1px] pointer-events-none flex items-center justify-center"
                    >
                      <div className="flex flex-col items-center gap-4">
                        <Motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                          <Zap className="w-8 h-8 text-cyber-cyan" />
                        </Motion.div>
                        <span className="text-cyber-cyan text-xs tracking-[0.2em] font-bold animate-pulse">PROCESSING VIBE...</span>
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
              relative px-12 py-4 bg-cyber-cyan text-cyber-black font-extrabold uppercase tracking-[0.15em] transition-all duration-200
              disabled:opacity-30 disabled:cursor-not-allowed glitch-hover
              ${(vibe.trim() && apiKey) ? 'hover:shadow-[0_0_25px_rgba(0,240,255,0.6)] cursor-pointer' : ''}
            `}
          >
            {status === 'processing' ? 'Transmuting...' : 'Transmute Now'}
            <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-white"></div>
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-white"></div>
          </button>
        </div>

        {/* 오류 메시지 패널 */}
        <AnimatePresence>
          {status === 'error' && (
            <Motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-red-500/10 border border-red-500/50 p-4 text-red-500 flex items-center gap-3 text-sm">
              <ShieldAlert className="w-5 h-5" />
              <div className="flex flex-col">
                <span className="font-bold">생성 실패: 모델 응답 또는 JSON 파싱 오류</span>
                <span className="text-[10px] opacity-70 italic">API 키/쿼터/입력 내용을 확인해주세요.</span>
              </div>
            </Motion.div>
          )}
        </AnimatePresence>

        {/* 성공 결과 패널(탭 + 본문) */}
        <AnimatePresence>
          {status === 'success' && result && (
            <Motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="relative bg-[#0f0f0f] border border-cyber-cyan-dim rounded-sm">
              <div className="px-4 py-3 border-b border-cyber-cyan-dim flex justify-between items-center gap-4 flex-wrap">
                {/* 탭 네비게이션 */}
                <div className="flex items-center gap-2">
                  {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const selected = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-3 py-2 text-xs md:text-sm uppercase border rounded-sm transition-colors ${selected
                          ? 'text-cyber-cyan border-cyber-cyan bg-cyber-cyan-dim/20'
                          : 'text-gray-400 border-gray-700 hover:text-white'
                          }`}
                      >
                        <Icon className="w-4 h-4" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* 결과 복사 버튼 */}
                <div className="flex gap-4">
                  <button onClick={handleCopyMasterPrompt} className="flex items-center gap-2 text-xs md:text-sm uppercase text-yellow-500 hover:text-white transition-colors">
                    {copiedMaster ? <><Check className="w-4 h-4" />PROMPT COPIED</> : <><Zap className="w-4 h-4" />COPY MASTER PROMPT</>}
                  </button>
                  <button onClick={handleCopyDevSpec} className="flex items-center gap-2 text-xs md:text-sm uppercase text-cyber-cyan-bright hover:text-white transition-colors">
                    {copied ? <><Check className="w-4 h-4" />DEV SPEC COPIED</> : <><Copy className="w-4 h-4" />COPY DEV SPEC</>}
                  </button>
                </div>
              </div>

              <div ref={contentContainerRef} className="p-6 md:p-8 prose prose-invert prose-cyber max-w-none prose-p:text-gray-400 prose-headings:text-cyber-cyan prose-headings:tracking-tighter prose-code:text-cyber-cyan-bright prose-pre:bg-cyber-black/50 prose-pre:border prose-pre:border-cyber-cyan-dim">
                {/* 일반 탭(비전공자/개발자) 마크다운 렌더 */}
                {activeTab !== 'thinking' && activeTab !== 'glossary' && activeTab !== 'layers' && (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {currentTabMarkdown}
                  </ReactMarkdown>
                )}

                {/* 사고 탭 전용 구조화 UI */}
                {activeTab === 'thinking' && (
                  <>
                    {!showThinking && <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentTabMarkdown}</ReactMarkdown>}
                    {showThinking && thinking && (
                      <div className="not-prose space-y-6">
                        <section className="space-y-2">
                          <h3 className="text-cyber-cyan font-bold text-lg">문제 재진술</h3>
                          <p className="text-gray-300 leading-relaxed">{thinking.interpretation || '-'}</p>
                        </section>

                        <section className="space-y-2">
                          <h3 className="text-cyber-cyan font-bold text-lg">가정</h3>
                          <ul className="list-disc pl-5 text-gray-300 space-y-1">
                            {(thinking.assumptions || []).length === 0 && <li>-</li>}
                            {(thinking.assumptions || []).map((item, idx) => (
                              <li key={`assumption-${idx}`}>{item}</li>
                            ))}
                          </ul>
                        </section>

                        <section className="space-y-2">
                          <h3 className="text-cyber-cyan font-bold text-lg">불확실 / 질문</h3>
                          <ul className="list-disc pl-5 text-gray-300 space-y-1">
                            {(thinking.uncertainties || []).length === 0 && <li>-</li>}
                            {(thinking.uncertainties || []).map((item, idx) => (
                              <li key={`uncertainty-${idx}`}>{item}</li>
                            ))}
                          </ul>
                        </section>

                        <section className="space-y-4">
                          <h3 className="text-cyber-cyan font-bold text-lg">대안 비교</h3>
                          {(thinking.alternatives || []).length === 0 && <p className="text-gray-300">-</p>}
                          {(thinking.alternatives || []).map((alt, idx) => {
                            const decision = getDecisionBadge(alt.decision);
                            return (
                              <article key={`alternative-${idx}`} className="border border-cyber-cyan-dim rounded-md p-4 bg-cyber-black/40 space-y-4">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <h4 className="text-cyber-cyan-bright font-bold text-base">
                                    대안 {idx + 1} ({alt.name || 'N/A'})
                                  </h4>
                                  <span className={`text-xs md:text-sm px-2.5 py-1 rounded border ${decision.className}`}>
                                    판단: {decision.label}
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="border border-green-500/30 rounded p-3 bg-green-500/5">
                                    <p className="text-green-300 font-bold mb-2">장점</p>
                                    <ul className="list-disc pl-5 text-gray-200 space-y-1">
                                      {(alt.pros || []).length === 0 && <li>-</li>}
                                      {(alt.pros || []).map((item, pIdx) => (
                                        <li key={`pros-${idx}-${pIdx}`}>{item}</li>
                                      ))}
                                    </ul>
                                  </div>

                                  <div className="border border-red-500/30 rounded p-3 bg-red-500/5">
                                    <p className="text-red-300 font-bold mb-2">단점</p>
                                    <ul className="list-disc pl-5 text-gray-200 space-y-1">
                                      {(alt.cons || []).length === 0 && <li>-</li>}
                                      {(alt.cons || []).map((item, cIdx) => (
                                        <li key={`cons-${idx}-${cIdx}`}>{item}</li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>

                                {alt.reason && <p className="text-sm text-gray-300">이유: {alt.reason}</p>}
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
                    <section className="space-y-3 border border-cyber-cyan-dim rounded-md p-4 bg-cyber-black/40">
                      <p className="text-cyber-cyan-bright text-sm font-semibold">초보자 사고 구조화 레이어 맵</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
                        {layerCards.map((card, idx) => (
                          <React.Fragment key={`layer-flow-${card.id}`}>
                            <span className="px-2.5 py-1 rounded border border-cyber-cyan text-cyber-cyan">{card.id}</span>
                            {idx < layerCards.length - 1 && <span className="text-gray-500">→</span>}
                          </React.Fragment>
                        ))}
                      </div>
                    </section>

                    {layerCards.length === 0 && (
                      <p className="text-gray-300">레이어 데이터가 비어 있습니다. 먼저 변환을 실행해주세요.</p>
                    )}

                    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {layerCards.map((card) => (
                        <article key={`layer-card-${card.id}`} className="border border-cyber-cyan-dim rounded-md p-4 bg-cyber-black/40 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-cyber-cyan font-bold text-base">{card.title}</h3>
                            <span className="text-[11px] px-2 py-1 rounded border border-cyber-cyan-dim text-cyber-cyan">{card.id}</span>
                          </div>
                          <p className="text-gray-300 text-sm leading-relaxed">{card.goal}</p>
                          <ul className="list-disc pl-5 text-gray-300 text-sm space-y-1">
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
                    <section className="space-y-3 border border-cyber-cyan-dim rounded-md p-4 bg-cyber-black/40">
                      <p className="text-cyber-cyan-bright text-sm font-semibold">이 시스템의 핵심 개념 흐름</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
                        {FLOW_STAGES.map((stage, idx) => (
                          <React.Fragment key={stage}>
                            <span className="px-2.5 py-1 rounded border border-cyber-cyan-dim text-cyber-cyan">{stage}</span>
                            {idx < FLOW_STAGES.length - 1 && <span className="text-gray-500">→</span>}
                          </React.Fragment>
                        ))}
                      </div>
                    </section>

                    <section className="flex items-center justify-between gap-3 flex-wrap">
                      <h3 className="text-cyber-cyan font-bold text-lg">용어 네비게이터</h3>
                      <div className="inline-flex border border-cyber-cyan-dim rounded overflow-hidden text-xs md:text-sm">
                        <button
                          type="button"
                          onClick={() => setGlossaryLevel('beginner')}
                          className={`px-3 py-1.5 ${glossaryLevel === 'beginner' ? 'bg-cyber-cyan text-black' : 'text-cyber-cyan'}`}
                        >
                          초급
                        </button>
                        <button
                          type="button"
                          onClick={() => setGlossaryLevel('practical')}
                          className={`px-3 py-1.5 ${glossaryLevel === 'practical' ? 'bg-cyber-cyan text-black' : 'text-cyber-cyan'}`}
                        >
                          실무
                        </button>
                      </div>
                    </section>

                    {glossaryItems.length === 0 && <p className="text-gray-300">용어사전이 비어 있습니다.</p>}

                    <div className="space-y-4">
                      {glossaryItems.map((item, idx) => {
                        const active = selectedTermId === item.id;
                        return (
                          <article
                            key={item.id}
                            ref={(node) => {
                              glossaryCardRefs.current[item.id] = node;
                            }}
                            className={`rounded-md border p-4 space-y-3 ${active ? 'border-cyber-cyan bg-cyber-cyan/10' : 'border-cyber-cyan-dim bg-cyber-black/40'}`}
                          >
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <h4 className="text-cyber-cyan-bright font-bold text-base">
                                {idx + 1}. {item.term || '용어'}
                              </h4>
                              <span className="text-xs px-2.5 py-1 rounded border border-cyber-cyan-dim text-cyber-cyan">{item.flow_stage}</span>
                            </div>

                            <p className="text-gray-200 text-sm leading-relaxed">{item.simple || '-'}</p>
                            <p className="text-gray-400 text-sm">비유: {item.analogy || '-'}</p>
                            <p className="text-gray-400 text-sm">왜 중요한가: {item.why || '-'}</p>

                            <div className="rounded border border-yellow-500/40 bg-yellow-500/10 px-3 py-2">
                              <p className="text-yellow-300 font-semibold text-sm">결정 포인트</p>
                              <p className="text-yellow-100/90 text-sm">{item.decision_point || '-'}</p>
                            </div>

                            {glossaryLevel === 'beginner' && (
                              <div className="rounded border border-cyber-cyan-dim bg-cyber-black/40 px-3 py-2 text-sm text-gray-300">
                                초급 가이드: {item.beginner_note || '-'}
                              </div>
                            )}

                            {glossaryLevel === 'practical' && (
                              <div className="space-y-2">
                                <div className="rounded border border-cyber-cyan-dim bg-cyber-black/40 px-3 py-2 text-sm text-gray-300">
                                  실무 가이드: {item.practical_note || '-'}
                                </div>
                                <div className="rounded border border-orange-500/40 bg-orange-500/10 px-3 py-2">
                                  <p className="text-orange-300 font-semibold text-sm">실무에서 흔한 실수</p>
                                  <ul className="list-disc pl-5 text-orange-100/90 text-sm space-y-1">
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
                                className="text-xs md:text-sm px-3 py-1.5 rounded border border-cyber-cyan text-cyber-cyan hover:bg-cyber-cyan/20"
                              >
                                본문에서 위치 보기
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUseTemplate(item.request_template)}
                                className="text-xs md:text-sm px-3 py-1.5 rounded border border-green-500/40 text-green-300 hover:bg-green-500/10"
                              >
                                🔧 이 개념 기준으로 수정 요청 만들기
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    {termLocateMessage && (
                      <p className="text-xs md:text-sm text-yellow-300 border border-yellow-500/40 bg-yellow-500/10 rounded px-3 py-2">
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

      {/* 설정 모달: API 키 입력/저장 */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
            <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => apiKey && setIsSettingsOpen(false)} className="absolute inset-0 bg-cyber-black/90 backdrop-blur-md" />
            <Motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md bg-[#0a0a0a] border border-cyber-cyan rounded-sm p-8 shadow-[0_0_50px_rgba(0,240,255,0.1)]">
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between border-b border-cyber-cyan-dim pb-4">
                  <div className="flex items-center gap-2">
                    <Key className="w-5 h-5 text-cyber-cyan" />
                    <h2 className="text-lg font-bold text-cyber-cyan tracking-widest uppercase">Neural Settings</h2>
                  </div>
                  {apiKey && <button onClick={() => setIsSettingsOpen(false)} className="text-gray-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>}
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-cyber-cyan uppercase font-bold tracking-widest opacity-70">Gemini API Key</label>
                    <input type="password" value={tempKey} onChange={(e) => setTempKey(e.target.value)} placeholder={apiKey ? '기존 키가 저장되어 있습니다...' : '발급받은 API 키를 입력하세요...'} className="w-full bg-cyber-black/50 border border-cyber-cyan-dim p-4 outline-none focus:border-cyber-cyan text-cyber-cyan transition-all font-mono" />
                    <p className="text-[10px] text-gray-500 leading-relaxed italic">* 기본 저장은 세션(sessionStorage)입니다. 탭을 닫으면 키가 사라집니다.</p>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    <input
                      type="checkbox"
                      checked={rememberThisDevice}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setRememberThisDevice(next);
                        if (!next) {
                          localStorage.removeItem(API_KEY_STORAGE_KEY);
                        } else if (apiKey) {
                          localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
                        }
                      }}
                      className="accent-cyan-400"
                    />
                    이 기기에서 기억하기 (localStorage)
                  </label>

                  <button onClick={handleSaveKey} disabled={!tempKey.trim()} className="w-full py-4 bg-cyber-cyan-dim hover:bg-cyber-cyan text-cyber-cyan hover:text-cyber-black font-bold uppercase tracking-widest transition-all duration-300 border border-cyber-cyan disabled:opacity-30 disabled:cursor-not-allowed">Save & Synchronize</button>
                </div>
              </div>
            </Motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 하단 푸터 */}
      <footer className="mt-20 w-full max-w-4xl border-t border-cyber-cyan-dim/20 pt-8 flex flex-col md:flex-row justify-between items-center text-[10px] text-cyber-cyan/30 gap-4">
        <p>ⓒ 2026 ANTIGRAVITY SYSTEMS. ALL RIGHTS RESERVED.</p>
        <div className="flex gap-6"><span>ENCRYPTION: AES-256</span><span>PROTOCOL: GEMINI-CLIENT-DIRECT</span></div>
      </footer>
    </main>
  );
}

export default App;

