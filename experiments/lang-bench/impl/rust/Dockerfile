# Сборка из каталога experiments/lang-bench:  docker build -f impl/rust/Dockerfile -t langbench-rust .
# НЕ СОБИРАЛОСЬ ЛОКАЛЬНО: собирать только на VDS-раннере.
#
# Аллокатор (M6): сборка под glibc (gnu), а не musl. Аллокатор musl заметно медленнее при множестве мелких аллокаций
# (разбор JSON, BigDecimal-подобные значения) и занижал бы Rust. Образ тоже не scratch, а debian-slim (размер образа выше, чем у musl+scratch).
# Если нужен вариант musl для сравнения размера образа, собирать отдельным тегом и указывать в отчёте.
#
# Закрепление образов (M2): закреплены теги версий; digest НЕ выдуман - на VDS получить и передать при сборке:
#   docker buildx imagetools inspect rust:1.90-slim-bookworm   -> --build-arg RUST_IMAGE=rust:1.90-slim-bookworm@sha256:<digest>
#   docker buildx imagetools inspect debian:bookworm-slim      -> --build-arg RUNTIME_IMAGE=debian:bookworm-slim@sha256:<digest>
# TODO(VDS): закрепить digest; если тега rust:1.90-slim-bookworm нет, взять ближайший существующий 1.9x-slim-bookworm.
#
# Cargo.lock (M2): не зафиксирован. После первой успешной сборки скопировать Cargo.lock из контейнера/целевого каталога
# в impl/rust/ и закоммитить; затем собирать с --build-arg CARGO_FLAGS=--locked (см. README, «Воспроизводимость»).
ARG RUST_IMAGE=rust:1.90-slim-bookworm
ARG RUNTIME_IMAGE=debian:bookworm-slim
FROM ${RUST_IMAGE} AS build
ARG CARGO_FLAGS=
WORKDIR /src
COPY impl/rust/Cargo.* ./
COPY impl/rust/src ./src
RUN cargo build --release ${CARGO_FLAGS}

FROM ${RUNTIME_IMAGE}
COPY --from=build /src/target/release/cart-calc /cart-calc
COPY fixtures/dataset.json /fixtures/dataset.json
ENV PORT=8080 DATASET_PATH=/fixtures/dataset.json
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["/cart-calc"]
