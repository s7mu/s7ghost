FROM node:22-alpine

WORKDIR /app

# Cache package dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source code
COPY src/ ./src/
COPY public/ ./public/

ENV PORT=3000
ENV HOST=0.0.0.0
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "src/server.js"]
