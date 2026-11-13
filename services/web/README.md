# React + Vite

이 템플릿은 Vite에서 React를 HMR(코드를 고치면 새로고침 없이 화면에 바로 반영하는 기능)과 몇 가지 ESLint 규칙으로 실행하기 위한 최소 설정을 제공합니다.

## 로컬 실행

`http://localhost:5173`은 `npm run dev`를 실행한 그 PC에서만 열립니다.

1. `services/web`에서 `npm install` (처음 한 번)
2. `cp .env.example .env.local` — 로컬 Keycloak(`services/compose.yaml`, realm `ideaconnection`)을 쓰게 합니다
3. `npm run dev` → 터미널에 나온 주소로 접속 (터미널을 끄면 꺼집니다)
4. 로그인·조직 목록·만들기까지 보려면 Keycloak과 user-service(8081)도 켜야 합니다. 순서는 `services/user-service/README.md`

## 로그인 (Keycloak)

로그인 버튼을 누르면 Keycloak 로그인 화면으로 이동하고, 돌아오면 API 요청에 로그인 토큰을 붙입니다.
토큰은 만료 30초 전에 자동으로 갱신하고, 갱신이 안 되거나 API가 401을 주면 다시 로그인 화면으로 보냅니다.

Keycloak 로그인 라이브러리(keycloak-js)는 브라우저의 암호화 기능을 쓰므로 **HTTPS나 `localhost`에서만** 동작합니다.
dev(`http://10.10.24.101`)는 아직 HTTPS가 없어서, 접속용 크롬을 띄울 때 이 주소를 안전한 주소로 취급하게 합니다.
먼저 다른 창에서 `ssh -N -D 1080 t4-dev-cp`로 터널을 열어 둡니다.

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --proxy-server="socks5://localhost:1080" `
  --unsafely-treat-insecure-origin-as-secure="http://10.10.24.101" --user-data-dir="$env:TEMP\chrome-t4"
```

dev에 HTTPS를 붙이면 이 옵션은 필요 없습니다.

현재 공식 플러그인은 두 가지가 있습니다.

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react): [Oxc](https://oxc.rs)를 사용합니다.
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc): [SWC](https://swc.rs/)를 사용합니다.

## React Compiler

React Compiler는 개발과 빌드 성능에 영향을 주기 때문에 이 템플릿에서는 켜져 있지 않습니다. 추가하려면 [이 문서](https://react.dev/learn/react-compiler/installation)를 참고하세요.

## ESLint 설정 확장

실제 서비스용 애플리케이션을 개발한다면 TypeScript를 쓰고, 타입 정보를 활용하는 린트 규칙을 켜는 것을 권장합니다. 프로젝트에 TypeScript와 [`typescript-eslint`](https://typescript-eslint.io)를 적용하는 방법은 [TS 템플릿](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts)을 참고하세요.
