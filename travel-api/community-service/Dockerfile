FROM maven:3.9.9-eclipse-temurin-21 AS build
ENV HOME=/usr/app
RUN mkdir -p $HOME
WORKDIR $HOME
ADD . $HOME
RUN --mount=type=cache,target=/root/.m2 sh -c 'for i in 1 2 3; do mvn -B -ntp clean package -Dmaven.test.skip -Dmaven.wagon.http.retryHandler.count=5 && exit 0; echo "Maven retry $i"; sleep 5; done; exit 1'

FROM eclipse-temurin:21-jre
ARG JAR_FILE=/usr/app/target/*.jar
COPY --from=build $JAR_FILE /app/runner.jar
ENTRYPOINT ["java", "-jar", "/app/runner.jar"]
