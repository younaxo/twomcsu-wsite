# Сборка из каталога experiments/lang-bench:  docker build -f impl/rust/Dockerfile -t langbench-rust .
# НЕ СОБИРАЛОСЬ ЛОКАЛЬНО: собирать только на VDS-раннере. Cargo.lock не зафиксирован (воспроизводимость - риск, см. план).
FROM rust:1-alpine AS build
RUN apk add --no-cache musl-dev
WORKDIR /src
COPY impl/rust/Cargo.toml ./
COPY impl/rust/src ./src
RUN cargo build --release

FROM scratch
COPY --from=build /src/target/release/cart-calc /cart-calc
COPY fixtures/dataset.json /fixtures/dataset.json
ENV PORT=8080 DATASET_PATH=/fixtures/dataset.json
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["/cart-calc"]
