# Сборка из каталога experiments/lang-bench:  docker build -f impl/ts-batch/Dockerfile -t langbench-ts-batch .
# Без зависимостей: Node 24 исполняет .ts напрямую (type stripping). Секретов нет.
FROM node:24-alpine
WORKDIR /app
COPY impl/ts-batch/ ./
COPY fixtures/dataset.json /app/fixtures/dataset.json
ENV NODE_ENV=production PORT=8080 DATASET_PATH=/app/fixtures/dataset.json
USER node
EXPOSE 8080
CMD ["node", "server.ts"]
