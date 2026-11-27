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
# root가 아닌 nginx 사용자(UID 101)로 실행한다. nginx-unprivileged 이미지는 취약점이 고쳐진 버전이
# 늦게 나와(1.30.6, Trivy CRITICAL) 공식 이미지에서 같은 설정을 직접 한다: 1024 아래 포트를 못 열어
# 8080을 쓰고, pid · 임시 파일을 쓸 수 있는 곳으로 옮긴다
FROM nginx:1.30.8-alpine3.24 AS runtime

RUN sed -i '/^user /d; s,/run/nginx.pid,/tmp/nginx.pid,; s,/var/run/nginx.pid,/tmp/nginx.pid,' /etc/nginx/nginx.conf \
 && sed -i '/^http {/a \    client_body_temp_path /tmp/client_temp;\n    proxy_temp_path /tmp/proxy_temp;\n    fastcgi_temp_path /tmp/fastcgi_temp;\n    uwsgi_temp_path /tmp/uwsgi_temp;\n    scgi_temp_path /tmp/scgi_temp;' /etc/nginx/nginx.conf \
 && chown -R 101:101 /var/cache/nginx /etc/nginx/conf.d

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

USER 101

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]