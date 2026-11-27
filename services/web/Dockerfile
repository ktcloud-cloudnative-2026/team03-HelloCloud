# 1단계: 의존성 설치
FROM node:22.23.5-alpine3.24 AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci


# 2단계: 코드 검사 및 빌드 검증 (CI 검증 단계)
FROM deps AS test

COPY . .
RUN npm test


# 3단계: React + Vite 빌드
FROM test AS builder

RUN npm run build


# 4단계: Nginx 웹 서버
# root가 아닌 사용자(nginx, UID 101)로 도는 이미지라 1024 아래 포트를 못 열어 8080을 쓴다
FROM nginxinc/nginx-unprivileged:1.30.6-alpine3.24 AS runtime

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]