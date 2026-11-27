# Сборка из каталога experiments/lang-bench:  docker build -f impl/java/Dockerfile -t langbench-java .
# НЕ СОБИРАЛОСЬ ЛОКАЛЬНО: собирать только на VDS-раннере.
#
# Закрепление образов (M2): закреплены теги версий; digest НЕ выдуман - на VDS получить и передать при сборке:
#   docker buildx imagetools inspect maven:3.9.9-eclipse-temurin-21       -> --build-arg MAVEN_IMAGE=maven:3.9.9-eclipse-temurin-21@sha256:<digest>
#   docker buildx imagetools inspect eclipse-temurin:21.0.5_11-jre-alpine -> --build-arg JRE_IMAGE=eclipse-temurin:21.0.5_11-jre-alpine@sha256:<digest>
# TODO(VDS): закрепить digest (см. README, «Воспроизводимость»).
#
# JVM (M4): сборщик мусора ЯВНО G1 (-XX:+UseG1GC) везде, где запускается Java. Без флага на 2 vCPU / 512 МиБ JVM по
# эргономике выбирает SerialGC (не «серверная» машина), и результат зависел бы от лимитов контейнера. В бенчмарке
# heap задаётся явно (-Xms/-Xmx одинаковы во всех повторах), см. run-bench.sh; значение JAVA_OPTS пишется в meta.json.
ARG MAVEN_IMAGE=maven:3.9.9-eclipse-temurin-21
ARG JRE_IMAGE=eclipse-temurin:21.0.5_11-jre-alpine
FROM ${MAVEN_IMAGE} AS build
WORKDIR /src
COPY impl/java/pom.xml ./
COPY impl/java/src ./src
RUN mvn -q -B -DskipTests package

FROM ${JRE_IMAGE}
WORKDIR /app
COPY --from=build /src/target/cart-calc.jar /app/cart-calc.jar
COPY fixtures/dataset.json /app/fixtures/dataset.json
ENV PORT=8080 DATASET_PATH=/app/fixtures/dataset.json JAVA_OPTS="-XX:+UseG1GC -XX:MaxRAMPercentage=60"
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/cart-calc.jar"]
