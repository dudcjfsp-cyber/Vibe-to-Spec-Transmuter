# Vibe-to-Spec Transmuter

비전공자의 추상 아이디어(vibe)를 개발 가능한 스펙으로 변환하는 교육용 MVP입니다.

## 목적
- 비전공자가 개발 사고를 학습하도록 돕기
- 개발자가 빠르게 구현 판단 가능한 스펙 제공
- 수정 요청 문장을 구체적으로 말할 수 있게 지원

## 핵심 기능
- Gemini 기반 스펙 생성 엔진
  - JSON 출력 강제
  - 파싱 실패 시 1회 자동 재요청
- L1/L2/L3 구조 출력
  - L1 사고: 문제 재진술, 가정, 불확실 질문, 대안 비교
  - L2 번역: 비전공자/개발자 문서 분리
  - L3 실행: 구현 옵션 + 마스터 프롬프트
- 탭 UI
  - 비전공자 / 개발자 / 사고 / 용어
- 학습 모드 토글
- 복사 버튼
  - 개발자 스펙 복사
  - 마스터 프롬프트 복사

## API 키 저장 정책
- 기본: `sessionStorage`
- 옵션: "이 기기에서 기억하기" 체크 시 `localStorage` 저장
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
npm run dev
```

## 린트
```bash
npm run lint
```

## 배포
GitHub Pages 자동 배포를 사용합니다.

- 워크플로우: `.github/workflows/deploy.yml`
- 트리거: `main` 브랜치 push
- 빌드 결과: `dist` -> `gh-pages`

## 프로젝트 구조
```text
src/
  App.jsx           # UI/상태 관리, 탭 렌더링, API 키 설정
  lib/gemini.js     # 모델 호출, JSON 강제 출력, 파싱/재시도
  index.css         # 테마 및 컴포넌트 스타일
```

## 주의사항
- 현재는 클라이언트 직접 호출 구조이므로 테스트/교육용에 적합합니다.
- 상용 보안 요구가 높다면 서버 프록시 구조(서버 측 비밀키 관리)로 전환하세요.
