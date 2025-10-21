FROM ubuntu:22.04 AS builder

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Update and install basic tools and Tauri dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    wget \
    file \
    libwebkit2gtk-4.1-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libsoup-3.0-dev \
    libjavascriptcoregtk-4.1-dev \
    libxdo-dev \
    libssl-dev \
    pkg-config \
    patchelf \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/*

# Install nvm (Node Version Manager)
ENV NVM_DIR="/root/.nvm"
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && \
    . "$NVM_DIR/nvm.sh" && \
    nvm install 22 && \
    nvm use 22 && \
    npm install -g pnpm

# Install Rust stable toolchain for ARM64
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --target aarch64-unknown-linux-gnu \
    && /root/.cargo/bin/rustup target add aarch64-unknown-linux-gnu
ENV PATH="/root/.cargo/bin:$PATH"

# Set the working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json pnpm-lock.yaml ./
RUN . "$NVM_DIR/nvm.sh" && pnpm install

# Copy source code (use .dockerignore to exclude build folders)
COPY . .

# Build the Tauri app as AppImage
RUN . "$NVM_DIR/nvm.sh" && pnpm tauri build
