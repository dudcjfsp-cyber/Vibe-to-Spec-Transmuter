import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * vite.config.js (빌드/개발 서버 설정)
 * - base: GitHub Pages 배포 시 리포지토리 하위 경로를 맞춰줍니다.
 * - plugins.react(): React 문법(JSX)을 브라우저가 이해할 코드로 변환합니다.
 * - plugins.tailwindcss(): Tailwind 클래스가 실제 CSS로 생성되도록 연결합니다.
 */
export default defineConfig({
  base: '/Vibe-to-Spec-Transmuter/',
  plugins: [
    react(),
    tailwindcss(),
  ],
})
