# --- App tier image ---
FROM node:18-alpine

WORKDIR /usr/src/app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm install --production

# Copy app source
COPY . .

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
