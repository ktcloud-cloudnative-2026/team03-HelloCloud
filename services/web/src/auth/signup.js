// 새 사용자는 Google 계정으로만 가입한다(#223). Keycloak 로그인 화면을 거치지 않고 Google로 바로 보낸다.
// 처음 쓰는 Google 계정이면 Keycloak이 계정을 만든다. Google 연결이 없는 환경(dev)은 로그인 화면이 대신 열린다
export const SIGNUP_OPTIONS = { idpHint: 'google' }
