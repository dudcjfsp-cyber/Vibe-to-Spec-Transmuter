// React의 안전 모드를 가져옵니다.
// - 개발 중 실수(예: 부작용 코드)를 빨리 찾게 도와줍니다.
import { StrictMode } from 'react';

// 브라우저의 실제 HTML 요소(#root)에 React 앱을 연결할 도구입니다.
import { createRoot } from 'react-dom/client';

// 전역 스타일(배경색, 글꼴, 마크다운 스타일 등)을 먼저 불러옵니다.
import './index.css';

// 화면의 메인 컴포넌트입니다. 실제 UI 대부분은 App.jsx 안에 있습니다.
import App from './App.jsx';

// index.html의 <div id="root"></div>를 찾아 React 앱을 그립니다.
// 예시: 전원을 켜면 App 화면이 여기서부터 시작된다고 생각하면 됩니다.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
