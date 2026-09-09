FROM node:22-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PORT=8080

WORKDIR /app

# Install system dependencies for Playwright, Google Chrome, and FFmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    ca-certificates \
    curl \
    ffmpeg \
    fonts-freefont-ttf \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome Stable (Includes licensed AAC mp4a.40.2 & H.264 WebCodecs encoders)
RUN wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && apt-get install -y --no-install-recommends google-chrome-stable && \
    rm -rf /var/lib/apt/lists/*

COPY package.json tsconfig.json ./
COPY scripts ./scripts

# Install npm dependencies
RUN npm install

# Copy @openvideo/engine-pixi directory structure for @openvideo/video-renderer (avoids symlink loop)
RUN rm -rf /app/node_modules/@openvideo/video-renderer/node_modules/@openvideo/engine-pixi && \
    mkdir -p /app/node_modules/@openvideo/video-renderer/node_modules/@openvideo && \
    cp -r /app/node_modules/@openvideo/engine-pixi /app/node_modules/@openvideo/video-renderer/node_modules/@openvideo/ && \
    node scripts/patch-renderer.js

# Install Playwright Chromium with system dependencies
RUN npx playwright install --with-deps chromium

# Copy source code and build TypeScript
COPY src ./src
RUN npm run build

EXPOSE 8080

CMD ["node", "dist/server.js"]
