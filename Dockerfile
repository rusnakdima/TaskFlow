FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive \
    NVM_DIR=/root/.nvm

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential ca-certificates curl wget file \
    libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev libjavascriptcoregtk-4.1-dev \
    libxdo-dev libssl-dev pkg-config patchelf \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/*

ENV NVM_DIR="/root/.nvm"
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash \
    && . "$NVM_DIR/nvm.sh" \
    && nvm install 22 \
    && nvm use 22 \
    && npm install -g bun

ENV NODE_VERSION=22
ENV PATH="$NVM_DIR/versions/node/v${NODE_VERSION}.*/bin:$PATH"

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y \
    --default-toolchain stable \
    && /root/.cargo/bin/rustup target add aarch64-unknown-linux-gnu
ENV PATH="/root/.cargo/bin:$PATH"

WORKDIR /app

COPY package.json ./
RUN . "$NVM_DIR/nvm.sh" && bun install

COPY . .

RUN . "$NVM_DIR/nvm.sh" && bun run tauri build --bundles appimage
