# React + Vite

이 템플릿은 Vite에서 React를 HMR(코드를 고치면 새로고침 없이 화면에 바로 반영하는 기능)과 몇 가지 ESLint 규칙으로 실행하기 위한 최소 설정을 제공합니다.

## 로컬 실행

`http://localhost:5173`은 `npm run dev`를 실행한 그 PC에서만 열립니다.

1. `services/web`에서 `npm install` (처음 한 번)
2. `cp .env.example .env.local` — 로컬 Keycloak(`services/compose.yaml`, `http://localhost:8180`)을 쓰게 합니다
3. `npm run dev` → 터미널에 나온 주소로 접속 (터미널을 끄면 꺼집니다)
4. 로그인·조직 목록·만들기까지 보려면 Keycloak과 user-service(8081)도 켜야 합니다. 순서는 `services/user-service/README.md`

## 로그인 (Keycloak)

로그인 버튼을 누르면 Keycloak 로그인 화면으로 이동하고, 돌아오면 API 요청에 로그인 토큰을 붙입니다.
토큰은 만료 30초 전에 자동으로 갱신하고, 갱신이 안 되거나 API가 401을 주면 다시 로그인 화면으로 보냅니다.
조직 선택 화면과 대시보드의 로그아웃 버튼은 Keycloak 세션까지 끝내고 첫 화면으로 돌아옵니다.

Keycloak 로그인 라이브러리(keycloak-js)는 브라우저의 암호화 기능을 쓰므로 **HTTPS나 `localhost`에서만** 동작합니다.
dev(`http://10.10.24.101`)는 아직 HTTPS가 없어서, 접속용 크롬을 띄울 때 이 주소를 안전한 주소로 취급하게 합니다.
먼저 다른 창에서 `ssh -N -D 1080 t4-dev-cp`로 터널을 열어 둡니다.

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --proxy-server="socks5://localhost:1080" `
  --unsafely-treat-insecure-origin-as-secure="http://10.10.24.101" --user-data-dir="$env:TEMP\chrome-t4"
```

dev에 HTTPS를 붙이면 이 옵션은 필요 없습니다.

## 팀원 초대와 멤버 관리

조직 OWNER는 대시보드의 "팀원 초대" 버튼으로 초대 링크(`/invite/<토큰>`)를 만들어 복사합니다.
링크를 연 사람은 로그인한 뒤 "초대 수락하기"를 눌러 MEMBER로 가입합니다. 링크는 한 번만 쓸 수 있습니다.
이 주소를 웹이 받으려고 `nginx.conf`는 파일이 없는 주소에 `index.html`을 돌려줍니다.

대시보드 사이드바의 "멤버"에서 조직 멤버를 봅니다. OWNER는 다른 멤버를 내보낼 수 있고, MEMBER는 조직을 나갈 수 있습니다.

현재 공식 플러그인은 두 가지가 있습니다.

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react): [Oxc](https://oxc.rs)를 사용합니다.
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc): [SWC](https://swc.rs/)를 사용합니다.

## React Compiler

React Compiler는 개발과 빌드 성능에 영향을 주기 때문에 이 템플릿에서는 켜져 있지 않습니다. 추가하려면 [이 문서](https://react.dev/learn/react-compiler/installation)를 참고하세요.

## ESLint 설정 확장

실제 서비스용 애플리케이션을 개발한다면 TypeScript를 쓰고, 타입 정보를 활용하는 린트 규칙을 켜는 것을 권장합니다. 프로젝트에 TypeScript와 [`typescript-eslint`](https://typescript-eslint.io)를 적용하는 방법은 [TS 템플릿](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts)을 참고하세요.

## 파일 API 연동

파일 화면은 로그인 토큰과 선택한 조직 ID로 목록을 요청합니다. 업로드 시작 API → 서명 URL로 PUT → 완료 API 순서로 처리하며, 완료 후 첫 페이지를 다시 불러옵니다. 파일 상한은 백엔드와 같은 100,000,000바이트입니다. 다운로드는 API가 발급한 임시 URL을 사용하며 저장소에는 로그인 토큰을 보내지 않습니다.

팀 dev에서 확인할 순서: 로그인 → 조직 선택 → 파일 관리 → 빈 목록 또는 파일명 확인 → 작은 파일 업로드 → 목록에 표시 → 다운로드한 원본 내용 비교. 목록 요청 실패 시 재시도 버튼과 파일 선택을 확인합니다. 실패한 업로드의 임시 데이터 자동 정리는 백엔드 후속 범위입니다.

로컬 웹의 기본 API 프록시는 user-service(8081)입니다. 팀 dev의 파일 API를 시험할 때는 dev 웹과 dev 로그인 계정을 사용합니다. 로컬 Keycloak 토큰을 dev API에 보내지 않습니다.
