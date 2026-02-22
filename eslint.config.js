import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

/**
 * eslint.config.js (코드 문법 검사 설정)
 * - 목적: 실수(오타/사용하지 않는 변수 등)를 실행 전에 잡아냅니다.
 * - dist 제외: 빌드 결과물은 자동 생성 파일이라 검사 대상에서 제외합니다.
 */
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // 예시: const foo = 1; 만 쓰고 실제로 안 쓰면 경고/오류로 알려줍니다.
      // 다만 상수처럼 쓰는 대문자 변수(A, SOME_CONST)는 예외 처리합니다.
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
])
