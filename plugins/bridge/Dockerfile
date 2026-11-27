# Сборка jar плагина TwoMC Bridge в контейнере (JDK/Gradle на машине не нужны).
# Запуск на раннере (BuildKit), результат окажется в ./out :
#   docker build --target artifact --output type=local,dest=out plugins/bridge
# Тесты JUnit запускаются в составе `gradle build`; при падении теста сборка прерывается.
# Теги закреплены; для строгой воспроизводимости chief может добавить @sha256-дайджест после проверки на раннере.

FROM gradle:8.14.5-jdk21 AS build
COPY --chown=gradle:gradle settings.gradle.kts build.gradle.kts gradle.properties /home/gradle/src/
COPY --chown=gradle:gradle src /home/gradle/src/src
WORKDIR /home/gradle/src
RUN gradle --no-daemon --console=plain build

FROM scratch AS artifact
COPY --from=build /home/gradle/src/build/libs/TwoMCBridge-0.1.0.jar /TwoMCBridge-0.1.0.jar
