# 빌드 컨텍스트는 services/ 입니다: docker build -f user-service/Dockerfile .
FROM eclipse-temurin:17.0.21_9-jdk-noble AS build
WORKDIR /workspace
COPY . .
RUN ./gradlew :user-service:bootJar --no-daemon

# Jenkins가 docker build --target test로 실행한다. docker build 안에는 Docker가 없어
# MySQL을 띄우는 user-service 테스트는 제외한다. 그 테스트는 ./gradlew check로 돌린다.
FROM build AS test
RUN ./gradlew :common:check :user-service:check -x :user-service:test --no-daemon

FROM eclipse-temurin:17.0.21_9-jre-noble
WORKDIR /app
COPY --from=build /workspace/user-service/build/libs/user-service.jar app.jar
USER 10001
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "app.jar"]
