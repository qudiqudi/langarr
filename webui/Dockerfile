FROM node:20-alpine

# Build argument for environment (set by GitHub Actions)
ARG NODE_ENV=production

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build Next.js
RUN npm run build

# Build Server
# Using npx to ensure we use the local typescript version
RUN npx tsc -p tsconfig.server.json

# Cleanup dev dependencies to reduce image size
# (Optional: might break build if some runtime deps were in dev, but standard practice)
RUN npm prune --production

# Expose port
EXPOSE 3000

# Environment variables (NODE_ENV from build arg)
ENV NODE_ENV=${NODE_ENV}
ENV PORT=3000

# Start server
CMD ["node", "dist/index.js"]
