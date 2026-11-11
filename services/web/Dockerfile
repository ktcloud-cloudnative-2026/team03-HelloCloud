# 1단계: 의존성 설치
FROM node:22-alpine AS deps

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
FROM nginx:stable-alpine AS runtime

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]