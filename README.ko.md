# Vibe-to-Spec Transmuter

[English](README.md) | [한국어](README.ko.md)

Vibe-to-Spec Transmuter는 비전공자와 바이브코딩 초보자가 모호한 아이디어를 구현 가능한 스펙으로 정리할 수 있도록 돕는 교육용 도구입니다.

이 프로젝트는 **인텔 AI 앱 크리에이터 양성과정**의 학습 보조 목적(MVP)으로 개발 중입니다.

## 이 도구가 하는 일

1. 사용자가 하고 싶은 기능을 자유롭게 입력합니다.
2. AI가 입력 내용을 표준 스키마로 구조화합니다.
3. 목적에 맞는 탭에서 결과를 확인합니다.
   - 비전공자
   - 개발자
   - 사고
   - 레이어
   - 용어

## 현재 UI/UX 기준 (현행 코드)

- 사이버펑크 스타일 대신 가독성 중심의 밝은 UI 적용
- 3단계 진행 흐름 표시
  - 문제 입력
  - 구조화 생성
  - 탭별 확인/수정
- 학습모드 동작이 명확하게 분리됨
  - `ON`: 사고 탭 활성화(가정/질문/대안 비교 포함)
  - `OFF`: 사고 탭 비활성화, 실무 확인 중심
- 복사 버튼 용도 명확화
  - `Antigravity용 프롬프트 복사`: Antigravity에 붙여 코드 생성 요청
  - `개발 전달용 스펙 복사`: 사람 개발자/팀과 요구사항 합의
- 하단에 제작자 GitHub 저장소 배너 링크 제공

## 출력 구조

모델 응답은 고정 스키마로 정규화되며 아래 결과가 함께 생성됩니다.

- `standard_output` (정규화 JSON)
- `artifacts.nondev_spec_md`
- `artifacts.dev_spec_md`
- `artifacts.master_prompt`
- `layers.L1_thinking`
- `glossary` (초급/실무 가이드 포함)

## 모델 선택 방식

실행 모델을 단일 값으로 고정해 두지 않고, 조회 + 우선순위 방식으로 선택합니다.

- 사용 가능한 Gemini 모델 목록 조회
- `generateContent` 가능한 모델만 필터링
- 우선순위 기반 선택 후 fallback
  - 우선순위: `gemini-1.5-flash` -> `gemini-1.5-pro` -> `gemini-1.0-pro` -> `gemini-pro`
  - 조회 실패 시 기본 목록으로 fallback

관련 코드: `src/lib/gemini.js`

## API 키 정책 (현재)

브라우저 노출 리스크를 줄이기 위해 정책을 아래처럼 변경했습니다.

- 저장 위치: **sessionStorage만 사용**
- TTL: **마지막 저장/사용 후 30분**
- 만료 시: 자동 삭제 + 재입력 유도
- 과거 버전 localStorage 키: 앱 시작 시 자동 정리
- localStorage 기억 옵션: 제거됨

관련 코드: `src/App.jsx`

## 보안 참고 (중요)

현재는 교육용 속도를 우선한 **클라이언트 직접 호출 구조**입니다.

즉:
- API 키를 브라우저 세션에서 다룹니다.
- DevTools(F12) 관점에서 완전 은닉은 불가능합니다.

운영 보안이 중요한 환경이라면 반드시 아래로 전환해야 합니다.
- 서버 프록시 구조
- 서버 환경변수 기반 API 키 보관
- 레이트리밋/인증/감사 로그

## 기술 스택

- React 19
- Vite 7
- Tailwind CSS 4
- Framer Motion
- `@google/generative-ai`
- React Markdown + `remark-gfm`

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

## 배포

GitHub Pages 자동 배포가 설정되어 있습니다.

- 워크플로우: `.github/workflows/deploy.yml`
- 트리거: `main` 브랜치 push
- 배포 경로: `dist`

## 프로젝트 구조

```text
src/
  App.jsx         # 메인 UI, 탭/상호작용, API 키 세션 정책
  lib/gemini.js   # 모델 호출, 스키마 정규화, 재시도 로직
  index.css       # 테마 및 마크다운/테이블 가독성 스타일
  main.jsx        # React 엔트리 포인트
```

## 상태

교육용 MVP로 계속 개선 중입니다.
