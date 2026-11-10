# 빌드 컨텍스트는 services/ 입니다: docker build -f user-service/Dockerfile .
FROM eclipse-temurin:17.0.21_9-jdk-noble AS build
WORKDIR /workspace
COPY . .
RUN ./gradlew :user-service:bootJar --no-daemon

FROM eclipse-temurin:17.0.21_9-jre-noble
WORKDIR /app
COPY --from=build /workspace/user-service/build/libs/user-service.jar app.jar
USER 10001
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "app.jar"]
