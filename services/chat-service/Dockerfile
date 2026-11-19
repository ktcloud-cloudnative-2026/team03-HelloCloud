
# Chat Service - NestJS
# 빌드 컨텍스트: services/chat-service
# docker build -t chat-service:test .

FROM node:24-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src

RUN npm run build

# CI 테스트용 스테이지
FROM build AS test
COPY jest.config.ts ./
COPY test ./test
RUN npm test -- --runInBand

# 실제 서비스 실행 이미지
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000

CMD ["node", "dist/main.js"]
