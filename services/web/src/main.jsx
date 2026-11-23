import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// 몽돌 디자인 시스템 서체(#195). 이미지에 넣어 외부 Google Fonts를 부르지 않는다.
// 고운돋움은 한글 · 영문 전체, 나머지 둘은 영문만 쓴다(한글은 고운돋움으로 이어짐)
import '@fontsource/gowun-dodum/400.css'
import '@fontsource/m-plus-rounded-1c/latin-500.css'
import '@fontsource/m-plus-rounded-1c/latin-700.css'
import '@fontsource/m-plus-rounded-1c/latin-800.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import './styles/tokens.css'
import './index.css'
import App from './App.jsx'
import { initAuth } from './auth/keycloak'

const root = createRoot(document.getElementById('root'))

function render(props) {
  root.render(
    <StrictMode>
      <App {...props} />
    </StrictMode>,
  )
}

// Keycloak 확인은 화면 전체에서 한 번만 해야 해서 렌더링 전에 끝낸다.
initAuth()
  .then((authenticated) => render({ authenticated }))
  .catch((error) => {
    console.error(error)
    render({ authenticated: false, authError: '로그인 서버에 연결하지 못했습니다' })
  })
