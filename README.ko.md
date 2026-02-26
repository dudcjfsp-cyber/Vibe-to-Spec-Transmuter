# Vibe-to-Spec Transmuter

[English](README.md) | [한국어](README.ko.md)

Vibe-to-Spec Transmuter는 초보자 중심의 교육용 요구사항 구조화 앱입니다.
막연한 아이디어를 구현 가능한 스펙으로 바꾸고, 고정된 L1-L5 레이어 흐름으로 기술 선택과 실행까지 이어지도록 설계되었습니다.

## 설계 의도

이 프로젝트는 [docs/beginner-layer-design.ko.md](docs/beginner-layer-design.ko.md)의 레이어 설계를 기준으로 동작합니다.

1. **L1 문제정의 인터뷰**: `누가/언제/무엇을/왜/성공기준` 구조화 + `추가 질문 3개` 생성
2. **L2 스펙 구조화**: 역할, 기능, 5단계 흐름, 입력 필드, 권한 규칙 정리
3. **L3 요청문 변환**: 짧은/표준/상세 개발 요청문 생성
4. **L4 실행 검증**: 완성도 점수, 누락 경고, 영향도 점검
5. **L5 학습/실행**: 오늘 할 일 3개 도출

핵심 목적은 비전공자/바이브코딩 초보자가 개발 착수 전에 모호성을 줄이도록 돕는 것입니다.

## 핵심 사용자 흐름

1. 사용자가 아이디어를 자연어로 입력
2. 선택한 provider(Gemini/OpenAI/Anthropic) 모델 호출
3. 응답을 고정 `standard_output` 구조로 정규화
4. 탭별로 결과 검토
   - 비전공자
   - 개발자
   - 기술 선택
   - 사고
   - 레이어
   - 용어
5. 프롬프트/개발 스펙을 복사해 전달

## 현재 기능

### 1) 멀티 provider LLM 지원

- 지원 provider: `gemini`, `openai`, `anthropic`
- provider별 모델 목록 조회/생성 호출 분기
- `provider + api key` 스코프 모델 캐시
- 앱 레이어 LLM 호출 단일 경계(`src/lib/llmAdapter.js`)

### 2) 스키마 정규화 안정성

- 고정 스키마 정규화로 UI 안전성 확보
- JSON 파싱 실패 시 1회 자동 복구 재시도
- `L1|L2|...`처럼 뭉친 레이어 가이드 응답도 분해 복구

### 3) 하이브리드 기술 선택 가이드

- 고정 프레임: Option A / B / C
- 입력 맥락 기반 동적 스택 후보 생성
- 앱 내부 점수식(결정론)으로 최종 추천 계산
  - 난이도 45
  - 비용 35
  - 확장성 20
- 프로필 추정(예산/기간/팀역량/사용자수/민감도) 포함

### 4) 초보자용 읽기 모드

- 학습 모드 토글
  - `ON`: 사고 탭(가정/질문/대안 비교) 활성화
  - `OFF`: 비전공자/개발자 결과 중심의 빠른 검토
- 용어 네비게이터: flow stage 기반 그룹 + 본문 위치 연동

### 5) 세션 안전 정책(BYOK)

- API 키는 `sessionStorage`에만 저장
- TTL 30분
- 만료 시 자동 무효화 + 재입력 유도
- 구버전 Gemini 키 정리(호환성)

### 6) 이식 대비 내부 경계

- LLM 경계: `llmAdapter` -> `llmCore`
- 고정 세션 스키마(마이그레이션 대비)
  - `answers`
  - `current_node_id`
  - `history`
  - `version`
- 질문팩 데이터 분리: `src/data/question_pack_v2.json`

## 출력 계약(요약)

핵심 정규화 결과는 `standard_output`(및 한글 별칭 키)로 제공되며 주요 블록은 다음과 같습니다.

- `문제정의_5칸`
- `인터뷰_모드.추가_질문_3개`
- `사용자_역할`
- `핵심_기능`
- `화면_흐름_5단계`
- `입력_데이터_필드`
- `권한_규칙`
- `예외_모호한_점`
- `리스크_함정_3개`
- `테스트_시나리오_3개`
- `오늘_할_일_3개`
- `완성도_진단`
- `수정요청_변환`
- `변경_영향도`
- `레이어_가이드`

추가 UI 산출물:

- `artifacts.nondev_spec_md`
- `artifacts.dev_spec_md`
- `artifacts.master_prompt`
- `layers.L1_thinking`
- `glossary`

## 보안 참고

현재 저장소는 교육용 클라이언트 직접 호출 구조입니다.

- LLM 요청은 브라우저 런타임에서 실행
- 사용자 API 키는 브라우저 세션 범위에서 처리

제품화 시 권장:

1. 얇은 백엔드 프록시 전환
2. provider 키 서버 보관
3. 인증/레이트리밋/감사로그 적용

## 기술 스택

- React 19
- Vite 7
- Tailwind CSS 4
- Framer Motion
- lucide-react
- react-markdown + remark-gfm

## 로컬 실행

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

접속:

- `http://127.0.0.1:5173`

## 스크립트

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

## 프로젝트 구조

```text
src/
  App.jsx                    # 메인 UI 및 상태 오케스트레이션
  data/question_pack_v2.json # 데이터 기반 질문팩
  lib/llmAdapter.js          # 앱 레이어 LLM 진입점
  lib/llmCore.js             # provider 호출 + 정규화 + 재시도
  lib/questionPack.js        # 질문팩 로더/검증/fallback
  lib/specState.js           # 고정 세션 스키마 유틸
  index.css                  # 테마/가독성 스타일
  main.jsx                   # React 엔트리
docs/
  beginner-layer-design.ko.md
```

## 상태

초보자 가독성, 이식 안정성, provider 견고성을 높이는 방향으로 개선 중인 교육용 MVP입니다.
