# Сборка из каталога experiments/lang-bench:  docker build -f impl/ts-current/Dockerfile -t langbench-ts-current .
# Без зависимостей: Node 24 исполняет .ts напрямую (type stripping). Секретов нет.
# Закрепление образа (M2): сейчас закреплён тег версии; digest НЕ выдуман - на VDS получить и передать при сборке:
#   docker buildx imagetools inspect node:24.18.0-alpine   (поле Digest) -> --build-arg NODE_IMAGE=node:24.18.0-alpine@sha256:<digest>
# TODO(VDS): закрепить digest (см. README, «Воспроизводимость»).
ARG NODE_IMAGE=node:24.18.0-alpine
FROM ${NODE_IMAGE}
WORKDIR /app
COPY impl/ts-current/ ./
COPY fixtures/dataset.json /app/fixtures/dataset.json
ENV NODE_ENV=production PORT=8080 DATASET_PATH=/app/fixtures/dataset.json
USER node
EXPOSE 8080
CMD ["node", "server.ts"]
