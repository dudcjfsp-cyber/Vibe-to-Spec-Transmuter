# HANDOFF (다음 세션 인수인계)

최종 업데이트 기준: 2026-02-25  
브랜치: `main`  
최근 푸시 커밋: `ad9a898` (`feat: add multi-provider API support and fix header layout`)

## 1) 이번 세션에서 완료된 내용

- AI 제공자를 `Gemini` 고정에서 `Gemini / OpenAI / Anthropic` 선택형으로 확장
- 제공자별 API 키를 세션에 분리 저장하도록 변경
- 모델 목록 조회를 제공자별 엔드포인트로 분기
- 구조화 생성/하이브리드 스택 추천 호출에 provider 인자 연결
- 헤더 UI 깨짐 수정: `학습 모드` 버튼을 하단 행으로 분리해 공간 확보
- 변경사항 커밋 후 원격 `origin/main`에 푸시 완료

## 2) 핵심 변경 파일

- `src/lib/gemini.js`
  - `SUPPORTED_MODEL_PROVIDERS` 추가
  - provider 정규화/표시명 유틸 추가
  - provider별 모델 조회/생성 호출 분기 로직 추가
  - `fetchAvailableModels`, `transmuteVibeToSpec`, `recommendHybridStacks`가 provider 옵션 수용
- `src/App.jsx`
  - provider 상태(`apiProvider`) 추가
  - provider별 API 키 저장 키 구조 추가
  - 헤더/설정 모달에 provider 드롭다운 추가
  - 기존 Gemini 고정 라벨을 동적 라벨(`{Provider} API Key`)로 변경
  - 학습 모드 버튼 하단 배치로 레이아웃 정리

## 3) 현재 동작 요약

- 상단/설정 모달에서 provider를 선택 가능
- provider 변경 시 해당 provider의 저장된 API 키를 불러옴
- 키가 없으면 설정 모달이 열리도록 동작
- 모델 드롭다운은 선택한 provider + API 키 기준으로 갱신
- 생성/추천 요청 모두 선택 provider를 사용

## 4) 검증 결과

- `npm run lint` 통과
- `npm run build` 통과
- 개발 서버 확인 URL: `http://127.0.0.1:5173/Vibe-to-Spec-Transmuter/`

## 5) 다음 세션에서 바로 하면 좋은 작업

1. 실제 각 provider 키로 end-to-end 호출 검증
   - Gemini/OpenAI/Anthropic 각각 모델 조회 + 구조화 생성 + 스택 추천
2. 실패 케이스 UX 보강
   - 제공자별 인증 실패 메시지 명확화
   - 모델 목록 조회 실패 시 사용자 안내 개선
3. 문서 업데이트
   - `README.md`, `README.ko.md`에 멀티 provider 설정 절차 추가

## 6) 다음 세션 시작 프롬프트(복사용)

```text
HANDOFF.md 기준으로 이어서 진행해줘.
우선 Gemini/OpenAI/Anthropic 실제 키 기준으로 모델 조회/구조화 생성/스택 추천이 정상 동작하는지 검증하고,
실패 케이스 메시지 UX를 보강해줘.
기존 기능 회귀 없게 lint/build까지 확인해줘.
```

## 7) 아키텍처 이식 장치(제품화 대비) - 2026-02-25 추가

목표: 현재는 교육용(프론트 중심 + 사용자 BYOK) 관점을 유지하고,
제품화 시 별도 레포 클론에서 API 보안 부위만 얇은 백엔드 프록시로 교체 가능하도록 준비.

### 7-1. 지금 당장 넣을 3가지 장치

1. LLM 호출을 `LLMAdapter` 한 곳으로 집중
   - 앱 어디에서도 provider SDK/API 직접 호출 금지
   - UI는 `adapter` 인터페이스만 사용
   - 프론트 직접호출 -> 백엔드 프록시 전환 시 adapter 구현만 교체

2. 세션 상태를 `SpecState(JSON)` 하나로 고정
   - 고정 키: `answers`, `current_node_id`, `history`, `version`
   - 30분 TTL 정책은 유지하되 상태 구조는 고정
   - 질문 플로우 관련 상태는 단일 상태원천(SSOT)으로 통합

3. 질문팩(동적 질문 엔진) 데이터 분리
   - 하드코딩 트리 금지
   - 예: `question_pack_v2.json`
   - 이후 서버 배포형 질문팩 업데이트(원격 갱신) 가능

### 7-2. 현재 코드 기준 충돌 가능 지점 / 위험 / 완화책

1. `LLMAdapter` 경계가 아직 완전하지 않음 (높음)
   - 현 상태: UI가 `provider/apiKey/model`을 직접 인지하고 호출 흐름 제어
   - 위험: 프록시 전환 시 `App.jsx` 수정 범위가 넓어질 수 있음
   - 완화: App은 `llmAdapter.fetchModels / transmute / recommendStacks`만 호출

2. 모델 캐시 키가 provider 단위만 사용됨 (높음)
   - 현 상태: `availableModelsByProvider`만 사용
   - 위험: BYOK에서 키 교체 시 이전 키 기준 모델 목록이 섞일 수 있음
   - 완화: 캐시 키를 `provider + keyFingerprint` 또는 세션 스코프로 분리

3. `SpecState` 도입 시 이중 상태원천 위험 (중간)
   - 현 상태: 질문/추천 관련 상태가 `useState`로 다수 분산
   - 위험: `SpecState`와 개별 state 간 불일치/동기화 버그
   - 완화: 질문 흐름 상태는 `SpecState` 단일 객체로만 읽고 쓰기

4. 질문팩 데이터화 시 ID 결합 위험 (중간)
   - 현 상태: 일부 추론/점수 로직이 하드코딩 질문 ID에 결합
   - 위험: JSON에서 ID 변경 시 계산/렌더 로직 파손
   - 완화: 질문팩 스키마에 `id`를 계약으로 고정하고 로더에서 검증

5. 질문팩 런타임 로딩 실패 대비 필요 (중간)
   - 위험: 원격/파일 로딩 실패 시 질문 엔진 비정상
   - 완화: 스키마 검증 + 로컬 fallback pack + pack `version` 체크 필수

## 8) 단계 적용용 회귀 체크리스트 (먼저 수행)

사용 목적: 이식 장치(LLMAdapter/SpecState/질문팩 데이터화) 단계 적용 시
기능 회귀를 빠르게 판별하기 위한 고정 체크리스트.

### 8-1. 실행 원칙

- 각 단계 시작 전 1회(베이스라인), 단계 반영 후 1회(비교) 동일하게 수행
- 실패 항목이 있으면 다음 단계로 넘어가지 않음
- 결과 기록 형식: `PASS / FAIL / N/A + 한 줄 메모`

### 8-2. 자동 검사

1. `npm run lint` 통과
2. `npm run build` 통과

### 8-3. 수동 시나리오 (핵심 5개)

1. Provider 전환 동작
   - 상단/설정 모달에서 `Gemini -> OpenAI -> Anthropic` 순서로 전환 가능
   - 전환 시 해당 provider의 저장 키 로드/미존재 시 설정 모달 오픈 확인

2. 모델 목록 조회
   - 키 입력 후 모델 드롭다운이 로딩되고 목록이 갱신됨
   - provider 변경 직후 이전 provider 모델이 섞여 보이지 않음

3. 구조화 생성(Transmute)
   - 입력 텍스트로 생성 요청 성공
   - 결과에 `비전공자/개발자/기술 선택/사고/레이어/용어` 탭 정상 표시

4. 스택 추천(Hybrid)
   - 구조화 생성 직후 추천 자동 실행
   - 실패 시 앱이 멈추지 않고 재시도 가능한 상태 유지

5. API 키 TTL(30분) 만료 처리
   - 만료 시 키가 무효화되고 설정 모달 재오픈
   - 만료 상태에서 요청 시 재입력 유도(오동작 호출 없음)

### 8-4. 실패/예외 UX 점검

1. 인증 실패 메시지
   - provider별 인증 오류 시 사용자 안내 문구가 비어있지 않음
2. 모델 조회 실패 메시지
   - 모델 목록을 못 불러와도 앱이 동작 지속(기본 fallback 또는 안내 존재)
3. JSON 파싱 실패 복구
   - 1회 복구 재시도 후 실패 처리 시 전체 UI가 멈추지 않음

### 8-5. 기록 템플릿

```text
[검증 일시]
- Date: YYYY-MM-DD
- Commit: <sha>
- Stage: <예: 1-LLMAdapter 파사드 도입>

[자동 검사]
1) lint: PASS/FAIL - 메모
2) build: PASS/FAIL - 메모

[수동 시나리오]
1) Provider 전환: PASS/FAIL - 메모
2) 모델 목록 조회: PASS/FAIL - 메모
3) 구조화 생성: PASS/FAIL - 메모
4) 스택 추천: PASS/FAIL - 메모
5) TTL 만료 처리: PASS/FAIL - 메모

[실패/예외 UX]
1) 인증 실패 메시지: PASS/FAIL - 메모
2) 모델 조회 실패 메시지: PASS/FAIL - 메모
3) JSON 파싱 실패 복구: PASS/FAIL - 메모
```
