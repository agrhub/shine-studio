FROM node:22-slim

ENV PORT=8080 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install system dependencies (curl, ca-certificates, ffmpeg, build-tools for native addons, fonts)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    gnupg \
    ca-certificates \
    ffmpeg \
    python3 \
    make \
    g++ \
    fonts-freefont-ttf \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome Stable (for native AAC mp4a.40.2 & H.264 WebCodecs encoders)
RUN wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && apt-get install -y --no-install-recommends google-chrome-stable && \
    rm -rf /var/lib/apt/lists/*

# Install pnpm 9 globally (compatible with workspace build scripts)
RUN npm install -g pnpm@9

# Copy workspace configuration, package manifests & scripts
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* package-lock.json* ./
COPY scripts ./scripts
COPY client/package.json ./client/
COPY server/package.json ./server/

# Install Playwright Chromium with system dependencies
RUN npx playwright install --with-deps chromium

# Install all workspace dependencies (including build devDependencies like vite, esbuild, typescript)
RUN pnpm install -r --prod=false

# Copy application sources
COPY client ./client
COPY server ./server

# Build Client SPA (Vite -> client/dist) and Server (esbuild -> server/dist)
RUN pnpm run build && \
    mkdir -p server/dist/skills server/dist/prompts skills prompts && \
    cp -r server/src/skills/. server/dist/skills/ && \
    cp -r server/src/prompts/. server/dist/prompts/ && \
    cp -r server/src/skills/. skills/ && \
    cp -r server/src/prompts/. prompts/

ENV NODE_ENV=production

EXPOSE 8080

# Run Express Server which serves API & SPA client
CMD ["node", "server/dist/index.js"]
