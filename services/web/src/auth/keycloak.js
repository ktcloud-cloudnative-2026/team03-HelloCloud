import Keycloak from 'keycloak-js'

// dev·prod는 Gateway가 같은 주소에서 /realms를 Keycloak으로 넘기므로 기본값은 현재 주소다.
// 로컬은 .env.example처럼 환경 변수로 바꾼다.
const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || window.location.origin,
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'hellocloud',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'hellocloud-web',
})

export function initAuth() {
  return keycloak.init({
    onLoad: 'check-sso',
    pkceMethod: 'S256',
    checkLoginIframe: false,
  })
}

export function login() {
  return keycloak.login()
}

export function register() {
  return keycloak.register()
}

// 만료 30초 전이면 갱신한다. 갱신이 실패하면 세션이 끝난 것이라 다시 로그인시킨다.
export async function getAccessToken() {
  if (!keycloak.authenticated) return null

  try {
    await keycloak.updateToken(30)
  } catch {
    await login()
    return null
  }

  return keycloak.token
}
