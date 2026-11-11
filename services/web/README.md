# React + Vite

이 템플릿은 Vite에서 React를 HMR(코드를 고치면 새로고침 없이 화면에 바로 반영하는 기능)과 몇 가지 ESLint 규칙으로 실행하기 위한 최소 설정을 제공합니다.

현재 공식 플러그인은 두 가지가 있습니다.

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react): [Oxc](https://oxc.rs)를 사용합니다.
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc): [SWC](https://swc.rs/)를 사용합니다.

## React Compiler

React Compiler는 개발과 빌드 성능에 영향을 주기 때문에 이 템플릿에서는 켜져 있지 않습니다. 추가하려면 [이 문서](https://react.dev/learn/react-compiler/installation)를 참고하세요.

## ESLint 설정 확장

실제 서비스용 애플리케이션을 개발한다면 TypeScript를 쓰고, 타입 정보를 활용하는 린트 규칙을 켜는 것을 권장합니다. 프로젝트에 TypeScript와 [`typescript-eslint`](https://typescript-eslint.io)를 적용하는 방법은 [TS 템플릿](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts)을 참고하세요.
