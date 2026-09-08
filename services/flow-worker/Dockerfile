FROM node:20-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PORT=8080 \
    NODE_ENV=production

WORKDIR /app

# Install system dependencies for Playwright Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    ca-certificates \
    curl \
    fonts-freefont-ttf \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

COPY package.json tsconfig.json ./

# Install dependencies
RUN npm install

# Install Playwright browser dependencies and Chromium
RUN npx playwright install --with-deps chromium

# Copy application source, extension package, and public dashboard
COPY src ./src
COPY extension ./extension
COPY public ./public

# Build TypeScript to dist/
RUN npm run build

EXPOSE 8080

CMD ["node", "dist/server.js"]
