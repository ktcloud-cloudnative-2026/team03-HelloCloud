import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
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
