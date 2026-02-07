# Vibe-to-Spec Transmuter

[English](README.md) | [Korean](README.ko.md)

Vibe-to-Spec Transmuter는 추상적인 사용자 의도("vibe")를 구현 가능한 기술 명세로 변환하는 교육용 MVP입니다.

## 목표
- 비전공자가 개발 사고를 이해하도록 돕습니다.
- 개발자가 최소한의 추가 질문으로 구현할 수 있는 스펙을 제공합니다.
- 사용자가 피드백을 구체적인 수정 요청 문장으로 바꾸도록 지원합니다.

## 현재 기능
- Gemini 기반 스펙 생성 엔진
  - JSON 전용 출력 계약
  - JSON 파싱 실패 시 1회 자동 재시도
- 계층형 출력 포맷 (L1 / L2 / L3)
  - L1 Thinking: 해석, 가정, 불확실성, 대안
  - L2 Translation: 비전공자/개발자용 산출물
  - L3 Execution: 구현 옵션 및 마스터 프롬프트
- 학습 모드 토글 (ON/OFF)
- 탭 UI
  - 비전공자 / 개발자 / 사고 / 용어
- 용어 네비게이터 강화
  - 개념 흐름 맵: `Webhook -> Parsing -> Data Sync -> Source of Truth`
  - 난이도 토글: 초급 / 실무
  - 용어별 결정 포인트, 실무 실수, 수정 요청 템플릿
  - 용어↔본문 양방향 이동
  - 본문 내 용어 하이라이트/포커스
- 복사 기능
  - 개발자 스펙 복사
  - 마스터 프롬프트 복사

## API 키 저장 정책
- 기본: `sessionStorage`
- 옵션: "이 기기에서 기억하기" 체크 시 `localStorage` 사용
- 체크 해제 시 `localStorage` 키 즉시 제거

## 기술 스택
- React 19
- Vite 7
- Tailwind CSS 4
- Framer Motion
- `@google/generative-ai`
- React Markdown

## 로컬 실행
```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

접속:
- `http://127.0.0.1:5173`

## 린트
```bash
npm run lint
```

## 배포
GitHub Pages 자동 배포가 설정되어 있습니다.

- 워크플로우: `.github/workflows/deploy.yml`
- 트리거: `main` 브랜치 push
- 배포 경로: `dist` -> `gh-pages`

## 프로젝트 구조
```text
src/
  App.jsx           # UI, 상태, 탭, 용어 네비게이션
  lib/gemini.js     # 모델 호출, JSON 스키마 강제, 파싱/재시도
  index.css         # 테마 및 스타일
```

## 참고
- 현재 구조는 클라이언트에서 모델을 직접 호출하므로 MVP/교육용에 적합합니다.
- 운영 보안을 강화하려면 서버 프록시 구조로 전환이 필요합니다.
- 로컬 접속이 간헐적으로 끊기면 개발 서버 종료 또는 보안 프로그램의 로컬 포트 차단 가능성을 먼저 확인하세요.
