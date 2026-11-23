# Сборка из каталога experiments/lang-bench:  docker build -f impl/java/Dockerfile -t langbench-java .
# НЕ СОБИРАЛОСЬ ЛОКАЛЬНО: собирать только на VDS-раннере.
# JAVA_OPTS по умолчанию - ориентир; в бенчмарке heap задаётся явно (-Xms/-Xmx одинаковы во всех повторах), см. план.
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY impl/java/pom.xml ./
COPY impl/java/src ./src
RUN mvn -q -B -DskipTests package

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /src/target/cart-calc.jar /app/cart-calc.jar
COPY fixtures/dataset.json /app/fixtures/dataset.json
ENV PORT=8080 DATASET_PATH=/app/fixtures/dataset.json JAVA_OPTS="-XX:MaxRAMPercentage=60"
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/cart-calc.jar"]
