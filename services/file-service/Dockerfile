# 빌드 컨텍스트는 services/ 입니다: docker build -f file-service/Dockerfile .
FROM eclipse-temurin:17.0.21_9-jdk-noble AS build
WORKDIR /workspace
COPY . .
RUN ./gradlew :file-service:bootJar --no-daemon

# CI는 Docker 없이 실행 가능한 파일 서비스 테스트 전체를 수행한다.
FROM build AS test
RUN ./gradlew :common:check :file-service:check --no-daemon

FROM eclipse-temurin:17.0.21_9-jre-noble
WORKDIR /app
COPY --from=build /workspace/file-service/build/libs/file-service.jar app.jar
USER 10001
EXPOSE 8082
ENTRYPOINT ["java", "-jar", "app.jar"]
